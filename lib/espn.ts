// ESPN's public scoreboard feed. It is free and needs no key, but it is unofficial,
// so all knowledge of its shape lives in this one file.
import type { GameState, League, Side } from "./types.ts";

export const CFB_GROUPS: { id: string; label: string }[] = [
  { id: "80", label: "All FBS" },
  { id: "1", label: "ACC" },
  { id: "4", label: "Big 12" },
  { id: "5", label: "Big Ten" },
  { id: "8", label: "SEC" },
  { id: "151", label: "American" },
  { id: "17", label: "Mountain West" },
  { id: "9", label: "Pac-12" },
  { id: "37", label: "Sun Belt" },
  { id: "15", label: "MAC" },
  { id: "12", label: "Conference USA" },
  { id: "18", label: "FBS Independents" },
];

export interface EspnTeam {
  name: string;
  abbr: string;
  logo: string | null;
  rank: number | null;
  score: number | null;
  /** Hex like "#e31837", when ESPN has one. */
  color: string | null;
}

export interface EspnGame {
  espn_id: string;
  kickoff: string;
  home: EspnTeam;
  away: EspnTeam;
  state: GameState;
  status_detail: string;
  winner: Side | "tie" | null;
}

export function scoreboardUrl(opts: {
  league: League;
  season: number;
  seasonType: number;
  week: number;
  group?: string | null;
}): string {
  const sport = opts.league === "nfl" ? "nfl" : "college-football";
  const p = new URLSearchParams({
    dates: String(opts.season),
    seasontype: String(opts.seasonType),
    week: String(opts.week),
    limit: "400",
  });
  if (opts.league === "cfb") p.set("groups", opts.group || "80");
  // ESPN_BASE_URL lets local development point at a fake feed (see scripts/mock-espn.mjs).
  const base = (typeof process !== "undefined" && process.env.ESPN_BASE_URL) || "https://site.api.espn.com";
  return `${base}/apis/site/v2/sports/football/${sport}/scoreboard?${p}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function team(c: any): EspnTeam {
  const rank = c?.curatedRank?.current;
  const score = c?.score === undefined || c?.score === "" ? null : Number(c.score);
  return {
    name: c?.team?.displayName ?? c?.team?.name ?? "TBD",
    abbr: c?.team?.abbreviation ?? "TBD",
    logo: c?.team?.logo ?? null,
    rank: typeof rank === "number" && rank > 0 && rank <= 25 ? rank : null,
    score: Number.isFinite(score) ? score : null,
    color: /^[0-9a-f]{6}$/i.test(c?.team?.color ?? "") ? `#${c.team.color}` : null,
  };
}

export function parseScoreboard(json: any): EspnGame[] {
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  const out: EspnGame[] = [];
  for (const e of events) {
    const comp = e?.competitions?.[0];
    const comps: any[] = comp?.competitors ?? [];
    const h = comps.find((c) => c.homeAway === "home");
    const a = comps.find((c) => c.homeAway === "away");
    if (!h || !a) continue;
    const st = comp?.status?.type ?? e?.status?.type ?? {};
    const rawState = st.state as string;
    const state: GameState = rawState === "in" ? "in" : rawState === "post" ? "post" : "pre";
    const home = team(h);
    const away = team(a);
    let winner: EspnGame["winner"] = null;
    // Postponed or canceled games come back as "post" without being completed: no winner.
    if (state === "post" && st.completed !== false) {
      if (h.winner === true) winner = "home";
      else if (a.winner === true) winner = "away";
      else if (home.score !== null && away.score !== null) {
        winner = home.score > away.score ? "home" : away.score > home.score ? "away" : "tie";
      }
    }
    out.push({
      espn_id: String(e.id),
      kickoff: new Date(e.date ?? comp?.date).toISOString(),
      home,
      away,
      state,
      status_detail: st.shortDetail ?? st.detail ?? st.description ?? "",
      winner,
    });
  }
  return out.sort((x, y) => x.kickoff.localeCompare(y.kickoff));
}

export async function fetchScoreboard(opts: Parameters<typeof scoreboardUrl>[0]): Promise<EspnGame[]> {
  const res = await fetch(scoreboardUrl(opts), { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN scoreboard returned ${res.status}`);
  return parseScoreboard(await res.json());
}

/** Columns for a games row, from an ESPN game. */
export function gameColumns(g: EspnGame) {
  return {
    espn_id: g.espn_id,
    kickoff: g.kickoff,
    home_name: g.home.name,
    home_abbr: g.home.abbr,
    home_logo: g.home.logo,
    home_rank: g.home.rank,
    away_name: g.away.name,
    away_abbr: g.away.abbr,
    away_logo: g.away.logo,
    away_rank: g.away.rank,
    home_score: g.home.score,
    away_score: g.away.score,
    state: g.state,
    status_detail: g.status_detail,
    winner: g.winner,
  };
}

/** Team colors live in their own columns, added after launch; see createContest. */
export function colorColumns(g: EspnGame) {
  return { home_color: g.home.color, away_color: g.away.color };
}

/**
 * Best guess at the current season and week, used as the New pick em default.
 * Asks ESPN first; if that fails, counts weeks from the Tuesday before the first Thursday after Labor Day.
 */
export async function currentWeek(league: League, now = new Date()): Promise<{ season: number; seasonType: number; week: number }> {
  try {
    const sport = league === "nfl" ? "nfl" : "college-football";
    const base = (typeof process !== "undefined" && process.env.ESPN_BASE_URL) || "https://site.api.espn.com";
    const res = await fetch(`${base}/apis/site/v2/sports/football/${sport}/scoreboard`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    const season = Number(j?.season?.year), seasonType = Number(j?.season?.type), week = Number(j?.week?.number);
    if (season > 2000 && (seasonType === 2 || seasonType === 3) && week >= 1) return { season, seasonType, week };
  } catch { /* fall through */ }
  return { season: guessSeason(now), seasonType: 2, week: guessWeek(league, now) };
}

export function guessSeason(now: Date) {
  return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

export function guessWeek(league: League, now: Date) {
  const season = guessSeason(now);
  const sept1 = new Date(season, 8, 1);
  const laborDay = new Date(season, 8, 1 + ((8 - sept1.getDay()) % 7));
  // NFL week 1 starts the Tuesday after Labor Day; college week 1 is the week before.
  const start = new Date(laborDay.getTime() + (league === "nfl" ? 1 : -6) * 86400000);
  const n = Math.floor((now.getTime() - start.getTime()) / (7 * 86400000)) + 1;
  return Math.min(league === "nfl" ? 18 : 16, Math.max(1, n));
}
