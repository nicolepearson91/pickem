"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { colorColumns, fetchScoreboard, gameColumns } from "@/lib/espn";
import type { League } from "@/lib/types";

export async function saveSettings(formData: FormData) {
  const { supabase } = await requireAdmin();
  const val = (k: string) => String(formData.get(k) || "").trim() || null;
  await supabase.from("app_settings").update({
    venmo_handle: val("venmo_handle"),
    cashapp_tag: val("cashapp_tag"),
    apple_cash_contact: val("apple_cash_contact"),
  }).eq("id", 1);
  revalidatePath("/admin");
}

export async function newInviteCode() {
  const { supabase } = await requireAdmin();
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  await supabase.from("invite").update({ code }).eq("id", 1);
  revalidatePath("/admin");
}

export async function setMember(uid: string, member: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.rpc("set_member", { uid, member });
  revalidatePath("/admin");
}

export interface NewContestInput {
  name: string;
  league: League;
  season: number;
  seasonType: number;
  week: number;
  group: string | null;
  entryFee: number;
  espnIds: string[];
  tiebreakerEspnId: string | null;
}

export async function createContest(input: NewContestInput): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin();
  if (!input.name.trim()) return { error: "Give it a name." };
  if (input.espnIds.length === 0) return { error: "Pick at least one game." };

  // Re-fetch from ESPN on the server so the saved games are the real ones.
  let all;
  try {
    all = await fetchScoreboard({
      league: input.league, season: input.season, seasonType: input.seasonType, week: input.week, group: input.group,
    });
  } catch (e) {
    return { error: `Couldn't reach the score feed: ${(e as Error).message}` };
  }
  const chosen = all.filter((g) => input.espnIds.includes(g.espn_id));
  if (chosen.length === 0) return { error: "None of those games were found. Try reloading the week." };

  const { data: contest, error } = await supabase.from("contests").insert({
    name: input.name.trim(),
    league: input.league,
    season: input.season,
    season_type: input.seasonType,
    week: input.week,
    espn_group: input.league === "cfb" ? input.group || "80" : null,
    entry_fee: Math.max(0, Number(input.entryFee) || 0),
  }).select("id").single();
  if (error || !contest) return { error: error?.message ?? "Couldn't create it." };

  const insertGames = (withColors: boolean) => supabase.from("games")
    .insert(chosen.map((g) => ({ contest_id: contest.id, ...gameColumns(g), ...(withColors ? colorColumns(g) : {}) })))
    .select("id, espn_id");
  let { data: rows, error: gErr } = await insertGames(true);
  // If the team color columns haven't been added to the database yet, save without them.
  if (gErr && /color/i.test(gErr.message)) ({ data: rows, error: gErr } = await insertGames(false));
  if (gErr) {
    await supabase.from("contests").delete().eq("id", contest.id);
    return { error: gErr.message };
  }
  const tb = rows?.find((r) => r.espn_id === input.tiebreakerEspnId);
  if (tb) await supabase.from("contests").update({ tiebreaker_game_id: tb.id }).eq("id", contest.id);

  revalidatePath("/");
  redirect(`/contests/${contest.id}`);
}

export async function setContestStatus(id: number, status: "open" | "closed") {
  const { supabase } = await requireAdmin();
  await supabase.from("contests").update({ status }).eq("id", id);
  revalidatePath(`/admin/contests/${id}`);
  revalidatePath("/");
}

export async function deleteContest(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("contests").delete().eq("id", id);
  revalidatePath("/");
  redirect("/admin");
}

export async function verifyPayment(contestId: number, userId: string, verified: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("payments").update({
    status: verified ? "verified" : "pending",
    verified_at: verified ? new Date().toISOString() : null,
  }).eq("contest_id", contestId).eq("user_id", userId);
  revalidatePath(`/admin/contests/${contestId}`);
  revalidatePath("/admin");
}

/** For someone who paid in person and never tapped anything in the app. */
export async function recordPayment(contestId: number, userId: string, method: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("payments").upsert({
    contest_id: contestId, user_id: userId, method, status: "verified", verified_at: new Date().toISOString(),
  }, { onConflict: "contest_id,user_id" });
  revalidatePath(`/admin/contests/${contestId}`);
}

