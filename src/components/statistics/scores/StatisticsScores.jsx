import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getStatisticsScoresEspnWeek,
  getStatisticsScoresGames,
  getStatisticsScoresLiveWeek,
  getStatisticsScoresStatus,
} from '../../../api/statisticsScoresApi';
import useMediaQuery from '../../../hooks/useMediaQuery';
import useHorizontalScrollCue from '../../../hooks/useHorizontalScrollCue';
import HorizontalScrollCue from '../../HorizontalScrollCue';
import SeasonPhaseToggle from '../SeasonPhaseToggle';
import { useFantasyLeague } from '../../../context/SleeperContext.jsx';
import {
  NFL_SEASON_PHASES,
  fetchEspnPreseason,
  fetchEspnRegularSeason,
  normalizeCrosswalkTeamId,
  overlayEspnBroadcastsWeek,
  overlayEspnScoreboardWeek,
  readStoredNflSeasonPhase,
  writeStoredNflSeasonPhase,
} from '../../../utils/espnNflScoreboard';
import {
  normalizeBdlScoreboardSeason,
  overlayBdlScoreboardWeek,
} from '../../../utils/balldontlieNflScoreboard';
import {
  resolveStatisticsScoresProvider,
  STATISTICS_SCORES_PROVIDERS,
} from '../../../utils/statisticsScoresProvider';
import { isStatisticsScoresDrilldownStatus } from '../../../utils/statisticsScoresDrilldown';
import {
  resolveStatisticsScoresCurrentWeekId,
  resolveStatisticsScoresWeekId,
} from '../../../utils/statisticsScoresWeek';
import ScoresSeasonBoard from './ScoresSeasonBoard';
import ScoresGameDrilldown from './ScoresGameDrilldown';
import './StatisticsScores.css';

if (import.meta.env.DEV) {
  import('./StatisticsScores.dev.css');
}

const LIVE_REFRESH_INTERVAL_MS = 8_000;
const BDL_LIVE_REFRESH_INTERVAL_MS = 1_000;
const IDLE_REFRESH_INTERVAL_MS = 30_000;
const MAX_REFRESH_BACKOFF_MS = 120_000;
const DEVELOPER_SOURCE_ENABLED = import.meta.env.DEV;
const LOAD_DEVELOPER_FIXTURES = import.meta.env.DEV
  ? () => import('../../../data/statisticsScoresFixtures')
  : null;
let developerFixturesPromise = null;
let tourFixturesPromise = null;
const PRODUCTION_SEASON = new Date().getFullYear();
const EMPTY_FEED_STATE = Object.freeze({ status: 'loading', data: null, error: null, updatedAt: null });
const DEVELOPER_SOURCES = Object.freeze([
  { id: STATISTICS_SCORES_PROVIDERS.FIXTURE, label: 'Fixture' },
  { id: STATISTICS_SCORES_PROVIDERS.ESPN, label: 'ESPN live' },
  { id: STATISTICS_SCORES_PROVIDERS.BALLDONTLIE, label: 'BALLDONTLIE API' },
]);

function scoresGameRouteId(game) {
  const candidate = [game?.bdlGameId, game?.providerGameId, game?.espnEventId, game?.eventId, game?.id]
    .find((value) => value != null && String(value).trim());
  return candidate == null ? null : String(candidate);
}

function scoresGameMatchesRouteId(game, routeGameId) {
  if (routeGameId == null) return false;
  const target = String(routeGameId);
  return [game?.bdlGameId, game?.providerGameId, game?.espnEventId, game?.eventId, game?.id]
    .some((value) => value != null && String(value) === target);
}

function scoresWeekMatchesRouteValue(week, routeWeek) {
  if (routeWeek == null) return false;
  const target = String(routeWeek).trim().toLowerCase();
  const id = String(week?.id ?? '').trim().toLowerCase();
  if (id === target) return true;
  if (Number.isInteger(Number(week?.week)) && String(Number(week.week)) === target) return true;
  return id.replace(/^(?:pre|reg)-/, '') === target;
}

function scoresWeekRouteValue(week) {
  if (!week) return null;
  if (week.phase === 'postseason') return String(week.id);
  if (Number.isInteger(Number(week.week)) && Number(week.week) > 0) return Number(week.week);
  const numericId = String(week.id ?? '').match(/^(?:pre|reg)-(\d+)$/)?.[1];
  return numericId ? Number(numericId) : String(week.id ?? '');
}

function findScoresWeek(weeks, routeWeek) {
  return (weeks ?? []).find((week) => scoresWeekMatchesRouteValue(week, routeWeek)) ?? null;
}

