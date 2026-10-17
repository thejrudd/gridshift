// /api/statistics/players — data for the Statistics player dashboard.
//
//   GET /pools?season=2026&group=QB
//     League rank pools and team-week offense lines built from Sleeper's public
//     weekly stats. Finished weeks are cached for the life of the process; the
//     current week refreshes every 15 minutes.
//
//   GET /season?season=2026&team=BUF&name=Josh%20Allen&position=QB&sleeperId=4984
//     One player's finished regular-season games: box line, team stats, win
//     probability, and every play he was credited on, attributed through the
//     Fantasy Live play path. Built from Statistics Scores game details, so it
//     shares the BALLDONTLIE gateway, its rate limits, and its play snapshots.
//     A finished game's result is cached and never rebuilt.

import express from 'express';
import process from 'node:process';
import { buildLeaguePools, compactWeekRows, DASHBOARD_GROUPS, selectGroupPools } from '../src/utils/playerSeason/leaguePools.js';
import { buildPlayerGame, identityName, pickReferencedPeople } from '../src/utils/playerSeason/playerSeasonGames.js';
import { positionGroup } from '../src/utils/playerMetrics.js';
import { getTeamAbbr, normalizeName } from '../src/utils/liveScoringFeed.js';
import {
  fetchStatisticsScoresGameDetail,
  fetchStatisticsScoresGames,
} from './statisticsScoresHandlers.js';

const SLEEPER_STATS_BASE = 'https://api.sleeper.com/stats/nfl';
const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
const REGULAR_SEASON_WEEKS = 18;
const CURRENT_WEEK_TTL_MS = 15 * 60_000;
const STATE_TTL_MS = 10 * 60_000;
const MAX_GAME_ENTRIES = 600;
const DETAIL_CONCURRENCY = 3;
const WEEK_CONCURRENCY = 4;
const MIN_SEASON = 2022;

