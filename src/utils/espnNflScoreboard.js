const ESPN_NFL_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export const NFL_SEASON_PHASES = Object.freeze({
  REGULAR: 'regular',
  PRESEASON: 'preseason',
});

export const ESPN_SEASON_TYPES = Object.freeze({
  [NFL_SEASON_PHASES.PRESEASON]: 1,
  [NFL_SEASON_PHASES.REGULAR]: 2,
});

export const PRESEASON_WEEK_COUNT = 4;
export const STATISTICS_PHASE_STORAGE_KEY = 'gridshift.statisticsNflPhase';

const PRESEASON_WEEK_FALLBACKS = [
  { label: 'Hall of Fame Weekend', shortLabel: 'HOF' },
  { label: 'Preseason Week 1', shortLabel: 'P1' },
  { label: 'Preseason Week 2', shortLabel: 'P2' },
  { label: 'Preseason Week 3', shortLabel: 'P3' },
];

export function normalizeNflSeasonPhase(value, fallback = NFL_SEASON_PHASES.REGULAR) {
  return Object.values(NFL_SEASON_PHASES).includes(value) ? value : fallback;
}

export function readStoredNflSeasonPhase() {
  try {
    return normalizeNflSeasonPhase(localStorage.getItem(STATISTICS_PHASE_STORAGE_KEY));
  } catch {
    return NFL_SEASON_PHASES.REGULAR;
  }
}

export function writeStoredNflSeasonPhase(phase) {
  const normalized = normalizeNflSeasonPhase(phase);
  try {
    localStorage.setItem(STATISTICS_PHASE_STORAGE_KEY, normalized);
  } catch {
    // Local storage is a preference only; component state remains authoritative.
  }
  return normalized;
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asScore(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getCompetition(event) {
  return Array.isArray(event?.competitions) ? event.competitions[0] ?? null : null;
}

function getCompetitor(competition, side) {
  return (competition?.competitors ?? []).find((entry) => entry?.homeAway === side) ?? null;
}

function getTeam(competitor) {
  const abbreviation = asNonEmptyString(competitor?.team?.abbreviation) ?? 'TBD';
  return {
    id: abbreviation.toUpperCase(),
    name: asNonEmptyString(competitor?.team?.shortDisplayName)
      ?? asNonEmptyString(competitor?.team?.displayName)
      ?? abbreviation,
  };
}

function getRecord(competitor) {
  return (competitor?.records ?? []).find((record) => record?.type === 'total')?.summary
    ?? competitor?.records?.[0]?.summary
    ?? null;
}

function getNetwork(competition) {
  const names = (competition?.broadcasts ?? []).flatMap((broadcast) => broadcast?.names ?? []).filter(Boolean);
  return names.join(' / ') || 'TV TBD';
}

function getBroadcasts(competition) {
  return (competition?.broadcasts ?? [])
    .flatMap((broadcast) => broadcast?.names ?? [])
    .filter(Boolean)
    .map((name) => ({ name }));
}

function getVenueDetails(competition) {
  const venue = asNonEmptyString(competition?.venue?.fullName) ?? 'Venue TBD';
  const city = asNonEmptyString(competition?.venue?.address?.city);
  const state = asNonEmptyString(competition?.venue?.address?.state);
  const country = asNonEmptyString(competition?.venue?.address?.country);
  const location = [venue, city, state, country].filter(Boolean).join(', ');

  return { venue, location, country };
}

function getStatus(event) {
  const type = event?.status?.type ?? {};
  const name = String(type.name ?? '').toUpperCase();
  const description = String(type.description ?? '').toLowerCase();

  if (type.completed || type.state === 'post' || name.includes('FINAL')) return 'final';
  if (name.includes('HALFTIME')) return 'halftime';
  if (name.includes('DELAY') || description.includes('delay')) return 'delayed';
  if (name.includes('POSTPON')) return 'postponed';
  if (type.state === 'in') return 'live';
  return 'scheduled';
}

function getStatusLabel(event, status) {
  const type = event?.status?.type ?? {};
  if (status === 'scheduled') return asNonEmptyString(type.shortDetail) ?? asNonEmptyString(type.detail) ?? 'Scheduled';
  if (status === 'final') return asNonEmptyString(type.shortDetail) ?? 'Final';
  if (status === 'halftime') return 'Halftime';
  return asNonEmptyString(type.shortDetail) ?? asNonEmptyString(type.detail) ?? asNonEmptyString(type.description) ?? status;
}

function formatDate(value, options) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

function getLiveSituation(competition, awayTeam, homeTeam) {
  const situation = competition?.situation;
  const competitors = competition?.competitors ?? [];
  const possessionCompetitor = competitors.find((entry) => entry?.possession === true);
  const possession = possessionCompetitor?.team?.abbreviation?.toUpperCase?.() ?? null;
  if (!situation && !possession) return null;

  return {
    period: competition?.status?.period ? String(competition.status.period) : null,
    clock: competition?.status?.displayClock ?? null,
    possession,
    downDistance: situation?.shortDownDistanceText ?? situation?.downDistanceText ?? null,
    fieldPosition: situation?.possessionText ?? null,
    redZone: Boolean(situation?.isRedZone),
    awayTimeouts: competitors.find((entry) => entry?.team?.abbreviation === awayTeam.id)?.timeouts ?? null,
    homeTimeouts: competitors.find((entry) => entry?.team?.abbreviation === homeTeam.id)?.timeouts ?? null,
  };
}

export function normalizeEspnScoreboardEvent(event, { phase = NFL_SEASON_PHASES.PRESEASON } = {}) {
  const competition = getCompetition(event);
  const awayCompetitor = getCompetitor(competition, 'away');
  const homeCompetitor = getCompetitor(competition, 'home');
  if (!event?.id || !awayCompetitor || !homeCompetitor) return null;

  const away = getTeam(awayCompetitor);
  const home = getTeam(homeCompetitor);
  const status = getStatus(event);
  const kickoff = asNonEmptyString(event.date ?? competition?.date);
  const network = getNetwork(competition);
  const venueDetails = getVenueDetails(competition);
  const score = {
    away: status === 'scheduled' ? null : asScore(awayCompetitor.score),
    home: status === 'scheduled' ? null : asScore(homeCompetitor.score),
  };

  return {
    id: String(event.id),
    espnEventId: String(event.id),
    phase,
    status,
    statusLabel: getStatusLabel(event, status),
    slot: kickoff ? kickoff.slice(0, 10) : `event-${event.id}`,
    slotLabel: formatDate(kickoff, { weekday: 'long' }) ?? 'Game Day',
    dateLabel: formatDate(kickoff, { weekday: 'short', month: 'short', day: 'numeric' }) ?? 'Date TBD',
    kickoffLabel: formatDate(kickoff, { hour: 'numeric', minute: '2-digit' }) ?? 'Time TBD',
    kickoff,
    network,
    broadcasts: getBroadcasts(competition),
    venue: venueDetails.venue,
    location: venueDetails.location,
    venueCountry: venueDetails.country,
    neutralSite: Boolean(competition?.neutralSite),
    detailsAvailable: false,
    away,
    home,
    awayTeam: away.id,
    homeTeam: home.id,
    records: { away: getRecord(awayCompetitor), home: getRecord(homeCompetitor) },
    score,
    awayScore: score.away,
    homeScore: score.home,
    completed: status === 'final',
    live: status === 'live' ? getLiveSituation(competition, away, home) : null,
  };
}

function getPreseasonCalendar(payload) {
  const calendar = payload?.leagues?.[0]?.calendar ?? [];
  return calendar.find((entry) => String(entry?.value) === String(ESPN_SEASON_TYPES.preseason))?.entries ?? [];
}

function normalizeWeek(payload, weekNumber, phase) {
  const calendarEntry = getPreseasonCalendar(payload)[weekNumber - 1];
  const fallback = PRESEASON_WEEK_FALLBACKS[weekNumber - 1] ?? {
    label: `Preseason Week ${weekNumber}`,
    shortLabel: `P${weekNumber}`,
  };
  const games = (payload?.events ?? [])
    .map((event) => normalizeEspnScoreboardEvent(event, { phase }))
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff));

  return {
    id: `pre-${weekNumber}`,
    week: weekNumber,
    label: asNonEmptyString(calendarEntry?.label) ?? fallback.label,
    shortLabel: asNonEmptyString(calendarEntry?.alternateLabel) ?? fallback.shortLabel,
    phase,
    dateRange: asNonEmptyString(calendarEntry?.detail),
    games,
  };
}

