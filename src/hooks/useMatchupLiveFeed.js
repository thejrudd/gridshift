// The live data pipeline behind the Matchups live layer (replay bar, win
// chance / lead chart, scoring plays, player hover cards).
//
// Moved out of the retired Fantasy Live tab (CompanionLive.jsx) with its
// behavior intact: live session, BALLDONTLIE games/stats/plays polling, the
// Sleeper reconciliation engine, projections, win probability and the pace
// series. Only presentation state stayed behind. Events are placed on the
// kickoff-window axis from matchupSlateAxis.js. Rules: docs/Fantasy Live.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase } from '../context/SleeperContext';
import { getLiveMatchups, getWeeklyProjections } from '../api/sleeperApi';
import { calcPoints, calcPointsFromTotals } from '../utils/scoringEngine';
import { fetchSeasonSchedule } from '../utils/playerApi.js';
import {
  buildDeltaEvents,
  buildStatIndex,
  findGameForTeam,
  getFallbackRemainingGameFraction,
  getMatchupCustomPoints,
  getOfficialMatchupRowPoints,
  getSleeperPlayerName,
  getStatKeyForSleeperPlayer,
  getTeamAbbr,
  hasReconciledMatchup,
  isCompleteScheduleWeek,
  isFinalGame,
  isLiveGame,
  mapBdlStatsToGridShift,
  mergeLiveScoringStats,
  reconcileLiveFantasyPoints,
  resolveCurrentPlayerPoints,
  resolveStarterGameState,
} from '../utils/liveScoringFeed.js';
import * as sandboxAwareLiveSource from '../api/liveDataSource';
import * as realLiveApi from '../api/liveApi';
// Session and status always go to the real server.
import { getLiveStatus, startLiveSession } from '../api/liveApi';
import { fetchGameWeather } from '../api/weatherApi';
import {
  buildProjectionContext,
  getStarterWeatherKey,
  projectFromGameInfo,
  resolveStarterGameInfo,
} from '../utils/starterProjections.js';
import { mapSleeperProjectionsToPlayers } from '../utils/sleeperProjections.js';
import {
  appendWinProbPoint,
  buildWinProbHistoryKey,
  computeSideOutlook,
  computeWinProbability,
  explainWinProbability,
  getRemainingGameFraction,
  getStarterOutlook,
  loadWinProbHistory,
  projectSideOutlookAtMoment,
  saveWinProbHistory,
} from '../utils/liveWinProbability.js';
import {
  buildPlayEvents,
  buildStarterNameIndex,
  mergePlayEvents,
  parseGlanceProgress,
  sortLiveFeedEvents,
} from '../utils/livePlaysFeed.js';
import { createReconciliationState, reconcileLivePlays } from '../utils/liveReconciliation.js';
import {
  buildPaceSeries,
  buildGameProgressTimelines,
  buildObservedPlayerPoints,
  buildSidePace,
  applyObservedPointFallback,
  getStarterReplayRemainingFraction,
  getStarterPace,
  preservePaceSeriesScores,
} from '../utils/livePace.js';
import { buildSharedDemoScoringEvents, limitPlayByPlayGames } from '../utils/liveDemoPlays.js';
import { getBigPlayThreshold } from '../utils/liveFeedFilters.js';
import { buildSlateAxis } from '../utils/matchupSlateAxis.js';
import { resolveFantasyLiveAvailability, getLiveConfigurationMessage } from '../utils/fantasyLiveAvailability.js';
import { LIVE_SANDBOX_ENABLED, isLiveMode, subscribeToRewind, useLiveSandbox } from '../dev/liveSandbox';

const LIVE_REFRESH_MS = 5000;
const FREE_TIER_REFRESH_MS = 60000;
// Sleeper's weekly stat lines move only when a game is running, so they are
// polled on their own slower cadence than the matchup/points refresh.
const SLEEPER_STATS_REFRESH_MS = 30000;
// A full Sunday slate, so every starter's game can supply play-by-play rather
// than only the first handful.
const MAX_PLAYS_GAMES = 16;
const PLAYS_REFRESH_MIN_MS = 8_000;
const FINAL_RECONCILIATION_RETRY_MS = 30000;
const NO_GAMES = Object.freeze([]);
const NO_PLAYS = Object.freeze({});
// A finished game's plays never change within a visit (the server archives
// them and absorbs post-game corrections), so they are kept per tab: going
// back to a week, or switching matchups, does not ask the server again.
// Keyed by BALLDONTLIE game id; bounded so a long session cannot grow it
// without limit. Dev sandbox and mock plays never use it.
const FINAL_GAME_PLAYS = new Map();
const FINAL_GAME_PLAYS_LIMIT = 400;

function rememberFinalGamePlays(gameId, plays) {
  FINAL_GAME_PLAYS.delete(gameId);
  FINAL_GAME_PLAYS.set(gameId, plays);
  if (FINAL_GAME_PLAYS.size > FINAL_GAME_PLAYS_LIMIT) FINAL_GAME_PLAYS.delete(FINAL_GAME_PLAYS.keys().next().value);
}
// Typical wall-clock length of an NFL game, for placing a finished game's
// stat-update rows in time.
const GAME_WALLCLOCK_MS = 3.25 * 60 * 60 * 1000;

export function isFantasyFeedEvent(event) {
  if (event?.hiddenFromFeed || event?.status === 'unconfirmed') return false;
  const points = Number(event?.displayPts ?? event?.pts);
  return Number.isFinite(points) && points !== 0;
}

function getStarterIds(row) {
  return (row?.starters ?? [])
    .map((id) => String(id))
    .filter((id) => id && id !== '0');
}

function getRosterIdFromMatchupRow(row) {
  const rosterId = Number(row?.roster_id);
  return Number.isFinite(rosterId) ? rosterId : null;
}

function sortRelevantGames(games, teams) {
  return (games ?? [])
    .filter((game) => {
      const away = getTeamAbbr(game?.visitor_team);
      const home = getTeamAbbr(game?.home_team);
      return teams.has(away) || teams.has(home);
    })
    .sort((left, right) => {
      if (isLiveGame(left) !== isLiveGame(right)) return isLiveGame(left) ? -1 : 1;
      if (isFinalGame(left) !== isFinalGame(right)) return isFinalGame(left) ? 1 : -1;
      return Date.parse(left?.date ?? 0) - Date.parse(right?.date ?? 0);
    });
}

function isFreeLiveTier(status) {
  return String(status?.live?.tier ?? '').trim().toLowerCase() === 'free';
}

function isMockPlayByPlayEnabled(status) {
  return Boolean(status?.live?.mockPlaysEnabled);
}

function getLiveRefreshMs(status) {
  return isFreeLiveTier(status) ? FREE_TIER_REFRESH_MS : LIVE_REFRESH_MS;
}

function getMockPlayPlayerName(player) {
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'GridShift Starter';
}

