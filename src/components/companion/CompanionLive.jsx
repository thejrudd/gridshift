import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import { getLiveMatchups, getNflState, getWeeklyStats } from '../../api/sleeperApi';
import { calcPoints, calcPointsFromTotals } from '../../utils/scoringEngine';
import { fetchSeasonSchedule } from '../../utils/playerApi.js';
import { getCompanionInitials } from '../../utils/companionAssetVisuals.js';
import {
  buildDeltaEvents,
  buildStatIndex,
  findGameForTeam,
  getFallbackRemainingGameFraction,
  getGameGlance,
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
  resolveCurrentPlayerPoints,
  resolveStarterGameState,
} from '../../utils/liveScoringFeed.js';
import {
  clearLiveSession,
  getLiveGamePlays,
  getLiveGames,
  getLivePlayerStatsForGames,
  getLiveStatus,
  startLiveSession,
} from '../../api/liveDataSource';
import { getStatisticsScoresStatus } from '../../api/statisticsScoresApi';
import { fetchGameWeather } from '../../api/weatherApi';
import {
  buildProjectionContext,
  getStarterWeatherKey,
  projectFromGameInfo,
  resolveStarterGameInfo,
} from '../../utils/starterProjections.js';
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
} from '../../utils/liveWinProbability.js';
import {
  buildPlayEvents,
  buildStarterNameIndex,
  groupSharedPlayEvents,
  mergePlayEvents,
  parseGlanceProgress,
} from '../../utils/livePlaysFeed.js';
import {
  buildPaceSeries,
  buildGameProgressTimelines,
  buildSidePace,
  buildTopPerformers,
  buildVerdict,
  getStarterReplayRemainingFraction,
  getStarterPace,
  pickFeaturedStarter,
} from '../../utils/livePace.js';
import {
  buildDemoTimeline,
  mapGameProgressToDemoTimeline,
} from '../../utils/liveDemoTimeline.js';
import {
  buildSharedDemoScoringEvents,
  limitPlayByPlayGames,
} from '../../utils/liveDemoPlays.js';
import { buildFantasyPaletteSlots, getFantasyTeamPalette } from '../../utils/fantasyTeamIdentity.js';
import { CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls';
import LiveHero from './live/LiveHero.jsx';
import LivePlayerSheet from './live/LivePlayerSheet.jsx';
import LiveVerdict from './live/LiveVerdict.jsx';
import LivePaceChart from './live/LivePaceChart.jsx';
import LivePerformerRail from './live/LivePerformerRail.jsx';
import { LiveFeedFilter, LiveFeedList, LiveFeedPlayFilter } from './live/LiveFeed.jsx';
import {
  EMPTY_FEED_FILTER,
  buildFeedFilterModel,
  getBigPlayThreshold,
  matchesFeedFilter,
} from '../../utils/liveFeedFilters.js';
import { firstWordOf, lastNameOf } from './live/liveVisuals.js';
import SeasonHintBanner from '../ui/SeasonHintBanner';
import {
  getLiveConfigurationMessage,
  resolveFantasyLiveAvailability,
} from '../../utils/fantasyLiveAvailability.js';
import {
  LIVE_SANDBOX_ENABLED,
  LiveSandboxPanel,
  buildReplayDeltaEvents,
  useChartScale,
  spreadEventsAcrossInterval,
  subscribeToRewind,
  useLiveSandbox,
} from '../../dev/liveSandbox';

const LIVE_REFRESH_MS = 5000;
const FREE_TIER_REFRESH_MS = 60000;
const MAX_FEED_EVENTS = 80;
// A full Sunday slate, so every starter's game can supply play-by-play rather
// than only the first handful.
const MAX_PLAYS_GAMES = 16;
const PLAYS_REFRESH_MIN_MS = 8_000;
const RAIL_PERFORMER_LIMIT = 14;
const FINAL_RECONCILIATION_RETRY_MS = 30000;

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    if (!query) return undefined;
    const apply = () => setDesktop(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return desktop;
}

function formatChipPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '—';
}

function getRosterName(roster, getUserDisplayName) {
  return getUserDisplayName(roster?.owner_id) || `Roster ${roster?.roster_id ?? ''}`.trim();
}

function formatRosterRecord(result) {
  if (!result) return null;
  const wins = Number(result.wins) || 0;
  const losses = Number(result.losses) || 0;
  const ties = Number(result.ties) || 0;
  return `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
}

function getMatchupPairs(matchups, rosters, getUserDisplayName, myRosterId) {
  const rosterById = new Map((rosters ?? []).map((roster) => [Number(roster.roster_id), roster]));
  const byMatchup = new Map();

  (matchups ?? []).forEach((row) => {
    if (row?.matchup_id == null) return;
    const key = Number(row.matchup_id);
    const entry = byMatchup.get(key) ?? [];
    entry.push(row);
    byMatchup.set(key, entry);
  });

  return Array.from(byMatchup.entries()).map(([matchupId, rows]) => {
    const sides = rows
      .map((row) => {
        const roster = rosterById.get(Number(row.roster_id));
        return {
          row,
          roster,
          name: getRosterName(roster, getUserDisplayName),
        };
      })
      .filter((side) => side.roster);
    return {
      matchupId,
      sides,
      mine: sides.some((side) => Number(side.roster?.roster_id) === Number(myRosterId)),
    };
  }).filter((pair) => pair.sides.length > 0)
    .sort((left, right) => {
      if (left.mine !== right.mine) return left.mine ? -1 : 1;
      return left.matchupId - right.matchupId;
    });
}

function getStarterIds(side) {
  return (side?.row?.starters ?? [])
    .map((id) => String(id))
    .filter((id) => id && id !== '0');
}

function getRosterIdFromMatchupRow(row) {
  const rosterId = Number(row?.roster_id);
  return Number.isFinite(rosterId) ? rosterId : null;
}

function getMatchupRowPoints(row) {
  const officialPoints = getOfficialMatchupRowPoints(row);
  if (officialPoints != null) return officialPoints;

  const playerPoints = row?.players_points ?? {};
  const starterPoints = (row?.starters ?? [])
    .map((id) => String(id))
    .filter((id) => id && id !== '0')
    .reduce((sum, id) => {
      const points = Number(playerPoints[id]);
      return sum + (Number.isFinite(points) ? points : 0);
    }, 0);
  return starterPoints + getMatchupCustomPoints(row);
}

function addRosterCumulativeResult(totals, rosterId, result) {
  if (rosterId == null) return;
  const current = totals.get(rosterId) ?? {
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    losses: 0,
    ties: 0,
  };
  totals.set(rosterId, {
    pointsFor: current.pointsFor + (Number.isFinite(result.pointsFor) ? result.pointsFor : 0),
    pointsAgainst: current.pointsAgainst + (Number.isFinite(result.pointsAgainst) ? result.pointsAgainst : 0),
    wins: current.wins + (Number(result.wins) || 0),
    losses: current.losses + (Number(result.losses) || 0),
    ties: current.ties + (Number(result.ties) || 0),
  });
}

function buildCumulativeRosterResults(matchupsByWeek, throughWeek, currentSummaries = []) {
  const totals = new Map();
  const currentWeek = Number(throughWeek);
  const currentPointsByRoster = new Map();

  currentSummaries.forEach((summary) => {
    const rosterId = getRosterIdFromMatchupRow(summary?.side?.row);
    if (rosterId == null) return;
    currentPointsByRoster.set(rosterId, Number(summary.total) || 0);
  });

  for (let weekIndex = 1; weekIndex <= currentWeek; weekIndex += 1) {
    const rows = matchupsByWeek?.[weekIndex] ?? [];
    const groups = new Map();
    rows.forEach((row) => {
      if (row?.matchup_id == null) return;
      const key = Number(row.matchup_id);
      const entry = groups.get(key) ?? [];
      entry.push(row);
      groups.set(key, entry);
    });

    groups.forEach((groupRows) => {
      const scoringRows = groupRows
        .map((row) => {
          const rosterId = getRosterIdFromMatchupRow(row);
          if (rosterId == null) return null;
          const hasCurrentOverride = weekIndex === currentWeek && currentPointsByRoster.has(rosterId);
          return {
            rosterId,
            pointsFor: hasCurrentOverride ? currentPointsByRoster.get(rosterId) : getMatchupRowPoints(row),
          };
        })
        .filter(Boolean);
      const hasScoredPoints = scoringRows.some((row) => row.pointsFor > 0);

      scoringRows.forEach((row) => {
        const rosterId = row.rosterId;
        if (rosterId == null) return;
        const opponentRows = scoringRows.filter((other) => other.rosterId !== rosterId);
        const pointsAgainst = opponentRows.reduce((sum, other) => sum + other.pointsFor, 0);
        const opponentHigh = Math.max(...opponentRows.map((other) => other.pointsFor), 0);
        const shouldCountResult = hasScoredPoints && opponentRows.length > 0;
        addRosterCumulativeResult(totals, rosterId, {
          pointsFor: row.pointsFor,
          pointsAgainst,
          wins: shouldCountResult && row.pointsFor > opponentHigh ? 1 : 0,
          losses: shouldCountResult && row.pointsFor < opponentHigh ? 1 : 0,
          ties: shouldCountResult && row.pointsFor === opponentHigh ? 1 : 0,
        });
      });
    });
  }

  return totals;
}

function getScheduleGlance(scheduleMap, week, teamAbbr, { hasGameEvidence = false } = {}) {
  const team = getTeamAbbr(teamAbbr);
  if (!team || team === 'FA') return null;
  const weekSchedule = scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? null;
  if (!weekSchedule) return null;
  const entry = weekSchedule?.[team] ?? null;
  if (!entry) {
    return hasGameEvidence
      ? { score: 'Game data unavailable', clock: 'Stats reported', live: false }
      : { score: 'Bye week', clock: 'No NFL game', live: false };
  }

  const opponent = getTeamAbbr(entry.opp);
  if (!opponent) return null;
  const away = entry.home ? opponent : team;
  const home = entry.home ? team : opponent;
  const awayScore = entry.home ? entry.ptsAgainst : entry.ptsFor;
  const homeScore = entry.home ? entry.ptsFor : entry.ptsAgainst;
  const hasScore = Number.isFinite(Number(awayScore)) && Number.isFinite(Number(homeScore));
  const dateLabel = entry.date
    ? new Date(`${entry.date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : `Week ${week}`;

  return {
    score: hasScore ? `${away} ${awayScore} · ${home} ${homeScore}` : `${away} @ ${home}`,
    clock: hasScore ? 'Final' : dateLabel,
    live: false,
  };
}

function hasPlayerGameEvidence(row) {
  const points = Number(row?.points);
  return Boolean(row?.detailStats || row?.mappedStats || row?.sleeperStats || (Number.isFinite(points) && points !== 0));
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
        makePlay(dstBase, row, {
          play_type: 'sack',
          yards_gained: -7,
          description: `${team} defense sack and forced fumble recovered by ${team}`,
        }),
        makePlay(dstBase, row, {
          play_type: 'interception',
          yards_gained: 62,
          scoring_play: true,
          touchdown: true,
          description: `${team} defense interception returned for 62 yard touchdown`,
        }),
        makePlay(dstBase, row, {
          play_type: 'fumble_recovery',
          yards_gained: 55,
          scoring_play: true,
          touchdown: true,
          description: `${team} defense fumble recovered and returned for 55 yard touchdown`,
        }),
        makePlay(dstBase, row, {
          play_type: 'safety',
          yards_gained: -2,
          scoring_play: true,
          description: `${team} defense records a safety`,
        }),
        makePlay(dstBase, row, {
          play_type: 'pass',
          yards_gained: 0,
          description: `${team} defense pass defended incomplete`,
        }),
      ];
    }
    if (position === 'QB') {
      return [
        makePlay(base, row, {
          play_type: 'pass',
          yards_gained: 42,
          scoring_play: true,
          touchdown: true,
          description: `${name} 42 yard touchdown pass complete for first down`,
        }),
        makePlay(base, row, {
          play_type: 'rush',
          yards_gained: 45,
          scoring_play: true,
          touchdown: true,
          description: `${name} 45 yard rushing touchdown for first down`,
        }),
        makePlay(base, row, {
          play_type: 'sack',
          yards_gained: -8,
          description: `${name} sacked for 8 yard loss`,
        }),
        makePlay(base, row, {
          play_type: 'rush',
          yards_gained: 4,
          description: `${name} rush for 4 yards, fumble lost`,
        }),
      ];
    }
    if (position === 'K') {
      return [
        makePlay(base, row, {
          play_type: 'field_goal',
          yards_gained: 0,
          scoring_play: true,
          description: `${name} 42 yard field goal is good`,
        }),
        makePlay(base, row, {
          play_type: 'extra_point',
          yards_gained: 0,
          scoring_play: true,
          description: `${name} extra point is good`,
        }),
      ];
    }
    if (['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS'].includes(position)) {
      const idpBase = { ...base, team: opponentTeam, possession_team: opponentTeam, defense_team: team };
      return [
        makePlay(idpBase, row, {
          play_type: 'sack',
          yards_gained: -6,
          description: `${name} sack and forced fumble`,
        }),
        makePlay(idpBase, row, {
          play_type: 'interception',
          yards_gained: 58,
          scoring_play: true,
          touchdown: true,
          description: `${name} interception returned for 58 yard touchdown`,
        }),
        makePlay(idpBase, row, {
          play_type: 'fumble_recovery',
          yards_gained: 52,
          scoring_play: true,
          touchdown: true,
          description: `${name} fumble recovered and returned for 52 yard touchdown`,
        }),
        makePlay(idpBase, row, {
          play_type: 'pass',
          yards_gained: 0,
          description: `${name} pass defended incomplete`,
        }),
      ];
    }
    if (position === 'RB') {
      return [
        makePlay(base, row, {
          play_type: 'rush',
          yards_gained: 41,
          scoring_play: true,
          touchdown: true,
          description: `${name} 41 yard rushing touchdown for first down`,
        }),
        makePlay(base, row, {
          play_type: 'pass',
          yards_gained: 16,
          description: `${name} pass complete for 16 yards and first down`,
        }),
        makePlay(base, row, {
          play_type: 'rush',
          yards_gained: 3,
          scoring_play: true,
          touchdown: true,
          description: `${name} 3 yard rushing touchdown`,
        }),
        makePlay(base, row, {
          play_type: 'rush',
          yards_gained: 5,
          description: `${name} rush for 5 yards, fumble lost`,
        }),
      ];
    }
    if (['WR', 'TE'].includes(position)) {
      return [
        makePlay(base, row, {
          play_type: 'pass',
          yards_gained: 51,
          scoring_play: true,
          touchdown: true,
          description: `${name} 51 yard touchdown reception for first down`,
        }),
        makePlay(base, row, {
          play_type: 'pass',
          yards_gained: 27,
          description: `${name} pass complete for 27 yards and first down`,
        }),
        makePlay(base, row, {
          play_type: 'rush',
          yards_gained: 44,
          description: `${name} rush for 44 yards and first down`,
        }),
      ];
    }
    return [
      makePlay(base, row, {
        play_type: 'rush',
        yards_gained: 11,
        description: `${name} rush for 11 yards`,
      }),
    ];
  });

  // The source snapshot represents one moment, but the demo needs a complete,
  // readable game story. Distribute its generated scoring plays through all
  // four quarters so each compressed game segment escalates steadily.
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

