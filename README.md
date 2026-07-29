# Baseball Prospect Scout

A single-page dashboard that pulls live MLB / Triple-A / Double-A / High-A /
Low-A leaders for both hitters and pitchers, scores each as a baseball-card buy
signal, and shows which big league organization every player belongs to along
with his club prospect ranking.

Static site — `public/index.html` is the whole app, no build step.

## What a card shows

```
LuJames Groover
Reno Aces · AAA · 3B · #4 · 70G      <- affiliate, level, position, stat rank, games
Arizona Diamondbacks #6              <- parent organization, club prospect rank
```

The organization line appears on hitter and pitcher cards. Call-up cards in the
Promoted view show `Prospect #N` instead, since their team line is already the
big league club.

## Watchlist

Tap the ☆ on any card to follow a player; the **Watchlist** tab shows everyone
you have saved, with a count badge in the nav.

Only the player id, name and kind are stored — every stat is re-fetched live
each time you open the tab. That means a watched player:

- **stays on the list after he drops off the leaderboards**, which is the whole
  point of following someone. His card shows current season stats with a "not on
  the current leaderboards" note instead of a buy score.
- **follows his own promotions.** Each refresh looks up his current club, so a
  player who moves from Double-A to Triple-A shows the new affiliate, the new
  level, and the right parent organization without you doing anything.
- **still shows his organization and prospect rank**, same as anywhere else.

If he *is* on a leaderboard that session, the card keeps its full buy score,
urgency badge and heating/cooling trend chip.

Storage is `localStorage` under `bs-watchlist-v1`. With sync switched off that
is the whole story: the list survives refreshes and redeploys but stays on one
browser.

### Syncing across computers (optional)

Sync is off until you add two values. Nothing below is required to use the app.

1. **Create a Supabase project** — a free one at
   [supabase.com/dashboard](https://supabase.com/dashboard). Keep it separate
   from any production project; this repo is public.

2. **Create the table** — SQL Editor → New query → paste
   [`supabase/schema.sql`](supabase/schema.sql) → Run. It creates `watchlist`,
   turns on row level security, and adds policies so every row is readable and
   writable only by the user who owns it.

3. **Allow the redirect** — Authentication → URL Configuration → add your
   deployed URL (and `http://localhost:3010` if you preview locally) under
   *Redirect URLs*, or the magic link will bounce.

4. **Paste your keys** into the config block near the bottom of
   `public/index.html`:

   ```html
   window.BS_SUPABASE_URL      = 'https://<project>.supabase.co';
   window.BS_SUPABASE_ANON_KEY = 'eyJ...';
   ```

   Both come from Project Settings → API. Use the **anon/public** key.

Then open the Watchlist tab, enter your email, and click the link Supabase
sends. Do the same on your other computer and both share one list.

**On committing the anon key.** It is meant to live in browsers and is safe in
a public repo *because* of step 2 — RLS is on and every policy compares
`auth.uid()` to the row owner, so someone holding the key while signed out can
read and write nothing. The `service_role` key is the opposite: it bypasses RLS
entirely and must never go in this file.

**How the two layers interact.** localStorage remains the source of truth for
the UI, so the page still works signed out and offline. When a session exists,
each star also writes through to Supabase; on sign-in anything saved locally is
merged up first, then the account's list becomes the truth. Sign out and you
simply fall back to the local list.

## Data sources

**Stats and parent organizations — MLB Stats API (`statsapi.mlb.com`), live.**
No key required and it sends `Access-Control-Allow-Origin: *`, so the page works
opened straight off disk as well as served. Affiliates carry `parentOrgName` /
`parentOrgId`, so one `/teams?sportIds=1,11,12,13,14` call maps every minor
league club to the organization above it.

**Prospect rankings — MLB Pipeline club Top 30s, refreshed by script.**
There is no public rankings endpoint, so `update-prospects.mjs` reads all 30
club pages at `mlb.com/milb/prospects/<club>` and pulls rank + MLBAM player id
out of the data embedded in each page. That id is the same one the Stats API
returns, so the join is exact — no name matching, no accent or suffix problems.

Using the club Top 30s rather than the Top 100 matters: most players who show up
on these leaderboards are ranked by their organization but nowhere near the
overall Top 100.

## Refreshing the rankings

```
node update-prospects.mjs
```

Takes about 15 seconds and needs Node 18+ (no dependencies). It writes the
rankings twice:

1. `public/prospects.json` — fetched at runtime when the page is served
2. an inline copy inside `public/index.html`, between the
   `<!-- PROSPECT-RANKINGS:START/END -->` markers, so ranks still show when the
   file is opened directly from disk

The page reads the inline copy immediately, then prefers `prospects.json` when
it is newer. The line under the filters shows when the ranks were last pulled.

If more than half the clubs fail to fetch, the script refuses to overwrite the
existing rankings rather than publishing a half-empty file. If the target file
is locked (Dropbox syncing, a local `serve` holding it), it retries, then writes
`<name>.new` and says so rather than reporting a success that did not happen.

Pipeline re-ranks roughly monthly in season plus a large preseason refresh, so
running this monthly is enough.

## Local preview

```
npx serve public -l 3010
```
