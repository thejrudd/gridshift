import { NFL_SEASON_PHASES } from './espnNflScoreboard.js';
import { reconcileProviderClockAnchor } from './providerAnchoredGameClock.js';
import { NFL_SCOREBOARD_TIME_ZONE } from './statisticsScoresGrouping.js';

export const BDL_SEASON_TYPES = Object.freeze({
  [NFL_SEASON_PHASES.PRESEASON]: 1,
  [NFL_SEASON_PHASES.REGULAR]: 2,
});

const PRESEASON_WEEK_COUNT = 4;
const REGULAR_WEEK_COUNT = 18;
const PRESEASON_WEEK_FALLBACKS = [
  { label: 'Hall of Fame Weekend', shortLabel: 'HOF' },
  { label: 'Preseason Week 1', shortLabel: 'Pre Wk 1' },
  { label: 'Preseason Week 2', shortLabel: 'Pre Wk 2' },
  { label: 'Preseason Week 3', shortLabel: 'Pre Wk 3' },
];

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? null;
}

function asScore(value) {
  if (value == null || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? score : null;
}

function formatDate(value, options) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NFL_SCOREBOARD_TIME_ZONE,
    ...options,
  }).format(date);
}

function teamFromBdl(team, fallback = 'TBD') {
  const id = firstString(team?.abbreviation, team?.name, fallback)?.toUpperCase() ?? fallback;
  return {
    id,
    name: firstString(team?.full_name, team?.name, id) ?? id,
  };
}

