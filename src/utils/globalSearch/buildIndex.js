// ── Search index assembly ──────────────────────────────────────────────────
// Composes the entity adapters into one record array, and builds the token
// index over it.
//
// Two build paths share this module:
//   • scripts/build-search-index.mjs, producing the static precached artifact
//   • the runtime, rebuilding the player slice once live data is in hand
//
// Both must produce the same record shape, so the runtime can swap one slice
// without rebuilding the rest.

import { createIndex } from './tokenIndex.js';
import { buildAppViewRecords } from './entities/appViews.js';
import { buildCommandRecords } from './entities/commands.js';
import { buildFantasyTeamRecords } from './entities/fantasyTeams.js';
import { buildGameRecords, buildWeekRecords } from './entities/games.js';
import { buildNflTeamRecords } from './entities/nflTeams.js';

export const SEARCH_INDEX_VERSION = 1;

/**
 * Records that never depend on a connected league or live player data. These are
 * what the build-time artifact holds, and what search falls back to offline.
 */
export function buildStaticRecords({ scheduleData = {}, seasonSchedule = {} } = {}) {
  return [
    ...buildNflTeamRecords(scheduleData),
    ...buildWeekRecords(seasonSchedule),
    ...buildGameRecords(seasonSchedule, scheduleData),
    ...buildAppViewRecords(),
    ...buildCommandRecords(),
  ];
}

/**
 * Records that depend on the connected league. Rebuilt whenever rosters change;
 * cheap enough that no caching is warranted.
 */
export function buildLeagueRecords(league = {}) {
  return buildFantasyTeamRecords(league);
}

/**
 * Compose every slice into a single searchable index.
 *
 * Slices are kept separate by the caller so one can be replaced — the live
 * player slice superseding the static one — without rebuilding the others.
 */
export function composeIndex({ staticRecords = [], playerRecords = [], leagueRecords = [] } = {}) {
  return createIndex([...staticRecords, ...playerRecords, ...leagueRecords]);
}
