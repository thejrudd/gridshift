import { useState, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, fetchGameLog, fetchPlayerBio, headshot, CURRENT_SEASON } from '../utils/playerApi';
import { buildStatMap, getCareerHighlights } from '../utils/playerMetrics';
import { usePredictions } from '../context/PredictionContext';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { useTheme } from '../context/ThemeContext';
import PlayerStatTable, { HonorBadge } from './PlayerStatTable';
import honorsData from '../data/honors.json';
import { matchEspnToSleeper } from '../utils/espnSleeperMatch';
import { STATISTICS_MODES } from '../utils/playerDrilldown';
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

function getStatusTone(status) {
  if (!status) return 'neutral';
  if (status.includes('Reserve') || status === 'Injured Reserve') return 'negative';
  if (status.includes('Physic') || status.includes('PUP')) return 'info';
  if (status.includes('Suspend')) return 'neutral';
  return 'warning';
}

const PlayerProfile = ({ playerId, playerMeta, teamId, teams, mode = STATISTICS_MODES.GAME, onModeChange, onBack, backLabel, onCompare, onBuildTrade }) => {
  const { getTeamRecord } = usePredictions();
  const { hasLeague, myRoster, activeScoringSettings } = useSleeperLeague();
  const { players: sleeperPlayers, loadPlayers } = useSleeperStats();
  const [sleeperId, setSleeperId] = useState(null);

  // statsJson for each year, fetched lazily
  const [statsByYear, setStatsByYear] = useState({});
  const [loadingYears, setLoadingYears] = useState({});
  const [errorYears, setErrorYears] = useState({});
  // Years confirmed to have no stats (silently hidden from the list)
  const [unavailableYears, setUnavailableYears] = useState(new Set());

  // Career stats (separate endpoint)
  const [careerStats, setCareerStats] = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);
  const [careerError, setCareerError] = useState(null);

  // Game-by-game logs per year
  const [gameLogByYear, setGameLogByYear] = useState({});
  const [loadingGameLog, setLoadingGameLog] = useState({});

  // Current season auto-expanded, others collapsed
  const [expandedYears, setExpandedYears] = useState({ [CURRENT_SEASON]: true });

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
  const firstSeason = playerMeta.experience != null
    ? CURRENT_SEASON - Math.max(0, playerMeta.experience - 1)
    : CURRENT_SEASON - (YEARS_TO_SHOW - 1);
  const years = Array.from({ length: YEARS_TO_SHOW }, (_, i) => CURRENT_SEASON - i)
    .filter(year => year >= firstSeason);
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
        setErrorYears(prev => ({ ...prev, [year]: 'Failed to load stats.' }));
      }
    } finally {
      setLoadingYears(prev => ({ ...prev, [year]: false }));
    }
  };

  // Load current season stats + game log + career stats + honors on mount
  useEffect(() => {
    loadYear(CURRENT_SEASON);
    loadGameLogForYear(CURRENT_SEASON);

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
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGameLogForYear = async (year) => {
    if (gameLogByYear[year] !== undefined || loadingGameLog[year] || !teamId) return;
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

  const toggleYear = (year) => {
    const willExpand = !expandedYears[year];
    setExpandedYears(prev => ({ ...prev, [year]: willExpand }));
    if (willExpand) {
      loadYear(year);
      loadGameLogForYear(year);
    }
  };

  const toggleCareer = async () => {
    const willExpand = !expandedYears['career'];
    setExpandedYears(prev => ({ ...prev, career: willExpand }));
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
  const canShowFantasyModes = hasLeague && !!activeScoringSettings;
  const activeMode = canShowFantasyModes ? mode : STATISTICS_MODES.GAME;
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

      {canShowFantasyModes && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-separator)',
          }}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Stat Mode
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-secondary)' }}>
              League scoring updates this view live.
            </div>
          </div>
          <div className="grid grid-cols-2 rounded-lg p-1 min-w-0 flex-1 sm:flex-initial sm:min-w-[280px]" style={{ background: 'var(--color-fill)' }}>
            {MODE_OPTIONS.map((option) => {
              const selected = activeMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onModeChange?.(option.id)}
                  className="px-2 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                    background: selected ? 'var(--color-signature)' : 'transparent',
                    borderRadius: '6px',
                  }}
                  aria-pressed={selected}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats accordion */}
      <div className="space-y-2">
        {isRookie ? (
          <RookieSeasonPlaceholder
            honorsByYear={honorsByYear}
            accentColor={heroAccent ?? heroBg}
          />
        ) : (
          <>
            {years.filter(y => !unavailableYears.has(y)).map(year => (
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
                honors={honorsByYear[String(year)] ?? []}
                accentColor={heroAccent ?? heroBg}
                displayMode={activeMode}
              />
            ))}
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
