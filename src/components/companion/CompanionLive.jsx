import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import { getLiveMatchups, getWeeklyStats } from '../../api/sleeperApi';
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
  resolveStarterGameState,
} from '../../utils/liveScoringFeed.js';
import {
  clearLiveSession,
  getLiveGamePlays,
  getLiveGames,
  getLivePlayerStatsForGames,
  getLiveStatus,
  startLiveSession,
} from '../../api/liveApi';
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
import { LiveFeedFilter, LiveFeedList } from './live/LiveFeed.jsx';
import { firstWordOf, lastNameOf } from './live/liveVisuals.js';
import SeasonHintBanner from '../ui/SeasonHintBanner';

const TOTAL_WEEKS = 18;
const LIVE_REFRESH_MS = 5000;
const FREE_TIER_REFRESH_MS = 60000;
const MAX_FEED_EVENTS = 80;
const MAX_PLAYS_GAMES = 8;
const PLAYS_REFRESH_MIN_MS = 45000;
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

function clampWeek(value, totalWeeks, fallbackWeek) {
  const numeric = Number(value);
  const fallback = Number(fallbackWeek);
  const base = Number.isFinite(numeric) ? numeric : Number.isFinite(fallback) ? fallback : 1;
  return Math.max(1, Math.min(totalWeeks, base));
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
  } = useSleeperBase();

  const isDesktop = useIsDesktop();

  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  const totalWeeks = useMemo(() => (
    Number.isFinite(lastScoredLeg) && lastScoredLeg > 0 ? Math.min(lastScoredLeg + 1, TOTAL_WEEKS) : 17
  ), [lastScoredLeg]);
  const rawPlayoffStart = Number(league?.settings?.playoff_week_start);
  const playoffStart = Number.isFinite(rawPlayoffStart) && rawPlayoffStart > 0 ? rawPlayoffStart : totalWeeks + 1;
  // Live scoring only ever covers the week being played right now — there is
  // nothing live about a finished week. Past weeks and their play history
  // belong to Fantasy Matchups, which owns the historical week picker.
  const week = clampWeek(playoffStart <= totalWeeks ? playoffStart - 1 : totalWeeks, totalWeeks, 1);

  const [matchups, setMatchups] = useState([]);
  const [matchupsLoading, setMatchupsLoading] = useState(false);
  const [matchupIndex, setMatchupIndex] = useState(0);
  const [liveStatus, setLiveStatus] = useState(null);
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
  const playsFetchedRef = useRef(new Map());
  const pendingPlayGamesRef = useRef(new Set());
  const weatherPendingRef = useRef(new Set());
  const liveSnapshotRequestRef = useRef(0);
  const liveSnapshotContextRef = useRef(null);
  const gridRef = useRef(null);
  const matchupRailRef = useRef(null);
  const heroStageRef = useRef(null);
  const feedViewportRef = useRef(null);
  const feedScrollRef = useRef(0);

  const resetMatchupSelections = useCallback(() => {
    // A matchup is its own navigation context. Clear every drill-in and feed
    // cursor before another matchup can render with stale selection state.
    feedScrollRef.current = 0;
    setFeedSide('both');
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
  }, [isDesktop]);

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
  }, [isDesktop]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => { loadSeasonStats?.(); }, [loadSeasonStats]);

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
    if (platform !== 'sleeper' || !selectedLeagueId) return;
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
    pendingPlayGamesRef.current = new Set();
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

  const liveSnapshotContextKey = [
    selectedLeagueId,
    season,
    week,
    liveStatus?.session?.enabled ? 'enabled' : 'disabled',
    ...[...matchupTeams].sort(),
  ].join(':');
  liveSnapshotContextRef.current = liveSnapshotContextKey;

  const fetchLiveSnapshot = useCallback(async ({ quiet = false } = {}) => {
    if (!liveStatus?.session?.enabled || platform !== 'sleeper') return;
    const requestId = liveSnapshotRequestRef.current + 1;
    liveSnapshotRequestRef.current = requestId;
    const requestContext = liveSnapshotContextKey;
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
  }, [fetchLiveSnapshot]);

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
          points: mappedStats ? livePoints : (sleeperPoints ?? sleeperDerivedPoints ?? 0),
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
  ), [activeScoringSettings, currentMatchup, espnIdOverrides, myRosterId, players, sleeperStatsByPlayer, statIndex, week]);

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
    const next = new Map();
    const meta = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => {
      meta.set(row.id, { position: row.player?.position });
      if (row.mappedStats) next.set(row.id, { stats: row.mappedStats, points: row.livePoints });
    }));
    const prev = snapshotRef.current;
    if (prev.size) {
      const events = buildDeltaEvents(prev, next, meta).map((event) => {
        const row = sideSummaries
          .flatMap((summary) => summary.rows)
          .find((candidate) => candidate.id === event.playerId);
        const game = row?.bdlRow?.gameId
          ? liveGames.find((candidate) => String(candidate.id) === String(row.bdlRow.gameId))
          : findGameForTeam(liveGames, row?.player?.team);
        const remaining = game ? getRemainingGameFraction(game) : null;
        return {
          ...event,
          gameId: row?.bdlRow?.gameId ?? game?.id ?? null,
          gameProgress: Number.isFinite(remaining) ? 1 - remaining : null,
          timelineAt: event.at,
        };
      });
      if (events.length) {
        setFeedEvents((current) => [...events, ...current].slice(0, MAX_FEED_EVENTS));
        // Flag these players' games for a plays refresh so the delta can be
        // matched to a real play description on the next sync.
        events.forEach((event) => {
          const row = sideSummaries.flatMap((summary) => summary.rows).find((r) => r.id === event.playerId);
          const gameId = row?.bdlRow?.gameId;
          if (gameId) pendingPlayGamesRef.current.add(String(gameId));
        });
      }
    }
    snapshotRef.current = next;
  }, [currentMatchup, liveGames, sideSummaries]);

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
  }, [starterInfoById, weatherMap]);

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
    getLiveMatchups(selectedLeagueId, week)
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
    setWinProbHistory(loadWinProbHistory(historyKey));
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
      if (next !== current) saveWinProbHistory(historyKey, next);
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
  // Budgeted for the BDL free tier: backfill each relevant game once (live
  // games first), never refetch finals, and refresh a live game's plays only
  // when one of its starters just produced a stat delta (≥45s apart).
  useEffect(() => {
    if (!liveStatus?.session?.enabled || !currentMatchup || !liveGames.length) return undefined;
    const mockPlays = isMockPlayByPlayEnabled(liveStatus);
    if (isFreeLiveTier(liveStatus) && !mockPlays) return undefined;
    let cancelled = false;
    const starterRows = sideSummaries.flatMap((summary) => summary.rows);
    const relevant = limitPlayByPlayGames(
      sortRelevantGames(liveGames, matchupTeams)
        .filter((game) => mockPlays || isLiveGame(game) || isFinalGame(game)),
      { mock: mockPlays, maxGames: MAX_PLAYS_GAMES },
    );

    (async () => {
      for (const game of relevant) {
        if (cancelled) return;
        const gameId = String(game.id);
        const marker = playsFetchedRef.current.get(gameId);
        const final = isFinalGame(game);
        const wantsRefresh = pendingPlayGamesRef.current.has(gameId);
        const now = Date.now();
        const shouldFetch = !marker
          || (final && !marker.final)
          || (!final && wantsRefresh && now - marker.at >= PLAYS_REFRESH_MIN_MS);
        if (!shouldFetch) continue;
        try {
          const data = mockPlays
            ? buildMockLivePlays(game, starterRows.filter((row) => getTeamAbbr(row.player?.team)
              && [getTeamAbbr(game?.visitor_team), getTeamAbbr(game?.home_team)].includes(getTeamAbbr(row.player.team))))
            : (await getLiveGamePlays(gameId)).data;
          if (cancelled) return;
          playsFetchedRef.current.set(gameId, { at: Date.now(), final });
          pendingPlayGamesRef.current.delete(gameId);
          setPlaysByGame((prev) => ({
            ...prev,
            [gameId]: Array.isArray(data) ? data : [],
          }));
        } catch {
          // Leave the marker unset so a later tick can retry.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentMatchup, lastUpdatedAt, liveGames, liveStatus, matchupTeams, sideSummaries]);

  const gamesById = useMemo(() => {
    const map = new Map();
    liveGames.forEach((game) => map.set(String(game.id), game));
    return map;
  }, [liveGames]);

  const demoTimeline = useMemo(() => (
    isMockPlayByPlayEnabled(liveStatus)
      ? buildDemoTimeline(sortRelevantGames(liveGames, matchupTeams))
      : null
  ), [liveGames, liveStatus, matchupTeams]);

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

  const playEvents = useMemo(() => (
    buildPlayEvents(playsByGame, starterNameIndex, activeScoringSettings, positionsById, gamesById)
  ), [activeScoringSettings, gamesById, playsByGame, positionsById, starterNameIndex]);

  // Stat-delta events only know "just now"; give them the game progress of the
  // starter they belong to so every feed row can sit on the chart's axis.
  const mergedFeed = useMemo(() => {
    const events = mergePlayEvents(playEvents, feedEvents).map((event) => {
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
    if (!demoTimeline) return events;
    return events
      .concat(buildSharedDemoScoringEvents({
        sides: sideSummaries,
        scoringSettings: activeScoringSettings,
      }))
      .sort((left, right) => (Number(right.progress) || 0) - (Number(left.progress) || 0))
  }, [activeScoringSettings, demoTimeline, entriesById, feedEvents, liveGames, playEvents, sideSummaries]);

  // Real scoring measures shared game progress. The mock feed instead closes
  // at its latest active-game event on the compressed schedule.
  const slateProgress = useMemo(() => {
    if (demoTimeline) {
      return mergedFeed.reduce((latest, event) => (
        Number.isFinite(Number(event.progress)) ? Math.max(latest, Number(event.progress)) : latest
      ), 0);
    }
    const all = sides.flatMap((side) => side.entries);
    if (!all.length) return 0;
    return all.reduce((sum, entry) => sum + entry.pace.progress, 0) / all.length;
  }, [demoTimeline, mergedFeed, sides]);

  const visibleFeed = useMemo(() => (
    mergedFeed.filter((event) => {
      const sideKey = playerSideKey.get(event.playerId);
      if (!sideKey || (feedSide !== 'both' && sideKey !== feedSide)) return false;
      return !focusPlayerId || event.playerId === focusPlayerId;
    })
  ), [feedSide, focusPlayerId, mergedFeed, playerSideKey]);

  const feedCounts = useMemo(() => {
    const counts = { a: 0, b: 0 };
    mergedFeed.forEach((event) => {
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
    return buildPaceSeries({
      events: mergedFeed,
      sideKeyOf: (event) => playerSideKey.get(event.playerId) ?? null,
      totals: { a: leftSide?.pace.total ?? 0, b: rightSide?.pace.total ?? 0 },
      slateProgress,
      snapshotAt,
      historicalSnapshots: demoTimeline ? [] : winProbHistory,
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
    try {
      await clearLiveSession();
      const statusPayload = await getLiveStatus();
      setLiveStatus(statusPayload);
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
  const mockPlaysEnabled = isMockPlayByPlayEnabled(liveStatus);
  const liveGameCount = liveGames.filter((game) => isLiveGame(game)).length;

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
  const paceMarks = paceModel.points.length >= 2
    ? paceModel.marks.map((mark) => {
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
  const kickerText = statusError
    ? 'Live scoring unavailable'
    : !liveEnabled
      ? 'Live scoring not set up'
      : !sessionEnabled
        ? 'Live scoring ready'
        // The left of the bar already says "Live", so this side only carries
        // what changed: how many games are running and when we last heard.
        : `${liveGameCount > 0 ? `${liveGameCount} ${liveGameCount === 1 ? 'game' : 'games'} live` : 'No games live'}${updatedLabel ? ` · ${updatedLabel}` : ' · waiting for data'}`;

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
      <SeasonHintBanner capability="current-only" feature="Live scoring" className="mx-4 mb-3" />
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
                placeholder="Access code"
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
          <span className="fl-top__l">
            {sessionEnabled && <span className="fl-live-dot" aria-hidden="true" />}
            Live · Week {week}
          </span>
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

        <div ref={matchupRailRef} className="fl-mchip-stick">
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
        </div>

        {showDetails && (
          <div className="companion-live-details">
            <dl>
              <div><dt>Data server</dt><dd>{liveEnabled ? 'Ready' : 'Not configured'}</dd></div>
              <div><dt>This league</dt><dd>{sessionEnabled ? 'Live scoring on' : 'Live scoring off'}</dd></div>
              <div><dt>Snapshot age</dt><dd>{cacheMeta ? `${Math.round((cacheMeta.ageMs ?? 0) / 100) / 10}s` : '—'}</dd></div>
              <div><dt>Games live</dt><dd>{sessionEnabled ? liveGameCount : '—'}</dd></div>
              <div><dt>Live starters</dt><dd>{sessionEnabled && totalStarters ? `${matchedStarters}/${totalStarters}` : '—'}</dd></div>
            </dl>
            {!liveEnabled && (
              <p>
                Live scoring isn't set up on this server yet. See the server setup
                guide in the project docs.
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
                <button type="button" className="companion-live-chip-button" onClick={disableLive} disabled={sessionLoading}>
                  Turn off live scoring for this browser
                </button>
              </div>
            )}
          </div>
        )}

        {matchupsLoading ? (
          <div className="fl-empty">Loading fantasy matchups…</div>
        ) : !currentMatchup ? (
          <div className="fl-empty">No {platformLabel} matchup is available for this week.</div>
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
                          <LivePaceChart
                            key={currentMatchup.matchupId}
                            left={leftSide}
                            right={rightSide}
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
    </div>
  );
}
