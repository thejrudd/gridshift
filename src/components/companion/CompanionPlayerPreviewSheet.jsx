import { useEffect, useMemo, useState } from 'react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { CURRENT_SEASON, fetchPlayerStats, headshot } from '../../utils/playerApi';
import { buildRankMap, buildStatMap, getStatRows } from '../../utils/playerMetrics';
import { getFantasyContribution } from '../../utils/fantasyStatContributions';
import { buildStatisticsPlayerMetaFromSleeperId, STATISTICS_MODES } from '../../utils/playerDrilldown';
import { getTeamPalette } from '../../data/teamColors';

const MODE_OPTIONS = [
  { id: STATISTICS_MODES.GAME, label: 'Game Stats' },
  { id: STATISTICS_MODES.FANTASY, label: 'Fantasy Values' },
];

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

export default function CompanionPlayerPreviewSheet({ playerId, onClose, onViewStats }) {
  useBodyScrollLock();
  const { hasLeague, activeScoringSettings } = useSleeperLeague();
  const {
    players,
    loadPlayers,
    espnIdOverrides,
  } = useSleeperStats();
  const { darkMode } = useTheme();
  const [mode, setMode] = useState(STATISTICS_MODES.FANTASY);
  const [statsRequest, setStatsRequest] = useState({ playerId: null, data: null, error: null });
  const [headshotError, setHeadshotError] = useState(false);

  useEffect(() => { if (!players) loadPlayers(); }, [loadPlayers, players]);

  const playerMeta = useMemo(
    () => buildStatisticsPlayerMetaFromSleeperId(playerId, players, espnIdOverrides),
    [espnIdOverrides, playerId, players],
  );
  const canShowFantasy = hasLeague && !!activeScoringSettings;
  const activeMode = canShowFantasy ? mode : STATISTICS_MODES.GAME;

  useEffect(() => {
    let cancelled = false;
    if (!playerMeta?.id) return () => { cancelled = true; };

    fetchPlayerStats(playerMeta.id, CURRENT_SEASON)
      .then((data) => {
        if (cancelled) return;
        setStatsRequest({ playerId: playerMeta.id, data, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setStatsRequest({ playerId: playerMeta.id, data: null, error: 'Unable to load player statistics.' });
      });

    return () => { cancelled = true; };
  }, [playerMeta?.id]);

  const statsJson = statsRequest.playerId === playerMeta?.id ? statsRequest.data : null;
  const loading = !!playerMeta?.id && statsRequest.playerId !== playerMeta.id;
  const error = statsRequest.playerId === playerMeta?.id ? statsRequest.error : null;

  const previewSections = useMemo(() => {
    if (!statsJson || !playerMeta) return [];
    const statsMap = buildStatMap(statsJson);
    const rankMap = buildRankMap(statsJson);
    const { standard = [] } = getStatRows(statsMap, playerMeta.position, rankMap);

    return standard
      .map((section) => ({
        ...section,
        rows: section.rows
          .map((row) => {
            const fantasyPoints = canShowFantasy && activeMode === STATISTICS_MODES.FANTASY
              ? getFantasyContribution(row.key, statsMap, playerMeta.position, activeScoringSettings)
              : null;

            if (activeMode === STATISTICS_MODES.FANTASY) {
              if (fantasyPoints == null || fantasyPoints === 0) return null;
              return {
                ...row,
                value: fantasyPoints.toFixed(2),
                rank: null,
                valueSuffix: null,
              };
            }

            return row;
          })
          .filter(Boolean)
          .slice(0, 6),
      }))
      .filter((section) => section.rows.length > 0)
      .slice(0, 3);
  }, [activeMode, activeScoringSettings, canShowFantasy, playerMeta, statsJson]);

  const palette = getTeamPalette(playerMeta?.teamId);
  const heroBg = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const heroOnBg = heroBg && hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroOnBgMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.68)' : 'rgba(12,15,20,0.60)';

  return (
    <div className="companion-player-preview-overlay lg:hidden">
      <button className="companion-player-preview-backdrop" type="button" onClick={onClose} aria-label="Close player preview" />
      <div className="companion-player-preview-sheet" role="dialog" aria-modal="true" aria-label="Player statistics preview">
        <div className="companion-player-preview-handle-row">
          <div className="companion-player-preview-handle" />
          <button className="companion-player-preview-close" type="button" onClick={onClose} aria-label="Close player preview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="companion-player-preview-hero"
          style={{
            background: heroBg
              ? `linear-gradient(135deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.32)} 100%)`
              : 'var(--color-bg-secondary)',
            borderLeft: heroAccent ? `4px solid ${heroAccent}` : undefined,
          }}
        >
          {!headshotError && playerMeta?.id ? (
            <img
              src={headshot(playerMeta.id)}
              alt={playerMeta.displayName}
              className="companion-player-preview-avatar"
              style={{ background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill)' }}
              onError={() => setHeadshotError(true)}
            />
          ) : (
            <div
              className="companion-player-preview-avatar companion-player-preview-avatar-fallback"
              style={{ background: heroBg ? darkenHex(heroBg, 0.45) : 'var(--color-fill)', color: heroOnBgMuted }}
            >
              {(playerMeta?.displayName ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="companion-player-preview-name" style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}>
              {playerMeta?.displayName ?? 'Player'}
            </div>
            <div className="companion-player-preview-meta" style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)' }}>
              {playerMeta?.position || '—'} · {playerMeta?.teamId ?? 'FA'} · {CURRENT_SEASON}
            </div>
          </div>
        </div>

        {canShowFantasy && (
          <div className="companion-player-preview-mode">
            {MODE_OPTIONS.map((option) => {
              const selected = activeMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  className="companion-player-preview-mode-button"
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
        )}

        <div className="companion-player-preview-body">
          {!playerMeta ? (
            <PreviewMessage tone="error">Statistics are unavailable for this player.</PreviewMessage>
          ) : loading ? (
            <PreviewMessage>Loading statistics...</PreviewMessage>
          ) : error ? (
            <PreviewMessage tone="error">{error}</PreviewMessage>
          ) : previewSections.length === 0 ? (
            <PreviewMessage>No current-season statistics are available.</PreviewMessage>
          ) : (
            <div className="space-y-4">
              {previewSections.map((section) => (
                <PreviewSection key={section.heading} section={section} />
              ))}
            </div>
          )}
        </div>

        <div className="companion-player-preview-actions">
          <button
            type="button"
            className="companion-player-preview-full"
            onClick={() => {
              onClose();
              onViewStats?.(playerId);
            }}
            disabled={!playerMeta}
          >
            Open Full Statistics
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewMessage({ children, tone }) {
  return (
    <div className="companion-player-preview-message" style={{ color: tone === 'error' ? 'var(--color-accent-red)' : 'var(--color-label-secondary)' }}>
      {children}
    </div>
  );
}

function PreviewSection({ section }) {
  return (
    <div>
      <div className="companion-player-preview-section-title">{section.heading}</div>
      <div className="companion-player-preview-grid">
        {section.rows.map(({ label, value, valueSuffix, rank }) => (
          <div key={label} className="companion-player-preview-stat">
            <span className="companion-player-preview-stat-label">{label}</span>
            <span className="companion-player-preview-stat-value">
              {value}
              {valueSuffix && <span className="companion-player-preview-stat-suffix"> {valueSuffix}</span>}
              {rank && <span className="companion-player-preview-stat-rank"> ({rank})</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
