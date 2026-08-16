import { NFL_SCOREBOARD_TIME_ZONE } from './statisticsScoresGrouping.js';

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
export const REGULAR_WEEK_COUNT = 18;
export const STATISTICS_PHASE_STORAGE_KEY = 'gridshift.statisticsNflPhase';

const PRESEASON_WEEK_FALLBACKS = [
  { label: 'Hall of Fame Weekend', shortLabel: 'HOF' },
  { label: 'Preseason Week 1', shortLabel: 'Pre Wk 1' },
  { label: 'Preseason Week 2', shortLabel: 'Pre Wk 2' },
  { label: 'Preseason Week 3', shortLabel: 'Pre Wk 3' },
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
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NFL_SCOREBOARD_TIME_ZONE,
    ...options,
  }).format(date);
}

function getLiveSituation(competition, awayTeam, homeTeam, eventStatus) {
  const situation = competition?.situation;
  const competitors = competition?.competitors ?? [];
  const possessionCompetitor = competitors.find((entry) => entry?.possession === true);
  const possession = possessionCompetitor?.team?.abbreviation?.toUpperCase?.() ?? null;
  const status = competition?.status ?? eventStatus ?? {};
  if (!situation && !possession && !status?.displayClock) return null;

  return {
    period: status?.period ? String(status.period) : null,
    clock: status?.displayClock ?? null,
    possession,
    downDistance: situation?.shortDownDistanceText ?? situation?.downDistanceText ?? null,
    fieldPosition: situation?.possessionText ?? null,
    redZone: Boolean(situation?.isRedZone),
    awayTimeouts: competitors.find((entry) => entry?.team?.abbreviation === awayTeam.id)?.timeouts ?? null,
    homeTimeouts: competitors.find((entry) => entry?.team?.abbreviation === homeTeam.id)?.timeouts ?? null,
  };
}

function getQuarterScores(competitor) {
  const scores = (competitor?.linescores ?? [])
    .map((entry) => asScore(entry?.value ?? entry?.displayValue))
    .filter((score) => score != null);
  return scores.length ? scores : null;
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
    detailsAvailable: true,
    provider: 'espn',
    providerGameId: String(event.id),
    playByPlayAvailable: false,
    away,
    home,
    awayTeam: away.id,
    homeTeam: home.id,
    records: { away: getRecord(awayCompetitor), home: getRecord(homeCompetitor) },
    score,
    awayScore: score.away,
    homeScore: score.home,
    completed: status === 'final',
    quarterScores: {
      away: getQuarterScores(awayCompetitor),
      home: getQuarterScores(homeCompetitor),
    },
    live: status === 'live' ? getLiveSituation(competition, away, home, event?.status) : null,
  };
}

function getSeasonCalendar(payload, phase) {
  const calendar = payload?.leagues?.[0]?.calendar ?? [];
  return calendar.find((entry) => String(entry?.value) === String(ESPN_SEASON_TYPES[phase]))?.entries ?? [];
}

