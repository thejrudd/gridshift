import { useState, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, fetchGameLog, fetchPlayerBio, headshot, CURRENT_SEASON } from '../utils/playerApi';
import { buildStatMap, getCareerHighlights } from '../utils/playerMetrics';
import { usePredictions } from '../context/PredictionContext';
import { useTheme } from '../context/ThemeContext';
import PlayerStatTable from './PlayerStatTable';
import honorsData from '../data/honors.json';
import { TEAM_COLORS } from '../data/teamColors.js';

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

const PlayerProfile = ({ playerId, playerMeta, teamId, teams, onBack, backLabel }) => {
  const { getTeamRecord } = usePredictions();

  // statsJson for each year, fetched lazily
  const [statsByYear, setStatsByYear] = useState({});
  const [loadingYears, setLoadingYears] = useState({});
  const [errorYears, setErrorYears] = useState({});

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

  // Per-season honor badges: { '2024': ['NFL MVP', 'Pro Bowl', '1st Team All-Pro'], ... }
  const [honorsByYear, setHonorsByYear] = useState({});

  const { darkMode } = useTheme();
  const team = teams?.find(t => t.id === teamId);
  const teamRecord = getTeamRecord(teamId);

  const palette = TEAM_COLORS[teamId?.toLowerCase()];
  const heroBg = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const heroOnBg = heroBg && hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroOnBgMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.60)';

  // Build year list: current down to the player's rookie season (capped at YEARS_TO_SHOW), plus 'career'.
  // ESPN increments experience.years at end-of-season to count total seasons played (including the
  // one just completed), so firstSeason = CURRENT_SEASON - (experience - 1), not - experience.
  // Math.max(0, ...) guards against experience=0 mid-season rookies yielding a future year.
  const firstSeason = CURRENT_SEASON - Math.max(0, (playerMeta.experience ?? 0) - 1);
  const years = Array.from({ length: YEARS_TO_SHOW }, (_, i) => CURRENT_SEASON - i)
    .filter(year => year >= firstSeason);

  // Fetch stats for a year when its accordion is expanded
  const loadYear = async (year) => {
    if (statsByYear[year] !== undefined || loadingYears[year]) return;

    setLoadingYears(prev => ({ ...prev, [year]: true }));
    try {
      const data = await fetchPlayerStats(playerId, year);
      setStatsByYear(prev => ({ ...prev, [year]: data }));
    } catch (e) {
      setErrorYears(prev => ({ ...prev, [year]: 'Failed to load stats.' }));
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

        <div className="p-6 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Headshot */}
            <div className="shrink-0">
              {!headshotError ? (
                <img
                  src={headshot(playerId)}
                  alt={playerMeta.displayName}
                  className="w-28 h-28 sm:w-36 sm:h-36 object-cover rounded-xl"
                  style={{ background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill)' }}
                  onError={() => setHeadshotError(true)}
                />
              ) : (
                <div
                  className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl flex items-center justify-center"
                  style={{ background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill)' }}
                >
                  <span className="text-3xl font-bold" style={{ color: heroOnBgMuted }}>
                    {(playerMeta.displayName ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
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

              {/* Career highlight pods */}
              {careerHighlights.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
                  {careerHighlights.map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center rounded-lg px-3 py-1.5 min-w-[60px]"
                      style={{
                        background: heroBg
                          ? (heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.12)' : 'rgba(12,15,20,0.10)')
                          : 'var(--color-fill)',
                      }}
                    >
                      <span
                        className={`text-lg font-bold leading-tight ${heroBg ? '' : color}`}
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
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats accordion */}
      <div className="space-y-2">
        {years.map(year => (
          <PlayerStatTable
            key={year}
            year={year}
            statsJson={statsByYear[year] ?? null}
            position={playerMeta.position}
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
