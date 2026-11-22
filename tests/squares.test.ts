import { test } from "node:test";
import assert from "node:assert/strict";
import { cellFor, marksFromGame, prizeAmounts, squaresPot, squaresResults, type SquaresBoard, type Square } from "../lib/squares.ts";
import { parseScoreboard } from "../lib/espn.ts";

const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const board = (marks: SquaresBoard["marks"], extra: Partial<SquaresBoard> = {}) => ({
  id: 1, name: "B", price: 10, max_per_player: null, status: "open", q1_pct: 20, q2_pct: 20, q3_pct: 20, final_pct: 40,
  col_digits: digits, row_digits: digits, marks, ...extra,
}) as SquaresBoard;
const sq = (row: number, col: number, user_id: string): Square => ({ board_id: 1, row_idx: row, col_idx: col, user_id });

test("prizes split 20/20/20/40 to the cent", () => {
  assert.deepEqual(prizeAmounts(1000, [20, 20, 20, 40]), [200, 200, 200, 400]);
  const odd = prizeAmounts(333.33, [20, 20, 20, 40]);
  assert.equal(odd.reduce((s, x) => s + x, 0).toFixed(2), "333.33");
});

test("winning square uses the last digit of each score", () => {
  const b = board([], { col_digits: [3, 1, 4, 7, 5, 9, 2, 6, 8, 0], row_digits: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] });
  // Home 17 -> 7 is column 3. Away 24 -> 4 is row 5.
  assert.deepEqual(cellFor(b, { home: 17, away: 24 }), { row: 5, col: 3 });
  assert.equal(cellFor({ col_digits: null, row_digits: null }, { home: 1, away: 2 }), null);
});

test("each quarter pays its owner", () => {
  const b = board([{ away: 3, home: 0 }, { away: 9, home: 0 }, { away: 12, home: 0 }, { away: 29, home: 13 }]);
  const r = squaresResults(b, [sq(3, 0, "a"), sq(9, 0, "b"), sq(2, 0, "c"), sq(9, 3, "d")], 1000);
  assert.deepEqual(r.map((x) => x.winners), [[{ user_id: "a", amount: 200 }], [{ user_id: "b", amount: 200 }], [{ user_id: "c", amount: 200 }], [{ user_id: "d", amount: 400 }]]);
});

test("an empty winning square rolls to the next quarter", () => {
  const b = board([{ away: 3, home: 0 }, { away: 9, home: 0 }, null, null]);
  const r = squaresResults(b, [sq(9, 0, "b")], 1000);
  assert.equal(r[0].rolledOver, true);
  assert.deepEqual(r[1].winners, [{ user_id: "b", amount: 400 }]);
  assert.equal(r[1].rolledIn, 200);
  assert.deepEqual(r[2].winners, []);
});

test("an empty final square is shared by the earlier winners", () => {
  const b = board([{ away: 1, home: 0 }, { away: 2, home: 0 }, { away: 3, home: 0 }, { away: 4, home: 0 }]);
  const r = squaresResults(b, [sq(1, 0, "a"), sq(2, 0, "b"), sq(3, 0, "a")], 100);
  assert.deepEqual(r.map((x) => x.winners[0]?.amount ?? 0), [33.34, 33.33, 33.33, 0]);
});

test("pot counts only confirmed squares", () => {
  const p = squaresPot([
    { squares: 4, verified_squares: 4, status: "verified" },
    { squares: 5, verified_squares: 2, status: "pending" },
  ], 10);
  assert.deepEqual(p, { paidSquares: 6, pendingSquares: 3, pot: 60, pendingAmount: 30 });
});

const espnGame = (state: string, name: string, period: number, home: number[], away: number[], completed = state === "post") => parseScoreboard({
  events: [{ id: "1", date: "2027-02-14T23:30Z", competitions: [{
    status: { period, type: { state, name, completed, shortDetail: "x" } },
    competitors: [
      { homeAway: "home", score: String(home.reduce((s, x) => s + x, 0)), team: { abbreviation: "NE" }, linescores: home.map((value) => ({ value })) },
      { homeAway: "away", score: String(away.reduce((s, x) => s + x, 0)), team: { abbreviation: "SEA" }, linescores: away.map((value) => ({ value })) },
    ],
  }] }],
})[0];

test("quarter scores come from ESPN's line scores", () => {
  const half = espnGame("in", "STATUS_HALFTIME", 2, [0, 0], [3, 6]);
  assert.deepEqual(marksFromGame(half), [{ away: 3, home: 0 }, { away: 9, home: 0 }, null, null]);
  const q2 = espnGame("in", "STATUS_IN_PROGRESS", 2, [0, 7], [3, 0]);
  assert.deepEqual(marksFromGame(q2), [{ away: 3, home: 0 }, null, null, null]);
  const ot = espnGame("in", "STATUS_IN_PROGRESS", 5, [7, 7, 7, 3, 0], [3, 6, 3, 12, 0]);
  assert.equal(marksFromGame(ot)[3], null, "no final until the game is over");
  const fin = espnGame("post", "STATUS_FINAL", 5, [7, 7, 7, 3, 6], [3, 6, 3, 12, 0]);
  assert.deepEqual(marksFromGame(fin), [{ away: 3, home: 7 }, { away: 9, home: 14 }, { away: 12, home: 21 }, { away: 24, home: 30 }]);
});
