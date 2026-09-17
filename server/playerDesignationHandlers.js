import express from 'express';
import process from 'node:process';
import { createBalldontlieGateway } from './balldontlieGateway.js';

const PLAYER_DESIGNATIONS_PATH = '/nfl/v1/player_designations';
const NFL_TEAMS_PATH = '/nfl/v1/teams';
const PLAYER_DESIGNATIONS_PER_PAGE = 100;
export const PLAYER_DESIGNATIONS_MAX_PAGES = 24;
const MAX_PLAYER_DESIGNATION_ROWS = PLAYER_DESIGNATIONS_PER_PAGE * PLAYER_DESIGNATIONS_MAX_PAGES;
const MAX_PRACTICE_REPORTS_PER_PLAYER = 7;
export const PLAYER_DESIGNATIONS_CACHE_TTL_MS = 5 * 60 * 1_000;
export const PLAYER_DESIGNATIONS_STALE_TTL_MS = 24 * 60 * 60 * 1_000;
const NFL_TEAMS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const NFL_TEAMS_STALE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const GATEWAYS_BY_FETCHER = new WeakMap();

const TEAM_CODE_ALIASES = Object.freeze({
  JAC: 'JAX',
  KAN: 'KC',
  LVR: 'LV',
  NEP: 'NE',
  NOR: 'NO',
  SFO: 'SF',
  TAM: 'TB',
  WSH: 'WAS',
});

export const PLAYER_DESIGNATIONS_SOURCE = Object.freeze({
  provider: 'balldontlie',
  providerLabel: 'BALLDONTLIE',
  dataset: 'player-designations',
});

function parseSeason(value) {
  const season = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(season) && season >= 2002 && season <= 2100 ? season : null;
}

function parseWeek(value) {
  const week = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
}

function parseQueryInteger(value, pattern, parser) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return null;
  const raw = String(value ?? '').trim();
  return pattern.test(raw) ? parser(raw) : null;
}

function canonicalTeamCode(value) {
  const team = String(value ?? '').trim().toUpperCase();
  return TEAM_CODE_ALIASES[team] ?? team;
}

function parseTeamCodes(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return null;
  const rawTeams = Array.isArray(value) ? value : String(value ?? '').split(',');
  const teams = [...new Set(rawTeams
    .filter((team) => typeof team === 'string')
    .map(canonicalTeamCode)
    .filter((team) => /^[A-Z]{2,3}$/.test(team)))].sort();
  return teams.length > 0 && teams.length <= 32 ? teams : null;
}

function resolveGateway({ gateway, fetcher = fetch, env = process.env } = {}) {
  if (gateway) return gateway;
  let byEnv = GATEWAYS_BY_FETCHER.get(fetcher);
  if (!byEnv) {
    byEnv = new WeakMap();
    GATEWAYS_BY_FETCHER.set(fetcher, byEnv);
  }
  let resolved = byEnv.get(env);
  if (!resolved) {
    resolved = createBalldontlieGateway({ fetcher, env });
    byEnv.set(env, resolved);
  }
  return resolved;
}

function toCompatCache(result) {
  return {
    ...result.cache,
    ageMs: result.freshness.ageMs,
    fetchedAt: result.freshness.providerFetchedAt,
  };
}

function boundedText(value, maxLength = 160) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function pickPlayer(player) {
  if (!player || typeof player !== 'object' || Array.isArray(player)) return null;
  return {
    id: safeInteger(player.id),
    first_name: boundedText(player.first_name, 80),
    last_name: boundedText(player.last_name, 80),
    position: boundedText(player.position, 48),
    position_abbreviation: boundedText(player.position_abbreviation, 8),
  };
}

function pickTeam(team) {
  if (!team || typeof team !== 'object' || Array.isArray(team)) return null;
  return {
    id: safeInteger(team.id),
    abbreviation: boundedText(team.abbreviation, 8),
    name: boundedText(team.name, 80),
    full_name: boundedText(team.full_name, 120),
  };
}

function pickPracticeReports(practiceReports, asOfDate = null) {
  if (!Array.isArray(practiceReports)) return [];
  return practiceReports
    .slice(0, MAX_PRACTICE_REPORTS_PER_PLAYER)
    .map((report) => {
      if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
      const date = boundedText(report.date, 10);
      const status = boundedText(report.status, 48);
      // BDL sometimes publishes the week's future practice placeholders in
      // advance. Treat the provider fetch's UTC calendar date as the
      // snapshot boundary; those placeholders are not completed reports.
      if (asOfDate && date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date > asOfDate) return null;
      return date || status ? { date, status } : null;
    })
    .filter(Boolean);
}

function normalizePlayerDesignation(row, { season, week }, asOfDate = null) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (safeInteger(row.season) !== season || safeInteger(row.week) !== week) return null;

  const designation = {
    id: safeInteger(row.id),
    season,
    week,
    season_type: boundedText(row.season_type, 16),
    game_id: safeInteger(row.game_id),
    player: pickPlayer(row.player),
    team: pickTeam(row.team),
    practice_reports: pickPracticeReports(row.practice_reports, asOfDate),
    injury: boundedText(row.injury, 280),
    game_status: boundedText(row.game_status, 48),
    active: nullableBoolean(row.active),
    starter: nullableBoolean(row.starter),
    did_not_play: nullableBoolean(row.did_not_play),
    updated_at: boundedText(row.updated_at, 64),
  };

  const actionable = Boolean(designation.injury)
    || Boolean(designation.game_status)
    || designation.practice_reports.length > 0
    || designation.active === false
    || designation.did_not_play === true;
  return actionable ? designation : null;
}

