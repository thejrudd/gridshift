import { resolveStatisticsScoresCurrentWeekId } from './statisticsScoresWeek.js';

export const STATISTICS_SCHEDULE_MODES = Object.freeze({
  WEEK: 'week',
  TEAM: 'team',
});

export const STATISTICS_SCHEDULE_FILTERS = Object.freeze({
  ALL: 'all',
  INTERNATIONAL: 'international',
  PRIMETIME: 'primetime',
  HOLIDAY: 'holiday',
});

const SCHEDULE_MODE_VALUES = new Set(Object.values(STATISTICS_SCHEDULE_MODES));
const SCHEDULE_FILTER_VALUES = new Set(Object.values(STATISTICS_SCHEDULE_FILTERS));
const NFL_SCHEDULE_TIME_ZONE = 'America/New_York';
const EASTERN_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NFL_SCHEDULE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getFirstWeekKickoff(weekOptions = []) {
  const kickoffs = weekOptions
    .flatMap((weekOption) => weekOption.games ?? [])
    .map((game) => Date.parse(game.kickoff))
    .filter(Number.isFinite);
  return kickoffs.length ? Math.min(...kickoffs) : null;
}

export function getCurrentPreseasonWeekSelection({
  preseasonWeekOptions = [],
  regularWeekOptions = [],
  now = Date.now(),
} = {}) {
  const firstPreseasonKickoff = getFirstWeekKickoff(preseasonWeekOptions);
  if (!Number.isFinite(firstPreseasonKickoff)) return null;

  const nowMs = getTimeMs(now);
  if (!Number.isFinite(nowMs)) return null;
  const firstRegularKickoff = getFirstWeekKickoff(regularWeekOptions);
  const nowParts = getEasternDateParts(nowMs);
  const firstPreseasonParts = getEasternDateParts(firstPreseasonKickoff);
  const nowCalendarDay = nowParts ? (nowParts.year * 10_000) + (nowParts.month * 100) + nowParts.day : null;
  const firstPreseasonCalendarDay = firstPreseasonParts
    ? (firstPreseasonParts.year * 10_000) + (firstPreseasonParts.month * 100) + firstPreseasonParts.day
    : null;
  const preseasonHasStarted = Number.isFinite(nowCalendarDay)
    && Number.isFinite(firstPreseasonCalendarDay)
    && nowCalendarDay >= firstPreseasonCalendarDay;
  const regularSeasonHasStarted = Number.isFinite(firstRegularKickoff) && nowMs >= firstRegularKickoff;
  if (!preseasonHasStarted || regularSeasonHasStarted) return null;

  const currentWeekId = resolveStatisticsScoresCurrentWeekId(
    preseasonWeekOptions.map((weekOption) => ({
      id: weekOption.selection,
      phase: 'preseason',
      games: weekOption.games ?? [],
    })),
    { now: nowMs, phase: 'preseason' },
  );
  return currentWeekId && preseasonWeekOptions.some((weekOption) => weekOption.selection === currentWeekId)
    ? currentWeekId
    : null;
}

export function normalizeStatisticsScheduleMode(value, fallback = STATISTICS_SCHEDULE_MODES.WEEK) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return SCHEDULE_MODE_VALUES.has(normalized) ? normalized : fallback;
}

export function normalizeStatisticsScheduleFilter(value, fallback = STATISTICS_SCHEDULE_FILTERS.ALL) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return SCHEDULE_FILTER_VALUES.has(normalized) ? normalized : fallback;
}

export function normalizeScheduleTeamId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