function scoresGameMatchesTeams(game, awayTeamId, homeTeamId) {
  if (!awayTeamId || !homeTeamId) return false;
  const gameAway = normalizeCrosswalkTeamId(game?.away?.id ?? game?.awayTeam);
  const gameHome = normalizeCrosswalkTeamId(game?.home?.id ?? game?.homeTeam);
  return gameAway === normalizeCrosswalkTeamId(awayTeamId) && gameHome === normalizeCrosswalkTeamId(homeTeamId);
}

function findScoresGame(weeks, routeGameId, routeWeek, awayTeamId, homeTeamId) {
  const idMatch = routeGameId != null
    ? (weeks ?? []).flatMap((week) => week.games ?? []).find((game) => scoresGameMatchesRouteId(game, routeGameId))
    : null;
  if (idMatch) return idMatch;
  // A game routed in from another surface (e.g. the Schedule tab) may carry an
  // id from a different provider than the one currently active here. The
  // matchup + week it links to is still unique, so fall back to that.
  if (!awayTeamId || !homeTeamId) return null;
  const week = findScoresWeek(weeks, routeWeek);
  return (week?.games ?? []).find((game) => scoresGameMatchesTeams(game, awayTeamId, homeTeamId)) ?? null;
}

function loadDeveloperFixtures() {
  if (!LOAD_DEVELOPER_FIXTURES) throw new Error('Local score fixtures are available only in development.');
  developerFixturesPromise ??= LOAD_DEVELOPER_FIXTURES();
  return developerFixturesPromise;
}

function loadTourFixtures() {
  tourFixturesPromise ??= import('../../../data/statisticsScoresTourDemo');
  return tourFixturesPromise;
}

