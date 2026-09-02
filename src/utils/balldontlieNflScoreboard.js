import { NFL_SEASON_PHASES } from './espnNflScoreboard.js';
import { reconcileProviderClockAnchor } from './providerAnchoredGameClock.js';
import { NFL_SCOREBOARD_TIME_ZONE } from './statisticsScoresGrouping.js';
import {
  NON_SNAP_SLUGS,
  canonicalTeam,
  getOffenseTeam,
  isNonSnapPlay,
  isTurnoverOnDowns,
} from './nflPlays/fieldGeometry.js';
import { enrichPlaySequenceContext } from './nflPlays/playSequenceContext.js';

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

function attachInitialBdlClockAnchor(game, payload) {
  if (!game?.live?.clock) return game;
  const providerFetchedAt = payload?.freshness?.providerFetchedAt;
  const observedAt = payload?.freshness?.receivedAt ?? providerFetchedAt;
  if (!providerFetchedAt && !observedAt) return game;
  return reconcileProviderClockAnchor(null, game, {
    observedAt,
    providerFetchedAt,
    feedStale: payload?.freshness?.stale === true || payload?.cache?.stale === true,
  });
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
  if (phase === NFL_SEASON_PHASES.PRESEASON) {
    const sourceGames = getRawGames(payload)
      .filter((game) => getBdlGamePhase(game) === phase);
    const hasProviderWeeks = sourceGames.some((game) => Number.isInteger(Number(game?.week)));
    const derivedGames = normalizedSeason.weeks.find((entry) => entry.week === week)?.games ?? [];
    const providerGames = normalizedSeason.games.filter((game) => game.week === week);
    const legacyOrdinaryGames = week > 1
      ? derivedGames.filter((game) => Number(game.week) === 1 && !isHallOfFameGame(game))
      : [];
    const games = !hasProviderWeeks || week === 1
      ? derivedGames
      : [...providerGames, ...legacyOrdinaryGames.filter((game) => (
        !providerGames.some((providerGame) => providerGame.id === game.id)
      ))];
    return {
      ...makeWeek(week, phase, [...games]),
      season,
    };
  }
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
    ? capabilities.stats === true
      || capabilities.teamStats === true
      || capabilities.plays === true
      || capabilities.storyStats === true
    : true;
  const playByPlayAvailable = capabilities ? capabilities.plays === true : null;
  const sourceGames = getRawGames(payload)
    .filter((game) => getBdlGamePhase(game) === phase);
  const games = sourceGames
    .map((game) => normalizeBdlGame(game, { phase, detailsAvailable, playByPlayAvailable }))
    .filter(Boolean)
    .map((game) => attachInitialBdlClockAnchor(game, payload));
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
  providerFetchedAt = payload?.freshness?.providerFetchedAt
    ?? payload?.freshness?.receivedAt
    ?? payload?.cache?.fetchedAt,
} = {}) {
  const replacement = normalizeBdlScoreboardWeek(payload, {
    season: seasonData?.season,
    phase: seasonData?.phase ?? NFL_SEASON_PHASES.REGULAR,
    week: weekNumber,
  });
  const feedStale = payload?.freshness?.stale === true || payload?.cache?.stale === true;
  const liveSnapshotsByGameId = new Map((payload?.liveGameSnapshots ?? [])
    .filter((snapshot) => snapshot?.gameId != null)
    .map((snapshot) => [String(snapshot.gameId), snapshot]));
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
      const withGameSnapshot = reconcileProviderClockAnchor(previousGame, merged, {
        observedAt,
        providerFetchedAt,
        feedStale,
      });
      const liveSnapshot = liveSnapshotsByGameId.get(providerId);
      if (!liveSnapshot?.latestPlay) return withGameSnapshot;
      const play = normalizeBdlScorePlay(liveSnapshot.latestPlay, withGameSnapshot);
      const updatedAt = liveSnapshot.freshness?.providerFetchedAt
        ?? liveSnapshot.freshness?.receivedAt
        ?? liveSnapshot.cache?.fetchedAt
        ?? providerFetchedAt;
      const latestPlay = {
        status: 'ready',
        play,
        stale: liveSnapshot.freshness?.stale === true || liveSnapshot.cache?.stale === true,
        updatedAt,
        observedAt,
        clockAnchorAt: play?.wallclock ?? updatedAt,
        error: null,
      };
      const withCanonicalPlay = mergeBdlLatestPlayClock(
        mergeBdlLatestPlayScore(withGameSnapshot, latestPlay),
        latestPlay,
      );
      return { ...withCanonicalPlay, latestPlay };
    });

    (week.games ?? []).forEach((game) => {
      const providerId = game?.bdlGameId ?? game?.providerGameId;
      if (providerId == null || !replacementIds.has(String(providerId))) {
        const staleLiveGame = game.status === 'live' && game.live?.clock
          ? reconcileProviderClockAnchor(game, game, {
            observedAt,
            providerFetchedAt,
            feedStale: true,
          })
          : game;
        games.push(staleLiveGame);
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
    // Structured fields carried through for the play narrative parser and the
    // field/win-probability visuals. `*_yards_to_endzone`, `end_down_distance_text`,
    // and `end_possession_text` are absent from BALLDONTLIE's published OpenAPI spec
    // but present on every live play row, so every consumer must tolerate null.
    typeSlug: firstString(play.type_slug, play.type_abbreviation),
    shortText: firstString(play.short_text),
    rawText: firstString(play.text, play.short_text),
    startDown: asNumberOrNull(play.start_down),
    startDistance: asNumberOrNull(play.start_distance),
    endDown: asNumberOrNull(play.end_down),
    endDistance: asNumberOrNull(play.end_distance),
    startYardsToEndzone: asNumberOrNull(play.start_yards_to_endzone),
    endYardsToEndzone: asNumberOrNull(play.end_yards_to_endzone),
    // Absolute yard lines, measured from the home goal line. Unlike the
    // `*_yards_to_endzone` pair above these never change frame, so the field
    // graphics read position from them first.
    startYardLine: asNumberOrNull(play.start_yard_line),
    endYardLine: asNumberOrNull(play.end_yard_line),
    startPossessionText: firstString(play.start_possession_text),
    endPossessionText: firstString(play.end_possession_text),
    endDownDistanceText: firstString(play.end_down_distance_text),
    statYardage: asNumberOrNull(play.stat_yardage),
    // GridShift may recover the passer on a provider summary-only pick-six
    // from earlier, positively identified passes in the same possession. This
    // is app-owned context, never presented as a provider-supplied field.
    inferredPasserName: firstString(play.gridshift_inferred_passer_name),
    homeWinProbability: asNumberOrNull(play.home_win_probability),
    awayScore: asScore(play.away_score),
    homeScore: asScore(play.home_score),
  };
}

function parseBdlClockSeconds(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) return null;
  return (minutes * 60) + seconds;
}

