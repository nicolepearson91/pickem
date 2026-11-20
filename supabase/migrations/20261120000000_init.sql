-- Pick em app database. Paste this whole file into Supabase > SQL Editor and run it once.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  is_member boolean not null default false,
  created_at timestamptz not null default now()
);

-- Payment handles players see. One row only.
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  venmo_handle text,
  cashapp_tag text,
  apple_cash_contact text,
  last_sync timestamptz
);
insert into public.app_settings (id) values (1);

-- Invite code lives apart from app_settings so only the admin can read it.
create table public.invite (
  id int primary key default 1 check (id = 1),
  code text not null default encode(gen_random_bytes(5), 'hex')
);
insert into public.invite (id) values (1);

create table public.contests (
  id bigint generated always as identity primary key,
  name text not null,
  league text not null check (league in ('nfl', 'cfb')),
  season int not null,
  season_type int not null default 2,
  week int not null,
  espn_group text,
  entry_fee numeric(8, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  tiebreaker_game_id bigint,
  created_at timestamptz not null default now()
);

create table public.games (
  id bigint generated always as identity primary key,
  contest_id bigint not null references public.contests on delete cascade,
  espn_id text not null,
  kickoff timestamptz not null,
  home_name text not null,
  home_abbr text not null,
  home_logo text,
  home_rank int,
  away_name text not null,
  away_abbr text not null,
  away_logo text,
  away_rank int,
  home_score int,
  away_score int,
  state text not null default 'pre' check (state in ('pre', 'in', 'post')),
  status_detail text,
  winner text check (winner in ('home', 'away', 'tie')),
  unique (contest_id, espn_id)
);
create index on public.games (contest_id);

alter table public.contests
  add constraint contests_tiebreaker_fk foreign key (tiebreaker_game_id)
  references public.games (id) on delete set null;

create table public.picks (
  user_id uuid not null references public.profiles on delete cascade,
  game_id bigint not null references public.games on delete cascade,
  contest_id bigint not null references public.contests on delete cascade,
  side text not null check (side in ('home', 'away')),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index on public.picks (contest_id);

create table public.tiebreakers (
  user_id uuid not null references public.profiles on delete cascade,
  contest_id bigint not null references public.contests on delete cascade,
  total_points int not null check (total_points >= 0),
  primary key (user_id, contest_id)
);

create table public.payments (
  contest_id bigint not null references public.contests on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  method text not null check (method in ('venmo', 'cashapp', 'applecash', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'verified')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  primary key (contest_id, user_id)
);

-- ---------- Helper functions ----------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_member or is_admin from profiles where id = auth.uid()), false)
$$;

-- A game accepts picks until kickoff, and only while its contest is open.
create function public.game_open(gid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from games g join contests c on c.id = g.contest_id
    where g.id = gid and c.status = 'open' and g.state = 'pre' and g.kickoff > now()
  )
$$;

create function public.game_started(gid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from games g where g.id = gid and (g.kickoff <= now() or g.state <> 'pre'))
$$;

-- The tiebreaker locks when the contest's first game kicks off.
create function public.contest_started(cid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from games g where g.contest_id = cid and (g.kickoff <= now() or g.state <> 'pre'))
$$;

-- Who has made at least one pick in a contest, without revealing the picks themselves.
create function public.contest_players(cid bigint) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct user_id from picks where contest_id = cid and public.is_member()
$$;

create function public.join_with_code(join_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from invite where lower(code) = lower(trim(join_code))) then
    return false;
  end if;
  update profiles set is_member = true where id = auth.uid();
  return true;
end $$;

create function public.set_member(uid uuid, member boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update profiles set is_member = member where id = uid;
end $$;

-- Create a profile for every new sign up. The very first account becomes the admin.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, display_name, is_admin, is_member)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
             nullif(new.raw_user_meta_data ->> 'full_name', ''),
             split_part(new.email, '@', 1)),
    first_user,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fill picks.contest_id from the game so a pick can't point at the wrong contest.
create function public.picks_fill_contest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select contest_id into new.contest_id from games where id = new.game_id;
  new.updated_at = now();
  return new;
end $$;

create trigger picks_fill_contest before insert or update on public.picks
  for each row execute function public.picks_fill_contest();

-- ---------- Row level security ----------

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.invite enable row level security;
alter table public.contests enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;
alter table public.tiebreakers enable row level security;
alter table public.payments enable row level security;

-- Profiles: members see each other. People may only change their own display name.
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member());
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "settings read" on public.app_settings for select to authenticated using (public.is_member());
create policy "settings write" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "invite admin read" on public.invite for select to authenticated using (public.is_admin());
create policy "invite admin write" on public.invite for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "contests read" on public.contests for select to authenticated using (public.is_member());
create policy "contests admin" on public.contests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "games read" on public.games for select to authenticated using (public.is_member());
create policy "games admin" on public.games for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Picks: your own are always visible; everyone else's appear once that game kicks off.
create policy "picks read" on public.picks for select to authenticated
  using (user_id = auth.uid() or (public.is_member() and public.game_started(game_id)));
create policy "picks insert" on public.picks for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and public.game_open(game_id));
create policy "picks update" on public.picks for update to authenticated
  using (user_id = auth.uid() and public.game_open(game_id))
  with check (user_id = auth.uid() and public.game_open(game_id));
create policy "picks delete" on public.picks for delete to authenticated
  using (user_id = auth.uid() and public.game_open(game_id));

create policy "tiebreak read" on public.tiebreakers for select to authenticated
  using (user_id = auth.uid() or (public.is_member() and public.contest_started(contest_id)));
create policy "tiebreak insert" on public.tiebreakers for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and not public.contest_started(contest_id));
create policy "tiebreak update" on public.tiebreakers for update to authenticated
  using (user_id = auth.uid() and not public.contest_started(contest_id))
  with check (user_id = auth.uid() and not public.contest_started(contest_id));

-- Payments: everyone can see who has paid. Players can only file or change their own
-- pending payment; only the admin can mark one verified.
create policy "payments read" on public.payments for select to authenticated using (public.is_member());
create policy "payments insert own" on public.payments for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and status = 'pending');
create policy "payments update own pending" on public.payments for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');
create policy "payments delete own pending" on public.payments for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');
create policy "payments admin" on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Real-time ----------

alter publication supabase_realtime add table public.games, public.picks, public.tiebreakers, public.payments, public.contests;
