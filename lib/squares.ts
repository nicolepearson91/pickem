// Super Bowl squares: who wins each quarter and how the pot splits.
import type { EspnGame } from "./espn.ts";

export type Mark = { away: number; home: number } | null;

export interface SquaresBoard {
  id: number;
  name: string;
  price: number;
  max_per_player: number | null;
  status: "open" | "closed";
  q1_pct: number;
  q2_pct: number;
  q3_pct: number;
  final_pct: number;
  league: "nfl" | "cfb";
  season: number | null;
  season_type: number | null;
  week: number | null;
  espn_group: string | null;
  espn_id: string | null;
  kickoff: string | null;
  home_name: string | null;
  home_abbr: string | null;
  home_logo: string | null;
  home_color: string | null;
  away_name: string | null;
  away_abbr: string | null;
  away_logo: string | null;
  away_color: string | null;
  home_score: number | null;
  away_score: number | null;
  period: number | null;
  state: "pre" | "in" | "post";
  status_detail: string | null;
  marks: Mark[];
  manual_scores: boolean;
  col_digits: number[] | null;
  row_digits: number[] | null;
  drawn_at: string | null;
  created_at: string;
}

export interface Square {
  board_id: number;
  row_idx: number;
  col_idx: number;
  user_id: string;
}

export interface SquaresPayment {
  board_id: number;
  user_id: string;
  squares: number;
  verified_squares: number;
  method: "venmo" | "cashapp" | "applecash" | "cash";
  status: "pending" | "verified";
  submitted_at: string;
  verified_at: string | null;
}

export interface SquaresPayout {
  board_id: number;
  quarter: number;
  user_id: string;
  amount: number;
  method: string | null;
  paid_at: string;
}

export const QUARTERS = ["1st quarter", "Halftime", "3rd quarter", "Final"] as const;
export const QUARTER_SHORT = ["Q1", "Half", "Q3", "Final"] as const;

export const pcts = (b: Pick<SquaresBoard, "q1_pct" | "q2_pct" | "q3_pct" | "final_pct">) =>
  [b.q1_pct, b.q2_pct, b.q3_pct, b.final_pct].map(Number);

/** Score at the end of Q1, halftime and Q3 (once each is over), plus the final once the game ends. */
export function marksFromGame(g: Pick<EspnGame, "home" | "away" | "state" | "periodsDone" | "winner">): Mark[] {
  const sum = (a: number[], n: number) => a.slice(0, n).reduce((s, x) => s + x, 0);
  const out: Mark[] = [null, null, null, null];
  for (let i = 0; i < 3; i++) {
    const n = i + 1;
    if (g.periodsDone >= n && g.home.linescores.length >= n && g.away.linescores.length >= n) {
      out[i] = { away: sum(g.away.linescores, n), home: sum(g.home.linescores, n) };
    }
  }
  if (g.state === "post" && g.periodsDone >= 4 && g.home.score !== null && g.away.score !== null) {
    out[3] = { away: g.away.score, home: g.home.score };
  }
  return out;
}

/** Board columns from an ESPN game. Leaves quarter scores alone if the admin typed them in. */
export function boardGameColumns(g: EspnGame, manual: boolean) {
  return {
    espn_id: g.espn_id,
    kickoff: g.kickoff,
    home_name: g.home.name,
    home_abbr: g.home.abbr,
    home_logo: g.home.logo,
    home_color: g.home.color,
    away_name: g.away.name,
    away_abbr: g.away.abbr,
    away_logo: g.away.logo,
    away_color: g.away.color,
    home_score: g.home.score,
    away_score: g.away.score,
    period: g.period,
    state: g.state,
    status_detail: g.status_detail,
    ...(manual ? {} : { marks: marksFromGame(g) }),
  };
}

