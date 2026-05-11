import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getWeeklyStats } from '../api/sleeperApi';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { useTheme } from '../context/ThemeContext';
import { getNflTeamLogoUrl } from '../utils/companionAssetVisuals';
import { fetchSeasonSchedule } from '../utils/playerApi';
import { buildDefenseTable } from '../utils/projectionEngine';
import { calcPoints, DEFAULT_SCORING, STAT_TO_SCORING_KEY } from '../utils/scoringEngine';
import { getTeamVisualTheme } from '../utils/teamVisualTheme';
import Modal from './Modal';

const POINT_EPSILON = 0.005;
const CHART_HEIGHT = 340;
const CHART_MARGINS = { top: 38, right: 64, bottom: 64, left: 64 };
const MOBILE_CHART_HEIGHT = 300;
const MOBILE_CHART_MARGINS = { top: 34, right: 42, bottom: 50, left: 42 };
const LINE_MORPH_DURATION_MS = 380;
const WEEKLY_FETCH_TIMEOUT_MS = 6500;
const SHARED_AXIS_RANGE_RATIO = 1.5;

const STAT_LABELS = {
  pass_yd: 'Pass Yards',
  pass_td: 'Pass TD',
  pass_int: 'Interceptions',
  pass_sack: 'Sacks Taken',
  rush_att: 'Carries',
  rush_yd: 'Rush Yards',
  rush_td: 'Rush TD',
  rec: 'Receptions',
  rec_yd: 'Rec Yards',
  rec_td: 'Rec TD',
  fum: 'Fumbles',
  fum_lost: 'Fumbles Lost',
  fgm: 'FG Made',
  xpm: 'XP Made',
  sack: 'Sacks',
  int: 'Interceptions',
  idp_tkl: 'Tackles',
  idp_tkl_solo: 'Solo Tackles',
  idp_sack: 'Sacks',
  idp_int: 'Interceptions',
  idp_pd: 'Pass Deflections',
};

const STAT_OPTIONS_BY_POSITION = {
  QB: ['pass_yd', 'pass_td', 'pass_int', 'pass_sack', 'rush_yd', 'rush_td', 'fum', 'fum_lost'],
  RB: ['rush_att', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fum', 'fum_lost'],
  WR: ['rec', 'rec_yd', 'rec_td', 'rush_yd', 'fum', 'fum_lost'],
  TE: ['rec', 'rec_yd', 'rec_td', 'fum', 'fum_lost'],
  K: ['fgm', 'xpm'],
  DEF: ['sack', 'int', 'def_td', 'pts_allow'],
  DL: ['idp_tkl', 'idp_tkl_solo', 'idp_sack', 'idp_pd'],
  LB: ['idp_tkl', 'idp_tkl_solo', 'idp_sack', 'idp_int'],
  DB: ['idp_tkl', 'idp_tkl_solo', 'idp_int', 'idp_pd'],
};

function getPositionGroup(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (['DE', 'DT'].includes(normalized)) return 'DL';
  if (['ILB', 'OLB'].includes(normalized)) return 'LB';
  if (['CB', 'S', 'SS', 'FS'].includes(normalized)) return 'DB';
  if (['DST', 'DEF'].includes(normalized)) return 'DEF';
  return normalized;
}

const CHART_COLORS = {
  stat: 'var(--color-accent)',
  defense: 'var(--color-label-secondary)',
  context: 'var(--color-label-tertiary)',
};

const METRIC_MODES = {
  GAME: 'game',
  FANTASY: 'fantasy',
};

const METRIC_MODE_OPTIONS = [
  { id: METRIC_MODES.GAME, label: 'Game Stats' },
  { id: METRIC_MODES.FANTASY, label: 'Fantasy Points' },
];

const SCALE_MODES = {
  LINEAR: 'linear',
  LOG: 'log',
  SQRT: 'sqrt',
};

const SCALE_MODE_OPTIONS = [
  { id: SCALE_MODES.LINEAR, label: 'Linear' },
  { id: SCALE_MODES.LOG, label: 'Log' },
  { id: SCALE_MODES.SQRT, label: 'Sqrt' },
];

function useElementWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    if (!node) return undefined;
    const measure = () => setWidth(Math.max(320, Math.round(node.getBoundingClientRect().width || 720)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [node]);

  return [setNode, width];
}

function getStatFantasyMultiplier(statKey, scoringSettings, position) {
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };
  const baseKey = STAT_TO_SCORING_KEY[statKey] ?? statKey;
  let multiplier = Number(settings[baseKey] ?? 0);

  if (statKey === 'rec') {
    if (position === 'TE') multiplier += Number(settings.bonus_rec_te ?? 0);
    if (position === 'RB') multiplier += Number(settings.bonus_rec_rb ?? 0);
    if (position === 'WR') multiplier += Number(settings.bonus_rec_wr ?? 0);
  }
  if (statKey === 'rush_att' && position === 'RB') multiplier += Number(settings.bonus_rush_att ?? 0);

  return Number.isFinite(multiplier) ? multiplier : 0;
}

function statFantasyPoints(weekEntry, statKey, scoringSettings, position) {
  const raw = Number(weekEntry?.[statKey] ?? 0);
  if (!Number.isFinite(raw) || Math.abs(raw) < POINT_EPSILON) return 0;
  const multiplier = getStatFantasyMultiplier(statKey, scoringSettings, position);

  return Math.round(raw * multiplier * 100) / 100;
}

function scaleLinear(value, domainMin, domainMax, rangeMin, rangeMax) {
  if (domainMax === domainMin) return rangeMax;
  const ratio = (value - domainMin) / (domainMax - domainMin);
  return rangeMax - ratio * (rangeMax - rangeMin);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function transformScaleValue(value, scaleMode) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (scaleMode === SCALE_MODES.LOG) return Math.sign(numeric) * Math.log10(Math.abs(numeric) + 1);
  if (scaleMode === SCALE_MODES.SQRT) return Math.sign(numeric) * Math.sqrt(Math.abs(numeric));
  return numeric;
}