export async function removePayment(contestId: number, userId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("payments").delete().eq("contest_id", contestId).eq("user_id", userId);
  revalidatePath(`/admin/contests/${contestId}`);
  revalidatePath("/admin");
}

/**
 * Makes a one-time password reset link for a player, for the admin to text them.
 * Works even when Supabase's free email sending is used up.
 */
export async function makeResetLink(userId: string): Promise<{ link?: string; error?: string }> {
  await requireAdmin();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { headers } = await import("next/headers");
  const admin = createAdminClient();
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId);
  if (uErr || !u.user?.email) return { error: "Couldn't find that player's email." };
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: u.user.email });
  if (error || !data.properties?.hashed_token) return { error: error?.message ?? "Couldn't make a link." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const q = new URLSearchParams({ token_hash: data.properties.hashed_token, type: "recovery", next: "/reset-password" });
  return { link: `${origin}/auth/confirm?${q}` };
}

/** Sets a new 4-digit PIN for a name + PIN player and clears any lockout. */
export async function resetPin(userId: string, pin: string): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  const { validPin, pinPassword } = await import("@/lib/pin");
  if (!validPin(pin)) return { error: "The PIN must be exactly 4 digits." };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const { data: login } = await db.from("pin_logins").select("name_key").eq("user_id", userId).maybeSingle();
  if (!login) return { error: "That player signs in with email, not a PIN." };
  const { error } = await db.auth.admin.updateUserById(userId, { password: pinPassword(userId, pin) });
  if (error) return { error: error.message };
  await db.from("pin_attempts").delete().eq("name_key", login.name_key);
  return { ok: true };
}

export async function setEntryFee(id: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const fee = Math.max(0, Math.round(Number(formData.get("fee")) * 100) / 100 || 0);
  await supabase.from("contests").update({ entry_fee: fee }).eq("id", id);
  revalidatePath(`/admin/contests/${id}`);
  revalidatePath("/admin");
  revalidatePath(`/contests/${id}`);
  revalidatePath("/");
}

export async function setSplit(id: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const pct = Math.min(50, Math.max(0, Math.round(Number(formData.get("second_pct")) || 0)));
  await supabase.from("contests").update({ second_place_pct: pct }).eq("id", id);
  revalidatePath(`/admin/contests/${id}`);
  revalidatePath(`/contests/${id}`);
}

/** Records (or un-records) that the admin sent a winner their winnings. */
export async function setPaidOut(contestId: number, userId: string, amount: number, method: string | null, paid: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = paid
    ? await supabase.from("payouts").upsert({ contest_id: contestId, user_id: userId, amount, method, paid_at: new Date().toISOString() },
      { onConflict: "contest_id,user_id" })
    : await supabase.from("payouts").delete().eq("contest_id", contestId).eq("user_id", userId);
  revalidatePath(`/contests/${contestId}`);
  return error ? { error: /payouts/.test(error.message) ? "Run the payouts setup SQL in Supabase first." : error.message } : {};
}

type Outcome = { ok: true; message: string } | { ok: false; error: string };

async function playerPair(dupId: string, mainId?: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const ids = mainId ? [dupId, mainId] : [dupId];
  const { data } = await db.from("profiles").select("id, display_name, is_admin, is_member").in("id", ids);
  const dup = data?.find((p) => p.id === dupId);
  const main = mainId ? data?.find((p) => p.id === mainId) : undefined;
  return { db, dup, main };
}

/**
 * Moves a duplicate account's picks, tiebreakers, payments and winnings into the main account,
 * then removes the duplicate. Where both accounts have something for the same game or week,
 * the main account's is kept (except a confirmed payment beats an unconfirmed one).
 */