function normalizeStatusState(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function getLiveClock(game) {
  const status = firstString(game?.status) ?? '';
  const statusMatch = status.match(/^(\d{1,2}:\d{2})\s*(?:-|·)\s*(\d+)(?:st|nd|rd|th)(?:\s+(?:q|quarter))?$/i);
  const explicitPeriod = game?.period == null || game.period === '' ? Number.NaN : Number(game.period);
  const parsedPeriod = Number(statusMatch?.[2]);

  return {
    period: Number.isFinite(explicitPeriod) && explicitPeriod > 0
      ? String(explicitPeriod)
      : Number.isFinite(parsedPeriod)
        ? String(parsedPeriod)
        : null,
    clock: firstString(game?.time, game?.clock, statusMatch?.[1]),
  };
}

function getStatus(game) {
  const raw = String(game?.status ?? '').toLowerCase();
  const state = normalizeStatusState(game?.status_state ?? game?.statusState);
  if (state.includes('postpon') || raw.includes('postpon')) return 'postponed';
  if (state.includes('delay') || raw.includes('delay')) return 'delayed';
  if (['completed', 'complete', 'final', 'post', 'closed'].includes(state)
    || raw.includes('final') || raw.includes('complete')) return 'final';
  if (state.includes('half') || raw.includes('half')) return 'halftime';
  if (['scheduled', 'pre', 'not started', 'upcoming'].includes(state)) return 'scheduled';
  if (['in progress', 'live', 'in'].includes(state)
    || raw.includes('progress') || raw.includes('live')
    || /quarter|\bq[1-4]\b/.test(raw) || getLiveClock(game).period) return 'live';
  return 'scheduled';
}

function getStatusLabel(game, status) {
  if (status === 'scheduled') return firstString(game?.status, 'Scheduled') ?? 'Scheduled';
  if (status === 'final') {
    const raw = firstString(game?.status);
    return raw && /final|complete/i.test(raw) ? raw : 'Final';
  }
  if (status === 'halftime') return 'Halftime';
  if (status === 'live') {
    const { period, clock } = getLiveClock(game);
    if (period && clock) return `Q${period} · ${clock}`;
  }
  return firstString(game?.status, status) ?? status;
}

function getQuarterScores(game, side) {
  const prefix = side === 'away' ? 'visitor_team' : 'home_team';
  const values = [1, 2, 3, 4].map((quarter) => asScore(game?.[`${prefix}_q${quarter}`]));
  const overtime = asScore(game?.[`${prefix}_ot`]);
  if (overtime != null) values.push(overtime);
  return values.some((value) => value != null) ? values : null;
}

function normalizeBdlGame(game, {
  phase = NFL_SEASON_PHASES.REGULAR,
  detailsAvailable = true,
  playByPlayAvailable = null,
} = {}) {
  if (!game?.id || !game?.visitor_team || !game?.home_team) return null;

  const away = teamFromBdl(game.visitor_team);
  const home = teamFromBdl(game.home_team);
  const status = getStatus(game);
  const kickoff = firstString(game.date);
  const quarterScores = {
    away: getQuarterScores(game, 'away'),
    home: getQuarterScores(game, 'home'),
  };
  const liveClock = getLiveClock(game);
  const live = status === 'live' && (liveClock.period || liveClock.clock)
    ? {
      period: liveClock.period,
      clock: liveClock.clock,
      possession: null,
      downDistance: null,
      fieldPosition: null,
      redZone: false,
      awayTimeouts: null,
      homeTimeouts: null,
    }
    : null;

  return {
    id: `bdl-${game.id}`,
    provider: 'balldontlie',
    providerGameId: String(game.id),
    bdlGameId: String(game.id),
    phase,
    week: Number.isInteger(Number(game.week)) ? Number(game.week) : null,
    status,
    statusLabel: getStatusLabel(game, status),
    slot: kickoff ? kickoff.slice(0, 10) : `game-${game.id}`,
    slotLabel: formatDate(kickoff, { weekday: 'long' }) ?? 'Game Day',
    dateLabel: formatDate(kickoff, { weekday: 'short', month: 'short', day: 'numeric' }) ?? 'Date TBD',
    kickoffLabel: formatDate(kickoff, { hour: 'numeric', minute: '2-digit' }) ?? 'Time TBD',
    kickoff,
    network: 'TV TBD',
    broadcasts: [],
    venue: firstString(game.venue, 'Venue TBD') ?? 'Venue TBD',
    location: firstString(game.venue, 'Venue TBD') ?? 'Venue TBD',
    venueCountry: null,
    neutralSite: false,
    detailsAvailable,
    playByPlayAvailable,
    away,
    home,
    awayTeam: away.id,
    homeTeam: home.id,
    records: { away: null, home: null },
    score: {
      away: status === 'scheduled' ? null : asScore(game.visitor_team_score),
      home: status === 'scheduled' ? null : asScore(game.home_team_score),
    },
    quarterScores,
    awayScore: status === 'scheduled' ? null : asScore(game.visitor_team_score),
    homeScore: status === 'scheduled' ? null : asScore(game.home_team_score),
    completed: status === 'final',
    live,
  };
}

function getBdlGamePhase(game) {
  const explicitPhase = String(game?.season_type ?? game?.seasonType ?? '').trim().toLowerCase();
  if (explicitPhase === '1' || explicitPhase.includes('pre')) return NFL_SEASON_PHASES.PRESEASON;
  if (explicitPhase === '2' || explicitPhase.includes('reg')) return NFL_SEASON_PHASES.REGULAR;
  if (explicitPhase === '3' || explicitPhase.includes('post')) return 'postseason';
  if (game?.postseason === true) return 'postseason';
  const kickoff = new Date(game?.date ?? '');
  if (Number.isNaN(kickoff.getTime())) return null;
  const month = kickoff.getUTCMonth();
  return month === 6 || month === 7
    ? NFL_SEASON_PHASES.PRESEASON
    : NFL_SEASON_PHASES.REGULAR;
}

function isHallOfFameGame(game) {
  const context = [game?.venue, game?.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return context.includes('hall of fame') || context.includes('canton');
}

function getRawGames(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? payload?.games ?? [];
}

function makeWeek(week, phase, games) {
  const preseasonFallback = PRESEASON_WEEK_FALLBACKS[week - 1];
  const label = phase === NFL_SEASON_PHASES.PRESEASON
    ? preseasonFallback?.label ?? `Preseason Week ${week}`
    : `Week ${week}`;
  const shortLabel = phase === NFL_SEASON_PHASES.PRESEASON
    ? preseasonFallback?.shortLabel ?? `P${week}`
    : `W${week}`;
  const datedGames = games.filter((game) => Number.isFinite(Date.parse(game.kickoff)));
  const dates = datedGames.map((game) => Date.parse(game.kickoff)).sort((left, right) => left - right);
  const dateRange = dates.length
    ? dates.length === 1
      ? formatDate(dates[0], { month: 'short', day: 'numeric' })
      : `${formatDate(dates[0], { month: 'short', day: 'numeric' })}–${formatDate(dates.at(-1), { day: 'numeric' })}`
    : null;
  return {
    id: `${phase === NFL_SEASON_PHASES.PRESEASON ? 'pre' : 'reg'}-${week}`,
    week,
    label,
    shortLabel,
    phase,
    dateRange,
    games: games.sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff)),
  };
}

export function normalizeBdlScoreboardGame(game, options) {
  return normalizeBdlGame(game, options);
}

