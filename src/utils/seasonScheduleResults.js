// public/season-schedule.json is a static build asset with no scores, so every
// schedule-driven surface (Standings, Schedule, Game) would read 0-0 forever.
// These helpers merge completed and in-progress results from the server-proxied
// ESPN scoreboard back into the loaded season schedule. Game ids, weeks, and
// matchups are never rewritten here: the prediction schedule fingerprint is
// built from exactly those fields, so hydration only updates result metadata.
import { buildGamesByTeam, getScheduleMetadata } from './seasonSchedule.js';
import { NFL_SEASON_PHASES, normalizeEspnScoreboardEvent } from './espnNflScoreboard.js';

const FINAL_STATUSES = new Set(['final']);

function matchupKey(awayTeam, homeTeam) {
  return awayTeam && homeTeam ? `${awayTeam}@${homeTeam}` : null;
}

export function buildScheduleResultIndex(scoreboard) {
  const index = new Map();
  for (const event of scoreboard?.events ?? []) {
    const normalized = normalizeEspnScoreboardEvent(event, { phase: NFL_SEASON_PHASES.REGULAR });
    if (!normalized) continue;
    index.set(`id:${normalized.espnEventId}`, normalized);
    const key = matchupKey(normalized.awayTeam, normalized.homeTeam);
    if (key && !index.has(`matchup:${key}`)) index.set(`matchup:${key}`, normalized);
  }
  return index;
}

function findResult(index, game) {
  if (!index) return null;
  const byId = game?.espnEventId ? index.get(`id:${String(game.espnEventId)}`) : null;
  if (byId) return byId;
  const key = matchupKey(game?.awayTeam, game?.homeTeam);
  return key ? index.get(`matchup:${key}`) ?? null : null;
}

function applyResult(game, result) {
  if (!result) return game;
  const completed = FINAL_STATUSES.has(result.status);
  if (
    game.status === result.status
    && game.completed === completed
    && game.awayScore === result.awayScore
    && game.homeScore === result.homeScore
  ) {
    return game;
  }

  return {
    ...game,
    status: result.status,
    statusDetail: result.statusLabel ?? game.statusDetail ?? null,
    awayScore: result.awayScore,
    homeScore: result.homeScore,
    completed,
  };
}

const SCHEDULE_TEAM_ALIASES = Object.freeze({ JAC: 'JAX', WSH: 'WAS' });

function normalizeScheduleTeam(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized ? SCHEDULE_TEAM_ALIASES[normalized] ?? normalized : null;
}

function isHydratedGameResult(game) {
  const status = String(game?.status ?? '').trim().toLowerCase();
  return game?.completed === true
    || (status && status !== 'scheduled')
    || game?.awayScore != null
    || game?.homeScore != null;
}

function isFinalScheduleStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized || normalized.includes('postponed')) return false;
  return /(?:^|[_\s-])(?:final|complete|completed|post(?:-?game)?)(?:$|[_\s-])/.test(normalized);
}

function getScheduleResultEntry(game, side, existing = null) {
  const awayTeam = normalizeScheduleTeam(game?.awayTeam);
  const homeTeam = normalizeScheduleTeam(game?.homeTeam);
  const team = side === 'home' ? homeTeam : awayTeam;
  const opponent = side === 'home' ? awayTeam : homeTeam;
  if (!team || !opponent) return null;

  const kickoff = game?.kickoff ?? existing?.kickoff ?? null;
  const score = side === 'home' ? game?.homeScore : game?.awayScore;
  const opponentScore = side === 'home' ? game?.awayScore : game?.homeScore;
  const status = game?.status ?? existing?.status ?? null;

  return {
    team,
    entry: {
      ...existing,
      opp: opponent,
      home: side === 'home',
      kickoff,
      date: game?.kickoff ? String(game.kickoff).slice(0, 10) : existing?.date ?? null,
      status,
      statusDetail: game?.statusDetail ?? existing?.statusDetail ?? null,
      completed: game?.completed === true || isFinalScheduleStatus(status),
      ptsFor: score ?? existing?.ptsFor ?? null,
      ptsAgainst: opponentScore ?? existing?.ptsAgainst ?? null,
      espnEventId: game?.espnEventId ?? existing?.espnEventId ?? null,
    },
  };
}