function getBdlClockProgress(period, clock) {
  const periodNumber = Number(period);
  const clockSeconds = parseBdlClockSeconds(clock);
  if (!Number.isInteger(periodNumber) || periodNumber < 1 || clockSeconds == null) return null;
  return ((periodNumber - 1) * 900) + (900 - Math.min(900, clockSeconds));
}

function timestampValue(value) {
  if (Number.isFinite(value)) return Number(value);
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function latestPlayFetchedAt(latestPlay) {
  return timestampValue(latestPlay?.updatedAt) ?? timestampValue(latestPlay?.observedAt);
}

function gameProviderFetchedAt(game) {
  return timestampValue(game?.live?.providerClockAnchor?.providerFetchedAt)
    ?? timestampValue(game?.asOf)
    ?? timestampValue(game?.live?.providerClockAnchor?.changedAt);
}

function gameTeamId(game, teamId) {
  const normalized = canonicalTeam(teamId);
  if (!normalized) return null;
  return [game?.away, game?.home]
    .find((team) => canonicalTeam(team?.id) === normalized)
    ?.id ?? null;
}

function latestPlaySituation(game, play) {
  const live = game?.live;
  if (!live || !play || isNonSnapPlay(play)) return live;

  const possession = gameTeamId(game, play.team);
  // The scorecard presents the latest snap's starting down and spot. Keep its
  // red-zone label in that same frame: a scoring play can end at the goal line
  // even when a long field goal or touchdown began outside the opponent 20.
  const yardsToEndzone = play.startYardsToEndzone;
  const hasValidYardsToEndzone = yardsToEndzone != null
    && yardsToEndzone !== ''
    && Number.isFinite(Number(yardsToEndzone));

  return {
    ...live,
    possession: possession ?? live.possession ?? null,
    downDistance: play.down ?? live.downDistance ?? null,
    fieldPosition: play.spot && play.spot !== '—' ? play.spot : live.fieldPosition ?? null,
    redZone: hasValidYardsToEndzone ? Number(yardsToEndzone) <= 20 : live.redZone,
  };
}

/**
 * Apply a newer BDL play clock to a live scorecard without allowing an older
 * play response to replace a fresher game snapshot. The play clock is a
 * discrete provider-verified value; the UI does not interpolate it.
 */
export function mergeBdlLatestPlayClock(game, latestPlay) {
  if (game?.provider !== 'balldontlie' || game.status !== 'live' || !game.live) return game;
  if (!latestPlay?.play || latestPlay.stale === true) return game;

  const playPeriod = latestPlay.play.period;
  const playClock = latestPlay.play.time;
  const playProgress = getBdlClockProgress(playPeriod, playClock);
  const mergedSituation = latestPlaySituation(game, latestPlay.play);
  if (playProgress == null) {
    return { ...game, live: mergedSituation };
  }

  const gameProgress = getBdlClockProgress(game.live.period, game.live.clock);
  const providerClockFrozen = isNonSnapPlay(latestPlay.play);
  if (gameProgress != null && playProgress < gameProgress && !providerClockFrozen) return game;

  const observedAt = timestampValue(latestPlay.observedAt) ?? timestampValue(latestPlay.updatedAt);
  const providerFetchedAt = timestampValue(latestPlay.clockAnchorAt) ?? observedAt;
  const merged = {
    ...game,
    live: {
      ...mergedSituation,
      period: String(playPeriod),
      clock: playClock,
    },
  };
  return reconcileProviderClockAnchor(game, merged, {
    observedAt,
    providerFetchedAt,
    feedStale: latestPlay.stale === true,
    providerClockFrozen,
  });
}

/**
 * Apply post-play scores to a live scorecard when the latest-play lane has
 * moved at least as far through the game, or its provider response is fresher
 * than the current scoreboard snapshot. An older or stale play must never
 * roll a score back.
 */
export function mergeBdlLatestPlayScore(game, latestPlay) {
  if (game?.provider !== 'balldontlie' || game.status !== 'live' || !game.live) return game;
  if (!latestPlay?.play || latestPlay.stale === true) return game;

  const awayScore = latestPlay.play.awayScore;
  const homeScore = latestPlay.play.homeScore;
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return game;

  // Plays can lag the Games total at the same clock (most visibly when a
  // touchdown row arrives before its conversion row). A play may advance a
  // score, but score reductions/corrections remain authoritative to Games.
  const currentAwayScore = asScore(game.awayScore ?? game.score?.away);
  const currentHomeScore = asScore(game.homeScore ?? game.score?.home);
  if ((currentAwayScore != null && awayScore < currentAwayScore)
    || (currentHomeScore != null && homeScore < currentHomeScore)) {
    return game;
  }

  const playProgress = getBdlClockProgress(latestPlay.play.period, latestPlay.play.time);
  if (playProgress == null) return game;
  const gameProgress = getBdlClockProgress(game.live.period, game.live.clock);
  const playFetchedAt = latestPlayFetchedAt(latestPlay);
  const gameFetchedAt = gameProviderFetchedAt(game);
  if (gameProgress != null && playProgress <= gameProgress
    && (playFetchedAt == null || gameFetchedAt == null || playFetchedAt <= gameFetchedAt)) {
    return game;
  }

  return {
    ...game,
    score: { away: awayScore, home: homeScore },
    awayScore,
    homeScore,
  };
}

function periodBoundaryValues(play) {
  return [play?.text, play?.short_text, play?.type_text, play?.type_abbreviation, play?.type_slug]
    .map((value) => String(value ?? '').trim().replace(/[_.-]+/g, ' '))
    .filter(Boolean);
}

function isEndOfGamePlay(play) {
  return periodBoundaryValues(play).some((value) => /^end(?:\s+of)?\s+game$/i.test(value));
}

function isTwoMinuteWarningPlay(play) {
  return periodBoundaryValues(play).some((value) => /^two\s+minute\s+warning$/i.test(value));
}

function isPeriodBoundaryPlay(play) {
  return periodBoundaryValues(play)
    .some((value) => /^end(?:\s+of)?\s+(?:quarter(?:\s*[1-4])?|half|game)$/i.test(value));
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

/** The provider row that the full drilldown feed will place last. */
export function getLatestBdlScorePlay(plays = []) {
  return sortBdlPlaysChronologically(plays).at(-1) ?? null;
}

function playClockSeconds(play) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(play?.clock_display ?? play?.clock ?? '').trim());
  if (!match || Number(match[2]) > 59) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function displayPlayClock(play) {
  const seconds = playClockSeconds(play);
  if (seconds == null) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Describe the rare final state where the provider closes a game at the
 * two-minute warning. The explicit stoppage plus equal wallclock timestamps
 * distinguish it from a normal final snap whose remaining clock expires
 * without generating another play row.
 */
function getBdlFinalGameTerminal(plays = [], gameStatus) {
  if (gameStatus !== 'final') return null;
  const chronological = sortBdlPlaysChronologically(plays);
  const terminalIndex = chronological.length - 1;
  if (terminalIndex < 1 || !isEndOfGamePlay(chronological[terminalIndex])) return null;

  const terminal = chronological[terminalIndex];
  const preceding = chronological[terminalIndex - 1];
  if (!isTwoMinuteWarningPlay(preceding)) return null;
  const terminalAt = Date.parse(terminal?.wallclock ?? '');
  const precedingAt = Date.parse(preceding?.wallclock ?? '');
  const remaining = playClockSeconds(preceding);
  if (!Number.isFinite(terminalAt) || terminalAt !== precedingAt || remaining == null || remaining <= 0) return null;
  return {
    kind: 'ended-with-time-remaining',
    clock: displayPlayClock(preceding),
  };
}

// Clock stoppages, and the kickoff that follows a score. None of them are
// snaps the offense ran, so none of them belong in a drive's play count even
// though they stay in the play list. The stoppages are shared with the field
// graphics, which have to reject the same rows for the same reason.
const UNCOUNTED_SLUGS = new Set([...NON_SNAP_SLUGS, 'kickoff']);

function isCountedPlay(play) {
  return !UNCOUNTED_SLUGS.has(String(play?.typeSlug ?? ''));
}

function countedPlays(plays) {
  return plays.filter(isCountedPlay).length;
}

// Q1-Q2, Q3-Q4, then overtime. A drive can run across a quarter break but
// never across halftime, and the provider's own end-of-half marker is filtered
// out before grouping, so the period is the only thing left to split on.
function halfOf(play) {
  const period = Number(play?.period);
  return Number.isFinite(period) && period >= 1 ? Math.ceil(period / 2) : null;
}

/**
 * What the drive is called, from how it ended.
 *
 * A scoring drive is named by its scoring play, because the kickoff that
 * follows the score now sits at the end of the drive that produced it. Every
 * other drive is named by its last play, which since the grouping fix is the
 * punt, the miss or the turnover that actually ended the possession rather
 * than the opening play of the next one.
 */
function inferDriveResult(plays) {
  // The scoring play's slug settles it before its text does. A touchdown's
  // description is the highlight line — "Jared Wayne 5 Yd pass from Davis
  // Mills" — and never contains the word, so reading only the text labelled
  // every touchdown drive a plain "Drive".
  const scoringPlay = [...plays].reverse().find((play) => play.scoring);
  const scoringSlug = String(scoringPlay?.typeSlug ?? '').toLowerCase();
  const scoringText = scoringPlay?.description ?? '';
  if (/touchdown/.test(scoringSlug) || /touchdown/i.test(scoringText)) return 'Touchdown';
  if (/safety/.test(scoringSlug) || /safety/i.test(scoringText)) return 'Safety';
  if (/field.?goal/.test(scoringSlug) || /field goal/i.test(scoringText)) return 'Field Goal';

  // The play the possession actually ended on — not the clock stoppage that
  // followed it, and not the kickoff that ends a scoring drive.
  const finishing = [...plays].reverse().find(isCountedPlay) ?? plays.at(-1);
  const text = finishing?.description ?? '';
  if (/touchdown/i.test(text)) return 'Touchdown';
  if (/intercept/i.test(text)) return 'Interception';
  if (/fumble/i.test(text)) return 'Fumble';
  // "No Good" has to be read before "field goal" or a miss reads as a make.
  if (/no good|is blocked|blocked by/i.test(text)) return 'Missed FG';
  if (/field goal/i.test(text)) return 'Field Goal';
  if (/punt/i.test(text)) return 'Punt';
  // The provider never spells a turnover on downs out; the fourth down that
  // came up short is the only record of it.
  if (/turnover on downs|downs/i.test(text) || isTurnoverOnDowns(finishing)) return 'Downs';
  if (/kneel|end of (?:half|game)/i.test(text)) {
    return Number(finishing?.period) >= 4 ? 'End of game' : 'End of half';
  }
  return 'Drive';
}

/**
 * A drive is a possession, so it needs at least one play the offense ran.
 *
 * The kickoff that opens a half belongs to the kicking team but has no drive
 * of theirs to end, so on its own it would stand as a one-play drive. Fold any
 * group that is nothing but a kickoff and clock stoppages into the possession
 * it leads into. Anything with a real play in it is a drive, including feeds
 * that report no down and distance at all.
 */
function foldGroupsWithoutSnaps(groups) {
  const isTransitionOnly = (group) => group.plays
    .every((play) => UNCOUNTED_SLUGS.has(String(play?.typeSlug ?? '')));
  const drives = [];
  let pending = [];
  groups.forEach((group) => {
    if (isTransitionOnly(group)) {
      pending.push(...group.plays);
      return;
    }
    group.plays = [...pending, ...group.plays];
    pending = [];
    drives.push(group);
  });
  if (pending.length) {
    if (drives.length) drives.at(-1).plays.push(...pending);
    else drives.push({ team: groups[0]?.team ?? null, plays: pending });
  }
  return drives;
}

function describeDrive(group, index) {
  const { plays } = group;
  const scoringPlay = [...plays].reverse().find((play) => play.scoring);
  const playCount = countedPlays(plays);
  return {
    id: `drive-${index + 1}`,
    team: group.team,
    quarter: plays.at(-1)?.quarter ?? plays[0]?.quarter ?? 'Game',
    result: inferDriveResult(plays),
    // Only a drive that actually scored carries a score. Every play reports the
    // running score, so taking the latest one marked every drive as scoring.
    score: scoringPlay?.score ?? '',
    playCount,
    summary: `${playCount} ${playCount === 1 ? 'play' : 'plays'}`,
    plays,
    // Field extrema so callers can size an axis without rescanning plays.
    startYardsToEndzone: plays.find((play) => play.startYardsToEndzone != null)?.startYardsToEndzone ?? null,
    endYardsToEndzone: [...plays].reverse().find((play) => play.endYardsToEndzone != null)?.endYardsToEndzone ?? null,
  };
}

export function groupBdlPlaysIntoDrives(plays = [], game) {
  const homeTeam = game?.home?.id ?? null;
  const awayTeam = game?.away?.id ?? null;
  const normalized = enrichPlaySequenceContext(sortBdlPlaysChronologically(plays)
    .filter((play) => !isPeriodBoundaryPlay(play))
    .map((play) => normalizeBdlScorePlay(play, game))
    .filter(Boolean), { homeTeam, awayTeam });

  // Group by the team that ran each play, not by `team` — which names whoever
  // finished with the ball. Grouping on `team` filed a punt under the returning
  // side, so every drive opened with the previous possession's last play and
  // ran two possessions long.
  const groups = [];
  normalized.forEach((play) => {
    const current = groups.at(-1);
    const team = getOffenseTeam(play, { homeTeam, awayTeam }) ?? current?.team ?? awayTeam ?? 'NFL';
    const half = halfOf(play) ?? current?.half ?? null;
    // Halftime always breaks the drive, even when the same offense takes the
    // field on both sides of it — otherwise the second-half kickoff lands at
    // the end of that team's last first-half possession.
    if (!current || current.team !== team || current.half !== half) {
      groups.push({ team, half, plays: [play] });
      return;
    }
    current.plays.push(play);
  });

  return foldGroupsWithoutSnaps(groups).map(describeDrive);
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
  const terminal = supportsBdlDetail ? getBdlFinalGameTerminal(rawPlays, game?.status) : null;
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
    terminal,
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
