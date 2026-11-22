-- Option to lock every pick in a pick em when its first game kicks off (instead of each game at its own kickoff).
-- Safe to run more than once. Nothing is removed; existing picks are kept.

alter table public.contests add column if not exists lock_at_first_kickoff boolean not null default false;

-- Same rule as before (open pick em, game not started), plus: if the pick em locks at first kickoff,
-- nothing can be picked or changed once any of its games has started.
create or replace function public.game_open(gid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from games g join contests c on c.id = g.contest_id
    where g.id = gid and c.status = 'open' and g.state = 'pre' and g.kickoff > now()
      and not (c.lock_at_first_kickoff and public.contest_started(c.id))
  )
$$;

-- Turn it on for this week's Sunday pick em (every game on Sunday Nov 22, 2026, Central time).
update public.contests c set lock_at_first_kickoff = true
where c.status = 'open'
  and exists (select 1 from games g where g.contest_id = c.id)
  and not exists (
    select 1 from games g where g.contest_id = c.id
      and (g.kickoff < timestamptz '2026-11-22 00:00 America/Chicago' or g.kickoff >= timestamptz '2026-11-23 00:00 America/Chicago')
  );