const isFinal = (game) => /^final/i.test(String(game?.status ?? ''));

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseSeason(value) {
  const season = Number.parseInt(String(value ?? ''), 10);
  const latest = new Date().getUTCFullYear() + 1;
  if (!Number.isInteger(season) || season < MIN_SEASON || season > latest) {
    throw badRequest(`A season from ${MIN_SEASON} on is required.`);
  }
  return season;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createPlayerSeasonService({
  fetchImpl = globalThis.fetch,
  gateway,
  snapshotStore,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const weekCache = new Map(); // `${season}:${week}` -> { rows, fetchedAt, final }
  const poolCache = new Map(); // season -> { key, pools }
  const gameCache = new Map(); // `${gameId}|${team}|${name}` -> built game (finished games only)
  const inFlight = new Map();
  let nflState = null;

  async function getJson(url) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response?.ok) {
      const error = new Error(`Sleeper stats request failed: ${response?.status ?? 'network'}`);
      error.statusCode = 502;
      throw error;
    }
    return response.json();
  }

  function coalesce(key, task) {
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = task().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  async function getNflState() {
    if (nflState && now() - nflState.fetchedAt < STATE_TTL_MS) return nflState.value;
    try {
      const value = await getJson(SLEEPER_STATE_URL);
      nflState = { value, fetchedAt: now() };
      return value;
    } catch (error) {
      if (nflState) return nflState.value;
      throw error;
    }
  }

  // Weeks of the season that have stats: every week of a past season, and up
  // to the current week (inclusive, so games already played this week count).
  async function seasonWeeks(season) {
    const state = await getNflState();
    const stateSeason = Number(state?.season);
    if (season < stateSeason) return { weeks: REGULAR_SEASON_WEEKS, current: null };
    if (season > stateSeason) return { weeks: 0, current: null };
    const week = String(state?.season_type) === 'regular' ? Number(state?.week) || 0 : (String(state?.season_type) === 'post' ? REGULAR_SEASON_WEEKS : 0);
    return { weeks: Math.min(REGULAR_SEASON_WEEKS, week), current: String(state?.season_type) === 'regular' ? week : null };
  }

  async function getWeekRows(season, week, isCurrent) {
    const key = `${season}:${week}`;
    const cached = weekCache.get(key);
    if (cached && (cached.final || now() - cached.fetchedAt < CURRENT_WEEK_TTL_MS)) return cached.rows;
    return coalesce(`week:${key}`, async () => {
      try {
        const raw = await getJson(`${SLEEPER_STATS_BASE}/${season}/${week}?season_type=regular`);
        const rows = compactWeekRows(Array.isArray(raw) ? raw : []);
        weekCache.set(key, { rows, fetchedAt: now(), final: !isCurrent });
        return rows;
      } catch (error) {
        if (cached) return cached.rows;
        throw error;
      }
    });
  }

  async function getSeasonWeeks(season) {
    const { weeks, current } = await seasonWeeks(season);
    const list = Array.from({ length: weeks }, (_, index) => index + 1);
    const rows = await mapWithConcurrency(list, WEEK_CONCURRENCY, (week) => getWeekRows(season, week, week === current));
    return list.map((week, index) => ({ week, rows: rows[index] }));
  }

  async function getPools(season) {
    const weeks = await getSeasonWeeks(season);
    const key = weeks.map(({ week }) => `${week}:${weekCache.get(`${season}:${week}`)?.fetchedAt ?? 0}`).join(',');
    const cached = poolCache.get(season);
    if (cached?.key === key) return cached.pools;
    const pools = buildLeaguePools(weeks);
    poolCache.set(season, { key, pools });
    return pools;
  }

  function rememberGame(key, value) {
    gameCache.set(key, value);
    while (gameCache.size > MAX_GAME_ENTRIES) gameCache.delete(gameCache.keys().next().value);
  }

  async function getPlayerSeason({ season, team, name, position, sleeperId }) {
    const requestedTeam = getTeamAbbr(team);
    // Sleeper's weekly rows say which team he played for each week, which covers
    // past seasons on another team and mid-season trades.
    const weeks = await getSeasonWeeks(season).catch(() => []);
    // Without a Sleeper ID from the browser, find him by name on the requested
    // team, then by name in the same position group.
    let resolvedSleeperId = sleeperId;
    if (!resolvedSleeperId) {
      const want = identityName(name);
      const candidates = weeks.flatMap(({ rows }) => rows)
        .filter((row) => identityName(`${row.player.first_name} ${row.player.last_name}`) === want);
      const match = candidates.find((row) => getTeamAbbr(row.team) === requestedTeam)
        ?? candidates.find((row) => positionGroup(row.player.position) === positionGroup(position));
      resolvedSleeperId = match?.player_id ?? null;
    }
    const rowsByWeek = new Map(weeks.map(({ week, rows }) => [week, resolvedSleeperId ? rows.find((row) => row.player_id === String(resolvedSleeperId)) ?? null : null]));
    const sleeperPosition = [...rowsByWeek.values()].find(Boolean)?.player.position ?? null;
    const teamByWeek = new Map([...rowsByWeek].filter(([, row]) => row?.team).map(([week, row]) => [week, getTeamAbbr(row.team)]));
    const seasonTeams = new Set(teamByWeek.size ? teamByWeek.values() : [requestedTeam]);
    const teamFor = (game) => teamByWeek.get(Number(game.week)) ?? (teamByWeek.size ? null : requestedTeam);

    const gamesPayload = await fetchStatisticsScoresGames({ season, phase: 'regular', gateway, env });
    const teamGames = (gamesPayload.games ?? [])
      .filter((game) => {
        const sides = [game.home_team?.abbreviation, game.visitor_team?.abbreviation].map(getTeamAbbr);
        const weekTeam = teamFor(game);
        return weekTeam ? sides.includes(weekTeam) : (!isFinal(game) && sides.some((side) => seasonTeams.has(side)));
      })
      .sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const finals = teamGames.filter(isFinal);

    const built = await mapWithConcurrency(finals, DETAIL_CONCURRENCY, async (game) => {
      const gameTeam = teamFor(game);
      const subject = { name, team: gameTeam, position };
      const key = `${game.id}|${gameTeam}|${normalizeName(name)}`;
      if (gameCache.has(key)) return gameCache.get(key);
      return coalesce(`game:${key}`, async () => {
        const detail = await fetchStatisticsScoresGameDetail({ gameId: game.id, phase: 'regular', gateway, env, snapshotStore });
        const result = buildPlayerGame(detail, subject);
        // A game whose plays have not landed yet is not cached, so a retry can fill it in.
        if (result) result.game.team = gameTeam;
        if (result && detail.coverage?.plays) rememberGame(key, result);
        return result;
      });
    });

    const results = built.filter(Boolean);
    const people = Object.assign({}, ...results.map((result) => result.people));
    const games = results.map((result) => result.game);
    const subjectRow = results.find((result) => result.subjectId != null);

    // Per-game snap counts from the same Sleeper weekly rows the pools use.
    for (const game of games) {
      const stats = rowsByWeek.get(Number(game.week))?.stats;
      if (!stats) continue;
      game.snaps = {
        off: stats.off_snp ?? null,
        teamOff: stats.tm_off_snp ?? null,
        def: stats.def_snp ?? null,
        teamDef: stats.tm_def_snp ?? null,
      };
    }

    return {
      season,
      team: games.at(-1)?.team ?? requestedTeam,
      subject: subjectRow ? { id: subjectRow.subjectId, ...subjectRow.subjectBio } : null,
      sleeperId: resolvedSleeperId,
      // Rank pools follow Sleeper's position, which can differ from ESPN's (an edge rusher listed as LB).
      rankGroup: sleeperPosition ? positionGroup(sleeperPosition) : null,
      games,
      people: pickReferencedPeople(games, people),
      remaining: teamGames.length - finals.length,
      coverage: { plays: games.some((game) => game.plays.length > 0) },
    };
  }

  return {
    async pools({ season, group }) {
      const parsedSeason = parseSeason(season);
      const parsedGroup = String(group ?? '').toUpperCase();
      if (!DASHBOARD_GROUPS.includes(parsedGroup)) throw badRequest('A dashboard position group is required.');
      const pools = await getPools(parsedSeason);
      return { season: parsedSeason, group: parsedGroup, ...selectGroupPools(pools, parsedGroup) };
    },
    async season(query = {}) {
      const season = parseSeason(query.season);
      const team = String(query.team ?? '').trim();
      const name = String(query.name ?? '').trim();
      const position = String(query.position ?? '').trim().toUpperCase();
      if (!/^[A-Za-z]{2,3}$/.test(team)) throw badRequest('A team abbreviation is required.');
      if (!name || name.length > 80) throw badRequest('A player name is required.');
      if (!/^[A-Z/]{1,4}$/.test(position)) throw badRequest('A position is required.');
      const sleeperId = /^\d{1,8}$/.test(String(query.sleeperId ?? '')) ? String(query.sleeperId) : null;
      return getPlayerSeason({ season, team, name, position, sleeperId });
    },
  };
}

export function createPlayerSeasonRouter(options = {}) {
  const router = express.Router();
  const service = options.service ?? createPlayerSeasonService(options);
  const send = (handler) => async (req, res) => {
    try {
      const payload = await handler(req.query);
      res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      const status = error.statusCode ?? 500;
      res.status(status).set('Cache-Control', 'no-store').json({
        ok: false,
        error: status >= 500 ? 'Player season data is unavailable right now.' : error.message,
      });
    }
  };
  router.get('/pools', send((query) => service.pools(query)));
  router.get('/season', send((query) => service.season(query)));
  return router;
}
