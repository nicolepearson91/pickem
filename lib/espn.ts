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
