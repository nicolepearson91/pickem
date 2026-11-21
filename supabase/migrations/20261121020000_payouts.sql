-- Payouts: where winners get paid, how each pot is split, and which winners have been paid.
-- Only adds things. Safe to run more than once. Nothing existing is changed or removed.

-- Each player's own Venmo / Cash App, visible only to them and the admin.
create table if not exists public.payout_info (
  user_id uuid primary key references public.profiles on delete cascade,
  venmo_handle text,
  cashapp_tag text,
  updated_at timestamptz not null default now()
);
alter table public.payout_info enable row level security;
drop policy if exists "payout info read" on public.payout_info;
create policy "payout info read" on public.payout_info for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "payout info insert own" on public.payout_info;
create policy "payout info insert own" on public.payout_info for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "payout info update own" on public.payout_info;
create policy "payout info update own" on public.payout_info for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Share of the pot for 2nd place, in percent. 0 means winner takes all.
alter table public.contests add column if not exists second_place_pct int not null default 0;

-- Winners the admin has paid. Everyone in the pool can see these.
create table if not exists public.payouts (
  contest_id bigint not null references public.contests on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  amount numeric(10,2) not null,
  method text,
  paid_at timestamptz not null default now(),
  primary key (contest_id, user_id)
);
alter table public.payouts enable row level security;
drop policy if exists "payouts read" on public.payouts;
create policy "payouts read" on public.payouts for select to authenticated using (public.is_member());
drop policy if exists "payouts admin" on public.payouts;
create policy "payouts admin" on public.payouts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
