"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchScoreboard } from "@/lib/espn";
import { boardGameColumns, type Mark } from "@/lib/squares";
import type { League } from "@/lib/types";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const missingTable = (m: string) => /squares/.test(m) && /(does not exist|schema cache|relation)/i.test(m);
const friendly = (m: string) => (missingTable(m) ? "Run the Super Bowl squares SQL in Supabase first." : m);

function refresh(id?: number) {
  revalidatePath("/squares");
  revalidatePath("/admin");
  revalidatePath("/");
  if (id) {
    revalidatePath(`/squares/${id}`);
    revalidatePath(`/admin/squares/${id}`);
  }
}

export interface GameRef {
  league: League;
  season: number;
  seasonType: number;
  week: number;
  group: string | null;
  espnId: string;
}

async function gameColumnsFor(ref: GameRef) {
  const all = await fetchScoreboard({ league: ref.league, season: ref.season, seasonType: ref.seasonType, week: ref.week, group: ref.group });
  const g = all.find((x) => x.espn_id === ref.espnId);
  if (!g) throw new Error("That game wasn't found. Try loading the week again.");
  return {
    league: ref.league, season: ref.season, season_type: ref.seasonType, week: ref.week,
    espn_group: ref.league === "cfb" ? ref.group || "80" : null,
    ...boardGameColumns(g, false),
  };
}

function cleanPcts(p: number[]): number[] | string {
  const v = p.map((x) => Math.round(Number(x)));
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) return "Each payout must be between 0 and 100%.";
  if (v.reduce((s, x) => s + x, 0) !== 100) return `The four payouts add up to ${v.reduce((s, x) => s + x, 0)}%. They need to add up to 100%.`;
  return v;
}

const cleanMax = (n: number | null) => (n && Number(n) >= 1 ? Math.min(100, Math.round(Number(n))) : null);

export interface NewBoardsInput {
  name: string;
  prices: number[];
  maxPerPlayer: number | null;
  pcts: number[];
  game: GameRef | null;
}

