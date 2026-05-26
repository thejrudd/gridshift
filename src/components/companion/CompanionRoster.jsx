import { useEffect, useMemo, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG } from '../../utils/projectionEngine';
import CompanionPlayerPreviewSheet from './CompanionPlayerPreviewSheet';
import { getTeamColorKey, getTeamPalette } from '../../data/teamColors.js';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import PlayerStatusBadge, { PlayerStatusLogoCluster } from './PlayerStatusBadge.jsx';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { POSITION_COLORS } from '../../utils/companionAssetVisuals.js';
import CompanionPlayerRow, { CompanionPlayerAction, CompanionPlayerMetric } from './CompanionPlayerRow.jsx';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'];
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const MOBILE_SHEET_QUERY = '(max-width: 1023px)';
const ROSTER_ROW_LEFT_BORDER = 4;

function getRosterPlayerIds(roster) {
  return [...new Set([...(roster?.players || []), ...(roster?.reserve || [])])];
}

function hasScoreSource(stats) {
  if (!stats) return false;
  if (Number.isFinite(Number(stats._fantasyPoints ?? stats.fantasy_points ?? stats.appliedTotal))) return true;
  return Object.entries(stats).some(([key, value]) => (
    typeof value === 'number'
    && !key.startsWith('_')
    && !['week', 'gp', 'games_played', 'fantasy_points', 'appliedTotal'].includes(key)
  ));
}

function getWeeklySeasonPoints(weekly, scoring, position) {
  if (!weekly?.length) return null;
  let total = 0;
  let hasAnyScore = false;
  for (const row of weekly) {
    if (!hasScoreSource(row)) continue;
    total += calcPoints(row, scoring, position);
    hasAnyScore = true;
  }
  return hasAnyScore ? total : null;
}

function getRosterSeasonPoints(stats, weekly, scoring, position) {
  if (hasScoreSource(stats)) return calcPointsFromTotals(stats, scoring, position);
  return getWeeklySeasonPoints(weekly, scoring, position);
}

function getRosterAvgPPG(weekly, stats, seasonPoints, scoring, position) {
  const weeklyAvg = getAvgPPG(weekly, scoring, position);
  if (weeklyAvg > 0) return weeklyAvg;

  const games = Number(stats?.gp ?? stats?.games_played);
  if (seasonPoints != null && Number.isFinite(games) && games > 0) {
    return Math.round((seasonPoints / games) * 10) / 10;
  }

  return null;
}


function measureMaxNameWidth(players) {
  if (typeof document === 'undefined' || !players.length) return 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = '850 15px Figtree, sans-serif';
  return Math.ceil(players.reduce((max, p) =>
    Math.max(max, ctx.measureText(p.name ?? '').width), 0)) + 14;
}

