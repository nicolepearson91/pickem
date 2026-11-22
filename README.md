# Pick Em

Weekly NFL and college football pick ems for a group of friends.

- **Admin** creates a pick em for any NFL or college week (all games, Top 25 games, one conference, or hand-picked games), sets an entry fee and a tiebreaker game.
- **Players** sign in, join with an invite link, and pick a winner for each game. Each game locks at its kickoff. Other players' picks stay hidden until that game starts.
- **Dashboard** shows everyone's picks, live scores and the standings, and updates on its own while games are on.
- **Season standings** total everyone's correct picks and weeks won.
- **Payments**: players pay the admin through Venmo or Cash App (links open the app with the amount filled in), Apple Cash (copy the admin's number), or cash. Every payment stays "pending" until the admin confirms it arrived.

Built with Next.js, Supabase (logins, database, live updates) and ESPN's public scoreboard feed.

## Forgotten passwords

Players can use **Forgot password?** or **Email me a sign-in link** on the sign-in page. Supabase's built-in email sender is only meant for testing: it sends a handful of emails an hour and may only deliver to your own team's addresses. For reliable emails, add your own sender under **Authentication > Emails > SMTP Settings** (a Gmail account with an app password works).

Either way, the admin can always go to **Admin > Players > Password reset link** and text that link to the player. It works once, on any device, within an hour.

## Name + PIN sign-in

Players can join from the invite link with just a name and a 4-digit PIN, no email needed, and sign in on any phone with the same name and PIN. Names are unique. After 5 wrong PINs that name is locked for 15 minutes. If someone forgets their PIN, open Admin, find them under Players, tap **Reset PIN** and text them the new one. Email and Google sign-in still work.

PINs are never stored. The server turns each PIN into a long password using a secret key (`PIN_SECRET` in Vercel if set, otherwise the Supabase secret key). If that key ever changes, PIN players will need their PINs reset.

## The pot

Each pick em shows its pot: the entry fee times the payments the admin has confirmed. Payments players have marked as sent but that aren't confirmed yet show separately as pending. The Season page shows the total pot for the season.

## Super Bowl squares

Under **Squares**, players claim boxes on a 10 by 10 board. The admin makes boards from **Admin > Squares boards > New squares board** (type several prices like `5, 10, 20` to make one board per price), and can change the name, price, most squares per person (empty means no limit) and the payout split at any time.

- When the 100th square is claimed, the numbers 0 to 9 are drawn at random across the top (home team) and down the side (away team), and the board locks. The admin can also draw early, and can clear the numbers before kickoff.
- The last digit of each team's score at the end of the 1st quarter, halftime, the 3rd quarter and the final picks the winning square. Default split: 20%, 20%, 20%, 40%.
- If a winning square is empty, its prize rolls to the next quarter. If the final square is empty, it's shared by the earlier winners.
- Link the game from the board's Admin page once ESPN lists it (for the Super Bowl: NFL, Playoffs, week 5). Scores then fill in live. The admin can also type the quarter scores by hand.
- Players pay per square and tap "I sent it"; payments show in **Payments to confirm** like pick em entries. The pot counts confirmed squares only.

Setup: run `supabase/migrations/20261122010000_squares.sql` once in the Supabase SQL Editor.

## Rules

- 1 point per correct pick. Tied games count for nobody.
- Ties in the standings are broken by the closest guess at the total points of the tiebreaker game, once it's final.
- The tiebreaker guess locks when the first game of the week kicks off.

## Setup (about 15 minutes, all free)

### 1. Supabase (database and logins)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of `supabase/migrations/20261120000000_init.sql`, and run it.
3. Under **Authentication > Sign In / Providers > Email**, turn off **Confirm email**. Supabase's free email sender only sends a few emails an hour, so confirmation emails would block friends from signing up. (Optional: turn on **Google** there too.)
4. Under **Authentication > URL Configuration**, set **Site URL** to your site's address and add `https://YOUR-SITE.vercel.app/**` under **Redirect URLs**. Password reset and sign-in emails only work with this.
5. Under **Project Settings > API Keys**, copy the project URL, the publishable (anon) key and the secret (service role) key for step 2.

> **The first account to sign up becomes the admin.** Sign up yourself before you share the link.

### 2. Vercel (hosting)

1. Import this GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add these environment variables:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret (service role) key |
   | `SYNC_SECRET` | Any long random string |

3. Deploy. Then in Supabase **Authentication > URL Configuration**, set the Site URL to your Vercel address.

### 3. Live score updates

Open dashboards already pull scores about once a minute while games are live. To keep scores updating when nobody has the app open:

1. In Supabase **Database > Extensions**, turn on `pg_cron` and `pg_net`.
2. Open `supabase/cron.sql`, put in your Vercel address and `SYNC_SECRET`, and run it in the SQL Editor.

The sync only calls ESPN when a game is live or about to start.

### 4. Use it

1. Sign up (you become admin), then go to **Admin** and fill in your Venmo, Cash App and Apple Cash details.
2. Copy the invite link from **Admin** and send it to your friends.
3. Click **New pick em**, choose the league and week, load the games, pick which ones to include, set the fee and publish.

## About the score feed

ESPN's scoreboard feed is free and needs no key, but it is unofficial and could change without notice. All of the code that reads it is in `lib/espn.ts`, so moving to a paid feed (for example SportsDataIO) only means rewriting that file.

## Development

```bash
npm install
npx supabase start          # local Supabase in Docker; prints the keys for .env.local
node scripts/mock-espn.mjs  # fake ESPN feed with live games, for testing
npm run dev
npm test                    # scoring, score parsing and payment link tests
```

Copy `.env.example` to `.env.local` and add `ESPN_BASE_URL=http://127.0.0.1:4010` to use the fake feed.