export function normalizeBdlScoreboardWeek(payload, {
  season = new Date().getFullYear(),
  phase = NFL_SEASON_PHASES.REGULAR,
  week = 1,
} = {}) {
  const normalizedSeason = normalizeBdlScoreboardSeason(payload, { season, phase });
  return {
    ...(normalizedSeason.weeks.find((entry) => entry.week === week) ?? makeWeek(week, phase, [])),
    season,
  };
}

export function normalizeBdlScoreboardSeason(payload, {
  season = new Date().getFullYear(),
  phase = NFL_SEASON_PHASES.REGULAR,
} = {}) {
  const weekCount = phase === NFL_SEASON_PHASES.PRESEASON ? PRESEASON_WEEK_COUNT : REGULAR_WEEK_COUNT;
  const capabilities = payload?.capabilities ?? null;
  const detailsAvailable = capabilities
    ? capabilities.stats === true || capabilities.teamStats === true || capabilities.plays === true
    : true;
  const playByPlayAvailable = capabilities ? capabilities.plays === true : null;
  const sourceGames = getRawGames(payload)
    .filter((game) => getBdlGamePhase(game) === phase);
  const games = sourceGames
    .map((game) => normalizeBdlGame(game, { phase, detailsAvailable, playByPlayAvailable }))
    .filter(Boolean);
  if (phase === NFL_SEASON_PHASES.PRESEASON) {
    const sortedGames = [...games].sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff));
    const ordinaryGames = sortedGames.filter((game) => !isHallOfFameGame(game));
    const firstOrdinaryKickoff = Date.parse(ordinaryGames[0]?.kickoff ?? '');
    const grouped = new Map();
    sortedGames.forEach((game) => {
      const kickoff = Date.parse(game.kickoff);
      const dateWeek = Number.isFinite(firstOrdinaryKickoff) && Number.isFinite(kickoff)
        ? Math.floor((kickoff - firstOrdinaryKickoff) / (7 * 24 * 60 * 60 * 1000)) + 2
        : 2;
      const week = isHallOfFameGame(game) ? 1 : Math.min(4, Math.max(2, dateWeek));
      grouped.set(week, [...(grouped.get(week) ?? []), game]);
    });
    const weeks = Array.from({ length: PRESEASON_WEEK_COUNT }, (_, index) => makeWeek(index + 1, phase, grouped.get(index + 1) ?? []));
    return {
      season,
      phase,
      weeks,
      games: weeks.flatMap((week) => week.games),
      provider: 'balldontlie',
      metadata: {
        provider: 'balldontlie',
        totalGames: sortedGames.length,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const week = index + 1;
    return makeWeek(week, phase, games.filter((game) => game.week === week));
  });
  return {
    season,
    phase,
    weeks,
    provider: 'balldontlie',
    metadata: {
      provider: 'balldontlie',
      totalGames: games.length,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export function overlayBdlScoreboardWeek(seasonData, payload, weekNumber, {
  observedAt = Date.now(),
} = {}) {
  const replacement = normalizeBdlScoreboardWeek(payload, {
    season: seasonData?.season,
    phase: seasonData?.phase ?? NFL_SEASON_PHASES.REGULAR,
    week: weekNumber,
  });
  const feedStale = payload?.freshness?.stale === true || payload?.cache?.stale === true;
  const weeks = (seasonData?.weeks ?? []).map((week) => {
    if (week.week !== weekNumber) return week;

    const previousByProviderId = new Map((week.games ?? [])
      .filter((game) => game?.bdlGameId != null || game?.providerGameId != null)
      .map((game) => [String(game.bdlGameId ?? game.providerGameId), game]));
    const replacementIds = new Set();
    const games = (replacement.games ?? []).map((game) => {
      const providerId = String(game.bdlGameId ?? game.providerGameId);
      replacementIds.add(providerId);
      const previousGame = previousByProviderId.get(providerId) ?? null;
      const merged = {
        ...previousGame,
        ...game,
        id: previousGame?.id ?? game.id,
        provider: 'balldontlie',
        providerGameId: previousGame?.providerGameId ?? game.providerGameId,
        bdlGameId: previousGame?.bdlGameId ?? game.bdlGameId,
        scoreboardProvider: 'balldontlie',
        detailsProvider: previousGame?.detailsProvider ?? 'balldontlie',
        detailsAvailable: previousGame?.detailsAvailable ?? game.detailsAvailable,
        asOf: payload?.freshness?.providerFetchedAt
          ?? payload?.freshness?.receivedAt
          ?? payload?.cache?.fetchedAt
          ?? previousGame?.asOf,
        network: game.network === 'TV TBD' ? previousGame?.network ?? game.network : game.network,
        broadcasts: game.broadcasts?.length ? game.broadcasts : previousGame?.broadcasts ?? [],
      };
      return reconcileProviderClockAnchor(previousGame, merged, { observedAt, feedStale });
    });

    (week.games ?? []).forEach((game) => {
      const providerId = game?.bdlGameId ?? game?.providerGameId;
      if (providerId == null || !replacementIds.has(String(providerId))) games.push(game);
    });
    games.sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff));
    return { ...week, games };
  });

  return {
    ...seasonData,
    weeks,
    games: weeks.flatMap((week) => week.games),
    metadata: {
      ...seasonData?.metadata,
      scoreboardSource: 'BALLDONTLIE live scoreboard',
      capabilities: payload?.capabilities ?? null,
      cadence: payload?.cadence ?? null,
      freshness: payload?.freshness ?? null,
      rateLimit: payload?.rateLimit ?? null,
      cache: payload?.cache ?? null,
    },
  };
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : number % 10 === 1
      ? 'st'
      : number % 10 === 2
        ? 'nd'
        : number % 10 === 3
          ? 'rd'
          : 'th';
  return `${number}${suffix}`;
}

