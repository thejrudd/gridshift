import process from 'node:process';
import { isPrimeTimeScheduleGame } from '../src/utils/statisticsSchedule.js';

export const DEFAULT_STORY_STATS_AUTOMATION_POLL_MS = 60_000;
export const DEFAULT_STORY_STATS_SCHEDULE_REFRESH_MS = 6 * 60 * 60_000;
export const DEFAULT_STORY_STATS_POSTGAME_LOOKBACK_MS = 6 * 60 * 60_000;
export const STORY_STATS_PREGAME_WINDOW_MS = 60 * 60_000;

function nowMsFrom(value) {
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

export function isStoryStatsAutomationEnabled(env = process.env) {
  // Development keeps the Game Story tab as the manual test surface. The
  // background job is deliberately production-only so a local server cannot
  // silently consume the free StoryStats allowance.
  if (String(env.NODE_ENV ?? '').trim().toLowerCase() !== 'production') return false;
  return parseBoolean(env.GRIDSHIFT_STORY_STATS_AUTOMATION_ENABLED, true);
}

export function resolveStoryStatsNflSeason(now = Date.now()) {
  const date = new Date(nowMsFrom(now));
  if (Number.isNaN(date.getTime())) return new Date().getUTCFullYear();
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 6 ? year : year - 1;
}

function parseKickoffMs(game) {
  const value = game?.date ?? game?.kickoff;
  const kickoffMs = Date.parse(value ?? '');
  return Number.isFinite(kickoffMs) ? kickoffMs : null;
}

export function isPrimeTimeStoryStatsGame(game = {}) {
  const seasonType = String(game?.season_type ?? game?.seasonType ?? game?.phase ?? '').trim().toLowerCase();
  if (seasonType === '1' || seasonType.includes('preseason') || seasonType.includes('pre')) return false;
  return isPrimeTimeScheduleGame({
    phase: 'regular',
    kickoff: game?.date ?? game?.kickoff,
  });
}

function resolveStatus(game = {}) {
  const state = String(game?.status_state ?? game?.statusState ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const status = String(game?.status ?? '').trim().toLowerCase();
  if (state.includes('postpon') || status.includes('postpon')) return 'postponed';
  if (state.includes('final') || state.includes('complete') || state === 'post'
    || status.includes('final') || status.includes('complete')) return 'final';
  if (state.includes('half') || status.includes('half')) return 'halftime';
  if (state.includes('delay') || status.includes('delay')) return 'delayed';
  if (state === 'in progress' || state === 'live' || /\b(?:1st|2nd|3rd|4th|ot)\b/.test(status)) return 'live';
  return 'scheduled';
}

function resolvePeriod(game = {}) {
  const explicitPeriod = Number(game?.period);
  if (Number.isInteger(explicitPeriod) && explicitPeriod > 0) return explicitPeriod;
  const status = String(game?.status ?? '');
  const match = status.match(/\b(\d+)(?:st|nd|rd|th)\b/i);
  if (match) return Number(match[1]);
  if (/\bot\b/i.test(status)) return 5;
  return null;
}

export function buildStoryStatsScheduleParams(season) {
  return new URLSearchParams({
    per_page: '100',
    'seasons[]': String(season),
    'season_type[]': '2',
  });
}

function defaultLoadScheduleGames({ gateway, season, scheduleRefreshMs }) {
  return gateway.request({
    path: '/nfl/v1/games',
    params: buildStoryStatsScheduleParams(season),
    capability: 'games',
    paginate: true,
    cacheTtlMs: scheduleRefreshMs,
    staleTtlMs: Math.max(scheduleRefreshMs, 30 * 60_000),
    refreshAfterMs: scheduleRefreshMs,
    freshnessKey: `story-stats-schedule:v1:${season}`,
    lane: 'background',
  }).then((result) => (Array.isArray(result.payload?.data) ? result.payload.data : []));
}

function defaultLoadGameState({ gateway, gameId }) {
  return gateway.request({
    path: `/nfl/v1/games/${encodeURIComponent(gameId)}`,
    capability: 'games',
    paginate: false,
    cacheTtlMs: 30_000,
    staleTtlMs: 120_000,
    refreshAfterMs: 30_000,
    freshnessKey: 'story-stats-game-state:v1',
    lane: 'background',
  }).then((result) => result.payload?.data ?? null);
}

function newGameRecord() {
  return {
    pregameRequested: false,
    livePeriods: new Set(),
    postgameRequested: false,
    lastStatus: null,
    lastSeenAtMs: 0,
  };
}

export function createStoryStatsScheduler({
  gateway,
  service,
  env = process.env,
  enabled = isStoryStatsAutomationEnabled(env),
  now = () => Date.now(),
  season = null,
  pollIntervalMs = DEFAULT_STORY_STATS_AUTOMATION_POLL_MS,
  scheduleRefreshMs = DEFAULT_STORY_STATS_SCHEDULE_REFRESH_MS,
  postgameLookbackMs = DEFAULT_STORY_STATS_POSTGAME_LOOKBACK_MS,
  loadScheduleGames,
  loadGameState,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  logger = console,
} = {}) {
  if (!gateway || typeof gateway.request !== 'function' || typeof gateway.supports !== 'function') {
    throw new TypeError('A StoryStats scheduler requires a provider gateway.');
  }
  if (!service || typeof service.fetch !== 'function') {
    throw new TypeError('A StoryStats scheduler requires a StoryStats service.');
  }

  const records = new Map();
  let scheduleGames = [];
  let scheduleFetchedAtMs = 0;
  let activeSeason = season;
  let intervalId = null;
  let ticking = null;
  let lastRunAtMs = null;
  let lastError = null;
  const providerReady = gateway.supports('games') && gateway.supports('storyStats');
  const canRun = Boolean(enabled) && providerReady;

  const loadSchedule = loadScheduleGames ?? ((options) => defaultLoadScheduleGames({
    gateway,
    scheduleRefreshMs,
    ...options,
  }));
  const loadState = loadGameState ?? ((options) => defaultLoadGameState({ gateway, ...options }));

  function getStatus() {
    return {
      enabled: canRun,
      requestedEnabled: Boolean(enabled),
      providerReady,
      running: intervalId != null,
      season: activeSeason,
      pollIntervalMs,
      scheduleRefreshMs,
      trackedGames: records.size,
      scheduledGames: scheduleGames.length,
      scheduleFetchedAt: scheduleFetchedAtMs ? new Date(scheduleFetchedAtMs).toISOString() : null,
      lastRunAt: lastRunAtMs ? new Date(lastRunAtMs).toISOString() : null,
      lastError,
    };
  }

  async function refreshSchedule(currentNowMs) {
    if (!gateway.supports('games')) {
      throw new Error('StoryStats automation requires BALLDONTLIE game access.');
    }
    activeSeason = activeSeason ?? resolveStoryStatsNflSeason(currentNowMs);
    const games = await loadSchedule({ season: activeSeason });
    scheduleGames = (Array.isArray(games) ? games : [])
      .filter((game) => game?.id != null && isPrimeTimeStoryStatsGame(game));
    scheduleFetchedAtMs = currentNowMs;
    return scheduleGames;
  }

  async function requestPhase(record, gameId, phase, period = null) {
    if (phase === 'pregame') record.pregameRequested = true;
    if (phase === 'postgame') record.postgameRequested = true;
    if (phase === 'live') record.livePeriods.add(period ?? 'current');
    return service.fetch({
      gameId: String(gameId),
      phase,
      allowUpstream: true,
    });
  }

  async function inspectGame(game, currentNowMs) {
    const gameId = String(game.id);
    const kickoffMs = parseKickoffMs(game);
    if (!Number.isFinite(kickoffMs)) return;

    const record = records.get(gameId) ?? newGameRecord();
    record.lastSeenAtMs = currentNowMs;
    records.set(gameId, record);

    const afterKickoffMs = currentNowMs - kickoffMs;
    const inPregameWindow = currentNowMs >= kickoffMs - STORY_STATS_PREGAME_WINDOW_MS
      && currentNowMs < kickoffMs;
    const inPostgameLookback = afterKickoffMs >= 0 && afterKickoffMs <= postgameLookbackMs;
    let currentGame = game;

    // The season list is the schedule source. Once kickoff arrives, use a
    // game-scoped refresh so period transitions and final status do not wait
    // for the six-hour schedule refresh.
    if (inPostgameLookback) {
      const refreshed = await loadState({ gameId });
      if (refreshed && typeof refreshed === 'object') currentGame = { ...game, ...refreshed };
    }

    const status = resolveStatus(currentGame);
    record.lastStatus = status;

    if (status === 'scheduled' && inPregameWindow && !record.pregameRequested) {
      await requestPhase(record, gameId, 'pregame');
      return;
    }

    if (status === 'live' || status === 'halftime' || status === 'delayed') {
      const period = resolvePeriod(currentGame);
      // The beta budget is built around one live story per regulation period.
      // Do not spend a fifth live request on overtime or an extended provider
      // period; the final story still captures the completed game.
      if (Number.isInteger(period) && period > 4) return;
      if (record.livePeriods.size >= 4) return;
      const periodKey = Number.isInteger(period) && period >= 1 && period <= 4 ? period : 'current';
      if (!record.livePeriods.has(periodKey)) await requestPhase(record, gameId, 'live', periodKey);
      return;
    }

    const sawThisGame = record.pregameRequested || record.livePeriods.size > 0;
    if (status === 'final' && !record.postgameRequested && (sawThisGame || inPostgameLookback)) {
      await requestPhase(record, gameId, 'postgame');
    }
  }

  async function tick() {
    if (!canRun || ticking) return ticking;
    ticking = (async () => {
      const currentNowMs = nowMsFrom(now());
      if (!scheduleFetchedAtMs || currentNowMs - scheduleFetchedAtMs >= scheduleRefreshMs) {
        await refreshSchedule(currentNowMs);
      }
      let runHadError = false;
      for (const game of scheduleGames) {
        try {
          await inspectGame(game, currentNowMs);
        } catch (error) {
          runHadError = true;
          lastError = error?.message ?? 'StoryStats automation failed.';
          logger.error?.('[story-stats] automation request failed:', error);
        }
      }
      lastRunAtMs = currentNowMs;
      if (!runHadError) lastError = null;
    })().catch((error) => {
      lastError = error?.message ?? 'StoryStats automation failed.';
      logger.error?.('[story-stats] automation tick failed:', error);
      throw error;
    }).finally(() => {
      ticking = null;
    });
    return ticking;
  }

  function start() {
    if (!canRun || intervalId != null) return getStatus();
    intervalId = setIntervalFn(() => {
      void tick().catch(() => {});
    }, pollIntervalMs);
    void tick().catch(() => {});
    return getStatus();
  }

  function stop() {
    if (intervalId != null) clearIntervalFn(intervalId);
    intervalId = null;
    return getStatus();
  }

  return {
    getStatus,
    refreshSchedule,
    inspectGame,
    tick,
    start,
    stop,
  };
}