// Server-configured mock play-by-play (`mockPlaysEnabled`): a readable game
// story built from the starters' current lines, spread across four quarters.
function buildMockLivePlays(game, rows = []) {
  const gameId = String(game?.id ?? 'mock-game');
  const startedAt = Date.now() - 180000;
  const away = getTeamAbbr(game?.visitor_team);
  const home = getTeamAbbr(game?.home_team);
  const eligibleRows = rows
    .filter((row) => row?.player && getTeamAbbr(row.player.team))
    .sort((left, right) => (String(right.player?.position ?? '').toUpperCase() === 'DEF') - (String(left.player?.position ?? '').toUpperCase() === 'DEF'))
    .slice(0, 10);

  let sequence = 0;
  const makePlay = (base, row, attrs) => {
    sequence += 1;
    const clockMinute = Math.max(1, 13 - (sequence % 12));
    return {
      ...base,
      id: `${gameId}-mock-${row.id}-${sequence}`,
      sequence,
      clock: `${clockMinute}:${String((sequence * 7) % 60).padStart(2, '0')}`,
      wallclock: new Date(startedAt + sequence * 22000).toISOString(),
      ...attrs,
    };
  };

  const plays = eligibleRows.flatMap((row) => {
    const player = row.player;
    const name = getMockPlayPlayerName(player);
    const team = getTeamAbbr(player.team);
    const position = String(player.position ?? '').toUpperCase();
    const opponentTeam = team === away ? home : away;
    const base = {
      game_id: gameId,
      team,
      possession_team: team,
      period: Math.min(4, Math.max(1, Number(game?.period) || 2)),
      away_score: game?.visitor_team_score ?? 14,
      home_score: game?.home_team_score ?? 10,
    };
    if (position === 'DEF') {
      const dstBase = { ...base, team: opponentTeam, possession_team: opponentTeam, defense_team: team };
      return [
        makePlay(dstBase, row, { play_type: 'sack', yards_gained: -7, description: `${team} defense sack and forced fumble recovered by ${team}` }),
        makePlay(dstBase, row, { play_type: 'interception', yards_gained: 62, scoring_play: true, touchdown: true, description: `${team} defense interception returned for 62 yard touchdown` }),
        makePlay(dstBase, row, { play_type: 'fumble_recovery', yards_gained: 55, scoring_play: true, touchdown: true, description: `${team} defense fumble recovered and returned for 55 yard touchdown` }),
        makePlay(dstBase, row, { play_type: 'safety', yards_gained: -2, scoring_play: true, description: `${team} defense records a safety` }),
        makePlay(dstBase, row, { play_type: 'pass', yards_gained: 0, description: `${team} defense pass defended incomplete` }),
      ];
    }
    if (position === 'QB') {
      return [
        makePlay(base, row, { play_type: 'pass', yards_gained: 42, scoring_play: true, touchdown: true, description: `${name} 42 yard touchdown pass complete for first down` }),
        makePlay(base, row, { play_type: 'rush', yards_gained: 45, scoring_play: true, touchdown: true, description: `${name} 45 yard rushing touchdown for first down` }),
        makePlay(base, row, { play_type: 'sack', yards_gained: -8, description: `${name} sacked for 8 yard loss` }),
        makePlay(base, row, { play_type: 'rush', yards_gained: 4, description: `${name} rush for 4 yards, fumble lost` }),
      ];
    }
    if (position === 'K') {
      return [
        makePlay(base, row, { play_type: 'field_goal', yards_gained: 0, scoring_play: true, description: `${name} 42 yard field goal is good` }),
        makePlay(base, row, { play_type: 'extra_point', yards_gained: 0, scoring_play: true, description: `${name} extra point is good` }),
      ];
    }
    if (['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS'].includes(position)) {
      const idpBase = { ...base, team: opponentTeam, possession_team: opponentTeam, defense_team: team };
      return [
        makePlay(idpBase, row, { play_type: 'sack', yards_gained: -6, description: `${name} sack and forced fumble` }),
        makePlay(idpBase, row, { play_type: 'interception', yards_gained: 58, scoring_play: true, touchdown: true, description: `${name} interception returned for 58 yard touchdown` }),
        makePlay(idpBase, row, { play_type: 'fumble_recovery', yards_gained: 52, scoring_play: true, touchdown: true, description: `${name} fumble recovered and returned for 52 yard touchdown` }),
        makePlay(idpBase, row, { play_type: 'pass', yards_gained: 0, description: `${name} pass defended incomplete` }),
      ];
    }
    if (position === 'RB') {
      return [
        makePlay(base, row, { play_type: 'rush', yards_gained: 41, scoring_play: true, touchdown: true, description: `${name} 41 yard rushing touchdown for first down` }),
        makePlay(base, row, { play_type: 'pass', yards_gained: 16, description: `${name} pass complete for 16 yards and first down` }),
        makePlay(base, row, { play_type: 'rush', yards_gained: 3, scoring_play: true, touchdown: true, description: `${name} 3 yard rushing touchdown` }),
        makePlay(base, row, { play_type: 'rush', yards_gained: 5, description: `${name} rush for 5 yards, fumble lost` }),
      ];
    }
    if (['WR', 'TE'].includes(position)) {
      return [
        makePlay(base, row, { play_type: 'pass', yards_gained: 51, scoring_play: true, touchdown: true, description: `${name} 51 yard touchdown reception for first down` }),
        makePlay(base, row, { play_type: 'pass', yards_gained: 27, description: `${name} pass complete for 27 yards and first down` }),
        makePlay(base, row, { play_type: 'rush', yards_gained: 44, description: `${name} rush for 44 yards and first down` }),
      ];
    }
    return [makePlay(base, row, { play_type: 'rush', yards_gained: 11, description: `${name} rush for 11 yards` })];
  });

  const kickoffAt = Date.parse(game?.date ?? '');
  const wallclockStart = Number.isFinite(kickoffAt) ? kickoffAt : startedAt;
  return plays.map((play, index) => {
    const progress = (index + 1) / (plays.length + 1);
    const elapsed = Math.min(3599, Math.floor(progress * 3600));
    const secondsLeft = 900 - (elapsed % 900);
    return {
      ...play,
      period: Math.floor(elapsed / 900) + 1,
      clock: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
      wallclock: new Date(wallclockStart + (progress * 3.25 * 60 * 60 * 1000)).toISOString(),
    };
  });
}

/**
 * Live data for one fantasy matchup in the current NFL week, or a finished
 * earlier week of the same season replayed from its plays.
 *
 * @param {object} options
 * @param {boolean} options.enabled  False keeps the hook inert (other platforms).
 * @param {number|null} options.matchupId  Sleeper matchup_id to follow.
 * @param {number|null} options.week  The Matchups week; null follows the current one.
 * @param {boolean} options.allowSandbox  False when the dev sandbox league is
 *   not the one on screen, so the connected league reads real live data.
 * @returns The live layer's data. `active` is true only when the league has a
 *   live session, the week is the current or an earlier one and the matchup
 *   was found. `historical` marks an earlier, finished week.
 */
