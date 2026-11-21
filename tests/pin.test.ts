import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, nameKey, pinPassword, validName, validPin } from "../lib/pin.ts";

test("names", () => {
  assert.equal(nameKey("  Big   Mike "), "big mike");
  assert.equal(cleanName("  Big   Mike "), "Big Mike");
  assert.ok(validName("Big Mike"));
  assert.ok(validName("José O'Neil"));
  assert.ok(!validName("x"));
  assert.ok(!validName("<script>"));
});

test("pins", () => {
  assert.ok(validPin("0420"));
  assert.ok(!validPin("123"));
  assert.ok(!validPin("12a4"));
});

test("pin password is keyed, per user, and long", () => {
  process.env.PIN_SECRET = "k1";
  const a = pinPassword("u1", "1234");
  assert.equal(a.length, 64);
  assert.notEqual(a, pinPassword("u2", "1234"));
  process.env.PIN_SECRET = "k2";
  assert.notEqual(a, pinPassword("u1", "1234"));
});