export function normalizeScheduleWeek(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getTeamIdFromValue(value) {
  if (typeof value === 'string') return normalizeScheduleTeamId(value);
  if (value?.id != null) return normalizeScheduleTeamId(String(value.id));
  return null;
}

export function getScheduleGameTeamId(game, side) {
  if (side === 'away') {
    return getTeamIdFromValue(game?.awayTeam)
      ?? getTeamIdFromValue(game?.away)
      ?? getTeamIdFromValue(game?.awayTeamId)
      ?? getTeamIdFromValue(game?.awayId);
  }

  return getTeamIdFromValue(game?.homeTeam)
    ?? getTeamIdFromValue(game?.home)
    ?? getTeamIdFromValue(game?.homeTeamId)
    ?? getTeamIdFromValue(game?.homeId);
}

export function getScheduleWeeks(schedule = {}) {
  return (Array.isArray(schedule?.weeks) ? schedule.weeks : [])
    .map((week, index) => ({
      ...week,
      week: normalizeScheduleWeek(week?.week) ?? index + 1,
      games: Array.isArray(week?.games) ? week.games : [],
    }))
    .filter((week) => Number.isFinite(week.week) && week.week > 0)
    .sort((left, right) => left.week - right.week);
}

export function scheduleHasGames(schedule = {}) {
  if (schedule?.metadata?.hasSchedule) return true;
  if (Array.isArray(schedule?.games) && schedule.games.length > 0) return true;
  return getScheduleWeeks(schedule).some((week) => week.games.length > 0);
}

export function getPopulatedScheduleWeeks(schedule = {}) {
  return getScheduleWeeks(schedule).filter((week) => week.games.length > 0);
}

export function getGameKickoffMs(game = {}) {
  if (typeof game?.kickoff !== 'string' || !game.kickoff.trim()) return null;
  const parsed = Date.parse(game.kickoff);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeScore(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getScheduleGameScore(game = {}, side) {
  const source = game && typeof game === 'object' ? game : {};
  if (side === 'away') return normalizeScore(source.awayScore ?? source.away_score);
  return normalizeScore(source.homeScore ?? source.home_score);
}

export function isFinalScheduleGame(game = {}) {
  const source = game && typeof game === 'object' ? game : {};
  if (source.completed === true || source.isFinal === true || source.final === true) return true;
  const status = typeof source.status === 'string' ? source.status.trim() : '';
  if (/(^|[_\s-])(final|post|complete|completed)([_\s-]|$)/i.test(status)) return true;
  const statusDetail = typeof source.statusDetail === 'string' ? source.statusDetail.trim() : '';
  return /(^|[_\s-])(final|post|complete|completed)([_\s-]|$)/i.test(statusDetail);
}

export function getWeekFirstKickoffMs(week = {}) {
  const kickoffTimes = (week.games ?? [])
    .map(getGameKickoffMs)
    .filter((value) => value != null)
    .sort((left, right) => left - right);

  return kickoffTimes[0] ?? null;
}

function getTimeMs(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getEasternDateParts(value) {
  const timeMs = getTimeMs(value);
  if (timeMs == null) return null;

  const parts = Object.fromEntries(
    EASTERN_DATE_PARTS_FORMATTER
      .formatToParts(new Date(timeMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  const year = Number.parseInt(parts.year, 10);
  const month = Number.parseInt(parts.month, 10);
  const day = Number.parseInt(parts.day, 10);
  const hour = Number.parseInt(parts.hour, 10);
  const minute = Number.parseInt(parts.minute, 10);

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute };
}

function getThanksgivingDay(year) {
  const novemberFirst = new Date(Date.UTC(year, 10, 1));
  const novemberFirstDay = novemberFirst.getUTCDay();
  const firstThursday = 1 + ((4 - novemberFirstDay + 7) % 7);
  return firstThursday + 21;
}

export function getDefaultScheduleWeek(schedule = {}, now = new Date()) {
  const populatedWeeks = getPopulatedScheduleWeeks(schedule);
  if (populatedWeeks.length === 0) return null;

  const weeksWithKickoff = populatedWeeks
    .map((week) => ({ week: week.week, firstKickoffMs: getWeekFirstKickoffMs(week) }))
    .filter((week) => week.firstKickoffMs != null)
    .sort((left, right) => left.firstKickoffMs - right.firstKickoffMs);

  if (weeksWithKickoff.length === 0) return populatedWeeks[0].week;

  const nowMs = getTimeMs(now);
  if (nowMs == null) return weeksWithKickoff[0].week;
  if (nowMs < weeksWithKickoff[0].firstKickoffMs) return weeksWithKickoff[0].week;

  let activeWeek = weeksWithKickoff[0].week;
  for (const week of weeksWithKickoff) {
    if (nowMs < week.firstKickoffMs) break;
    activeWeek = week.week;
  }

  return activeWeek;
}

export function getWeekScheduleGames(schedule = {}, weekNumber) {
  const normalizedWeek = normalizeScheduleWeek(weekNumber);
  if (!normalizedWeek) return [];
  return getScheduleWeeks(schedule).find((week) => week.week === normalizedWeek)?.games ?? [];
}

function getScheduleRowId(week, game) {
  return game.id ?? `W${String(week.week).padStart(2, '0')}-${getScheduleGameTeamId(game, 'away')}-${getScheduleGameTeamId(game, 'home')}`;
}

function compareScheduleRowsByKickoff(left, right) {
  const leftMs = getGameKickoffMs(left.game);
  const rightMs = getGameKickoffMs(right.game);
  if (leftMs == null && rightMs == null) {
    return left.week - right.week || String(left.id ?? '').localeCompare(String(right.id ?? ''));
  }
  if (leftMs == null) return 1;
  if (rightMs == null) return -1;
  return leftMs - rightMs;
}

function buildFilteredScheduleRows(schedule = {}, predicate, getExtras = () => ({})) {
  if (!scheduleHasGames(schedule)) return [];

  return getScheduleWeeks(schedule)
    .flatMap((week) => (
      week.games
        .filter((game) => predicate(game, week))
        .map((game) => ({
          id: getScheduleRowId(week, game),
          week: week.week,
          game,
          ...getExtras(game, week),
        }))
    ))
    .sort(compareScheduleRowsByKickoff);
}

export function buildTeamScheduleRows(schedule = {}, teamId) {
  const normalizedTeamId = normalizeScheduleTeamId(teamId);
  if (!normalizedTeamId || !scheduleHasGames(schedule)) return [];

  return getScheduleWeeks(schedule).map((week) => {
    const game = week.games.find((candidate) => (
      getScheduleGameTeamId(candidate, 'away') === normalizedTeamId
      || getScheduleGameTeamId(candidate, 'home') === normalizedTeamId
    ));

    if (!game) {
      return {
        id: `${normalizedTeamId}-W${String(week.week).padStart(2, '0')}-BYE`,
        week: week.week,
        weekLabel: week.label ?? null,
        isBye: true,
      };
    }

    const awayTeamId = getScheduleGameTeamId(game, 'away');
    const homeTeamId = getScheduleGameTeamId(game, 'home');
    const isAway = awayTeamId === normalizedTeamId;

    return {
      id: game.id ?? `${normalizedTeamId}-W${String(week.week).padStart(2, '0')}`,
      week: week.week,
      weekLabel: week.label ?? null,
      game,
      isBye: false,
      isAway,
      opponentTeamId: isAway ? homeTeamId : awayTeamId,
    };
  });
}

export function isInternationalScheduleGame(game = {}) {
  const venueCountry = typeof game?.venueCountry === 'string'
    ? game.venueCountry.trim()
    : '';
  if (venueCountry) {
    return !/^(USA|US|United States|United States of America)$/i.test(venueCountry);
  }

  const location = typeof game?.location === 'string'
    ? game.location.trim()
    : typeof game?.venue === 'string'
      ? game.venue.trim()
      : '';

  if (!location) return false;
  const locationParts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (locationParts.length < 3) return false;
  const country = locationParts.at(-1);
  return !/^(USA|US|United States|United States of America)$/i.test(country);
}

export function buildInternationalScheduleRows(schedule = {}) {
  return buildFilteredScheduleRows(schedule, isInternationalScheduleGame);
}

export function isPrimeTimeScheduleGame(game = {}) {
  if (game?.phase === 'preseason') return false;
  const parts = getEasternDateParts(game?.kickoff);
  return Boolean(parts && parts.hour >= 19);
}

export function buildPrimeTimeScheduleRows(schedule = {}) {
  return buildFilteredScheduleRows(schedule, isPrimeTimeScheduleGame);
}

export function getHolidayLabelForScheduleGame(game = {}) {
  const parts = getEasternDateParts(game?.kickoff);
  if (!parts) return null;

  const thanksgivingDay = getThanksgivingDay(parts.year);
  if (parts.month === 11 && parts.day === thanksgivingDay) return 'Thanksgiving';
  if (parts.month === 11 && parts.day === thanksgivingDay + 1) return 'Black Friday';
  if (parts.month === 12 && parts.day === 24) return 'Christmas Eve';
  if (parts.month === 12 && parts.day === 25) return 'Christmas Day';
  if (parts.month === 12 && parts.day === 31) return "New Year's Eve";
  if (parts.month === 1 && parts.day === 1) return "New Year's Day";
  return null;
}

export function buildHolidayScheduleRows(schedule = {}) {
  return buildFilteredScheduleRows(
    schedule,
    (game) => getHolidayLabelForScheduleGame(game) != null,
    (game) => ({ holidayLabel: getHolidayLabelForScheduleGame(game) }),
  );
}

export function scheduleGameMatchesFilter(game = {}, filter = STATISTICS_SCHEDULE_FILTERS.ALL) {
  switch (normalizeStatisticsScheduleFilter(filter)) {
    case STATISTICS_SCHEDULE_FILTERS.INTERNATIONAL:
      return isInternationalScheduleGame(game);
    case STATISTICS_SCHEDULE_FILTERS.PRIMETIME:
      return isPrimeTimeScheduleGame(game);
    case STATISTICS_SCHEDULE_FILTERS.HOLIDAY:
      return getHolidayLabelForScheduleGame(game) != null;
    case STATISTICS_SCHEDULE_FILTERS.ALL:
    default:
      return true;
  }
}

export function filterTeamScheduleRows(rows = [], filter = STATISTICS_SCHEDULE_FILTERS.ALL) {
  const normalizedFilter = normalizeStatisticsScheduleFilter(filter);
  if (normalizedFilter === STATISTICS_SCHEDULE_FILTERS.ALL) return rows;
  return rows.filter((row) => !row?.isBye && scheduleGameMatchesFilter(row?.game, normalizedFilter));
}
