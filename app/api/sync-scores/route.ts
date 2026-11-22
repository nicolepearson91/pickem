import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchScoreboard, gameColumns } from "@/lib/espn";
import type { Contest, Game } from "@/lib/types";
import { boardGameColumns, type SquaresBoard } from "@/lib/squares";

export const dynamic = "force-dynamic";

const THROTTLE_MS = 45_000;

// Pulls live scores from ESPN for every open contest that still has unfinished games.
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
    .select("id, league, season, season_type, week, espn_group, games!games_contest_id_fkey(id, espn_id, kickoff, state, home_score, away_score, status_detail, winner)")
    .eq("status", "open");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
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
      continue;
    }
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
    }
  }
  updated += await syncBoards(db, forced);
  return NextResponse.json({ ok: true, updated });
}

// Squares boards linked to an ESPN game: live score, plus the score at the end of each quarter.
// Missing table (squares SQL not run yet) just means nothing to do.
async function syncBoards(db: ReturnType<typeof createAdminClient>, forced: boolean) {
  const { data: boards } = await db.from("squares_boards")
    .select("id, league, season, season_type, week, espn_group, espn_id, kickoff, state, home_score, away_score, period, status_detail, home_abbr, away_abbr, marks, manual_scores")
    .eq("status", "open").not("espn_id", "is", null);
  let updated = 0;
  const now = Date.now();
  const cache = new Map<string, Awaited<ReturnType<typeof fetchScoreboard>>>();
  for (const b of (boards ?? []) as SquaresBoard[]) {
    if (b.state === "post" && Array.isArray(b.marks) && b.marks[3]) continue;
    const k = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    // Before kickoff, check now and then so the matchup (team names) fills in once it's set.
    const active = b.state === "in" || (b.kickoff && k - now < 15 * 60_000) || b.state === "post";
    if (!active && !forced && !(b.home_abbr === "TBD" || b.away_abbr === "TBD")) continue;
    if (!b.season || !b.season_type || !b.week) continue;
    const key = `${b.league}:${b.season}:${b.season_type}:${b.week}:${b.espn_group ?? ""}`;
    let live = cache.get(key);
    if (!live) {
      try {
        live = await fetchScoreboard({ league: b.league, season: b.season, seasonType: b.season_type, week: b.week, group: b.espn_group });
        cache.set(key, live);
      } catch (e) {
        console.error(`sync board ${b.id}:`, e);
        continue;
      }
    }
    const fresh = live.find((g) => g.espn_id === b.espn_id);
    if (!fresh) continue;
    const cols = boardGameColumns(fresh, b.manual_scores);
    const changed = cols.state !== b.state || cols.home_score !== b.home_score || cols.away_score !== b.away_score ||
      cols.status_detail !== b.status_detail || cols.period !== b.period || cols.home_abbr !== b.home_abbr || cols.away_abbr !== b.away_abbr ||
      ("marks" in cols && JSON.stringify(cols.marks) !== JSON.stringify(b.marks)) ||
      (b.kickoff && new Date(cols.kickoff).getTime() !== new Date(b.kickoff).getTime());
    if (!changed) continue;
    const { error } = await db.from("squares_boards").update(cols).eq("id", b.id);
    if (!error) updated++;
  }
  return updated;
}

export const GET = sync;
export const POST = sync;
