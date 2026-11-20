import { test } from "node:test";
import assert from "node:assert/strict";
import { contestStandings, ordinal, seasonStandings } from "../lib/scoring.ts";

const players = [
  { id: "a", display_name: "Ann" },
  { id: "b", display_name: "Bo" },
  { id: "c", display_name: "Cy" },
];
const g = (id: number, state: "pre" | "in" | "post", winner: "home" | "away" | "tie" | null, hs: number | null = null, as: number | null = null) =>
  ({ id, state, winner, home_score: hs, away_score: as });

test("counts right, wrong, pending and ranks with shared places", () => {
  const games = [g(1, "post", "home", 21, 14), g(2, "post", "away", 3, 10), g(3, "pre", null)];
  const picks = [
    { user_id: "a", game_id: 1, side: "home" as const }, { user_id: "a", game_id: 2, side: "away" as const }, { user_id: "a", game_id: 3, side: "home" as const },
    { user_id: "b", game_id: 1, side: "home" as const }, { user_id: "b", game_id: 2, side: "home" as const },
    { user_id: "c", game_id: 1, side: "home" as const }, { user_id: "c", game_id: 2, side: "home" as const },
  ];
  const rows = contestStandings(players, games, picks, [], null);
  assert.deepEqual(rows.map((r) => [r.display_name, r.correct, r.wrong, r.pending, r.possible, r.place]), [
    ["Ann", 2, 0, 1, 3, 1],
    ["Bo", 1, 1, 0, 1, 2],
    ["Cy", 1, 1, 0, 1, 2],
  ]);
});

test("tiebreaker decides only once its game is final", () => {
  const picks = [{ user_id: "a", game_id: 1, side: "home" as const }, { user_id: "b", game_id: 1, side: "home" as const }];
  const tbs = [{ user_id: "a", total_points: 50 }, { user_id: "b", total_points: 36 }];
  const live = contestStandings(players, [g(1, "in", null, 21, 14)], picks, tbs, 1);
  assert.deepEqual(live.map((r) => r.place), [1, 1]);
  const done = contestStandings(players, [g(1, "post", "home", 21, 14)], picks, tbs, 1);
  assert.deepEqual(done.map((r) => [r.display_name, r.tiebreakDiff, r.place]), [["Bo", 1, 1], ["Ann", 15, 2]]);
});

test("ties and missing picks score nothing", () => {
  const rows = contestStandings(players, [g(1, "post", "tie", 20, 20), g(2, "post", "home", 7, 0)],
    [{ user_id: "a", game_id: 1, side: "home" }], [], null, ["b"]);
  assert.deepEqual(rows.map((r) => [r.user_id, r.correct, r.wrong]), [["a", 0, 1], ["b", 0, 0]]);
});

test("season totals and weeks won", () => {
  const w1 = contestStandings(players, [g(1, "post", "home", 1, 0)],
    [{ user_id: "a", game_id: 1, side: "home" }, { user_id: "b", game_id: 1, side: "away" }], [], null);
  const w2 = contestStandings(players, [g(2, "in", null, 1, 0)], [{ user_id: "b", game_id: 2, side: "home" }], [], null);
  const s = seasonStandings([{ finished: true, rows: w1 }, { finished: false, rows: w2 }]);
  assert.deepEqual(s.map((r) => [r.user_id, r.correct, r.weeksWon, r.weeksPlayed, r.place]), [["a", 1, 1, 1, 1], ["b", 0, 0, 2, 2]]);
});

test("ordinal", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
});
