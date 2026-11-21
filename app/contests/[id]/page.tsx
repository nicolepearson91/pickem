import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import ContestView from "@/components/ContestView";
import type { AppSettings, Contest, Game, Payment, Payout, PayoutInfo, Pick, Profile, Tiebreaker } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cid = Number(id);
  if (!Number.isFinite(cid)) notFound();
  const { supabase, user, profile } = await requireMember();

  const [contest, games, picks, tbs, pays, people, settings, players, payouts, payoutInfo] = await Promise.all([
    supabase.from("contests").select("*").eq("id", cid).maybeSingle<Contest>(),
    supabase.from("games").select("*").eq("contest_id", cid).order("kickoff").order("id"),
    supabase.from("picks").select("user_id, game_id, contest_id, side").eq("contest_id", cid),
    supabase.from("tiebreakers").select("*").eq("contest_id", cid),
    supabase.from("payments").select("*").eq("contest_id", cid),
    supabase.from("profiles").select("id, display_name, is_admin, is_member"),
    supabase.from("app_settings").select("venmo_handle, cashapp_tag, apple_cash_contact").eq("id", 1).maybeSingle<AppSettings>(),
    supabase.rpc("contest_players", { cid }),
    // These two tables come from the payouts SQL; if it hasn't been run yet they just come back empty.
    supabase.from("payouts").select("*").eq("contest_id", cid),
    supabase.from("payout_info").select("user_id, venmo_handle, cashapp_tag"),
  ]);
  if (!contest.data) notFound();

  return (
    <ContestView
      me={profile}
      userId={user.id}
      contest={contest.data}
      games={(games.data ?? []) as Game[]}
      picks={(picks.data ?? []) as Pick[]}
      tiebreakers={(tbs.data ?? []) as Tiebreaker[]}
      payments={(pays.data ?? []) as Payment[]}
      people={(people.data ?? []) as Profile[]}
      playerIds={(players.data ?? []) as string[]}
      payouts={(payouts.data ?? []) as Payout[]}
      payoutInfo={(payoutInfo.data ?? []) as PayoutInfo[]}
      settings={settings.data ?? { venmo_handle: null, cashapp_tag: null, apple_cash_contact: null }}
    />
  );
}