/** Makes one board per price, e.g. $5, $10 and $20 boards for the same game. */
export async function createBoards(input: NewBoardsInput): Promise<Result> {
  const { supabase } = await requireAdmin();
  const name = input.name.trim() || "Super Bowl Squares";
  const prices = [...new Set(input.prices.map((p) => Math.round(Number(p) * 100) / 100).filter((p) => Number.isFinite(p) && p >= 0))];
  if (prices.length === 0) return { ok: false, error: "Add at least one price." };
  const pcts = cleanPcts(input.pcts);
  if (typeof pcts === "string") return { ok: false, error: pcts };
  let game = {};
  if (input.game) {
    try { game = await gameColumnsFor(input.game); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  const money = (p: number) => (Number.isInteger(p) ? `$${p}` : `$${p.toFixed(2)}`);
  const rows = prices.map((price) => ({
    name: prices.length > 1 ? `${name} · ${money(price)}` : name,
    price,
    max_per_player: cleanMax(input.maxPerPlayer),
    q1_pct: pcts[0], q2_pct: pcts[1], q3_pct: pcts[2], final_pct: pcts[3],
    ...game,
  }));
  const { data, error } = await supabase.from("squares_boards").insert(rows).select("id");
  if (error) return { ok: false, error: friendly(error.message) };
  refresh();
  redirect(data?.length === 1 ? `/squares/${data[0].id}` : "/squares");
}

export async function updateBoard(id: number, formData: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the board a name." };
  const price = Math.max(0, Math.round(Number(formData.get("price")) * 100) / 100 || 0);
  const pcts = cleanPcts(["q1", "q2", "q3", "final"].map((k) => Number(formData.get(k))));
  if (typeof pcts === "string") return { ok: false, error: pcts };
  const max = cleanMax(Number(formData.get("max")) || null);
  const { error } = await supabase.from("squares_boards").update({
    name, price, max_per_player: max, q1_pct: pcts[0], q2_pct: pcts[1], q3_pct: pcts[2], final_pct: pcts[3],
  }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(id);
  return { ok: true, message: "Saved ✓" };
}

export async function linkGame(id: number, ref: GameRef | null): Promise<Result> {
  const { supabase } = await requireAdmin();
  let cols: Record<string, unknown>;
  if (ref) {
    try { cols = await gameColumnsFor(ref); } catch (e) { return { ok: false, error: (e as Error).message }; }
  } else {
    cols = {
      espn_id: null, kickoff: null, home_name: null, home_abbr: null, home_logo: null, home_color: null,
      away_name: null, away_abbr: null, away_logo: null, away_color: null, home_score: null, away_score: null,
      period: null, state: "pre", status_detail: null,
    };
  }
  const { error } = await supabase.from("squares_boards").update(cols).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(id);
  return { ok: true, message: ref ? "Game linked ✓" : "Game unlinked" };
}

export async function drawNumbers(id: number): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("squares_draw", { bid: id });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(id);
  return { ok: true };
}

/** Takes the numbers back off so squares can change again. Only before kickoff. */
export async function clearNumbers(id: number): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { data: b } = await supabase.from("squares_boards").select("state, kickoff").eq("id", id).maybeSingle();
  if (b && (b.state !== "pre" || (b.kickoff && new Date(b.kickoff).getTime() <= Date.now()))) {
    return { ok: false, error: "The game has started, so the numbers stay." };
  }
  const { error } = await supabase.from("squares_boards").update({ col_digits: null, row_digits: null, drawn_at: null }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(id);
  return { ok: true };
}

/** Typed-in quarter scores, for when the live feed is wrong or the game isn't linked. Blank = not played yet. */
export async function saveScores(id: number, formData: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();
  const marks: Mark[] = [];
  for (let q = 0; q < 4; q++) {
    const a = String(formData.get(`a${q}`) ?? "").trim(), h = String(formData.get(`h${q}`) ?? "").trim();
    if (a === "" && h === "") { marks.push(null); continue; }
    const an = Number(a), hn = Number(h);
    if (!Number.isInteger(an) || !Number.isInteger(hn) || an < 0 || hn < 0) return { ok: false, error: "Scores need to be whole numbers. Leave both boxes empty for a quarter that hasn't finished." };
    marks.push({ away: an, home: hn });
  }
  const { error } = await supabase.from("squares_boards").update({ marks, manual_scores: true }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(id);
  return { ok: true, message: "Scores saved ✓ Live updates won't change them now." };
}

export async function switchToLiveScores(id: number): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("squares_boards").update({ manual_scores: false }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  // Pull fresh scores right away.
  const { data: b } = await supabase.from("squares_boards").select("league, season, season_type, week, espn_group, espn_id").eq("id", id).maybeSingle();
  if (b?.espn_id && b.season && b.season_type && b.week) {
    try {
      const cols = await gameColumnsFor({ league: b.league, season: b.season, seasonType: b.season_type, week: b.week, group: b.espn_group, espnId: b.espn_id });
      await supabase.from("squares_boards").update(cols).eq("id", id);
    } catch { /* the regular sync will catch up */ }
  }
  refresh(id);
  return { ok: true, message: "Back on live scores ✓" };
}

/** Admin puts a square in someone's name, or clears it (userId null). Works even after the draw. */
export async function setSquare(boardId: number, row: number, col: number, userId: string | null): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (![row, col].every((n) => Number.isInteger(n) && n >= 0 && n <= 9)) return { ok: false, error: "That square doesn't exist." };
  const { error } = userId
    ? await supabase.from("squares").upsert({ board_id: boardId, row_idx: row, col_idx: col, user_id: userId, claimed_at: new Date().toISOString() },
      { onConflict: "board_id,row_idx,col_idx" })
    : await supabase.from("squares").delete().eq("board_id", boardId).eq("row_idx", row).eq("col_idx", col);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath(`/squares/${boardId}`);
  revalidatePath(`/admin/squares/${boardId}`);
  return { ok: true };
}

// Payments. Players can't change the confirmed count themselves, so these use the server key after the admin check.

export async function confirmSquaresPayment(boardId: number, userId: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { data: p } = await db.from("squares_payments").select("squares").eq("board_id", boardId).eq("user_id", userId).maybeSingle();
  if (p) {
    await db.from("squares_payments").update({ verified_squares: p.squares, status: "verified", verified_at: new Date().toISOString() })
      .eq("board_id", boardId).eq("user_id", userId);
  }
  refresh(boardId);
}

/** The money didn't show up: go back to what was confirmed before (or nothing). */
export async function rejectSquaresPayment(boardId: number, userId: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { data: p } = await db.from("squares_payments").select("verified_squares").eq("board_id", boardId).eq("user_id", userId).maybeSingle();
  if (p && p.verified_squares > 0) {
    await db.from("squares_payments").update({ squares: p.verified_squares, status: "verified" }).eq("board_id", boardId).eq("user_id", userId);
  } else {
    await db.from("squares_payments").delete().eq("board_id", boardId).eq("user_id", userId);
  }
  refresh(boardId);
}

/** For someone who paid in person: marks all of their squares as paid. */
export async function recordSquaresPayment(boardId: number, userId: string, method: string) {
  await requireAdmin();
  const db = createAdminClient();
  const { count } = await db.from("squares").select("user_id", { count: "exact", head: true }).eq("board_id", boardId).eq("user_id", userId);
  const n = count ?? 0;
  await db.from("squares_payments").upsert({
    board_id: boardId, user_id: userId, squares: n, verified_squares: n, method, status: "verified",
    submitted_at: new Date().toISOString(), verified_at: new Date().toISOString(),
  }, { onConflict: "board_id,user_id" });
  refresh(boardId);
}

export async function undoSquaresPayment(boardId: number, userId: string) {
  await requireAdmin();
  await createAdminClient().from("squares_payments").delete().eq("board_id", boardId).eq("user_id", userId);
  refresh(boardId);
}

export async function setSquaresPaidOut(boardId: number, quarter: number, userId: string, amount: number, method: string | null, paid: boolean): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = paid
    ? await supabase.from("squares_payouts").upsert({ board_id: boardId, quarter, user_id: userId, amount, method, paid_at: new Date().toISOString() },
      { onConflict: "board_id,quarter,user_id" })
    : await supabase.from("squares_payouts").delete().eq("board_id", boardId).eq("quarter", quarter).eq("user_id", userId);
  revalidatePath(`/squares/${boardId}`);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function setBoardStatus(id: number, status: "open" | "closed") {
  const { supabase } = await requireAdmin();
  await supabase.from("squares_boards").update({ status }).eq("id", id);
  refresh(id);
}

export async function deleteBoard(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("squares_boards").delete().eq("id", id);
  refresh();
  redirect("/admin");
}
