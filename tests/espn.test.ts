import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScoreboard, scoreboardUrl } from "../lib/espn.ts";
import { cashAppLink, venmoLink } from "../lib/payments.ts";
import { scoreboard } from "./fixture.ts";

test("parses games in kickoff order with scores, ranks and winners", () => {
  const g = parseScoreboard(scoreboard);
  assert.deepEqual(g.map((x) => x.espn_id), ["400", "401", "402", "403"]);
  const final = g[1];
  assert.equal(final.state, "post");
  assert.equal(final.winner, "home");
  assert.equal(final.home.score, 24);
  assert.equal(final.home.abbr, "KC");
  const live = g[2];
  assert.equal(live.state, "in");
  assert.equal(live.winner, null);
  assert.equal(live.home.rank, 3);
  assert.equal(live.away.rank, null, "99 means unranked");
  assert.equal(live.status_detail, "7:12 - 3rd");
  assert.equal(g[0].state, "pre");
  assert.equal(g[3].winner, null, "postponed games have no winner");
});

test("handles an empty or broken response", () => {
  assert.deepEqual(parseScoreboard({}), []);
  assert.deepEqual(parseScoreboard(null), []);
});

test("builds scoreboard URLs", () => {
  const nfl = scoreboardUrl({ league: "nfl", season: 2026, seasonType: 2, week: 12 });
  assert.match(nfl, /football\/nfl\/scoreboard\?dates=2026&seasontype=2&week=12/);
  assert.doesNotMatch(nfl, /groups/);
  const cfb = scoreboardUrl({ league: "cfb", season: 2026, seasonType: 2, week: 13, group: "8" });
  assert.match(cfb, /college-football\/scoreboard\?.*groups=8/);
});

test("payment links", () => {
  assert.equal(venmoLink("@Nic-P", 10, "NFL Week 12"), "https://venmo.com/Nic-P?txn=pay&amount=10.00&note=NFL+Week+12");
  assert.equal(cashAppLink("$NicP", 5), "https://cash.app/$NicP/5.00");
});