function formatUpdatedLabel(value, provider = STATISTICS_SCORES_PROVIDERS.ESPN, scoreboardProvider = provider) {
  if (provider === STATISTICS_SCORES_PROVIDERS.FIXTURE) return 'Fixture data';
  const source = scoreboardProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
    ? 'BALLDONTLIE live scores'
    : provider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
      ? 'ESPN fallback scores · BALLDONTLIE details'
      : DEVELOPER_SOURCE_ENABLED ? 'ESPN live scores' : 'ESPN scores';
  if (!value) return `Live ${source}`;
  return `Live ${source} · updated ${value.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

function getLiveRefreshDelay(payload, { hasLiveGames, activeProvider }) {
  const freshnessDelay = Number(payload?.freshness?.refreshAfterMs);
  if (Number.isFinite(freshnessDelay) && freshnessDelay > 0) return freshnessDelay;
  const liveEnabled = payload?.cadence?.scoresLiveEnabled !== false;
  const cadenceDelay = hasLiveGames && liveEnabled
    ? Number(payload?.cadence?.scoresLiveMs)
    : Number(payload?.cadence?.scoresIdleMs);
  if (Number.isFinite(cadenceDelay) && cadenceDelay > 0) return cadenceDelay;
  if (!hasLiveGames) return IDLE_REFRESH_INTERVAL_MS;
  return activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
    ? BDL_LIVE_REFRESH_INTERVAL_MS
    : LIVE_REFRESH_INTERVAL_MS;
}

function getLiveRefreshTimestamp(payload) {
  const candidates = [
    payload?.freshness?.providerFetchedAt,
    payload?.freshness?.receivedAt,
    payload?.cache?.fetchedAt,
  ];
  const timestamp = candidates.map((value) => Date.parse(value ?? '')).find(Number.isFinite);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function getLiveFallbackNotice(reason) {
  if (reason === 'balldontlie-rate-limited') {
    return 'BALLDONTLIE is temporarily rate-limited. Showing ESPN scores while the live feed recovers.';
  }
  if (reason === 'balldontlie-live-lane-disabled') {
    return 'This BALLDONTLIE profile cannot sustain near-live polling. Showing ESPN scores.';
  }
  if (reason === 'no-balldontlie-key') {
    return 'No server-side BALLDONTLIE key is configured. Showing ESPN scores.';
  }
  if (reason) {
    return 'BALLDONTLIE is temporarily unavailable. Showing ESPN scores while the live feed recovers.';
  }
  return null;
}

async function fetchBdlScoreboardSeason({ season, phase, source, signal }) {
  const payload = await getStatisticsScoresGames({
    season,
    phase,
    source,
    signal,
  });
  return normalizeBdlScoreboardSeason(payload, { season, phase });
}

function WeekRail({ weeks, selectedWeekId, currentWeekId, onSelectWeek }) {
  const railRef = useRef(null);
  const cue = useHorizontalScrollCue(railRef, [weeks.length, selectedWeekId]);

  useEffect(() => {
    const rail = railRef.current;
    const selected = rail?.querySelector(`[data-week-id="${selectedWeekId}"]`);
    if (!rail || !selected) return;
    const left = selected.offsetLeft - ((rail.clientWidth - selected.clientWidth) / 2);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [selectedWeekId]);

  return (
    <div className="scores-week-rail-shell">
      <div ref={railRef} className="scores-week-rail" role="tablist" aria-label="NFL week">
        {weeks.map((week) => (
          <button
            key={week.id}
            type="button"
            role="tab"
            aria-selected={week.id === selectedWeekId}
            data-week-id={week.id}
            data-current={week.id === currentWeekId || undefined}
            onClick={() => onSelectWeek(week.id)}
          >
            <span>{week.shortLabel}</span>
            <small>
              {week.id === currentWeekId
                ? 'Now'
                : week.phase === 'postseason'
                  ? 'Playoffs'
                  : week.phase === NFL_SEASON_PHASES.PRESEASON ? 'Preseason' : 'Week'}
            </small>
          </button>
        ))}
      </div>
      <HorizontalScrollCue
        left={cue.left}
        right={cue.right}
        targetRef={railRef}
        label="NFL weeks"
        className="scores-week-scroll-cue"
      />
    </div>
  );
}

export default function StatisticsScores({
  tourDemoMode = null,
  routeSeason = null,
  routePhase = null,
  routeWeek = null,
  routeGameId = null,
  routeSection = 'overview',
  routePlayerGroup = null,
  routeAwayTeamId = null,
  routeHomeTeamId = null,
  onRouteChange = null,
}) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const {
    platform: fantasyPlatform,
    selectedLeagueId: fantasyLeagueId,
    season: fantasySeason,
    nflState,
    nflStateError,
    currentFantasyWeek,
  } = useFantasyLeague();
  const showPlayByPlayTourDemo = tourDemoMode === 'statistics-scores-play-by-play';
  const [tourFixture, setTourFixture] = useState(null);
  const [fixtureCatalog, setFixtureCatalog] = useState(null);
  const fixtureSeason = fixtureCatalog?.regular.season ?? PRODUCTION_SEASON;
  const availableSeasons = DEVELOPER_SOURCE_ENABLED
    ? fixtureCatalog?.seasons ?? [fixtureSeason]
    : [PRODUCTION_SEASON];
  const [storedSeasonPhase, setStoredSeasonPhase] = useState(readStoredNflSeasonPhase);
  const season = routeSeason ?? fixtureSeason;
  const seasonPhase = routePhase ?? storedSeasonPhase;
  const [developerSource, setDeveloperSource] = useState(
    DEVELOPER_SOURCE_ENABLED ? STATISTICS_SCORES_PROVIDERS.FIXTURE : null,
  );
  const [regularState, setRegularState] = useState(EMPTY_FEED_STATE);
  const [preseasonState, setPreseasonState] = useState(EMPTY_FEED_STATE);
  const [sourceState, setSourceState] = useState({
    status: DEVELOPER_SOURCE_ENABLED ? 'ready' : 'loading',
    provider: DEVELOPER_SOURCE_ENABLED ? STATISTICS_SCORES_PROVIDERS.FIXTURE : null,
    notice: null,
  });
  const espnBroadcastRequests = useRef(new Map());

  useEffect(() => {
    if (!showPlayByPlayTourDemo) {
      setTourFixture(null);
      return undefined;
    }

    let cancelled = false;
    loadTourFixtures().then((fixtures) => {
      if (cancelled) return;
      setTourFixture({
        game: fixtures.STATISTICS_SCORES_TOUR_GAME,
        detail: fixtures.STATISTICS_SCORES_TOUR_DETAIL,
      });
    });

    return () => { cancelled = true; };
  }, [showPlayByPlayTourDemo]);

  const currentSeason = season === fixtureSeason;
  const activeProvider = DEVELOPER_SOURCE_ENABLED
    ? developerSource
    : sourceState.provider ?? STATISTICS_SCORES_PROVIDERS.ESPN;
  const weeks = useMemo(
    () => {
      if (seasonPhase === NFL_SEASON_PHASES.PRESEASON) return preseasonState.data?.weeks ?? [];
      return regularState.data?.weeks ?? [];
    },
    [preseasonState.data, regularState.data, seasonPhase],
  );
  const sharedFantasyCurrentWeekId = useMemo(() => {
    if (
      seasonPhase !== NFL_SEASON_PHASES.REGULAR
      || !fantasyLeagueId
      || String(fantasySeason) !== String(season)
    ) return null;

    return resolveStatisticsScoresWeekId(weeks, currentFantasyWeek);
  }, [currentFantasyWeek, fantasyLeagueId, fantasySeason, season, seasonPhase, weeks]);
  // Do not canonicalize the bare Scores route from a persisted league week
  // before the shared live state has had a chance to replace it. Otherwise a
  // stale Week 2 snapshot can become an explicit `?week=2` route and keep the
  // page there even after Sleeper reports Week 3.
  const sharedFantasyCurrentWeekPending = seasonPhase === NFL_SEASON_PHASES.REGULAR
    && fantasyPlatform === 'sleeper'
    && Boolean(fantasyLeagueId)
    && String(fantasySeason) === String(season)
    && !nflState
    && !nflStateError;
  const currentWeekId = seasonPhase === NFL_SEASON_PHASES.PRESEASON
    ? resolveStatisticsScoresCurrentWeekId(weeks, { phase: seasonPhase })
    : sharedFantasyCurrentWeekId
      ?? (currentSeason && activeProvider === STATISTICS_SCORES_PROVIDERS.FIXTURE
        ? regularState.data?.currentWeekId ?? null
        : resolveStatisticsScoresCurrentWeekId(weeks, { phase: seasonPhase }));
  const routedGame = useMemo(
    () => findScoresGame(weeks, routeGameId, routeWeek, routeAwayTeamId, routeHomeTeamId),
    [routeAwayTeamId, routeGameId, routeHomeTeamId, routeWeek, weeks],
  );
  const routedGameWeek = useMemo(
    () => routedGame
      ? weeks.find((week) => (week.games ?? []).some((game) => game === routedGame)) ?? null
      : null,
    [routedGame, weeks],
  );
  const selectedWeek = useMemo(
    () => routedGameWeek
      ?? findScoresWeek(weeks, routeWeek)
      ?? weeks.find((week) => week.id === currentWeekId)
      ?? weeks[0]
      ?? null,
    [currentWeekId, routeWeek, routedGameWeek, weeks],
  );
  const liveCount = selectedWeek?.games.filter((game) => ['live', 'halftime', 'delayed'].includes(game.status)).length ?? 0;
  const selectedWeekNumber = Number.isInteger(selectedWeek?.week) ? selectedWeek.week : null;
  const selectedWeekHasLiveGames = selectedWeek?.games.some((game) => game.status === 'live') ?? false;
  const activeState = seasonPhase === NFL_SEASON_PHASES.PRESEASON ? preseasonState : regularState;
  const canOpenGame = activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
    || (activeProvider === STATISTICS_SCORES_PROVIDERS.FIXTURE
      && seasonPhase === NFL_SEASON_PHASES.REGULAR);
  const selectedGame = useMemo(() => {
    if (!routedGame || !canOpenGame || routedGame.detailsAvailable === false) return null;
    return isStatisticsScoresDrilldownStatus(routedGame.status) ? routedGame : null;
  }, [canOpenGame, routedGame]);
  const selectedGameRouteId = selectedGame ? scoresGameRouteId(selectedGame) : null;
  // The live-week response already contains the canonical provider game and
  // latest-play snapshot. Scorecards must not run a second polling or clock
  // interpolation path on top of it.
  const scorecardWeek = selectedWeek;
  useEffect(() => {
    if (DEVELOPER_SOURCE_ENABLED && developerSource !== STATISTICS_SCORES_PROVIDERS.BALLDONTLIE) {
      return undefined;
    }
    const controller = new AbortController();
    getStatisticsScoresStatus({ source: developerSource, signal: controller.signal })
      .then((providerStatus) => {
        if (controller.signal.aborted) return;
        setSourceState({
          status: 'ready',
          provider: resolveStatisticsScoresProvider({ providerStatus }),
          notice: providerStatus.available === false ? providerStatus.message : null,
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError' || controller.signal.aborted) return;
        if (DEVELOPER_SOURCE_ENABLED) {
          setSourceState({ status: 'error', provider: developerSource, notice: error.message });
          return;
        }
        setSourceState({
          status: 'ready',
          provider: STATISTICS_SCORES_PROVIDERS.ESPN,
          notice: 'Statistics Scores provider status is unavailable. Showing the clearly labeled ESPN fallback.',
        });
      });
    return () => controller.abort();
  }, [developerSource, seasonPhase]);

  useEffect(() => {
    if (sourceState.status !== 'ready') return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        let data;
        if (DEVELOPER_SOURCE_ENABLED && activeProvider === STATISTICS_SCORES_PROVIDERS.FIXTURE) {
          const fixtures = await loadDeveloperFixtures();
          if (controller.signal.aborted) return;
          setFixtureCatalog({
            regular: fixtures.STATISTICS_SCORES_FIXTURE,
            preseason: fixtures.STATISTICS_SCORES_PRESEASON_FIXTURE,
            seasons: fixtures.SCORES_FIXTURE_SEASONS,
            getDetail: fixtures.getScoreDetailFixture,
          });
          data = seasonPhase === NFL_SEASON_PHASES.PRESEASON
            ? fixtures.STATISTICS_SCORES_PRESEASON_FIXTURE
            : fixtures.STATISTICS_SCORES_FIXTURE;
        } else if (activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE) {
          data = await fetchBdlScoreboardSeason({
            season,
            phase: seasonPhase,
            source: developerSource,
            signal: controller.signal,
          });
        } else {
          data = seasonPhase === NFL_SEASON_PHASES.PRESEASON
            ? await fetchEspnPreseason({ season, signal: controller.signal })
            : await fetchEspnRegularSeason({ season, signal: controller.signal });
        }
        if (controller.signal.aborted) return;
        const withProvider = { ...data, provider: activeProvider };
        const nextState = { status: 'ready', data: withProvider, error: null, updatedAt: new Date() };
        if (seasonPhase === NFL_SEASON_PHASES.PRESEASON) setPreseasonState(nextState);
        else setRegularState(nextState);
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted) return;
        if (!DEVELOPER_SOURCE_ENABLED && activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE) {
          setSourceState((current) => ({
            ...current,
            provider: STATISTICS_SCORES_PROVIDERS.ESPN,
            notice: 'BALLDONTLIE is unavailable for this deployment right now. Showing ESPN scores instead.',
          }));
          return;
        }
        const errorState = { status: 'error', data: null, error: error.message, updatedAt: null };
        if (seasonPhase === NFL_SEASON_PHASES.PRESEASON) setPreseasonState(errorState);
        else setRegularState(errorState);
      }
    };
    void load();
    return () => controller.abort();
  }, [activeProvider, developerSource, season, seasonPhase, sourceState.status]);

  useEffect(() => {
    if (
      !onRouteChange
      || sharedFantasyCurrentWeekPending
      || sourceState.status !== 'ready'
      || activeState.status !== 'ready'
      || !selectedWeek
    ) return;

    const canonicalPhase = seasonPhase;
    const canonicalGameId = selectedGameRouteId;
    const canonicalSection = selectedGame ? routeSection : 'overview';
    const canonicalPlayerGroup = selectedGame && canonicalSection === 'players' ? routePlayerGroup : null;
    const sameValue = (left, right) => (left == null || right == null)
      ? left == null && right == null
      : String(left) === String(right);
    const alreadyCanonical = sameValue(routeSeason, season)
      && sameValue(routePhase, canonicalPhase)
      && sameValue(routeWeek, scoresWeekRouteValue(selectedWeek))
      && sameValue(routeGameId, canonicalGameId)
      && routeSection === canonicalSection
      && routePlayerGroup === canonicalPlayerGroup;

    if (!alreadyCanonical) {
      onRouteChange({
        statisticsScoresSeason: season,
        statisticsScoresPhase: canonicalPhase,
        statisticsScoresWeek: scoresWeekRouteValue(selectedWeek),
        statisticsScoresGameId: canonicalGameId,
        statisticsScoresSection: canonicalSection,
        statisticsScoresPlayerGroup: canonicalPlayerGroup,
        statisticsScoresAwayTeamId: null,
        statisticsScoresHomeTeamId: null,
      }, { replace: true });
    }
  }, [activeState.status, onRouteChange, routeGameId, routePhase, routePlayerGroup, routeSeason, routeSection, routeWeek, season, seasonPhase, selectedGame, selectedGameRouteId, selectedWeek, sharedFantasyCurrentWeekPending, sourceState.status]);

  useEffect(() => {
    if (activeProvider === STATISTICS_SCORES_PROVIDERS.FIXTURE
      || sourceState.status !== 'ready'
      || activeState.status !== 'ready'
      || !selectedWeekNumber) return undefined;
    const controller = new AbortController();
    let timeoutId = null;
    let requestInFlight = false;
    let consecutiveFailures = 0;
    let stopped = false;
    let latestEnvelope = null;
    const broadcastCacheKey = `${season}:${seasonPhase}:${selectedWeekNumber}`;
    const getEspnBroadcastPayload = () => {
      if (espnBroadcastRequests.current.has(broadcastCacheKey)) {
        return Promise.resolve(espnBroadcastRequests.current.get(broadcastCacheKey));
      }
      const request = getStatisticsScoresEspnWeek({
        season,
        week: selectedWeekNumber,
        phase: seasonPhase,
        signal: controller.signal,
      }).then((payload) => {
        espnBroadcastRequests.current.set(broadcastCacheKey, payload);
        return payload;
      }).catch((error) => {
        if (error.name === 'AbortError' || controller.signal.aborted) return null;
        espnBroadcastRequests.current.set(broadcastCacheKey, null);
        return null;
      });
      return request;
    };

    const scheduleRefresh = () => {
      if (stopped || document.visibilityState === 'hidden' || !navigator.onLine) return;
      const baseDelay = getLiveRefreshDelay(latestEnvelope, {
        hasLiveGames: selectedWeekHasLiveGames,
        activeProvider,
      });
      const configuredMaxBackoff = Number(latestEnvelope?.cadence?.maxBackoffMs);
      const maxBackoff = Number.isFinite(configuredMaxBackoff) && configuredMaxBackoff > 0
        ? configuredMaxBackoff
        : MAX_REFRESH_BACKOFF_MS;
      const backoffDelay = Math.min(baseDelay * (2 ** consecutiveFailures), maxBackoff);
      timeoutId = window.setTimeout(refresh, backoffDelay);
    };

    async function refresh() {
      if (stopped || requestInFlight || document.visibilityState === 'hidden' || !navigator.onLine) return;
      requestInFlight = true;
      try {
        const payloadPromise = activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
          ? getStatisticsScoresLiveWeek({
            season,
            week: selectedWeekNumber,
            phase: seasonPhase,
            signal: controller.signal,
          })
          : {
            provider: STATISTICS_SCORES_PROVIDERS.ESPN,
            ...await getStatisticsScoresEspnWeek({
              season,
              week: selectedWeekNumber,
              phase: seasonPhase,
              signal: controller.signal,
            }),
          };
        const espnBroadcastPayload = activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
          ? getEspnBroadcastPayload()
          : Promise.resolve(null);
        const [payload, resolvedEspnBroadcastPayload] = await Promise.all([payloadPromise, espnBroadcastPayload]);
        if (stopped || controller.signal.aborted) return;
        consecutiveFailures = 0;
        latestEnvelope = payload;
        const observedAt = Date.now();
        const providerFetchedAt = getLiveRefreshTimestamp(payload);
        const updatedAt = new Date(providerFetchedAt);
        const updateState = (current) => ({
          ...current,
          data: payload.provider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE && Array.isArray(payload.games)
            ? (() => {
              const withBdlLiveData = overlayBdlScoreboardWeek(current.data, payload, selectedWeekNumber, {
                observedAt,
                providerFetchedAt,
              });
              return resolvedEspnBroadcastPayload?.scoreboard
                ? overlayEspnBroadcastsWeek(withBdlLiveData, resolvedEspnBroadcastPayload.scoreboard, selectedWeekNumber)
                : withBdlLiveData;
            })()
            : overlayEspnScoreboardWeek(current.data, payload.scoreboard, selectedWeekNumber, {
              observedAt,
              providerFetchedAt,
              feedStale: payload.freshness?.stale === true || payload.cache?.stale === true,
            }),
          error: null,
          liveNotice: payload.provider === STATISTICS_SCORES_PROVIDERS.ESPN
            ? getLiveFallbackNotice(payload.fallbackReason)
            : null,
          liveEnvelope: {
            provider: payload.provider,
            capabilities: payload.capabilities ?? null,
            cadence: payload.cadence ?? null,
            rateLimit: payload.rateLimit ?? null,
            freshness: payload.freshness ?? null,
            cache: payload.cache ?? null,
          },
          updatedAt,
        });
        if (seasonPhase === NFL_SEASON_PHASES.PRESEASON) setPreseasonState(updateState);
        else setRegularState(updateState);
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted || stopped) return;
        consecutiveFailures += 1;
        const updateError = (current) => ({ ...current, error: error.message });
        if (seasonPhase === NFL_SEASON_PHASES.PRESEASON) setPreseasonState(updateError);
        else setRegularState(updateError);
      } finally {
        requestInFlight = false;
        scheduleRefresh();
      }
    }

    const handleVisibilityChange = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
      if (document.visibilityState === 'visible') void refresh();
    };

    const handleOnline = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
      void refresh();
    };

    const handleOffline = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeProvider, activeState.status, season, seasonPhase, selectedWeekHasLiveGames, selectedWeekNumber, sourceState.status]);

  useEffect(() => {
    document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedGameRouteId]);

  if (showPlayByPlayTourDemo) {
    if (!tourFixture) return <p className="statistics-scores-state">Loading play-by-play preview…</p>;
    return (
      <ScoresGameDrilldown
        game={tourFixture.game}
        fixtureDetail={tourFixture.detail}
        initialSection="plays"
        onBack={() => {}}
      />
    );
  }

  if (selectedGame) {
    const drilldownGame = selectedGame;
    return (
      <ScoresGameDrilldown
        game={drilldownGame}
        fixtureDetail={drilldownGame.provider === STATISTICS_SCORES_PROVIDERS.FIXTURE
          ? fixtureCatalog?.getDetail(drilldownGame) ?? null
          : null}
        selectedSection={routeSection}
        selectedPlayerGroup={routePlayerGroup}
        onSectionChange={(section) => onRouteChange?.({
          statisticsScoresSection: section,
          statisticsScoresPlayerGroup: section === 'players' ? routePlayerGroup : null,
        }, { replace: true })}
        onPlayerGroupChange={(group) => onRouteChange?.({
          statisticsScoresSection: 'players',
          statisticsScoresPlayerGroup: group,
        }, { replace: true })}
        onBack={() => onRouteChange?.({
          statisticsScoresGameId: null,
          statisticsScoresSection: 'overview',
          statisticsScoresPlayerGroup: null,
        }, { replace: true })}
      />
    );
  }

  const routePhaseValue = seasonPhase;

  const selectWeek = (nextWeekId) => {
    const nextWeek = weeks.find((week) => week.id === nextWeekId) ?? null;
    onRouteChange?.({
      statisticsScoresSeason: season,
      statisticsScoresPhase: routePhaseValue,
      statisticsScoresWeek: scoresWeekRouteValue(nextWeek),
      statisticsScoresGameId: null,
      statisticsScoresSection: 'overview',
      statisticsScoresPlayerGroup: null,
    }, { replace: true });
  };

  const selectDeveloperSource = (nextSource) => {
    if (!DEVELOPER_SOURCE_ENABLED || nextSource === developerSource) return;
    setDeveloperSource(nextSource);
    setSourceState({
      status: nextSource === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE ? 'loading' : 'ready',
      provider: nextSource,
      notice: null,
    });
    setRegularState(EMPTY_FEED_STATE);
    setPreseasonState(EMPTY_FEED_STATE);
    onRouteChange?.({
      statisticsScoresGameId: null,
      statisticsScoresSection: 'overview',
      statisticsScoresPlayerGroup: null,
    }, { replace: true });
  };

  const selectSeasonPhase = (nextPhase) => {
    const normalized = writeStoredNflSeasonPhase(nextPhase);
    if (activeProvider !== STATISTICS_SCORES_PROVIDERS.FIXTURE && normalized === NFL_SEASON_PHASES.PRESEASON) {
      setPreseasonState({ status: 'loading', data: null, error: null, updatedAt: null });
    } else if (activeProvider !== STATISTICS_SCORES_PROVIDERS.FIXTURE) {
      setRegularState({ status: 'loading', data: null, error: null, updatedAt: null });
    }
    setStoredSeasonPhase(normalized);
    onRouteChange?.({
      statisticsScoresSeason: season,
      statisticsScoresPhase: normalized,
      statisticsScoresWeek: null,
      statisticsScoresGameId: null,
      statisticsScoresSection: 'overview',
      statisticsScoresPlayerGroup: null,
    });
  };

  const openGame = (game) => {
    if (!canOpenGame || game.detailsAvailable === false || !isStatisticsScoresDrilldownStatus(game.status)) return;
    const gameWeek = weeks.find((week) => week.games.some((entry) => entry.id === game.id));
    onRouteChange?.({
      statisticsScoresSeason: season,
      statisticsScoresPhase: routePhaseValue,
      statisticsScoresWeek: scoresWeekRouteValue(gameWeek ?? selectedWeek),
      statisticsScoresGameId: scoresGameRouteId(game),
      statisticsScoresSection: 'overview',
      statisticsScoresPlayerGroup: null,
    });
  };

  return (
    <div className="statistics-scores page-frame-data">
      <header className="scores-masthead">
        <div>
          <div className="scores-masthead-kicker">
            <span>{selectedWeek?.label ?? (seasonPhase === NFL_SEASON_PHASES.PRESEASON ? 'Preseason' : 'NFL week')} · {season}</span>
            {liveCount > 0 && (
              <strong><span className="scores-live-dot" aria-hidden="true" /> {liveCount} live</strong>
            )}
          </div>
          <h1>Scores <span>/ NFL</span></h1>
        </div>

        <div className="scores-masthead-side">
          <span className="scores-as-of" title={sourceState.notice ?? undefined}>
            {activeProvider === STATISTICS_SCORES_PROVIDERS.FIXTURE
              ? activeState.data?.updatedLabel ?? 'Fixture data'
              : formatUpdatedLabel(activeState.updatedAt, activeProvider, activeState.liveEnvelope?.provider)}
          </span>
          <div className="scores-toolbar-actions">
            <SeasonPhaseToggle
              value={seasonPhase}
              onChange={selectSeasonPhase}
              className="scores-phase-toggle"
            />
            <label className="scores-season-select">
              <span>Season</span>
              <select
                value={season}
                onChange={(event) => {
                  const nextSeason = Number(event.target.value);
                  if (activeProvider !== STATISTICS_SCORES_PROVIDERS.FIXTURE && seasonPhase === NFL_SEASON_PHASES.PRESEASON) {
                    setPreseasonState({ status: 'loading', data: null, error: null, updatedAt: null });
                  } else if (activeProvider !== STATISTICS_SCORES_PROVIDERS.FIXTURE) {
                    setRegularState({ status: 'loading', data: null, error: null, updatedAt: null });
                  }
                  onRouteChange?.({
                    statisticsScoresSeason: nextSeason,
                    statisticsScoresPhase: routePhaseValue,
                    statisticsScoresWeek: null,
                    statisticsScoresGameId: null,
                    statisticsScoresSection: 'overview',
                    statisticsScoresPlayerGroup: null,
                  });
                }}
                aria-label="Season"
              >
                {availableSeasons.map((year) => (
                  <option key={year} value={year}>{year}{year === fixtureSeason ? ' · current' : ''}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      {DEVELOPER_SOURCE_ENABLED && (
        <section className="scores-developer-source" aria-label="Statistics Scores developer data source">
          <div>
            <span>Developer</span>
            <strong>Data source</strong>
          </div>
          <div className="scores-developer-source-options" role="group" aria-label="Data source">
            {DEVELOPER_SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                className={developerSource === source.id ? 'is-active' : ''}
                aria-pressed={developerSource === source.id}
                data-source={source.id}
                onClick={() => selectDeveloperSource(source.id)}
              >
                {source.label}
              </button>
            ))}
          </div>
          <p role="status">
            {sourceState.status === 'loading'
              ? `Loading ${DEVELOPER_SOURCES.find((source) => source.id === developerSource)?.label ?? 'source'}…`
              : sourceState.notice
                ?? (developerSource === STATISTICS_SCORES_PROVIDERS.FIXTURE
                  ? 'Deterministic local data · no provider requests'
                  : developerSource === STATISTICS_SCORES_PROVIDERS.ESPN
                    ? 'Live ESPN scores only · game details unavailable'
                    : 'Server-proxied BALLDONTLIE data')}
          </p>
        </section>
      )}

      {(sourceState.notice || activeState.liveNotice || (activeState.error && activeState.data)) && (
        <p className="scores-feed-notice" role="status">{sourceState.notice ?? activeState.liveNotice ?? 'Live refresh paused. Showing the last score update.'}</p>
      )}

      {sourceState.status === 'error' ? (
        <div className="scores-feed-state" role="status">
          <strong>{DEVELOPER_SOURCES.find((source) => source.id === activeProvider)?.label ?? 'Score source'} is unavailable</strong>
          <span>{sourceState.notice ?? 'The selected score source could not be reached.'}</span>
        </div>
      ) : sourceState.status !== 'ready' || ['idle', 'loading'].includes(activeState.status) ? (
        <div className="scores-feed-state" role="status">
          <strong>Loading {seasonPhase === NFL_SEASON_PHASES.PRESEASON ? 'preseason' : 'regular-season'} scores</strong>
          <span>{sourceState.notice ?? 'Checking the configured Scores provider, then fetching the latest slate.'}</span>
        </div>
      ) : activeState.status === 'error' ? (
        <div className="scores-feed-state" role="status">
          <strong>{seasonPhase === NFL_SEASON_PHASES.PRESEASON ? 'Preseason' : 'Regular-season'} scores are unavailable</strong>
          <span>{activeState.error ?? (activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
            ? 'The configured BALLDONTLIE feed could not be reached. Check the provider status and try again.'
            : 'The ESPN fallback feed could not be reached. Try again after reconnecting.')}</span>
        </div>
      ) : selectedWeek ? (
        <>
          <WeekRail
            weeks={weeks}
            selectedWeekId={selectedWeek.id}
            currentWeekId={currentWeekId}
            onSelectWeek={selectWeek}
          />

          <ScoresSeasonBoard
            weeks={weeks}
            selectedWeekId={selectedWeek.id}
            displayedWeek={scorecardWeek}
            desktop={desktop}
            onOpenGame={canOpenGame ? openGame : undefined}
            onSelectWeek={selectWeek}
          />
        </>
      ) : (
        <div className="scores-feed-state" role="status">
          <strong>{seasonPhase === NFL_SEASON_PHASES.PRESEASON ? 'Preseason' : 'Regular-season'} scores are unavailable</strong>
          <span>{activeProvider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
            ? 'The configured BALLDONTLIE feed could not be reached. Check the provider status and try again.'
            : 'The ESPN fallback feed could not be reached. Try again after reconnecting.'}</span>
        </div>
      )}
    </div>
  );
}
