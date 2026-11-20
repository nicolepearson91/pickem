-- Removes everything the setup file created, so it can be run again from scratch.
-- WARNING: this deletes all pick ems, picks and payments. Only use it before the app is in use,
-- or if supabase/check.sql shows the setup is incomplete.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.payments, public.tiebreakers, public.picks, public.games, public.contests,
  public.invite, public.app_settings, public.profiles cascade;
drop function if exists public.is_admin(), public.is_member(), public.game_open(bigint), public.game_started(bigint),
  public.contest_started(bigint), public.contest_players(bigint), public.join_with_code(text),
  public.set_member(uuid, boolean), public.handle_new_user(), public.picks_fill_contest() cascade;
