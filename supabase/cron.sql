-- Run this after the app is deployed. It pings the score sync every minute.
-- First turn on the pg_cron and pg_net extensions under Database > Extensions.
-- Replace the two placeholders below before running.

select cron.schedule(
  'pickem-sync-scores',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/sync-scores',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', 'YOUR_SYNC_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- To stop it later:  select cron.unschedule('pickem-sync-scores');