export async function mergePlayer(dupId: string, mainId: string): Promise<Outcome> {
  const { user } = await requireAdmin();
  if (dupId === mainId) return { ok: false, error: "Pick a different account to merge into." };
  const { db, dup, main } = await playerPair(dupId, mainId);
  if (!dup || !main) return { ok: false, error: "Couldn't find one of those players. Reload the page." };
  if (dup.is_admin || dup.id === user.id) return { ok: false, error: "The admin account can't be merged away." };

  const notIn = (ids: (string | number)[]) => `(${ids.join(",")})`;
  const fail = (what: string, e: { message: string } | null) => e ? `${what}: ${e.message}` : null;
  const problems: string[] = [];

  // Picks: one per game.
  const { data: mainPicks } = await db.from("picks").select("game_id").eq("user_id", main.id);
  const pickIds = (mainPicks ?? []).map((p) => p.game_id);
  let q = db.from("picks").update({ user_id: main.id }).eq("user_id", dup.id);
  if (pickIds.length) q = q.not("game_id", "in", notIn(pickIds));
  const p1 = fail("picks", (await q).error); if (p1) problems.push(p1);

  // Tiebreaker guesses: one per pick em.
  const { data: mainTbs } = await db.from("tiebreakers").select("contest_id").eq("user_id", main.id);
  const tbIds = (mainTbs ?? []).map((t) => t.contest_id);
  let t = db.from("tiebreakers").update({ user_id: main.id }).eq("user_id", dup.id);
  if (tbIds.length) t = t.not("contest_id", "in", notIn(tbIds));
  const p2 = fail("tiebreakers", (await t).error); if (p2) problems.push(p2);

  // Payments: one per pick em; a confirmed payment wins over an unconfirmed one.
  const [{ data: dupPays }, { data: mainPays }] = await Promise.all([
    db.from("payments").select("contest_id, status").eq("user_id", dup.id),
    db.from("payments").select("contest_id, status").eq("user_id", main.id),
  ]);
  const mainPay = new Map((mainPays ?? []).map((p) => [p.contest_id, p.status]));
  for (const p of dupPays ?? []) {
    const has = mainPay.get(p.contest_id);
    if (has === "verified" || (has === "pending" && p.status === "pending")) continue;
    if (has) await db.from("payments").delete().eq("contest_id", p.contest_id).eq("user_id", main.id);
    const e = fail("payments", (await db.from("payments").update({ user_id: main.id }).eq("contest_id", p.contest_id).eq("user_id", dup.id)).error);
    if (e) problems.push(e);
  }

  // Winnings already paid out, and where to send winnings (these tables may not exist yet).
  const { data: mainPayouts, error: poErr } = await db.from("payouts").select("contest_id").eq("user_id", main.id);
  if (!poErr) {
    const ids = (mainPayouts ?? []).map((p) => p.contest_id);
    let u = db.from("payouts").update({ user_id: main.id }).eq("user_id", dup.id);
    if (ids.length) u = u.not("contest_id", "in", notIn(ids));
    await u;
  }
  const { data: mainInfo, error: piErr } = await db.from("payout_info").select("user_id").eq("user_id", main.id).maybeSingle();
  if (!piErr && !mainInfo) await db.from("payout_info").update({ user_id: main.id }).eq("user_id", dup.id);

  if (dup.is_member && !main.is_member) await db.from("profiles").update({ is_member: true }).eq("id", main.id);

  if (problems.length) {
    return { ok: false, error: `Stopped before removing "${dup.display_name}", nothing was lost. ${problems.join("; ")}` };
  }
  const { error } = await db.auth.admin.deleteUser(dup.id);
  if (error) return { ok: false, error: `Moved everything, but couldn't remove the old account: ${error.message}` };
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: `Merged "${dup.display_name}" into "${main.display_name}".` };
}

/** Removes a player's account along with their picks, payments and winnings records. */
export async function deletePlayer(userId: string): Promise<Outcome> {
  const { user } = await requireAdmin();
  const { db, dup } = await playerPair(userId);
  if (!dup) return { ok: false, error: "Couldn't find that player. Reload the page." };
  if (dup.is_admin || dup.id === user.id) return { ok: false, error: "The admin account can't be deleted here." };
  const { error } = await db.auth.admin.deleteUser(dup.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: `Deleted "${dup.display_name}".` };
}

/** Lets the admin fix a player's name, e.g. two people called Mike. */
export async function renamePlayer(userId: string, name: string): Promise<Outcome> {
  await requireAdmin();
  const { renameUser } = await import("@/lib/rename");
  const r = await renameUser(userId, name);
  if (!r.ok) return r;
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: `Renamed to "${r.name}".` };
}
