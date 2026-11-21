-- Name + PIN sign-in. Safe to run more than once.
-- These tables have row security on and no policies, so only the server (service key) can read them.

create table if not exists public.pin_logins (
  name_key text primary key,              -- the sign-in name, lowercased
  user_id uuid not null unique references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.pin_logins enable row level security;

create table if not exists public.pin_attempts (
  name_key text primary key,
  failures int not null default 0,
  locked_until timestamptz
);
alter table public.pin_attempts enable row level security;

-- Team colors for the Game Day Dark look (also in its own file).
alter table public.games add column if not exists home_color text, add column if not exists away_color text;
