#!/usr/bin/env node
/**
 * update-prospects.mjs
 * ---------------------------------------------------------------
 * Pulls every MLB club's Top 30 prospect list from MLB Pipeline
 * (www.mlb.com/milb/prospects/<club>) and writes the rankings to:
 *
 *   1. prospects.json                 - fetched at runtime by the dashboard
 *   2. baseball-scout.html            - the same JSON injected inline, so the
 *                                       page still shows ranks when opened
 *                                       straight off disk (file://)
 *
 * Rankings are keyed by MLBAM player id, which is the same id the MLB Stats
 * API returns for the batting leaders the dashboard already pulls - so the
 * join is exact, no name matching.
 *
 * Run it whenever Pipeline publishes new rankings:
 *   node update-prospects.mjs
 *
 * Requires Node 18+ (uses global fetch). No dependencies.
 */

import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* Works both in the source folder (baseball-scout.html) and in the deployed
   project the setup script builds (public/index.html). */
async function locateDashboard() {
  const candidates = [
    join(HERE, 'baseball-scout.html'),
    join(HERE, 'public', 'index.html'),
    join(HERE, 'index.html'),
  ];
  for (const c of candidates) {
    try { await access(c); return c; } catch { /* next */ }
  }
  return null;
}

/* mlb.com club slug -> abbreviation shown on the card */
const CLUBS = [
  ['dbacks',    'ARI', 'Arizona Diamondbacks'],
  ['athletics', 'ATH', 'Athletics'],
  ['braves',    'ATL', 'Atlanta Braves'],
  ['orioles',   'BAL', 'Baltimore Orioles'],
  ['redsox',    'BOS', 'Boston Red Sox'],
  ['cubs',      'CHC', 'Chicago Cubs'],
  ['whitesox',  'CWS', 'Chicago White Sox'],
  ['reds',      'CIN', 'Cincinnati Reds'],
  ['guardians', 'CLE', 'Cleveland Guardians'],
  ['rockies',   'COL', 'Colorado Rockies'],
  ['tigers',    'DET', 'Detroit Tigers'],
  ['astros',    'HOU', 'Houston Astros'],
  ['royals',    'KC',  'Kansas City Royals'],
  ['angels',    'LAA', 'Los Angeles Angels'],
  ['dodgers',   'LAD', 'Los Angeles Dodgers'],
  ['marlins',   'MIA', 'Miami Marlins'],
  ['brewers',   'MIL', 'Milwaukee Brewers'],
  ['twins',     'MIN', 'Minnesota Twins'],
  ['mets',      'NYM', 'New York Mets'],
  ['yankees',   'NYY', 'New York Yankees'],
  ['phillies',  'PHI', 'Philadelphia Phillies'],
  ['pirates',   'PIT', 'Pittsburgh Pirates'],
  ['padres',    'SD',  'San Diego Padres'],
  ['mariners',  'SEA', 'Seattle Mariners'],
  ['giants',    'SF',  'San Francisco Giants'],
  ['cardinals', 'STL', 'St. Louis Cardinals'],
  ['rays',      'TB',  'Tampa Bay Rays'],
  ['rangers',   'TEX', 'Texas Rangers'],
  ['bluejays',  'TOR', 'Toronto Blue Jays'],
  ['nationals', 'WSH', 'Washington Nationals'],
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/* The club page ships its data as an HTML-escaped Apollo cache blob. */
function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, '=')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const RANK_RE =
  /"RankedPlayerEntity","rank":(\d+),"playerEntity":\{.*?"player":\{"__ref":"Person:(\d+)"\}/g;

async function fetchClub(slug) {
  const url = `https://www.mlb.com/milb/prospects/${slug}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Entities are double-escaped inside the embedded blob.
  const html = unescapeHtml(unescapeHtml(await res.text()));

  const out = [];
  RANK_RE.lastIndex = 0;
  let m;
  while ((m = RANK_RE.exec(html)) !== null) {
    out.push({ rank: Number(m[1]), id: Number(m[2]) });
  }
  return out;
}

/* Small concurrency pool so we do not hammer mlb.com. */
async function mapPool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

async function main() {
  console.log('Fetching Top 30 lists for 30 clubs from MLB Pipeline...\n');

  const ranks = {};
  const failures = [];
  let season = new Date().getFullYear();

  await mapPool(CLUBS, 5, async ([slug, abbr, name]) => {
    try {
      const list = await fetchClub(slug);
      if (!list.length) throw new Error('no ranked players found in page');
      for (const { rank, id } of list) {
        // A player appears on exactly one club list; keep the best rank if
        // Pipeline ever double-lists someone mid-trade.
        if (!ranks[id] || rank < ranks[id].r) ranks[id] = { r: rank, o: abbr };
      }
      console.log(`  OK   ${abbr.padEnd(3)} ${String(list.length).padStart(2)} prospects  (${name})`);
    } catch (err) {
      failures.push(`${abbr} (${slug}): ${err.message}`);
      console.log(`  FAIL ${abbr.padEnd(3)} ${err.message}  (${name})`);
    }
  });

  const clubsOk = CLUBS.length - failures.length;
  const count = Object.keys(ranks).length;

  console.log(`\n${clubsOk}/${CLUBS.length} clubs, ${count} ranked prospects.`);

  if (clubsOk < CLUBS.length / 2) {
    console.error('\nToo many clubs failed - refusing to overwrite existing rankings.');
    failures.forEach(f => console.error('  ' + f));
    process.exitCode = 1;
    return;
  }

  const payload = {
    source: 'MLB Pipeline - mlb.com/milb/prospects',
    season,
    updated: new Date().toISOString(),
    clubs: clubsOk,
    count,
    ranks,
  };

  const json = JSON.stringify(payload);

  const htmlFile = await locateDashboard();
  if (!htmlFile) {
    console.error('\nCould not find the dashboard (baseball-scout.html or ' +
                  'public/index.html) next to this script.');
    process.exitCode = 1;
    return;
  }

  // 1. standalone JSON, served from the same folder as the dashboard
  const jsonFile = join(dirname(htmlFile), 'prospects.json');
  reportWrite(await writeAtomic(jsonFile, json + '\n'), jsonFile, 'Wrote');

  // 2. inline copy inside the dashboard, between the marker comments
  let html = await readFile(htmlFile, 'utf8');
  const START = '<!-- PROSPECT-RANKINGS:START -->';
  const END = '<!-- PROSPECT-RANKINGS:END -->';
  const si = html.indexOf(START);
  const ei = html.indexOf(END);
  if (si === -1 || ei === -1) {
    console.warn(`\nCould not find the ${START} / ${END} markers in ${htmlFile} - ` +
                 'skipped the inline update (prospects.json is still current).');
  } else {
    const block =
      `${START}\n<script id="prospect-rankings" type="application/json">` +
      `${json}</script>\n${END}`;
    html = html.slice(0, si) + block + html.slice(ei + END.length);
    reportWrite(await writeAtomic(htmlFile, html), htmlFile,
                'Updated inline rankings in');
  }

  if (failures.length) {
    console.log('\nClubs that failed (their prospects keep the previous ranks ' +
                'only in the file you just replaced - re-run to pick them up):');
    failures.forEach(f => console.log('  ' + f));
  }
}

/* Write to a temp file then swap, so a crash never leaves a half-written file.
   Returns the path actually written - which is NOT the target when the target
   was locked, so callers must report that path rather than assume success. */
async function writeAtomic(target, contents) {
  const tmp = target + '.tmp';
  await writeFile(tmp, contents, 'utf8');

  // Everything here lives in Dropbox, and a local `serve` may be holding the
  // dashboard open, so a lock is usually transient - give it a few tries.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, target);
      return target;
    } catch (err) {
      const locked = err.code === 'EPERM' || err.code === 'EBUSY' ||
                     err.code === 'EACCES';
      if (!locked) throw err;
      if (attempt >= 3) {
        const alt = target + '.new';
        await rename(tmp, alt);
        return alt;
      }
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
}

/* Report where a write landed, loudly if it could not land on the target. */
function reportWrite(written, target, what) {
  if (written === target) {
    console.log(`${what} ${target}`);
  } else {
    console.warn(`\n!! ${target} is locked (open in an editor, or Dropbox is ` +
                 `syncing it).\n   Wrote ${written} instead - rename it over ` +
                 `the original to apply.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
