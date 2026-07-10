import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { getWeeklyStats } from '../../api/sleeperApi';
import { calcPoints, calcPointsFromTotals } from '../../utils/scoringEngine';
import { fetchSeasonSchedule } from '../../utils/playerApi.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import {
  getCompanionInitials,
  getCompanionPlayerImageUrls,
  getCompanionPositionColor,
  getPositionTextColor,
} from '../../utils/companionAssetVisuals.js';
import {
  EVENT_KIND_LABELS,
  buildDeltaEvents,
  buildStatIndex,
  findGameForTeam,
  getGameGlance,
  getSleeperPlayerName,
  getStatKeyForSleeperPlayer,
  getTeamAbbr,
  isFinalGame,
  isLiveGame,
  mapBdlStatsToGridShift,
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
  getRemainingGameFraction,
  getStarterOutlook,
  loadWinProbHistory,
  saveWinProbHistory,
} from '../../utils/liveWinProbability.js';
import { buildPlayEvents, buildStarterNameIndex, mergePlayEvents } from '../../utils/livePlaysFeed.js';
import { CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls';
import CompanionLivePlayerSheet from './CompanionLivePlayerSheet';
import SeasonHintBanner from '../ui/SeasonHintBanner';
import { SkeletonStatChip } from '../ui/Skeleton';

const TOTAL_WEEKS = 18;
const LIVE_REFRESH_MS = 5000;
const FREE_TIER_REFRESH_MS = 60000;
const MAX_FEED_EVENTS = 80;
const MAX_PLAYS_GAMES = 8;
const PLAYS_REFRESH_MIN_MS = 45000;
const CHART_WIDTH = 340;
const CHART_HEIGHT = 132;
const CHART_PAD_LEFT = 8;
const CHART_PAD_RIGHT = 26;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 18;

function clampWeek(value, totalWeeks, fallbackWeek) {
  const numeric = Number(value);
  const fallback = Number(fallbackWeek);
  const base = Number.isFinite(numeric) ? numeric : Number.isFinite(fallback) ? fallback : 1;
  return Math.max(1, Math.min(totalWeeks, base));
}

function formatPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '0.0';
}

