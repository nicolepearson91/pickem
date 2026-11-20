-- Run in Supabase > SQL Editor to check the setup. Every "found" number should match its "expected".
select 'tables' as part, count(*) as found, 8 as expected from information_schema.tables
  where table_schema = 'public' and table_name in ('profiles','app_settings','invite','contests','games','picks','tiebreakers','payments')
union all
select 'functions', count(*), 10 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and proname in ('is_admin','is_member','game_open','game_started','contest_started','contest_players','join_with_code','set_member','handle_new_user','picks_fill_contest')
union all
select 'security rules', count(*), 22 from pg_policies where schemaname = 'public'
union all
select 'sign-up trigger', count(*), 1 from pg_trigger where tgname = 'on_auth_user_created'
union all
select 'live update tables', count(*), 5 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