function scaleChartValue(value, domainMin, domainMax, rangeMin, rangeMax, scaleMode) {
  return scaleLinear(
    transformScaleValue(value, scaleMode),
    transformScaleValue(domainMin, scaleMode),
    transformScaleValue(domainMax, scaleMode),
    rangeMin,
    rangeMax,
  );
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function buildPath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function normalizePointSeries(points, targetLength) {
  return Array.from({ length: targetLength }, (_, index) => points[index] ?? points[points.length - 1] ?? { x: 0, y: 0 });
}

function interpolatePointSeries(fromPoints, toPoints, progress) {
  const normalizedFrom = normalizePointSeries(fromPoints, toPoints.length);
  return toPoints.map((point, index) => {
    const from = normalizedFrom[index];
    return {
      x: from.x + (point.x - from.x) * progress,
      y: from.y + (point.y - from.y) * progress,
    };
  });
}

function useAnimatedLinePoints(targetPoints, animationKey) {
  const [points, setPoints] = useState(targetPoints);
  const pointsRef = useRef(targetPoints);

  useEffect(() => {
    if (!targetPoints.length) {
      pointsRef.current = targetPoints;
      const frame = window.requestAnimationFrame(() => setPoints(targetPoints));
      return () => window.cancelAnimationFrame(frame);
    }

    const fromPoints = pointsRef.current.length
      ? pointsRef.current
      : targetPoints;
    const start = window.performance?.now?.() ?? Date.now();
    let frame = 0;

    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / LINE_MORPH_DURATION_MS);
      const eased = easeOutCubic(progress);
      const next = interpolatePointSeries(fromPoints, targetPoints, eased);
      pointsRef.current = next;
      setPoints(next);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [animationKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return points;
}

function estimateLabelWidth(text, fontSize = 10) {
  return Math.max(fontSize * 1.8, String(text ?? '').length * fontSize * 0.6 + fontSize * 0.8);
}

function rectsOverlap(left, right) {
  return !(
    left.x2 < right.x1
    || left.x1 > right.x2
    || left.y2 < right.y1
    || left.y1 > right.y2
  );
}

function buildLabelRect(label, y, fontSize = 10) {
  const width = estimateLabelWidth(label.text, fontSize);
  const height = fontSize * 1.2;
  return {
    x1: label.x - width / 2,
    x2: label.x + width / 2,
    y1: y - height + 2,
    y2: y + 2,
  };
}

function placeChartLabels(candidates, { minY, maxY, fontSize = 10 }) {
  const placed = [];
  const step = fontSize * 1.2;
  const offsets = [0, -step, step, -step * 2, step * 2, -step * 3, step * 3];

  return [...candidates]
    .sort((left, right) => left.priority - right.priority)
    .map((candidate) => {
      const text = candidate.text;
      for (const offset of offsets) {
        const y = Math.max(minY, Math.min(maxY, candidate.y + offset));
        const rect = buildLabelRect({ ...candidate, text }, y, fontSize);
        if (!placed.some((item) => rectsOverlap(rect, item.rect))) {
          placed.push({ rect });
          return { ...candidate, y, text, hidden: false };
        }
      }
      return { ...candidate, text, hidden: true };
    })
    .sort((left, right) => left.order - right.order);
}

function formatChartValue(value, decimals = 0) {
  if (value == null) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  const precision = Math.abs(numeric % 1) > POINT_EPSILON ? decimals : 0;
  return numeric.toFixed(precision);
}

function averageValues(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function getDefenseAverageAllowed(defenseTable, opponent, position, week) {
  const weekData = defenseTable?.[opponent?.toUpperCase?.()]?.[getPositionGroup(position)] ?? {};
  const entries = Object.entries(weekData)
    .map(([weekKey, value]) => ({ week: Number(weekKey), value: Number(value) }))
    .filter((entry) => Number.isFinite(entry.week) && Number.isFinite(entry.value));
  const prior = entries.filter((entry) => entry.week < week).map((entry) => entry.value);
  if (prior.length) return averageValues(prior);
  const seasonContext = entries.filter((entry) => entry.week !== week).map((entry) => entry.value);
  if (seasonContext.length) return averageValues(seasonContext);
  return averageValues(entries.map((entry) => entry.value));
}

function getAxisStep(minValue, maxValue) {
  const magnitude = Math.max(Math.abs(Number(minValue) || 0), Math.abs(Number(maxValue) || 0));
  if (magnitude > 1000) return 1000;
  if (magnitude > 100) return 100;
  if (magnitude > 10) return 10;
  if (magnitude > 1) return 1;
  return 0.1;
}

function roundAxisBoundary(value, direction = 'nearest', step = 10) {
  const numeric = Number.isFinite(value) ? value : 0;
  const interval = Number.isFinite(step) && step > 0 ? step : 10;
  if (direction === 'up') return Math.ceil(numeric / interval) * interval;
  if (direction === 'down') return Math.floor(numeric / interval) * interval;
  return Math.round(numeric / interval) * interval;
}

function buildAxisTicks(minValue, maxValue, step = getAxisStep(minValue, maxValue)) {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : 1;
  const top = roundAxisBoundary(max, 'up', step);
  const bottom = min < 0 ? roundAxisBoundary(min, 'down', step) : 0;
  const ticks = [top];
  if (bottom < 0 && top > 0) ticks.push(0);
  ticks.push(bottom);
  return [...new Set(ticks)];
}

function padDomain(minValue, maxValue, paddingRatio = 0.1, step = getAxisStep(minValue, maxValue)) {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : 1;
  const range = Math.max(1, Math.abs(max - min));
  const paddedMin = min < 0 ? min - range * paddingRatio : 0;
  const paddedMax = max + range * paddingRatio;
  return [
    min < 0 ? roundAxisBoundary(paddedMin, 'down', step) : 0,
    roundAxisBoundary(paddedMax, 'up', step),
  ];
}

function centerZeroDomain(domainMin, domainMax, step = getAxisStep(domainMin, domainMax)) {
  const maxAbs = Math.max(Math.abs(domainMin), Math.abs(domainMax), step);
  const boundary = roundAxisBoundary(maxAbs, 'up', step);
  return [-boundary, boundary];
}

function negativeOnlyDomain(minValue, step = getAxisStep(minValue, 0), paddingRatio = 0.08) {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const range = Math.max(1, Math.abs(min));
  return [roundAxisBoundary(min - range * paddingRatio, 'down', step), 0];
}

function domainRange(domainMin, domainMax) {
  return Math.max(0, domainMax - domainMin);
}

function rangesAreClose(leftRange, rightRange, ratio = SHARED_AXIS_RANGE_RATIO) {
  const minRange = Math.min(leftRange, rightRange);
  const maxRange = Math.max(leftRange, rightRange);
  return minRange > 0 && maxRange / minRange <= ratio;
}

function getMetricValue(weekEntry, statKey, scoringSettings, position, mode) {
  if (mode === METRIC_MODES.FANTASY) {
    return statFantasyPoints(weekEntry, statKey, scoringSettings, position);
  }
  const raw = Number(weekEntry?.[statKey] ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function getMetricModeLabel(mode, statLabel) {
  return mode === METRIC_MODES.FANTASY ? `${statLabel} Pts` : statLabel;
}

function getPlayerDisplayName(player, fallback = 'Player') {
  const fullName = player?.full_name
    || player?.displayName
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ').trim();
  return fullName || fallback;
}

function getWeekMatchup(weekEntry, playerTeam, scheduleMap) {
  const week = Number(weekEntry?.week);
  const team = weekEntry?.team?.toUpperCase?.() ?? playerTeam?.toUpperCase?.() ?? null;
  const directOpp = weekEntry?.opp?.toUpperCase?.() ?? null;
  const scheduleEntry = team ? scheduleMap?.[week]?.[team] : null;
  const opponent = directOpp ?? scheduleEntry?.opp?.toUpperCase?.() ?? null;
  const home = typeof weekEntry?.home === 'boolean'
    ? weekEntry.home
    : typeof scheduleEntry?.home === 'boolean'
      ? scheduleEntry.home
      : null;

  return {
    opponent,
    locationPrefix: home === false ? '@' : 'vs',
  };
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Weekly stats request timed out.')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function getVisualSeasonWeeklyStats(season, totalWeeks = 18) {
  const byPlayer = {};
  const weeks = Array.from({ length: totalWeeks }, (_, index) => index + 1);

  await Promise.allSettled(
    weeks.map(async (week) => {
      const statsMap = await withTimeout(getWeeklyStats(season, week), WEEKLY_FETCH_TIMEOUT_MS);
      if (!statsMap) return;
      for (const [playerId, stats] of Object.entries(statsMap)) {
        if (!byPlayer[playerId]) byPlayer[playerId] = [];
        byPlayer[playerId].push({ week, ...stats });
      }
    }),
  );

  return byPlayer;
}

const PlayerStatsVisual = ({
  sleeperId,
  position,
  playerTeam,
  initialSeason,
  seasonOptions = [],
  fantasyScoringByYear = {},
}) => {
  const { hasLeague, activeScoringSettings, season } = useSleeperLeague();
  const {
    weeklyStats,
    players,
    scheduleMap,
    statsLoading,
    loadSeasonStats,
  } = useSleeperStats();
  const chartInstanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const colors = CHART_COLORS;
  const { darkMode } = useTheme();
  const [containerRef, chartWidth] = useElementWidth();
  const statOptions = useMemo(() => {
    const group = getPositionGroup(position);
    return STAT_OPTIONS_BY_POSITION[group] ?? STAT_OPTIONS_BY_POSITION.WR;
  }, [position]);
  const [selectedStat, setSelectedStat] = useState(statOptions[0]);
  const normalizedSeasonOptions = useMemo(
    () => (seasonOptions.length ? seasonOptions : [String(season)]).map((item) => String(item)),
    [season, seasonOptions],
  );
  const defaultSelectedSeason = normalizedSeasonOptions.includes(String(initialSeason))
    ? String(initialSeason)
    : normalizedSeasonOptions[0];
  const [selectedSeason, setSelectedSeason] = useState(defaultSelectedSeason);
  const [offenseMode, setOffenseMode] = useState(METRIC_MODES.GAME);
  const [defenseMode, setDefenseMode] = useState(METRIC_MODES.GAME);
  const activeSelectedStat = statOptions.includes(selectedStat) ? selectedStat : statOptions[0];
  const selectedSeasonKey = normalizedSeasonOptions.includes(selectedSeason)
    ? selectedSeason
    : defaultSelectedSeason;
  const selectedScoringSettings = fantasyScoringByYear[selectedSeasonKey] ?? null;
  const canUseFantasyForSeason = Boolean(selectedScoringSettings);
  const scoringSettings = selectedScoringSettings ?? activeScoringSettings ?? DEFAULT_SCORING;
  const canUseFantasyForSelectedStat = canUseFantasyForSeason
    && Math.abs(getStatFantasyMultiplier(activeSelectedStat, scoringSettings, position)) > POINT_EPSILON;
  const activeOffenseMode = canUseFantasyForSelectedStat ? offenseMode : METRIC_MODES.GAME;
  const activeDefenseMode = canUseFantasyForSelectedStat ? defenseMode : METRIC_MODES.GAME;
  const [weeklyStatsBySeason, setWeeklyStatsBySeason] = useState({});
  const [weeklyStatsLoadingBySeason, setWeeklyStatsLoadingBySeason] = useState({});
  const [scheduleMapBySeason, setScheduleMapBySeason] = useState({});
  const [scheduleLoadingBySeason, setScheduleLoadingBySeason] = useState({});
  const historicalStatsRequestsRef = useRef(new Set());
  const historicalScheduleRequestsRef = useRef(new Set());
  const mountedRef = useRef(false);
  const [hoveredWeek, setHoveredWeek] = useState(null);
  const [tappedWeek, setTappedWeek] = useState(null);
  const [scaleMode, setScaleMode] = useState(SCALE_MODES.LINEAR);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasLeague && selectedSeasonKey === String(season) && !weeklyStats && !statsLoading) loadSeasonStats?.();
  }, [hasLeague, loadSeasonStats, season, selectedSeasonKey, statsLoading, weeklyStats]);

  useEffect(() => {
    if (!hasLeague || !selectedSeasonKey || selectedSeasonKey === String(season)) return undefined;
    if (weeklyStatsBySeason[selectedSeasonKey] !== undefined || historicalStatsRequestsRef.current.has(selectedSeasonKey)) return undefined;

    const seasonToLoad = selectedSeasonKey;
    historicalStatsRequestsRef.current.add(seasonToLoad);
    setWeeklyStatsLoadingBySeason((prev) => ({ ...prev, [seasonToLoad]: true }));

    const loadHistoricalStats = async () => {
      try {
        const data = await getVisualSeasonWeeklyStats(seasonToLoad, 18);
        if (!mountedRef.current) return;
        setWeeklyStatsBySeason((prev) => ({ ...prev, [seasonToLoad]: data ?? {} }));
      } catch {
        if (!mountedRef.current) return;
        setWeeklyStatsBySeason((prev) => ({ ...prev, [seasonToLoad]: {} }));
      } finally {
        historicalStatsRequestsRef.current.delete(seasonToLoad);
        if (mountedRef.current) setWeeklyStatsLoadingBySeason((prev) => ({ ...prev, [seasonToLoad]: false }));
      }
    };

    void loadHistoricalStats();
    return undefined;
  }, [hasLeague, season, selectedSeasonKey, weeklyStatsBySeason]);

  useEffect(() => {
    if (!hasLeague || !selectedSeasonKey || selectedSeasonKey === String(season)) return undefined;
    if (scheduleMapBySeason[selectedSeasonKey] !== undefined || historicalScheduleRequestsRef.current.has(selectedSeasonKey)) return undefined;

    const seasonToLoad = selectedSeasonKey;
    historicalScheduleRequestsRef.current.add(seasonToLoad);
    setScheduleLoadingBySeason((prev) => ({ ...prev, [seasonToLoad]: true }));

    const loadHistoricalSchedule = async () => {
      try {
        const data = await fetchSeasonSchedule(seasonToLoad);
        if (!mountedRef.current) return;
        setScheduleMapBySeason((prev) => ({ ...prev, [seasonToLoad]: data ?? null }));
      } catch {
        if (!mountedRef.current) return;
        setScheduleMapBySeason((prev) => ({ ...prev, [seasonToLoad]: null }));
      } finally {
        historicalScheduleRequestsRef.current.delete(seasonToLoad);
        if (mountedRef.current) setScheduleLoadingBySeason((prev) => ({ ...prev, [seasonToLoad]: false }));
      }
    };

    void loadHistoricalSchedule();
    return undefined;
  }, [hasLeague, scheduleMapBySeason, season, selectedSeasonKey]);

  const selectedWeeklyStats = selectedSeasonKey === String(season)
    ? weeklyStats
    : weeklyStatsBySeason[selectedSeasonKey];
  const selectedScheduleMap = selectedSeasonKey === String(season)
    ? scheduleMap
    : scheduleMapBySeason[selectedSeasonKey];
  const selectedStatsLoading = selectedSeasonKey === String(season)
    ? statsLoading
    : Boolean(weeklyStatsLoadingBySeason[selectedSeasonKey] || scheduleLoadingBySeason[selectedSeasonKey]);
  const playerName = useMemo(
    () => getPlayerDisplayName(players?.[sleeperId]),
    [players, sleeperId],
  );

  const rows = useMemo(() => {
    const playerWeeks = [...(selectedWeeklyStats?.[sleeperId] ?? [])]
      .filter((entry) => Number.isFinite(Number(entry.week)))
      .sort((left, right) => Number(left.week) - Number(right.week));
    if (!playerWeeks.length) return [];

    const defenseTable = buildDefenseTable(
      selectedWeeklyStats,
      players,
      selectedScheduleMap,
      scoringSettings,
      (entry, entryPosition) => getMetricValue(entry, activeSelectedStat, scoringSettings, entryPosition, activeDefenseMode),
    );

    return playerWeeks.map((entry) => {
      const week = Number(entry.week);
      const { opponent, locationPrefix } = getWeekMatchup(entry, playerTeam, selectedScheduleMap);
      const rawValue = Number(entry?.[activeSelectedStat] ?? 0);
      const fantasyValue = statFantasyPoints(entry, activeSelectedStat, scoringSettings, position);
      const offenseValue = getMetricValue(entry, activeSelectedStat, scoringSettings, position, activeOffenseMode);
      const totalFantasyValue = canUseFantasyForSeason ? calcPoints(entry, scoringSettings, position) : null;
      const contextValue = opponent ? getDefenseAverageAllowed(defenseTable, opponent, position, week) : 0;
      const opponentTheme = opponent ? getTeamVisualTheme(opponent, darkMode, { middleStop: false }) : null;
      const opponentLogo = getNflTeamLogoUrl(opponentTheme?.logoKey ?? opponent?.toLowerCase?.());

      return {
        week,
        opponent,
        locationPrefix,
        opponentColor: opponentTheme?.accentColor ?? opponentTheme?.primary ?? colors.context,
        opponentGradientStops: opponentTheme?.gradientStart && opponentTheme?.gradientEnd
          ? {
            start: opponentTheme.gradientStart,
            mid: opponentTheme.gradientMid,
            end: opponentTheme.gradientEnd,
          }
          : null,
        opponentLogo,
        rawValue: Number.isFinite(rawValue) ? rawValue : 0,
        fantasyValue,
        totalFantasyValue,
        statBreakdown: statOptions.map((statKey) => ({
          key: statKey,
          label: STAT_LABELS[statKey] ?? statKey,
          rawValue: Number(entry?.[statKey] ?? 0),
          fantasyValue: statFantasyPoints(entry, statKey, scoringSettings, position),
          hasFantasyScoring: canUseFantasyForSeason
            && Math.abs(getStatFantasyMultiplier(statKey, scoringSettings, position)) > POINT_EPSILON,
        })),
        offenseValue,
        contextValue: Number.isFinite(contextValue) ? contextValue : 0,
      };
    });
  }, [activeDefenseMode, activeOffenseMode, activeSelectedStat, canUseFantasyForSeason, colors.context, darkMode, players, playerTeam, position, scoringSettings, selectedScheduleMap, selectedWeeklyStats, sleeperId, statOptions]);

  const statLabel = STAT_LABELS[activeSelectedStat] ?? activeSelectedStat;
  const positionGroupLabel = getPositionGroup(position) || 'Position';
  const offenseAxisLabel = getMetricModeLabel(activeOffenseMode, statLabel);
  const defenseAxisLabel = getMetricModeLabel(activeDefenseMode, statLabel);
  const offenseCardLabel = activeOffenseMode === METRIC_MODES.FANTASY
    ? `Fantasy Points From ${statLabel}`
    : statLabel;
  const defenseCardLabel = activeDefenseMode === METRIC_MODES.FANTASY
    ? `Avg Fantasy Points From ${statLabel} To ${positionGroupLabel}`
    : `Avg ${statLabel} To ${positionGroupLabel}`;
  const isCompactChart = chartWidth < 640;
  const chartHeight = isCompactChart ? MOBILE_CHART_HEIGHT : CHART_HEIGHT;
  const chartMargins = isCompactChart ? MOBILE_CHART_MARGINS : CHART_MARGINS;
  const plotWidth = Math.max(1, chartWidth - chartMargins.left - chartMargins.right);
  const plotHeight = chartHeight - chartMargins.top - chartMargins.bottom;
  const offenseValues = rows.map((row) => row.offenseValue);
  const defenseValues = rows.map((row) => row.contextValue);
  const minOffense = Math.min(0, ...offenseValues);
  const maxOffense = Math.max(1, ...offenseValues);
  const minDefense = Math.min(0, ...defenseValues);
  const maxDefense = Math.max(1, ...defenseValues);
  const actualMaxOffense = Math.max(0, ...offenseValues);
  const actualMaxDefense = Math.max(0, ...defenseValues);
  const offenseAxisStep = getAxisStep(minOffense, maxOffense);
  const defenseAxisStep = getAxisStep(minDefense, maxDefense);
  const [paddedOffenseDomainMin, paddedOffenseDomainMax] = padDomain(minOffense, maxOffense, 0.08, offenseAxisStep);
  const [paddedDefenseDomainMin, paddedDefenseDomainMax] = padDomain(minDefense, maxDefense, 0.08, defenseAxisStep);
  const shouldAlignZero = minOffense < 0 || minDefense < 0;
  const shouldUseNegativeOnlyDomain = shouldAlignZero && actualMaxOffense <= 0 && actualMaxDefense <= 0;
  const [alignedOffenseDomainMin, alignedOffenseDomainMax] = shouldAlignZero
    ? shouldUseNegativeOnlyDomain
      ? negativeOnlyDomain(minOffense, offenseAxisStep)
      : centerZeroDomain(paddedOffenseDomainMin, paddedOffenseDomainMax, offenseAxisStep)
    : [paddedOffenseDomainMin, paddedOffenseDomainMax];
  const [alignedDefenseDomainMin, alignedDefenseDomainMax] = shouldAlignZero
    ? shouldUseNegativeOnlyDomain
      ? negativeOnlyDomain(minDefense, defenseAxisStep)
      : centerZeroDomain(paddedDefenseDomainMin, paddedDefenseDomainMax, defenseAxisStep)
    : [paddedDefenseDomainMin, paddedDefenseDomainMax];
  const offenseRange = domainRange(alignedOffenseDomainMin, alignedOffenseDomainMax);
  const defenseRange = domainRange(alignedDefenseDomainMin, alignedDefenseDomainMax);
  const shouldShareAxisRange = rangesAreClose(offenseRange, defenseRange);
  const [offenseDomainMin, offenseDomainMax] = shouldShareAxisRange
    ? [
      Math.min(alignedOffenseDomainMin, alignedDefenseDomainMin),
      Math.max(alignedOffenseDomainMax, alignedDefenseDomainMax),
    ]
    : [alignedOffenseDomainMin, alignedOffenseDomainMax];
  const [defenseDomainMin, defenseDomainMax] = shouldShareAxisRange
    ? [offenseDomainMin, offenseDomainMax]
    : [alignedDefenseDomainMin, alignedDefenseDomainMax];
  const visualScale = isCompactChart
    ? clampNumber(chartWidth / 390, 0.88, 1.06)
    : clampNumber(chartWidth / 960, 1, 1.75);
  const dataXInset = Math.min(plotWidth * 0.12, Math.max(14, 24 * visualScale));
  const dataPlotWidth = Math.max(1, plotWidth - dataXInset * 2);
  const step = rows.length > 1 ? dataPlotWidth / (rows.length - 1) : dataPlotWidth;
  const barWidth = clampNumber(
    dataPlotWidth / Math.max(1, rows.length) * 0.38,
    8 * visualScale,
    22 * visualScale,
  );
  const logoSize = clampNumber(step * 0.3, 12 * visualScale, 20 * visualScale);
  const labelFontSize = Math.round(10 * visualScale);
  const axisFontSize = Math.round(11 * visualScale);
  const opponentTextFontSize = Math.round(9 * visualScale);
  const lineStrokeWidth = 2.75 * visualScale;
  const pointRadius = 3.5 * visualScale;
  const pointStrokeWidth = 2 * visualScale;
  const barRadius = 3 * visualScale;
  const logoY = chartMargins.top + plotHeight + Math.max(6, (chartMargins.bottom - logoSize) / 2);
  const opponentTextY = chartMargins.top + plotHeight + Math.max(opponentTextFontSize + 4, chartMargins.bottom * 0.62);
  const offenseLine = rows.map((row, index) => ({
    x: chartMargins.left + dataXInset + (rows.length > 1 ? index * step : dataPlotWidth / 2),
    y: chartMargins.top + scaleChartValue(row.offenseValue, offenseDomainMin, offenseDomainMax, 0, plotHeight, scaleMode),
  }));
  const lineAnimationKey = [
    chartWidth,
    scaleMode,
    activeSelectedStat,
    activeOffenseMode,
    activeDefenseMode,
    selectedSeasonKey,
    offenseDomainMin,
    offenseDomainMax,
    defenseDomainMin,
    defenseDomainMax,
    rows.map((row) => `${row.week}:${row.offenseValue}`).join('|'),
  ].join(':');
  const animatedOffenseLine = useAnimatedLinePoints(offenseLine, lineAnimationKey);
  const labelCandidates = rows.flatMap((row, index) => {
    const x = chartMargins.left + dataXInset + (rows.length > 1 ? index * step : dataPlotWidth / 2);
    const barY = chartMargins.top + scaleChartValue(row.contextValue, defenseDomainMin, defenseDomainMax, 0, plotHeight, scaleMode);
    const baseOrder = index * 2;
    return [
      {
        id: `bar-${row.week}`,
        order: baseOrder,
        priority: 1,
        x,
        y: Math.max(chartMargins.top + labelFontSize + 1, barY - labelFontSize * 0.6),
        text: formatChartValue(row.contextValue, 1),
        fill: 'var(--color-label-secondary)',
      },
      {
        id: `offense-${row.week}`,
        order: baseOrder + 1,
        priority: 0,
        x: animatedOffenseLine[index]?.x ?? offenseLine[index].x,
        y: Math.min(chartMargins.top + plotHeight - labelFontSize * 0.5, (animatedOffenseLine[index]?.y ?? offenseLine[index].y) + labelFontSize * 1.6),
        text: formatChartValue(row.offenseValue, 1),
        fill: colors.stat,
      },
    ];
  });
  const chartLabels = placeChartLabels(labelCandidates, {
    minY: chartMargins.top + labelFontSize + 1,
    maxY: chartMargins.top + plotHeight - labelFontSize * 0.4,
    fontSize: labelFontSize,
  });
  const offenseTicks = buildAxisTicks(offenseDomainMin, offenseDomainMax, offenseAxisStep);
  const defenseTicks = buildAxisTicks(defenseDomainMin, defenseDomainMax, defenseAxisStep);
  const leftAxisX = chartMargins.left - 10;
  const rightAxisX = chartWidth - chartMargins.right + 10;
  const showChartLoading = selectedStatsLoading && !selectedWeeklyStats;
  const showNoData = !showChartLoading && !rows.length;
  const showChart = !showChartLoading && rows.length > 0;

  if (!hasLeague) {
    return (
      <div className="rounded-xl p-5 text-sm" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)', color: 'var(--color-label-secondary)' }}>
        Connect a Sleeper league to unlock weekly stat visualization.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)' }}
      >
        <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <div className="flex w-full min-w-0 flex-col items-start gap-2 sm:flex-1">
            <div className="flex flex-wrap justify-start gap-2">
              {normalizedSeasonOptions.map((seasonOption) => {
                const selected = selectedSeasonKey === seasonOption;
                return (
                  <button
                    key={seasonOption}
                    type="button"
                    onClick={() => setSelectedSeason(seasonOption)}
                    className="rounded-md px-2.5 py-1 text-xs font-bold transition-colors"
                    style={{
                      background: selected ? 'var(--color-accent)' : 'var(--color-fill)',
                      color: selected ? '#FFFFFF' : 'var(--color-label-secondary)',
                    }}
                    aria-pressed={selected}
                  >
                    {seasonOption}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              {statOptions.map((statKey) => {
                const selected = activeSelectedStat === statKey;
                return (
                  <button
                    key={statKey}
                    type="button"
                    onClick={() => setSelectedStat(statKey)}
                    className="rounded-md px-2.5 py-1 text-xs font-bold transition-colors"
                    style={{
                      background: selected ? 'var(--color-signature)' : 'var(--color-fill)',
                      color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                    }}
                    aria-pressed={selected}
                  >
                    {STAT_LABELS[statKey] ?? statKey}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              <MetricModeToggle
                label="Offense"
                value={activeOffenseMode}
                onChange={setOffenseMode}
                fantasyDisabled={!canUseFantasyForSelectedStat}
              />
              <MetricModeToggle
                label="Defense"
                value={activeDefenseMode}
                onChange={setDefenseMode}
                fantasyDisabled={!canUseFantasyForSelectedStat}
              />
            </div>
            {!canUseFantasyForSeason && (
              <div className="text-left text-[11px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
                Fantasy scoring unavailable for {selectedSeasonKey}
              </div>
            )}
            {canUseFantasyForSeason && !canUseFantasyForSelectedStat && (
              <div className="text-left text-[11px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
                Fantasy scoring unavailable for {statLabel}
              </div>
            )}
          </div>
          <div className="flex w-full shrink-0 justify-start sm:w-auto sm:justify-end">
            <ChartScaleToggle value={scaleMode} onChange={setScaleMode} />
          </div>
        </div>

        <div
          ref={containerRef}
          className="player-stats-visual-chart relative overflow-hidden rounded-lg"
          style={{ background: 'var(--color-bg-tertiary)', minHeight: chartHeight }}
        >
          {showChartLoading ? (
            <div className="flex min-h-[inherit] items-center px-5 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
              Loading weekly performance data...
            </div>
          ) : showNoData ? (
            <div className="flex min-h-[inherit] items-center px-5 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
              No weekly data is available for this player in {selectedSeasonKey}.
            </div>
          ) : (
            <>
          <svg
            className="absolute inset-0"
            width={chartWidth}
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            onMouseLeave={() => setHoveredWeek(null)}
          >
            <defs>
              {rows.map((row, index) => row.opponentGradientStops ? (
                <linearGradient
                  key={`${row.week}-${row.opponent ?? 'opp'}-gradient`}
                  id={`${chartInstanceId}-opponent-bar-${row.week}-${index}`}
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={row.opponentGradientStops.start} />
                  <stop offset="52%" stopColor={row.opponentGradientStops.mid ?? row.opponentGradientStops.start} />
                  <stop offset="100%" stopColor={row.opponentGradientStops.end} />
                </linearGradient>
              ) : null)}
            </defs>
            <g>
              <line
                x1={chartMargins.left}
                x2={chartWidth - chartMargins.right}
                y1={chartMargins.top + scaleChartValue(0, offenseDomainMin, offenseDomainMax, 0, plotHeight, scaleMode)}
                y2={chartMargins.top + scaleChartValue(0, offenseDomainMin, offenseDomainMax, 0, plotHeight, scaleMode)}
                stroke="var(--color-label)"
                strokeOpacity="0.16"
                strokeWidth={1}
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
              />
              {rows.map((row, index) => {
                const x = chartMargins.left + dataXInset + (rows.length > 1 ? index * step : dataPlotWidth / 2);
                const valueY = chartMargins.top + scaleChartValue(row.contextValue, defenseDomainMin, defenseDomainMax, 0, plotHeight, scaleMode);
                const zeroY = chartMargins.top + scaleChartValue(0, defenseDomainMin, defenseDomainMax, 0, plotHeight, scaleMode);
                const y = Math.min(valueY, zeroY);
                const height = Math.max(1, Math.abs(zeroY - valueY));
                const barGradientId = row.opponentGradientStops
                  ? `${chartInstanceId}-opponent-bar-${row.week}-${index}`
                  : null;
                return (
                  <g key={row.week}>
	                    <rect
	                      x={x - barWidth / 2}
	                      y={y}
	                      width={barWidth}
	                      height={height}
	                      rx={barRadius}
	                      fill={barGradientId ? `url(#${barGradientId})` : row.opponentColor}
	                      opacity="0.62"
	                    />
	                    {row.opponentLogo ? (
	                      <image
	                        href={row.opponentLogo}
	                        x={x - logoSize / 2}
	                        y={logoY}
	                        width={logoSize}
	                        height={logoSize}
	                        preserveAspectRatio="xMidYMid meet"
	                      />
	                    ) : (
                      <text
	                        x={x}
	                        y={opponentTextY}
	                        textAnchor="middle"
	                        fontSize={opponentTextFontSize}
	                        fontWeight="800"
	                        fill="var(--color-label-tertiary)"
	                      >
                        {row.opponent}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            <path
              className="player-stats-visual-offense-line"
              d={buildPath(animatedOffenseLine)}
	              fill="none"
	              stroke={colors.stat}
	              strokeWidth={lineStrokeWidth}
	              strokeLinecap="round"
	              strokeLinejoin="round"
	              pathLength="1"
            />
            {animatedOffenseLine.map((point, index) => (
              <circle
	                key={rows[index].week}
	                cx={point.x}
	                cy={point.y}
	                r={pointRadius}
	                fill={colors.stat}
	                stroke="var(--color-bg-tertiary)"
	                strokeWidth={pointStrokeWidth}
	              />
	            ))}
            {chartLabels.filter((label) => !label.hidden).map((label) => (
              <text
                key={label.id}
                className="player-stats-visual-label"
	                x={label.x}
	                y={label.y}
	                textAnchor="middle"
	                fontSize={labelFontSize}
	                fontWeight="800"
	                fill={label.fill}
	              >
                {label.text}
              </text>
            ))}
            <line x1={leftAxisX} x2={leftAxisX} y1={chartMargins.top} y2={chartMargins.top + plotHeight} stroke={colors.stat} strokeOpacity="0.38" />
            {offenseTicks.map((tick, index) => (
              <text
                key={`${tick}-${index}`}
                x={leftAxisX - 6}
	                y={chartMargins.top + scaleChartValue(tick, offenseDomainMin, offenseDomainMax, 0, plotHeight, scaleMode) + 4}
	                textAnchor="end"
	                fontSize={axisFontSize}
	                fill={colors.stat}
	              >
                {formatChartValue(tick, 1)}
              </text>
            ))}
            <line x1={rightAxisX} x2={rightAxisX} y1={chartMargins.top} y2={chartMargins.top + plotHeight} stroke={colors.defense} strokeOpacity="0.45" />
            {defenseTicks.map((tick, index) => (
              <text
                key={`${tick}-${index}`}
                x={rightAxisX + 6}
		                y={chartMargins.top + scaleChartValue(tick, defenseDomainMin, defenseDomainMax, 0, plotHeight, scaleMode) + 4}
	                textAnchor="start"
	                fontSize={axisFontSize}
	                fill={colors.defense}
	              >
                {formatChartValue(tick, 1)}
              </text>
            ))}
            <g>
	              {rows.map((row, index) => {
		                const x = chartMargins.left + dataXInset + (rows.length > 1 ? index * step : dataPlotWidth / 2);
	                const hitWidth = Math.max(24 * visualScale, step * 0.74);
                const interactionState = { row, x, y: chartMargins.top + 12 };
                const setMouseInteractionState = (event) => {
                  setHoveredWeek({
                    ...interactionState,
                    clientX: event.clientX,
                    clientY: event.clientY,
                  });
                };
                return (
                  <rect
                    key={`hit-${row.week}`}
                    x={x - hitWidth / 2}
                    y={chartMargins.top}
                    width={hitWidth}
                    height={plotHeight + 38}
                    fill="transparent"
                    role="button"
                    tabIndex="0"
                    aria-label={`Show Week ${row.week} details${row.opponent ? ` ${row.locationPrefix ?? 'vs'} ${row.opponent}` : ''}`}
                    onMouseEnter={setMouseInteractionState}
                    onMouseMove={setMouseInteractionState}
                    onClick={() => setTappedWeek(interactionState)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setTappedWeek(interactionState);
                      }
                    }}
                  />
                );
              })}
            </g>
          </svg>
          {hoveredWeek && (
            <WeekInsightTooltip
              row={hoveredWeek.row}
              x={hoveredWeek.x}
              y={hoveredWeek.y}
              clientX={hoveredWeek.clientX}
              clientY={hoveredWeek.clientY}
              chartWidth={chartWidth}
              chartHeight={chartHeight}
              statLabel={statLabel}
              offenseAxisLabel={offenseAxisLabel}
              defenseAxisLabel={defenseAxisLabel}
              offenseCardLabel={offenseCardLabel}
              defenseCardLabel={defenseCardLabel}
              positionGroupLabel={positionGroupLabel}
              selectedStatKey={activeSelectedStat}
              playerName={playerName}
            />
          )}
            </>
          )}
        </div>
        {showChart && tappedWeek && (
          <WeekInsightSheet
            row={tappedWeek.row}
            statLabel={statLabel}
            offenseAxisLabel={offenseAxisLabel}
            defenseAxisLabel={defenseAxisLabel}
            offenseCardLabel={offenseCardLabel}
            defenseCardLabel={defenseCardLabel}
            positionGroupLabel={positionGroupLabel}
            selectedStatKey={activeSelectedStat}
            playerName={playerName}
            onClose={() => setTappedWeek(null)}
          />
        )}

        {showChart && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--color-label-secondary)' }}>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-full" style={{ background: colors.stat }} />Offense {offenseAxisLabel}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-full opacity-60" style={{ background: colors.context }} />Defense avg allowed {defenseAxisLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
};

function MetricModeToggle({ label, value, onChange, fantasyDisabled = false }) {
  return (
    <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--color-fill)' }}>
      <span className="px-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </span>
      {METRIC_MODE_OPTIONS.map((option) => {
        const selected = value === option.id;
        const disabled = fantasyDisabled && option.id === METRIC_MODES.FANTASY;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => { if (!disabled) onChange(option.id); }}
            disabled={disabled}
            className="rounded-md px-2 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed"
            style={{
              background: selected ? 'var(--color-signature)' : 'transparent',
              color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
              opacity: disabled ? 0.38 : 1,
            }}
            aria-pressed={selected}
            title={disabled ? 'Fantasy scoring is unavailable for this selected season.' : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartScaleToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--color-fill)' }}>
      <span className="px-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-label-tertiary)' }}>
        Scale
      </span>
      {SCALE_MODE_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="rounded-md px-2 py-1 text-[11px] font-bold transition-colors"
            style={{
              background: selected ? 'var(--color-signature)' : 'transparent',
              color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
            }}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function WeekInsightTooltip({
  row,
  x,
  y,
  clientX,
  clientY,
  chartWidth,
  chartHeight,
  statLabel,
  offenseAxisLabel,
  defenseAxisLabel,
  offenseCardLabel,
  defenseCardLabel,
  positionGroupLabel,
  selectedStatKey,
  playerName,
}) {
  const tooltipWidth = 340;
  const tooltipHeight = 236;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : chartWidth;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : chartHeight;
  const preferredLeft = clientX != null ? clientX + 14 : x + 12;
  const preferredTop = clientY != null ? clientY + 14 : y;
  const left = Math.max(8, Math.min(viewportWidth - tooltipWidth - 8, preferredLeft));
  const top = Math.max(8, Math.min(viewportHeight - tooltipHeight - 8, preferredTop));

  const tooltip = (
    <div
      className="pointer-events-none hidden rounded-lg px-3 py-2 text-xs md:block"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1200,
        width: tooltipWidth,
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-separator)',
        boxShadow: '0 14px 34px rgba(0,0,0,0.26)',
        color: 'var(--color-label-secondary)',
      }}
    >
      <WeekInsightContent
        row={row}
        statLabel={statLabel}
        offenseAxisLabel={offenseAxisLabel}
        defenseAxisLabel={defenseAxisLabel}
        offenseCardLabel={offenseCardLabel}
        defenseCardLabel={defenseCardLabel}
        positionGroupLabel={positionGroupLabel}
        selectedStatKey={selectedStatKey}
        playerName={playerName}
        compact
      />
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(tooltip, document.body)
    : tooltip;
}

function WeekInsightSheet({
  row,
  statLabel,
  offenseAxisLabel,
  defenseAxisLabel,
  offenseCardLabel,
  defenseCardLabel,
  positionGroupLabel,
  selectedStatKey,
  playerName,
  onClose,
}) {
  return (
    <div className="md:hidden">
      <Modal
        onClose={onClose}
        mobileSheet
        ariaLabel={`Week ${row.week} stat details`}
        containerClassName="player-stats-week-sheet"
        containerStyle={{
          '--modal-mobile-sheet-max-height': 'min(82vh, calc(100dvh - 72px))',
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-label-secondary)',
        }}
      >
        <div className="px-4 pb-3">
          <div className="-mt-0.5 mb-1.5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1 text-[11px] font-bold"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
            >
              Close
            </button>
          </div>
          <WeekInsightContent
            row={row}
            statLabel={statLabel}
            offenseAxisLabel={offenseAxisLabel}
            defenseAxisLabel={defenseAxisLabel}
            offenseCardLabel={offenseCardLabel}
            defenseCardLabel={defenseCardLabel}
            positionGroupLabel={positionGroupLabel}
            selectedStatKey={selectedStatKey}
            playerName={playerName}
            compact
          />
        </div>
      </Modal>
    </div>
  );
}

function WeekInsightContent({
  row,
  statLabel,
  offenseAxisLabel,
  defenseAxisLabel,
  offenseCardLabel,
  defenseCardLabel,
  positionGroupLabel,
  selectedStatKey,
  playerName = 'Player',
  compact = false,
}) {
  const selectedBreakdown = row.statBreakdown.find((item) => item.key === selectedStatKey);
  const selectedFantasyValue = selectedBreakdown?.hasFantasyScoring ? row.fantasyValue : null;

  return (
    <>
      {compact ? (
        <div
          className="relative overflow-hidden rounded-lg"
          style={{
            background: buildOpponentHeroBackground(row),
            border: '1px solid color-mix(in srgb, var(--color-label) 18%, transparent)',
          }}
        >
          <div className="relative grid grid-cols-[4px_minmax(0,1fr)]">
            <div aria-hidden="true" style={{ background: row.opponentColor ?? 'var(--color-accent)' }} />
            <div className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 uppercase" style={{ color: 'var(--color-label)' }}>
                    <span className="text-lg font-bold leading-none tracking-[0.04em]">
                      Week {row.week}
                    </span>
                    {row.opponent && (
                      <span className="text-[11px] font-bold leading-none tracking-[0.14em]" style={{ color: 'var(--color-label-secondary)' }}>
                        {row.locationPrefix ?? 'vs'} {row.opponent}
                      </span>
                    )}
                  </div>
                </div>
                {row.opponentLogo && (
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background: 'color-mix(in srgb, var(--color-bg-secondary) 72%, transparent)',
                      border: `1px solid color-mix(in srgb, ${row.opponentColor ?? 'var(--color-label)'} 38%, var(--color-separator))`,
                    }}
                  >
                    <img
                      src={row.opponentLogo}
                      alt=""
                      className="h-9 w-9 object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
                <InsightHeroMetric
                  eyebrow={playerName}
                  label={offenseCardLabel}
                  value={formatChartValue(row.offenseValue, 1)}
                  emphasis="strong"
                />
                <div className="flex items-center self-center rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ background: 'color-mix(in srgb, var(--color-bg-secondary) 72%, transparent)', color: 'var(--color-label-secondary)' }}>
                  vs
                </div>
                <InsightHeroMetric
                  eyebrow={`${row.opponent ?? 'Opponent'} Defense`}
                  label={defenseCardLabel}
                  value={formatChartValue(row.contextValue, 1)}
                  accentColor={row.opponentColor}
                />
              </div>

              <div className="mt-3">
                <CompactMetric label={`Fantasy Points From ${statLabel}`} value={formatChartValue(selectedFantasyValue, 1)} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Week {row.week}{row.opponent ? ` ${row.locationPrefix ?? 'vs'} ${row.opponent}` : ''}
            </div>
            {row.opponentLogo && (
              <img
                src={row.opponentLogo}
                alt=""
                className="h-5 w-5 shrink-0 object-contain"
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <TooltipMetric label={offenseAxisLabel} value={formatChartValue(row.offenseValue, 1)} tone="primary" />
            <TooltipMetric label={`${positionGroupLabel} allowed ${defenseAxisLabel}`} value={formatChartValue(row.contextValue, 1)} />
            <TooltipMetric label={`${statLabel} game stats`} value={formatChartValue(row.rawValue, 1)} />
            <TooltipMetric label={`${statLabel} fantasy points`} value={formatChartValue(selectedFantasyValue, 1)} />
          </div>

          <div className="mt-2 rounded-md px-2 py-1.5" style={{ background: 'var(--color-fill)' }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Total Fantasy Points
            </div>
            <div className="mt-0.5 text-base font-bold" style={{ color: 'var(--color-label)' }}>
              {formatChartValue(row.totalFantasyValue, 1)} pts
            </div>
          </div>
        </>
      )}

      <div className={compact ? 'mt-2' : 'mt-3'}>
        <div className="mb-1.5 grid grid-cols-[minmax(0,1.35fr)_0.8fr_0.9fr] gap-2 px-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-label-tertiary)' }}>
          <span>Statistics</span>
          <span className="text-right">Game Stats</span>
          <span className="text-right">Fantasy Points</span>
        </div>
        {row.statBreakdown.map((item) => {
          const selected = item.key === selectedStatKey;
          return (
            <div
              key={item.key}
              className={`grid grid-cols-[minmax(0,1.35fr)_0.8fr_0.9fr] gap-2 rounded-md px-2 ${compact ? 'mt-1 py-1.5 text-[10px]' : 'py-1.5 text-[11px]'}`}
              style={{
                background: selected
                  ? `color-mix(in srgb, ${row.opponentColor ?? 'var(--color-accent)'} 18%, transparent)`
                  : 'transparent',
                border: selected
                  ? `1px solid color-mix(in srgb, ${row.opponentColor ?? 'var(--color-accent)'} 42%, var(--color-separator))`
                  : '1px solid var(--color-separator)',
                color: 'var(--color-label-secondary)',
              }}
            >
              <span className="font-semibold leading-tight" style={{ color: selected ? 'var(--color-label)' : 'var(--color-label-secondary)' }}>
                {item.label}
              </span>
              <span className="text-right font-bold" style={{ color: 'var(--color-label)' }}>
                {formatChartValue(item.rawValue, 1)}
              </span>
              <span className="text-right font-bold" style={{ color: item.hasFantasyScoring ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}>
                {item.hasFantasyScoring ? formatChartValue(item.fantasyValue, 1) : '--'}
              </span>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-2 text-[11px]" style={{ color: 'var(--color-label-tertiary)' }}>
          Defense value is the rolling opponent average allowed to {positionGroupLabel}s.
        </div>
      )}
    </>
  );
}

function buildOpponentHeroBackground(row) {
  const stops = row.opponentGradientStops;
  if (stops?.start && stops?.end) {
    return [
      'linear-gradient(135deg,',
      `color-mix(in srgb, ${stops.start} 74%, var(--color-bg-secondary)) 0%,`,
      `color-mix(in srgb, ${stops.mid ?? stops.start} 72%, var(--color-bg-secondary)) 54%,`,
      `color-mix(in srgb, ${stops.end} 74%, var(--color-bg-secondary)) 100%)`,
    ].join(' ');
  }
  if (row.opponentColor) {
    return `linear-gradient(135deg, color-mix(in srgb, ${row.opponentColor} 58%, var(--color-bg-secondary)) 0%, var(--color-bg-tertiary) 100%)`;
  }
  return 'var(--color-bg-tertiary)';
}

function InsightHeroMetric({ eyebrow, label, value, accentColor = null, emphasis = 'normal' }) {
  const background = accentColor
    ? `color-mix(in srgb, ${accentColor} 22%, var(--color-fill))`
    : emphasis === 'strong'
      ? 'color-mix(in srgb, var(--color-label) 10%, var(--color-fill))'
      : 'var(--color-fill)';
  const border = accentColor
    ? `1px solid color-mix(in srgb, ${accentColor} 44%, var(--color-separator))`
    : '1px solid color-mix(in srgb, var(--color-label) 10%, transparent)';

  return (
    <div
      className="flex min-h-[5.7rem] min-w-0 flex-col justify-between gap-2 rounded-md px-2.5 py-2"
      style={{ background, border }}
    >
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase leading-tight tracking-[0.12em]" style={{ color: 'var(--color-label-tertiary)' }}>
          {eyebrow}
        </div>
        <div className="mt-1 text-[10px] font-bold uppercase leading-tight tracking-[0.1em]" style={{ color: 'var(--color-label-secondary)' }}>
          {label}
        </div>
      </div>
      <div className="mt-auto text-2xl font-bold leading-none" style={{ color: 'var(--color-label)' }}>
        {value}
      </div>
    </div>
  );
}

function CompactMetric({ label, value, tone = 'secondary' }) {
  return (
    <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: 'var(--color-fill-tertiary)', border: '1px solid var(--color-separator)' }}>
      <div className="text-[9px] font-bold uppercase leading-tight tracking-[0.1em]" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold leading-tight" style={{ color: tone === 'primary' ? 'var(--color-accent)' : 'var(--color-label)' }}>
        {value}
      </div>
    </div>
  );
}

function TooltipMetric({ label, value, tone = 'secondary' }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: 'var(--color-fill)' }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold" style={{ color: tone === 'primary' ? 'var(--color-accent)' : 'var(--color-label)' }}>
        {value}
      </div>
    </div>
  );
}

export default PlayerStatsVisual;
