import { useState, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, fetchGameLog, fetchPlayerBio, headshot, CURRENT_SEASON } from '../utils/playerApi';
import { getAllWeeklyStats, getLeague as getSleeperLeague, getPlayerSeasonStats } from '../api/sleeperApi';
import { buildStatMap, getCareerHighlights } from '../utils/playerMetrics';
import { usePredictions } from '../context/PredictionContext';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { useTheme } from '../context/ThemeContext';
import PlayerStatTable, { HonorBadge } from './PlayerStatTable';
import honorsData from '../data/honors.json';
import { matchEspnToSleeper } from '../utils/espnSleeperMatch';
import { STATISTICS_MODES } from '../utils/playerDrilldown';
import { DEFAULT_SCORING, importLeagueScoring } from '../utils/scoringEngine';
import { getTeamVisualTheme } from '../utils/teamVisualTheme.js';
import {
  getCompanionInitials,
  getCompanionPositionColor,
  getNflTeamLogoUrl,
  getPositionTextColor,
} from '../utils/companionAssetVisuals.js';

const YEARS_TO_SHOW = 10;

const MODE_OPTIONS = [
  { id: STATISTICS_MODES.GAME, label: 'Game Stats' },
  { id: STATISTICS_MODES.FANTASY, label: 'Fantasy Values' },
];

