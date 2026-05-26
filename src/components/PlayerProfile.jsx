import { Suspense, lazy, useState, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, fetchGameLog, fetchPlayerBio, fetchTeamDefenseStats, fetchTeamDefenseGameLog, headshot, CURRENT_SEASON } from '../utils/playerApi';
import { getAllWeeklyStats, getLeague as getSleeperLeague, getPlayerSeasonStats } from '../api/sleeperApi';
import { getEspnLeague } from '../api/espnFantasyApi';
import { buildStatMap, getCareerHighlights } from '../utils/playerMetrics';
import { usePredictions } from '../context/PredictionContext';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { useTheme } from '../context/ThemeContext';
import PlayerStatTable, { HonorBadge } from './PlayerStatTable';
import honorsData from '../data/honors.json';
import { matchEspnToSleeper } from '../utils/espnSleeperMatch';
import { STATISTICS_MODES } from '../utils/playerDrilldown';
import { DEFAULT_SCORING, importLeagueScoring, normalizeScoringProfile } from '../utils/scoringEngine';
import { getEspnTeamDefensePlayerId, normalizeEspnLeaguePayload } from '../utils/espnFantasyAdapter';
import { getTeamVisualTheme } from '../utils/teamVisualTheme.js';
import {
  getCompanionInitials,
  getCompanionPositionColor,
  getNflTeamLogoUrl,
  getPositionTextColor,
} from '../utils/companionAssetVisuals.js';

const YEARS_TO_SHOW = 10;
const PlayerStatsVisual = lazy(() => import('./PlayerStatsVisual'));

const MODE_OPTIONS = [
  { id: STATISTICS_MODES.GAME, label: 'Game Stats' },
  { id: STATISTICS_MODES.FANTASY, label: 'Fantasy Values' },
  { id: STATISTICS_MODES.VISUAL, label: 'Visual' },
];

function normalizeLeagueId(id) {
  return id == null ? null : String(id);
}

function getFantasyLeagueMaxWeek(league) {
  const value = Number(league?.settings?.matchup_periods);
  const season = Number(league?.season);
  const defaultMax = Number.isFinite(season) && season < 2021 ? 17 : 18;
  return Math.max(Number.isFinite(value) && value > 0 ? value : 0, defaultMax);
}

function getAllSeasonLeagues(leaguesBySeason) {
  return Object.values(leaguesBySeason ?? {}).flatMap((seasonLeagues) => seasonLeagues ?? []);
}

function buildLeagueLineageIds(startLeague, leaguesBySeason) {
  const ids = new Set();
  const queue = [];
  const addId = (id) => {
    const normalized = normalizeLeagueId(id);
    if (!normalized || ids.has(normalized)) return;
    ids.add(normalized);
    queue.push(normalized);
  };

  addId(startLeague?.league_id);
  addId(startLeague?.previous_league_id);

  const allLeagues = getAllSeasonLeagues(leaguesBySeason);
  while (queue.length > 0) {
    queue.shift();
    for (const item of allLeagues) {
      const leagueId = normalizeLeagueId(item?.league_id);
      const previousLeagueId = normalizeLeagueId(item?.previous_league_id);
      if (leagueId && ids.has(leagueId)) addId(previousLeagueId);
      if (previousLeagueId && ids.has(previousLeagueId)) addId(leagueId);
    }
  }

  return ids;
}

function isLeagueInLineage(candidateLeague, lineageIds) {
  const leagueId = normalizeLeagueId(candidateLeague?.league_id);
  const previousLeagueId = normalizeLeagueId(candidateLeague?.previous_league_id);
  return (leagueId && lineageIds.has(leagueId)) || (previousLeagueId && lineageIds.has(previousLeagueId));
}

function findLinkedSeasonLeague(seasonLeagues = [], lineageIds) {
  if (!seasonLeagues?.length || !lineageIds?.size) return null;
  return seasonLeagues.find((item) => isLeagueInLineage(item, lineageIds)) ?? null;
}

function findFallbackSeasonLeague(currentLeague, seasonLeagues = []) {
  if (!seasonLeagues?.length) return null;
  if (seasonLeagues.length === 1) return seasonLeagues[0];

  const currentName = String(currentLeague?.name ?? '').trim().toLowerCase();
  if (currentName) {
    const sameName = seasonLeagues.find((item) => String(item?.name ?? '').trim().toLowerCase() === currentName);
    if (sameName) return sameName;
  }

  return null;
}

function normalizeSleeperWeeklyRows(raw) {
  if (!raw) return [];
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  return rows
    .filter(Boolean)
    .map((entry) => ({ ...entry, week: Number(entry.week) }))
    .filter((entry) => Number.isFinite(entry.week))
    .sort((left, right) => left.week - right.week);
}

function getStatusTone(status) {
  if (!status) return 'neutral';
  if (status.includes('Reserve') || status === 'Injured Reserve') return 'negative';
  if (status.includes('Physic') || status.includes('PUP')) return 'info';
  if (status.includes('Suspend')) return 'neutral';
  return 'warning';
}

function rosterHasSleeperPlayer(roster, sleeperId) {
  if (!roster || !sleeperId) return false;
  const normalizedId = String(sleeperId);
  return ['players', 'reserve', 'taxi'].some((field) => (
    (roster[field] ?? []).some((playerId) => String(playerId) === normalizedId)
  ));
}

