// ── Result to route ────────────────────────────────────────────────────────
// Turns a ranked result into a flat route object for applyRoute.
//
// Most records carry their own route. Players are the exception: the statistics
// player page is keyed on an ESPN id, and Sleeper supplies one for only about a
// third of the directory, so the rest need a lookup.
//
// That lookup runs off the record itself — team, name, position — and never off
// the Sleeper player map. The map is only populated once the app has downloaded
// the multi-megabyte directory for its own reasons, so depending on it made a
// search result a silent no-op for most players.

import { slugifyRouteSegment } from '../appRoutes.js';
import { fetchRoster } from '../playerApi.js';
import {
  buildStatisticsPlayerMeta,
  findRosterMatchForSleeperPlayer,
} from '../playerDrilldown.js';
import { KIND_GAME, KIND_PLAYER } from './entities/record.js';

/**
 * Build the statistics route for a player, given resolved metadata.
 */
export function routeForPlayerMeta(playerMeta, { mode = 'game' } = {}) {
  if (!playerMeta?.id) return null;
  return {
    activeTab: 'statistics',
    statisticsView: 'player',
    statisticsPlayerId: String(playerMeta.id),
    statisticsPlayerSlug: slugifyRouteSegment(playerMeta.displayName ?? ''),
    statisticsMode: mode,
  };
}

function metaFromEspnId(record, espnId) {
  const { sleeperId, team, position, jersey } = record.meta ?? {};
  return buildStatisticsPlayerMeta({}, {
    id: String(espnId),
    espnId: String(espnId),
    sleeperId: sleeperId ?? undefined,
    displayName: record.label,
    teamId: team ?? null,
    position: position ?? '',
    jersey: jersey ?? '',
  });
}

/**
 * Find a player's ESPN id from their team's roster.
 *
 * Reuses findRosterMatchForSleeperPlayer, which already handles accents,
 * generational suffixes, and same-name teammates at different positions. It
 * takes a Sleeper-shaped player, so the record is adapted to that shape rather
 * than the matching rules being reimplemented here.
 */
async function lookupEspnIdFromRoster(record, { rosterFetcher = fetchRoster } = {}) {
  const team = record.meta?.team;
  if (!team || typeof rosterFetcher !== 'function') return null;

  try {
    const roster = await rosterFetcher(team);
    const match = findRosterMatchForSleeperPlayer(
      { full_name: record.label, position: record.meta?.position ?? '' },
      roster ?? [],
    );
    return match?.id != null ? String(match.id) : null;
  } catch {
    return null;
  }
}

/**
 * Where a game result opens.
 *
 * The index is static, so whether a game has been played is decided here, at
 * click time, from its kickoff. A game that has kicked off — live or final —
 * opens its Scores page. An upcoming game opens its Statistics Schedule
 * matchup drill-in, keeping the named team's schedule when the query names a
 * team and otherwise opening the matching week.
 */
export function routeForGameResult(entry, { now = Date.now() } = {}) {
  const record = entry.record;
  const fallback = entry.route ?? record.route ?? null;
  const { kickoff, espnEventId, season, week, awayTeam, homeTeam } = record.meta ?? {};
  if (record.meta?.isWeekIndex) return fallback;

  const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;
  if (Number.isFinite(kickoffMs) && kickoffMs <= now) {
    if (!espnEventId) return fallback;
    return {
      activeTab: 'statistics',
      statisticsView: 'scores',
      statisticsScoresSeason: season ?? null,
      statisticsScoresPhase: 'regular',
      statisticsScoresWeek: week ?? null,
      statisticsScoresGameId: String(espnEventId),
      statisticsScoresSection: 'overview',
      statisticsScoresAwayTeamId: awayTeam ?? null,
      statisticsScoresHomeTeamId: homeTeam ?? null,
    };
  }

  if (!Number.isFinite(kickoffMs)) return fallback;
  const gameId = espnEventId ?? record.id;
  if (!gameId) return fallback;
  const teamId = [awayTeam, homeTeam].includes(entry.focusTeamId) ? entry.focusTeamId : null;
  if (!teamId) {
    return {
      activeTab: 'statistics',
      statisticsView: 'schedule',
      statisticsScheduleMode: 'week',
      statisticsScheduleWeek: week ?? null,
      statisticsScheduleGameId: String(gameId),
    };
  }
  return {
    activeTab: 'statistics',
    statisticsView: 'schedule',
    statisticsScheduleMode: 'team',
    statisticsScheduleTeamId: teamId,
    statisticsScheduleGameId: String(gameId),
  };
}

/**
 * Resolve the route for a result.
 *
 * Returns `{ route, playerMeta, reason }`. `playerMeta` is non-null for player
 * results so the caller can hand it to App's back-chip history state, matching
 * what navigateToStatisticsPlayer does today. `reason` names why a route could
 * not be built, so the caller can tell the user instead of doing nothing.
 *
 * Synchronous for records that carry a route and for players whose ESPN id the
 * index already knows.
 */
export async function resolveResultRoute(entry, {
  mode = 'game',
  rosterFetcher = fetchRoster,
  now = Date.now(),
} = {}) {
  const record = entry?.record;
  if (!record) return { route: null, playerMeta: null, reason: 'no-record' };

  if (record.kind === KIND_GAME) {
    const route = routeForGameResult(entry, { now });
    return { route, playerMeta: null, reason: route ? null : 'no-route' };
  }

  if (record.kind !== KIND_PLAYER) {
    const route = entry.route ?? record.route ?? null;
    return { route, playerMeta: null, reason: route ? null : 'no-route' };
  }

  // The fast path: the index already knows the ESPN id, so no lookup at all.
  const knownEspnId = record.meta?.espnId;
  if (knownEspnId) {
    const playerMeta = metaFromEspnId(record, knownEspnId);
    return { route: routeForPlayerMeta(playerMeta, { mode }), playerMeta, reason: null };
  }

  const espnId = await lookupEspnIdFromRoster(record, { rosterFetcher });
  if (!espnId) {
    return { route: null, playerMeta: null, reason: 'no-espn-id' };
  }

  const playerMeta = metaFromEspnId(record, espnId);
  return { route: routeForPlayerMeta(playerMeta, { mode }), playerMeta, reason: null };
}
