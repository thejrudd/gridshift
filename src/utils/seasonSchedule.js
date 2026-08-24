const DEFAULT_SEASON = 2026;
const DEFAULT_REGULAR_SEASON_WEEKS = 18;
const SCHEDULE_URL = '/season-schedule.json';

const buildEmptyWeeks = (weekCount = DEFAULT_REGULAR_SEASON_WEEKS) => {
  return Array.from({ length: weekCount }, (_, index) => ({
    week: index + 1,
    games: [],
  }));
};

export const EMPTY_SEASON_SCHEDULE = Object.freeze({
  season: DEFAULT_SEASON,
  weeks: buildEmptyWeeks(),
});

const parsePositiveInteger = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeTeamId = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
};

const normalizeString = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizeScore = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeCompleted = (rawGame) => {
  if (rawGame.completed === true || rawGame.isFinal === true || rawGame.final === true) return true;
  if (rawGame.completed === false || rawGame.isFinal === false || rawGame.final === false) return false;

  const status = normalizeString(rawGame.status ?? rawGame.statusType ?? rawGame.statusName);
  return status ? /(^|[_\s-])(final|post|complete|completed)([_\s-]|$)/i.test(status) : false;
};

const normalizeBroadcast = (rawBroadcast) => {
  if (!rawBroadcast || typeof rawBroadcast !== 'object' || Array.isArray(rawBroadcast)) return null;
  const name = normalizeString(rawBroadcast.name);
  if (!name) return null;

  return {
    name,
    logo: normalizeString(rawBroadcast.logo),
    darkLogo: normalizeString(rawBroadcast.darkLogo),
  };
};

const normalizeGame = (rawGame, week, index, season) => {
  if (!rawGame || typeof rawGame !== 'object' || Array.isArray(rawGame)) {
    return null;
  }

  const awayTeam = normalizeTeamId(rawGame.awayTeam ?? rawGame.away);
  const homeTeam = normalizeTeamId(rawGame.homeTeam ?? rawGame.home);
  if (!awayTeam || !homeTeam) return null;

  const normalizedWeek = parsePositiveInteger(rawGame.week, week) ?? week;
  const id = normalizeString(rawGame.id)
    ?? `${season}-W${String(normalizedWeek).padStart(2, '0')}-${awayTeam}-${homeTeam}-${index + 1}`;
  const status = normalizeString(rawGame.status ?? rawGame.statusType ?? rawGame.statusName);

  return {
    id,
    espnEventId: normalizeString(rawGame.espnEventId ?? rawGame.eventId),
    week: normalizedWeek,
    awayTeam,
    homeTeam,
    kickoff: normalizeString(rawGame.kickoff),
    network: normalizeString(rawGame.network),
    broadcasts: Array.isArray(rawGame.broadcasts)
      ? rawGame.broadcasts.map(normalizeBroadcast).filter(Boolean)
      : [],
    location: normalizeString(rawGame.location),
    neutralSite: Boolean(rawGame.neutralSite),
    status,
    statusDetail: normalizeString(rawGame.statusDetail ?? rawGame.statusDescription),
    completed: normalizeCompleted({ ...rawGame, status }),
    awayScore: normalizeScore(rawGame.awayScore ?? rawGame.away_score),
    homeScore: normalizeScore(rawGame.homeScore ?? rawGame.home_score),
  };
};

const getRawWeekEntries = (rawWeeks) => {
  if (Array.isArray(rawWeeks)) {
    return rawWeeks.map((entry, index) => {
      if (Array.isArray(entry)) {
        return [index + 1, entry];
      }
      if (entry && typeof entry === 'object') {
        return [
          parsePositiveInteger(entry.week, index + 1) ?? index + 1,
          Array.isArray(entry.games) ? entry.games : [],
        ];
      }
      return [index + 1, []];
    });
  }

  if (rawWeeks && typeof rawWeeks === 'object') {
    return Object.entries(rawWeeks).map(([week, games]) => [
      parsePositiveInteger(week),
      Array.isArray(games) ? games : [],
    ]);
  }

  return [];
};

export function normalizeSeasonSchedule(rawSchedule = {}) {
  const source = rawSchedule && typeof rawSchedule === 'object' && !Array.isArray(rawSchedule)
    ? rawSchedule
    : {};
  const season = parsePositiveInteger(source.season, DEFAULT_SEASON);
  const weekCount = parsePositiveInteger(source.weekCount, DEFAULT_REGULAR_SEASON_WEEKS);
  const weeks = buildEmptyWeeks(weekCount);
  const warnings = [];

  if (rawSchedule !== source) {
    warnings.push('Schedule payload was not an object; using an empty scaffold.');
  }

  for (const [week, rawGames] of getRawWeekEntries(source.weeks)) {
    if (!week || week < 1 || week > weekCount) {
      warnings.push(`Ignored invalid week: ${String(week)}`);
      continue;
    }

    const games = rawGames
      .map((game, index) => normalizeGame(game, week, index, season))
      .filter(Boolean);

    if (games.length !== rawGames.length) {
      warnings.push(`Week ${week} included ${rawGames.length - games.length} malformed game(s).`);
    }

    weeks[week - 1] = { week, games };
  }

  const games = weeks.flatMap((week) => week.games);
  const metadata = getScheduleMetadata({ season, weeks });

  return {
    season,
    weeks,
    games,
    gamesByTeam: buildGamesByTeam(games),
    metadata,
    warnings,
  };
}

export async function loadSeasonSchedule({ url = SCHEDULE_URL, fetcher = fetch } = {}) {
  try {
    if (typeof fetcher !== 'function') {
      return normalizeSeasonSchedule();
    }

    const response = await fetcher(url);
    if (!response?.ok) {
      return normalizeSeasonSchedule();
    }

    const payload = await response.json();
    return normalizeSeasonSchedule(payload);
  } catch {
    return normalizeSeasonSchedule();
  }
}

export function getScheduleMetadata(schedule = {}) {
  const weeks = Array.isArray(schedule.weeks) ? schedule.weeks : buildEmptyWeeks();
  const games = weeks.flatMap((week) => Array.isArray(week.games) ? week.games : []);
  const populatedWeeks = weeks.filter((week) => Array.isArray(week.games) && week.games.length > 0);
  const emptyWeeks = weeks.filter((week) => !Array.isArray(week.games) || week.games.length === 0);

  return {
    season: parsePositiveInteger(schedule.season, DEFAULT_SEASON),
    weekCount: weeks.length,
    totalGames: games.length,
    hasSchedule: games.length > 0,
    populatedWeekNumbers: populatedWeeks.map((week) => week.week),
    emptyWeekNumbers: emptyWeeks.map((week) => week.week),
    firstPopulatedWeek: populatedWeeks[0]?.week ?? null,
    lastPopulatedWeek: populatedWeeks[populatedWeeks.length - 1]?.week ?? null,
  };
}

export function getWeekSchedule(schedule = {}, weekNumber) {
  const week = parsePositiveInteger(weekNumber);
  if (!week || !Array.isArray(schedule.weeks)) return { week: weekNumber, games: [] };
  return schedule.weeks.find((entry) => entry.week === week) ?? { week, games: [] };
}

export function buildGamesByTeam(games = []) {
  return games.reduce((acc, game) => {
    if (!game?.homeTeam || !game?.awayTeam) return acc;
    acc[game.homeTeam] = [...(acc[game.homeTeam] ?? []), game];
    acc[game.awayTeam] = [...(acc[game.awayTeam] ?? []), game];
    return acc;
  }, {});
}
