-- Phone notifications (e.g. "Mike says he paid"). Only adds new tables; safe to run more than once.
-- Both tables are server-only: row security is on with no policies, so only the app's server can use them.

-- Each phone or browser that turned on notifications.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- The app's own notification keys, made automatically the first time they're needed.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null
);
alter table public.push_keys enable row level security;
