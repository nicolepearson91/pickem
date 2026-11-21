export type League = "nfl" | "cfb";
export type Side = "home" | "away";
export type GameState = "pre" | "in" | "post";
export type PayMethod = "venmo" | "cashapp" | "applecash" | "cash";

export interface Profile {
  id: string;
  display_name: string;
  is_admin: boolean;
  is_member: boolean;
}

export interface Contest {
  id: number;
  name: string;
  league: League;
  season: number;
  season_type: number;
  week: number;
  espn_group: string | null;
  entry_fee: number;
  status: "open" | "closed";
  tiebreaker_game_id: number | null;
  created_at: string;
  /** Percent of the pot for 2nd place; 0 = winner takes all. Missing until the payouts SQL is run. */
  second_place_pct?: number;
}

export interface Payout {
  contest_id: number;
  user_id: string;
  amount: number;
  method: string | null;
  paid_at: string;
}

export interface PayoutInfo {
  user_id: string;
  venmo_handle: string | null;
  cashapp_tag: string | null;
}

export interface Game {
  id: number;
  contest_id: number;
  espn_id: string;
  kickoff: string;
  home_name: string;
  home_abbr: string;
  home_logo: string | null;
  home_rank: number | null;
  home_color?: string | null;
  away_name: string;
  away_abbr: string;
  away_logo: string | null;
  away_rank: number | null;
  away_color?: string | null;
  home_score: number | null;
  away_score: number | null;
  state: GameState;
  status_detail: string | null;
  winner: Side | "tie" | null;
}

export interface Pick {
  user_id: string;
  game_id: number;
  contest_id: number;
  side: Side;
}

export interface Tiebreaker {
  user_id: string;
  contest_id: number;
  total_points: number;
}

export interface Payment {
  contest_id: number;
  user_id: string;
  method: PayMethod;
  status: "pending" | "verified";
  submitted_at: string;
  verified_at: string | null;
}

export interface AppSettings {
  venmo_handle: string | null;
  cashapp_tag: string | null;
  apple_cash_contact: string | null;
}
