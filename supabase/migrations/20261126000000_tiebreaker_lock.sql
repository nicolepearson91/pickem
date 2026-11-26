-- The tiebreaker now locks at the tiebreaker game's own kickoff, unless the pick em is set to
-- lock everything at the first kickoff (then it locks at the first kickoff, as before).
-- Safe to run more than once. Nothing is removed; existing tiebreakers are kept.

create or replace function public.tiebreaker_locked(cid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c.lock_at_first_kickoff or c.tiebreaker_game_id is null then public.contest_started(c.id)
    else public.game_started(c.tiebreaker_game_id)
  end
  from contests c where c.id = cid
$$;

drop policy if exists "tiebreak read" on public.tiebreakers;
drop policy if exists "tiebreak insert" on public.tiebreakers;
drop policy if exists "tiebreak update" on public.tiebreakers;

-- Others' tiebreakers stay hidden until the tiebreaker locks, so nobody can copy a guess.
create policy "tiebreak read" on public.tiebreakers for select to authenticated
  using (user_id = auth.uid() or (public.is_member() and coalesce(public.tiebreaker_locked(contest_id), true)));
create policy "tiebreak insert" on public.tiebreakers for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and not coalesce(public.tiebreaker_locked(contest_id), true));
create policy "tiebreak update" on public.tiebreakers for update to authenticated
  using (user_id = auth.uid() and not coalesce(public.tiebreaker_locked(contest_id), true))
  with check (user_id = auth.uid() and not coalesce(public.tiebreaker_locked(contest_id), true));