export function validatePlayerDesignationsQuery(query = {}) {
  const season = parseQueryInteger(query.season, /^\d{4}$/, parseSeason);
  const week = parseQueryInteger(query.week, /^\d{1,2}$/, parseWeek);
  const teams = parseTeamCodes(query.teams);
  if (!season || !week || !teams) {
    const error = new Error('A valid four-digit NFL season, week 1–18, and one or more NFL teams are required.');
    error.statusCode = 400;
    throw error;
  }
  return { season, week, teams };
}

export function buildPlayerDesignationsParams(season, week, teamIds = []) {
  const params = new URLSearchParams({
    season: String(season),
    week: String(week),
    'season_types[]': '2',
    per_page: String(PLAYER_DESIGNATIONS_PER_PAGE),
  });
  [...new Set(teamIds)].sort((left, right) => left - right)
    .forEach((teamId) => params.append('team_ids[]', String(teamId)));
  return params;
}

async function resolveTeamIds({ teams, gateway }) {
  const directory = await gateway.request({
    path: NFL_TEAMS_PATH,
    params: new URLSearchParams({ per_page: '100' }),
    capability: 'games',
    paginate: true,
    maxPages: 1,
    cacheTtlMs: NFL_TEAMS_CACHE_TTL_MS,
    staleTtlMs: NFL_TEAMS_STALE_TTL_MS,
    refreshAfterMs: NFL_TEAMS_CACHE_TTL_MS,
    freshnessKey: 'nfl-team-directory:v1',
    lane: 'background',
  });
  const requested = new Set(teams);
  const teamIds = Array.isArray(directory.payload?.data)
    ? directory.payload.data
      .map((team) => ({ id: safeInteger(team?.id), code: canonicalTeamCode(team?.abbreviation) }))
      .filter((team) => team.id != null && requested.has(team.code))
      .map((team) => team.id)
    : [];
  return { teamIds: [...new Set(teamIds)].sort((left, right) => left - right), directory };
}

export async function fetchPlayerDesignations({
  season,
  week,
  teams,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const parsed = validatePlayerDesignationsQuery({ season, week, teams });
  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  // Preserve the designation entitlement boundary before reading the public
  // team directory. Otherwise an unentitled account with no matching teams
  // could be reported as an empty successful snapshot.
  if (!resolvedGateway.supports('designations')) {
    await resolvedGateway.request({
      path: PLAYER_DESIGNATIONS_PATH,
      capability: 'designations',
    });
  }
  const { teamIds, directory } = await resolveTeamIds({ teams: parsed.teams, gateway: resolvedGateway });
  if (teamIds.length === 0) {
    return {
      season: parsed.season,
      week: parsed.week,
      data: [],
      meta: { per_page: PLAYER_DESIGNATIONS_PER_PAGE },
      source: { ...PLAYER_DESIGNATIONS_SOURCE },
      cache: toCompatCache(directory),
      freshness: directory.freshness,
      accounting: directory.accounting,
    };
  }
  const result = await resolvedGateway.request({
    path: PLAYER_DESIGNATIONS_PATH,
    params: buildPlayerDesignationsParams(parsed.season, parsed.week, teamIds),
    capability: 'designations',
    paginate: true,
    maxPages: PLAYER_DESIGNATIONS_MAX_PAGES,
    cacheTtlMs: PLAYER_DESIGNATIONS_CACHE_TTL_MS,
    staleTtlMs: PLAYER_DESIGNATIONS_STALE_TTL_MS,
    refreshAfterMs: PLAYER_DESIGNATIONS_CACHE_TTL_MS,
    freshnessKey: `player-designations:v1:${teamIds.join('-')}`,
    lane: 'background',
  });

  const providerFetchedAt = result.freshness?.providerFetchedAt;
  const snapshotDate = providerFetchedAt && !Number.isNaN(Date.parse(providerFetchedAt))
    ? new Date(providerFetchedAt).toISOString().slice(0, 10)
    : null;
  const data = Array.isArray(result.payload?.data)
    ? result.payload.data
      .map((row) => normalizePlayerDesignation(row, parsed, snapshotDate))
      .filter(Boolean)
      .slice(0, MAX_PLAYER_DESIGNATION_ROWS)
    : [];

  return {
    season: parsed.season,
    week: parsed.week,
    data,
    meta: { per_page: PLAYER_DESIGNATIONS_PER_PAGE },
    source: { ...PLAYER_DESIGNATIONS_SOURCE },
    cache: toCompatCache(result),
    freshness: result.freshness,
    accounting: result.accounting,
  };
}

function sendPlayerDesignationsError(res, error) {
  const response = res.status(error?.statusCode ?? 502).set('Cache-Control', 'no-store');
  if (error?.retryAfterMs != null) {
    response.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))));
  }
  const publicMessage = error?.message === 'Statistics Scores is not configured with a server-side BALLDONTLIE API key.'
    ? 'Fantasy Injuries is not configured with a server-side BALLDONTLIE API key.'
    : error?.message;
  return response.json({
    ok: false,
    source: { ...PLAYER_DESIGNATIONS_SOURCE },
    error: publicMessage ?? 'Could not load BALLDONTLIE player designations.',
  });
}

export function createPlayerDesignationsRouter({
  fetcher = fetch,
  env = process.env,
  gateway: injectedGateway,
} = {}) {
  const router = express.Router();
  const gateway = injectedGateway ?? resolveGateway({ fetcher, env });

  router.get('/player-designations', async (req, res) => {
    try {
      const { season, week, teams } = validatePlayerDesignationsQuery(req.query);
      const payload = await fetchPlayerDesignations({ season, week, teams, fetcher, env, gateway });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendPlayerDesignationsError(res, error);
    }
  });

  return router;
}
