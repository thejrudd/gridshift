import { useEffect, useMemo, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG } from '../../utils/projectionEngine';
import PlayerWeeklySheet from './PlayerWeeklySheet';
import { getTeamColorKey, getTeamPalette } from '../../data/teamColors.js';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'];
const POSITION_COLORS = {
  QB: '#ef4444',
  RB: '#22c55e',
  WR: '#3b82f6',
  TE: '#f59e0b',
  K: '#8b5cf6',
  DEF: '#6b7280',
};
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const ROSTER_ROW_LEFT_BORDER = 4;

function measureMaxNameWidth(players) {
  if (typeof document === 'undefined' || !players.length) return 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = '600 14px Figtree, sans-serif';
  return Math.ceil(players.reduce((max, p) =>
    Math.max(max, ctx.measureText(p.name ?? '').width), 0)) + 8;
}

function getRosterLayout(isCompactPhone, nameColPx) {
  if (isCompactPhone) {
    return {
      avatarSize: 38,
      gap: 8,
      nameFontSize: 13,
      metaFontSize: 11,
      rowTemplate: '38px minmax(0,1fr) 54px 48px 10px',
      sidePadding: 10,
      tradeWidth: 32,
      verticalPadding: 11,
    };
  }

  const nameCol = nameColPx ? `minmax(0,${nameColPx}px)` : 'minmax(0,1fr)';
  return {
    avatarSize: 44,
    gap: 10,
    nameFontSize: 14,
    metaFontSize: 12,
    rowTemplate: `44px ${nameCol} auto 1fr 64px 56px 12px`,
    sidePadding: 14,
    tradeWidth: 84,
    verticalPadding: 10,
  };
}

function getInjuryStatusLabel(status, compact) {
  if (!compact || !status) return status;

  const LABELS = {
    'Questionable': 'Q',
    'Probable': 'P',
    'Doubtful': 'D',
    'Out': 'OUT',
    'Injured Reserve': 'IR',
    'Physically Unable to Perform': 'PUP',
  };

  return LABELS[status] ?? status.slice(0, 3).toUpperCase();
}

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function getColorChroma(hex) {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function mixHex(baseHex, mixHexColor, mixAmount) {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixHexColor);
  const blend = (a, b) => Math.round(a + (b - a) * mixAmount);
  return `#${blend(base.r, mix.r).toString(16).padStart(2, '0')}${blend(base.g, mix.g).toString(16).padStart(2, '0')}${blend(base.b, mix.b).toString(16).padStart(2, '0')}`;
}

