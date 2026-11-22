-- Super Bowl squares: 10x10 boards players buy squares on, with numbers drawn at random.
-- Only adds new tables and functions. Safe to run more than once. Nothing existing is changed.

create extension if not exists pgcrypto;

create table if not exists public.squares_boards (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric(8, 2) not null default 0 check (price >= 0),
  -- Most squares one player may hold. Empty means no limit.
  max_per_player int check (max_per_player is null or max_per_player between 1 and 100),
  status text not null default 'open' check (status in ('open', 'closed')),
  -- Percent of the pot for the score at the end of Q1, halftime, end of Q3, and the final.
  q1_pct int not null default 20,
  q2_pct int not null default 20,
  q3_pct int not null default 20,
  final_pct int not null default 40,
  -- The game, from ESPN. Can be linked later, once the matchup is set.
  league text not null default 'nfl' check (league in ('nfl', 'cfb')),
  season int,
  season_type int,
  week int,
  espn_group text,
  espn_id text,
  kickoff timestamptz,
  home_name text,
  home_abbr text,
  home_logo text,
  home_color text,
  away_name text,
  away_abbr text,
  away_logo text,
  away_color text,
  home_score int,
  away_score int,
  period int,
  state text not null default 'pre' check (state in ('pre', 'in', 'post')),
  status_detail text,
  -- Score at the end of each quarter: [{"away":7,"home":3}, null, ...] for Q1, half, Q3, final.
  marks jsonb not null default '[null,null,null,null]'::jsonb,
  -- When the admin types scores in by hand, the score sync leaves them alone.
  manual_scores boolean not null default false,
  -- Digits 0-9 in random order. Columns go with the home team, rows with the away team.
  col_digits int[],
  row_digits int[],
  drawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.squares (
  board_id bigint not null references public.squares_boards on delete cascade,
  row_idx int not null check (row_idx between 0 and 9),
  col_idx int not null check (col_idx between 0 and 9),
  user_id uuid not null references public.profiles on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (board_id, row_idx, col_idx)
);
create index if not exists squares_user_idx on public.squares (user_id);

-- One payment record per player per board. squares = how many they say they paid for;
-- verified_squares = how many the admin has confirmed. Only the admin can change verified_squares.
create table if not exists public.squares_payments (
  board_id bigint not null references public.squares_boards on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  squares int not null check (squares >= 0),
  verified_squares int not null default 0 check (verified_squares >= 0),
  method text not null check (method in ('venmo', 'cashapp', 'applecash', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'verified')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  primary key (board_id, user_id)
);

-- Winnings the admin has sent, one per quarter.
create table if not exists public.squares_payouts (
  board_id bigint not null references public.squares_boards on delete cascade,
  quarter int not null check (quarter between 1 and 4),
  user_id uuid not null references public.profiles on delete cascade,
  amount numeric(10, 2) not null,
  method text,
  paid_at timestamptz not null default now(),
  primary key (board_id, quarter, user_id)
);

-- A player may claim a square while the board is open, the numbers aren't drawn yet,
-- and they're under the board's limit.
create or replace function public.squares_can_claim(bid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squares_boards b
    where b.id = bid and b.status = 'open' and b.col_digits is null
      and (b.max_per_player is null
           or (select count(*) from squares s where s.board_id = bid and s.user_id = auth.uid()) < b.max_per_player)
  )
$$;

create or replace function public.squares_can_unclaim(bid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squares_boards b where b.id = bid and b.status = 'open' and b.col_digits is null)
$$;

-- Shuffles 0-9 for the columns and rows. Internal: nobody can call it directly.
create or replace function public.squares_shuffle(bid bigint) returns void
language sql security definer set search_path = public as $$
  update squares_boards set
    col_digits = (select array_agg(i order by gen_random_uuid()) from generate_series(0, 9) i),
    row_digits = (select array_agg(i order by gen_random_uuid()) from generate_series(0, 9) i),
    drawn_at = now()
  where id = bid and col_digits is null
$$;
revoke execute on function public.squares_shuffle(bigint) from public, anon, authenticated;

-- The admin's "Draw numbers" button.
create or replace function public.squares_draw(bid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  perform public.squares_shuffle(bid);
end $$;

-- When the 100th square is claimed, draw the numbers automatically.
create or replace function public.squares_after_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from squares where board_id = new.board_id) >= 100 then
    perform public.squares_shuffle(new.board_id);
  end if;
  return null;
end $$;

drop trigger if exists squares_after_claim on public.squares;
create trigger squares_after_claim after insert on public.squares
  for each row execute function public.squares_after_claim();

-- ---------- Row level security ----------

alter table public.squares_boards enable row level security;
alter table public.squares enable row level security;
alter table public.squares_payments enable row level security;
alter table public.squares_payouts enable row level security;

drop policy if exists "boards read" on public.squares_boards;
create policy "boards read" on public.squares_boards for select to authenticated using (public.is_member());
drop policy if exists "boards admin" on public.squares_boards;
create policy "boards admin" on public.squares_boards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "squares read" on public.squares;
create policy "squares read" on public.squares for select to authenticated using (public.is_member());
drop policy if exists "squares claim" on public.squares;
create policy "squares claim" on public.squares for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and public.squares_can_claim(board_id));
drop policy if exists "squares unclaim" on public.squares;
create policy "squares unclaim" on public.squares for delete to authenticated
  using (user_id = auth.uid() and public.squares_can_unclaim(board_id));
drop policy if exists "squares admin" on public.squares;
create policy "squares admin" on public.squares for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sq payments read" on public.squares_payments;
create policy "sq payments read" on public.squares_payments for select to authenticated using (public.is_member());
drop policy if exists "sq payments insert own" on public.squares_payments;
create policy "sq payments insert own" on public.squares_payments for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and status = 'pending' and verified_squares = 0);
drop policy if exists "sq payments update own" on public.squares_payments;
create policy "sq payments update own" on public.squares_payments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "sq payments delete own" on public.squares_payments;
create policy "sq payments delete own" on public.squares_payments for delete to authenticated
  using (user_id = auth.uid() and verified_squares = 0);
drop policy if exists "sq payments admin" on public.squares_payments;
create policy "sq payments admin" on public.squares_payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Players can't touch the confirmed count. The admin's confirm button goes through the server key.
revoke update on public.squares_payments from authenticated;
grant update (squares, method, status, submitted_at) on public.squares_payments to authenticated;

drop policy if exists "sq payouts read" on public.squares_payouts;
create policy "sq payouts read" on public.squares_payouts for select to authenticated using (public.is_member());
drop policy if exists "sq payouts admin" on public.squares_payouts;
create policy "sq payouts admin" on public.squares_payouts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Live updates ----------

do $$
declare t text;
begin
  foreach t in array array['squares_boards', 'squares', 'squares_payments', 'squares_payouts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
