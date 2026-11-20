import type { Game, Pick as PickRow, Tiebreaker } from "./types.ts";

export interface StandingRow {
  user_id: string;
  display_name: string;
  correct: number;
  wrong: number;
  /** Picks on games not decided yet. */
  pending: number;
  /** Best possible final score. */
  possible: number;
  tiebreak: number | null;
  /** Distance from the real total of the tiebreaker game, once it is final. */
  tiebreakDiff: number | null;
  place: number;
}

type GameLite = Pick<Game, "id" | "state" | "winner" | "home_score" | "away_score">;
type PickLite = Pick<PickRow, "user_id" | "game_id" | "side">;
type Player = { id: string; display_name: string };

export function contestStandings(
  players: Player[],
  games: GameLite[],
  picks: PickLite[],
  tiebreakers: Pick<Tiebreaker, "user_id" | "total_points">[],
  tiebreakerGameId: number | null,
  /** Extra people to list even before their picks are visible (e.g. anyone who paid). */
  extraIds: string[] = [],
): StandingRow[] {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const tbGame = tiebreakerGameId ? gameById.get(tiebreakerGameId) : undefined;
  const tbTotal =
    tbGame && tbGame.state === "post" && tbGame.home_score !== null && tbGame.away_score !== null
      ? tbGame.home_score + tbGame.away_score
      : null;
  const tbByUser = new Map(tiebreakers.map((t) => [t.user_id, t.total_points]));

  // Anyone who made a pick or a tiebreaker guess is in the standings.
  const ids = new Set<string>([...picks.map((p) => p.user_id), ...tiebreakers.map((t) => t.user_id), ...extraIds]);
  const names = new Map(players.map((p) => [p.id, p.display_name]));

  const rows: StandingRow[] = [...ids].map((uid) => {
    let correct = 0, wrong = 0, pending = 0;
    for (const p of picks) {
      if (p.user_id !== uid) continue;
      const g = gameById.get(p.game_id);
      if (!g) continue;
      if (g.state === "post" && g.winner) {
        if (g.winner === p.side) correct++;
        else wrong++;
      } else if (g.state !== "post") {
        pending++;
      }
    }
    const tb = tbByUser.get(uid) ?? null;
    return {
      user_id: uid,
      display_name: names.get(uid) ?? "Player",
      correct,
      wrong,
      pending,
      possible: correct + pending,
      tiebreak: tb,
      tiebreakDiff: tb !== null && tbTotal !== null ? Math.abs(tb - tbTotal) : null,
      place: 0,
    };
  });

  const tbKey = (r: StandingRow) => (tbTotal === null ? 0 : r.tiebreakDiff ?? Number.MAX_SAFE_INTEGER);
  rows.sort(
    (a, b) => b.correct - a.correct || tbKey(a) - tbKey(b) || a.display_name.localeCompare(b.display_name),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.place = prev && prev.correct === r.correct && tbKey(prev) === tbKey(r) ? prev.place : i + 1;
  });
  return rows;
}

export interface SeasonRow {
  user_id: string;
  display_name: string;
  correct: number;
  wrong: number;
  weeksPlayed: number;
  weeksWon: number;
  place: number;
}

/** Totals across weeks. A week counts as won only when every game in it is final. */
export function seasonStandings(weeks: { finished: boolean; rows: StandingRow[] }[]): SeasonRow[] {
  const acc = new Map<string, SeasonRow>();
  for (const w of weeks) {
    for (const r of w.rows) {
      const s = acc.get(r.user_id) ?? {
        user_id: r.user_id, display_name: r.display_name, correct: 0, wrong: 0,
        weeksPlayed: 0, weeksWon: 0, place: 0,
      };
      s.correct += r.correct;
      s.wrong += r.wrong;
      s.weeksPlayed += 1;
      if (w.finished && r.place === 1) s.weeksWon += 1;
      acc.set(r.user_id, s);
    }
  }
  const rows = [...acc.values()].sort(
    (a, b) => b.correct - a.correct || b.weeksWon - a.weeksWon || a.display_name.localeCompare(b.display_name),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.place = prev && prev.correct === r.correct && prev.weeksWon === r.weeksWon ? prev.place : i + 1;
  });
  return rows;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