/** Which square a score lands on, once the numbers are drawn. */
export function cellFor(b: Pick<SquaresBoard, "col_digits" | "row_digits">, m: Mark): { row: number; col: number } | null {
  if (!m || !b.col_digits || !b.row_digits) return null;
  const col = b.col_digits.indexOf(((m.home % 10) + 10) % 10);
  const row = b.row_digits.indexOf(((m.away % 10) + 10) % 10);
  return col < 0 || row < 0 ? null : { row, col };
}

/** Splits the pot by the board's percentages, to the cent, with the final soaking up any rounding. */
export function prizeAmounts(pot: number, p: number[]): number[] {
  const cents = Math.round(pot * 100);
  const out = p.slice(0, 3).map((x) => Math.floor((cents * x) / 100));
  out.push(Math.max(0, Math.round((cents * p.slice(0, 4).reduce((s, x) => s + x, 0)) / 100) - out.reduce((s, x) => s + x, 0)));
  return out.map((c) => c / 100);
}

export interface QuarterResult {
  quarter: number; // 0-3
  mark: Mark;
  cell: { row: number; col: number } | null;
  /** Owner of the winning square, null if nobody claimed it. */
  userId: string | null;
  /** What this quarter pays, including anything rolled over from an empty square before it. */
  amount: number;
  rolledIn: number;
  /** One payout per winner. Usually just the square's owner. */
  winners: { user_id: string; amount: number }[];
  /** The winning square was empty: its money moves on. */
  rolledOver: boolean;
  /** Extra this winner gets because the final square was empty. */
  bonus: number;
}

/**
 * Winners for each quarter. If a winning square is empty, that prize rolls to the next quarter.
 * If the final square is empty, it is split between the earlier quarters' winners.
 */
export function squaresResults(b: SquaresBoard, squares: Square[], pot: number): QuarterResult[] {
  const owner = new Map(squares.map((s) => [`${s.row_idx}:${s.col_idx}`, s.user_id]));
  const prizes = prizeAmounts(pot, pcts(b));
  const marks = Array.isArray(b.marks) ? b.marks : [];
  const out: QuarterResult[] = [];
  let carry = 0;
  for (let q = 0; q < 4; q++) {
    const mark = marks[q] ?? null;
    const cell = cellFor(b, mark);
    const userId = cell ? owner.get(`${cell.row}:${cell.col}`) ?? null : null;
    const amount = Math.round((prizes[q] + carry) * 100) / 100;
    const r: QuarterResult = { quarter: q, mark, cell, userId, amount, rolledIn: carry, winners: [], rolledOver: false, bonus: 0 };
    if (cell && userId) {
      r.winners = [{ user_id: userId, amount }];
      carry = 0;
    } else if (cell) {
      r.rolledOver = true;
      carry = amount;
    }
    out.push(r);
  }
  // An empty final square: share it between everyone who won a quarter, by the quarter.
  const last = out[3];
  if (last.rolledOver) {
    const earlier = out.slice(0, 3).filter((r) => r.userId);
    if (earlier.length) {
      const cents = Math.round(last.amount * 100);
      const each = Math.floor(cents / earlier.length);
      let extra = cents - each * earlier.length;
      for (const r of earlier) {
        const c = each + (extra-- > 0 ? 1 : 0);
        r.bonus = c / 100;
        r.winners = [{ user_id: r.userId!, amount: Math.round(r.amount * 100 + c) / 100 }];
      }
    }
  }
  return out;
}

/** Pot: squares the admin has confirmed payment for, times the price. */
export function squaresPot(payments: Pick<SquaresPayment, "squares" | "verified_squares" | "status">[], price: number) {
  const paidSquares = payments.reduce((s, p) => s + Number(p.verified_squares || 0), 0);
  const pendingSquares = payments.reduce((s, p) => s + (p.status === "pending" ? Math.max(0, p.squares - p.verified_squares) : 0), 0);
  return { paidSquares, pendingSquares, pot: paidSquares * Number(price), pendingAmount: pendingSquares * Number(price) };
}

export const teamLabel = (b: SquaresBoard, side: "home" | "away") =>
  (side === "home" ? b.home_name : b.away_name) || (side === "home" ? "Home team" : "Away team");
