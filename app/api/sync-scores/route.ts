import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchScoreboard, gameColumns } from "@/lib/espn";
import type { Contest, Game } from "@/lib/types";

export const dynamic = "force-dynamic";

const THROTTLE_MS = 45_000;

// Pulls live scores from ESPN for every contest that still has unfinished games.
// The every-minute job calls it with the secret. Open dashboards also ping it while
// games are live, throttled so ESPN is hit at most about once a minute.
async function sync(request: NextRequest) {
  const db = createAdminClient();
  const forced = !!process.env.SYNC_SECRET && request.headers.get("x-sync-secret") === process.env.SYNC_SECRET;

  const { data: settings } = await db.from("app_settings").select("last_sync").eq("id", 1).single();
  const last = settings?.last_sync ? new Date(settings.last_sync).getTime() : 0;
  if (!forced && Date.now() - last < THROTTLE_MS) {
    return NextResponse.json({ skipped: "throttled" });
  }
  await db.from("app_settings").update({ last_sync: new Date().toISOString() }).eq("id", 1);

  const { data: contests, error } = await db
    .from("contests")
    .select("id, league, season, season_type, week, espn_group, games!games_contest_id_fkey(id, espn_id, kickoff, state, home_score, away_score, status_detail, winner)");
  // Closed pick ems still get live scores: closing only stops picks. Finished weeks are skipped below.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0, checked = 0;
  const failures: string[] = [];
  const now = Date.now();
  for (const c of (contests ?? []) as (Contest & { games: Game[] })[]) {
    const unfinished = c.games.filter((g) => g.state !== "post");
    if (unfinished.length === 0) continue;
    // Only poll when a game is live, or one should have started within the last few hours,
    // or kickoff is within 15 minutes. That keeps quiet weekdays from hammering ESPN.
    const active = unfinished.some((g) => {
      const k = new Date(g.kickoff).getTime();
      return g.state === "in" || k - now < 15 * 60_000;
    });
    if (!active && !forced) continue;

    let live;
    try {
      live = await fetchScoreboard({
        league: c.league, season: c.season, seasonType: c.season_type, week: c.week, group: c.espn_group,
      });
    } catch (e) {
      console.error(`sync contest ${c.id}:`, e);
      failures.push(`contest ${c.id}: ${(e as Error).message}`);
      continue;
    }
    checked++;
    const byId = new Map(live.map((g) => [g.espn_id, g]));
    for (const g of c.games) {
      const fresh = byId.get(g.espn_id);
      if (!fresh) continue;
      const cols = gameColumns(fresh);
      const changed =
        cols.state !== g.state || cols.home_score !== g.home_score || cols.away_score !== g.away_score ||
        cols.status_detail !== g.status_detail || cols.winner !== g.winner ||
        (g.state === "pre" && new Date(cols.kickoff).getTime() !== new Date(g.kickoff).getTime());
      if (!changed) continue;
      const patch = {
        state: cols.state, home_score: cols.home_score, away_score: cols.away_score,
        status_detail: cols.status_detail, winner: cols.winner,
        home_rank: cols.home_rank, away_rank: cols.away_rank,
        // A game's kickoff only moves while it hasn't started (flex scheduling, TBD times).
        ...(cols.state === "pre" ? { kickoff: cols.kickoff } : {}),
      };
      const { error: upErr } = await db.from("games").update(patch).eq("id", g.id);
      if (!upErr) updated++;
      else failures.push(`game ${g.id}: ${upErr.message}`);
    }
  }
  return NextResponse.json({ ok: failures.length === 0, checked, updated, ...(failures.length ? { failures } : {}) });
}

export const GET = sync;
export const POST = sync;
