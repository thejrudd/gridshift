import { useEffect, useMemo, useState } from 'react';
import {
  CURRENT_SEASON,
  fetchPlayerCareerStats,
  fetchPlayerStats,
  headshot,
} from '../utils/playerApi';
import {
  buildRankMap,
  buildStatMap,
  getCareerHighlights,
  getStatRows,
} from '../utils/playerMetrics';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { calcPointsFromTotals } from '../utils/scoringEngine';
import {
  buildFantasyRankByKey,
  getFantasyContribution,
} from '../utils/fantasyStatContributions';
import { getTeamPalette } from '../data/teamColors';
import { useTheme } from '../context/ThemeContext';
import Modal from './Modal';

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function SummarySection({ heading, rows, showFantasyMeta = true }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <div
        className="text-[10px] font-bold uppercase tracking-widest pb-1 border-b"
        style={{ color: 'var(--color-label-tertiary)', borderBottomColor: 'var(--color-separator)' }}
      >
        {heading}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {rows.map(({ label, value, rank, fantasyPoints, fantasyRank }) => (
          <div key={label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
              {label}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold" style={{ color: 'var(--color-label)' }}>
                {value}
              </span>
              {rank && (
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                  ({rank})
                </span>
              )}
            </div>
            {showFantasyMeta && fantasyPoints != null && fantasyPoints !== 0 && (
              <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                {fantasyPoints != null ? `${fantasyPoints.toFixed(2)} pts` : '— pts'}
                {fantasyRank != null ? ` · #${fantasyRank}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlayerStatsModal({
  playerId,
  playerMeta,
  onClose,
  onOpenFullProfile,
}) {
  const { darkMode } = useTheme();
  const { scoringSettings } = useSleeperLeague();
  const { players: sleeperPlayers, seasonStats: sleeperSeasonStats } = useSleeperStats();
  const [seasonStats, setSeasonStats] = useState(null);
  const [careerStats, setCareerStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [headshotError, setHeadshotError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchPlayerStats(playerId, CURRENT_SEASON),
      fetchPlayerCareerStats(playerId),
    ])
      .then(([seasonData, careerData]) => {
        if (cancelled) return;
        setSeasonStats(seasonData);
        setCareerStats(careerData);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Unable to load player stats right now.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const palette = getTeamPalette(playerMeta?.teamId);
  const heroBg = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const heroOnBg = heroBg && hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroOnBgMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.68)' : 'rgba(12,15,20,0.60)';

  const fantasyRankByKey = useMemo(() => {
    return buildFantasyRankByKey(sleeperSeasonStats, sleeperPlayers, scoringSettings);
  }, [scoringSettings, sleeperPlayers, sleeperSeasonStats]);

  const seasonSections = useMemo(() => {
    if (!seasonStats) return [];
    const statsMap = buildStatMap(seasonStats);
    const rankMap = buildRankMap(seasonStats);
    const { standard = [] } = getStatRows(statsMap, playerMeta?.position, rankMap);
    return standard
      .map((section) => {
        const rows = section.rows
          .slice(0, 6)
          .map((row) => ({
            ...row,
            label: row.label === 'Tackles' ? 'Total' : row.label,
            fantasyPoints: getFantasyContribution(row.key, statsMap, playerMeta?.position, scoringSettings),
            fantasyRank: playerMeta?.sleeperId
              ? (fantasyRankByKey.get(row.key)?.get(playerMeta.sleeperId) ?? null)
              : null,
          }));

        return {
          ...section,
          rows,
        };
      })
      .filter((section) => section.rows.length > 0)
      .slice(0, 2);
  }, [seasonStats, playerMeta?.position, playerMeta?.sleeperId, scoringSettings, fantasyRankByKey]);

  const careerHighlights = useMemo(() => {
    if (!careerStats) return [];
    return getCareerHighlights(buildStatMap(careerStats), playerMeta?.position).slice(0, 4);
  }, [careerStats, playerMeta?.position]);

  const fantasyRows = useMemo(() => {
    if (!playerMeta?.sleeperId || !sleeperSeasonStats || !scoringSettings) return [];
    const totals = sleeperSeasonStats[playerMeta.sleeperId];
    if (!totals) return [];

    const seasonPoints = calcPointsFromTotals(totals, scoringSettings, playerMeta.position);
    const gamesPlayed = totals.gp ?? 0;
    const avgPpg = seasonPoints != null && gamesPlayed > 0 ? seasonPoints / gamesPlayed : null;

    return [
      seasonPoints != null ? { label: 'Season Pts', value: seasonPoints.toFixed(2), rank: null } : null,
      avgPpg != null ? { label: 'Avg PPG', value: avgPpg.toFixed(2), rank: null } : null,
      gamesPlayed > 0 ? { label: 'Games', value: String(gamesPlayed), rank: null } : null,
    ].filter(Boolean);
  }, [playerMeta?.position, playerMeta?.sleeperId, sleeperSeasonStats, scoringSettings]);

  return (
    <Modal
      onClose={onClose}
      containerClassName="max-w-3xl"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
      mobileSheet
      ariaLabel={`${playerMeta.displayName} statistics snapshot`}
    >
        <div
          className="relative px-5 py-5 sm:px-6"
          style={{
            background: heroBg
              ? `linear-gradient(135deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.32)} 100%)`
              : 'var(--color-fill)',
            borderLeft: heroAccent ? `4px solid ${heroAccent}` : undefined,
          }}
        >
          {palette && (
            <div className="absolute inset-y-0 right-3 hidden sm:flex items-center pointer-events-none" aria-hidden="true">
              <img
                src={`https://a.espncdn.com/i/teamlogos/nfl/500/${playerMeta.teamId.toLowerCase()}.png`}
                alt=""
                style={{ width: '132px', height: '132px', objectFit: 'contain', opacity: 0.12 }}
                onError={(event) => { event.target.style.display = 'none'; }}
              />
            </div>
          )}

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {!headshotError ? (
                <img
                  src={headshot(playerId)}
                  alt={playerMeta.displayName}
                  className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24"
                  style={{ background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill-secondary)' }}
                  onError={() => setHeadshotError(true)}
                />
              ) : (
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl sm:h-24 sm:w-24"
                  style={{ background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill-secondary)' }}
                >
                  <span className="text-2xl font-bold" style={{ color: heroOnBgMuted }}>
                    {(playerMeta.displayName ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h2
                  className="truncate text-2xl font-display tracking-wide sm:text-3xl"
                  style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}
                >
                  {playerMeta.displayName}
                </h2>
                <div
                  className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                  style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-secondary)' }}
                >
                  <span style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}>
                    {playerMeta.positionName || playerMeta.position}
                  </span>
                  {playerMeta.teamId && <span>{playerMeta.teamId}</span>}
                  {playerMeta.jersey && <span>#{playerMeta.jersey}</span>}
                  {playerMeta.experience != null && <span>Active Since {CURRENT_SEASON - Math.max(0, playerMeta.experience - 1)}</span>}
                </div>
                {careerHighlights.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {careerHighlights.map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-lg px-3 py-1.5"
                        style={{
                          background: heroBg
                            ? (heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.12)' : 'rgba(12,15,20,0.10)')
                            : 'var(--color-fill)',
                        }}
                      >
                        <div className="text-lg font-bold leading-tight" style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}>
                          {value}
                        </div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)' }}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={onClose} className="shrink-0 p-1.5" style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="py-10 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
              Loading player stats...
            </div>
          ) : error ? (
            <div className="py-10 text-sm" style={{ color: 'var(--color-accent-red)' }}>
              {error}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
                      Statistics Snapshot
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenFullProfile?.()}
                    className="rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
                    style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
                  >
                    Open Full Stats
                  </button>
                </div>

                {fantasyRows.length > 0 && (
                  <SummarySection heading="Fantasy" rows={fantasyRows} showFantasyMeta={false} />
                )}

                {seasonSections.length > 0 ? (
                  seasonSections.map((section) => (
                    <SummarySection key={section.heading} heading={section.heading} rows={section.rows} />
                  ))
                ) : (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}>
                    No current-season stat summary is available for this player yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}