function formatWinChance(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(numeric)}%`;
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
  const officialPoints = Number(row?.points);
  if (Number.isFinite(officialPoints)) return officialPoints;

  const playerPoints = row?.players_points ?? {};
  return (row?.starters ?? [])
    .map((id) => String(id))
    .filter((id) => id && id !== '0')
    .reduce((sum, id) => {
      const points = Number(playerPoints[id]);
      return sum + (Number.isFinite(points) ? points : 0);
    }, 0);
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

function getChartSliceIndex(event, length, width, { padX = 8 } = {}) {
  const rect = event.currentTarget.getBoundingClientRect();
  const denominator = Math.max(1, length - 1);
  const rawX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
  const ratio = Math.min(1, Math.max(0, (rawX - padX) / Math.max(1, width - (padX * 2))));
  return Math.min(length - 1, Math.max(0, Math.round(ratio * denominator)));
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

  return eligibleRows.flatMap((row) => {
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
}

function HeroTeam({ summary, leading = false, right = false }) {
  if (!summary) return <div className="companion-live-team" aria-hidden="true" />;
  return (
    <div className={`companion-live-team${right ? ' is-right' : ''}${leading ? ' is-leading' : ''}`}>
      <div className="companion-live-team__tag">
        {summary.isMine && <b>You</b>}
        {summary.record && <span>{summary.record}</span>}
      </div>
      <div className="companion-live-team__name">{summary.name}</div>
      <div className="companion-live-team__points">
        {Number.isFinite(Number(summary.total)) ? formatPoints(summary.total) : <SkeletonStatChip width="2.5rem" />}
      </div>
    </div>
  );
}

function FeedRow({ item, glance, theme, onOpen }) {
  const [imageFallback, setImageFallback] = useState({ key: '', index: 0 });
  const player = item.player ?? {};
  const position = String(player.position ?? 'FLEX').toUpperCase();
  const positionColor = getCompanionPositionColor(position);
  const hasGradient = Boolean(theme?.gradient);
  const imageUrls = getCompanionPlayerImageUrls(player);
  const imageKey = imageUrls.join('|');
  const imageIndex = imageFallback.key === imageKey ? imageFallback.index : 0;
  const imageUrl = imageUrls[imageIndex] ?? null;
  const foreground = hasGradient ? theme.gradientForeground : 'var(--color-label)';
  const muted = hasGradient ? theme.gradientMuted : 'var(--color-label-secondary)';
  const valueColor = hasGradient ? theme.gradientEndForeground : 'var(--color-label)';
  const valueMuted = hasGradient ? theme.gradientEndMuted : 'var(--color-label-tertiary)';
  const flat = !item.pts;

  return (
    <button
      type="button"
      className={`companion-live-row${item.isMine ? ' is-mine' : ' is-opponent'}`}
      style={{
        background: hasGradient ? theme.gradient : undefined,
        color: foreground,
      }}
      onClick={onOpen}
    >
      {hasGradient && (
        <span className="companion-live-row__overlay" aria-hidden="true" style={{ background: theme.gradientOverlay }} />
      )}
      <span className="companion-live-row__avatar" aria-hidden="true">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => {
              setImageFallback((current) => {
                const currentIndex = current.key === imageKey ? current.index : 0;
                return { key: imageKey, index: Math.min(currentIndex + 1, imageUrls.length) };
              });
            }}
          />
        ) : (
          <span className="companion-live-row__initials">{getCompanionInitials(getSleeperPlayerName(player))}</span>
        )}
        {item.kind && (
          <i className={`companion-live-kind is-${item.kind}`}>{EVENT_KIND_LABELS[item.kind] ?? '•'}</i>
        )}
      </span>
      <span className="companion-live-row__body">
        <span className="companion-live-row__name">
          <b style={{ background: positionColor, color: getPositionTextColor(positionColor) }}>{position}</b>
          <span>{getSleeperPlayerName(player)}</span>
        </span>
        <span className="companion-live-row__desc" style={{ color: muted }}>{item.desc}</span>
        {glance && (
          <span className="companion-live-row__glance" style={{ color: muted }}>
            <span>{glance.score}</span>
            <i aria-hidden="true">·</i>
            <span className={glance.live ? 'is-live' : ''}>{glance.clock}</span>
          </span>
        )}
      </span>
      <span className="companion-live-row__delta">
        <span className="companion-live-row__scoreline">
          <b style={{ color: flat ? valueMuted : valueColor }}>
            {flat ? '—' : `${item.pts > 0 && item.isDelta ? '+' : ''}${formatPoints(item.pts)}`}
          </b>
          <span aria-hidden="true" style={{ color: valueMuted }}>›</span>
        </span>
        <em style={{ color: valueMuted }}>PTS</em>
      </span>
    </button>
  );
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
  } = useSleeperBase();
  const { darkMode } = useTheme();

  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  const totalWeeks = useMemo(() => (
    Number.isFinite(lastScoredLeg) && lastScoredLeg > 0 ? Math.min(lastScoredLeg + 1, TOTAL_WEEKS) : 17
  ), [lastScoredLeg]);
  const rawPlayoffStart = Number(league?.settings?.playoff_week_start);
  const playoffStart = Number.isFinite(rawPlayoffStart) && rawPlayoffStart > 0 ? rawPlayoffStart : totalWeeks + 1;
  const defaultWeek = clampWeek(playoffStart <= totalWeeks ? playoffStart - 1 : totalWeeks, totalWeeks, 1);
  const weekOptions = useMemo(() => Array.from({ length: totalWeeks }, (_, index) => index + 1), [totalWeeks]);

  const [week, setWeek] = useState(defaultWeek);
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
  const [chartHoverIndex, setChartHoverIndex] = useState(null);
  const [feedEvents, setFeedEvents] = useState([]);
  const [weatherMap, setWeatherMap] = useState({});
  const [playsByGame, setPlaysByGame] = useState({});
  const [winProbHistory, setWinProbHistory] = useState([]);
  const [chartWidth, setChartWidth] = useState(CHART_WIDTH);
  const snapshotRef = useRef(new Map());
  const chartResizeRef = useRef(null);
  const chartPlotNodeRef = useRef(null);
  const chartScrubbingRef = useRef(false);
  const playsFetchedRef = useRef(new Map());
  const pendingPlayGamesRef = useRef(new Set());
  const weatherPendingRef = useRef(new Set());
  const gridRef = useRef(null);
  const feedScrollRef = useRef(0);

  // Touch gets tap-to-scrub with outside-tap dismiss; mouse keeps hover.
  const isCoarsePointer = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches),
    [],
  );

  // The chart builds its geometry from the plot's real pixel width so text
  // and hover math never render through a stretched coordinate space.
  const chartPlotRef = useCallback((node) => {
    chartResizeRef.current?.disconnect();
    chartResizeRef.current = null;
    chartPlotNodeRef.current = node;
    if (node && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect?.width;
        if (width) setChartWidth(Math.max(220, Math.round(width)));
      });
      observer.observe(node);
      chartResizeRef.current = observer;
    }
  }, []);

  useEffect(() => () => chartResizeRef.current?.disconnect(), []);

  // On coarse pointers the tooltip persists after the finger lifts, so a tap
  // anywhere outside the plot dismisses it.
  useEffect(() => {
    if (!isCoarsePointer || chartHoverIndex == null) return undefined;
    const onDocumentPointerDown = (event) => {
      if (!chartPlotNodeRef.current?.contains(event.target)) setChartHoverIndex(null);
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [chartHoverIndex, isCoarsePointer]);

  // On small screens the drill-in sheet replaces the board, so keep it in
  // view when it opens and restore the feed position when it closes.
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

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => { loadSeasonStats?.(); }, [loadSeasonStats]);

  useEffect(() => {
    setWeek((prev) => clampWeek(prev, totalWeeks, defaultWeek));
  }, [defaultWeek, totalWeeks]);

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
    setSelectedPlayerId(null);
    setSelectedEventId(null);
    setChartHoverIndex(null);
  }, [week, matchupIndex]);

  const myRosterId = myRoster()?.roster_id ?? null;
  const matchupPairs = useMemo(
    () => getMatchupPairs(matchups, rosters, getUserDisplayName, myRosterId),
    [getUserDisplayName, matchups, myRosterId, rosters],
  );
  const currentMatchup = matchupPairs[Math.min(matchupIndex, Math.max(0, matchupPairs.length - 1))] ?? null;

  useEffect(() => {
    if (matchupIndex <= matchupPairs.length - 1) return;
    setMatchupIndex(0);
  }, [matchupIndex, matchupPairs.length]);

  const matchupStarterIds = useMemo(() => (
    (currentMatchup?.sides ?? []).flatMap((side) => getStarterIds(side))
  ), [currentMatchup]);

  const matchupTeams = useMemo(() => {
    const teams = new Set();
    matchupStarterIds.forEach((id) => {
      const team = getTeamAbbr(players?.[id]?.team);
      if (team) teams.add(team);
    });
    return teams;
  }, [matchupStarterIds, players]);

  const fetchLiveSnapshot = useCallback(async ({ quiet = false } = {}) => {
    if (!liveStatus?.session?.enabled || platform !== 'sleeper') return;
    if (!quiet) setLoadingLive(true);
    setLiveError('');
    try {
      const gamesPayload = await getLiveGames({ season, week });
      const games = Array.isArray(gamesPayload?.data) ? gamesPayload.data : [];
      setLiveGames(games);
      setCacheMeta(gamesPayload?.cache ?? null);

      const gameIds = sortRelevantGames(games, matchupTeams).map((game) => game.id).filter(Boolean);
      if (gameIds.length) {
        const statsPayload = await getLivePlayerStatsForGames(gameIds);
        const groupedStats = statsPayload?.games && typeof statsPayload.games === 'object'
          ? statsPayload.games
          : {};
        setStatsByGame(Object.fromEntries(gameIds.map((gameId) => [String(gameId), groupedStats[String(gameId)] ?? []])));
      } else {
        setStatsByGame({});
      }
      setLastUpdatedAt(new Date());
    } catch (error) {
      setLiveError(error?.message ?? 'Could not load live scoring data.');
    } finally {
      if (!quiet) setLoadingLive(false);
    }
  }, [liveStatus?.session?.enabled, matchupTeams, platform, season, week]);

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
  ), [activeScoringSettings, currentMatchup, myRosterId, players, sleeperStatsByPlayer, statIndex, week]);

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
  const matchupLeaderKey = !leftSummary || !rightSummary || leftSummary.total === rightSummary.total
    ? null
    : leftSummary.total > rightSummary.total ? 'a' : 'b';

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
      const events = buildDeltaEvents(prev, next, meta);
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
  }, [currentMatchup, sideSummaries]);

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

  // Remaining-game fraction per NFL team: live BDL game state when available,
  // otherwise the season schedule decides played (0), bye (0), or upcoming (1).
  const getTeamRemainingFraction = useCallback((teamAbbr) => {
    const team = getTeamAbbr(teamAbbr);
    if (!team || team === 'FA') return 0;
    const game = findGameForTeam(liveGames, team);
    if (game) return getRemainingGameFraction(game);
    const weekSchedule = activeScheduleMapForContext?.[week] ?? activeScheduleMapForContext?.[String(week)] ?? null;
    if (!weekSchedule) return 1;
    const entry = weekSchedule[team];
    if (!entry) return 0; // bye
    const played = Number.isFinite(Number(entry.ptsFor)) && Number.isFinite(Number(entry.ptsAgainst));
    return played ? 0 : 1;
  }, [activeScheduleMapForContext, liveGames, week]);

  const winProb = useMemo(() => {
    if (!leftSummary || !rightSummary) return null;
    const buildOutlooks = (summary) => summary.rows.map((row) => getStarterOutlook({
      current: row.points,
      position: row.player?.position,
      projection: projectionsById.get(row.id) ?? null,
      fallbackAvg: fallbackAvgById.get(row.id) ?? null,
      fraction: getTeamRemainingFraction(row.player?.team),
    }));
    return computeWinProbability(
      computeSideOutlook(buildOutlooks(leftSummary)),
      computeSideOutlook(buildOutlooks(rightSummary)),
    );
  }, [fallbackAvgById, getTeamRemainingFraction, leftSummary, projectionsById, rightSummary]);

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
      const last = current[current.length - 1];
      if (winProb.settled && last && last.p === winProb.probA) return current;
      const next = appendWinProbPoint(current, {
        t: Date.now(),
        p: winProb.probA,
        a: Math.round((leftSummary.total ?? 0) * 10) / 10,
        b: Math.round((rightSummary.total ?? 0) * 10) / 10,
      });
      if (next !== current) saveWinProbHistory(historyKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey, winProb?.probA, winProb?.settled, lastUpdatedAt]);

  const rowById = useMemo(() => {
    const map = new Map();
    sideSummaries.forEach((summary) => summary.rows.forEach((row) => map.set(row.id, { row, summary })));
    return map;
  }, [sideSummaries]);

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
    const relevant = sortRelevantGames(liveGames, matchupTeams)
      .filter((game) => mockPlays || isLiveGame(game) || isFinalGame(game))
      .slice(0, MAX_PLAYS_GAMES);

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

  const mergedFeed = useMemo(
    () => mergePlayEvents(playEvents, feedEvents),
    [feedEvents, playEvents],
  );

  const visibleFeed = useMemo(() => (
    mergedFeed.filter((event) => {
      const sideKey = playerSideKey.get(event.playerId);
      return sideKey && (feedSide === 'both' || sideKey === feedSide);
    })
  ), [feedSide, mergedFeed, playerSideKey]);

  const selectedEntry = selectedPlayerId ? rowById.get(selectedPlayerId) ?? null : null;
  const selectedEvent = selectedEventId ? mergedFeed.find((event) => event.id === selectedEventId) ?? null : null;
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

  const liveEnabled = Boolean(liveStatus?.live?.enabled);
  const sessionEnabled = Boolean(liveStatus?.session?.enabled);
  const mockPlaysEnabled = isMockPlayByPlayEnabled(liveStatus);
  const liveGameCount = liveGames.filter((game) => isLiveGame(game)).length;

  // ── Win-probability chart geometry ────────────────────────────────────────
  // Points are evenly spaced by index (ESPN-style); the curve appends a point
  // per refresh and persists per matchup, so it builds through the game day.
  const probPoints = winProbHistory.length >= 2
    ? winProbHistory
    : winProb
      ? [
          { t: Date.now() - 1000, p: winProb.probA, a: leftSummary?.total ?? 0, b: rightSummary?.total ?? 0 },
          { t: Date.now(), p: winProb.probA, a: leftSummary?.total ?? 0, b: rightSummary?.total ?? 0 },
        ]
      : [];
  const chartInnerWidth = chartWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const chartInnerHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const probXAt = (index) => CHART_PAD_LEFT + (index / Math.max(1, probPoints.length - 1)) * chartInnerWidth;
  const probYAt = (p) => CHART_PAD_TOP + (1 - Math.min(100, Math.max(0, p)) / 100) * chartInnerHeight;
  const probMidY = probYAt(50);
  const probLine = probPoints.map((point, index) => `${probXAt(index).toFixed(1)},${probYAt(point.p).toFixed(1)}`).join(' ');
  const probArea = probPoints.length
    ? `${probXAt(0).toFixed(1)},${probMidY.toFixed(1)} ${probLine} ${probXAt(probPoints.length - 1).toFixed(1)},${probMidY.toFixed(1)}`
    : '';
  const probLast = probPoints[probPoints.length - 1] ?? null;
  const activeChartIndex = chartHoverIndex == null || !probPoints.length
    ? null
    : Math.min(probPoints.length - 1, Math.max(0, chartHoverIndex));
  const chartHover = activeChartIndex == null ? null : (() => {
    const point = probPoints[activeChartIndex];
    const x = probXAt(activeChartIndex);
    return {
      index: activeChartIndex,
      point,
      x,
      y: probYAt(point.p),
      timeLabel: new Date(point.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      tooltipLeft: `${(x / chartWidth) * 100}%`,
      tooltipTransform: x < 68 ? 'translateX(0)' : x > chartWidth - 68 ? 'translateX(-100%)' : 'translateX(-50%)',
    };
  })();
  const winClipId = `wp-${currentMatchup?.matchupId ?? 'none'}`;

  const winDial = (() => {
    if (!winProb || !leftSummary || !rightSummary) return { pct: null, label: 'Team', tied: false };
    if (winProb.probA === 50) return { pct: 50, label: 'Tied', tied: true };
    const leader = winProb.probA > 50 ? leftSummary : rightSummary;
    return {
      pct: winProb.probA > 50 ? winProb.probA : 100 - winProb.probA,
      label: leader.name,
      tied: false,
    };
  })();

  const updatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const kickerText = statusError
    ? 'Live scoring unavailable'
    : !liveEnabled
      ? 'Live scoring not set up'
      : !sessionEnabled
        ? 'Live scoring ready'
        : `Live${liveGameCount > 0 ? ` · ${liveGameCount} ${liveGameCount === 1 ? 'game' : 'games'}` : ''}${updatedLabel ? ` · updated ${updatedLabel}` : ' · waiting for data'}`;

  const matchedStarters = sideSummaries.reduce((sum, summary) => sum + summary.matchedCount, 0);
  const totalStarters = sideSummaries.reduce((sum, summary) => sum + summary.rows.length, 0);

  // Feed filter labels stay single-line: "You/Opponent" for my matchup,
  // team initials elsewhere; full names live in the hero and aria-labels.
  const anySideMine = Boolean(leftSummary?.isMine || rightSummary?.isMine);
  const segmentLabel = (summary, fallback) => {
    if (!summary) return fallback;
    if (summary.isMine) return 'You';
    if (anySideMine) return 'Opponent';
    return summary.initials || summary.name;
  };

  const renderFeedRow = ({ key, item, summary }) => {
    const teamAbbr = getTeamAbbr(item.player?.team);
    const row = rowById.get(item.id)?.row ?? null;
    // Play events carry a glance frozen at play time; fall back to live state.
    const glance = item.glance ?? getPlayerGameGlance(teamAbbr, row);
    const theme = getTeamVisualTheme(teamAbbr, darkMode);
    return (
      <FeedRow
        key={key}
        item={{ ...item, isMine: summary.isMine }}
        glance={glance}
        theme={theme}
        onOpen={() => {
          setSelectedPlayerId(item.id);
          setSelectedEventId(item.source === 'play' || item.source === 'play+delta' || item.isDelta ? key : null);
        }}
      />
    );
  };

  return (
    <div className="companion-live-shell pb-6">
      <SeasonHintBanner capability="current-only" feature="Live scoring" className="mx-4 mb-3" />
      {liveGames.length > 0 && <div className="companion-live-toolbar">
        <CompanionSelectorRail label="Week" ariaLabel="Live scoring week" className="companion-live-week-rail" wrapOnDesktop={false}>
          {weekOptions.map((option) => (
            <CompanionSelectorButton
              key={option}
              size="md"
              active={week === option}
              onClick={() => setWeek(option)}
              className="companion-live-touch"
            >
              {option}
            </CompanionSelectorButton>
          ))}
        </CompanionSelectorRail>
      </div>}

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

      <div ref={gridRef} className={`companion-live-grid${selectedEntry ? ' has-sheet' : ''}`}>
        <section className="companion-live-board" aria-label="Fantasy matchup board">
          <div className="companion-live-board-head">
            <span className="companion-live-kicker">
              {sessionEnabled && <span className="companion-live-dot" aria-hidden="true" />}
              {kickerText}
            </span>
            <div className="companion-live-board-head__controls">
              <div className="companion-live-pager" aria-label="Fantasy matchup pager">
                <button
                  type="button"
                  onClick={() => setMatchupIndex((value) => Math.max(0, value - 1))}
                  disabled={matchupIndex <= 0}
                  aria-label="Previous matchup"
                >
                  ‹
                </button>
                <div className="companion-live-pager__mid">
                  <span className="sr-only">
                    {matchupPairs.length ? `Matchup ${matchupIndex + 1} of ${matchupPairs.length}` : 'No matchups'}
                  </span>
                  <div className="companion-live-pager__dots" aria-hidden="true">
                    {matchupPairs.map((pair, index) => (
                      <i
                        key={pair.matchupId}
                        className={`${index === matchupIndex ? 'is-active ' : ''}${pair.mine ? 'is-mine' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMatchupIndex((value) => Math.min(matchupPairs.length - 1, value + 1))}
                  disabled={matchupIndex >= matchupPairs.length - 1}
                  aria-label="Next matchup"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                className={`companion-live-more${showDetails ? ' is-active' : ''}`}
                onClick={() => setShowDetails((value) => !value)}
                aria-expanded={showDetails}
                aria-label="Live scoring options"
              >
                ⋯
              </button>
            </div>
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
            <div className="companion-live-empty">Loading fantasy matchups…</div>
          ) : !currentMatchup ? (
            <div className="companion-live-empty">No Sleeper matchup is available for this week.</div>
          ) : (
            <>
              <div className="companion-live-hero">
                <HeroTeam summary={leftSummary} leading={matchupLeaderKey === 'a'} />
                <div className="companion-live-win">
                  <span>Win chance</span>
                  <div className="companion-live-win__dial" style={{ '--live-win-share': `${winDial.pct ?? 50}` }}>
                    <svg viewBox="0 0 56 56" aria-hidden="true">
                      <circle cx="28" cy="28" r="23" />
                      <circle cx="28" cy="28" r="23" pathLength="100" />
                    </svg>
                    <strong>{winDial.pct == null ? '—' : formatWinChance(winDial.pct)}</strong>
                  </div>
                  <em>{winDial.label}</em>
                </div>
                <HeroTeam summary={rightSummary} leading={matchupLeaderKey === 'b'} right />
              </div>

              <div className="companion-live-chart">
                <div className="companion-live-chart__head">
                  <span>Win probability</span>
                  <em className="companion-live-chart__head-note">
                    {winProb?.settled
                      ? 'Final'
                      : winProb
                        ? `Projected final ${formatPoints(winProb.expectedA)} · ${formatPoints(winProb.expectedB)}`
                        : 'Waiting for data'}
                  </em>
                </div>
                <div
                  ref={chartPlotRef}
                  className={`companion-live-chart__plot${chartHover ? ' is-hovering' : ''}`}
                  onPointerDown={(event) => {
                    if (!isCoarsePointer) return;
                    chartScrubbingRef.current = true;
                    setChartHoverIndex(getChartSliceIndex(event, probPoints.length, chartWidth, { padX: CHART_PAD_LEFT }));
                  }}
                  onPointerMove={(event) => {
                    if (isCoarsePointer && !chartScrubbingRef.current) return;
                    setChartHoverIndex(getChartSliceIndex(event, probPoints.length, chartWidth, { padX: CHART_PAD_LEFT }));
                  }}
                  onPointerUp={() => { chartScrubbingRef.current = false; }}
                  onPointerCancel={() => {
                    chartScrubbingRef.current = false;
                    setChartHoverIndex(null);
                  }}
                  onPointerLeave={() => {
                    if (!isCoarsePointer) setChartHoverIndex(null);
                  }}
                >
                  <svg
                    className="companion-live-chart__svg"
                    viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                    role="img"
                    aria-label={`Win probability over time: ${winDial.tied ? 'tied' : `${winDial.label} ${winDial.pct == null ? '' : formatWinChance(winDial.pct)}`}`}
                  >
                    <defs>
                      <clipPath id={`${winClipId}-above`}>
                        <rect x="0" y="0" width={chartWidth} height={probMidY} />
                      </clipPath>
                      <clipPath id={`${winClipId}-below`}>
                        <rect x="0" y={probMidY} width={chartWidth} height={CHART_HEIGHT - probMidY} />
                      </clipPath>
                    </defs>
                    <line x1={CHART_PAD_LEFT} x2={chartWidth - CHART_PAD_RIGHT} y1={probMidY} y2={probMidY} className="companion-live-chart__midline" />
                    <rect x={CHART_PAD_LEFT} y={CHART_PAD_TOP - 4} width="10" height="3" rx="1.5" className="companion-live-chart__swatch" />
                    <text x={CHART_PAD_LEFT + 14} y={CHART_PAD_TOP + 2} className="companion-live-chart__wp-label">{leftSummary?.initials ?? '—'}</text>
                    <rect x={CHART_PAD_LEFT} y={CHART_HEIGHT - CHART_PAD_BOTTOM + 6} width="10" height="3" rx="1.5" className="companion-live-chart__swatch is-opponent" />
                    <text x={CHART_PAD_LEFT + 14} y={CHART_HEIGHT - CHART_PAD_BOTTOM + 12} className="companion-live-chart__wp-label">{rightSummary?.initials ?? '—'}</text>
                    <text x={chartWidth - 2} y={CHART_PAD_TOP + 2} textAnchor="end" className="companion-live-chart__tick">100</text>
                    <text x={chartWidth - 2} y={probMidY + 3} textAnchor="end" className="companion-live-chart__tick">50</text>
                    <text x={chartWidth - 2} y={CHART_HEIGHT - CHART_PAD_BOTTOM + 12} textAnchor="end" className="companion-live-chart__tick">100</text>
                    {probPoints.length > 0 && (
                      <>
                        <polygon points={probArea} className="companion-live-chart__area" clipPath={`url(#${winClipId}-above)`} />
                        <polygon points={probArea} className="companion-live-chart__area is-opponent" clipPath={`url(#${winClipId}-below)`} />
                        <polyline points={probLine} className="companion-live-chart__line is-mine" clipPath={`url(#${winClipId}-above)`} />
                        <polyline points={probLine} className="companion-live-chart__line is-opponent" clipPath={`url(#${winClipId}-below)`} />
                        {probLast && (
                          <circle
                            cx={probXAt(probPoints.length - 1)}
                            cy={probYAt(probLast.p)}
                            r="3.2"
                            className={`companion-live-chart__marker ${probLast.p >= 50 ? 'is-mine' : 'is-opponent'}`}
                          />
                        )}
                      </>
                    )}
                    {chartHover && (
                      <>
                        <line x1={chartHover.x} x2={chartHover.x} y1={CHART_PAD_TOP} y2={CHART_HEIGHT - CHART_PAD_BOTTOM} className="companion-live-chart__hover-line" />
                        <circle cx={chartHover.x} cy={chartHover.y} r="3.2" className={`companion-live-chart__marker ${chartHover.point.p >= 50 ? 'is-mine' : 'is-opponent'}`} />
                      </>
                    )}
                  </svg>
                  {chartHover && (
                    <div className="companion-live-chart__tooltip" style={{ left: chartHover.tooltipLeft, transform: chartHover.tooltipTransform }}>
                      <span>{chartHover.timeLabel}</span>
                      <div>
                        <i className="is-mine" />
                        <b>{leftSummary?.name ?? 'Left'}</b>
                        <strong>{formatWinChance(chartHover.point.p)}</strong>
                      </div>
                      <div>
                        <i className="is-opponent" />
                        <b>{rightSummary?.name ?? 'Right'}</b>
                        <strong>{formatWinChance(100 - chartHover.point.p)}</strong>
                      </div>
                      <em>{formatPoints(chartHover.point.a)} · {formatPoints(chartHover.point.b)} at the time</em>
                    </div>
                  )}
                </div>
              </div>

              <div className="companion-live-filter">
                <span>Showing</span>
                <div className="companion-live-segment companion-live-team-segment" role="group" aria-label="Feed side filter">
                  <button
                    type="button"
                    className={feedSide === 'a' ? 'is-active' : ''}
                    onClick={() => setFeedSide('a')}
                    disabled={!leftSummary}
                    aria-label={leftSummary?.name ?? 'Team A'}
                  >
                    {segmentLabel(leftSummary, 'Team A')}
                  </button>
                  <button type="button" className={feedSide === 'both' ? 'is-active' : ''} onClick={() => setFeedSide('both')}>
                    Both
                  </button>
                  <button
                    type="button"
                    className={feedSide === 'b' ? 'is-active is-opponent' : ''}
                    onClick={() => setFeedSide('b')}
                    disabled={!rightSummary}
                    aria-label={rightSummary?.name ?? 'Team B'}
                  >
                    {segmentLabel(rightSummary, 'Team B')}
                  </button>
                </div>
              </div>

              <div className="companion-live-feed">
                <div className="companion-live-feed__section">
                  {mockPlaysEnabled ? 'Mock plays · fantasy impact' : 'Plays · fantasy impact'}
                </div>
                {visibleFeed.length ? visibleFeed.map((event) => {
                  const entry = rowById.get(event.playerId);
                  if (!entry) return null;
                  return renderFeedRow({
                    key: event.id,
                    item: {
                      id: event.playerId,
                      player: entry.row.player,
                      kind: event.kind,
                      desc: event.desc,
                      pts: event.pts,
                      isDelta: true,
                      glance: event.glance ?? null,
                    },
                    summary: entry.summary,
                  });
                }) : (
                  <div className="companion-live-empty">
                    {!sessionEnabled
                      ? 'Turn on Live to see plays and their fantasy impact.'
                      : mockPlaysEnabled
                        ? 'Mock plays appear after the live snapshot loads.'
                        : liveGames.length
                        ? 'No plays for these starters yet.'
                        : 'Play-by-play is not available for this week.'}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {selectedEntry && (
          <aside className="companion-live-rail" aria-label="Player breakdown">
            <CompanionLivePlayerSheet
              row={selectedEntry.row}
              glance={getPlayerGameGlance(getTeamAbbr(selectedEntry.row.player?.team), selectedEntry.row)}
              events={mergedFeed}
              scoringSettings={activeScoringSettings}
              teamName={selectedEntry.summary.name}
              isMine={selectedEntry.summary.isMine}
              liveActive={sessionEnabled}
              selectedEvent={selectedEvent}
              onClose={() => {
                setSelectedPlayerId(null);
                setSelectedEventId(null);
              }}
              onSelectEvent={(event) => {
                setSelectedPlayerId(event.playerId);
                setSelectedEventId(event.id);
              }}
              onViewPlayer={onViewPlayer}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