// Matchup rows historically receive a separately cached team schedule. Keep
// that schedule's identity and static metadata, but apply the already-hydrated
// scoreboard result so a stale `completed: false` cannot keep a finished game
// in the live drilldown phase.
export function mergeSeasonScheduleResultsIntoMap(scheduleMap, seasonSchedule, season = null) {
  if (!scheduleMap || !seasonSchedule || (season != null && Number(seasonSchedule.season) !== Number(season))) {
    return scheduleMap;
  }

  let mergedMap = scheduleMap;
  let mapChanged = false;

  for (const week of seasonSchedule.weeks ?? []) {
    const weekNumber = Number(week?.week);
    if (!Number.isInteger(weekNumber)) continue;

    const weekKey = Object.prototype.hasOwnProperty.call(scheduleMap, weekNumber)
      ? weekNumber
      : String(weekNumber);
    const baseWeek = scheduleMap[weekKey];
    if (!baseWeek || typeof baseWeek !== 'object') continue;

    let mergedWeek = baseWeek;
    let weekChanged = false;

    for (const game of week.games ?? []) {
      if (!isHydratedGameResult(game)) continue;

      for (const side of ['away', 'home']) {
        const preview = getScheduleResultEntry(game, side, null);
        if (!preview) continue;

        const existing = baseWeek[preview.team] ?? null;
        const nextEntry = getScheduleResultEntry(game, side, existing)?.entry;
        if (!nextEntry) continue;

        const keys = ['opp', 'home', 'kickoff', 'date', 'status', 'statusDetail', 'completed', 'ptsFor', 'ptsAgainst', 'espnEventId'];
        const unchanged = existing && keys.every((key) => existing[key] === nextEntry[key]);
        if (unchanged) continue;

        if (!weekChanged) {
          mergedWeek = { ...baseWeek };
          weekChanged = true;
        }
        mergedWeek[preview.team] = nextEntry;
      }
    }

    if (!weekChanged) continue;
    if (!mapChanged) {
      mergedMap = { ...scheduleMap };
      mapChanged = true;
    }
    mergedMap[weekKey] = mergedWeek;
  }

  return mapChanged ? mergedMap : scheduleMap;
}

// resultsByWeek: Map<weekNumber, rawEspnScoreboardPayload>
export function mergeSeasonScheduleResults(schedule, resultsByWeek) {
  if (!schedule || !(resultsByWeek instanceof Map) || resultsByWeek.size === 0) return schedule;

  let changed = false;
  const weeks = (schedule.weeks ?? []).map((week) => {
    const scoreboard = resultsByWeek.get(week.week);
    if (!scoreboard) return week;

    const index = buildScheduleResultIndex(scoreboard);
    if (index.size === 0) return week;

    let weekChanged = false;
    const games = (week.games ?? []).map((game) => {
      const merged = applyResult(game, findResult(index, game));
      if (merged !== game) weekChanged = true;
      return merged;
    });

    if (!weekChanged) return week;
    changed = true;
    return { ...week, games };
  });

  if (!changed) return schedule;

  const games = weeks.flatMap((week) => week.games ?? []);
  return {
    ...schedule,
    weeks,
    games,
    gamesByTeam: buildGamesByTeam(games),
    metadata: getScheduleMetadata({ season: schedule.season, weeks }),
  };
}

function getWeekFirstKickoffMs(week) {
  const times = (week?.games ?? [])
    .map((game) => (typeof game?.kickoff === 'string' ? Date.parse(game.kickoff) : NaN))
    .filter((value) => Number.isFinite(value));
  return times.length ? Math.min(...times) : null;
}

// A week is worth fetching once its first kickoff has passed. Weeks that have
// not started carry no results, so they are never requested.
export function getStartedScheduleWeeks(schedule, now = Date.now()) {
  return (schedule?.weeks ?? [])
    .filter((week) => (week.games ?? []).length > 0)
    .filter((week) => {
      const first = getWeekFirstKickoffMs(week);
      return first != null && first <= now;
    })
    .map((week) => week.week);
}

// Started weeks that still hold a game without a final result. While any exist,
// the scoreboard is polled; once every started week is settled, polling stops.
export function getUnsettledScheduleWeeks(schedule, now = Date.now()) {
  const started = new Set(getStartedScheduleWeeks(schedule, now));
  return (schedule?.weeks ?? [])
    .filter((week) => started.has(week.week))
    .filter((week) => (week.games ?? []).some((game) => game?.completed !== true))
    .map((week) => week.week);
}