function formatPlayScore(play, away, home) {
  const awayScore = asScore(play?.away_score);
  const homeScore = asScore(play?.home_score);
  if (awayScore == null || homeScore == null) return null;
  return `${away} ${awayScore}–${homeScore} ${home}`;
}

function formatPlaySpot(play, team, game) {
  const supplied = firstString(play.start_possession_text, play.end_possession_text);
  if (supplied) return supplied;
  const yardsToEndzone = asScore(play.start_yards_to_endzone);
  if (yardsToEndzone != null && team) {
    const opponent = team === game?.away?.id ? game?.home?.id : game?.away?.id;
    if (yardsToEndzone === 0) return `${opponent ?? team} Goal`;
    if (yardsToEndzone <= 50) return `${opponent ?? team} ${yardsToEndzone}`;
    return `${team} ${100 - yardsToEndzone}`;
  }
  return play.start_yard_line != null
    ? `Yard ${play.start_yard_line}`
    : play.end_yard_line != null
      ? `Yard ${play.end_yard_line}`
      : '—';
}

export function normalizeBdlScorePlay(play, game) {
  if (!play) return null;
  const description = firstString(play.text, play.short_text, 'Play unavailable') ?? 'Play unavailable';
  const down = play.start_down > 0
    ? `${ordinal(play.start_down)} & ${play.start_distance ?? '—'}`
    : firstString(play.type_text, play.type_abbreviation, 'Play') ?? 'Play';
  const team = firstString(play.team?.abbreviation, game?.team) ?? null;
  return {
    id: String(play.id ?? `${game?.id ?? 'game'}-${description}`),
    team,
    period: Number(play.period) || null,
    quarter: ordinal(Number(play.period)) ?? 'Game',
    time: firstString(play.clock_display, '—') ?? '—',
    down,
    spot: formatPlaySpot(play, team, game),
    description,
    type: firstString(play.type_text, play.type_abbreviation, play.type_slug),
    scoring: Boolean(play.scoring_play),
    score: formatPlayScore(play, game?.away?.id ?? 'AWAY', game?.home?.id ?? 'HOME'),
    wallclock: Date.parse(play.wallclock ?? '') || null,
  };
}

function isPeriodBoundaryPlay(play) {
  const values = [play?.text, play?.short_text, play?.type_text, play?.type_abbreviation, play?.type_slug]
    .map((value) => String(value ?? '').trim().replace(/[_.-]+/g, ' '))
    .filter(Boolean);
  return values.some((value) => /^end(?:\s+of)?\s+(?:quarter(?:\s*[1-4])?|half|game)$/i.test(value));
}

function getBdlPlayProgress(play) {
  const period = Number(play?.period);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(play?.clock_display ?? play?.clock ?? '').trim());
  if (!Number.isFinite(period) || period < 1 || !clock) return null;
  const minutes = Number(clock[1]);
  const seconds = Number(clock[2]);
  if (seconds > 59) return null;
  return ((period - 1) * 900) + (900 - Math.min(900, (minutes * 60) + seconds));
}

function sortBdlPlaysChronologically(plays) {
  return plays
    .map((play, index) => ({
      play,
      index,
      progress: getBdlPlayProgress(play),
      wallclock: Date.parse(play?.wallclock ?? ''),
    }))
    .sort((left, right) => {
      if (Number.isFinite(left.progress) && Number.isFinite(right.progress) && left.progress !== right.progress) {
        return left.progress - right.progress;
      }
      if (Number.isFinite(left.wallclock) && Number.isFinite(right.wallclock) && left.wallclock !== right.wallclock) {
        return left.wallclock - right.wallclock;
      }
      return left.index - right.index;
    })
    .map(({ play }) => play);
}