function getContrastRatio(foreground, background) {
  const fg = hexLuminance(foreground);
  const bg = hexLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function liftColorForDarkCanvas(hex, minContrast = 2.25) {
  const darkCanvas = '#0C0F14';
  if (getContrastRatio(hex, darkCanvas) >= minContrast) return hex;

  for (let step = 0.18; step <= 0.72; step += 0.06) {
    const lifted = mixHex(hex, '#FFFFFF', step);
    if (getContrastRatio(lifted, darkCanvas) >= minContrast) return lifted;
  }

  return mixHex(hex, '#FFFFFF', 0.72);
}

function isWarmRedAccent(hex) {
  const { r, g, b } = hexToRgb(hex);
  return r >= 140 && r > g + 35 && r > b + 20;
}

function getDarkModeAccent(palette) {
  const darkCanvas = '#0C0F14';
  const primaryContrast = getContrastRatio(palette.darkPrimary, darkCanvas);
  if (primaryContrast >= 3.2) return palette.darkPrimary;

  const fallbackCandidates = [
    palette.darkSecondary,
    palette.secondary,
    palette.primary,
  ].filter(Boolean);

  const rankedFallbacks = fallbackCandidates
    .map(color => ({ color, contrast: getContrastRatio(color, darkCanvas) }))
    .sort((a, b) => b.contrast - a.contrast);

  return rankedFallbacks[0]?.color ?? palette.darkPrimary ?? '#F2F1EC';
}

function getDarkModeGlowCore(palette, accent) {
  if (!accent || !palette?.primary) return '#FFFFFF';
  if (!isWarmRedAccent(accent)) return '#FFFFFF';
  if (palette.primary.toLowerCase() === accent.toLowerCase()) return '#FFFFFF';
  return liftColorForDarkCanvas(palette.primary);
}

function getLightModeTintBase(palette) {
  const primary = palette.primary;
  const secondary = palette.secondary ?? primary;
  const primaryChroma = getColorChroma(primary);
  const secondaryChroma = getColorChroma(secondary);
  const primaryLuminance = hexLuminance(primary);

  if ((primaryLuminance < 0.1 || primaryChroma < 42) && secondaryChroma >= primaryChroma + 24) {
    return secondary;
  }

  return primary;
}

function teamRowTheme(team, darkMode) {
  const palette = getTeamPalette(team);
  const logoKey = getTeamColorKey(team) ?? '';
  if (!palette) {
    return {
      logoKey,
      rowBg: 'transparent',
      hoverBg: 'var(--color-fill)',
      accent: null,
      glowCore: darkMode ? '#FFFFFF' : null,
      avatarBorder: null,
    };
  }

  const color = darkMode ? palette.darkPrimary : getLightModeTintBase(palette);
  const isLight = hexLuminance(color) > 0.35;
  const accent = darkMode
    ? getDarkModeAccent(palette)
    : (isLight ? darkenHex(color, 0.55) : color);

  return {
    logoKey,
    rowBg: `${color}${isLight ? '54' : '48'}`,
    hoverBg: `${color}${isLight ? '70' : '62'}`,
    accent,
    glowCore: darkMode ? getDarkModeGlowCore(palette, accent) : null,
    avatarBorder: accent,
  };
}

export default function CompanionRoster({ onTradePlayer, onOpenMatchupWeek }) {
  const {
    players, loadPlayers,
    weeklyStats, seasonStats, loadSeasonStats,
    statsLoading,
    scoringSettings,
    myRoster,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const roster = myRoster();

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings],
  );

  const rosterPlayers = useMemo(() => {
    if (!roster || !players) return [];

    const playerIds = [...new Set([...(roster.players || []), ...(roster.reserve || [])])];

    return playerIds.map(id => {
      const p = players[id];
      if (!p) return null;

      const stats = seasonStats?.[id] ?? null;
      const weekly = weeklyStats?.[id] ?? [];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings, p.position) : null;
      const avgPPG = getAvgPPG(weekly, scoringSettings, p.position);
      const rank = positionalRanks[id] ?? null;
      const isReserve = roster.reserve?.includes(id);

      return {
        id,
        name: p.full_name || `${p.first_name} ${p.last_name}`,
        position: p.position,
        team: p.team || 'FA',
        pts,
        avgPPG,
        rank,
        isReserve,
        injuryStatus: p.injury_status,
        teamTheme: teamRowTheme(p.team || '', darkMode),
      };
    }).filter(Boolean);
  }, [roster, players, seasonStats, weeklyStats, scoringSettings, positionalRanks, darkMode]);

  const nameColPx = useMemo(() => measureMaxNameWidth(rosterPlayers), [rosterPlayers]);
  const layout = useMemo(() => getRosterLayout(isCompactPhone, nameColPx), [isCompactPhone, nameColPx]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const p of rosterPlayers) {
      const pos = POSITION_ORDER.includes(p.position) ? p.position : 'Other';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    for (const pos of Object.keys(groups)) {
      groups[pos].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
    }
    return groups;
  }, [rosterPlayers]);

  if (!roster) {
    return <EmptyState message="Could not find your roster in this league." />;
  }

  if (!players) {
    return <LoadingState label="Loading player database..." />;
  }

  return (
    <div className="pb-6">
      {statsLoading && <RosterStatsLoadingBanner />}

      <div className="px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
        <div className="flex items-center w-full">
          <div
            className="grid items-center flex-1 min-w-0"
            style={{
              gridTemplateColumns: layout.rowTemplate,
              columnGap: layout.gap,
              paddingLeft: layout.sidePadding + ROSTER_ROW_LEFT_BORDER,
              paddingRight: layout.sidePadding,
            }}
          >
            <div />
            <span className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Player
            </span>
            {!isCompactPhone && <div />}
            {!isCompactPhone && <div />}
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Season
            </span>
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Avg/G
            </span>
            <div />
          </div>
          <div className="shrink-0 ml-2 sm:ml-3" style={{ width: layout.tradeWidth }} />
        </div>
      </div>

      {POSITION_ORDER.filter(pos => grouped[pos]?.length).map(pos => (
        <div key={pos} className="mb-4">
          <div
            className="mx-4 mb-0 px-4 py-2 text-xs font-bold uppercase tracking-widest"
            style={{
              color: 'white',
              background: POSITION_COLORS[pos] ?? 'var(--color-label-tertiary)',
            }}
          >
            {pos}
          </div>
          {grouped[pos].map(player => (
            <PlayerRow
              key={player.id}
              player={player}
              layout={layout}
              isCompactPhone={isCompactPhone}
              onSelect={() => setSelectedPlayerId(player.id)}
              onTrade={onTradePlayer ? () => onTradePlayer(player.id) : null}
            />
          ))}
        </div>
      ))}

      {rosterPlayers.length === 0 && !statsLoading && (
        <EmptyState message="No players on your roster." />
      )}

      {selectedPlayerId && (
        <PlayerWeeklySheet
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onOpenWeek={onOpenMatchupWeek}
        />
      )}
    </div>
  );
}

function RosterStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();

  return (
    <div
      className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-3"
      style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}
    >
      <div
        className="h-1 flex-1 rounded-full overflow-hidden"
        style={{ background: 'var(--color-fill-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }}
        />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
        Loading stats {statsProgress}%
      </span>
    </div>
  );
}

function PlayerRow({ player, onSelect, onTrade, layout, isCompactPhone }) {
  const { darkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isInjured = player.injuryStatus && player.injuryStatus !== 'Questionable';
  const rankLabel = player.rank ? `${player.rank.posLabel}${player.rank.rank}` : null;
  const injuryLabel = getInjuryStatusLabel(player.injuryStatus, isCompactPhone);
  const glowColor = player.teamTheme.accent ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isHovered,
    color: glowColor,
    cardColor: player.teamTheme.accent ?? null,
    darkMode,
    coreColor: darkMode ? (player.teamTheme.glowCore ?? '#FFFFFF') : null,
    outerColor: player.teamTheme.accent ?? glowColor,
  });
  const baseShadow = isHovered
    ? '0 8px 18px rgba(12,15,20,0.10), 0 2px 6px rgba(12,15,20,0.08)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
  const rowShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

  return (
    <div className="px-4">
      <div className="flex items-center w-full">
        <button
          onClick={onSelect}
          onMouseMove={glowHandlers.onMouseMove}
          onMouseEnter={(event) => {
            setIsHovered(true);
            glowHandlers.onMouseEnter?.(event);
          }}
          onMouseLeave={(event) => {
            setIsHovered(false);
            glowHandlers.onMouseLeave?.(event);
          }}
          onFocus={(event) => {
            setIsHovered(true);
            glowHandlers.onMouseEnter?.(event);
          }}
          onBlur={(event) => {
            setIsHovered(false);
            glowHandlers.onMouseLeave?.(event);
          }}
          className="relative grid items-center flex-1 min-w-0 text-left active:opacity-60"
          style={{
            gridTemplateColumns: layout.rowTemplate,
            columnGap: layout.gap,
            border: '1px solid var(--color-separator)',
            borderLeft: player.teamTheme.accent ? `4px solid ${player.teamTheme.accent}` : '4px solid var(--color-separator)',
            borderRadius: 0,
            background: isHovered ? player.teamTheme.hoverBg : player.teamTheme.rowBg,
            boxShadow: rowShadow,
            padding: `${layout.verticalPadding}px ${layout.sidePadding}px`,
            transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
            transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {borderOverlay}
          <img
            src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
            alt={player.name}
            className="rounded-full shrink-0 object-cover"
            style={{
              width: layout.avatarSize,
              height: layout.avatarSize,
              background: 'var(--color-fill)',
              border: player.teamTheme.avatarBorder ? `2px solid ${player.teamTheme.avatarBorder}` : '2px solid transparent',
            }}
            onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="min-w-0 font-semibold truncate" style={{ color: 'var(--color-label)', fontSize: layout.nameFontSize, lineHeight: 1.15 }}>
                {player.name}
              </span>
              {player.injuryStatus && (
                <span
                  className="font-bold px-1.5 py-0.5 rounded-lg shrink-0"
                  style={{
                    background: isInjured ? 'rgba(239,68,68,0.12)' : 'rgba(245,183,0,0.12)',
                    color: isInjured ? 'var(--color-accent-red)' : 'var(--color-signature)',
                    fontSize: isCompactPhone ? 9 : 10,
                  }}
                >
                  {injuryLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0 whitespace-nowrap overflow-hidden">
              <span className="shrink-0 font-semibold" style={{ color: POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)', fontSize: layout.metaFontSize }}>
                {player.position}
              </span>
              <span className="shrink-0" style={{ color: 'var(--color-label-tertiary)', fontSize: layout.metaFontSize }}>
                {player.team}
              </span>
              {player.isReserve && (
                <span className="shrink-0 font-bold" style={{ color: 'var(--color-label-tertiary)', fontSize: layout.metaFontSize - 1 }}>
                  IR
                </span>
              )}
              {rankLabel && (
                <span className="shrink-0 font-bold tabular-nums" style={{ color: 'var(--color-label-quaternary)', fontSize: layout.metaFontSize }}>
                  {rankLabel}
                </span>
              )}
            </div>
          </div>
          {!isCompactPhone && (
            <div className="flex items-center justify-start self-center" style={{ minHeight: 18 }}>
              {player.teamTheme.logoKey ? (
                <img
                  src={`https://a.espncdn.com/i/teamlogos/nfl/500/${player.teamTheme.logoKey}.png`}
                  alt=""
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ width: 'auto', height: 44, maxWidth: 44, objectFit: 'contain', opacity: 0.72 }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : null}
            </div>
          )}
          {!isCompactPhone && <div />}

          <div className="grid place-items-center min-w-0">
            <span className="block w-full text-center font-bold tabular-nums" style={{ color: 'var(--color-label)', fontSize: layout.nameFontSize }}>
              {player.pts !== null ? player.pts.toFixed(1) : '-'}
            </span>
          </div>

          <div className="grid place-items-center min-w-0">
            <span className="block w-full text-center tabular-nums" style={{ color: 'var(--color-label-secondary)', fontSize: layout.nameFontSize }}>
              {player.avgPPG > 0 ? player.avgPPG.toFixed(1) : '-'}
            </span>
          </div>

          <svg width={isCompactPhone ? 10 : 12} height={isCompactPhone ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {onTrade && (
          <button
            onClick={onTrade}
            aria-label={`Trade ${player.name}`}
            className="shrink-0 rounded-lg font-semibold transition-colors active:opacity-60 inline-flex items-center justify-center gap-1.5"
            style={{
              background: 'transparent',
              border: `1px solid ${player.teamTheme.accent ?? 'var(--color-signature)'}`,
              color: player.teamTheme.accent ?? 'var(--color-signature)',
              width: layout.tradeWidth,
              height: isCompactPhone ? layout.tradeWidth : undefined,
              marginLeft: isCompactPhone ? 8 : 12,
              padding: isCompactPhone ? 0 : '8px 12px',
              fontSize: isCompactPhone ? 0 : 12,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 3h5v5" />
              <path d="M8 21H3v-5" />
              <path d="m21 3-7 7" />
              <path d="m3 21 7-7" />
            </svg>
            {!isCompactPhone && <span>Trade</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>{label}</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-20 px-6">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