export default function useMatchupLiveFeed({
  enabled = true,
  matchupId = null,
  week: requestedWeek = null,
  allowSandbox = true,
  projectionTables = null,
} = {}) {
  // Dev-only. Returns null in production, where the whole module is dropped.
  const sandboxState = useLiveSandbox();
  const sandbox = allowSandbox ? sandboxState : null;
  // The sandbox-aware source serves the sandbox's own modes; the connected
  // league always reads the real routes.
  const liveSource = sandbox ? sandboxAwareLiveSource : realLiveApi;
  const connectedBase = useSleeperBase();
  const connectedLiveMode = isLiveMode();
  const connectedPreseasonScoring = sandbox?.mode === 'preseason'
    && connectedBase.selectedLeagueId
    && connectedBase.league?.scoring_settings
    ? connectedBase.activeScoringSettings
    : null;
  const {
    platform,
    selectedLeagueId,
    league,
    season,
    players,
    loadPlayers,
    loadMatchups,
    refreshLiveWeeklyStats,
    // Sandbox-only: the replay's synthesized Sleeper stat lines stand in for
    // getWeeklyStats(). The connected context does not define it.
    loadWeeklyStats,
    activeScoringSettings,
    scheduleMap,
    weeklyStats,
    seasonStats,
    loadSeasonStats,
    espnIdOverrides,
    nflState,
  } = {
    ...connectedBase,
    ...(sandbox?.base ?? {}),
    ...(connectedPreseasonScoring ? { activeScoringSettings: connectedPreseasonScoring } : {}),
  };

  const [liveStatus, setLiveStatus] = useState(null);
  const effectiveNflState = sandbox?.nflState ?? nflState;
  const sandboxActive = Boolean(sandbox);
  const sandboxMode = sandbox?.mode ?? 'live';
  const sandboxReplay = Boolean(sandbox?.replay);
  const liveAvailability = useMemo(() => resolveFantasyLiveAvailability({
    nflState: effectiveNflState,
    leagueSeason: league?.season ?? season,
  }), [effectiveNflState, league?.season, season]);
  // Sleeper's NFL state is the source of truth for the active fantasy week.
  // An earlier week of the same season is finished: it loads once, without
  // polling, and opens at the final whistle.
  const liveWeek = liveAvailability.week;
  const pickedWeek = Number(requestedWeek);
  const historical = Boolean(liveWeek && Number.isInteger(pickedWeek) && pickedWeek >= 1 && pickedWeek < liveWeek);
  // Server mock plays (a dev setting) stand in for a live feed only. A finished
  // week always has real play-by-play, so it never uses them: mock plays are a
  // handful of big plays per player and would hide every small one.
  const demoFeedEnabled = !sandbox && !connectedLiveMode && !historical && isMockPlayByPlayEnabled(liveStatus);
  const reconcilerEnabled = sandbox ? Boolean(sandbox.replay) : !demoFeedEnabled;
  const sessionWeek = enabled && platform === 'sleeper' && liveWeek
    ? (historical ? pickedWeek : requestedWeek == null || pickedWeek === liveWeek ? liveWeek : null)
    : null;
  // A finished week does nothing beyond the session check until the league
  // has a live session: without one it must not refresh the shared Sleeper
  // stat lines or rows that Matchups already shows for that week.
  const week = historical && !liveStatus?.session?.enabled ? null : sessionWeek;

  // Sleeper's rows and stat lines are keyed by the week they belong to, like
  // the games and plays below: for the render right after a week switch the
  // previous week's numbers would otherwise reach the reconciler, whose
  // confirmations are sticky.
  const weekKey = `${selectedLeagueId ?? ''}:${season ?? ''}:${week ?? ''}:${sandboxMode}`;
  const [matchupsState, setMatchupsState] = useState({ key: null, rows: NO_GAMES });
  const matchups = matchupsState.key === weekKey ? matchupsState.rows : NO_GAMES;
  const [matchupsLoading, setMatchupsLoading] = useState(false);
  // The week's games and their plays are stored with the feed they belong to
  // (week, matchup, sandbox mode) and read back only for that feed. Right after
  // a week or matchup switch the old values still sit in state for a render;
  // keyed this way they read as empty, so another week's plays can never reach
  // the feed, the chart, or the reconciler (which keeps every play it ingests).
  const feedKey = `${week ?? ''}:${matchupId ?? ''}:${sandboxMode}`;
  const [liveGamesState, setLiveGamesState] = useState({ key: null, games: NO_GAMES });
  const liveGames = liveGamesState.key === feedKey ? liveGamesState.games : NO_GAMES;
  // The context (league/week/matchup/session) whose games have arrived: enough
  // for Matchups to decide whether the live layer shows.
  const [gamesLoadedContext, setGamesLoadedContext] = useState(null);
  const [statsByGame, setStatsByGame] = useState({});
  const [sleeperStatsState, setSleeperStatsState] = useState({ key: null, byPlayer: NO_PLAYS, fetchedAt: null });
  const sleeperStatsByPlayer = sleeperStatsState.key === weekKey ? sleeperStatsState.byPlayer : NO_PLAYS;
  const sleeperStatsFetchedAt = sleeperStatsState.key === weekKey ? sleeperStatsState.fetchedAt : null;
  const [sleeperProjectionMap, setSleeperProjectionMap] = useState(new Map());
  const [localScheduleMap, setLocalScheduleMap] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [loadingLive, setLoadingLive] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [feedEvents, setFeedEvents] = useState([]);
  const [weatherMap, setWeatherMap] = useState({});
  const [playsState, setPlaysState] = useState({ key: null, byGame: NO_PLAYS });
  const playsByGame = playsState.key === feedKey ? playsState.byGame : NO_PLAYS;
  const storeGamePlays = useCallback((requestFeedKey, gameId, plays) => {
    setPlaysState((prev) => ({
      key: requestFeedKey,
      byGame: { ...(prev.key === requestFeedKey ? prev.byGame : {}), [gameId]: plays },
    }));
  }, []);
  const [winProbHistory, setWinProbHistory] = useState([]);
  const [finalReconciliation, setFinalReconciliation] = useState({
    key: null, status: 'idle', requestedAt: null, completedAt: null, attempts: 0,
  });
  const reconciliationRef = useRef(null);
  if (!reconciliationRef.current) reconciliationRef.current = createReconciliationState();
  const [reconciliation, setReconciliation] = useState(reconciliationRef.current);
  const snapshotRef = useRef(new Map());
  const rewindAtRef = useRef(0);
  const processedUpdateRef = useRef(null);
  const playsFetchedRef = useRef(new Map());
  const liveSnapshotInFlightContextsRef = useRef(new Set());
  const playFetchInFlightContextsRef = useRef(new Set());
  const playRequestContextRef = useRef(null);
  const weatherPendingRef = useRef(new Set());
  const liveSnapshotRequestRef = useRef(0);
  const liveSnapshotContextRef = useRef(null);
  const autoSessionAttemptedRef = useRef(new Set());

  const resetReconciliation = useCallback(() => {
    reconciliationRef.current = createReconciliationState();
    setReconciliation(reconciliationRef.current);
  }, []);

  useEffect(() => {
    if (!LIVE_SANDBOX_ENABLED) return undefined;
    return subscribeToRewind(() => {
      rewindAtRef.current = Date.now();
      processedUpdateRef.current = null;
      snapshotRef.current = new Map();
      playsFetchedRef.current = new Map();
      resetReconciliation();
      setFeedEvents([]);
      setPlaysState({ key: null, byGame: NO_PLAYS });
      setWinProbHistory([]);
    });
  }, [resetReconciliation]);

  useEffect(() => { if (week) loadPlayers?.(); }, [loadPlayers, week]);
  useEffect(() => { if (week) loadSeasonStats?.(); }, [loadSeasonStats, week]);

  useEffect(() => {
    if (!sessionWeek) return undefined;
    let cancelled = false;
    setStatusError('');
    setSessionLoading(false);
    const leagueId = selectedLeagueId;
    if (leagueId) setLiveStatus(null);
    getLiveStatus({ leagueId })
      .then(async (payload) => {
        if (cancelled) return;
        // The allowlist is the normal production authorization boundary. A
        // configured access code remains an intentional second factor.
        const shouldStartAllowlistedSession = Boolean(
          leagueId
          && payload.live?.enabled
          && payload.live?.leagueAllowed === true
          && !payload.live?.accessCodeRequired
          && !payload.session?.enabled
          && !autoSessionAttemptedRef.current.has(String(leagueId)),
        );
        if (!shouldStartAllowlistedSession) {
          setLiveStatus(payload);
          return;
        }
        autoSessionAttemptedRef.current.add(String(leagueId));
        setSessionLoading(true);
        try {
          await startLiveSession({ leagueId, provider: 'sleeper' });
          const refreshed = await getLiveStatus({ leagueId });
          if (!cancelled) setLiveStatus(refreshed);
        } catch (error) {
          if (!cancelled) {
            setLiveStatus(payload);
            setLiveError(error?.message ?? 'Could not turn on live scoring.');
          }
        } finally {
          if (!cancelled) setSessionLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) setStatusError(error?.message ?? 'Could not reach the live scoring server.');
      });
    return () => { cancelled = true; };
  }, [selectedLeagueId, sessionWeek]);

  useEffect(() => {
    if (!selectedLeagueId || !week) {
      setMatchupsState({ key: null, rows: NO_GAMES });
      setMatchupsLoading(false);
      return undefined;
    }
    let cancelled = false;
    const requestWeekKey = weekKey;
    setMatchupsLoading(true);
    loadMatchups(selectedLeagueId, week)
      .then((rows) => { if (!cancelled) setMatchupsState({ key: requestWeekKey, rows: rows ?? [] }); })
      .catch(() => { if (!cancelled) setMatchupsState({ key: requestWeekKey, rows: [] }); })
      .finally(() => { if (!cancelled) setMatchupsLoading(false); });
    return () => { cancelled = true; };
  }, [loadMatchups, selectedLeagueId, week, weekKey]);

  useEffect(() => {
    if (!week || !season || scheduleMap || localScheduleMap) return undefined;
    let cancelled = false;
    fetchSeasonSchedule(season)
      .then((payload) => { if (!cancelled) setLocalScheduleMap(payload ?? null); })
      .catch(() => { if (!cancelled) setLocalScheduleMap(null); });
    return () => { cancelled = true; };
  }, [localScheduleMap, scheduleMap, season, week]);

  // Changing week, matchup, or sandbox mode starts a fresh play-tracking
  // session: accumulated plays and their reconciliation describe a matchup
  // that is no longer on screen.
  // The week's game list and box scores go too: until the new week's games
  // arrive, the old list would send the play fetch after another week's games.
  useEffect(() => {
    snapshotRef.current = new Map();
    playsFetchedRef.current = new Map();
    resetReconciliation();
    setFeedEvents([]);
    setPlaysState({ key: null, byGame: NO_PLAYS });
    setLiveGamesState({ key: null, games: NO_GAMES });
    setStatsByGame({});
  }, [week, matchupId, sandboxMode, resetReconciliation]);

  // The followed matchup's two rows (Sleeper matchup rows share a matchup_id).
  const currentMatchup = useMemo(() => {
    if (!week || !matchups.length) return null;
    const ids = [...new Set(matchups.map((row) => Number(row?.matchup_id)).filter(Number.isFinite))];
    const wanted = matchupId != null && ids.includes(Number(matchupId)) ? Number(matchupId) : null;
    if (wanted == null) return null;
    const rows = matchups.filter((row) => Number(row?.matchup_id) === wanted).slice(0, 2);
    return rows.length ? { matchupId: wanted, rows } : null;
  }, [matchupId, matchups, week]);
  const activeScheduleMapForContext = scheduleMap ?? localScheduleMap;

  // Keyed by content: every live refresh replaces the matchup rows, and a new
  // array here would re-create the fetch callback and refetch in a loop.
  const matchupStarterKey = (currentMatchup?.rows ?? []).flatMap((row) => getStarterIds(row)).join(',');
  const matchupStarterIds = useMemo(() => (matchupStarterKey ? matchupStarterKey.split(',') : []), [matchupStarterKey]);

  const currentStarterPointsById = useMemo(() => {
    const points = new Map();
    (currentMatchup?.rows ?? []).forEach((row) => {
      Object.entries(row?.players_points ?? {}).forEach(([id, value]) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) points.set(String(id), numeric);
      });
    });
    return points;
  }, [currentMatchup]);

  const matchupTeamsKey = [...new Set(matchupStarterIds
    .map((id) => getTeamAbbr(players?.[id]?.team))
    .filter(Boolean))].sort().join(',');
  const matchupTeams = useMemo(() => new Set(matchupTeamsKey ? matchupTeamsKey.split(',') : []), [matchupTeamsKey]);

  const liveSnapshotContextKey = [
    selectedLeagueId,
    season,
    week,
    currentMatchup?.matchupId ?? '',
    sandbox?.mode ?? 'live',
    liveStatus?.session?.enabled ? 'enabled' : 'disabled',
    ...[...matchupTeams].sort(),
  ].join(':');
  const liveSnapshotRefreshVersion = sandbox?.clockVersion ?? '';
  liveSnapshotContextRef.current = liveSnapshotContextKey;

  const fetchLiveSnapshot = useCallback(async ({ quiet = false } = {}) => {
    if (!week || !liveStatus?.session?.enabled) return;
    const requestContext = liveSnapshotContextKey;
    const requestFeedKey = feedKey;
    const requestWeekKey = weekKey;
    if (liveSnapshotInFlightContextsRef.current.has(requestContext)) return;
    liveSnapshotInFlightContextsRef.current.add(requestContext);
    const requestId = liveSnapshotRequestRef.current + 1;
    liveSnapshotRequestRef.current = requestId;
    const isCurrentRequest = () => (
      requestId === liveSnapshotRequestRef.current
      && requestContext === liveSnapshotContextRef.current
    );
    if (!quiet) setLoadingLive(true);
    setLiveError('');
    try {
      const gamesPayload = await liveSource.getLiveGames({ season, week });
      if (!isCurrentRequest()) return;
      const games = Array.isArray(gamesPayload?.data) ? gamesPayload.data : [];
      setLiveGamesState({ key: requestFeedKey, games });
      setGamesLoadedContext(requestContext);

      const gameIds = sortRelevantGames(games, matchupTeams).map((game) => game.id).filter(Boolean);
      if (gameIds.length) {
        const statsPayload = await liveSource.getLivePlayerStatsForGames(gameIds);
        if (!isCurrentRequest()) return;
        const groupedStats = statsPayload?.games && typeof statsPayload.games === 'object' ? statsPayload.games : {};
        setStatsByGame(Object.fromEntries(gameIds.map((gameId) => [String(gameId), groupedStats[String(gameId)] ?? []])));
      } else {
        setStatsByGame({});
      }
      // Sleeper's players_points is what the reconciler confirms plays
      // against, so it is refreshed on the same tick as BDL.
      const refreshMatchups = sandboxReplay
        ? () => loadMatchups(selectedLeagueId, week)
        : !sandboxActive
          ? () => getLiveMatchups(selectedLeagueId, week)
          : null;
      if (refreshMatchups) {
        try {
          const freshMatchups = await refreshMatchups();
          if (isCurrentRequest() && Array.isArray(freshMatchups)) setMatchupsState({ key: requestWeekKey, rows: freshMatchups });
        } catch {
          // Keep the last good Sleeper matchup payload.
        }
      }
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (isCurrentRequest()) setLiveError(error?.message ?? 'Could not load live scoring data.');
    } finally {
      liveSnapshotInFlightContextsRef.current.delete(requestContext);
      if (!quiet && isCurrentRequest()) setLoadingLive(false);
    }
  }, [feedKey, weekKey, liveSnapshotContextKey, liveSource, liveStatus?.session?.enabled, loadMatchups, matchupTeams, sandboxActive, sandboxReplay, selectedLeagueId, season, week]);

  useEffect(() => {
    void fetchLiveSnapshot();
  }, [fetchLiveSnapshot, liveSnapshotRefreshVersion]);

  useEffect(() => {
    if (!liveStatus?.session?.enabled || !week || historical) return undefined;
    const interval = window.setInterval(() => { void fetchLiveSnapshot({ quiet: true }); }, getLiveRefreshMs(liveStatus));
    return () => window.clearInterval(interval);
  }, [fetchLiveSnapshot, historical, liveStatus, week]);

  const matchupLiveGameCount = useMemo(() => (
    sortRelevantGames(liveGames, matchupTeams).filter((game) => isLiveGame(game)).length
  ), [liveGames, matchupTeams]);

  // Sleeper's weekly stat lines are the reconciler's confirmation evidence.
  useEffect(() => {
    if ((sandboxActive && !sandboxReplay) || !selectedLeagueId || !season || !week) {
      setSleeperStatsState({ key: null, byPlayer: NO_PLAYS, fetchedAt: null });
      return undefined;
    }
    let cancelled = false;
    const requestWeekKey = weekKey;
    const load = () => (sandboxReplay && loadWeeklyStats
      ? loadWeeklyStats(season, week)
      : refreshLiveWeeklyStats(season, week))
      .then((rows) => {
        if (cancelled) return;
        setSleeperStatsState({ key: requestWeekKey, byPlayer: rows ?? {}, fetchedAt: Date.now() });
      })
      .catch(() => {});
    void load();
    if (!matchupLiveGameCount || sandboxReplay) return () => { cancelled = true; };
    const interval = window.setInterval(() => { void load(); }, SLEEPER_STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadWeeklyStats, matchupLiveGameCount, refreshLiveWeeklyStats, sandboxActive, sandboxReplay, season, selectedLeagueId, week, weekKey, liveSnapshotRefreshVersion]);

  const starterSleeperStats = useMemo(() => {
    const map = new Map();
    matchupStarterIds.forEach((id) => {
      const stats = sleeperStatsByPlayer?.[id];
      if (stats) map.set(id, stats);
    });
    return map;
  }, [matchupStarterIds, sleeperStatsByPlayer]);

  const statIndex = useMemo(() => buildStatIndex(statsByGame), [statsByGame]);

  const starterPlayersById = useMemo(() => {
    const map = new Map();
    matchupStarterIds.forEach((id) => {
      const rawPlayer = players?.[id];
      if (!rawPlayer) return;
      map.set(id, {
        ...rawPlayer,
        id: rawPlayer.id ?? id,
        player_id: rawPlayer.player_id ?? id,
        sleeperId: rawPlayer.sleeperId ?? id,
        espnId: rawPlayer.espn_id ?? espnIdOverrides?.[id] ?? null,
      });
    });
    return map;
  }, [espnIdOverrides, matchupStarterIds, players]);

  const sideSummaries = useMemo(() => (
    (currentMatchup?.rows ?? []).map((matchupRow, index) => {
      const sleeperPlayerPoints = matchupRow?.players_points ?? {};
      const rows = getStarterIds(matchupRow).map((id) => {
        const player = starterPlayersById.get(id) ?? null;
        if (!player) return null;
        const bdlRow = statIndex.get(getStatKeyForSleeperPlayer(player)) ?? null;
        const sleeperStats = sleeperStatsByPlayer?.[id] ? { week, ...sleeperStatsByPlayer[id] } : null;
        const mappedStats = bdlRow ? mergeLiveScoringStats(mapBdlStatsToGridShift(bdlRow, player.position), sleeperStats) : null;
        const livePoints = mappedStats ? calcPoints(mappedStats, activeScoringSettings, player.position) : 0;
        const sleeperDerivedPoints = sleeperStats ? calcPoints(sleeperStats, activeScoringSettings, player.position) : null;
        const rawSleeperPoints = Number(sleeperPlayerPoints[id]);
        const sleeperPoints = Number.isFinite(rawSleeperPoints) ? rawSleeperPoints : null;
        const authoritativePoints = sandboxReplay ? null : sleeperPoints ?? sleeperDerivedPoints;
        const reconciled = reconciliation.players.get(id) ?? null;
        const reconciledPoints = Number(reconciled?.displayedPoints);
        return {
          id,
          player,
          bdlRow,
          mappedStats,
          sleeperStats,
          detailStats: mappedStats ?? sleeperStats,
          livePoints,
          sleeperPoints,
          reconciliation: reconciled
            ? { status: reconciled.adjustment === 0 ? 'matched' : 'adjusted', source: 'engine', ...reconciled }
            : reconcileLiveFantasyPoints({ derivedPoints: mappedStats ? livePoints : null, authoritativePoints }),
          points: Number.isFinite(reconciledPoints) ? reconciledPoints : resolveCurrentPlayerPoints({
            hasMappedStats: Boolean(mappedStats),
            livePoints,
            sleeperPoints,
            sleeperDerivedPoints,
            suppressFallback: sandboxReplay,
          }),
        };
      }).filter(Boolean);
      const total = Math.round(rows.reduce((sum, row) => sum + row.points, 0) * 100) / 100;
      return {
        key: index === 0 ? 'a' : 'b',
        rosterId: getRosterIdFromMatchupRow(matchupRow),
        matchupRow,
        rows,
        total,
      };
    })
  ), [activeScoringSettings, currentMatchup, reconciliation, sandboxReplay, sleeperStatsByPlayer, starterPlayersById, statIndex, week]);

  const leftSummary = sideSummaries[0] ?? null;
  const rightSummary = sideSummaries[1] ?? null;

  const playerSideKey = useMemo(() => {
    const map = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => map.set(row.id, summary.key)));
    return map;
  }, [sideSummaries]);

  // Stat-delta feed: only the mock-play demo and preseason still use it.
  useEffect(() => {
    if (!currentMatchup || reconcilerEnabled) return;
    if (rewindAtRef.current && (lastUpdatedAt?.getTime() ?? 0) <= rewindAtRef.current) {
      snapshotRef.current = new Map();
      return;
    }
    const updatedAt = lastUpdatedAt?.getTime() ?? null;
    if (updatedAt != null && processedUpdateRef.current === updatedAt) return;
    processedUpdateRef.current = updatedAt;
    const next = new Map();
    const meta = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => {
      meta.set(row.id, { position: row.player?.position });
      if (row.mappedStats) next.set(row.id, { stats: row.mappedStats, points: row.points });
    }));
    const prev = snapshotRef.current;
    if (prev.size) {
      const events = buildDeltaEvents(prev, next, meta, {
        now: updatedAt ?? Date.now(),
        scoringSettings: activeScoringSettings,
      }).map((event, eventIndex, eventList) => {
        const row = sideSummaries.flatMap((summary) => summary.rows).find((candidate) => candidate.id === event.playerId);
        const game = row?.bdlRow?.gameId
          ? liveGames.find((candidate) => String(candidate.id) === String(row.bdlRow.gameId))
          : findGameForTeam(liveGames, row?.player?.team);
        const gameId = row?.bdlRow?.gameId ?? game?.id ?? null;
        const remaining = game ? getRemainingGameFraction(game) : null;
        const eventAt = event.at - Math.max(0, eventList.length - 1 - eventIndex) * 1000;
        const currentProgress = Number.isFinite(remaining) ? 1 - remaining : null;
        return {
          ...event,
          gameId,
          at: eventAt,
          gameProgress: Number.isFinite(currentProgress)
            ? Math.max(0, currentProgress - Math.max(0, eventList.length - 1 - eventIndex) * 0.002)
            : null,
          timelineAt: eventAt,
        };
      });
      if (events.length) setFeedEvents((current) => [...events, ...current]);
    }
    snapshotRef.current = next;
  }, [activeScoringSettings, currentMatchup, lastUpdatedAt, liveGames, reconcilerEnabled, sideSummaries]);

  useEffect(() => {
    if (sandboxActive || !season || !week || !players) {
      setSleeperProjectionMap((current) => (current.size ? new Map() : current));
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    void getWeeklyProjections(season, week, controller.signal)
      .then((rows) => {
        if (cancelled) return;
        setSleeperProjectionMap(mapSleeperProjectionsToPlayers({ players, projectionRows: rows, scoringSettings: activeScoringSettings }));
      })
      .catch((error) => {
        if (!cancelled && error?.name !== 'AbortError') setSleeperProjectionMap(new Map());
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeScoringSettings, players, sandboxActive, season, week]);

  // Same projection assembly Matchups uses, so both read identical numbers.
  // Matchups passes the defense table and league averages it already built.
  // Rebuilding them here took a few hundred ms on every players or stat-line
  // change (each live stat refresh), so reuse them whenever they were built
  // from the same data this hook reads.
  const sharedProjectionTables = projectionTables?.defenseTable
    && projectionTables.weeklyStats === weeklyStats
    && projectionTables.players === players
    && projectionTables.scoringSettings === activeScoringSettings
    ? projectionTables
    : null;
  const projectionContext = useMemo(() => {
    if (!week || !weeklyStats || !players) return null;
    return buildProjectionContext({
      weeklyStats,
      players,
      scheduleMap: activeScheduleMapForContext,
      scoringSettings: activeScoringSettings,
      week,
      defenseTable: sharedProjectionTables?.defenseTable ?? null,
      leagueAvgByPos: sharedProjectionTables?.leagueAvgByPos ?? null,
      sleeperProjections: sleeperProjectionMap,
    });
  }, [activeScheduleMapForContext, activeScoringSettings, players, sharedProjectionTables, sleeperProjectionMap, week, weeklyStats]);

  const starterInfoById = useMemo(() => {
    const map = new Map();
    if (!projectionContext) return map;
    matchupStarterIds.forEach((id) => {
      const info = resolveStarterGameInfo(id, projectionContext);
      if (info) map.set(id, info);
    });
    return map;
  }, [matchupStarterIds, projectionContext]);

  useEffect(() => {
    if (!starterInfoById.size || sandboxActive) return undefined;
    let cancelled = false;
    const pending = [];
    starterInfoById.forEach((info) => {
      const key = getStarterWeatherKey(info);
      if (!key || info.isIndoor || !info.stadium?.lat || weatherMap[key] !== undefined) return;
      if (weatherPendingRef.current.has(key)) return;
      weatherPendingRef.current.add(key);
      pending.push({ key, lat: info.stadium.lat, lng: info.stadium.lng, date: info.gameDate });
    });
    if (!pending.length) return undefined;
    Promise.all(pending.map(({ key, lat, lng, date }) => (
      fetchGameWeather(lat, lng, date)
        .then((weather) => ({ key, weather }))
        .catch(() => ({ key, weather: null }))
    ))).then((results) => {
      results.forEach(({ key }) => weatherPendingRef.current.delete(key));
      if (cancelled) return;
      setWeatherMap((prev) => {
        const next = { ...prev };
        results.forEach(({ key, weather }) => { next[key] = weather; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [sandboxActive, starterInfoById, weatherMap]);

  const projectionsById = useMemo(() => {
    const map = new Map();
    if (!projectionContext) return map;
    starterInfoById.forEach((info, id) => {
      const weather = weatherMap[getStarterWeatherKey(info)] ?? null;
      map.set(id, projectFromGameInfo(info, projectionContext, { weather }));
    });
    return map;
  }, [projectionContext, starterInfoById, weatherMap]);

  const fallbackAvgById = useMemo(() => {
    const map = new Map();
    if (!seasonStats) return map;
    matchupStarterIds.forEach((id) => {
      const stats = seasonStats[id];
      const games = Number(stats?.gp);
      if (!stats || !Number.isFinite(games) || games < 1) return;
      const total = calcPointsFromTotals(stats, activeScoringSettings, players?.[id]?.position);
      if (Number.isFinite(total) && total > 0) map.set(id, total / games);
    });
    return map;
  }, [activeScoringSettings, matchupStarterIds, players, seasonStats]);

  // Game progress and official settlement are separate facts.
  const starterGameStateById = useMemo(() => {
    const map = new Map();
    const weekSchedule = activeScheduleMapForContext?.[week] ?? activeScheduleMapForContext?.[String(week)] ?? null;
    const hasScheduleForWeek = isCompleteScheduleWeek(weekSchedule);
    const weekOfficiallyComplete = hasScheduleForWeek && Object.values(weekSchedule).every((entry) => entry?.completed === true);
    // A replayed week is not over at its kickoff: the season schedule's
    // `completed` flag and the wall clock are real-world truth, so a replay
    // reads game state from its own game feed and clock alone. Otherwise every
    // starter reads as final (and settled) at any replay moment.
    const replayNow = sandboxReplay ? sandbox.instantAt(sandbox.progress) : Number.NaN;
    matchupStarterIds.forEach((id) => {
      const team = getTeamAbbr(starterInfoById.get(id)?.team ?? players?.[id]?.team);
      const hasCurrentTeam = Boolean(team && team !== 'FA');
      const weekEntry = hasCurrentTeam ? weekSchedule?.[team] ?? null : null;
      const scheduleEntry = sandboxReplay && weekEntry?.completed ? { ...weekEntry, completed: false } : weekEntry;
      const game = hasCurrentTeam ? findGameForTeam(liveGames, team) : null;
      const resolution = resolveStarterGameState({
        game,
        scheduleEntry,
        hasScheduleForWeek,
        hasGameThisWeek: hasCurrentTeam && hasScheduleForWeek
          ? Boolean(scheduleEntry)
          : !hasCurrentTeam && weekOfficiallyComplete ? false : null,
      });
      const fallbackRemainingFraction = getFallbackRemainingGameFraction({
        scheduleEntry,
        currentPoints: currentStarterPointsById.get(id) ?? null,
        ...(Number.isFinite(replayNow) ? { now: replayNow } : {}),
      });
      map.set(id, {
        ...resolution,
        team,
        game,
        scheduleEntry,
        remainingFraction: resolution.state === 'live'
          ? getRemainingGameFraction(game)
          : resolution.settled
            ? resolution.remainingFraction
            : Math.min(resolution.remainingFraction, fallbackRemainingFraction),
      });
    });
    return map;
  }, [activeScheduleMapForContext, currentStarterPointsById, liveGames, matchupStarterIds, players, sandbox, sandboxReplay, starterInfoById, week]);

  // The matchup has begun once any starter's game has kicked off (as early as
  // Thursday night). Before that there is no progress to chart or replay.
  // Read from the week's game feed alone: the season schedule's `completed`
  // flag is real-world truth, which a replayed week is not at its kickoff.
  const matchupStarted = useMemo(() => [...starterGameStateById.values()].some((resolution) => (
    isLiveGame(resolution?.game) || isFinalGame(resolution?.game)
  )), [starterGameStateById]);

  const allStartersOfficiallySettled = matchupStarterIds.length > 0
    && matchupStarterIds.every((id) => starterGameStateById.get(id)?.settled === true);
  const finalReconciliationKey = currentMatchup && selectedLeagueId
    ? `${selectedLeagueId}:${season}:${week}:${currentMatchup.matchupId}`
    : null;
  const settledConfirmed = Boolean(
    allStartersOfficiallySettled
    && finalReconciliationKey
    && finalReconciliation.key === finalReconciliationKey
    && finalReconciliation.status === 'success',
  );

  useEffect(() => {
    setFinalReconciliation({ key: finalReconciliationKey, status: 'idle', requestedAt: null, completedAt: null, attempts: 0 });
  }, [finalReconciliationKey]);

  useEffect(() => {
    if (
      !allStartersOfficiallySettled
      || !finalReconciliationKey
      || !selectedLeagueId
      || !currentMatchup
      || finalReconciliation.key !== finalReconciliationKey
      || finalReconciliation.status !== 'idle'
    ) return undefined;
    let cancelled = false;
    const requestedAt = Date.now();
    const attempts = finalReconciliation.attempts + 1;
    setFinalReconciliation({ key: finalReconciliationKey, status: 'pending', requestedAt, completedAt: null, attempts });
    const requestWeekKey = weekKey;
    (sandbox ? sandbox.base.loadMatchups(selectedLeagueId, week) : getLiveMatchups(selectedLeagueId, week))
      .then((rows) => {
        if (cancelled) return;
        const reconciled = hasReconciledMatchup(rows, currentMatchup.matchupId);
        if (reconciled) setMatchupsState({ key: requestWeekKey, rows: rows ?? [] });
        setFinalReconciliation({ key: finalReconciliationKey, status: reconciled ? 'success' : 'incomplete', requestedAt, completedAt: Date.now(), attempts });
      })
      .catch(() => {
        if (cancelled) return;
        setFinalReconciliation({ key: finalReconciliationKey, status: 'error', requestedAt, completedAt: Date.now(), attempts });
      });
    return () => { cancelled = true; };
  }, [allStartersOfficiallySettled, sandbox, currentMatchup, finalReconciliation.attempts, finalReconciliation.key, finalReconciliation.status, finalReconciliationKey, selectedLeagueId, week, weekKey]);

  useEffect(() => {
    if (
      !allStartersOfficiallySettled
      || finalReconciliation.key !== finalReconciliationKey
      || !['error', 'incomplete'].includes(finalReconciliation.status)
    ) return undefined;
    const retryDelay = Math.min(FINAL_RECONCILIATION_RETRY_MS * Math.max(1, finalReconciliation.attempts), 120000);
    const timer = window.setTimeout(() => {
      setFinalReconciliation((current) => (
        current.key === finalReconciliationKey && ['error', 'incomplete'].includes(current.status)
          ? { ...current, status: 'idle' }
          : current
      ));
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [allStartersOfficiallySettled, finalReconciliation.attempts, finalReconciliation.key, finalReconciliation.status, finalReconciliationKey]);

  const winProb = useMemo(() => {
    if (!leftSummary || !rightSummary) return null;
    const buildOutlooks = (summary) => summary.rows.map((row) => getStarterOutlook({
      current: settledConfirmed ? (row.sleeperPoints ?? row.points) : row.points,
      position: row.player?.position,
      projection: projectionsById.get(row.id) ?? null,
      fallbackAvg: fallbackAvgById.get(row.id) ?? null,
      fraction: starterGameStateById.get(row.id)?.remainingFraction ?? 1,
      playerId: row.id,
      playerName: getSleeperPlayerName(row.player),
      state: starterGameStateById.get(row.id)?.state ?? 'unresolved',
    }));
    const withScoreAdjustment = (outlook, summary) => {
      const adjustment = getMatchupCustomPoints(summary.matchupRow);
      return adjustment ? { ...outlook, current: outlook.current + adjustment } : outlook;
    };
    let outlookA = withScoreAdjustment(computeSideOutlook(buildOutlooks(leftSummary)), leftSummary);
    let outlookB = withScoreAdjustment(computeSideOutlook(buildOutlooks(rightSummary)), rightSummary);
    if (settledConfirmed) {
      const officialA = getOfficialMatchupRowPoints(leftSummary.matchupRow);
      const officialB = getOfficialMatchupRowPoints(rightSummary.matchupRow);
      if (officialA != null) outlookA = { ...outlookA, current: officialA, remainingProj: 0, remainingVar: 0, playersRemaining: 0 };
      if (officialB != null) outlookB = { ...outlookB, current: officialB, remainingProj: 0, remainingVar: 0, playersRemaining: 0 };
    }
    const result = computeWinProbability(outlookA, outlookB, { settledConfirmed });
    return { ...result, outlookA, outlookB, explain: explainWinProbability(result, outlookA, outlookB) };
  }, [fallbackAvgById, leftSummary, projectionsById, rightSummary, settledConfirmed, starterGameStateById]);

  const historyKey = currentMatchup && selectedLeagueId
    ? buildWinProbHistoryKey({ leagueId: selectedLeagueId, season, week, matchupId: currentMatchup.matchupId })
    : null;

  useEffect(() => {
    if (!historyKey) {
      setWinProbHistory([]);
      return;
    }
    // A finished week is reconstructed from its plays alone, so it reads the
    // same whether or not this browser watched it live.
    setWinProbHistory(LIVE_SANDBOX_ENABLED || historical ? [] : loadWinProbHistory(historyKey));
  }, [historical, historyKey]);

  useEffect(() => {
    if (!historyKey || historical || !winProb || !leftSummary || !rightSummary) return;
    if (matchupsLoading || !activeScheduleMapForContext || !leftSummary.rows.length) return;
    setWinProbHistory((current) => {
      const next = appendWinProbPoint(current, {
        t: Date.now(),
        p: winProb.probA,
        a: winProb.explain?.a?.current ?? Math.round((leftSummary.total ?? 0) * 100) / 100,
        b: winProb.explain?.b?.current ?? Math.round((rightSummary.total ?? 0) * 100) / 100,
        settled: winProb.settled,
        settlementPending: winProb.settlementPending,
        modelId: winProb.modelId,
        expectedA: winProb.expectedA,
        expectedB: winProb.expectedB,
        sigma: winProb.sigma,
        explain: winProb.explain,
      });
      if (next !== current && !LIVE_SANDBOX_ENABLED) saveWinProbHistory(historyKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey, winProb?.probA, winProb?.settled, lastUpdatedAt]);

  const baseSides = useMemo(() => sideSummaries.map((summary) => {
    const entries = summary.rows.map((row) => ({
      id: row.id,
      row,
      sideKey: summary.key,
      pace: getStarterPace({
        current: settledConfirmed ? (row.sleeperPoints ?? row.points) : row.points,
        position: row.player?.position,
        projection: projectionsById.get(row.id) ?? null,
        fallbackAvg: fallbackAvgById.get(row.id) ?? null,
        remainingFraction: starterGameStateById.get(row.id)?.remainingFraction ?? 1,
      }),
    }));
    const basePace = buildSidePace(entries.map((entry) => entry.pace));
    const adjustment = getMatchupCustomPoints(summary.matchupRow);
    const pace = adjustment
      ? { ...basePace, total: basePace.total + adjustment, liveProjected: basePace.liveProjected + adjustment, vsPace: basePace.vsPace + adjustment }
      : basePace;
    const officialTotal = settledConfirmed && !sandboxActive ? getOfficialMatchupRowPoints(summary.matchupRow) : null;
    return {
      key: summary.key,
      rosterId: summary.rosterId,
      entries,
      pace: officialTotal == null
        ? pace
        : { ...pace, total: officialTotal, liveProjected: officialTotal, projected: officialTotal, vsPace: officialTotal - pace.pace },
    };
  }), [fallbackAvgById, projectionsById, sandboxActive, settledConfirmed, sideSummaries, starterGameStateById]);

  const baseEntriesById = useMemo(() => {
    const map = new Map();
    baseSides.forEach((side) => side.entries.forEach((entry) => map.set(entry.id, entry)));
    return map;
  }, [baseSides]);

  // Play-by-play backfill + throttled live refresh.
  const playRequestContextKey = [
    selectedLeagueId,
    season,
    week,
    currentMatchup?.matchupId ?? '',
    sandbox?.mode ?? 'live',
    liveStatus?.session?.enabled ? 'enabled' : 'disabled',
  ].join(':');
  playRequestContextRef.current = playRequestContextKey;

  useEffect(() => () => { playRequestContextRef.current = null; }, []);

  useEffect(() => {
    if (!liveStatus?.session?.enabled || !currentMatchup || !liveGames.length) return undefined;
    const mockPlays = demoFeedEnabled;
    if (isFreeLiveTier(liveStatus) && !mockPlays) return undefined;
    const requestContext = playRequestContextKey;
    const requestFeedKey = feedKey;
    if (playFetchInFlightContextsRef.current.has(requestContext)) return undefined;
    playFetchInFlightContextsRef.current.add(requestContext);
    const starterRows = sideSummaries.flatMap((summary) => summary.rows);
    const relevant = limitPlayByPlayGames(
      // Only games that have kicked off have plays, demo plays included: a
      // week that has not started shows none.
      sortRelevantGames(liveGames, matchupTeams).filter((game) => isLiveGame(game) || isFinalGame(game)),
      { mock: mockPlays, maxGames: MAX_PLAYS_GAMES },
    );

    (async () => {
      try {
        await Promise.allSettled(relevant.map(async (game) => {
          if (playRequestContextRef.current !== requestContext) return;
          const gameId = String(game.id);
          const marker = playsFetchedRef.current.get(gameId);
          const final = isFinalGame(game);
          const now = Date.now();
          const shouldFetch = sandbox?.replay
            ? marker?.progress !== sandbox.progress
            : !marker || (final && !marker.final) || (!final && now - marker.at >= PLAYS_REFRESH_MIN_MS);
          if (!shouldFetch) return;
          const sessionCacheable = final && !sandbox && !mockPlays;
          if (sessionCacheable && FINAL_GAME_PLAYS.has(gameId)) {
            playsFetchedRef.current.set(gameId, { at: Date.now(), final, progress: null });
            const cachedPlays = FINAL_GAME_PLAYS.get(gameId);
            storeGamePlays(requestFeedKey, gameId, cachedPlays);
            return;
          }
          try {
            const payload = mockPlays
              ? {
                  data: buildMockLivePlays(game, starterRows.filter((row) => getTeamAbbr(row.player?.team)
                    && [getTeamAbbr(game?.visitor_team), getTeamAbbr(game?.home_team)].includes(getTeamAbbr(row.player.team)))),
                }
              : await liveSource.getLiveGamePlays(gameId, sandbox?.mode === 'preseason' ? { seasonType: 'preseason' } : undefined);
            if (playRequestContextRef.current !== requestContext) return;
            if (payload?.retryable) return;
            playsFetchedRef.current.set(gameId, { at: Date.now(), final, progress: sandbox?.progress });
            const fetchedPlays = Array.isArray(payload?.data) ? payload.data : [];
            if (sessionCacheable && fetchedPlays.length) rememberFinalGamePlays(gameId, fetchedPlays);
            storeGamePlays(requestFeedKey, gameId, fetchedPlays);
          } catch {
            // Leave the marker unset so a later tick can retry.
          }
        }));
      } finally {
        playFetchInFlightContextsRef.current.delete(requestContext);
      }
    })();
    return undefined;
  }, [currentMatchup, demoFeedEnabled, feedKey, lastUpdatedAt, liveGames, liveSource, liveStatus, matchupTeams, playRequestContextKey, sandbox, sideSummaries, storeGamePlays]);

  const gamesById = useMemo(() => {
    const map = new Map();
    liveGames.forEach((game) => map.set(String(game.id), game));
    return map;
  }, [liveGames]);

  // The week's kickoff-window axis: the chart, the replay bar and the feed all
  // place events on it.
  const axis = useMemo(() => buildSlateAxis(liveGames), [liveGames]);

  const positionsById = useMemo(() => {
    const map = new Map();
    starterPlayersById.forEach((player, id) => map.set(id, String(player?.position ?? 'FLEX').toUpperCase()));
    return map;
  }, [starterPlayersById]);

  const starterNameIndex = useMemo(() => (
    buildStarterNameIndex([...starterPlayersById].map(([id, player]) => ({ id, player })))
  ), [starterPlayersById]);

  const finalGameIds = useMemo(() => (
    liveGames.filter((game) => isFinalGame(game)).map((game) => String(game.id))
  ), [liveGames]);

  const playEvents = useMemo(() => {
    // Only this week's games: plays fetched for another week's game list can
    // never reach the feed, whatever order the requests settle in.
    const currentPlaysByGame = Object.fromEntries(Object.entries(playsByGame).filter(([gameId]) => gamesById.has(String(gameId))));
    const built = buildPlayEvents(currentPlaysByGame, starterNameIndex, activeScoringSettings, positionsById, gamesById);
    if (!sandbox?.replay) return built;
    return built.map((event) => {
      const slate = sandbox.toSlateProgress(event.gameId, event.progress);
      const at = Number.isFinite(slate) ? sandbox.instantAt(slate) : null;
      return Number.isFinite(at) ? { ...event, at, timelineAt: at, slateProgress: slate } : event;
    });
  }, [activeScoringSettings, gamesById, playsByGame, positionsById, sandbox, starterNameIndex]);

  const observedPlayPoints = useMemo(() => buildObservedPlayerPoints(playEvents), [playEvents]);

  // Starters whose game is officially over: the reconciler places Sleeper
  // points their plays do not explain right away instead of waiting for a
  // second stat-line fetch that a finished game never triggers. Keyed by
  // content so an unchanged set does not re-run reconciliation.
  // Plays are fetched game by game. A starter counts as settled only once
  // their game is final in the week's game feed (not the season schedule: a
  // replayed week is not over at its kickoff) AND that game's plays are in, or
  // no plays will come at all (free tier). Settling earlier hands the
  // reconciler a stand-in row for points the plays are about to explain, and
  // the plays then count twice.
  const playsExpected = Boolean(liveStatus?.session?.enabled) && (demoFeedEnabled || !isFreeLiveTier(liveStatus));
  const settledStarterKey = [...starterGameStateById]
    .filter(([, resolution]) => isFinalGame(resolution?.game)
      && (!playsExpected || Object.prototype.hasOwnProperty.call(playsByGame, String(resolution.game.id))))
    .map(([id]) => id)
    .sort()
    .join(',');
  const settledStarterIds = useMemo(() => (settledStarterKey ? settledStarterKey.split(',') : []), [settledStarterKey]);

  // The chart's inputs are complete: every started game's plays are in (or no
  // plays will come) and Sleeper's stat line has landed (or is not used).
  // Until then the series is still filling in game by game, so Matchups keeps
  // the chart back rather than drawing it in chunks.
  const playsLoaded = useMemo(() => {
    if (!playsExpected) return true;
    const started = limitPlayByPlayGames(
      sortRelevantGames(liveGames, matchupTeams).filter((game) => isLiveGame(game) || isFinalGame(game)),
      { mock: demoFeedEnabled, maxGames: MAX_PLAYS_GAMES },
    );
    return started.every((game) => Object.prototype.hasOwnProperty.call(playsByGame, String(game.id)));
  }, [demoFeedEnabled, liveGames, matchupTeams, playsByGame, playsExpected]);
  const statLineLoaded = !reconcilerEnabled || (sandboxActive && !sandboxReplay) || sleeperStatsFetchedAt != null;
  const feedReady = Boolean(currentMatchup) && playsLoaded && statLineLoaded;

  // Reconciliation step (effect, not memo: the rows it scores must never feed
  // back into the plays it reads).
  useEffect(() => {
    if (!reconcilerEnabled || !currentMatchup) return;
    const now = sandboxReplay ? sandbox.instantAt(sandbox.progress) : Date.now();
    const next = reconcileLivePlays(reconciliationRef.current, {
      playEvents,
      sleeperPointsById: currentStarterPointsById,
      sleeperStatsById: starterSleeperStats,
      sleeperStatsFetchedAt,
      scoringSettings: activeScoringSettings,
      positionsById,
      finalGameIds,
      settledPlayerIds: settledStarterIds,
      now: Number.isFinite(now) ? now : Date.now(),
    });
    reconciliationRef.current = next;
    setReconciliation(next);
  }, [activeScoringSettings, currentMatchup, currentStarterPointsById, finalGameIds, playEvents, positionsById, reconcilerEnabled, sandbox, sandboxReplay, settledStarterIds, starterSleeperStats, sleeperStatsFetchedAt]);

  // One stream for the feed, the chart and the hover cards, each event placed
  // on the kickoff-window axis as `progress`; `gameProgress` stays per game.
  const mergedFeed = useMemo(() => {
    const merged = reconcilerEnabled
      ? reconciliation.feedEvents.map((event) => (Number.isFinite(Number(event.displayPts))
        ? { ...event, pts: Number(event.displayPts), rawPts: event.pts }
        : event))
      : mergePlayEvents(playEvents, feedEvents);
    const events = merged.map((event) => {
      const starterTeam = getTeamAbbr(baseEntriesById.get(event.playerId)?.row?.player?.team);
      const fallbackGameId = findGameForTeam(liveGames, starterTeam)?.id;
      const gameId = event.gameId ?? fallbackGameId ?? null;
      const gameProgress = Number.isFinite(Number(event.progress))
        ? Number(event.progress)
        : parseGlanceProgress(event.glance?.clock) ?? baseEntriesById.get(event.playerId)?.pace?.progress ?? null;
      // A stat-update row is stamped when it was created. In a finished game
      // that is after the fact, so give it the game's own time at its axis
      // spot instead, or the win chance at earlier moments would miss it.
      const finishedGame = event.source === 'stat-update' && gameId != null ? gamesById.get(String(gameId)) : null;
      const finishedKickoff = finishedGame && isFinalGame(finishedGame) ? Date.parse(finishedGame.date ?? '') : Number.NaN;
      const timelineAt = Number.isFinite(finishedKickoff)
        ? finishedKickoff + (Number.isFinite(Number(gameProgress)) ? Number(gameProgress) : 1) * GAME_WALLCLOCK_MS
        : event.timelineAt ?? (event.source === 'play' ? null : event.at) ?? null;
      if (sandbox?.replay) {
        const slate = Number.isFinite(Number(event.slateProgress))
          ? Number(event.slateProgress)
          : sandbox.toSlateProgress(gameId, gameProgress);
        const at = Number.isFinite(slate) ? sandbox.instantAt(slate) : null;
        return {
          ...event,
          gameId,
          gameProgress,
          progress: Number.isFinite(slate) ? slate : gameProgress,
          timelineAt: Number.isFinite(at) ? at : timelineAt,
          at: Number.isFinite(at) ? at : event.at,
        };
      }
      const slate = axis.gamePosition(gameId, gameProgress);
      return { ...event, gameId, gameProgress, timelineAt, progress: Number.isFinite(Number(slate)) ? slate : gameProgress };
    });
    const withDemoEvents = demoFeedEnabled && matchupStarted
      ? events.concat(buildSharedDemoScoringEvents({ sides: sideSummaries, scoringSettings: activeScoringSettings }))
      : events;
    return sortLiveFeedEvents(withDemoEvents).filter((event) => event?.status !== 'unconfirmed');
  }, [activeScoringSettings, axis, baseEntriesById, demoFeedEnabled, feedEvents, gamesById, liveGames, matchupStarted, playEvents, reconcilerEnabled, reconciliation, sandbox, sideSummaries]);

  const sides = useMemo(() => applyObservedPointFallback(
    baseSides,
    observedPlayPoints,
    sandbox?.mode === 'preseason',
  ), [baseSides, observedPlayPoints, sandbox?.mode]);
  const leftSide = sides[0] ?? null;
  const rightSide = sides[1] ?? null;

  // NOW on the axis: the furthest point any game has reached.
  const slateProgress = useMemo(() => {
    if (sandbox?.replay) return sandbox.getChartProgress?.(sandbox.progress) ?? sandbox.progress;
    if (!axis.isEmpty) {
      const reached = liveGames.map((game) => {
        if (isFinalGame(game)) return axis.gamePosition(game.id, 1);
        if (isLiveGame(game)) return axis.gamePosition(game.id, 1 - getRemainingGameFraction(game));
        return null;
      }).filter((value) => Number.isFinite(Number(value)));
      if (reached.length) return Math.max(...reached);
      const eventProgresses = mergedFeed.map((event) => Number(event.progress)).filter((value) => Number.isFinite(value));
      if (eventProgresses.length) return Math.max(...eventProgresses);
      return 0;
    }
    const all = baseSides.flatMap((side) => side.entries);
    if (!all.length) return 0;
    return all.reduce((sum, entry) => sum + entry.pace.progress, 0) / all.length;
  }, [axis, baseSides, liveGames, mergedFeed, sandbox]);

  const replayGameTimelines = useMemo(() => buildGameProgressTimelines(mergedFeed), [mergedFeed]);
  const replayStarterTimelineById = useMemo(() => {
    const map = new Map();
    starterGameStateById.forEach((resolution, playerId) => {
      const kickoffAt = Date.parse(resolution?.game?.date ?? resolution?.scheduleEntry?.kickoff ?? '');
      map.set(playerId, {
        state: resolution?.state ?? 'unresolved',
        gameId: resolution?.game?.id ?? null,
        kickoffAt: Number.isFinite(kickoffAt) ? kickoffAt : null,
      });
    });
    return map;
  }, [starterGameStateById]);

  // The chart series: running totals, win chance and projected finals after
  // every scoring play (buildPaceSeries points carry x, a, b, p, expectedA/B).
  const paceModel = useMemo(() => {
    const snapshotAt = winProb?.outlookA && winProb?.outlookB
      ? (point, context) => {
          const moment = {
            at: point.at,
            gameId: context?.event?.gameId ?? null,
            gameProgress: context?.event?.gameProgress ?? context?.event?.progress ?? null,
          };
          const fractionByPlayer = new Map();
          [...(winProb.outlookA.outlooks ?? []), ...(winProb.outlookB.outlooks ?? [])].forEach((outlook) => {
            fractionByPlayer.set(
              outlook.playerId,
              getStarterReplayRemainingFraction(replayStarterTimelineById.get(outlook.playerId), moment, replayGameTimelines),
            );
          });
          const replayA = projectSideOutlookAtMoment(winProb.outlookA, { currentByPlayer: context?.currentByPlayer, fractionByPlayer });
          const replayB = projectSideOutlookAtMoment(winProb.outlookB, { currentByPlayer: context?.currentByPlayer, fractionByPlayer });
          const result = computeWinProbability(replayA, replayB);
          return {
            a: replayA.current,
            b: replayB.current,
            p: result.probA,
            settled: false,
            settlementPending: result.settlementPending,
            modelId: result.modelId,
            expectedA: result.expectedA,
            expectedB: result.expectedB,
            sigma: result.sigma,
            explain: explainWinProbability(result, replayA, replayB),
          };
        }
      : null;
    const liveSnapshot = winProb
      ? {
          p: winProb.probA,
          settled: winProb.settled,
          settlementPending: winProb.settlementPending,
          modelId: winProb.modelId,
          expectedA: winProb.expectedA,
          expectedB: winProb.expectedB,
          sigma: winProb.sigma,
          explain: winProb.explain,
        }
      : null;
    const eventAxisIsAuthoritative = Boolean(sandbox?.replay || sandbox?.mode === 'preseason');
    return buildPaceSeries({
      events: mergedFeed,
      sideKeyOf: (event) => playerSideKey.get(event.playerId) ?? null,
      totals: { a: leftSide?.pace.total ?? 0, b: rightSide?.pace.total ?? 0 },
      slateProgress,
      snapshotAt: preservePaceSeriesScores(snapshotAt, eventAxisIsAuthoritative),
      historicalSnapshots: (demoFeedEnabled || eventAxisIsAuthoritative) ? [] : winProbHistory,
      accumulateInOrder: eventAxisIsAuthoritative,
      scoreAxisIsAuthoritative: true,
      liveSnapshot,
      reconcileToTotals: demoFeedEnabled,
    });
  }, [demoFeedEnabled, leftSide, mergedFeed, playerSideKey, replayGameTimelines, replayStarterTimelineById, rightSide, sandbox, slateProgress, winProb, winProbHistory]);

  const bigPlayThreshold = useMemo(() => getBigPlayThreshold(activeScoringSettings), [activeScoringSettings]);

  const enableLive = useCallback(async (accessCode = '') => {
    setSessionLoading(true);
    setLiveError('');
    try {
      const payload = await startLiveSession({ leagueId: selectedLeagueId, provider: 'sleeper', accessCode });
      const statusPayload = await getLiveStatus({ leagueId: selectedLeagueId });
      setLiveStatus({ ...statusPayload, session: payload.session ?? statusPayload.session });
    } catch (error) {
      setLiveError(error?.message ?? 'Could not turn on live scoring.');
    } finally {
      setSessionLoading(false);
    }
  }, [selectedLeagueId]);

  // Feed-ready events: fantasy-relevant, newest first, each tagged with the
  // roster it belongs to.
  const events = useMemo(() => {
    const rosterByKey = Object.fromEntries(sides.map((side) => [side.key, side.rosterId]));
    return mergedFeed
      .filter((event) => isFantasyFeedEvent(event) && playerSideKey.has(event.playerId))
      .map((event) => ({ ...event, rosterId: rosterByKey[playerSideKey.get(event.playerId)] ?? null }));
  }, [mergedFeed, playerSideKey, sides]);

  // Before the first scoring play (or without play-by-play) the chart still
  // needs a line: the forecast from kickoff to now, at the current totals.
  const series = useMemo(() => {
    if (paceModel.points.length >= 2) return paceModel.points;
    if (!winProb) return [];
    const snapshot = { p: winProb.probA, expectedA: winProb.expectedA, expectedB: winProb.expectedB, settled: winProb.settled };
    return [
      { ...snapshot, x: 0, a: 0, b: 0, eventId: null },
      { ...snapshot, x: slateProgress, a: leftSide?.pace.total ?? 0, b: rightSide?.pace.total ?? 0, eventId: null },
    ];
  }, [leftSide, paceModel.points, rightSide, slateProgress, winProb]);

  const platformLabel = platform === 'espn' ? 'ESPN' : 'Sleeper';
  const sessionEnabled = Boolean(liveStatus?.session?.enabled);
  return {
    // Shown only when the league has a live session, the week is the current
    // or an earlier one, and the followed matchup was found.
    active: Boolean(week && sessionEnabled && currentMatchup),
    // Whether any starter in this matchup has kicked off.
    started: matchupStarted,
    // The first answer is in: no live layer applies, the session check came
    // back without a session or failed, or this context's games, plays and
    // stat line have loaded.
    // Matchups holds its skeleton until then so the page arrives once.
    ready: Boolean(
      !sessionWeek
      || statusError
      || (liveStatus && !liveStatus.session?.enabled)
      || liveError
      || (gamesLoadedContext === liveSnapshotContextKey && !matchupsLoading && (feedReady || !currentMatchup)),
    ),
    // The chart's data is complete (see above).
    feedReady,
    week,
    historical: Boolean(week && historical),
    sandbox,
    status: {
      liveEnabled: Boolean(liveStatus?.live?.enabled),
      sessionEnabled,
      sessionLoading,
      accessCodeRequired: Boolean(liveStatus?.live?.accessCodeRequired),
      configurationMessage: getLiveConfigurationMessage(liveStatus?.live, platformLabel),
      error: statusError || liveError,
      loading: loadingLive || matchupsLoading,
      lastUpdatedAt,
    },
    enableLive,
    games: liveGames,
    gamesById,
    axis,
    nowProgress: slateProgress,
    matchupLiveGameCount,
    // Sides keyed by Sleeper roster id: displayed totals, starter rows (with
    // pace and projection) and each starter's game state.
    sidesByRosterId: Object.fromEntries(sides.map((side) => [side.rosterId, side])),
    sideKeyByRosterId: Object.fromEntries(sides.map((side) => [side.rosterId, side.key])),
    starterGameStateById,
    projectionsById,
    events,
    series,
    winProb,
    bigPlayThreshold,
  };
}