function inferDriveResult(plays) {
  const scoringPlay = [...plays].reverse().find((play) => play.scoring);
  const text = scoringPlay?.description ?? plays.at(-1)?.description ?? '';
  if (/touchdown/i.test(text)) return 'Touchdown';
  if (/field goal/i.test(text)) return 'Field Goal';
  if (/safety/i.test(text)) return 'Safety';
  if (/intercept/i.test(text)) return 'Interception';
  if (/fumble/i.test(text)) return 'Fumble';
  if (/punt/i.test(text)) return 'Punt';
  if (/turnover on downs|downs/i.test(text)) return 'Downs';
  return 'Drive';
}

export function groupBdlPlaysIntoDrives(plays = [], game) {
  const normalized = sortBdlPlaysChronologically(plays)
    .filter((play) => !isPeriodBoundaryPlay(play))
    .map((play) => normalizeBdlScorePlay(play, game))
    .filter(Boolean);
  const drives = [];
  normalized.forEach((play) => {
    const current = drives.at(-1);
    const team = play.team ?? current?.team ?? game?.away?.id ?? 'NFL';
    if (!current || current.team !== team) {
      drives.push({
        id: `drive-${drives.length + 1}`,
        team,
        quarter: play.quarter,
        result: 'Drive',
        score: play.score ?? '',
        summary: '1 play',
        plays: [play],
      });
      return;
    }
    current.plays.push(play);
    current.quarter = play.quarter;
    current.score = play.score ?? current.score;
    current.summary = `${current.plays.length} plays`;
  });
  drives.forEach((drive) => {
    drive.result = inferDriveResult(drive.plays);
  });
  return drives;
}

function isReported(value) {
  return value !== null && value !== undefined && value !== '';
}

