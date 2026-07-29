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
