-- Team colors for the Game Day Dark look. Safe to run more than once.
alter table public.games add column if not exists home_color text, add column if not exists away_color text;