function normalizeLeagueId(id) {
  return id == null ? null : String(id);
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

const PlayerProfile = ({ playerId, playerMeta, teamId, teams, mode = STATISTICS_MODES.GAME, leagueSeason = CURRENT_SEASON, onModeChange, onBack, backLabel, onCompare, onBuildTrade }) => {
  const { getTeamRecord } = usePredictions();
  const {
    hasLeague,
    myRoster,
    activeScoringSettings,
    league,
    leagues,
    leaguesBySeason,
    linkedLeagueSeasonOptions,
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
  const [resolvedFantasyLeaguesByYear, setResolvedFantasyLeaguesByYear] = useState({});

  // Current season auto-expanded, others collapsed
  const activeStatsSeason = Number(leagueSeason) || CURRENT_SEASON;
  const [expandedYears, setExpandedYears] = useState(() => ({ [activeStatsSeason]: true }));

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
    '--statistics-hero-logo-bg': teamTheme?.logoBadgeBg ?? 'var(--color-fill-secondary)',
    '--statistics-hero-logo-border': teamTheme?.logoBadgeBorder ?? 'var(--color-separator)',
    '--statistics-position-bg': positionColor ?? heroSubtle,
    '--statistics-position-fg': positionTextColor,
  };

  // Build year list: current down to the player's rookie season (capped at YEARS_TO_SHOW), plus 'career'.
  // ESPN increments experience.years at end-of-season to count total seasons played (including the
  // one just completed), so firstSeason = CURRENT_SEASON - (experience - 1), not - experience.
  // Math.max(0, ...) guards against experience=0 mid-season rookies yielding a future year.
  const latestSeason = Math.max(CURRENT_SEASON, activeStatsSeason);
  const firstSeason = playerMeta.experience != null
    ? latestSeason - Math.max(0, playerMeta.experience - 1)
    : latestSeason - (YEARS_TO_SHOW - 1);
  const years = Array.from({ length: YEARS_TO_SHOW }, (_, i) => latestSeason - i)
    .filter(year => year >= firstSeason);
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
    fantasyScoringByYear[seasonKey] = { ...DEFAULT_SCORING, ...importLeagueScoring(seasonLeague.scoring_settings) };
  }
  if (hasLeague && activeScoringSettings && fantasyLeagueByYear[String(activeStatsSeason)]) {
    fantasyScoringByYear[String(activeStatsSeason)] = { ...DEFAULT_SCORING, ...activeScoringSettings };
  }
  const activeExpandedYear = Object.entries(expandedYears).find(([, isExpanded]) => isExpanded)?.[0] ?? String(activeStatsSeason);
  const canUseFantasyForActiveYear = Boolean(
    hasLeague
      && activeExpandedYear !== 'career'
      && fantasyScoringByYear[String(activeExpandedYear)]
  );
  const rosterPlayerIds = myRoster()?.players ?? [];
  const rosterReserveIds = myRoster()?.reserve ?? [];
  const isOnMyRoster = sleeperId ? [...rosterPlayerIds, ...rosterReserveIds].includes(sleeperId) : false;

  useEffect(() => {
    let cancelled = false;
    if (!hasLeague) {
      setSleeperId(null);
      return () => { cancelled = true; };
    }

    (async () => {
      const playersData = sleeperPlayers ?? await loadPlayers();
      if (cancelled) return;
      setSleeperId(playersData ? matchEspnToSleeper(playerMeta, playersData) : null);
    })();

    return () => { cancelled = true; };
  }, [hasLeague, loadPlayers, playerMeta, sleeperPlayers]);

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
      const data = await fetchPlayerStats(playerId, year);
      setStatsByYear(prev => ({ ...prev, [year]: data }));
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
    setExpandedYears({ [activeStatsSeason]: true });
    loadYear(activeStatsSeason);
    loadGameLogForYear(activeStatsSeason);

    // Eagerly load career stats for hero card display
    (async () => {
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
    if (!sleeperId || activeExpandedYear === 'career' || !canUseFantasyForActiveYear) return;
    loadFantasyRowsForYear(activeExpandedYear);
  }, [sleeperId, activeExpandedYear, canUseFantasyForActiveYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGameLogForYear = async (year) => {
    if (gameLogByYear[year] !== undefined || loadingGameLog[year]) return;
    setLoadingGameLog(prev => ({ ...prev, [year]: true }));
    try {
      const log = await fetchGameLog(playerId, teamId, year);
      setGameLogByYear(prev => ({ ...prev, [year]: log }));
    } catch {
      setGameLogByYear(prev => ({ ...prev, [year]: [] }));
    } finally {
      setLoadingGameLog(prev => ({ ...prev, [year]: false }));
    }
  };

  const loadFantasyRowsForYear = async (year) => {
    const seasonKey = String(year);
    if (!sleeperId || !fantasyScoringByYear[seasonKey] || fantasyRowsByYear[seasonKey] !== undefined || loadingFantasyYears[seasonKey]) return;
    if (seasonKey === String(activeStatsSeason) && activeSleeperWeeklyStats?.[sleeperId]) {
      setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: activeSleeperWeeklyStats[sleeperId] }));
      return;
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
    } catch {
      setFantasyRowsByYear(prev => ({ ...prev, [seasonKey]: [] }));
    } finally {
      setLoadingFantasyYears(prev => ({ ...prev, [seasonKey]: false }));
    }
  };

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
  const activeMode = canUseFantasyForActiveYear ? mode : STATISTICS_MODES.GAME;
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
              {teamLogoUrl && (
                <img
                  src={teamLogoUrl}
                  alt=""
                  className="statistics-player-hero__team-logo"
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
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
                      onClick={() => onBuildTrade({ sleeperId, side: isOnMyRoster ? 'give' : 'get' })}
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
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          opacity: hasLeague ? 1 : 0.72,
        }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
            Stat Mode
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-secondary)' }}>
            {hasLeague
              ? (canUseFantasyForActiveYear ? "Using the expanded season's linked league scoring." : 'Fantasy Values are available for seasons with linked league scoring.')
              : 'Connect a Sleeper league to unlock Fantasy Values.'}
          </div>
        </div>
        <div className="grid grid-cols-2 rounded-lg p-1 min-w-0 flex-1 sm:flex-initial sm:min-w-[280px]" style={{ background: 'var(--color-fill)' }}>
          {MODE_OPTIONS.map((option) => {
            const selected = activeMode === option.id;
            const disabled = option.id === STATISTICS_MODES.FANTASY && !canUseFantasyForActiveYear;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { if (!disabled) onModeChange?.(option.id); }}
                disabled={disabled}
                className="px-2 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed"
                style={{
                  color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                  background: selected ? 'var(--color-signature)' : 'transparent',
                  borderRadius: '6px',
                  opacity: disabled ? 0.45 : 1,
                }}
                aria-pressed={selected}
                title={disabled ? 'Fantasy Values are only available for linked league seasons.' : undefined}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats accordion */}
      <div className="space-y-2">
        {isRookie ? (
          <RookieSeasonPlaceholder
            honorsByYear={honorsByYear}
            accentColor={heroAccent ?? heroBg}
          />
        ) : (
          <>
            {years.filter(y => !unavailableYears.has(y)).map(year => {
              const yearKey = String(year);
              const activeSeasonRows = yearKey === String(activeStatsSeason) && activeSleeperWeeklyStats?.[sleeperId]
                ? activeSleeperWeeklyStats[sleeperId]
                : undefined;
              const hasFantasyScoring = Boolean(fantasyScoringByYear[yearKey]);
              const fantasyRows = activeSeasonRows ?? fantasyRowsByYear[yearKey];
              const shouldLoadFantasyRows = Boolean(
                expandedYears[year]
                && sleeperId
                && hasFantasyScoring
                && fantasyRows === undefined
              );

              return (
                <PlayerStatTable
                  key={year}
                  year={year}
                  statsJson={statsByYear[year] ?? null}
                  position={playerMeta.position}
                  sleeperId={sleeperId}
                  expanded={!!expandedYears[year]}
                  onToggle={() => toggleYear(year)}
                  loading={!!loadingYears[year]}
                  error={errorYears[year] ?? null}
                  gameLog={gameLogByYear[year] ?? null}
                  gameLogLoading={!!loadingGameLog[year]}
                  honors={honorsByYear[yearKey] ?? []}
                  accentColor={heroAccent ?? heroBg}
                  displayMode={activeMode}
                  fantasySeason={year}
                  fantasyAvailable={hasFantasyScoring}
                  fantasyScoringSettings={fantasyScoringByYear[yearKey] ?? null}
                  fantasyWeeklyRows={hasFantasyScoring ? (fantasyRows ?? []) : undefined}
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
              accentColor={heroAccent ?? heroBg}
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
