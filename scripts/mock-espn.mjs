// A fake ESPN scoreboard for local testing: `node scripts/mock-espn.mjs` then run the app with
// ESPN_BASE_URL=http://127.0.0.1:4010. Scores advance each time a live game is fetched.
import http from "node:http";

const now = Date.now();
const H = 3600_000;
const team = (name, abbr, rank) => ({ displayName: name, abbreviation: abbr, logo: null, _rank: rank });
const nfl = [
  ["Buffalo Bills", "BUF", "Kansas City Chiefs", "KC", -3 * H, "post", 17, 24],
  ["Chicago Bears", "CHI", "Green Bay Packers", "GB", -1 * H, "in", 10, 7],
  ["Dallas Cowboys", "DAL", "Philadelphia Eagles", "PHI", 2 * H, "pre", 0, 0],
  ["San Francisco 49ers", "SF", "Seattle Seahawks", "SEA", 26 * H, "pre", 0, 0],
  ["Miami Dolphins", "MIA", "New York Jets", "NYJ", 50 * H, "pre", 0, 0],
];
const cfb = [
  ["Florida Gators", "FLA", "Georgia Bulldogs", "UGA", -2 * H, "in", 14, 10, null, 3],
  ["Ohio State Buckeyes", "OSU", "Michigan Wolverines", "MICH", 3 * H, "pre", 0, 0, 2, 12],
  ["Texas Longhorns", "TEX", "Texas A&M Aggies", "TAMU", 5 * H, "pre", 0, 0, 5, 18],
  ["Iowa Hawkeyes", "IOWA", "Nebraska Cornhuskers", "NEB", 28 * H, "pre", 0, 0, null, null],
];
const COLORS = { BUF: '00338d', KC: 'e31837', CHI: '0b162a', GB: '203731', DAL: '041e42', PHI: '004c54', SF: 'aa0000', SEA: '002244', MIA: '008e97', NYJ: '125740',
  FLA: '0021a5', UGA: 'ba0c2f', OSU: 'bb0000', MICH: '00274c', TEX: 'bf5700', TAMU: '500000', IOWA: 'ffcd00', NEB: 'e41c38' };
const state = new Map();
function events(rows, prefix) {
  return rows.map((r, i) => {
    const id = `${prefix}${i}`;
    const s = state.get(id) ?? { st: r[5], a: r[6], h: r[7], ticks: 0 };
    if (s.st === "in") {
      s.ticks++;
      if (s.ticks % 2 === 0) s.h += 7; else s.a += 3;
      if (s.ticks > 6) s.st = "post";
    }
    state.set(id, s);
    const comp = (side, nm, ab, sc, rank) => ({
      homeAway: side, score: String(sc), winner: s.st === "post" ? (side === "home" ? s.h > s.a : s.a > s.h) : undefined,
      team: { displayName: nm, abbreviation: ab, logo: null, color: COLORS[ab] ?? '334155' }, curatedRank: { current: rank ?? 99 },
    });
    return {
      id, date: new Date(now + r[4]).toISOString(),
      competitions: [{
        status: { type: { state: s.st, completed: s.st === "post", shortDetail: s.st === "post" ? "Final" : s.st === "in" ? `${8 - s.ticks}:00 - 3rd` : "Upcoming" } },
        competitors: [comp("home", r[2], r[3], s.h, r[9]), comp("away", r[0], r[1], s.a, r[8])],
      }],
    };
  });
}
// Super Bowl (NFL playoffs week 5): moves forward one step each time it's fetched, with quarter line scores.
const sbSteps = [
  { st: "pre", period: 0, name: "STATUS_SCHEDULED", a: [], h: [] },
  { st: "in", period: 1, name: "STATUS_IN_PROGRESS", a: [3], h: [0] },
  { st: "in", period: 1, name: "STATUS_END_PERIOD", a: [3], h: [7] },
  { st: "in", period: 2, name: "STATUS_HALFTIME", a: [3, 6], h: [7, 7] },
  { st: "in", period: 3, name: "STATUS_IN_PROGRESS", a: [3, 6, 3], h: [7, 7, 0] },
  { st: "in", period: 4, name: "STATUS_IN_PROGRESS", a: [3, 6, 3, 7], h: [7, 7, 0, 3] },
  { st: "post", period: 4, name: "STATUS_FINAL", a: [3, 6, 3, 7], h: [7, 7, 0, 3] },
];
let sbFetches = 0;
let sbFixed = null; // GET /sb-step/N holds the Super Bowl at step N, for tests.
function superBowl() {
  const s = sbSteps[sbFixed ?? Math.min(sbSteps.length - 1, Math.floor(sbFetches++ / 2))];
  const sum = (x) => x.reduce((t, v) => t + v, 0);
  const comp = (side, nm, ab, ls, color) => ({
    homeAway: side, score: String(sum(ls)), winner: s.st === "post" ? (side === "home" ? sum(s.h) > sum(s.a) : sum(s.a) > sum(s.h)) : undefined,
    team: { displayName: nm, abbreviation: ab, logo: null, color }, linescores: ls.map((value, i) => ({ value, period: i + 1 })),
  });
  return [{
    id: "sb1", date: new Date(now + (s.st === "pre" ? 3 * H : -H)).toISOString(),
    competitions: [{
      status: { period: s.period, type: { name: s.name, state: s.st, completed: s.st === "post", shortDetail: s.st === "post" ? "Final" : s.st === "in" ? `Q${s.period}` : "Feb 14" } },
      competitors: [comp("home", "New England Patriots", "NE", s.h, "002244"), comp("away", "Seattle Seahawks", "SEA", s.a, "002a5c")],
    }],
  }];
}

http.createServer((req, res) => {
  const isCfb = req.url.includes("college-football");
  res.setHeader("content-type", "application/json");
  const step = /^\/sb-step\/(\d+)/.exec(req.url);
  if (step) { sbFixed = Math.min(sbSteps.length - 1, Number(step[1])); return res.end(JSON.stringify({ step: sbFixed })); }
  if (!isCfb && req.url.includes("seasontype=3") && req.url.includes("week=5")) {
    return res.end(JSON.stringify({ events: superBowl() }));
  }
  res.end(JSON.stringify({ events: isCfb ? events(cfb, "c") : events(nfl, "n") }));
}).listen(4010, "127.0.0.1", () => console.log("mock ESPN on http://127.0.0.1:4010"));
