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
      team: { displayName: nm, abbreviation: ab, logo: null }, curatedRank: { current: rank ?? 99 },
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
http.createServer((req, res) => {
  const isCfb = req.url.includes("college-football");
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ events: isCfb ? events(cfb, "c") : events(nfl, "n") }));
}).listen(4010, "127.0.0.1", () => console.log("mock ESPN on http://127.0.0.1:4010"));