function getRosterLayout(isCompactPhone, nameColPx) {
  if (isCompactPhone) {
    return {
      avatarSize: 38,
      gap: 8,
      nameFontSize: 13,
      metaFontSize: 11,
      rowTemplate: '38px minmax(0,1fr) 28px 50px 44px',
      sidePadding: 8,
      tradeWidth: 30,
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

export default function CompanionRoster({ onTradePlayer, onViewPlayer, tradeDisabled = false }) {
  const {
    platform, season,
    players, loadPlayers,
    weeklyStats, seasonStats, loadSeasonStats,
    statsLoading,
    activeScoringSettings,
    myRoster,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const useMobilePreviewSheet = useMediaQuery(MOBILE_SHEET_QUERY);

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  const roster = myRoster();
  const rosterPlayerIds = useMemo(() => getRosterPlayerIds(roster), [roster]);
  const hasRosterWeeklyRows = useMemo(() => (
    rosterPlayerIds.some((id) => (weeklyStats?.[id] ?? []).length > 0)
  ), [rosterPlayerIds, weeklyStats]);
  useEffect(() => {
    if (statsLoading) return;
    if (platform === 'espn') {
      if (!seasonStats || (rosterPlayerIds.length > 0 && !hasRosterWeeklyRows)) loadSeasonStats();
      return;
    }
    if (!seasonStats) loadSeasonStats();
  }, [platform, rosterPlayerIds, hasRosterWeeklyRows, seasonStats, statsLoading, loadSeasonStats]);

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, activeScoringSettings),
    [seasonStats, players, activeScoringSettings],
  );

  const rosterPlayers = useMemo(() => {
    if (!roster || !players) return [];

    return rosterPlayerIds.map(id => {
      const p = players[id];
      if (!p) return null;

      const stats = seasonStats?.[id] ?? null;
      const weekly = weeklyStats?.[id] ?? [];
      const pts = getRosterSeasonPoints(stats, weekly, activeScoringSettings, p.position);
      const avgPPG = getRosterAvgPPG(weekly, stats, pts, activeScoringSettings, p.position);
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
        availabilityStatus: getPlayerAvailabilityStatus(p, { isReserve }),
        teamTheme: teamRowTheme(p.team || '', darkMode),
      };
    }).filter(Boolean);
  }, [roster, rosterPlayerIds, players, seasonStats, weeklyStats, activeScoringSettings, positionalRanks, darkMode]);

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
  const emptyRosterMessage = platform === 'espn'
    ? `No players on your ESPN roster for ${season}. ESPN often returns empty offseason rosters; choose a completed season to view roster history.`
    : 'No players on your roster.';

  if (!roster) {
    return <EmptyState message="Could not find your roster in this league." />;
  }

  if (!players) {
    return <LoadingState label="Loading player database..." />;
  }

  return (
    <div className="pb-6">
      {statsLoading && <RosterStatsLoadingBanner />}

      <div className="px-2 sm:px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
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
            {isCompactPhone && <div />}
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Season
            </span>
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
              Avg/G
            </span>
            {!isCompactPhone && <div />}
          </div>
          <div className="shrink-0 ml-2 sm:ml-3" style={{ width: layout.tradeWidth }} />
        </div>
      </div>

      {POSITION_ORDER.filter(pos => grouped[pos]?.length).map(pos => (
        <div key={pos} className="mb-4">
          <div
            className="mx-2 sm:mx-4 mb-0 px-4 py-2 text-xs font-bold uppercase tracking-widest"
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
              onSelect={() => {
                if (useMobilePreviewSheet) setSelectedPlayerId(player.id);
                else onViewPlayer?.(player.id);
              }}
              onTrade={onTradePlayer ? () => onTradePlayer(player.id) : null}
              tradeDisabled={tradeDisabled}
            />
          ))}
        </div>
      ))}

      {rosterPlayers.length === 0 && !statsLoading && (
        <EmptyState message={emptyRosterMessage} />
      )}

      {selectedPlayerId && (
        <CompanionPlayerPreviewSheet
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onViewStats={onViewPlayer}
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

function PlayerRow({ player, onSelect, onTrade, tradeDisabled = false, layout, isCompactPhone }) {
  const { darkMode } = useTheme();
  const rankLabel = player.rank ? `${player.rank.posLabel}${player.rank.rank}` : null;
  const showReserveMeta = player.isReserve && player.availabilityStatus !== 'Injured Reserve';
  const metaSegments = [
    player.position,
    player.team,
    showReserveMeta ? 'IR' : null,
    rankLabel,
  ].filter(Boolean);
  const nameCol = layout.rowTemplate.match(/44px (.+?) auto 1fr/)?.[1] ?? 'minmax(0,1fr)';
  const rowTemplate = isCompactPhone
    ? '38px minmax(0,1fr) minmax(122px,auto)'
    : `44px ${nameCol} minmax(0,1fr) 12px`;

  return (
    <div className="px-2 sm:px-4">
      <div className="flex items-center w-full">
        <CompanionPlayerRow
          player={player}
          darkMode={darkMode}
          onClick={onSelect}
          className="companion-roster-row flex-1"
          showPosition={false}
          showTeamLogo={false}
          compact={isCompactPhone}
          metaSegments={metaSegments}
          gridTemplate={rowTemplate}
          columnGridTemplate={isCompactPhone ? '28px 50px 44px' : 'auto 1fr 64px 56px'}
          columns={[
            isCompactPhone && (
              <div key="mobile-status" className="flex items-center justify-center">
                <PlayerStatusBadge status={player.availabilityStatus} compact />
              </div>
            ),
            !isCompactPhone && (
              <PlayerStatusLogoCluster
                key="status"
                logoKey={player.teamTheme.logoKey}
                status={player.availabilityStatus}
                className="justify-start self-center"
              />
            ),
            !isCompactPhone && <div key="spacer" />,
            <CompanionPlayerMetric
              key="season"
              value={player.pts !== null ? player.pts.toFixed(1) : '-'}
              align="center"
              compact={isCompactPhone}
            />,
            <CompanionPlayerMetric
              key="avg"
              value={player.avgPPG > 0 ? player.avgPPG.toFixed(1) : '-'}
              align="center"
              compact={isCompactPhone}
            />,
          ].filter(Boolean)}
          trailing={!isCompactPhone ? (
            <svg width={isCompactPhone ? 10 : 12} height={isCompactPhone ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          ) : null}
          style={{
            gap: layout.gap,
            columnGap: layout.gap,
            borderLeftWidth: ROSTER_ROW_LEFT_BORDER,
            borderRadius: 0,
            padding: `${layout.verticalPadding}px ${layout.sidePadding}px`,
          }}
        />

        {(onTrade || tradeDisabled) && (
          <div
            className="shrink-0"
            style={{
              width: layout.tradeWidth,
              height: isCompactPhone ? layout.tradeWidth : undefined,
              marginLeft: isCompactPhone ? 8 : 12,
            }}
          >
            <CompanionPlayerAction
              label={`Trade ${player.name}`}
              onClick={onTrade}
              disabled={tradeDisabled}
              title={tradeDisabled ? 'Trade is not available for ESPN leagues yet.' : undefined}
              className="w-full rounded-lg font-semibold transition-colors active:opacity-60 inline-flex items-center justify-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 3h5v5" />
                <path d="M8 21H3v-5" />
                <path d="m21 3-7 7" />
                <path d="m3 21 7-7" />
              </svg>
              {!isCompactPhone && <span>Trade</span>}
            </CompanionPlayerAction>
          </div>
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
