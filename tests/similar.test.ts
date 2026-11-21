import { test } from "node:test";
import assert from "node:assert/strict";
import { looksAlike, sameName } from "../lib/similar.ts";

test("sameName ignores spaces, case and punctuation", () => {
  assert.ok(sameName("Big Mike", "bigmike"));
  assert.ok(sameName("Big-Mike!", "big mike"));
  assert.ok(!sameName("Mike", "Mike B"));
});

test("looksAlike catches likely duplicates", () => {
  assert.ok(looksAlike("Mike", "Mike B"));
  assert.ok(looksAlike("Mike Smith", "mike s"));
  assert.ok(looksAlike("Jessica", "Jesica"));
  assert.ok(looksAlike("Tony", "Tony2"));
  assert.ok(looksAlike("Nicole", "Nicole P"));
});

test("looksAlike leaves different people alone", () => {
  assert.ok(!looksAlike("Mike", "Matt"));
  assert.ok(!looksAlike("Al", "Ed"));
  assert.ok(!looksAlike("Sarah", "Steve"));
  assert.ok(!looksAlike("Big Mike", "Little Mike"));
});
