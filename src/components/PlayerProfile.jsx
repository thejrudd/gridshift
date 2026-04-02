import { useState, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, fetchGameLog, fetchPlayerBio, headshot, CURRENT_SEASON } from '../utils/playerApi';
import { buildStatMap, getCareerHighlights } from '../utils/playerMetrics';
import { usePredictions } from '../context/PredictionContext';
import { useSleeper } from '../context/SleeperContext';
import { useTheme } from '../context/ThemeContext';
import PlayerStatTable from './PlayerStatTable';
import honorsData from '../data/honors.json';
import { getTeamPalette } from '../data/teamColors.js';
import { matchEspnToSleeper } from '../utils/espnSleeperMatch';

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const YEARS_TO_SHOW = 10;

const PlayerProfile = ({ playerId, playerMeta, teamId, teams, onBack, backLabel, onCompare, onBuildTrade }) => {
  const { getTeamRecord } = usePredictions();
  const { players: sleeperPlayers, loadPlayers, hasLeague, myRoster } = useSleeper();
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

  const palette = getTeamPalette(teamId);
  const heroBg = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const heroOnBg = heroBg && hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroOnBgMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.60)';

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
    } catch (e) {
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

  // Eagerly probe all historical years in the background so unavailable ones
  // are silently removed from the list before the user tries to expand them.
  useEffect(() => {
    years.filter(y => y < CURRENT_SEASON).forEach(y => loadYear(y));
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const rookieLabel = `Active Since ${firstSeason}`;

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
      <div
        className="rounded-xl overflow-hidden shadow-lg relative"
        style={{
          background: heroBg
            ? `linear-gradient(135deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.32)} 100%)`
            : 'var(--color-bg-secondary)',
          borderLeft: heroAccent ? `4px solid ${heroAccent}` : undefined,
        }}
      >
        {/* Team logo watermark */}
        {heroBg && (
          <div
            className="absolute inset-y-0 right-0 hidden sm:flex items-center pointer-events-none"
            aria-hidden="true"
            style={{ paddingRight: '12px' }}
          >
            <img
              src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamId.toLowerCase()}.png`}
              alt=""
              style={{ width: '152px', height: '152px', objectFit: 'contain', opacity: 0.13 }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          </div>
        )}

        <div className="p-5 sm:p-6 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4 sm:gap-5">
            {/* Headshot — scales with card height */}
            <div className="shrink-0 sm:self-stretch">
              {!headshotError ? (
                <img
                  src={headshot(playerId)}
                  alt={playerMeta.displayName}
                  className="w-24 h-24 sm:w-32 sm:h-full object-cover rounded-lg"
                  style={{
                    background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill)',
                    minHeight: '96px',
                  }}
                  onError={() => setHeadshotError(true)}
                />
              ) : (
                <div
                  className="w-24 h-24 sm:w-32 sm:h-full rounded-lg flex items-center justify-center"
                  style={{
                    background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill)',
                    minHeight: '96px',
                  }}
                >
                  <span className="text-3xl font-bold" style={{ color: heroOnBgMuted }}>
                    {(playerMeta.displayName ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                <h1
                  className="text-3xl font-display tracking-wide"
                  style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}
                >
                  {playerMeta.displayName}
                </h1>
                {playerMeta.jersey && (
                  <span
                    className="text-xl font-semibold"
                    style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)' }}
                  >
                    #{playerMeta.jersey}
                  </span>
                )}
              </div>

              <div
                className="mt-1 flex flex-wrap justify-center sm:justify-start items-center gap-x-2 gap-y-0.5 text-sm"
                style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-secondary)' }}
              >
                <span className="font-semibold" style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}>
                  {playerMeta.positionName || playerMeta.position}
                </span>
                {team && (
                  <>
                    <span>·</span>
                    <span>{team.name}</span>
                  </>
                )}
                <span>·</span>
                <span>{rookieLabel}</span>
                {teamRecord && (
                  <>
                    <span>·</span>
                    <span>
                      {teamRecord.wins}–{teamRecord.losses}
                      {teamRecord.ties > 0 ? `–${teamRecord.ties}` : ''}
                    </span>
                  </>
                )}
              </div>

              {/* Inline indicators: status badge + roster indicator */}
              <div className="mt-2 flex flex-wrap justify-center sm:justify-start items-center gap-2">
                {playerMeta.status && playerMeta.status !== 'Active' && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase"
                    style={{
                      background: playerMeta.status.includes('Reserve') || playerMeta.status === 'Injured Reserve'
                        ? '#ef4444'
                        : playerMeta.status.includes('Physic') || playerMeta.status.includes('PUP')
                          ? '#8b5cf6'
                          : playerMeta.status.includes('Suspend')
                            ? '#6b7280'
                            : '#f59e0b',
                      color: '#fff',
                    }}
                  >
                    {playerMeta.status}
                  </span>
                )}

                {hasLeague && sleeperId && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      color: isOnMyRoster ? 'var(--color-signature)' : (heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)'),
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: isOnMyRoster ? 'var(--color-signature)' : 'currentColor' }}
                    />
                    {isOnMyRoster ? 'On Your Roster' : 'Trade Target'}
                  </span>
                )}
              </div>

              {/* Action row: career toggle + buttons OR career stats — fixed height prevents resize on hover */}
              <div
                className="mt-3 flex flex-wrap justify-center sm:justify-start items-center gap-2"
                style={{ height: '40px' }}
                onMouseLeave={() => { if (careerHighlights.length > 0) setShowCareerPopover(false); }}
              >
                {/* Career trigger — always visible */}
                {careerHighlights.length > 0 && (
                  <button
                    onClick={() => setShowCareerPopover(prev => !prev)}
                    onMouseEnter={() => setShowCareerPopover(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 active:scale-[0.97]"
                    style={{
                      background: heroBg
                        ? (heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.10)' : 'rgba(12,15,20,0.08)')
                        : 'var(--color-fill)',
                      color: heroBg ? heroOnBg : 'var(--color-label)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Career
                    <svg
                      width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                      className="transition-transform duration-200"
                      style={{
                        transform: showCareerPopover ? 'rotate(-90deg)' : undefined,
                        transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
                      }}
                    >
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}

                {/* Career stats (inline, replaces buttons) OR action buttons */}
                {showCareerPopover ? (
                  careerHighlights.map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm career-stat-enter"
                      style={{
                        background: heroBg
                          ? (heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.08)' : 'rgba(12,15,20,0.07)')
                          : 'var(--color-fill-secondary)',
                      }}
                    >
                      <span
                        className={`font-bold ${heroBg ? '' : color}`}
                        style={heroBg ? { color: heroOnBg } : undefined}
                      >
                        {value}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider font-semibold"
                        style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)' }}
                      >
                        {label}
                      </span>
                    </div>
                  ))
                ) : (
                  <>
                    {onCompare && (
                      <button
                        onClick={() => onCompare(playerMeta)}
                        className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-opacity duration-200 active:scale-[0.97] hover:brightness-110"
                        style={{
                          background: 'transparent',
                          color: heroBg ? heroOnBg : 'var(--color-label)',
                          border: `1.5px solid ${heroBg ? (heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.35)' : 'rgba(12,15,20,0.25)') : 'var(--color-separator)'}`,
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                          <rect x="3" y="5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                          <rect x="15" y="5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                        Compare
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="opacity-40 group-hover:opacity-70 transition-opacity">
                          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    {onBuildTrade && hasLeague && sleeperId && (
                      <button
                        onClick={() => onBuildTrade({ sleeperId, side: isOnMyRoster ? 'give' : 'get' })}
                        className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-opacity duration-200 active:scale-[0.97] hover:brightness-110"
                        style={{
                          background: 'var(--color-signature)',
                          color: 'var(--color-signature-fg)',
                          boxShadow: '0 2px 8px rgba(245,183,0,0.25)',
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M8 7h11M8 17h11M13 4l3 3-3 3M13 14l3 3-3 3M3 7h1M3 17h1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {isOnMyRoster ? 'Trade Away' : 'Build Trade'}
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="opacity-50 group-hover:opacity-80 transition-opacity">
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
      </div>

      {/* Stats accordion */}
      <div className="space-y-2">
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
          />
        ))}
        {/* Career row */}
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
        />
      </div>
    </div>
  );
};

export default PlayerProfile;
