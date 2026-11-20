"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { fetchScoreboard, gameColumns } from "@/lib/espn";
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

  const { data: rows, error: gErr } = await supabase.from("games")
    .insert(chosen.map((g) => ({ contest_id: contest.id, ...gameColumns(g) })))
    .select("id, espn_id");
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
}