function normalizeWeek(payload, weekNumber, phase) {
  const calendarEntry = getSeasonCalendar(payload, phase)[weekNumber - 1];
  const fallback = phase === NFL_SEASON_PHASES.PRESEASON
    ? PRESEASON_WEEK_FALLBACKS[weekNumber - 1] ?? {
      label: `Preseason Week ${weekNumber}`,
      shortLabel: `Pre Wk ${weekNumber}`,
    }
    : {
      label: `Week ${weekNumber}`,
      shortLabel: `W${weekNumber}`,
    };
  const games = (payload?.events ?? [])
    .map((event) => normalizeEspnScoreboardEvent(event, { phase }))
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff));

  return {
    id: `${phase === NFL_SEASON_PHASES.PRESEASON ? 'pre' : 'reg'}-${weekNumber}`,
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

export async function fetchEspnRegularSeason({
  season,
  fetcher = fetch,
  signal,
} = {}) {
  const payloads = await Promise.all(
    Array.from({ length: REGULAR_WEEK_COUNT }, (_, index) => (
      fetchEspnScoreboardWeek({
        season,
        week: index + 1,
        phase: NFL_SEASON_PHASES.REGULAR,
        fetcher,
        signal,
      })
    )),
  );

  return normalizeEspnScoreboardSeason(payloads, { season, phase: NFL_SEASON_PHASES.REGULAR });
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

function normalizeCrosswalkTeamId(teamId) {
  const normalized = String(teamId ?? '').trim().toUpperCase();
  if (normalized === 'WSH') return 'WAS';
  if (normalized === 'JAC') return 'JAX';
  return normalized;
}

function sameNflMatchup(left, right) {
  return normalizeCrosswalkTeamId(left?.away?.id ?? left?.awayTeam)
      === normalizeCrosswalkTeamId(right?.away?.id ?? right?.awayTeam)
    && normalizeCrosswalkTeamId(left?.home?.id ?? left?.homeTeam)
      === normalizeCrosswalkTeamId(right?.home?.id ?? right?.homeTeam);
}

function overlayEspnSnapshot(baseGame, espnGame) {
  const live = espnGame.live
    ? { ...espnGame.live, possession: normalizeCrosswalkTeamId(espnGame.live.possession) || null }
    : null;
  return {
    ...baseGame,
    espnEventId: espnGame.espnEventId,
    scoreboardProvider: 'espn',
    detailsProvider: baseGame.provider,
    status: espnGame.status,
    statusLabel: espnGame.statusLabel,
    score: espnGame.score,
    awayScore: espnGame.awayScore,
    homeScore: espnGame.homeScore,
    completed: espnGame.completed,
    live,
    records: espnGame.records ?? baseGame.records,
    quarterScores: espnGame.quarterScores ?? baseGame.quarterScores,
    network: espnGame.network,
    broadcasts: espnGame.broadcasts,
    broadcastProvider: 'espn',
    asOf: new Date().toISOString(),
  };
}

function overlayEspnBroadcastMetadata(baseGame, espnGame) {
  return {
    ...baseGame,
    network: espnGame.network,
    broadcasts: espnGame.broadcasts,
    broadcastProvider: 'espn',
  };
}

export function overlayEspnBroadcastsWeek(seasonData, payload, weekNumber) {
  const replacement = normalizeWeek(payload, weekNumber, seasonData?.phase ?? NFL_SEASON_PHASES.PRESEASON);
  const weeks = (seasonData?.weeks ?? []).map((week) => {
    if (week.week !== weekNumber) return week;
    return {
      ...week,
      games: (week.games ?? []).map((game) => {
        const espnGame = replacement.games.find((candidate) => sameNflMatchup(game, candidate));
        return espnGame ? overlayEspnBroadcastMetadata(game, espnGame) : game;
      }),
    };
  });

  return {
    ...seasonData,
    weeks,
    games: weeks.flatMap((week) => week.games),
  };
}

export function overlayEspnScoreboardWeek(seasonData, payload, weekNumber) {
  if (seasonData?.provider !== 'balldontlie') {
    return replaceEspnScoreboardWeek(seasonData, payload, weekNumber);
  }

  const replacement = normalizeWeek(payload, weekNumber, seasonData.phase ?? NFL_SEASON_PHASES.PRESEASON);
  const weeks = (seasonData.weeks ?? []).map((week) => {
    if (week.week !== weekNumber) return week;
    const matchedEspnIds = new Set();
    const games = (week.games ?? []).map((game) => {
      const espnGame = replacement.games.find((candidate) => sameNflMatchup(game, candidate));
      if (!espnGame) return game;
      matchedEspnIds.add(espnGame.id);
      return overlayEspnSnapshot(game, espnGame);
    });
    replacement.games.forEach((game) => {
      if (!matchedEspnIds.has(game.id)) {
        games.push({ ...game, scoreboardProvider: 'espn', detailsProvider: 'espn' });
      }
    });
    games.sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff));
    return { ...week, games };
  });

  return {
    ...seasonData,
    weeks,
    games: weeks.flatMap((week) => week.games),
    metadata: {
      ...seasonData.metadata,
      scoreboardSource: 'ESPN public scoreboard',
    },
  };
}
