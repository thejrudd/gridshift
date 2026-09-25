// Generates the static search index precached by the service worker.
//
// Global search must work on a first-ever offline launch, before any live data
// has been fetched. This script bakes the whole searchable corpus — NFL teams,
// the season schedule, app destinations, commands, and the player directory —
// into one artifact that ships with the build.
//
// The player slice goes stale between deploys, which is fine: it is the offline
// fallback. Once the app has live player data it rebuilds that slice and
// supersedes this one.
//
// Usage:
//   node scripts/build-search-index.mjs            build, fetching players
//   node scripts/build-search-index.mjs --offline  skip the fetch (static only)

import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStaticRecords } from '../src/utils/globalSearch/buildIndex.js';
import { buildPlayerRecords, packPlayerRecords } from '../src/utils/globalSearch/entities/players.js';
import { formatPlayerHeight, formatPlayerWeight } from '../src/utils/playerMeasurements.js';
import { normalizePlayerName } from '../src/utils/playerDrilldown.js';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const outputPath = resolve(root, 'public/search-index.v1.json');

const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const ESPN_ROSTER_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';
const FETCH_TIMEOUT_MS = 60_000;

// Sleeper's directory carries an ESPN id for only about a third of players, and
// the statistics player page is keyed on that id. Filling the gap here means a
// search result opens immediately instead of paying for a roster lookup at click
// time. The runtime fallback in resolveRoute.js still covers whatever is missed.
const TEAM_ESPN_SLUG = { WAS: 'wsh' };
const espnSlugFor = (team) => TEAM_ESPN_SLUG[team] ?? team.toLowerCase();

// The whole point of this artifact is that it is cheap to precache. If it grows
// past this, something is being indexed that should not be.
const MAX_RAW_BYTES = 600 * 1024;

const offline = process.argv.includes('--offline');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function fetchSleeperPlayers() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(SLEEPER_PLAYERS_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchEspnRoster(team) {
  const response = await fetch(`${ESPN_ROSTER_BASE}/${espnSlugFor(team)}/roster`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  return (json.athletes ?? []).flatMap((group) => group.items ?? []);
}

/**
 * Fill missing ESPN ids and measurements by matching each team's roster on normalized name.
 *
 * Uses the same normalizer the app matches with, so an id found here and an id
 * found at runtime agree. Same-name teammates are separated by position.
 */
async function enrichPlayerRecordsFromEspnRoster(records) {
  const missingByTeam = new Map();
  for (const record of records) {
    const missingId = !record.meta?.espnId;
    const missingMeasurements = !record.meta?.height || !record.meta?.weight;
    if ((!missingId && !missingMeasurements) || !record.meta?.team) continue;
    const bucket = missingByTeam.get(record.meta.team);
    if (bucket) bucket.push(record);
    else missingByTeam.set(record.meta.team, [record]);
  }
  if (!missingByTeam.size) return 0;

  let filled = 0;
  const teams = [...missingByTeam.keys()];
  const rosters = await Promise.all(teams.map(async (team) => {
    try {
      return [team, await fetchEspnRoster(team)];
    } catch {
      return [team, null];
    }
  }));

  for (const [team, roster] of rosters) {
    if (!roster?.length) continue;
    const byName = new Map();
    for (const athlete of roster) {
      const name = normalizePlayerName(athlete.displayName ?? athlete.fullName ?? '');
      if (!name || athlete.id == null) continue;
      const bucket = byName.get(name);
      if (bucket) bucket.push(athlete);
      else byName.set(name, [athlete]);
    }

    for (const record of missingByTeam.get(team) ?? []) {
      const candidates = byName.get(normalizePlayerName(record.label));
      if (!candidates?.length) continue;
      const position = String(record.meta.position ?? '').toUpperCase();
      const match = candidates.length === 1
        ? candidates[0]
        : candidates.find((a) => String(a.position?.abbreviation ?? '').toUpperCase() === position)
          ?? candidates[0];
      if (!record.meta.espnId) {
        record.meta.espnId = String(match.id);
        filled += 1;
      }
      record.meta.height ??= formatPlayerHeight(match.displayHeight ?? match.height);
      record.meta.weight ??= formatPlayerWeight(match.displayWeight ?? match.weight);
    }
  }

  return filled;
}

async function main() {
  const scheduleData = readJson('public/nfl-data-2026.json');
  const seasonSchedule = readJson('public/season-schedule.json');

  const staticRecords = buildStaticRecords({ scheduleData, seasonSchedule });
  let playerRecords = [];

  if (offline) {
    console.log('Skipping the player directory fetch (--offline).');
  } else {
    try {
      const players = await fetchSleeperPlayers();
      playerRecords = buildPlayerRecords(players);
      console.log(`Indexed ${playerRecords.length} players from ${Object.keys(players).length} directory entries.`);

      const before = playerRecords.filter((record) => record.meta?.espnId).length;
      const filled = await enrichPlayerRecordsFromEspnRoster(playerRecords);
      const after = before + filled;
      console.log(
        `ESPN ids: ${before} from Sleeper, +${filled} from rosters = ${after}`
        + ` (${((after / playerRecords.length) * 100).toFixed(0)}% open without a lookup).`,
      );
    } catch (error) {
      // A build should not fail because a third-party directory is unreachable.
      // Search still works from the static slice, and the app rebuilds the
      // player slice from live data on first use.
      console.warn(`Could not fetch the player directory (${error.message}). Building the static slice only.`);
    }
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    season: seasonSchedule.season ?? scheduleData.season ?? null,
    staticRecords,
    // Packed tuples, not full records: see packPlayerRecords. The app expands
    // them with unpackPlayerRecords on load.
    packedPlayers: packPlayerRecords(playerRecords),
  };

  const json = JSON.stringify(payload);
  const rawBytes = Buffer.byteLength(json);
  const gzipBytes = gzipSync(json).length;

  console.log(
    `Records: ${staticRecords.length} static + ${playerRecords.length} players = `
    + `${staticRecords.length + playerRecords.length}`,
  );
  console.log(`Size: ${formatBytes(rawBytes)} raw, ${formatBytes(gzipBytes)} gzipped.`);

  if (rawBytes > MAX_RAW_BYTES) {
    console.error(
      `Search index is ${formatBytes(rawBytes)}, over the ${formatBytes(MAX_RAW_BYTES)} ceiling. `
      + 'Narrow what is indexed rather than raising the ceiling.',
    );
    process.exit(1);
  }

  writeFileSync(outputPath, json);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
