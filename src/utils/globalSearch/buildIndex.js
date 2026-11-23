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
import { normalizeCrosswalkTeamId } from '../espnNflScoreboard.js';
import { KIND_APP_VIEW, KIND_COMMAND, KIND_NFL_TEAM } from './entities/record.js';
import { buildAppViewRecords } from './entities/appViews.js';
import { buildCommandRecords } from './entities/commands.js';
import { buildFantasyTeamRecords } from './entities/fantasyTeams.js';
import { buildGameRecords, buildWeekRecords } from './entities/games.js';
import { buildNflTeamRecords } from './entities/nflTeams.js';
import { buildPlayerRecords } from './entities/players.js';

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

// Destinations and commands that only mean something with a connected league.
// The static artifact is built without knowing about leagues, so these are
// filtered at runtime. Scout, Statistics, Predictions, and the theme/display
// commands need no league and always stay.
const LEAGUE_VIEW_SECTIONS = new Set(['Fantasy', 'League', 'Trade', 'Draft']);
const LEAGUE_COMMAND_IDS = new Set(['league.switch']);
// The mirror image: only useful before a league is connected.
const NO_LEAGUE_COMMAND_IDS = new Set(['league.connect']);

export function isLeagueDependentRecord(record) {
  if (record?.kind === KIND_APP_VIEW) return LEAGUE_VIEW_SECTIONS.has(record.meta?.section);
  if (record?.kind === KIND_COMMAND) return LEAGUE_COMMAND_IDS.has(record.command);
  return false;
}

/**
 * The static slice as it should be searched: league-only records dropped when no
 * league is connected, and the connect command dropped once one is.
 */
export function filterStaticRecordsForLeague(records = [], hasLeague = false) {
  if (!hasLeague) return records.filter((record) => !isLeagueDependentRecord(record));
  return records.filter((record) => !(record.kind === KIND_COMMAND && NO_LEAGUE_COMMAND_IDS.has(record.command)));
}

/**
 * Compose every slice into a single searchable index.
 *
 * Slices are kept separate by the caller so one can be replaced — the live
 * player slice superseding the static one — without rebuilding the others.
 */
export function composeIndex({ staticRecords = [], playerRecords = [], leagueRecords = [] } = {}) {
  const teams = new Map(staticRecords.filter((record) => record.kind === KIND_NFL_TEAM)
    .map((record) => [normalizeCrosswalkTeamId(record.meta.teamId), record]));
  const players = playerRecords.map((record) => {
    if (record.meta?.position !== 'DEF') return record;
    const teamId = normalizeCrosswalkTeamId(record.meta.team);
    const team = teams.get(teamId);
    teams.delete(teamId);
    if (!team || record.meta.team === team.meta.teamId) return record;
    return { ...record, meta: { ...record.meta, team: team.meta.teamId } };
  });
  // A static-only build or a partial directory still has all NFL teams.
  const missingDefenses = buildPlayerRecords(Object.fromEntries(
    [...teams].map(([id, team]) => [id, {
      full_name: team.label,
      team: team.meta.teamId,
      position: 'DEF',
    }]),
  ));
  return createIndex([...staticRecords, ...players, ...missingDefenses, ...leagueRecords]);
}