export function normalizeEspnScoreboardSeason(payloads, {
  season = new Date().getFullYear(),
  phase = NFL_SEASON_PHASES.PRESEASON,
} = {}) {
  const entries = Array.isArray(payloads) ? payloads : [];
  const weeks = entries.map((payload, index) => normalizeWeek(payload, index + 1, phase));
  const games = weeks.flatMap((week) => week.games);

  return {
    season,
    phase,
    weeks,
    games,
    metadata: {
      hasSchedule: games.length > 0,
      totalGames: games.length,
      weekCount: weeks.length,
      source: 'ESPN public scoreboard',
    },
  };
}

export async function fetchEspnScoreboardWeek({
  season,
  week,
  phase = NFL_SEASON_PHASES.PRESEASON,
  fetcher = fetch,
  signal,
} = {}) {
  const seasonType = ESPN_SEASON_TYPES[phase];
  if (!seasonType || !Number.isInteger(Number(season)) || !Number.isInteger(Number(week))) {
    throw new Error('A valid NFL season, phase, and week are required.');
  }

  const params = new URLSearchParams({
    seasontype: String(seasonType),
    week: String(week),
    dates: String(season),
  });
  const response = await fetcher(`${ESPN_NFL_SCOREBOARD_URL}?${params}`, { signal });
  if (!response?.ok) throw new Error(`ESPN scoreboard request failed (${response?.status ?? 'unknown'}).`);
  return response.json();
}

export async function fetchEspnPreseason({
  season,
  fetcher = fetch,
  signal,
} = {}) {
  const payloads = await Promise.all(
    Array.from({ length: PRESEASON_WEEK_COUNT }, (_, index) => (
      fetchEspnScoreboardWeek({
        season,
        week: index + 1,
        phase: NFL_SEASON_PHASES.PRESEASON,
        fetcher,
        signal,
      })
    )),
  );

  return normalizeEspnScoreboardSeason(payloads, { season, phase: NFL_SEASON_PHASES.PRESEASON });
}

export function replaceEspnScoreboardWeek(seasonData, payload, weekNumber) {
  const replacement = normalizeWeek(payload, weekNumber, seasonData?.phase ?? NFL_SEASON_PHASES.PRESEASON);
  const weeks = (seasonData?.weeks ?? []).map((week) => week.week === weekNumber ? replacement : week);
  return {
    ...seasonData,
    weeks,
    games: weeks.flatMap((week) => week.games),
    metadata: {
      ...seasonData?.metadata,
      hasSchedule: weeks.some((week) => week.games.length > 0),
      totalGames: weeks.reduce((total, week) => total + week.games.length, 0),
    },
  };
}