export default function CompanionLive({ onViewPlayer = null }) {
  // Dev-only. Returns null in production, where the whole module is dropped.
  const sandbox = useLiveSandbox();
  const sandboxChartScale = useChartScale();
  const {
    platform,
    selectedLeagueId,
    league,
    season,
    rosters,
    players,
    loadPlayers,
    loadMatchups,
    myRoster,
    getUserDisplayName,
    activeScoringSettings,
    scheduleMap,
    weeklyStats,
    seasonStats,
    loadSeasonStats,
    espnIdOverrides,
    // The sandbox supplies a synthetic league so Fantasy Live can run outside
    // the regular season; anything it omits falls through to the real context.
  } = { ...useSleeperBase(), ...(sandbox?.base ?? {}) };

  const isDesktop = useIsDesktop();

  const [nflState, setNflState] = useState(null);
  const [nflStateLoading, setNflStateLoading] = useState(true);
  const [nflStateError, setNflStateError] = useState('');
  const [liveStatus, setLiveStatus] = useState(null);
  const effectiveNflState = sandbox?.nflState ?? nflState;
  // Primitive so the weather effect can depend on this without churning on
  // every replay tick, since `sandbox` is a fresh object each time.
  const sandboxActive = Boolean(sandbox);
  // The demo feed synthesises a whole week of scoring from current totals, so
  // it renders the feed and pace chart fully populated the moment the page
  // loads. The sandbox drives those from its own clock instead, accumulating
  // events as the replay advances, so the demo path must stay off.
  const demoFeedEnabled = !sandbox && isMockPlayByPlayEnabled(liveStatus);
  // The sandbox already knows its week, so Sleeper's state fetch cannot block
  // or fail the view.
  const nflStateBlocking = !sandbox && nflStateLoading;
  const nflStateFailed = !sandbox && Boolean(nflStateError);
  const liveAvailability = useMemo(() => resolveFantasyLiveAvailability({
    nflState: effectiveNflState,
    leagueSeason: league?.season ?? season,
  }), [effectiveNflState, league?.season, season]);
  // Sleeper's NFL state is the source of truth for the active fantasy week.
  // A league's last_scored_leg freezes after the season and must not be used
  // to make an offseason page look live.
  const week = liveAvailability.week;
  const [matchups, setMatchups] = useState([]);
  const [matchupsLoading, setMatchupsLoading] = useState(false);
  const [matchupIndex, setMatchupIndex] = useState(0);
  const [scoresProviderStatus, setScoresProviderStatus] = useState(null);
  const [scoresProviderStatusError, setScoresProviderStatusError] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [liveGames, setLiveGames] = useState([]);
  const [statsByGame, setStatsByGame] = useState({});
  const [sleeperStatsByPlayer, setSleeperStatsByPlayer] = useState({});
  const [cumulativeMatchupsByWeek, setCumulativeMatchupsByWeek] = useState({});
  const [localScheduleMap, setLocalScheduleMap] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [loadingLive, setLoadingLive] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [feedSide, setFeedSide] = useState('both');
  const [feedFilter, setFeedFilter] = useState(EMPTY_FEED_FILTER);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [cacheMeta, setCacheMeta] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  // Scrubbing the pace chart rewinds the hero (chartHover) and drops the feed
  // at the play that was on screen at that point of the games
  // (feedAnchorProgress — game progress, the chart's own axis).
  const [chartHover, setChartHover] = useState(null);
  const [selectedMoment, setSelectedMoment] = useState(null);
  const [feedAnchorProgress, setFeedAnchorProgress] = useState(null);
  const [feedSelection, setFeedSelection] = useState(null);
  const [focusPlayerId, setFocusPlayerId] = useState(null);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [matchupStickyHeight, setMatchupStickyHeight] = useState(78);
  const [feedEvents, setFeedEvents] = useState([]);
  const [weatherMap, setWeatherMap] = useState({});
  const [playsByGame, setPlaysByGame] = useState({});
  const [winProbHistory, setWinProbHistory] = useState([]);
  const [finalReconciliation, setFinalReconciliation] = useState({
    key: null,
    status: 'idle',
    requestedAt: null,
    completedAt: null,
    attempts: 0,
  });
  const snapshotRef = useRef(new Map());
  // When the replay was last rewound. Snapshots taken before this moment
  // describe a part of the week that is no longer reached, so they must not
  // seed the delta baseline or the feed.
  const rewindAtRef = useRef(0);
  // The live snapshot this effect last consumed. The replay clock ticks far
  // more often than data arrives, and a tick with no new stats must not move
  // the baseline — doing so shrinks the interval a later batch is spread
  // across, collapsing it into a vertical wall at the current moment.
  const processedUpdateRef = useRef(null);
  // Slate position when the stat baseline was captured, so a batch of deltas
  // can be laid out across the stretch of the week that just elapsed.
  const snapshotSlateProgressRef = useRef(0);
  // How far into each player's real plays the replay has read, so each play is
  // handed out once and in order.
  const playCursorRef = useRef(new Map());
  const playEventsByPlayerRef = useRef(new Map());
  const playsFetchedRef = useRef(new Map());
  const liveSnapshotInFlightContextsRef = useRef(new Set());
  const playFetchInFlightContextsRef = useRef(new Set());
  const playRequestContextRef = useRef(null);
  const weatherPendingRef = useRef(new Set());
  const liveSnapshotRequestRef = useRef(0);
  const liveSnapshotContextRef = useRef(null);
  const gridRef = useRef(null);
  const matchupRailRef = useRef(null);
  const heroStageRef = useRef(null);
  const feedViewportRef = useRef(null);
  const feedScrollRef = useRef(0);

  // Rewinding the replay invalidates everything gathered after the new
  // instant: accumulated stat deltas, fetched plays, and the win-probability
  // trail all belong to a part of the week that has not happened again yet.
  useEffect(() => {
    if (!LIVE_SANDBOX_ENABLED) return undefined;
    return subscribeToRewind(() => {
      rewindAtRef.current = Date.now();
      processedUpdateRef.current = null;
      playCursorRef.current = new Map();
      snapshotRef.current = new Map();
      snapshotSlateProgressRef.current = 0;
      playsFetchedRef.current = new Map();
      setFeedEvents([]);
      setPlaysByGame({});
      setWinProbHistory([]);
    });
  }, []);

  const resetMatchupSelections = useCallback(() => {
    // A matchup is its own navigation context. Clear every drill-in and feed
    // cursor before another matchup can render with stale selection state.
    feedScrollRef.current = 0;
    setFeedSide('both');
    setFeedFilter(EMPTY_FEED_FILTER);
    setSelectedPlayerId(null);
    setSelectedEventId(null);
    setChartHover(null);
    setSelectedMoment(null);
    setFeedAnchorProgress(null);
    setFeedSelection(null);
    setFocusPlayerId(null);
  }, []);

  const navigateToMatchup = useCallback((index) => {
    if (index === matchupIndex) return;
    resetMatchupSelections();
    setMatchupIndex(index);
  }, [matchupIndex, resetMatchupSelections]);

  // Hover is only a preview. A chosen chart moment remains selected until the
  // viewer makes another selection or explicitly returns to live.
  useEffect(() => {
    if (chartHover == null) return undefined;
    const onDocumentPointerDown = (event) => {
      if (!event.target.closest?.('.fl-chart')) setChartHover(null);
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [chartHover]);

  // On small screens the drill-in replaces the graph in the analysis slot.
  // Keep that slot in view when it opens and restore the prior position when
  // it closes.
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 1024) return;
    const scroller = gridRef.current?.closest('.content-area') ?? document.scrollingElement;
    if (!scroller) return;
    if (selectedPlayerId) {
      feedScrollRef.current = scroller.scrollTop;
      scroller.scrollTop = Math.max(0, (gridRef.current?.offsetTop ?? 0) - 8);
    } else {
      scroller.scrollTop = feedScrollRef.current;
    }
  }, [selectedPlayerId]);

  useEffect(() => {
    if (!isDesktop) {
      setMatchupStickyHeight(0);
      return undefined;
    }
    const node = matchupRailRef.current;
    if (!node) return undefined;
    const update = () => setMatchupStickyHeight(Math.ceil(node.getBoundingClientRect().height));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isDesktop, week]);

  useEffect(() => {
    if (!isDesktop) {
      setHeroCollapsed(false);
      return undefined;
    }
    const scroller = gridRef.current?.closest('.content-area');
    const update = () => {
      const hero = heroStageRef.current;
      const rail = matchupRailRef.current;
      if (!hero || !rail) return;
      setHeroCollapsed(hero.getBoundingClientRect().bottom <= rail.getBoundingClientRect().bottom + 1);
    };
    update();
    scroller?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isDesktop, week]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => { loadSeasonStats?.(); }, [loadSeasonStats]);

  useEffect(() => {
    let cancelled = false;
    setNflStateLoading(true);
    setNflStateError('');
    getNflState()
      .then((payload) => {
        if (!cancelled) setNflState(payload ?? null);
      })
      .catch((error) => {
        if (!cancelled) {
          setNflState(null);
          setNflStateError(error?.message ?? 'Could not confirm the current NFL week.');
        }
      })
      .finally(() => {
        if (!cancelled) setNflStateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScoresProviderStatusError('');
    getStatisticsScoresStatus()
      .then((payload) => {
        if (!cancelled) setScoresProviderStatus(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          setScoresProviderStatus(null);
          setScoresProviderStatusError(error?.message ?? 'Could not confirm the Statistics Scores provider.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatusError('');
    getLiveStatus()
      .then((payload) => {
        if (!cancelled) setLiveStatus(payload);
      })
      .catch((error) => {
        if (!cancelled) setStatusError(error?.message ?? 'Could not reach the live scoring server.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (platform !== 'sleeper' || !selectedLeagueId || !week) {
      setMatchups([]);
      setMatchupsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setMatchupsLoading(true);
    loadMatchups(selectedLeagueId, week)
      .then((rows) => {
        if (!cancelled) setMatchups(rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatchups([]);
      })
      .finally(() => {
        if (!cancelled) setMatchupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMatchups, platform, selectedLeagueId, week]);

  useEffect(() => {
    if (platform !== 'sleeper' || !selectedLeagueId || !week) {
      setCumulativeMatchupsByWeek({});
      return undefined;
    }
    let cancelled = false;
    const weeks = Array.from({ length: week }, (_, index) => index + 1);
    Promise.all(weeks.map(async (option) => {
      try {
        const rows = await loadMatchups(selectedLeagueId, option);
        return [option, rows ?? []];
      } catch {
        return [option, []];
      }
    })).then((entries) => {
      if (!cancelled) setCumulativeMatchupsByWeek(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [loadMatchups, platform, selectedLeagueId, week]);

  useEffect(() => {
    if (platform !== 'sleeper' || !selectedLeagueId || !season || !week) {
      setSleeperStatsByPlayer({});
      return undefined;
    }
    let cancelled = false;
    getWeeklyStats(season, week)
      .then((rows) => {
        if (!cancelled) setSleeperStatsByPlayer(rows ?? {});
      })
      .catch(() => {
        if (!cancelled) setSleeperStatsByPlayer({});
      });
    return () => {
      cancelled = true;
    };
  }, [platform, season, selectedLeagueId, week]);

  useEffect(() => {
    if (platform !== 'sleeper' || !season || scheduleMap || localScheduleMap) return undefined;
    let cancelled = false;
    fetchSeasonSchedule(season)
      .then((payload) => {
        if (!cancelled) setLocalScheduleMap(payload ?? null);
      })
      .catch(() => {
        if (!cancelled) setLocalScheduleMap(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localScheduleMap, platform, scheduleMap, season]);

  // Changing week or matchup starts a fresh play-tracking session.
  useEffect(() => {
    snapshotRef.current = new Map();
    playsFetchedRef.current = new Map();
    setFeedEvents([]);
    setPlaysByGame({});
    resetMatchupSelections();
  }, [week, matchupIndex, resetMatchupSelections]);

  const myRosterId = myRoster()?.roster_id ?? null;
  const matchupPairs = useMemo(
    () => getMatchupPairs(matchups, rosters, getUserDisplayName, myRosterId),
    [getUserDisplayName, matchups, myRosterId, rosters],
  );
  const currentMatchup = matchupPairs[Math.min(matchupIndex, Math.max(0, matchupPairs.length - 1))] ?? null;

  useEffect(() => {
    if (matchupIndex <= matchupPairs.length - 1) return;
    navigateToMatchup(0);
  }, [matchupIndex, matchupPairs.length, navigateToMatchup]);

  const matchupStarterIds = useMemo(() => (
    (currentMatchup?.sides ?? []).flatMap((side) => getStarterIds(side))
  ), [currentMatchup]);

  const currentStarterPointsById = useMemo(() => {
    const points = new Map();
    (currentMatchup?.sides ?? []).forEach((side) => {
      Object.entries(side?.row?.players_points ?? {}).forEach(([id, value]) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) points.set(String(id), numeric);
      });
    });
    return points;
  }, [currentMatchup]);

  const matchupTeams = useMemo(() => {
    const teams = new Set();
    matchupStarterIds.forEach((id) => {
      const team = getTeamAbbr(players?.[id]?.team);
      if (team) teams.add(team);
    });
    return teams;
  }, [matchupStarterIds, players]);

  // A replay tick should request a fresher slice without invalidating a slower
  // request that is already hydrating the same matchup. Context changes still
  // reject stale responses; the clock version is a refresh trigger only.
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
    if (!week || !liveStatus?.session?.enabled || platform !== 'sleeper') return;
    const requestContext = liveSnapshotContextKey;
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
      const gamesPayload = await getLiveGames({ season, week });
      if (!isCurrentRequest()) return;
      const games = Array.isArray(gamesPayload?.data) ? gamesPayload.data : [];
      setLiveGames(games);
      setCacheMeta(gamesPayload?.cache ?? null);

      const gameIds = sortRelevantGames(games, matchupTeams).map((game) => game.id).filter(Boolean);
      if (gameIds.length) {
        const statsPayload = await getLivePlayerStatsForGames(gameIds);
        if (!isCurrentRequest()) return;
        const groupedStats = statsPayload?.games && typeof statsPayload.games === 'object'
          ? statsPayload.games
          : {};
        setStatsByGame(Object.fromEntries(gameIds.map((gameId) => [String(gameId), groupedStats[String(gameId)] ?? []])));
      } else {
        setStatsByGame({});
      }
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (isCurrentRequest()) {
        setLiveError(error?.message ?? 'Could not load live scoring data.');
      }
    } finally {
      liveSnapshotInFlightContextsRef.current.delete(requestContext);
      if (!quiet && isCurrentRequest()) setLoadingLive(false);
    }
  }, [
    liveSnapshotContextKey,
    liveStatus?.session?.enabled,
    matchupTeams,
    platform,
    season,
    week,
  ]);

  useEffect(() => {
    void fetchLiveSnapshot();
  }, [fetchLiveSnapshot, liveSnapshotRefreshVersion]);

  useEffect(() => {
    if (!autoRefresh || !liveStatus?.session?.enabled) return undefined;
    const interval = window.setInterval(() => {
      void fetchLiveSnapshot({ quiet: true });
    }, getLiveRefreshMs(liveStatus));
    return () => window.clearInterval(interval);
  }, [autoRefresh, fetchLiveSnapshot, liveStatus]);

  const statIndex = useMemo(() => buildStatIndex(statsByGame), [statsByGame]);

  const rawSideSummaries = useMemo(() => (
    (currentMatchup?.sides ?? []).slice(0, 2).map((side, index) => {
      const sleeperPlayerPoints = side.row?.players_points ?? {};
      const rows = getStarterIds(side).map((id) => {
        const rawPlayer = players?.[id];
        const player = rawPlayer
          ? {
              ...rawPlayer,
              id: rawPlayer.id ?? id,
              player_id: rawPlayer.player_id ?? id,
              sleeperId: rawPlayer.sleeperId ?? id,
              // Sleeper leaves espn_id null for roughly three quarters of
              // startable skill players, so fold in the ids the context's
              // roster cross-reference resolved. Everything downstream that
              // resolves imagery reads espnId first.
              espnId: rawPlayer.espn_id ?? espnIdOverrides?.[id] ?? null,
            }
          : null;
        if (!player) return null;
        const bdlRow = statIndex.get(getStatKeyForSleeperPlayer(player)) ?? null;
        const mappedStats = bdlRow ? mapBdlStatsToGridShift(bdlRow) : null;
        const sleeperStats = sleeperStatsByPlayer?.[id] ? { week, ...sleeperStatsByPlayer[id] } : null;
        const detailStats = mappedStats ?? sleeperStats;
        const livePoints = mappedStats ? calcPoints(mappedStats, activeScoringSettings, player.position) : 0;
        const sleeperDerivedPoints = sleeperStats ? calcPoints(sleeperStats, activeScoringSettings, player.position) : null;
        const rawSleeperPoints = Number(sleeperPlayerPoints[id]);
        const sleeperPoints = Number.isFinite(rawSleeperPoints) ? rawSleeperPoints : null;
        return {
          id,
          player,
          bdlRow,
          mappedStats,
          sleeperStats,
          detailStats,
          detailSource: mappedStats ? 'live' : sleeperStats ? 'weekly' : null,
          livePoints,
          sleeperPoints,
          // Live-calculated points when stats are matched; Sleeper's official
          // number otherwise, so pre-kickoff and past weeks stay truthful.
          points: resolveCurrentPlayerPoints({
            hasMappedStats: Boolean(mappedStats),
            livePoints,
            sleeperPoints,
            sleeperDerivedPoints,
            // The replay fixture stores the completed week's official result.
            // Falling back to it here leaks the final score into the early
            // replay and draws a vertical jump at NOW.
            suppressFallback: Boolean(sandbox?.replay),
          }),
        };
      }).filter(Boolean);
      const matchedCount = rows.filter((row) => row.bdlRow).length;
      const total = rows.reduce((sum, row) => sum + row.points, 0);
      const sleeperTotal = Number(side.row?.points);
      const isMine = Number(side.roster?.roster_id) === Number(myRosterId);
      return {
        key: index === 0 ? 'a' : 'b',
        side,
        rows,
        total,
        matchedCount,
        sleeperTotal: Number.isFinite(sleeperTotal) ? sleeperTotal : null,
        record: null,
        name: side.name,
        initials: getCompanionInitials(String(side.name ?? '').replace(/[^a-zA-Z0-9 ]+/g, ' ').trim() || side.name, 'TM'),
        isMine,
      };
    })
  ), [activeScoringSettings, currentMatchup, espnIdOverrides, myRosterId, players, sandbox?.replay, sleeperStatsByPlayer, statIndex, week]);

  const cumulativeResultsByRoster = useMemo(
    () => buildCumulativeRosterResults(cumulativeMatchupsByWeek, week, rawSideSummaries),
    [cumulativeMatchupsByWeek, rawSideSummaries, week],
  );

  const sideSummaries = useMemo(() => (
    rawSideSummaries.map((summary) => {
      const rosterId = getRosterIdFromMatchupRow(summary?.side?.row);
      const cumulativeResult = rosterId == null ? null : cumulativeResultsByRoster.get(rosterId) ?? null;
      return {
        ...summary,
        record: formatRosterRecord(cumulativeResult),
      };
    })
  ), [cumulativeResultsByRoster, rawSideSummaries]);

  const leftSummary = sideSummaries[0] ?? null;
  const rightSummary = sideSummaries[1] ?? null;

  const playerSideKey = useMemo(() => {
    const map = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => map.set(row.id, summary.key)));
    return map;
  }, [sideSummaries]);

  // Track stat deltas between refreshes as scoring-play feed events.
  useEffect(() => {
    if (!currentMatchup) return;
    // Rewinding leaves the last fetch's (higher) totals on screen until fresh
    // data lands. Diffing against those would emit large negative "scoring"
    // events, so drop the baseline and wait for a post-rewind snapshot.
    if (rewindAtRef.current && (lastUpdatedAt?.getTime() ?? 0) <= rewindAtRef.current) {
      snapshotRef.current = new Map();
      return;
    }
    // Nothing new has landed since the last pass; the stats on screen are the
    // ones already accounted for.
    const updatedAt = lastUpdatedAt?.getTime() ?? null;
    if (updatedAt != null && processedUpdateRef.current === updatedAt) return;
    processedUpdateRef.current = updatedAt;
    const next = new Map();
    const meta = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => {
      meta.set(row.id, { position: row.player?.position });
      if (row.mappedStats) next.set(row.id, { stats: row.mappedStats, points: row.livePoints });
    }));
    // A live session joins a week already in progress, so its first snapshot is
    // a starting point rather than scoring to report. A replay always begins at
    // zero, so whatever the first snapshot holds genuinely happened and must be
    // emitted — otherwise the opening stretch of the week vanishes into the
    // baseline and the chart starts flat.
    //
    // buildDeltaEvents skips any player it has no previous entry for, so an
    // empty baseline reports nothing at all. Seeding zeros gives it something
    // to diff against, which also covers scrubbing straight into the middle of
    // a week: everything scored up to that point arrives as one batch.
    let emitted = false;
    const prev = snapshotRef.current.size || !sandbox?.replay
      ? snapshotRef.current
      : new Map([...next.keys()].map((id) => [id, { stats: {}, points: 0 }]));
    if (prev.size) {
      // A replay step spans many plays, so it emits one event per play rather
      // than one aggregate per player — otherwise a single row claims two
      // touchdowns, which cannot happen on one snap.
      const deltaEvents = sandbox?.replay
        ? buildReplayDeltaEvents(prev, next, meta, {
          scoringSettings: activeScoringSettings,
          playsByPlayer: playEventsByPlayerRef.current,
          playCursor: playCursorRef.current,
          throughProgress: sandbox.progress,
        })
        : buildDeltaEvents(prev, next, meta);
      const rawEvents = deltaEvents.map((event) => {
        const row = sideSummaries
          .flatMap((summary) => summary.rows)
          .find((candidate) => candidate.id === event.playerId);
        const game = row?.bdlRow?.gameId
          ? liveGames.find((candidate) => String(candidate.id) === String(row.bdlRow.gameId))
          : findGameForTeam(liveGames, row?.player?.team);
        const gameId = row?.bdlRow?.gameId ?? game?.id ?? null;
        const remaining = game ? getRemainingGameFraction(game) : null;
        return {
          ...event,
          gameId,
          gameProgress: Number.isFinite(remaining) ? 1 - remaining : null,
          timelineAt: event.at,
        };
      });

      // A replay step covers far more game time than a live poll does, so a
      // whole batch would otherwise land on one position and stack vertically
      // at the current moment. Lay the batch out across the slate time that
      // just elapsed, and stamp each event with the instant it now sits at, so
      // ordering by time and ordering along the chart agree.
      const events = sandbox?.replay
        ? spreadEventsAcrossInterval(
          rawEvents,
          snapshotSlateProgressRef.current,
          sandbox.progress,
        ).map((event) => {
          const at = sandbox.instantAt(event.slateProgress);
          return Number.isFinite(at) ? { ...event, at, timelineAt: at } : event;
        })
        : rawEvents;
      emitted = events.length > 0;
      if (events.length) {
        // The live feed keeps a bounded window because the chart derives its
        // values from win-probability snapshots, so dropping old rows costs
        // nothing. A replay plots the running total of the events themselves —
        // trimming them makes the curve under-count, and the closing point at
        // the authoritative total then jumps straight up at NOW. A full week
        // is a few hundred events, so keep them all.
        setFeedEvents((current) => {
          const next = [...events, ...current];
          return sandbox?.replay ? next : next.slice(0, MAX_FEED_EVENTS);
        });
      }
    }
    snapshotRef.current = next;
    // Only move the baseline when something was actually recorded. A snapshot
    // producing no deltas has not advanced the story, and moving it anyway
    // leaves the next real batch a zero-width interval to spread across — every
    // event then lands on the same position, which is the wall at NOW.
    if (sandbox?.replay && emitted) snapshotSlateProgressRef.current = sandbox.progress;
  }, [activeScoringSettings, currentMatchup, lastUpdatedAt, liveGames, sandbox, sideSummaries]);

  const activeScheduleMapForContext = scheduleMap ?? localScheduleMap;

  // Shared projection context — the same assembly Companion Matchup uses, so
  // both tabs always show identical pre-kickoff projections.
  const projectionContext = useMemo(() => {
    if (!weeklyStats || !players) return null;
    return buildProjectionContext({
      weeklyStats,
      players,
      scheduleMap: activeScheduleMapForContext,
      scoringSettings: activeScoringSettings,
      week,
    });
  }, [activeScheduleMapForContext, activeScoringSettings, players, week, weeklyStats]);

  const starterInfoById = useMemo(() => {
    const map = new Map();
    if (!projectionContext) return map;
    matchupStarterIds.forEach((id) => {
      const info = resolveStarterGameInfo(id, projectionContext);
      if (info) map.set(id, info);
    });
    return map;
  }, [matchupStarterIds, projectionContext]);

  // Weather for the matchup's outdoor games — same fetch/cache as Matchup, so
  // weather-adjusted projections stay identical across tabs.
  useEffect(() => {
    if (!starterInfoById.size) return undefined;
    // The sandbox replays a completed week, and the weather archive rejects
    // those dates. Skip the lookup rather than fire failing requests.
    // Weather comes from Open-Meteo's archive, which serves past dates only.
    // Neither sandbox mode can use it: replay sits on a week older than the
    // archive window, and preseason games have not been played yet. Skip the
    // lookup rather than fire requests that are guaranteed to fail.
    if (sandboxActive) return undefined;
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
    return () => {
      cancelled = true;
    };
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

  // Game progress and official settlement are separate facts. A missing live
  // row can mean scheduled, unavailable, or unresolved; it must never silently
  // turn into "final" and unlock an exact 0%/100%.
  const starterGameStateById = useMemo(() => {
    const map = new Map();
    const weekSchedule = activeScheduleMapForContext?.[week]
      ?? activeScheduleMapForContext?.[String(week)]
      ?? null;
    const hasScheduleForWeek = isCompleteScheduleWeek(weekSchedule);
    const weekOfficiallyComplete = hasScheduleForWeek
      && Object.values(weekSchedule).every((entry) => entry?.completed === true);
    matchupStarterIds.forEach((id) => {
      const team = getTeamAbbr(starterInfoById.get(id)?.team ?? players?.[id]?.team);
      const hasCurrentTeam = Boolean(team && team !== 'FA');
      const scheduleEntry = hasCurrentTeam ? weekSchedule?.[team] ?? null : null;
      const game = hasCurrentTeam ? findGameForTeam(liveGames, team) : null;
      const resolution = resolveStarterGameState({
        game,
        scheduleEntry,
        hasScheduleForWeek,
        hasGameThisWeek: hasCurrentTeam && hasScheduleForWeek
          ? Boolean(scheduleEntry)
          : !hasCurrentTeam && weekOfficiallyComplete
            ? false
            : null,
      });
      const fallbackRemainingFraction = getFallbackRemainingGameFraction({
        scheduleEntry,
        currentPoints: currentStarterPointsById.get(id) ?? null,
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
  }, [
    activeScheduleMapForContext,
    currentStarterPointsById,
    liveGames,
    matchupStarterIds,
    players,
    starterInfoById,
    week,
  ]);

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
    setFinalReconciliation({
      key: finalReconciliationKey,
      status: 'idle',
      requestedAt: null,
      completedAt: null,
      attempts: 0,
    });
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
    setFinalReconciliation({
      key: finalReconciliationKey,
      status: 'pending',
      requestedAt,
      completedAt: null,
      attempts,
    });
    (sandbox ? sandbox.base.loadMatchups(selectedLeagueId, week) : getLiveMatchups(selectedLeagueId, week))
      .then((rows) => {
        if (cancelled) return;
        const reconciled = hasReconciledMatchup(rows, currentMatchup.matchupId);
        if (reconciled) setMatchups(rows ?? []);
        setFinalReconciliation({
          key: finalReconciliationKey,
          status: reconciled ? 'success' : 'incomplete',
          requestedAt,
          completedAt: Date.now(),
          attempts,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFinalReconciliation({
          key: finalReconciliationKey,
          status: 'error',
          requestedAt,
          completedAt: Date.now(),
          attempts,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    allStartersOfficiallySettled,
    sandbox,
    currentMatchup,
    finalReconciliation.attempts,
    finalReconciliation.key,
    finalReconciliation.status,
    finalReconciliationKey,
    selectedLeagueId,
    week,
  ]);

  // Sleeper can publish its authoritative matchup payload shortly after the
  // NFL game feed marks the last game final. Retry quietly until one fresh
  // response contains both team totals and every starter's official points.
  useEffect(() => {
    if (
      !allStartersOfficiallySettled
      || finalReconciliation.key !== finalReconciliationKey
      || !['error', 'incomplete'].includes(finalReconciliation.status)
    ) return undefined;
    const retryDelay = Math.min(
      FINAL_RECONCILIATION_RETRY_MS * Math.max(1, finalReconciliation.attempts),
      120000,
    );
    const timer = window.setTimeout(() => {
      setFinalReconciliation((current) => (
        current.key === finalReconciliationKey
        && ['error', 'incomplete'].includes(current.status)
          ? { ...current, status: 'idle' }
          : current
      ));
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [
    allStartersOfficiallySettled,
    finalReconciliation.attempts,
    finalReconciliation.key,
    finalReconciliation.status,
    finalReconciliationKey,
  ]);

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
    // The side outlooks ride along so the hero can explain the number rather
    // than just assert it.
    const withScoreAdjustment = (outlook, summary) => {
      const adjustment = getMatchupCustomPoints(summary.side?.row);
      return adjustment ? { ...outlook, current: outlook.current + adjustment } : outlook;
    };
    let outlookA = withScoreAdjustment(
      computeSideOutlook(buildOutlooks(leftSummary)),
      leftSummary,
    );
    let outlookB = withScoreAdjustment(
      computeSideOutlook(buildOutlooks(rightSummary)),
      rightSummary,
    );
    if (settledConfirmed) {
      const officialA = getOfficialMatchupRowPoints(leftSummary.side?.row);
      const officialB = getOfficialMatchupRowPoints(rightSummary.side?.row);
      if (officialA != null) outlookA = { ...outlookA, current: officialA, remainingProj: 0, remainingVar: 0, playersRemaining: 0 };
      if (officialB != null) outlookB = { ...outlookB, current: officialB, remainingProj: 0, remainingVar: 0, playersRemaining: 0 };
    }
    const result = computeWinProbability(outlookA, outlookB, { settledConfirmed });
    return {
      ...result,
      outlookA,
      outlookB,
      explain: explainWinProbability(result, outlookA, outlookB),
    };
  }, [
    fallbackAvgById,
    leftSummary,
    projectionsById,
    rightSummary,
    settledConfirmed,
    starterGameStateById,
  ]);

  // Win-probability history: load per matchup key, append on refresh ticks.
  const historyKey = currentMatchup && selectedLeagueId
    ? buildWinProbHistoryKey({ leagueId: selectedLeagueId, season, week, matchupId: currentMatchup.matchupId })
    : null;

  useEffect(() => {
    if (!historyKey) {
      setWinProbHistory([]);
      return;
    }
    // A replay run builds its own trail from scratch. Restoring a persisted
    // one would pre-fill the chart with a previous run recorded against wall
    // time rather than replay progress.
    setWinProbHistory(LIVE_SANDBOX_ENABLED ? [] : loadWinProbHistory(historyKey));
  }, [historyKey]);

  useEffect(() => {
    if (!historyKey || !winProb || !leftSummary || !rightSummary) return;
    // Don't record transient loading states: wait until the schedule map and
    // starter rows exist so remaining-game fractions are trustworthy.
    if (matchupsLoading || !activeScheduleMapForContext || !leftSummary.rows.length) return;
    setWinProbHistory((current) => {
      const next = appendWinProbPoint(current, {
        t: Date.now(),
        p: winProb.probA,
        a: winProb.explain?.a?.current ?? Math.round((leftSummary.total ?? 0) * 10) / 10,
        b: winProb.explain?.b?.current ?? Math.round((rightSummary.total ?? 0) * 10) / 10,
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

  // ── Pace model ───────────────────────────────────────────────────────────
  // Every starter's live points measured against where their projection says
  // they should be right now. This drives the hero, the verdict line, the
  // chart's ghost pace rays and the performer ordering.
  const paletteSlots = useMemo(() => buildFantasyPaletteSlots(rosters), [rosters]);

  const sides = useMemo(() => sideSummaries.map((summary) => {
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
    const rosterId = getRosterIdFromMatchupRow(summary.side?.row);
    const basePace = buildSidePace(entries.map((entry) => entry.pace));
    const adjustment = getMatchupCustomPoints(summary.side?.row);
    const pace = adjustment
      ? {
          ...basePace,
          total: basePace.total + adjustment,
          liveProjected: basePace.liveProjected + adjustment,
          vsPace: basePace.vsPace + adjustment,
        }
      : basePace;
    const officialTotal = settledConfirmed ? getOfficialMatchupRowPoints(summary.side?.row) : null;
    return {
      key: summary.key,
      name: summary.name,
      initials: summary.initials,
      isMine: summary.isMine,
      record: summary.record,
      manager: null,
      palette: getFantasyTeamPalette(rosterId, paletteSlots),
      entries,
      pace: officialTotal == null
        ? pace
        : {
            ...pace,
            total: officialTotal,
            liveProjected: officialTotal,
            projected: officialTotal,
            vsPace: officialTotal - pace.pace,
          },
      featured: pickFeaturedStarter(entries, 'top'),
    };
  }), [
    fallbackAvgById,
    paletteSlots,
    projectionsById,
    settledConfirmed,
    sideSummaries,
    starterGameStateById,
  ]);

  const leftSide = sides[0] ?? null;
  const rightSide = sides[1] ?? null;
  const sidesByKey = useMemo(
    () => Object.fromEntries(sides.map((side) => [side.key, side])),
    [sides],
  );
  const verdict = useMemo(
    () => buildVerdict(leftSide?.pace, rightSide?.pace),
    [leftSide, rightSide],
  );
  const performers = useMemo(() => buildTopPerformers(sides, RAIL_PERFORMER_LIMIT), [sides]);
  const entriesById = useMemo(() => {
    const map = new Map();
    sides.forEach((side) => side.entries.forEach((entry) => map.set(entry.id, entry)));
    return map;
  }, [sides]);

  // Every matchup in the league as a scoreboard chip. Points come from the
  // league's official numbers, except the selected matchup, which uses the
  // live total so the chip and the hero never disagree.
  const matchupChips = useMemo(() => matchupPairs.map((pair, index) => ({
    key: pair.matchupId,
    index,
    mine: pair.mine,
    sides: pair.sides.slice(0, 2).map((side, sideIndex) => {
      const rosterId = getRosterIdFromMatchupRow(side.row);
      const isMine = Number(rosterId) === Number(myRosterId);
      const liveSide = index === matchupIndex ? sides[sideIndex] : null;
      return {
        key: `${pair.matchupId}-${rosterId ?? sideIndex}`,
        label: isMine ? 'You' : (firstWordOf(side.name) || side.name),
        fullName: side.name,
        points: liveSide ? liveSide.pace.total : getMatchupRowPoints(side.row),
        color: getFantasyTeamPalette(rosterId, paletteSlots)[0],
      };
    }),
  })), [matchupIndex, matchupPairs, myRosterId, paletteSlots, sides]);
  const matchupChipNameWidth = useMemo(
    () => `${Math.min(14, Math.max(
      7,
      ...matchupChips.flatMap((chip) => chip.sides.map((side) => side.label.length)),
    )) * 0.46}em`,
    [matchupChips],
  );

  // Focusing a starter must always land on their plays, so a focus on the side
  // the feed is currently hiding widens the filter back to both.
  const focusStarter = useCallback((playerId) => {
    setFocusPlayerId(playerId);
    if (!playerId) return;
    const entry = entriesById.get(playerId);
    if (entry) setFeedSide((current) => (current === entry.sideKey || current === 'both' ? current : 'both'));
  }, [entriesById]);

  // ── Play-by-play backfill + throttled live refresh ───────────────────────
  // Backfill each relevant game once (live games first), never refetch finals,
  // and read the canonical server snapshot at its eight-second play cadence.
  // The shared sidecar store coalesces this with Statistics scorecards and
  // drilldowns, so each UI can update without creating its own provider truth.
  const playRequestContextKey = [
    selectedLeagueId,
    season,
    week,
    currentMatchup?.matchupId ?? '',
    sandbox?.mode ?? 'live',
    liveStatus?.session?.enabled ? 'enabled' : 'disabled',
  ].join(':');
  playRequestContextRef.current = playRequestContextKey;

  useEffect(() => () => {
    playRequestContextRef.current = null;
  }, []);

  useEffect(() => {
    if (!liveStatus?.session?.enabled || !currentMatchup || !liveGames.length) return undefined;
    const mockPlays = demoFeedEnabled;
    if (isFreeLiveTier(liveStatus) && !mockPlays) return undefined;
    const requestContext = playRequestContextKey;
    if (playFetchInFlightContextsRef.current.has(requestContext)) return undefined;
    playFetchInFlightContextsRef.current.add(requestContext);
    const starterRows = sideSummaries.flatMap((summary) => summary.rows);
    const relevant = limitPlayByPlayGames(
      sortRelevantGames(liveGames, matchupTeams)
        .filter((game) => mockPlays || isLiveGame(game) || isFinalGame(game)),
      { mock: mockPlays, maxGames: MAX_PLAYS_GAMES },
    );

    (async () => {
      try {
        for (const game of relevant) {
          if (playRequestContextRef.current !== requestContext) return;
          const gameId = String(game.id);
          const marker = playsFetchedRef.current.get(gameId);
          const final = isFinalGame(game);
          const now = Date.now();
          // The replay clock advances far faster than wall time, so the live
          // throttle would freeze plays at whatever slice was fetched first.
          // Re-slicing is local to the sandbox cache, so refetching is cheap.
          const shouldFetch = sandbox?.replay
            ? marker?.progress !== sandbox.progress
            : !marker
              || (final && !marker.final)
              || (!final && now - marker.at >= PLAYS_REFRESH_MIN_MS);
          if (!shouldFetch) continue;
          try {
            const payload = mockPlays
              ? {
                  data: buildMockLivePlays(game, starterRows.filter((row) => getTeamAbbr(row.player?.team)
                    && [getTeamAbbr(game?.visitor_team), getTeamAbbr(game?.home_team)].includes(getTeamAbbr(row.player.team)))),
                }
              : await getLiveGamePlays(gameId);
            if (playRequestContextRef.current !== requestContext) return;
            const data = payload?.data;
            // A transport failure is not a valid empty play slice. Keep the game
            // unmarked so the next snapshot refresh retries even while paused.
            if (payload?.retryable) continue;
            playsFetchedRef.current.set(gameId, { at: Date.now(), final, progress: sandbox?.progress });
            setPlaysByGame((prev) => ({
              ...prev,
              [gameId]: Array.isArray(data) ? data : [],
            }));
          } catch {
            // Leave the marker unset so a later tick can retry.
          }
        }
      } finally {
        playFetchInFlightContextsRef.current.delete(requestContext);
      }
    })();

    return undefined;
  }, [currentMatchup, demoFeedEnabled, lastUpdatedAt, liveGames, liveStatus, matchupTeams, playRequestContextKey, sandbox, sideSummaries]);

  const gamesById = useMemo(() => {
    const map = new Map();
    liveGames.forEach((game) => map.set(String(game.id), game));
    return map;
  }, [liveGames]);

  const demoTimeline = useMemo(() => (
    demoFeedEnabled
      ? buildDemoTimeline(sortRelevantGames(liveGames, matchupTeams))
      : null
  ), [demoFeedEnabled, liveGames, matchupTeams]);

  const positionsById = useMemo(() => {
    const map = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => {
      map.set(row.id, String(row.player?.position ?? 'FLEX').toUpperCase());
    }));
    return map;
  }, [sideSummaries]);

  const starterNameIndex = useMemo(() => (
    buildStarterNameIndex(sideSummaries.flatMap((summary) => summary.rows))
  ), [sideSummaries]);

  const playEvents = useMemo(() => {
    const built = buildPlayEvents(playsByGame, starterNameIndex, activeScoringSettings, positionsById, gamesById);
    if (!sandbox?.replay) return built;
    // A play and the stat delta it produced are the same scoring event, and
    // mergePlayEvents() collapses them only when their timestamps fall within
    // two minutes of each other. Delta events run on the replay clock, so
    // plays must too — otherwise nothing dedupes and every score is counted
    // twice, pushing the pace curve above the real total.
    return built.map((event) => {
      const slate = sandbox.toSlateProgress(event.gameId, event.progress);
      const at = Number.isFinite(slate) ? sandbox.instantAt(slate) : null;
      return Number.isFinite(at) ? { ...event, at, timelineAt: at, slateProgress: slate } : event;
    });
  }, [activeScoringSettings, gamesById, playsByGame, positionsById, sandbox, starterNameIndex]);

  // The delta effect runs above this in the file but after render, so it reads
  // the plays through a ref rather than forcing a reorder.
  const playEventsByPlayer = useMemo(() => {
    const byPlayer = new Map();
    [...playEvents]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .forEach((event) => {
        if (!byPlayer.has(event.playerId)) byPlayer.set(event.playerId, []);
        byPlayer.get(event.playerId).push(event);
      });
    return byPlayer;
  }, [playEvents]);
  playEventsByPlayerRef.current = playEventsByPlayer;

  // Stat-delta events only know "just now"; give them the game progress of the
  // starter they belong to so every feed row can sit on the chart's axis.
  const mergedFeed = useMemo(() => {
    const merged = mergePlayEvents(playEvents, feedEvents);
    // A play and the stat delta it produced describe the same scoring, and
    // mergePlayEvents() collapses the pair only when it can match them one to
    // one. A replay step covers many plays at once, so a batched delta never
    // matches a single play and both survive — double-counting every score.
    //
    // Deltas are the source to keep: they are derived from the box scores, so
    // they cover every game and sum to the exact side totals. Play-by-play is
    // fetched for a limited number of games, so standalone play rows are both
    // duplicates and incomplete. They stay only where they enriched a delta.
    const scoped = sandbox?.replay
      ? merged.filter((event) => event.source !== 'play')
      : merged;
    const events = scoped.map((event) => {
      const starterTeam = getTeamAbbr(entriesById.get(event.playerId)?.row?.player?.team);
      const fallbackGameId = findGameForTeam(liveGames, starterTeam)?.id;
      const gameId = event.gameId ?? fallbackGameId ?? null;
      const gameProgress = Number.isFinite(Number(event.progress))
        ? Number(event.progress)
        : parseGlanceProgress(event.glance?.clock)
          ?? entriesById.get(event.playerId)?.pace?.progress
          ?? null;
      const timelineAt = event.timelineAt
        ?? (event.source === 'play' ? null : event.at)
        ?? null;
      // Play events carry a position inside their own game. During a replay
      // the games are staggered across a compressed week, so that has to be
      // restated on the slate axis the delta events already use — otherwise
      // the chart mixes two different clocks and the curve doubles back.
      if (sandbox?.replay) {
        // Delta events carry the slate position assigned when they were
        // spread; play events are restated from their own game's clock.
        const slate = Number.isFinite(Number(event.slateProgress))
          ? Number(event.slateProgress)
          : sandbox.toSlateProgress(gameId, gameProgress);
        const at = Number.isFinite(slate) ? sandbox.instantAt(slate) : null;
        return {
          ...event,
          gameId,
          // Per-game, and left intact: the win-probability replay derives each
          // starter's remaining-game fraction from it.
          gameProgress,
          // Slate position — the axis the chart plots and orders events along.
          progress: Number.isFinite(slate) ? slate : gameProgress,
          timelineAt: Number.isFinite(at) ? at : timelineAt,
          at: Number.isFinite(at) ? at : event.at,
        };
      }
      const normalized = {
        ...event,
        gameId,
        gameProgress,
        timelineAt,
        progress: gameProgress,
      };
      if (!demoTimeline) return normalized;

      const window = demoTimeline.gameWindows.get(String(gameId ?? ''));
      return {
        ...normalized,
        progress: mapGameProgressToDemoTimeline(gameProgress, window) ?? gameProgress,
      };
    });
    const withDemoEvents = !demoTimeline
      ? events
      : events
      .concat(buildSharedDemoScoringEvents({
        sides: sideSummaries,
        scoringSettings: activeScoringSettings,
      }))
      .sort((left, right) => (Number(right.progress) || 0) - (Number(left.progress) || 0));

    return groupSharedPlayEvents(
      withDemoEvents,
      (event) => playerSideKey.get(event.playerId) ?? null,
    );
  }, [activeScoringSettings, demoTimeline, entriesById, feedEvents, liveGames, playEvents, playerSideKey, sandbox, sideSummaries]);

  // Real scoring measures shared game progress. The mock feed instead closes
  // at its latest active-game event on the compressed schedule.
  const slateProgress = useMemo(() => {
    // The replay's own position is the axis every event was placed on.
    if (sandbox?.replay) return sandbox.progress;
    if (demoTimeline) {
      return mergedFeed.reduce((latest, event) => (
        Number.isFinite(Number(event.progress)) ? Math.max(latest, Number(event.progress)) : latest
      ), 0);
    }
    const all = sides.flatMap((side) => side.entries);
    if (!all.length) return 0;
    return all.reduce((sum, entry) => sum + entry.pace.progress, 0) / all.length;
  }, [demoTimeline, mergedFeed, sandbox, sides]);

  // Only the groups and types this league can actually score. Derived from the
  // scoring settings rather than hardcoded, so a kickerless or IDP league gets
  // a filter set that matches it.
  const playFilterModel = useMemo(() => buildFeedFilterModel({
    scoringSettings: activeScoringSettings,
    rosterPositions: league?.roster_positions ?? [],
  }), [activeScoringSettings, league?.roster_positions]);

  const bigPlayThreshold = useMemo(
    () => getBigPlayThreshold(activeScoringSettings),
    [activeScoringSettings],
  );

  // Positions actually started in this matchup, so the chips reflect the teams
  // on screen rather than every position the sport has.
  const playFilterPositions = useMemo(() => {
    const seen = new Set();
    positionsById.forEach((position) => {
      if (position) seen.add(String(position).toUpperCase());
    });
    return [...seen].sort();
  }, [positionsById]);

  const matchesPlayFilter = useCallback((event) => matchesFeedFilter(event, feedFilter, {
    position: event.contributors?.length
      ? event.contributors.map((contributor) => contributor.position ?? positionsById.get(contributor.playerId))
      : positionsById.get(event.playerId) ?? null,
    threshold: bigPlayThreshold,
  }), [bigPlayThreshold, feedFilter, positionsById]);

  const visibleFeed = useMemo(() => (
    mergedFeed.filter((event) => {
      if (event.hiddenFromFeed) return false;
      const sideKey = playerSideKey.get(event.playerId);
      if (!sideKey || (feedSide !== 'both' && sideKey !== feedSide)) return false;
      if (focusPlayerId && ![event.playerId, ...(event.contributorIds ?? [])].includes(focusPlayerId)) return false;
      return matchesPlayFilter(event);
    })
  ), [feedSide, focusPlayerId, matchesPlayFilter, mergedFeed, playerSideKey]);

  // How many events each group would leave, so the chips can carry counts.
  const playFilterCounts = useMemo(() => {
    const counts = {};
    playFilterModel.forEach((group) => {
      counts[group.id] = mergedFeed.reduce((total, event) => {
        if (event.hiddenFromFeed) return total;
        const sideKey = playerSideKey.get(event.playerId);
        if (!sideKey || (feedSide !== 'both' && sideKey !== feedSide)) return total;
        const matched = matchesFeedFilter(event, { group: group.id, types: [], positions: [] }, {
          position: event.contributors?.length
            ? event.contributors.map((contributor) => contributor.position ?? positionsById.get(contributor.playerId))
            : positionsById.get(event.playerId) ?? null,
          threshold: bigPlayThreshold,
        });
        return matched ? total + 1 : total;
      }, 0);
    });
    return counts;
  }, [bigPlayThreshold, feedSide, mergedFeed, playFilterModel, playerSideKey, positionsById]);

  const feedCounts = useMemo(() => {
    const counts = { a: 0, b: 0 };
    mergedFeed.forEach((event) => {
      if (event.hiddenFromFeed) return;
      const sideKey = playerSideKey.get(event.playerId);
      if (sideKey) counts[sideKey] += 1;
    });
    return counts;
  }, [mergedFeed, playerSideKey]);

  // ── Pace-chart series ────────────────────────────────────────────────────
  // Built from the matchup's own scoring plays, so the line steps with the
  // afternoon and the big plays become selectable milestones on it.
  const replayGameTimelines = useMemo(
    () => buildGameProgressTimelines(mergedFeed),
    [mergedFeed],
  );
  const replayStarterTimelineById = useMemo(() => {
    const map = new Map();
    starterGameStateById.forEach((resolution, playerId) => {
      const kickoffValue = resolution?.game?.date ?? resolution?.scheduleEntry?.kickoff;
      const kickoffAt = Date.parse(kickoffValue ?? '');
      map.set(playerId, {
        state: resolution?.state ?? 'unresolved',
        gameId: resolution?.game?.id ?? null,
        kickoffAt: Number.isFinite(kickoffAt) ? kickoffAt : null,
      });
    });
    return map;
  }, [starterGameStateById]);


  const paceModel = useMemo(() => {
    const snapshotAt = winProb?.outlookA && winProb?.outlookB
      ? (point, context) => {
          const moment = {
            at: point.at,
            gameId: context?.event?.gameId ?? null,
            gameProgress: context?.event?.gameProgress ?? context?.event?.progress ?? null,
          };
          const fractionByPlayer = new Map();
          [...(winProb.outlookA.outlooks ?? []), ...(winProb.outlookB.outlooks ?? [])]
            .forEach((outlook) => {
              fractionByPlayer.set(
                outlook.playerId,
                getStarterReplayRemainingFraction(
                  replayStarterTimelineById.get(outlook.playerId),
                  moment,
                  replayGameTimelines,
                ),
              );
            });
          const replayA = projectSideOutlookAtMoment(winProb.outlookA, {
            currentByPlayer: context?.currentByPlayer,
            fractionByPlayer,
          });
          const replayB = projectSideOutlookAtMoment(winProb.outlookB, {
            currentByPlayer: context?.currentByPlayer,
            fractionByPlayer,
          });
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
    // `snapshotAt` reconstructs each side's score at a past moment, because a
    // live session only keeps sparse snapshots of a chart it has to redraw. A
    // replay has every event, so the running totals buildPaceSeries already
    // computes are exact — and monotonic. Letting the reconstruction overwrite
    // them is what made the curve overshoot the real total and then slide back
    // down to it. Keep its probability output, drop its scores.
    const replaySnapshotAt = sandbox?.replay && snapshotAt
      ? (point, context) => {
        const resolved = snapshotAt(point, context);
        if (!resolved) return resolved;
        const { a: _a, b: _b, ...withoutScores } = resolved;
        return withoutScores;
      }
      : snapshotAt;

    return buildPaceSeries({
      events: mergedFeed,
      sideKeyOf: (event) => playerSideKey.get(event.playerId) ?? null,
      totals: { a: leftSide?.pace.total ?? 0, b: rightSide?.pace.total ?? 0 },
      slateProgress,
      snapshotAt: replaySnapshotAt,
      // Same reason: sparse persisted history cannot improve on a complete
      // event log, and its wall-clock stamps do not line up with replay time.
      historicalSnapshots: (demoTimeline || sandbox?.replay) ? [] : winProbHistory,
      // The replay's positions are authoritative; its timestamps are
      // reconstructed. Accumulate along the axis rather than the clock.
      accumulateInOrder: Boolean(sandbox?.replay),
      liveSnapshot,
      reconcileToTotals: Boolean(demoTimeline),
    });
  }, [
    demoTimeline,
    leftSide,
    mergedFeed,
    playerSideKey,
    replayGameTimelines,
    replayStarterTimelineById,
    rightSide,
    sandbox,
    slateProgress,
    winProb,
    winProbHistory,
  ]);

  const selectedEntry = selectedPlayerId ? entriesById.get(selectedPlayerId) ?? null : null;
  const activeScheduleMap = scheduleMap ?? localScheduleMap;
  const getPlayerGameGlance = useCallback((teamAbbr, row = null) => (
    getGameGlance(findGameForTeam(liveGames, teamAbbr))
      ?? getScheduleGlance(activeScheduleMap, week, teamAbbr, { hasGameEvidence: hasPlayerGameEvidence(row) })
  ), [activeScheduleMap, liveGames, week]);

  const enableLive = async () => {
    setSessionLoading(true);
    setLiveError('');
    try {
      const payload = await startLiveSession({ leagueId: selectedLeagueId, provider: 'sleeper', accessCode });
      const statusPayload = await getLiveStatus();
      setLiveStatus({ ...statusPayload, session: payload.session ?? statusPayload.session });
    } catch (error) {
      setLiveError(error?.message ?? 'Could not turn on live scoring.');
    } finally {
      setSessionLoading(false);
    }
  };

  const disableLive = async () => {
    setSessionLoading(true);
    setLiveError('');
    try {
      const payload = await clearLiveSession();
      // Clearing a browser session does not change server configuration. Keep
      // the current live config and use the delete response to reopen the
      // enable gate immediately, without depending on a second status fetch.
      setLiveStatus((current) => ({
        ...(current ?? {}),
        session: payload?.session ?? { enabled: false },
      }));
    } catch (error) {
      setLiveError(error?.message ?? 'Could not turn off live scoring.');
    } finally {
      setSessionLoading(false);
    }
  };

  if (platform !== 'sleeper') {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
          Live is available for Sleeper leagues in v8.1.
        </p>
      </div>
    );
  }

  // User-facing copy names the connected platform rather than hardcoding one.
  const platformLabel = platform === 'espn' ? 'ESPN' : 'Sleeper';
  const liveEnabled = Boolean(liveStatus?.live?.enabled);
  const sessionEnabled = Boolean(liveStatus?.session?.enabled);
  const sessionCanDisable = Boolean(liveStatus?.session?.canDisable);
  const liveConfigurationMessage = getLiveConfigurationMessage(liveStatus?.live, platformLabel);
  const mockPlaysEnabled = demoFeedEnabled;
  // The league week remains the page context all week. The transient live
  // signal is narrower: only games involving a starter in the matchup being
  // viewed can light it up.
  const matchupLiveGameCount = sortRelevantGames(liveGames, matchupTeams)
    .filter((game) => isLiveGame(game)).length;
  const hasMatchupGameLive = matchupLiveGameCount > 0;

  // The play-built series is the real curve. Without play-by-play (free tier,
  // or before any play lands) the persisted odds history still carries both
  // sides' running totals, so the chart degrades to that rather than to
  // nothing; its points have no game clock and spread evenly across the slate.
  const paceSeries = paceModel.points.length >= 2
    ? paceModel.points
    : winProbHistory.length >= 2
      ? winProbHistory
      : winProb
        ? [
            { p: winProb.probA, a: 0, b: 0 },
            {
              p: winProb.probA,
              a: leftSide?.pace.total ?? 0,
              b: rightSide?.pace.total ?? 0,
              settled: winProb.settled,
              settlementPending: winProb.settlementPending,
              modelId: winProb.modelId,
              explain: winProb.explain,
            },
          ]
        : [];
  // Marks honour the play filter; the lines never do. Filtering the dots alone
  // keeps the shape of the week intact — the curve still shows everything that
  // was scored, while the dots narrow to the plays being asked about.
  const paceMarks = paceModel.points.length >= 2
    ? paceModel.marks
      .filter((mark) => matchesPlayFilter(mark.event))
      .map((mark) => {
        const player = entriesById.get(mark.playerId)?.row?.player;
        return {
          ...mark,
          playerName: player ? getSleeperPlayerName(player) : null,
        };
      })
    : [];

  // Hover previews a nearby moment; once the pointer leaves, the last chosen
  // moment remains the shared source for the hero, chart and feed.
  const displayedMoment = chartHover ?? selectedMoment;
  const heroSnapshot = displayedMoment && displayedMoment.x < slateProgress - 0.005
    ? displayedMoment
    : null;

  const updatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const kickerText = nflStateLoading
    ? 'Checking schedule'
    : !week
      ? 'No active matchup'
      : statusError
        ? 'Live scoring unavailable'
        : !liveEnabled
          ? 'Live scoring needs setup'
          : !sessionEnabled
            ? 'Live scoring ready'
            // The left of the bar already says "Live", so this side only carries
            // what changed: how many games are running and when we last heard.
            : `${hasMatchupGameLive ? `${matchupLiveGameCount} matchup ${matchupLiveGameCount === 1 ? 'game' : 'games'} live` : 'No matchup games live'}${updatedLabel ? ` · ${updatedLabel}` : ' · waiting for data'}`;

  const matchedStarters = sideSummaries.reduce((sum, summary) => sum + summary.matchedCount, 0);
  const totalStarters = sideSummaries.reduce((sum, summary) => sum + summary.rows.length, 0);

  const openPlayer = (entry, event = null) => {
    setSelectedPlayerId(entry.id);
    setSelectedEventId(event?.id ?? null);
  };

  const closePlayer = () => {
    setSelectedPlayerId(null);
    setSelectedEventId(null);
    setFocusPlayerId(null);
  };

  const returnToLive = () => {
    setChartHover(null);
    setSelectedMoment(null);
    setFeedAnchorProgress(null);
    setFeedSelection(null);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    feedViewportRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const selectChartMoment = (point) => {
    if (!point || point.x >= slateProgress - 0.005) {
      returnToLive();
      return;
    }
    setChartHover(null);
    setSelectedMoment(point);
    setFeedSelection(null);
    setFeedAnchorProgress(point.x);
  };

  // A chart milestone is a direct link to its evidence in the feed. Widen any
  // filter that hides it, persist the exact chart moment, then request its row
  // at the top of the independent feed scrollport.
  const selectMark = (mark) => {
    const sideKey = playerSideKey.get(mark.playerId);
    const point = paceModel.points.find((candidate) => candidate.eventId === mark.event.id)
      ?? { x: mark.x, a: 0, b: 0, p: winProb?.probA ?? 50 };
    setFocusPlayerId(null);
    setFeedSide((current) => (
      current === 'both' || current === sideKey ? current : 'both'
    ));
    setChartHover(null);
    setSelectedMoment(point);
    setFeedAnchorProgress(null);
    setFeedSelection((current) => ({
      eventId: mark.event.id,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  const selectPerformer = (playerId) => {
    focusStarter(playerId);
    if (!playerId) {
      setSelectedPlayerId(null);
      setSelectedEventId(null);
      return;
    }
    const entry = entriesById.get(playerId);
    if (entry) openPlayer(entry);
  };

  const focusedName = focusPlayerId
    ? lastNameOf(getSleeperPlayerName(entriesById.get(focusPlayerId)?.row.player ?? {}))
    : null;

  const feedEmptyMessage = !sessionEnabled
    ? 'Turn on Live to see plays and their fantasy impact.'
    : focusPlayerId
      ? 'No scoring plays from this starter yet.'
      : mockPlaysEnabled
        ? 'Mock plays appear after the live snapshot loads.'
        : liveGames.length
          ? 'No plays for these starters yet.'
          : 'Play-by-play is not available for this week.';

  return (
    <div className="page-frame-workbench companion-live-shell pb-6">
      <SeasonHintBanner capability="current-only" feature="Fantasy Live" className="mx-4 mb-3" />
      {(statusError || liveError) && (
        <div className="companion-live-alert" role="status">
          {statusError || liveError}
        </div>
      )}

      {liveEnabled && !sessionEnabled && (
        <div className="companion-live-gate">
          <div>
            <span>Live Access</span>
            <strong>Turn on live scoring for this league</strong>
            <p>
              Live scoring runs through your GridShift server — nothing sensitive
              reaches this page.
            </p>
          </div>
          <div className="companion-live-gate__controls">
            {liveStatus?.live?.accessCodeRequired && (
              <input
                type="text"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="Passphrase"
                className="companion-live-input"
              />
            )}
            <button
              type="button"
              className="companion-live-primary"
              onClick={enableLive}
              disabled={sessionLoading}
            >
              {sessionLoading ? 'Turning on…' : 'Turn on Live'}
            </button>
          </div>
        </div>
      )}

      <div
        ref={gridRef}
        className="fl"
        style={{ '--fl-mchip-sticky-height': `${matchupStickyHeight}px` }}
      >
        <div className="fl-top">
          {week && (
            <span className="fl-top__l">
              {sessionEnabled && hasMatchupGameLive && <span className="fl-live-dot" aria-hidden="true" />}
              Live · Week {week}
            </span>
          )}
          <span className="fl-top__r">{kickerText}</span>
          <button
            type="button"
            className={`fl-top__more${showDetails ? ' is-active' : ''}`}
            onClick={() => setShowDetails((value) => !value)}
            aria-expanded={showDetails}
            aria-label="Live scoring options"
          >
            ⋯
          </button>
        </div>

        {week && <div ref={matchupRailRef} className="fl-mchip-stick">
          <CompanionSelectorRail
            label="Matchup"
            ariaLabel="Fantasy matchup"
            className="fl-mchip-rail"
            wrapOnDesktop={false}
            style={{ '--fl-mchip-name-width': matchupChipNameWidth }}
          >
            {matchupChips.map((chip) => (
              <CompanionSelectorButton
                key={chip.key}
                size="md"
                active={chip.index === matchupIndex}
                onClick={() => navigateToMatchup(chip.index)}
                className="fl-mchip"
                aria-label={`${chip.sides.map((side) => `${side.fullName} ${formatChipPoints(side.points)}`).join(' versus ')}${chip.mine ? ' — your matchup' : ''}`}
              >
                <span className="fl-mchip__rows">
                  {chip.sides.map((side) => (
                    <span className="fl-mchip__row" key={side.key}>
                      <i style={{ background: side.color }} aria-hidden="true" />
                      <em>{side.label}</em>
                      <b>{formatChipPoints(side.points)}</b>
                    </span>
                  ))}
                </span>
              </CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>
        </div>}

        {showDetails && (
          <div className="companion-live-details">
            <dl>
              <div><dt>Fantasy Live server</dt><dd>{liveStatus ? (liveEnabled ? 'Ready' : 'Needs setup') : (statusError ? 'Unavailable' : 'Checking…')}</dd></div>
              <div><dt>Fantasy Live league</dt><dd>{sessionEnabled ? 'Live scoring on' : (liveEnabled ? 'Not enabled' : 'Waiting for server')}</dd></div>
              <div><dt>Scores provider</dt><dd>{scoresProviderStatus?.providerLabel ?? (scoresProviderStatusError ? 'Unavailable' : 'Checking…')}</dd></div>
              <div><dt>Snapshot age</dt><dd>{cacheMeta ? `${Math.round((cacheMeta.ageMs ?? 0) / 100) / 10}s` : '—'}</dd></div>
              <div><dt>Matchup games live</dt><dd>{sessionEnabled ? matchupLiveGameCount : '—'}</dd></div>
              <div><dt>Live starters</dt><dd>{sessionEnabled && totalStarters ? `${matchedStarters}/${totalStarters}` : '—'}</dd></div>
            </dl>
            {liveConfigurationMessage && <p>{liveConfigurationMessage}</p>}
            <p>
              Fantasy Live server and league access control this matchup view only. {scoresProviderStatus?.message ?? (scoresProviderStatusError || 'Statistics Scores provider status is still loading.')}
            </p>
            {sessionEnabled && !sessionCanDisable && (
              <p>
                Turning off Live requires the server passphrase used to enable this session.
              </p>
            )}
            {sessionEnabled && (
              <div className="companion-live-details__actions">
                <button
                  type="button"
                  className={`companion-live-chip-button${autoRefresh ? ' is-active' : ''}`}
                  onClick={() => setAutoRefresh((value) => !value)}
                  aria-pressed={autoRefresh}
                >
                  {autoRefresh ? 'Auto-updating' : 'Paused'}
                </button>
                <button
                  type="button"
                  className="companion-live-chip-button"
                  onClick={() => fetchLiveSnapshot()}
                  disabled={loadingLive}
                >
                  {loadingLive ? 'Refreshing…' : 'Refresh'}
                </button>
                {sessionCanDisable && (
                  <button type="button" className="companion-live-chip-button" onClick={disableLive} disabled={sessionLoading}>
                    Turn off live scoring for this browser
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {nflStateBlocking ? (
          <div className="fl-empty">Checking the current fantasy week…</div>
        ) : nflStateFailed ? (
          <div className="fl-empty">Fantasy Live couldn't confirm the current NFL week. Refresh the page to try again.</div>
        ) : !week ? (
          <div className="fl-empty">{liveAvailability.message}</div>
        ) : matchupsLoading ? (
          <div className="fl-empty">Loading fantasy matchups…</div>
        ) : !currentMatchup ? (
          <div className="fl-empty">There is no fantasy matchup for this league in Week {week}.</div>
        ) : !leftSide || !rightSide ? (
          // A one-sided matchup is a real state in odd-sized leagues, not a
          // missing matchup — say which it is.
          <div className="fl-empty">
            {(leftSide ?? rightSide)?.name ?? 'This team'} has no opponent in week {week}.
          </div>
        ) : (
          <>
            <div ref={heroStageRef} className="fl-hero-stage">
              <LiveHero
                left={leftSide}
                right={rightSide}
                winProbA={winProb?.probA ?? 50}
                winExplain={winProb?.explain ?? null}
                snapshot={heroSnapshot}
                filter={feedSide}
                onFilter={setFeedSide}
                onOpenPlayer={openPlayer}
              />
            </div>
            <LiveVerdict
              left={leftSide}
              right={rightSide}
              verdict={verdict}
              winProbA={heroSnapshot?.p ?? winProb?.probA}
              settled={Boolean(heroSnapshot?.settled ?? winProb?.settled)}
            />

            <div className="fl-desk">
              <div className="fl-desk__main">
                <div className="fl-scroll">
                  <div className="fl-live-board">
                    <div className="fl-controls">
                      <LivePerformerRail
                        performers={performers}
                        focusId={focusPlayerId}
                        onSelect={selectPerformer}
                      />
                      <div className={`fl-analysis-stage${selectedEntry ? ' is-player' : ' is-chart'}`}>
                        {selectedEntry ? (
                          <LivePlayerSheet
                            entry={selectedEntry}
                            side={sidesByKey[selectedEntry.sideKey]}
                            glance={getPlayerGameGlance(getTeamAbbr(selectedEntry.row.player?.team), selectedEntry.row)}
                            events={mergedFeed}
                            scoringSettings={activeScoringSettings}
                            liveActive={sessionEnabled}
                            selectedEventId={selectedEventId}
                            embedded
                            onClose={closePlayer}
                            onViewPlayer={onViewPlayer}
                          />
                        ) : paceSeries.length > 0 ? (
                          <>
                          <LivePaceChart
                            key={currentMatchup.matchupId}
                            left={leftSide}
                            right={rightSide}
                            scaleMode={sandbox ? sandboxChartScale : 'projection'}
                            series={paceSeries}
                            marks={paceMarks}
                            progress={slateProgress}
                            hover={chartHover}
                            selection={selectedMoment}
                            selectedEventId={feedSelection?.eventId ?? null}
                            onHover={setChartHover}
                            onScrub={selectChartMoment}
                            onSelectMark={selectMark}
                            onReturnLive={returnToLive}
                            collapsedSummary={heroCollapsed}
                            liveWinProbA={winProb?.probA ?? 50}
                            liveSettled={winProb?.settled ?? false}
                            timelineMode={mockPlaysEnabled ? 'schedule' : 'game'}
                            timeline={demoTimeline}
                          />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="fl-feed-column">
                      <div ref={feedViewportRef} className="fl-feed-scroll">
                        <LiveFeedFilter
                          left={leftSide}
                          right={rightSide}
                          value={feedSide}
                          counts={feedCounts}
                          onChange={setFeedSide}
                          focusName={focusedName}
                          onClearFocus={() => selectPerformer(null)}
                        />
                        <LiveFeedPlayFilter
                          model={playFilterModel}
                          value={feedFilter}
                          counts={playFilterCounts}
                          positions={playFilterPositions}
                          onChange={setFeedFilter}
                        />
                        <LiveFeedList
                          key={`${currentMatchup.matchupId}-${feedSide}-${focusPlayerId ?? 'all'}`}
                          events={visibleFeed}
                          entriesById={entriesById}
                          sidesByKey={sidesByKey}
                          scoringSettings={activeScoringSettings}
                          anchorProgress={feedAnchorProgress}
                          selectedEventId={feedSelection?.eventId ?? null}
                          selectionRequest={feedSelection?.requestId ?? 0}
                          onOpenPlayer={openPlayer}
                          emptyMessage={feedEmptyMessage}
                          // A provider-backed play is just as trustworthy in
                          // the real live view as it is in the sandbox. The
                          // detail component still declines to draw synthetic
                          // stat-delta rows that have no field geometry.
                          showPlayField
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
      {LIVE_SANDBOX_ENABLED && <LiveSandboxPanel />}
    </div>
  );
}
