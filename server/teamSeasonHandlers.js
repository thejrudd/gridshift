// /api/statistics/teams — data for the Statistics team dashboard.
//
//   GET /season?season=2026&team=SEA
//     The team's finished regular-season games (box lines, team stats, quarter
//     scores, drive results, scoring plays) built from Statistics Scores game
//     details, its remaining schedule, every team's record, and league unit
//     ranks from all finished team-game stat lines. A finished game's detail is
//     held once per game (finishedGameDetails.js, shared with the player
//     dashboard and backed by the finished-games archive) and each team's
//     result from it is cached for the life of the process; the league
//     team-stat pull refreshes every 15 minutes through the shared BALLDONTLIE
//     gateway.

import express from 'express';
import process from 'node:process';
import { getTeamAbbr } from '../src/utils/liveScoringFeed.js';
import {
  buildStandings,
  buildTeamGame,
  buildTeamRanks,
  upcomingGames,
} from '../src/utils/teamSeason/teamSeasonModel.js';
import { fetchStatisticsScoresGames, seasonCacheControl, BOX_SCORE_REVALIDATE_MS } from './statisticsScoresHandlers.js';
import { createFinishedGameDetailStore } from './finishedGameDetails.js';

const MIN_SEASON = 2022;
const DETAIL_CONCURRENCY = 3;
const MAX_GAME_ENTRIES = 400;
const TEAM_STATS_TTL_MS = 15 * 60_000;
const DEPTH_CHART_TTL_MS = 60 * 60_000;
const ESPN_DEPTH_CHART_URL = (team) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team}/depthcharts`;

const isFinal = (game) => /^final/i.test(String(game?.status ?? ''));

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createTeamSeasonService({
  gateway,
  snapshotStore,
  archive = null,
  env = process.env,
  fetcher = fetch,
  // Shared with the player dashboard so each finished game is held once.
  gameDetails = createFinishedGameDetailStore({ gateway, snapshotStore, archive, env }),
} = {}) {
  const gameCache = new Map(); // `${gameId}|${team}` -> built game (finished games with plays only)
  const depthCache = new Map(); // ESPN team abbreviation -> { at, depthchart }
  const inFlight = new Map();

  function coalesce(key, task) {
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = task().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  // Built games expire with the archive's recheck interval so stat corrections reach the dashboards.
  function freshGame(key) {
    const entry = gameCache.get(key);
    if (entry && Date.now() - entry.at < BOX_SCORE_REVALIDATE_MS) return entry.value;
    if (entry) gameCache.delete(key);
    return undefined;
  }

  function remember(key, value) {
    gameCache.delete(key);
    gameCache.set(key, { value, at: Date.now() });
    while (gameCache.size > MAX_GAME_ENTRIES) gameCache.delete(gameCache.keys().next().value);
  }

  async function leagueTeamStats(season) {
    if (!gateway?.supports?.('teamStats')) return [];
    const params = new URLSearchParams({ season_type: '2' });
    params.append('seasons[]', String(season));
    const result = await gateway.request({
      path: '/nfl/v1/team_stats',
      params,
      capability: 'teamStats',
      paginate: true,
      maxPages: 20,
      cacheTtlMs: TEAM_STATS_TTL_MS,
      staleTtlMs: 6 * 60 * 60_000,
      refreshAfterMs: TEAM_STATS_TTL_MS,
    });
    return result.payload?.data ?? [];
  }

  return {
    // ESPN's depth chart endpoint sends no CORS header, so browsers can only reach it through here.
    async depthChart(query = {}) {
      const team = String(query.team ?? '').trim().toLowerCase();
      if (!/^[a-z]{2,3}$/.test(team)) throw badRequest('A team abbreviation is required.');
      const cached = depthCache.get(team);
      if (cached && Date.now() - cached.at < DEPTH_CHART_TTL_MS) return { team, depthchart: cached.depthchart };
      const response = await fetcher(ESPN_DEPTH_CHART_URL(team), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        if (cached) return { team, depthchart: cached.depthchart };
        const error = new Error(`ESPN depth chart returned ${response.status}.`);
        error.statusCode = response.status === 404 ? 404 : 502;
        throw error;
      }
      const body = await response.json();
      const depthchart = Array.isArray(body?.depthchart) ? body.depthchart : [];
      depthCache.set(team, { at: Date.now(), depthchart });
      return { team, depthchart };
    },

    async season(query = {}) {
      const season = Number.parseInt(String(query.season ?? ''), 10);
      if (!Number.isInteger(season) || season < MIN_SEASON || season > new Date().getUTCFullYear() + 1) {
        throw badRequest(`A season from ${MIN_SEASON} on is required.`);
      }
      const rawTeam = String(query.team ?? '').trim();
      if (!/^[A-Za-z]{2,3}$/.test(rawTeam)) throw badRequest('A team abbreviation is required.');
      const team = getTeamAbbr(rawTeam);

      const gamesPayload = await fetchStatisticsScoresGames({ season, phase: 'regular', gateway, env });
      const allGames = (gamesPayload.games ?? []).filter((game) => !game.postseason);
      const finals = allGames
        .filter((game) => isFinal(game) && [game.home_team?.abbreviation, game.visitor_team?.abbreviation].map(getTeamAbbr).includes(team))
        .sort((left, right) => String(left.date).localeCompare(String(right.date)));
      if (!allGames.some((game) => [game.home_team?.abbreviation, game.visitor_team?.abbreviation].map(getTeamAbbr).includes(team))) {
        throw badRequest('That team has no games this season.');
      }

      let teamStatsFailed = false;
      const [built, teamStatRows] = await Promise.all([
        mapWithConcurrency(finals, DETAIL_CONCURRENCY, async (game) => {
          const key = `${game.id}|${team}`;
          const cachedGame = freshGame(key);
          if (cachedGame !== undefined) return { result: cachedGame, settled: true };
          return coalesce(`game:${key}`, async () => {
            const detail = await gameDetails.get({ gameId: game.id, phase: 'regular' });
            const result = buildTeamGame(detail, team);
            // Games whose plays have not landed are rebuilt on the next request.
            const settled = Boolean(detail.coverage?.plays);
            if (result && settled) remember(key, result);
            return { result, settled };
          });
        }),
        leagueTeamStats(season).catch(() => { teamStatsFailed = true; return []; }),
      ]);

      const { teams, standings } = buildStandings(allGames);
      const { ranks, leagueGames } = buildTeamRanks(allGames, teamStatRows);
      return {
        season,
        team,
        teams,
        games: built.map(({ result }) => result).filter(Boolean),
        schedule: upcomingGames(allGames, team),
        standings,
        ranks,
        leagueGames,
        // False when the league team stats failed or a finished game's plays
        // had not landed: the payload is then only cached briefly.
        complete: !teamStatsFailed && built.every(({ settled }) => settled),
      };
    },
  };
}

export function createTeamSeasonRouter(options = {}) {
  const router = express.Router();
  const service = options.service ?? createTeamSeasonService(options);
  router.get('/depth-chart', async (req, res) => {
    try {
      const payload = await service.depthChart(req.query);
      res.set('Cache-Control', 'public, max-age=900').json({ ok: true, ...payload });
    } catch (error) {
      const status = error.statusCode ?? 500;
      res.status(status).set('Cache-Control', 'no-store').json({
        ok: false,
        error: status >= 500 ? 'The depth chart is unavailable right now.' : error.message,
      });
    }
  });
  router.get('/season', async (req, res) => {
    try {
      const payload = await service.season(req.query);
      res.set('Cache-Control', seasonCacheControl(payload.season, { complete: payload.complete !== false })).json({ ok: true, ...payload });
    } catch (error) {
      const status = error.statusCode ?? 500;
      res.status(status).set('Cache-Control', 'no-store').json({
        ok: false,
        error: status >= 500 ? 'Team season data is unavailable right now.' : error.message,
      });
    }
  });
  return router;
}
