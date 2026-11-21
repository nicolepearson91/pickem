-- Lets the admin choose whether players can share the invite link. Only adds a setting; safe to run more than once.
alter table public.app_settings add column if not exists players_can_invite boolean not null default true;
