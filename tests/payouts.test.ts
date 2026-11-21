import { test } from "node:test";
import assert from "node:assert/strict";
import { computePayouts } from "../lib/payouts.ts";

const row = (id: string, place: number) => ({ user_id: id, display_name: id, place });
const amounts = (r: { user_id: string; amount: number }[]) => Object.fromEntries(r.map((x) => [x.user_id, x.amount]));

test("winner takes all", () => {
  assert.deepEqual(amounts(computePayouts([row("a", 1), row("b", 2)], 100)), { a: 100 });
});
test("two tied for 1st split winner-take-all evenly", () => {
  assert.deepEqual(amounts(computePayouts([row("a", 1), row("b", 1), row("c", 3)], 100)), { a: 50, b: 50 });
});
test("three-way tie splits pennies fairly", () => {
  const r = computePayouts([row("a", 1), row("b", 1), row("c", 1)], 100);
  assert.equal(r.reduce((s, x) => s + x.amount, 0).toFixed(2), "100.00");
  assert.deepEqual(r.map((x) => x.amount), [33.34, 33.33, 33.33]);
});
test("70/30 split", () => {
  assert.deepEqual(amounts(computePayouts([row("a", 1), row("b", 2), row("c", 3)], 100, 30)), { a: 70, b: 30 });
});
test("70/30 with a tie for 1st pools 1st and 2nd", () => {
  assert.deepEqual(amounts(computePayouts([row("a", 1), row("b", 1), row("c", 3)], 100, 30)), { a: 50, b: 50 });
});
test("70/30 with a tie for 2nd splits the 2nd prize", () => {
  assert.deepEqual(amounts(computePayouts([row("a", 1), row("b", 2), row("c", 2)], 100, 30)), { a: 70, b: 15, c: 15 });
});
test("one player with a 70/30 split gets everything", () => {
  assert.deepEqual(amounts(computePayouts([row("a", 1)], 100, 30)), { a: 100 });
});
test("no pot, no payouts", () => {
  assert.deepEqual(computePayouts([row("a", 1)], 0), []);
});
