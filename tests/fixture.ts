// Trimmed copy of the shape ESPN's scoreboard returns.
export const scoreboard = {
  events: [
    {
      id: "401", date: "2026-11-22T18:00Z",
      competitions: [{
        status: { type: { state: "post", completed: true, shortDetail: "Final" } },
        competitors: [
          { homeAway: "home", score: "24", winner: true, team: { displayName: "Kansas City Chiefs", abbreviation: "KC", logo: "https://a.espncdn.com/kc.png", color: "e31837" } },
          { homeAway: "away", score: "17", winner: false, team: { displayName: "Buffalo Bills", abbreviation: "BUF", logo: null } },
        ],
      }],
    },
    {
      id: "402", date: "2026-11-22T21:25Z",
      competitions: [{
        status: { type: { state: "in", completed: false, shortDetail: "7:12 - 3rd" } },
        competitors: [
          { homeAway: "home", score: "10", team: { displayName: "Georgia Bulldogs", abbreviation: "UGA" }, curatedRank: { current: 3 } },
          { homeAway: "away", score: "14", team: { displayName: "Florida Gators", abbreviation: "FLA" }, curatedRank: { current: 99 } },
        ],
      }],
    },
    {
      id: "400", date: "2026-11-21T01:15Z",
      competitions: [{
        status: { type: { state: "pre", completed: false, shortDetail: "11/20 - 8:15 PM EST" } },
        competitors: [
          { homeAway: "home", score: "0", team: { displayName: "Green Bay Packers", abbreviation: "GB" } },
          { homeAway: "away", score: "0", team: { displayName: "Chicago Bears", abbreviation: "CHI" } },
        ],
      }],
    },
    {
      id: "403", date: "2026-11-23T18:00Z",
      competitions: [{
        status: { type: { state: "post", completed: false, shortDetail: "Postponed" } },
        competitors: [
          { homeAway: "home", score: "0", team: { displayName: "A", abbreviation: "A" } },
          { homeAway: "away", score: "0", team: { displayName: "B", abbreviation: "B" } },
        ],
      }],
    },
  ],
};