function numericSeasonStatValue(value) {
  if (value === null || value === undefined || value === '--') return null;
  const parsed = Number.parseFloat(String(value).replace(/[%,$]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasRecordedSeasonStats(statsJson) {
  const statsMap = buildStatMap(statsJson);
  const gamesPlayed = numericSeasonStatValue(
    statsMap.gamesPlayed ?? statsMap.games ?? statsMap.gamesStarted
  );

  if (gamesPlayed !== null && gamesPlayed > 0) return true;

  return Object.values(statsMap).some((value) => {
    const numericValue = numericSeasonStatValue(value);
    return numericValue !== null && Math.abs(numericValue) > 0.0001;
  });
}

function getFantasyScoringSettingsFromLeague(seasonLeague) {
  const source = seasonLeague?.scoring_settings;
  if (!source) return null;
  if (source.provider || source.settings || source.positionOverrides) {
    return normalizeScoringProfile(source, source.provider ?? 'sleeper');
  }
  return { ...DEFAULT_SCORING, ...importLeagueScoring(source) };
}

function addUniqueCandidate(candidates, seen, value) {
  if (value == null) return;
  const normalized = String(value).trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  candidates.push(normalized);
}

function toEspnStatPlayerId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.startsWith('espn:')) return normalized;
  return /^-?\d+$/.test(normalized) ? `espn:${normalized}` : null;
}

function isTeamDefensePosition(position) {
  return ['DEF', 'DST', 'D/ST'].includes(String(position ?? '').toUpperCase());
}

function getEspnTeamDefenseCandidateIds(playerMeta, teamId) {
  const candidates = [];
  const proTeamId = Number(playerMeta?.metadata?.proTeamId ?? playerMeta?.proTeamId);
  if (Number.isFinite(proTeamId)) candidates.push(toEspnStatPlayerId(-16000 - proTeamId));

  [
    playerMeta?.teamId,
    playerMeta?.team,
    playerMeta?.metadata?.teamId,
    playerMeta?.metadata?.team,
    teamId,
    playerMeta?.id,
  ].forEach((teamCandidate) => {
    candidates.push(getEspnTeamDefensePlayerId(teamCandidate));
  });

  return candidates.filter(Boolean);
}

function getFantasyPlayerIdCandidates({ platform, playerId, playerMeta, resolvedPlayerId, teamId = null }) {
  const candidates = [];
  const seen = new Set();
  const espnIds = [
    playerMeta?.sourceIds?.espn,
    playerMeta?.espnId,
    playerMeta?.espn_id,
    playerMeta?.id,
    playerId,
  ];

  if (platform === 'espn') {
    if (isTeamDefensePosition(playerMeta?.position)) {
      getEspnTeamDefenseCandidateIds(playerMeta, teamId).forEach((id) => addUniqueCandidate(candidates, seen, id));
    }
    espnIds.forEach((id) => addUniqueCandidate(candidates, seen, toEspnStatPlayerId(id)));
  }

  addUniqueCandidate(candidates, seen, resolvedPlayerId);
  addUniqueCandidate(candidates, seen, playerMeta?.sleeperId);
  addUniqueCandidate(candidates, seen, playerMeta?.id);
  addUniqueCandidate(candidates, seen, playerId);

  if (platform !== 'espn') {
    espnIds.forEach((id) => addUniqueCandidate(candidates, seen, toEspnStatPlayerId(id)));
  }

  return candidates;
}

function findFantasyRowsForPlayer(weeklyStats, playerIds = []) {
  if (!weeklyStats) return null;
  for (const playerId of playerIds) {
    if (Object.prototype.hasOwnProperty.call(weeklyStats, playerId)) {
      return { playerId, rows: weeklyStats[playerId] ?? [] };
    }
  }
  return null;
}

function getFantasyRowAppliedLevel(row = {}) {
  if (Number.isFinite(Number(row?._fantasyPoints ?? row?.fantasy_points ?? row?.appliedTotal))) return 2;
  if (row?._fantasyContributions && Object.keys(row._fantasyContributions).length > 0) return 1;
  return 0;
}

function countFantasyRowRawStats(row = {}) {
  return Object.entries(row ?? {}).filter(([key, value]) => (
    !key.startsWith('_')
    && !['week', 'gp', 'fantasy_points', 'appliedTotal'].includes(key)
    && typeof value === 'number'
  )).length;
}

function shouldPreferIncomingFantasyRow(existing, incoming) {
  const existingLevel = getFantasyRowAppliedLevel(existing);
  const incomingLevel = getFantasyRowAppliedLevel(incoming);
  if (incomingLevel !== existingLevel) return incomingLevel > existingLevel;
  if (incoming?._espnScheduleEntry && !existing?._espnScheduleEntry) return true;
  if (!incoming?._espnAppliedEntryOnly && existing?._espnAppliedEntryOnly) return true;
  return countFantasyRowRawStats(incoming) > countFantasyRowRawStats(existing);
}

function mergeFantasyWeekRow(existing, incoming) {
  if (!existing) return incoming;
  const incomingIsRicher = shouldPreferIncomingFantasyRow(existing, incoming);
  const merged = incomingIsRicher
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
  const contributions = {
    ...(incomingIsRicher ? existing._fantasyContributions : incoming._fantasyContributions),
    ...(incomingIsRicher ? incoming._fantasyContributions : existing._fantasyContributions),
  };
  if (Object.keys(contributions).length > 0) {
    merged._fantasyContributions = contributions;
  } else if (incoming?._espnAppliedEntryOnly || existing?._espnAppliedEntryOnly) {
    delete merged._fantasyContributions;
    delete merged._espnAppliedStats;
  }
  return merged;
}

function mergeWeeklyFantasyRows(rows = []) {
  const byWeek = new Map();
  for (const row of rows) {
    const week = Number(row?.week);
    if (!Number.isFinite(week)) continue;
    byWeek.set(week, { ...mergeFantasyWeekRow(byWeek.get(week), row), week });
  }
  return [...byWeek.values()].sort((left, right) => left.week - right.week);
}

function summarizeFantasyRow(row = {}) {
  const appliedContributions = row._fantasyContributions ?? null;
  return {
    week: row.week,
    fantasyPoints: row._fantasyPoints ?? row.fantasy_points ?? row.appliedTotal ?? null,
    appliedContributionTotal: appliedContributions
      ? Object.values(appliedContributions).reduce((sum, value) => sum + (Number(value) || 0), 0)
      : null,
    appliedContributionKeys: appliedContributions ? Object.keys(appliedContributions) : [],
    rawStatKeys: Object.entries(row ?? {})
      .filter(([rowKey, value]) => (
        !rowKey.startsWith('_')
        && !['week', 'gp', 'fantasy_points', 'appliedTotal'].includes(rowKey)
        && typeof value === 'number'
        && Math.abs(value) > 0
      ))
      .map(([rowKey]) => rowKey),
  };
}

const PlayerProfile = ({ playerId, playerMeta, teamId, teams, mode = STATISTICS_MODES.GAME, leagueSeason = CURRENT_SEASON, onModeChange, onBack, backLabel, onCompare, onBuildTrade, tradeDisabled = false, onViewSchedule }) => {
  const { getTeamRecord } = usePredictions();
  const {
    hasLeague,
    myRoster,
    rosters,
    activeScoringSettings,
    league,
    leagues,
    selectedLeagueId,
    leaguesBySeason,
    linkedLeagueSeasonOptions,
    platform,
  } = useSleeperLeague();
  const {
    players: sleeperPlayers,
    loadPlayers,
    weeklyStats: activeSleeperWeeklyStats,
  } = useSleeperStats();
  const [sleeperId, setSleeperId] = useState(null);

  // statsJson for each year, fetched lazily
  const [statsByYear, setStatsByYear] = useState({});
  const [loadingYears, setLoadingYears] = useState({});
  const [errorYears] = useState({});
  // Years confirmed to have no stats (silently hidden from the list)
  const [unavailableYears, setUnavailableYears] = useState(new Set());

  // Career stats (separate endpoint)
  const [careerStats, setCareerStats] = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);
  const [careerError, setCareerError] = useState(null);

  // Game-by-game logs per year
  const [gameLogByYear, setGameLogByYear] = useState({});
  const [loadingGameLog, setLoadingGameLog] = useState({});
  const [fantasyRowsByYear, setFantasyRowsByYear] = useState({});
  const [loadingFantasyYears, setLoadingFantasyYears] = useState({});
  const [fantasyRowDebugByYear, setFantasyRowDebugByYear] = useState({});
  const [resolvedFantasyLeaguesByYear, setResolvedFantasyLeaguesByYear] = useState({});
  const fantasyPlatformLabel = platform === 'espn' ? 'ESPN' : 'Sleeper';

  // Current season auto-expanded, others collapsed
  const activeStatsSeason = Number(leagueSeason) || CURRENT_SEASON;
  const defaultStatsSeason = Math.min(activeStatsSeason, CURRENT_SEASON);
  const [expandedYears, setExpandedYears] = useState(() => ({ [defaultStatsSeason]: true }));

  // Headshot visibility
  const [headshotError, setHeadshotError] = useState(false);

  // Career popover (tap on mobile, hover on desktop)
  const [showCareerPopover, setShowCareerPopover] = useState(false);

  // Per-season honor badges: { '2024': ['NFL MVP', 'Pro Bowl', '1st Team All-Pro'], ... }
  const [honorsByYear, setHonorsByYear] = useState({});

  const { darkMode } = useTheme();
  const team = teams?.find(t => t.id === teamId);
  const teamRecord = getTeamRecord(teamId);

  const teamTheme = teamId ? getTeamVisualTheme(teamId, darkMode) : null;
  const hasTeamGradient = Boolean(teamTheme?.gradient);
  const heroBg = hasTeamGradient ? teamTheme.gradient : 'var(--color-bg-secondary)';
  const heroAccent = teamTheme?.borderColor ?? getCompanionPositionColor(playerMeta.position) ?? 'var(--color-accent)';
  const statsTextAccent = teamTheme?.accentColor ?? heroAccent;
  const heroOnBg = hasTeamGradient ? teamTheme.gradientForeground : 'var(--color-label)';
  const heroOnBgMuted = hasTeamGradient ? teamTheme.gradientMuted : 'var(--color-label-secondary)';
  const heroSubtle = hasTeamGradient ? teamTheme.gradientSubtle : 'var(--color-fill-secondary)';
  const positionColor = getCompanionPositionColor(playerMeta.position);
  const positionTextColor = positionColor ? getPositionTextColor(positionColor) : heroOnBg;
  const teamLogoUrl = getNflTeamLogoUrl(teamTheme?.logoKey ?? teamId?.toLowerCase());
  const playerInitials = getCompanionInitials(playerMeta.displayName);
  const heroStyle = {
    background: heroBg,
    '--statistics-hero-accent': heroAccent,
    '--statistics-hero-fg': heroOnBg,
    '--statistics-hero-muted': heroOnBgMuted,
    '--statistics-hero-subtle': heroSubtle,
    '--statistics-position-bg': positionColor ?? heroSubtle,
    '--statistics-position-fg': positionTextColor,
  };
  const isTeamDefenseProfile = isTeamDefensePosition(playerMeta.position);
  const teamDefenseTeamId = playerMeta.teamId ?? teamId;
  const needsEspnProfileFantasyRows = platform === 'espn' && isTeamDefenseProfile;

  // Build year list: current down to the player's rookie season (capped at YEARS_TO_SHOW), plus 'career'.
  // ESPN increments experience.years at end-of-season to count total seasons played (including the
  // one just completed), so firstSeason = CURRENT_SEASON - (experience - 1), not - experience.
  // Math.max(0, ...) guards against experience=0 mid-season rookies yielding a future year.
  const latestSeason = Math.max(CURRENT_SEASON, activeStatsSeason);
  const firstSeason = playerMeta.experience != null
    ? CURRENT_SEASON - Math.max(0, playerMeta.experience - 1)
    : latestSeason - (YEARS_TO_SHOW - 1);
  const years = Array.from({ length: YEARS_TO_SHOW }, (_, i) => latestSeason - i)
    .filter(year => year >= firstSeason);
  const visibleYears = years.filter((year) => {
    if (unavailableYears.has(year)) return false;
    if (year <= CURRENT_SEASON) return true;
    return hasRecordedSeasonStats(statsByYear[year]);
  });
  const visibleYearKeys = new Set(visibleYears.map((year) => String(year)));
  const defaultVisibleYear = visibleYears[0] ?? defaultStatsSeason;
  const fantasyLeagueByYear = {};
  if (hasLeague && league) {
    const activeSeasonKey = String(league.season ?? leagueSeason);
    const combinedLeaguesBySeason = {
      ...leaguesBySeason,
      [activeSeasonKey]: [league, ...(leaguesBySeason?.[activeSeasonKey] ?? leagues ?? [])],
    };
    const lineageIds = buildLeagueLineageIds(league, combinedLeaguesBySeason);
    const candidateSeasonKeys = new Set([
      ...years.map((year) => String(year)),
      ...(linkedLeagueSeasonOptions ?? []).map((seasonKey) => String(seasonKey)),
      ...Object.keys(resolvedFantasyLeaguesByYear),
      activeSeasonKey,
    ]);
    for (const seasonKey of candidateSeasonKeys) {
      const seasonLeagues = combinedLeaguesBySeason?.[seasonKey] ?? [];
      const linkedLeague = seasonKey === activeSeasonKey
        ? league
        : (
          resolvedFantasyLeaguesByYear[seasonKey]
          ?? findLinkedSeasonLeague(seasonLeagues, lineageIds)
          ?? findFallbackSeasonLeague(league, seasonLeagues)
        );
      if (linkedLeague?.scoring_settings) fantasyLeagueByYear[seasonKey] = linkedLeague;
    }
  }
  const fantasyScoringByYear = {};
  for (const [seasonKey, seasonLeague] of Object.entries(fantasyLeagueByYear)) {
    const settings = getFantasyScoringSettingsFromLeague(seasonLeague);
    if (settings) fantasyScoringByYear[seasonKey] = settings;
  }
  if (hasLeague && activeScoringSettings && fantasyLeagueByYear[String(activeStatsSeason)]) {
    fantasyScoringByYear[String(activeStatsSeason)] = activeScoringSettings;
  }
  const expandedYearCandidate = Object.entries(expandedYears).find(([, isExpanded]) => isExpanded)?.[0] ?? String(defaultVisibleYear);
  const activeExpandedYear = expandedYearCandidate === 'career' || visibleYearKeys.has(String(expandedYearCandidate))
    ? expandedYearCandidate
    : String(defaultVisibleYear);
  const canUseFantasyForActiveYear = Boolean(
    hasLeague
      && activeExpandedYear !== 'career'
      && fantasyScoringByYear[String(activeExpandedYear)]
  );
  const fantasyPlayerIdCandidates = getFantasyPlayerIdCandidates({
    platform,
    playerId,
    playerMeta,
    resolvedPlayerId: sleeperId,
    teamId: teamDefenseTeamId,
  });
  const activeFantasyRowsMatch = needsEspnProfileFantasyRows
    ? null
    : findFantasyRowsForPlayer(activeSleeperWeeklyStats, fantasyPlayerIdCandidates);
  const activeFantasyPlayerId = activeFantasyRowsMatch?.playerId
    ?? (platform === 'espn' ? fantasyPlayerIdCandidates[0] : null)
    ?? sleeperId;
  const myRosterData = myRoster();
  const isOnMyRoster = rosterHasSleeperPlayer(myRosterData, sleeperId);
  const playerOwnerRosterId = sleeperId && !isOnMyRoster
    ? (rosters ?? []).find((roster) => rosterHasSleeperPlayer(roster, sleeperId))?.roster_id ?? null
    : null;
  const tradePartnerRosterId = playerOwnerRosterId != null
    && String(playerOwnerRosterId) !== String(myRosterData?.roster_id ?? '')
    ? playerOwnerRosterId
    : null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const playersData = sleeperPlayers ?? await loadPlayers();
        if (cancelled) return;
        const explicitPlayerId = playerMeta.sleeperId != null ? String(playerMeta.sleeperId) : null;
        setSleeperId(
          explicitPlayerId && (!playersData || playersData[explicitPlayerId])
            ? explicitPlayerId
            : (playersData ? matchEspnToSleeper(playerMeta, playersData) : null)
        );
      } catch {
        if (!cancelled) setSleeperId(null);
      }
    })();

    return () => { cancelled = true; };
  }, [loadPlayers, playerMeta, sleeperPlayers]);

  useEffect(() => {
    if (!hasLeague || !league?.previous_league_id) return undefined;

    let cancelled = false;
    void (async () => {
      const nextByYear = {};
      const seen = new Set();
      let previousLeagueId = normalizeLeagueId(league.previous_league_id);

      while (previousLeagueId && !seen.has(previousLeagueId)) {
        seen.add(previousLeagueId);
        try {
          const previousLeague = await getSleeperLeague(previousLeagueId);
          if (cancelled || !previousLeague) return;
          const seasonKey = String(previousLeague.season ?? '');
          if (seasonKey && previousLeague.scoring_settings) {
            nextByYear[seasonKey] = previousLeague;
          }
          previousLeagueId = normalizeLeagueId(previousLeague.previous_league_id);
        } catch {
          break;
        }
      }

      if (!cancelled && Object.keys(nextByYear).length > 0) {
        setResolvedFantasyLeaguesByYear(prev => ({ ...nextByYear, ...prev }));
      }
    })();

    return () => { cancelled = true; };
  }, [hasLeague, league?.league_id, league?.previous_league_id]);

  // Fetch stats for a year when its accordion is expanded
  const loadYear = async (year) => {
    if (statsByYear[year] !== undefined || loadingYears[year]) return;

    setLoadingYears(prev => ({ ...prev, [year]: true }));
    try {
      const data = isTeamDefenseProfile && teamDefenseTeamId
        ? await fetchTeamDefenseStats(teamDefenseTeamId, year)
        : await fetchPlayerStats(playerId, year);
      setStatsByYear(prev => ({ ...prev, [year]: data }));
      if (!hasRecordedSeasonStats(data)) {
        setUnavailableYears(prev => new Set([...prev, year]));
      }
    } catch {
      if (year < CURRENT_SEASON) {
        // Historical year with no data — hide it silently
        setUnavailableYears(prev => new Set([...prev, year]));
      } else {
        setStatsByYear(prev => ({ ...prev, [year]: null }));
      }
    } finally {
      setLoadingYears(prev => ({ ...prev, [year]: false }));
    }
  };

  // Load selected season stats + game log + career stats + honors on mount
  useEffect(() => {
    const expandedSeason = activeStatsSeason > CURRENT_SEASON ? CURRENT_SEASON : activeStatsSeason;
    setExpandedYears({ [expandedSeason]: true });
    loadYear(activeStatsSeason);
    if (expandedSeason !== activeStatsSeason) loadYear(expandedSeason);
    loadGameLogForYear(expandedSeason);

    // Eagerly load career stats for hero card display
    (async () => {
      if (isTeamDefenseProfile) {
        setCareerStats(null);
        setCareerLoading(false);
        setCareerError(null);
        return;
      }
      setCareerLoading(true);
      try {
        const data = await fetchPlayerCareerStats(playerId);
        setCareerStats(data);
      } catch {
        setCareerError('Failed to load career stats.');
      } finally {
        setCareerLoading(false);
      }
    })();

    // Build honorsByYear from static file + ESPN bio API awards
    (async () => {
      try {
        const merged = {};

        // 1. Static Pro Bowl / All-Pro data from honors.json
        const staticHonors = honorsData[String(playerId)] ?? {};
        for (const [year, honors] of Object.entries(staticHonors)) {
          merged[year] = [...(merged[year] ?? []), ...honors];
        }

        // 2. Dynamic major awards from ESPN bio (MVP, OPOY, Walter Payton, etc.)
        const bioData = await fetchPlayerBio(playerId);
        for (const award of (bioData.awards ?? [])) {
          for (const season of (award.seasons ?? [])) {
            merged[season] = [...(merged[season] ?? []), award.name];
          }
        }

        setHonorsByYear(merged);
      } catch { /* honors are non-critical — fail silently */ }
    })();
  }, [playerId, activeStatsSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeStatsSeason <= CURRENT_SEASON || !hasRecordedSeasonStats(statsByYear[activeStatsSeason])) return;
    setExpandedYears(prev => (prev[activeStatsSeason] ? prev : { [activeStatsSeason]: true }));
    loadGameLogForYear(activeStatsSeason);
  }, [activeStatsSeason, statsByYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeFantasyPlayerId || activeExpandedYear === 'career' || !canUseFantasyForActiveYear) return;
    loadFantasyRowsForYear(activeExpandedYear);
  }, [activeFantasyPlayerId, activeExpandedYear, canUseFantasyForActiveYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGameLogForYear = async (year) => {
    if (gameLogByYear[year] !== undefined || loadingGameLog[year]) return;
    setLoadingGameLog(prev => ({ ...prev, [year]: true }));
    try {
      const log = isTeamDefenseProfile && teamDefenseTeamId
        ? await fetchTeamDefenseGameLog(teamDefenseTeamId, year)
        : await fetchGameLog(playerId, teamId, year);
      setGameLogByYear(prev => ({ ...prev, [year]: log }));
    } catch {
      setGameLogByYear(prev => ({ ...prev, [year]: [] }));
    } finally {
      setLoadingGameLog(prev => ({ ...prev, [year]: false }));
    }
  };

  const loadFantasyRowsForYear = async (year, { force = false } = {}) => {
    const seasonKey = String(year);
    const earlyStopReason = !activeFantasyPlayerId
      ? 'missing-active-fantasy-player-id'
      : !fantasyScoringByYear[seasonKey]
        ? 'missing-fantasy-scoring'
        : (!force && fantasyRowsByYear[seasonKey] !== undefined && !(platform === 'espn' && fantasyRowsByYear[seasonKey]?.length === 0))
          ? 'already-loaded'
          : (!force && loadingFantasyYears[seasonKey])
            ? 'already-loading'
            : null;
    if (earlyStopReason) {
      const debug = {
        skipped: earlyStopReason,
        candidateIds: fantasyPlayerIdCandidates,
        activeFantasyPlayerId,
        hasFantasyScoring: Boolean(fantasyScoringByYear[seasonKey]),
        existingRowCount: fantasyRowsByYear[seasonKey]?.length ?? null,
      };
      setFantasyRowDebugByYear(prev => ({
        ...prev,
        [seasonKey]: {
          ...(prev[seasonKey] ?? {}),
          ...debug,
        },
      }));
      return debug;
    }
    const activeRowsMatch = (!force && !needsEspnProfileFantasyRows && seasonKey === String(activeStatsSeason))
      ? findFantasyRowsForPlayer(activeSleeperWeeklyStats, fantasyPlayerIdCandidates)
      : null;
    if (activeRowsMatch) {
      setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: activeRowsMatch.rows }));
      return {
        source: 'active-context',
        candidateIds: fantasyPlayerIdCandidates,
        matchedPlayerId: activeRowsMatch.playerId,
        rowCount: activeRowsMatch.rows?.length ?? 0,
        weeks: (activeRowsMatch.rows ?? []).map((row) => row.week),
      };
    }
    if (platform === 'espn') {
      const seasonLeague = fantasyLeagueByYear[seasonKey] ?? league;
      const leagueId = seasonLeague?.league_id ?? selectedLeagueId;
      const maxFantasyWeek = getFantasyLeagueMaxWeek(seasonLeague);
      if (!leagueId) {
        const debug = {
          source: 'espn-weekly-league-fallback-skipped',
          skipped: 'missing-league-id',
          candidateIds: fantasyPlayerIdCandidates,
        };
        setFantasyRowDebugByYear(prev => ({
          ...prev,
          [seasonKey]: debug,
        }));
        setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: [] }));
        return debug;
      }

      setLoadingFantasyYears(prev => ({ ...prev, [seasonKey]: true }));
      try {
        const basePayload = await getEspnLeague(seasonKey, leagueId);
        const baseNormalized = normalizeEspnLeaguePayload(basePayload, {
          season: seasonKey,
          leagueId,
          teamId: teamDefenseTeamId,
        });
        const baseMatch = findFantasyRowsForPlayer(baseNormalized.weeklyStats, fantasyPlayerIdCandidates);
        const matchedRows = needsEspnProfileFantasyRows ? [] : [...(baseMatch?.rows ?? [])];
        const weekDebug = [];

        const weekPayloads = await Promise.all(Array.from({ length: maxFantasyWeek }, (_, index) => {
          const week = index + 1;
          return getEspnLeague(seasonKey, leagueId, undefined, {
            scoringPeriodId: week,
            matchupPeriodId: week,
          })
            .then((payload) => ({ week, payload }))
            .catch((error) => ({ week, error: error?.message ?? 'Failed to load ESPN week.' }));
        }));

        for (const result of weekPayloads) {
          if (result.error) {
            weekDebug.push({ week: result.week, error: result.error });
            continue;
          }
          const normalized = normalizeEspnLeaguePayload(result.payload, {
            season: seasonKey,
            leagueId,
            teamId: teamDefenseTeamId,
            scoringPeriodId: result.week,
          });
          const match = findFantasyRowsForPlayer(normalized.weeklyStats, fantasyPlayerIdCandidates);
          weekDebug.push({
            week: result.week,
            playerCount: Object.keys(normalized.players ?? {}).length,
            weeklyStatsPlayerCount: Object.keys(normalized.weeklyStats ?? {}).length,
            matched: Boolean(match),
            rowCount: match?.rows?.length ?? 0,
          });
          if (match?.rows?.length) matchedRows.push(...match.rows);
        }

        const rows = mergeWeeklyFantasyRows(matchedRows);
        const debug = {
          source: rows.length ? 'espn-weekly-league-fallback' : 'espn-weekly-league-fallback-empty',
          candidateIds: fantasyPlayerIdCandidates,
          matchedPlayerId: baseMatch?.playerId ?? null,
          basePlayerCount: Object.keys(baseNormalized.players ?? {}).length,
          baseWeeklyStatsPlayerCount: Object.keys(baseNormalized.weeklyStats ?? {}).length,
          baseMatched: Boolean(baseMatch),
          rowCount: rows.length,
          weeks: rows.map((row) => row.week),
          rowTotals: rows.map(summarizeFantasyRow),
          weekDebug,
        };
        setFantasyRowDebugByYear(prev => ({
          ...prev,
          [seasonKey]: debug,
        }));
        setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: rows }));
        return debug;
      } catch (error) {
        const debug = {
          source: 'espn-weekly-league-fallback-error',
          candidateIds: fantasyPlayerIdCandidates,
          error: error?.message ?? 'Failed to load ESPN fantasy rows.',
        };
        setFantasyRowDebugByYear(prev => ({
          ...prev,
          [seasonKey]: debug,
        }));
        setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: [] }));
        return debug;
      } finally {
        setLoadingFantasyYears(prev => ({ ...prev, [seasonKey]: false }));
      }
    }
    if (!sleeperId) {
      setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: [] }));
      return { source: 'sleeper-skipped', skipped: 'missing-sleeper-id' };
    }

    setLoadingFantasyYears(prev => ({ ...prev, [seasonKey]: true }));
    try {
      const data = await getPlayerSeasonStats(sleeperId, seasonKey);
      let rows = normalizeSleeperWeeklyRows(data);

      if (rows.length === 0) {
        const weeklyByPlayer = await getAllWeeklyStats(seasonKey, 18);
        rows = normalizeSleeperWeeklyRows(weeklyByPlayer?.[sleeperId]);
      }

      setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: rows }));
      return {
        source: 'sleeper-player-season',
        rowCount: rows.length,
        weeks: rows.map((row) => row.week),
      };
    } catch {
      setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: [] }));
      return { source: 'sleeper-player-season-error' };
    } finally {
      setLoadingFantasyYears(prev => ({ ...prev, [seasonKey]: false }));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__GRIDSHIFT_STATISTICS_PROFILE_FANTASY_DEBUG__ = () => ({
      platform,
      playerId,
      playerName: playerMeta.displayName,
      position: playerMeta.position,
      activeExpandedYear,
      activeFantasyPlayerId,
      candidateIds: fantasyPlayerIdCandidates,
      activeContextPlayerCount: Object.keys(activeSleeperWeeklyStats ?? {}).length,
      fantasyRowsByYear: Object.fromEntries(Object.entries(fantasyRowsByYear).map(([key, rows]) => [key, {
        rowCount: rows?.length ?? 0,
        weeks: (rows ?? []).map((row) => row.week),
        rows: (rows ?? []).map((row) => ({
          ...summarizeFantasyRow(row),
          appliedContributionTotal: row._fantasyContributions
            ? Object.values(row._fantasyContributions).reduce((sum, value) => sum + (Number(value) || 0), 0)
            : null,
          appliedContributions: row._fantasyContributions ?? null,
          rawStats: Object.fromEntries(Object.entries(row ?? {}).filter(([rowKey, value]) => (
            !rowKey.startsWith('_')
            && !['week', 'gp', 'fantasy_points', 'appliedTotal'].includes(rowKey)
            && typeof value === 'number'
            && Math.abs(value) > 0
          ))),
          keys: Object.keys(row ?? {}).filter((key) => !key.startsWith('_')),
        })),
      }])),
      fallback: fantasyRowDebugByYear,
      refreshActiveYear: () => loadFantasyRowsForYear(activeExpandedYear, { force: true }),
    });
    return () => {
      delete window.__GRIDSHIFT_STATISTICS_PROFILE_FANTASY_DEBUG__;
    };
  }, [activeExpandedYear, activeFantasyPlayerId, activeSleeperWeeklyStats, fantasyPlayerIdCandidates, fantasyRowDebugByYear, fantasyRowsByYear, platform, playerId, playerMeta.displayName, playerMeta.position]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleYear = (year) => {
    const willExpand = !expandedYears[year];
    setExpandedYears(willExpand ? { [year]: true } : {});
    if (willExpand) {
      loadYear(year);
      loadGameLogForYear(year);
      loadFantasyRowsForYear(year);
    }
  };

  const toggleCareer = async () => {
    if (isTeamDefenseProfile) return;
    const willExpand = !expandedYears['career'];
    setExpandedYears(willExpand ? { career: true } : {});
    if (willExpand && careerStats === null && !careerLoading) {
      setCareerLoading(true);
      try {
        const data = await fetchPlayerCareerStats(playerId);
        setCareerStats(data);
      } catch {
        setCareerError('Failed to load career stats.');
      } finally {
        setCareerLoading(false);
      }
    }
  };

  // Career highlight totals for hero card
  const careerHighlights = careerStats
    ? getCareerHighlights(buildStatMap(careerStats), playerMeta.position)
    : [];

  const isRookie = playerMeta.experience === 0;
  const rookieLabel = isRookie ? 'Rookie Season' : `Active Since ${firstSeason}`;
  const canUseVisualForActiveYear = Boolean(
    sleeperId
      && activeExpandedYear !== 'career'
      && visibleYearKeys.has(String(activeExpandedYear))
  );
  const activeMode = mode === STATISTICS_MODES.VISUAL
    ? (canUseVisualForActiveYear ? STATISTICS_MODES.VISUAL : STATISTICS_MODES.GAME)
    : (canUseFantasyForActiveYear ? mode : STATISTICS_MODES.GAME);
  const heroMetaSegments = [
    playerMeta.positionName || playerMeta.position,
    team?.name,
    rookieLabel,
    teamRecord
      ? `${teamRecord.wins}–${teamRecord.losses}${teamRecord.ties > 0 ? `–${teamRecord.ties}` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
        style={{ color: 'var(--color-accent)' }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel ?? 'Statistics'}
      </button>

      {/* Profile hero card */}
      <div className="statistics-player-hero" style={heroStyle}>
        {hasTeamGradient && (
          <div
            className="statistics-player-hero__gradient-overlay"
            style={{ background: teamTheme.gradientOverlay }}
            aria-hidden="true"
          />
        )}
        {teamLogoUrl && (
          <img
            src={teamLogoUrl}
            alt=""
            className="statistics-player-hero__watermark"
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        <div className="statistics-player-hero__inner">
          <div className="statistics-player-hero__avatar-stack">
            {!headshotError ? (
              <img
                src={headshot(playerId)}
                alt={playerMeta.displayName}
                className="statistics-player-hero__avatar"
                onError={() => setHeadshotError(true)}
              />
            ) : (
              <div className="statistics-player-hero__avatar statistics-player-hero__avatar-fallback">
                {playerInitials}
              </div>
            )}
            <span className="statistics-player-hero__position">
              {playerMeta.position || '-'}
            </span>
          </div>

          <div className="statistics-player-hero__body">
            <div className="statistics-player-hero__identity-row">
              <h1 className="statistics-player-hero__name">
                {playerMeta.displayName}
              </h1>
              {playerMeta.jersey && (
                <span className="statistics-player-hero__jersey">
                  #{playerMeta.jersey}
                </span>
              )}
            </div>

            <div className="statistics-player-hero__meta">
              {heroMetaSegments.map(segment => (
                <span key={segment} className="statistics-player-hero__meta-item">
                  {segment}
                </span>
              ))}
            </div>

            <div className="statistics-player-hero__pills">
              {isRookie && (
                <span className="statistics-player-hero__pill is-positive">
                  Rookie Season
                </span>
              )}
              {playerMeta.status && playerMeta.status !== 'Active' && (
                <span className={`statistics-player-hero__pill is-${getStatusTone(playerMeta.status)}`}>
                  {playerMeta.status}
                </span>
              )}

              {hasLeague && sleeperId && (
                <span className={`statistics-player-hero__roster-pill ${isOnMyRoster ? 'is-rostered' : 'is-target'}`}>
                  <span className="statistics-player-hero__roster-dot" aria-hidden="true" />
                  {isOnMyRoster ? 'On Your Roster' : 'Trade Target'}
                </span>
              )}
            </div>

            <div
              className="statistics-player-hero__actions"
              onMouseLeave={() => { if (careerHighlights.length > 0) setShowCareerPopover(false); }}
            >
              {careerHighlights.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCareerPopover(prev => !prev)}
                  onMouseEnter={() => setShowCareerPopover(true)}
                  className="statistics-player-hero__action statistics-player-hero__action--ghost"
                  aria-pressed={showCareerPopover}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Career
                  <svg
                    width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                    className="statistics-player-hero__chevron"
                    style={{ transform: showCareerPopover ? 'rotate(-90deg)' : undefined }}
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

              {showCareerPopover ? (
                careerHighlights.map(({ label, value }) => (
                  <div
                    key={label}
                    className="statistics-player-hero__career-stat career-stat-enter"
                  >
                    <span className="statistics-player-hero__career-value">
                      {value}
                    </span>
                    <span className="statistics-player-hero__career-label">
                      {label}
                    </span>
                  </div>
                ))
              ) : (
                <>
                  {onBuildTrade && hasLeague && sleeperId && isOnMyRoster && (
                    <button
                      type="button"
                      disabled={tradeDisabled}
                      title={tradeDisabled ? 'Trade is not available for ESPN leagues yet.' : undefined}
                      onClick={() => onBuildTrade({ sleeperId, view: 'upgrade' })}
                      className="statistics-player-hero__action statistics-player-hero__action--outline group"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Upgrade
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="statistics-player-hero__arrow">
                        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  {onViewSchedule && teamId && (
                    <button
                      type="button"
                      onClick={onViewSchedule}
                      className="statistics-player-hero__action statistics-player-hero__action--outline group"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M8 3v4M16 3v4M4 10h16M8 14h2M13 14h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      View Schedule
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="statistics-player-hero__arrow">
                        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  {onCompare && (
                    <button
                      type="button"
                      onClick={() => onCompare(playerMeta)}
                      className="statistics-player-hero__action statistics-player-hero__action--outline group"
                    >
                      <svg width="15" height="15" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="15" y="5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                      Compare
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="statistics-player-hero__arrow">
                        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  {onBuildTrade && hasLeague && sleeperId && (
                    <button
                      type="button"
                      disabled={tradeDisabled}
                      title={tradeDisabled ? 'Trade is not available for ESPN leagues yet.' : undefined}
                      onClick={() => onBuildTrade({
                        sleeperId,
                        side: isOnMyRoster ? 'give' : 'get',
                        partnerRosterId: isOnMyRoster ? undefined : tradePartnerRosterId ?? undefined,
                      })}
                      className="statistics-player-hero__action statistics-player-hero__action--signature group"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M8 7h11M8 17h11M13 4l3 3-3 3M13 14l3 3-3 3M3 7h1M3 17h1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {isOnMyRoster ? 'Trade Away' : 'Build Trade'}
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="statistics-player-hero__arrow">
                        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex flex-col items-stretch justify-between gap-3 rounded-xl px-3 py-3 sm:flex-row sm:items-center"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          opacity: hasLeague ? 1 : 0.72,
        }}
      >
          <div className="min-w-0 sm:flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              {activeMode === STATISTICS_MODES.VISUAL ? 'Weekly Visual' : 'Stat Mode'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-secondary)' }}>
              {activeMode === STATISTICS_MODES.VISUAL
                ? 'Compare weekly output with opponent averages allowed to the same position.'
                : hasLeague
                  ? (canUseFantasyForActiveYear ? "Using the expanded season's linked league scoring." : 'Fantasy Values are available for seasons with linked league scoring.')
                  : `Connect a ${fantasyPlatformLabel} league to unlock Fantasy Values.`}
            </div>
          </div>
        <div className="grid w-full min-w-0 grid-cols-3 rounded-lg p-1 sm:w-auto sm:flex-initial sm:min-w-[360px]" style={{ background: 'var(--color-fill)' }}>
          {MODE_OPTIONS.map((option) => {
            const selected = activeMode === option.id;
            const disabled =
              (option.id === STATISTICS_MODES.FANTASY && !canUseFantasyForActiveYear)
              || (option.id === STATISTICS_MODES.VISUAL && !canUseVisualForActiveYear);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { if (!disabled) onModeChange?.(option.id); }}
                disabled={disabled}
                className="min-h-11 px-2 py-1.5 text-xs font-bold leading-tight transition-colors disabled:cursor-not-allowed sm:min-h-0"
                style={{
                  color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                  background: selected ? 'var(--color-signature)' : 'transparent',
                  borderRadius: '6px',
                  opacity: disabled ? 0.45 : 1,
                }}
                aria-pressed={selected}
                title={disabled ? 'This mode is available for linked league seasons.' : undefined}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats accordion */}
      <div className="space-y-2">
        {activeMode === STATISTICS_MODES.VISUAL ? (
          <Suspense fallback={<div className="rounded-xl p-5 text-sm" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)', color: 'var(--color-label-secondary)' }}>Loading visual chart...</div>}>
            <PlayerStatsVisual
              sleeperId={activeFantasyPlayerId ?? sleeperId}
              position={playerMeta.position}
              playerTeam={playerMeta.teamId ?? teamId}
              initialSeason={activeExpandedYear !== 'career' ? String(activeExpandedYear) : String(defaultVisibleYear)}
              seasonOptions={visibleYears.map((year) => String(year))}
              fantasyScoringByYear={fantasyScoringByYear}
            />
          </Suspense>
        ) : isRookie ? (
          <RookieSeasonPlaceholder
            honorsByYear={honorsByYear}
            accentColor={heroAccent ?? heroBg}
          />
        ) : (
          <>
            {visibleYears.map(year => {
              const yearKey = String(year);
              const yearActiveRowsMatch = !needsEspnProfileFantasyRows && yearKey === String(activeStatsSeason)
                ? findFantasyRowsForPlayer(activeSleeperWeeklyStats, fantasyPlayerIdCandidates)
                : null;
              const activeSeasonRows = yearActiveRowsMatch?.rows;
              const fantasyStatsPlayerId = yearActiveRowsMatch?.playerId ?? activeFantasyPlayerId;
              const hasFantasyScoring = Boolean(fantasyScoringByYear[yearKey]);
              const fantasyRows = fantasyRowsByYear[yearKey] ?? activeSeasonRows;
              const fantasyRowsProp = hasFantasyScoring && fantasyRows !== undefined
                ? fantasyRows
                : undefined;
              const shouldLoadFantasyRows = Boolean(
                expandedYears[year]
                && fantasyStatsPlayerId
                && hasFantasyScoring
                && fantasyRows === undefined
              );

              return (
                <PlayerStatTable
                  key={year}
                  year={year}
                  statsJson={statsByYear[year] ?? null}
                  position={playerMeta.position}
                  sleeperId={fantasyStatsPlayerId}
                  expanded={!!expandedYears[year]}
                  onToggle={() => toggleYear(year)}
                  loading={!!loadingYears[year]}
                  error={errorYears[year] ?? null}
                  gameLog={gameLogByYear[year] ?? null}
                  gameLogLoading={!!loadingGameLog[year]}
                  honors={honorsByYear[yearKey] ?? []}
                  playerName={playerMeta.displayName}
                  accentColor={heroAccent ?? heroBg}
                  textAccentColor={statsTextAccent}
                  displayMode={activeMode}
                  fantasySeason={year}
                  fantasyAvailable={hasFantasyScoring}
                  fantasyScoringSettings={fantasyScoringByYear[yearKey] ?? null}
                  fantasyMaxWeek={getFantasyLeagueMaxWeek(fantasyLeagueByYear[yearKey])}
                  fantasyWeeklyRows={fantasyRowsProp}
                  fantasyRowsLoading={!!loadingFantasyYears[yearKey] || shouldLoadFantasyRows}
                />
              );
            })}
            <PlayerStatTable
              key="career"
              year="career"
              statsJson={careerStats}
              position={playerMeta.position}
              sleeperId={sleeperId}
              expanded={!!expandedYears['career']}
              onToggle={toggleCareer}
              loading={careerLoading}
              error={careerError}
              playerName={playerMeta.displayName}
              accentColor={heroAccent ?? heroBg}
              textAccentColor={statsTextAccent}
              displayMode={activeMode}
              fantasySeason={activeStatsSeason}
              fantasyAvailable={false}
            />
          </>
        )}
      </div>
    </div>
  );
};

const RookieSeasonPlaceholder = ({ honorsByYear, accentColor }) => {
  const allHonors = Object.values(honorsByYear).flat();
  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      style={accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : undefined}
    >
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center gap-2 flex-wrap">
        <span className="font-semibold">Rookie Season</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600">
          First Year
        </span>
        {allHonors.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allHonors.map(honor => <HonorBadge key={honor} honor={honor} />)}
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-gray-900 px-4 py-8 text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--color-label-secondary)' }}>
          No NFL stats yet
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-label-tertiary)' }}>
          Stats will appear here once the season begins.
        </p>
      </div>
    </div>
  );
};

export default PlayerProfile;