function asNumberOrNull(value) {
  if (!isReported(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatStat(value, { digits = null } = {}) {
  const number = asNumberOrNull(value);
  if (number == null) return '—';
  if (digits != null) return number.toFixed(digits);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

function ratio(numerator, denominator) {
  const top = asNumberOrNull(numerator);
  const bottom = asNumberOrNull(denominator);
  if (top == null || bottom == null) return null;
  return bottom > 0 ? top / bottom : 0;
}

function reportedPair(away, home) {
  return isReported(away) || isReported(home);
}

function comparison(label, away, home, direction = 'higher', extra = {}) {
  if (!reportedPair(away, home)) return null;
  return {
    label,
    away: isReported(away) ? away : '—',
    home: isReported(home) ? home : '—',
    direction,
    ...extra,
  };
}

function makeGroup(id, label, stats) {
  const available = stats.filter(Boolean);
  return available.length ? { id, label, stats: available } : null;
}

function parsePossessionSeconds(value) {
  const explicit = asNumberOrNull(value?.possession_time_seconds);
  if (explicit != null) return explicit;
  const match = String(value?.possession_time ?? '').trim().match(/^(\d+):(\d{2})$/);
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
}

function efficiencyValue(row, prefix) {
  const supplied = firstString(row?.[`${prefix}_efficiency`]);
  if (supplied) return supplied.replace('-', '–');
  const made = asNumberOrNull(row?.[`${prefix}_conversions`]);
  const attempts = asNumberOrNull(row?.[`${prefix}_attempts`]);
  return made == null || attempts == null ? null : `${made}–${attempts}`;
}

function buildTeamStatGroups(teamStats = [], playerStats = [], awayId, homeId) {
  const byTeam = new Map(teamStats.map((row) => [firstString(row?.team?.abbreviation)?.toUpperCase(), row]));
  const away = byTeam.get(awayId);
  const home = byTeam.get(homeId);
  if (!away && !home) return [];

  const sumPlayerStat = (teamId, key) => playerStats
    .filter((row) => firstString(row?.team?.abbreviation)?.toUpperCase() === teamId)
    .reduce((total, row) => total + (asNumberOrNull(row?.[key]) ?? 0), 0);
  const awaySacks = sumPlayerStat(awayId, 'defensive_sacks');
  const homeSacks = sumPlayerStat(homeId, 'defensive_sacks');
  const downs = (row, prefix) => ratio(row?.[`${prefix}_conversions`], row?.[`${prefix}_attempts`]);
  const redZone = (row) => ratio(row?.red_zone_scores, row?.red_zone_attempts);
  const penaltyValue = (row) => isReported(row?.penalties) || isReported(row?.penalty_yards)
    ? `${row?.penalties ?? '—'}–${row?.penalty_yards ?? '—'}`
    : null;

  return [
    makeGroup('offense', 'Offense', [
      comparison('Total yards', away?.total_yards, home?.total_yards),
      comparison('Passing yards', away?.net_passing_yards, home?.net_passing_yards),
      comparison('Rushing yards', away?.rushing_yards, home?.rushing_yards),
      comparison('Yards per play', away?.yards_per_play, home?.yards_per_play),
      comparison('First downs', away?.first_downs, home?.first_downs),
    ]),
    makeGroup('defense', 'Defense', [
      comparison('Passing yards allowed', home?.net_passing_yards, away?.net_passing_yards, 'lower'),
      comparison('Rushing yards allowed', home?.rushing_yards, away?.rushing_yards, 'lower'),
      comparison('Sacks', awaySacks, homeSacks),
      comparison('Takeaways', home?.turnovers, away?.turnovers),
    ]),
    makeGroup('situational', 'Situational', [
      comparison('Third down', efficiencyValue(away, 'third_down'), efficiencyValue(home, 'third_down'), 'higher', {
        awayRatio: downs(away, 'third_down'), homeRatio: downs(home, 'third_down'),
      }),
      comparison('Fourth down', efficiencyValue(away, 'fourth_down'), efficiencyValue(home, 'fourth_down'), 'higher', {
        awayRatio: downs(away, 'fourth_down'), homeRatio: downs(home, 'fourth_down'),
      }),
      comparison(
        'Red zone',
        isReported(away?.red_zone_scores) || isReported(away?.red_zone_attempts) ? `${away?.red_zone_scores ?? '—'}–${away?.red_zone_attempts ?? '—'}` : null,
        isReported(home?.red_zone_scores) || isReported(home?.red_zone_attempts) ? `${home?.red_zone_scores ?? '—'}–${home?.red_zone_attempts ?? '—'}` : null,
        'higher',
        { awayRatio: redZone(away), homeRatio: redZone(home) },
      ),
    ]),
    makeGroup('discipline', 'Discipline', [
      comparison('Turnovers', away?.turnovers, home?.turnovers, 'lower'),
      comparison('Penalties', penaltyValue(away), penaltyValue(home), 'lower', {
        awayRatio: asNumberOrNull(away?.penalty_yards), homeRatio: asNumberOrNull(home?.penalty_yards),
      }),
    ]),
    makeGroup('possession', 'Possession', [
      comparison('Time of possession', firstString(away?.possession_time), firstString(home?.possession_time), 'neutral', {
        awayRatio: parsePossessionSeconds(away), homeRatio: parsePossessionSeconds(home),
      }),
      comparison('Offensive plays', away?.total_offensive_plays, home?.total_offensive_plays, 'neutral'),
    ]),
  ].filter(Boolean);
}

function playerName(row) {
  return [row?.player?.first_name, row?.player?.last_name].filter(Boolean).join(' ').trim() || 'Unknown player';
}

function playerTeam(row) {
  return firstString(row?.team?.abbreviation, row?.player?.team?.abbreviation, 'NFL')?.toUpperCase() ?? 'NFL';
}

function hasProduction(row, keys) {
  return keys.some((key) => (asNumberOrNull(row?.[key]) ?? 0) !== 0);
}

function makePlayerGroup(id, label, columns, rows, keys, values, primaryKey) {
  const available = rows
    .filter((row) => hasProduction(row, keys))
    .sort((left, right) => (asNumberOrNull(right?.[primaryKey]) ?? 0) - (asNumberOrNull(left?.[primaryKey]) ?? 0))
    .map((row) => ({ team: playerTeam(row), player: playerName(row), values: values(row) }));
  return available.length ? { id, label, columns, rows: available } : null;
}

function buildPlayerGroups(rows = []) {
  const totalReturns = (row) => (asNumberOrNull(row?.kick_returns) ?? 0) + (asNumberOrNull(row?.punt_returns) ?? 0);
  const totalReturnYards = (row) => (asNumberOrNull(row?.kick_return_yards) ?? 0) + (asNumberOrNull(row?.punt_return_yards) ?? 0);
  return [
    makePlayerGroup('passing', 'Passing', ['C/ATT', 'YDS', 'TD', 'INT', 'RTG'], rows,
      ['passing_attempts', 'passing_completions', 'passing_yards', 'passing_touchdowns', 'passing_interceptions'],
      (row) => [`${formatStat(row.passing_completions)}/${formatStat(row.passing_attempts)}`, formatStat(row.passing_yards), formatStat(row.passing_touchdowns), formatStat(row.passing_interceptions), formatStat(row.qb_rating, { digits: 1 })],
      'passing_yards'),
    makePlayerGroup('rushing', 'Rushing', ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], rows,
      ['rushing_attempts', 'rushing_yards', 'rushing_touchdowns'],
      (row) => [formatStat(row.rushing_attempts), formatStat(row.rushing_yards), formatStat(row.yards_per_rush_attempt, { digits: 1 }), formatStat(row.rushing_touchdowns), formatStat(row.long_rushing)],
      'rushing_yards'),
    makePlayerGroup('receiving', 'Receiving', ['REC', 'TGT', 'YDS', 'AVG', 'TD'], rows,
      ['receptions', 'receiving_targets', 'receiving_yards', 'receiving_touchdowns'],
      (row) => [formatStat(row.receptions), formatStat(row.receiving_targets), formatStat(row.receiving_yards), formatStat(row.yards_per_reception, { digits: 1 }), formatStat(row.receiving_touchdowns)],
      'receiving_yards'),
    makePlayerGroup('defense', 'Defense', ['TOT', 'SOLO', 'SACK', 'TFL', 'PD'], rows,
      ['total_tackles', 'solo_tackles', 'defensive_sacks', 'tackles_for_loss', 'passes_defended'],
      (row) => [formatStat(row.total_tackles), formatStat(row.solo_tackles), formatStat(row.defensive_sacks, { digits: 1 }), formatStat(row.tackles_for_loss), formatStat(row.passes_defended)],
      'total_tackles'),
    makePlayerGroup('kicking', 'Kicking', ['FG', 'LONG', 'XP', 'PTS'], rows,
      ['field_goal_attempts', 'field_goals_made', 'extra_points_made', 'total_points'],
      (row) => [`${formatStat(row.field_goals_made)}/${formatStat(row.field_goal_attempts)}`, formatStat(row.long_field_goal_made), formatStat(row.extra_points_made), formatStat(row.total_points)],
      'total_points'),
    makePlayerGroup('punting', 'Punting', ['PUNTS', 'AVG', 'IN 20', 'LONG'], rows,
      ['punts', 'punt_yards', 'punts_inside_20'],
      (row) => [formatStat(row.punts), formatStat(row.gross_avg_punt_yards, { digits: 1 }), formatStat(row.punts_inside_20), formatStat(row.long_punt)],
      'punt_yards'),
    makePlayerGroup('returns', 'Returns', ['RET', 'YDS', 'AVG', 'LONG'], rows,
      ['kick_returns', 'kick_return_yards', 'punt_returns', 'punt_return_yards'],
      (row) => {
        const returns = totalReturns(row);
        const yards = totalReturnYards(row);
        return [String(returns), String(yards), returns ? (yards / returns).toFixed(1) : '—', formatStat(Math.max(asNumberOrNull(row.long_kick_return) ?? 0, asNumberOrNull(row.long_punt_return) ?? 0))];
      },
      'kick_return_yards'),
  ].filter(Boolean);
}

function shortPlayerName(row) {
  const first = firstString(row?.player?.first_name);
  const last = firstString(row?.player?.last_name);
  return [first ? `${first[0]}.` : null, last].filter(Boolean).join(' ') || '—';
}

function buildLeaders(rows = [], awayId, homeId) {
  const categories = [
    { label: 'Passing', key: 'passing_yards', suffix: 'YDS', touchdownKey: 'passing_touchdowns' },
    { label: 'Rushing', key: 'rushing_yards', suffix: 'YDS', touchdownKey: 'rushing_touchdowns' },
    { label: 'Receiving', key: 'receiving_yards', suffix: 'YDS', touchdownKey: 'receiving_touchdowns' },
  ];
  const leaderFor = (teamId, category) => rows
    .filter((row) => playerTeam(row) === teamId && (asNumberOrNull(row?.[category.key]) ?? 0) > 0)
    .sort((left, right) => Number(right[category.key]) - Number(left[category.key]))[0];
  return categories.map((category) => {
    const away = leaderFor(awayId, category);
    const home = leaderFor(homeId, category);
    if (!away && !home) return null;
    const copy = (row) => {
      if (!row) return '—';
      const touchdowns = asNumberOrNull(row[category.touchdownKey]) ?? 0;
      return `${shortPlayerName(row)} · ${formatStat(row[category.key])} ${category.suffix}${touchdowns ? `, ${touchdowns} TD` : ''}`;
    };
    return { label: category.label, away: copy(away), home: copy(home) };
  }).filter(Boolean);
}

function normalizeQuarterValues(game, rawGame) {
  const rawAway = [1, 2, 3, 4].map((quarter) => asNumberOrNull(rawGame?.[`visitor_team_q${quarter}`]));
  const rawHome = [1, 2, 3, 4].map((quarter) => asNumberOrNull(rawGame?.[`home_team_q${quarter}`]));
  const awayOt = asNumberOrNull(rawGame?.visitor_team_ot);
  const homeOt = asNumberOrNull(rawGame?.home_team_ot);
  if (awayOt != null || homeOt != null) {
    rawAway.push(awayOt);
    rawHome.push(homeOt);
  }
  const fallback = game?.quarterScores ?? { away: null, home: null };
  const away = rawAway.some((value) => value != null) ? rawAway : fallback.away ?? [];
  const home = rawHome.some((value) => value != null) ? rawHome : fallback.home ?? [];
  const length = Math.max(away.length, home.length);
  if (!length) return { labels: [], away: [], home: [] };
  const completed = game?.status === 'final';
  const valueFor = (values, index) => {
    const value = values[index];
    return value == null ? completed ? 0 : '—' : value;
  };
  return {
    labels: [...Array.from({ length }, (_, index) => index < 4 ? String(index + 1) : 'OT'), 'T'],
    away: [...Array.from({ length }, (_, index) => valueFor(away, index)), game?.score?.away ?? rawGame?.visitor_team_score ?? '—'],
    home: [...Array.from({ length }, (_, index) => valueFor(home, index)), game?.score?.home ?? rawGame?.home_team_score ?? '—'],
  };
}

export function buildScoreDetailFromGame(game, {
  providerDetail = null,
  detailStatus = 'unavailable',
  detailError = null,
  rawPlays = providerDetail?.plays ?? [],
  playsStatus = detailStatus,
  playsError = detailError,
} = {}) {
  const rawGame = providerDetail?.game ?? null;
  const teamStats = providerDetail?.teamStats ?? [];
  const playerStats = providerDetail?.playerStats ?? [];
  const quarterValues = normalizeQuarterValues(game, rawGame);
  const detailsProvider = game?.detailsProvider ?? game?.provider;
  const supportsBdlDetail = detailsProvider === 'balldontlie';
  const drives = supportsBdlDetail ? groupBdlPlaysIntoDrives(rawPlays, game) : [];
  const awayId = game?.away?.id ?? teamFromBdl(rawGame?.visitor_team).id;
  const homeId = game?.home?.id ?? teamFromBdl(rawGame?.home_team).id;
  const statGroups = buildTeamStatGroups(teamStats, playerStats, awayId, homeId);
  const playerGroups = buildPlayerGroups(playerStats);
  const playByPlayAvailable = detailStatus === 'ready' && drives.length > 0;
  return {
    status: game?.status ?? 'scheduled',
    statusLabel: game?.statusLabel ?? 'Scheduled',
    venue: rawGame?.venue ?? game?.venue ?? 'Venue TBD',
    network: game?.network ?? 'TV TBD',
    away: game?.away ?? teamFromBdl(rawGame?.visitor_team),
    home: game?.home ?? teamFromBdl(rawGame?.home_team),
    score: game?.score ?? { away: null, home: null },
    possession: game?.live?.possession ?? drives.at(-1)?.team ?? null,
    quarterLabels: quarterValues.labels,
    lineScore: {
      away: quarterValues.away,
      home: quarterValues.home,
    },
    leaders: buildLeaders(playerStats, awayId, homeId),
    statGroups,
    playerGroups,
    scoring: drives.flatMap((drive) => drive.plays.filter((play) => play.scoring).map((play) => ({
      quarter: play.quarter,
      time: play.time,
      team: play.team,
      title: play.description,
      detail: play.type ?? 'BALLDONTLIE play-by-play',
      score: play.score ?? 'Score unavailable',
    }))),
    drives,
    provider: detailsProvider ?? 'espn',
    coverage: {
      plays: playByPlayAvailable,
      playsStatus,
      playsError,
      scoreboard: true,
      teamStats: detailStatus === 'ready' && statGroups.length > 0,
      playerStats: detailStatus === 'ready' && playerGroups.length > 0,
      scoring: drives.some((drive) => drive.plays.some((play) => play.scoring)),
      detailStatus,
      detailError,
    },
    cache: providerDetail?.cache ?? null,
  };
}
