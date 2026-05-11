import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperLeague, useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG } from '../../utils/projectionEngine';
import { getTradedPicks, getLeagueDrafts } from '../../api/sleeperApi';
import CompanionPlayerPreviewSheet from './CompanionPlayerPreviewSheet';
import { getTeamColorKey, getTeamPalette } from '../../data/teamColors.js';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import HorizontalScrollCue from '../HorizontalScrollCue.jsx';
import useHorizontalScrollCue from '../../hooks/useHorizontalScrollCue.js';
import PlayerStatusBadge, { PlayerStatusLogoCluster } from './PlayerStatusBadge.jsx';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { CompanionFantasyTeamMenu, CompanionSelectorButton } from './CompanionSelectorControls.jsx';
import { POSITION_COLORS } from '../../utils/companionAssetVisuals.js';
import CompanionPlayerRow, { CompanionPlayerAction, CompanionPlayerMetric } from './CompanionPlayerRow.jsx';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'];
const MAX_ROUNDS = 36; // generous cap — Sleeper dynasty startups can run 25+ rounds

const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const MOBILE_SHEET_QUERY = '(max-width: 1023px)';
const LEAGUE_ROW_LEFT_BORDER = 4;

function getLeagueLayout(isCompactPhone, nameColPx) {
  if (isCompactPhone) {
    return {
      avatarSize: 38,
      gap: 8,
      nameFontSize: 13,
      metaFontSize: 11,
      rowTemplate: '38px minmax(0,1fr) 50px 44px 10px',
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

function measureMaxNameWidth(players) {
  if (typeof document === 'undefined' || !players.length) return 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = '600 14px Figtree, sans-serif';
  return Math.ceil(players.reduce((max, p) =>
    Math.max(max, ctx.measureText(p.name ?? '').width), 0)) + 8;
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

export default function CompanionLeague({ onTradePlayer, onViewPlayer = null, routeState = null, onRouteStateChange = null }) {
  const subView = routeState?.subView ?? 'roster';

  return (
    <div className="pb-6">
      {/* Sub-view toggle */}
      <div className="px-4 pb-4 flex gap-2">
        {[['roster', 'Rosters'], ['picks', 'Draft Picks']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => onRouteStateChange?.({ ...(routeState ?? {}), subView: id })}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: subView === id ? 'var(--color-signature)' : 'var(--color-fill)',
              color: subView === id ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {subView === 'roster' && (
        <LeagueRosterView
          onTradePlayer={onTradePlayer}
          onViewPlayer={onViewPlayer}
          selectedRosterIdProp={routeState?.rosterId ?? null}
          onSelectedRosterChange={(rosterId) => onRouteStateChange?.({ ...(routeState ?? {}), subView: 'roster', rosterId })}
        />
      )}
      {subView === 'picks' && <LeaguePicksView />}
    </div>
  );
}

// ── Roster sub-view ───────────────────────────────────────────────────────────

function LeagueRosterView({ onTradePlayer, onViewPlayer = null, selectedRosterIdProp = null, onSelectedRosterChange = null }) {
  const {
    leagueUsers, rosters, myRoster, getUserDisplayName,
    players, loadPlayers,
    weeklyStats, seasonStats, loadSeasonStats,
    statsLoading,
    activeScoringSettings,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const useMobilePreviewSheet = useMediaQuery(MOBILE_SHEET_QUERY);
  const useMobileTeamMenu = useMobilePreviewSheet;

  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);

  // Default to my own roster once it's available
  useEffect(() => {
    if (myRosterData && selectedRosterId === null) {
      setSelectedRosterId(myRosterData.roster_id);
    }
  }, [myRosterData, selectedRosterId]);

  useEffect(() => {
    if (selectedRosterIdProp == null) {
      setSelectedRosterId(myRosterData?.roster_id ?? null);
      return;
    }
    setSelectedRosterId(Number(selectedRosterIdProp));
  }, [selectedRosterIdProp, myRosterData?.roster_id]);

  useEffect(() => {
    if (selectedRosterId == null) return;
    if (selectedRosterIdProp != null && Number(selectedRosterIdProp) === selectedRosterId) return;
    onSelectedRosterChange?.(String(selectedRosterId));
  }, [selectedRosterId, selectedRosterIdProp, onSelectedRosterChange]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, activeScoringSettings),
    [seasonStats, players, activeScoringSettings],
  );

  const selectedRoster = useMemo(
    () => rosters.find(r => r.roster_id === selectedRosterId) ?? null,
    [rosters, selectedRosterId],
  );

  const rosterPlayers = useMemo(() => {
    if (!selectedRoster || !players) return [];
    // Sleeper includes IR players in both `players` and `reserve` — deduplicate via Set
    const playerIds = [...new Set([...(selectedRoster.players || []), ...(selectedRoster.reserve || [])])];
    return playerIds.map(id => {
      const p = players[id];
      if (!p) return null;
      const stats = seasonStats?.[id] ?? null;
      const weekly = weeklyStats?.[id] ?? [];
      const pts = stats ? calcPointsFromTotals(stats, activeScoringSettings, p.position) : null;
      const avgPPG = getAvgPPG(weekly, activeScoringSettings, p.position);
      const rank = positionalRanks[id] ?? null;
      const isReserve = selectedRoster.reserve?.includes(id);
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
  }, [selectedRoster, players, seasonStats, weeklyStats, activeScoringSettings, positionalRanks, darkMode]);

  const nameColPx = useMemo(() => measureMaxNameWidth(rosterPlayers), [rosterPlayers]);
  const layout = useMemo(() => getLeagueLayout(isCompactPhone, nameColPx), [isCompactPhone, nameColPx]);

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

  // Sort rosters: my team first, then alphabetically by display name
  const sortedRosters = useMemo(() => {
    const myId = myRosterData?.roster_id;
    return [...rosters].sort((a, b) => {
      if (a.roster_id === myId) return -1;
      if (b.roster_id === myId) return 1;
      return getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id));
    });
  }, [rosters, myRosterData, getUserDisplayName]);
  const rosterFilterOptions = useMemo(() => {
    const userById = new Map((leagueUsers ?? []).map((user) => [user.user_id, user]));
    return sortedRosters.map((roster) => {
      const name = getUserDisplayName(roster.owner_id);
      return {
        id: String(roster.roster_id),
        name,
        avatarHash: userById.get(roster.owner_id)?.avatar ?? null,
        isMe: roster.roster_id === myRosterData?.roster_id,
      };
    });
  }, [getUserDisplayName, leagueUsers, myRosterData?.roster_id, sortedRosters]);
  const selectedRosterOption = useMemo(
    () => rosterFilterOptions.find((roster) => Number(roster.id) === selectedRosterId) ?? null,
    [rosterFilterOptions, selectedRosterId],
  );
  const ownerRailRef = useRef(null);
  const ownerRailCue = useHorizontalScrollCue(ownerRailRef, [sortedRosters.length, selectedRosterId]);

  return (
    <>
      {/* Owner selector */}
      {useMobileTeamMenu ? (
        <div className="px-4 pb-3">
          <CompanionFantasyTeamMenu
            open={teamMenuOpen}
            options={rosterFilterOptions}
            selectedIds={selectedRosterId == null ? [] : [String(selectedRosterId)]}
            selectedOptions={selectedRosterOption ? [selectedRosterOption] : []}
            onOpenChange={setTeamMenuOpen}
            onChange={(nextRosterIds) => {
              const nextRosterId = Number(nextRosterIds[0]);
              if (Number.isFinite(nextRosterId)) setSelectedRosterId(nextRosterId);
            }}
            mode="single"
            includeAll={false}
            menuLabel="League roster selector"
          />
        </div>
      ) : (
        <div className="companion-owner-selector-shell relative">
          <div ref={ownerRailRef} className="px-3 sm:px-4 pb-3 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2" style={{ width: 'max-content' }}>
              {sortedRosters.map(roster => {
                const isSelected = roster.roster_id === selectedRosterId;
                const isMe = roster.roster_id === myRosterData?.roster_id;
                const name = getUserDisplayName(roster.owner_id);
                const user = leagueUsers.find(u => u.user_id === roster.owner_id);
                const avatarHash = user?.avatar;
                return (
                  <CompanionSelectorButton
                    key={roster.roster_id}
                    onClick={() => setSelectedRosterId(roster.roster_id)}
                    active={isSelected}
                    className="gap-1.5"
                  >
                    {avatarHash ? (
                      <img
                        src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                        alt={name}
                        className="w-5 h-5 rounded-full shrink-0 object-cover"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                        style={{ background: 'var(--color-fill-secondary)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs whitespace-nowrap">{name}{isMe ? ' (Me)' : ''}</span>
                  </CompanionSelectorButton>
                );
              })}
            </div>
          </div>
          <HorizontalScrollCue left={ownerRailCue.left} right={ownerRailCue.right} />
        </div>
      )}

      {/* Stats loading banner */}
      {statsLoading && <LeagueStatsLoadingBanner />}

      {/* Column headers */}
      <div className="px-2 sm:px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
        <div className="flex items-center w-full">
          <div
            className="grid items-center flex-1 min-w-0"
            style={{
              gridTemplateColumns: layout.rowTemplate,
              columnGap: layout.gap,
              paddingLeft: layout.sidePadding + LEAGUE_ROW_LEFT_BORDER,
              paddingRight: layout.sidePadding,
            }}
          >
            <div />
            <span className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
            {!isCompactPhone && <div />}
            {!isCompactPhone && <div />}
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>Season</span>
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>Avg/G</span>
            <div />
          </div>
          <div className="shrink-0 ml-2 sm:ml-3" style={{ width: layout.tradeWidth }} />
        </div>
      </div>

      {!players && <EmptyState message="Loading player database…" />}

      {players && selectedRoster && (
        POSITION_ORDER.filter(pos => grouped[pos]?.length).map(pos => (
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
            {grouped[pos].map(player => {
              const isOpponent = selectedRosterId !== myRosterData?.roster_id;
              const isOwnRoster = selectedRosterId === myRosterData?.roster_id;
              return (
                <LeagueResponsivePlayerRow key={player.id} player={player} layout={layout} isCompactPhone={isCompactPhone} onSelect={() => {
                  if (useMobilePreviewSheet) setSelectedPlayerId(player.id);
                  else onViewPlayer?.(player.id);
                }}
                  onTrade={
                    onTradePlayer && isOpponent ? () => onTradePlayer(player.id, selectedRosterId, 'get')
                    : onTradePlayer && isOwnRoster ? () => onTradePlayer(player.id, null, 'give')
                    : null
                  } />
              );
            })}
          </div>
        ))
      )}

      {players && rosterPlayers.length === 0 && !statsLoading && (
        <EmptyState message="No players on this roster." />
      )}

      {selectedPlayerId && (
        <CompanionPlayerPreviewSheet
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onViewStats={onViewPlayer}
        />
      )}
    </>
  );
}

function LeagueStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();

  return (
    <div
      className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-3"
      style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}
    >
      <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
        Loading stats {statsProgress}%
      </span>
    </div>
  );
}

function LeagueResponsivePlayerRow({ player, onSelect, onTrade, layout, isCompactPhone }) {
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
    ? '38px minmax(0,1fr) minmax(96px,auto) auto 10px'
    : `44px ${nameCol} minmax(0,1fr) 12px`;

  return (
    <div className="px-2 sm:px-4">
      <div className="flex items-center w-full">
        <CompanionPlayerRow
          player={player}
          darkMode={darkMode}
          onClick={onSelect}
          className="flex-1"
          showPosition={false}
          showTeamLogo={false}
          compact={isCompactPhone}
          metaSegments={metaSegments}
          gridTemplate={rowTemplate}
          columnGridTemplate={isCompactPhone ? '50px 44px' : 'auto 1fr 64px 56px'}
          status={isCompactPhone ? <PlayerStatusBadge status={player.availabilityStatus} compact /> : null}
          columns={[
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
          trailing={(
            <svg width={isCompactPhone ? 10 : 12} height={isCompactPhone ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
          style={{
            gap: layout.gap,
            columnGap: layout.gap,
            borderLeftWidth: LEAGUE_ROW_LEFT_BORDER,
            borderRadius: 0,
            padding: `${layout.verticalPadding}px ${layout.sidePadding}px`,
          }}
        />

        {onTrade && (
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

// ── Draft Picks sub-view ──────────────────────────────────────────────────────

function LeaguePicksView() {
  const { selectedLeagueId, rosters, leagueUsers, league, season, getUserDisplayName } = useSleeperLeague();
  const [tradedPicks, setTradedPicks] = useState(null);
  const [draftRounds, setDraftRounds] = useState(null); // max rounds across all league drafts
  const [picksLoading, setPicksLoading] = useState(false);

  useEffect(() => {
    if (!selectedLeagueId) return;
    setPicksLoading(true);
    Promise.all([
      getTradedPicks(selectedLeagueId).catch(() => []),
      getLeagueDrafts(selectedLeagueId).catch(() => []),
    ]).then(([picks, drafts]) => {
      setTradedPicks(picks ?? []);
      // Take the highest rounds value across all drafts (startup > rookie in dynasty)
      const maxFromDrafts = (drafts ?? []).reduce((max, d) => Math.max(max, d.settings?.rounds ?? 0), 0);
      setDraftRounds(maxFromDrafts || null);
    }).finally(() => setPicksLoading(false));
  }, [selectedLeagueId]);

  // Build the picks matrix from traded_picks data
  const { slots, years, rosterPicks } = useMemo(() => {
    if (!tradedPicks || !rosters || !league) return { slots: [], years: [], rosterPicks: {} };

    // Priority for round count:
    //   1. Max rounds across all league drafts (startup draft in dynasty can be 17+)
    //   2. Highest round number seen in traded picks data
    //   3. league.settings.draft_rounds (rookie draft rounds, typically 3 — last resort)
    const maxRoundsFromData = tradedPicks.reduce((max, p) => Math.max(max, p.round), 0);
    const maxRounds = Math.min(
      Math.max(draftRounds ?? 0, maxRoundsFromData, league.settings?.draft_rounds ?? 3, 3),
      MAX_ROUNDS,
    );
    const baseYear = parseInt(season);

    // Always show up to 3 future draft years, plus any additional years found in traded picks
    const yearSet = new Set([
      String(baseYear + 1),
      String(baseYear + 2),
      String(baseYear + 3),
    ]);
    for (const p of tradedPicks) yearSet.add(p.season);
    // Include current season only if picks for it have been traded
    if (tradedPicks.some(p => p.season === season)) yearSet.add(season);
    const years = [...yearSet].sort();

    // Build slots: all (year, round) combinations
    const slots = [];
    for (const year of years) {
      for (let r = 1; r <= maxRounds; r++) {
        slots.push({ key: `${year}|${r}`, year, round: r });
      }
    }

    // Build traded pick lookup: "year|round|originating_roster_id" → current owner_id
    const tradedMap = new Map();
    for (const pick of tradedPicks) {
      if (pick.round > maxRounds) continue;
      tradedMap.set(`${pick.season}|${pick.round}|${pick.roster_id}`, pick.owner_id);
    }

    // For each roster, determine their pick holdings per slot
    const rosterPicks = {};
    for (const roster of rosters) {
      const rid = roster.roster_id;
      rosterPicks[rid] = {};

      for (const { key, year, round } of slots) {
        // Own pick status: is this team's original pick for this slot still with them?
        const ownKey = `${year}|${round}|${rid}`;
        const ownCurrentOwner = tradedMap.get(ownKey);
        // If not in tradedMap → never traded → still own it
        // If in tradedMap and current owner is still rid → traded back
        const ownStatus = (ownCurrentOwner === undefined || ownCurrentOwner === rid) ? 'own' : 'traded_away';

        // Acquired picks: picks from other teams now owned by this team in this slot
        const acquired = [];
        for (const [pickKey, currentOwner] of tradedMap) {
          if (currentOwner !== rid) continue;
          const [pYear, pRound, pRosterId] = pickKey.split('|');
          if (pYear !== year || Number(pRound) !== round || Number(pRosterId) === rid) continue;
          acquired.push(Number(pRosterId));
        }

        rosterPicks[rid][key] = { ownStatus, acquired };
      }
    }

    return { slots, years, rosterPicks };
  }, [tradedPicks, draftRounds, rosters, league, season]);

  // Sort rosters by total picks currently held (most to least), then by owner name
  const sortedRosters = useMemo(() => {
    if (!rosters.length || !Object.keys(rosterPicks).length) return rosters;
    return [...rosters].sort((a, b) => {
      const picksA = countPicksHeld(rosterPicks[a.roster_id]);
      const picksB = countPicksHeld(rosterPicks[b.roster_id]);
      if (picksB !== picksA) return picksB - picksA;
      return getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id));
    });
  }, [rosters, rosterPicks, getUserDisplayName]);

  // Dynamic team-name column width (must be before early returns to maintain hook order)
  const LEFT_COL = useMemo(() => {
    if (!sortedRosters.length) return 120;
    if (typeof document === 'undefined') return 120;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 120;
    ctx.font = '600 12px Figtree, sans-serif';
    const maxTextW = Math.ceil(sortedRosters.reduce((max, r) => {
      const name = getUserDisplayName(r.owner_id);
      return Math.max(max, ctx.measureText(name).width);
    }, 0));
    // avatar 24 + gap 8 + text + px-3 padding both sides (12+12) + breathing room 8
    return Math.max(120, 24 + 8 + maxTextW + 24 + 8);
  }, [sortedRosters, getUserDisplayName]);
  const picksScrollRef = useRef(null);
  const picksScrollCue = useHorizontalScrollCue(picksScrollRef, [slots.length, sortedRosters.length, LEFT_COL]);

  if (picksLoading) {
    return <EmptyState message="Loading draft picks…" />;
  }

  if (!tradedPicks) return null;

  if (tradedPicks.length === 0 && slots.length === 0) {
    return (
      <EmptyState message="No traded picks found. This may be a redraft league, or no picks have been traded yet." />
    );
  }

  // Cell + header dimensions
  const CELL_W = 48;
  const totalWidth = LEFT_COL + slots.length * CELL_W;

  return (
    <div className="relative">
      <div ref={picksScrollRef} className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: `${totalWidth}px` }}>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 pb-3 pt-1">
          <div className="flex items-center gap-1.5">
            <OwnDot />
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Own</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center" style={{ gap: '1px' }}>
              <AcquiredDot />
              <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>OAK</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Acquired</span>
          </div>
          <div className="flex items-center gap-1.5">
            <EmptyDot />
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>Traded away</span>
          </div>
        </div>

        {/* Year group headers */}
        <div
          className="flex sticky top-0 z-10"
          style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
        >
          <div style={{ width: LEFT_COL, flexShrink: 0 }} />
          {years.map(year => {
            const colsForYear = slots.filter(s => s.year === year).length;
            return (
              <div
                key={year}
                className="text-center py-2 text-xs font-bold tracking-widest uppercase"
                style={{ width: colsForYear * CELL_W, flexShrink: 0, color: 'var(--color-label)', borderLeft: '1px solid var(--color-separator)' }}
              >
                {year}
              </div>
            );
          })}
        </div>

        {/* Round sub-headers */}
        <div
          className="flex sticky z-10"
          style={{ top: '32px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
        >
          <div
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-widest shrink-0"
            style={{ width: LEFT_COL, color: 'var(--color-label-tertiary)' }}
          >
            Team
          </div>
          {slots.map(({ key, year, round }, i) => {
            const isFirstOfYear = i === 0 || slots[i - 1].year !== year;
            return (
              <div
                key={key}
                className="text-center py-1.5 text-xs font-semibold shrink-0"
                style={{
                  width: CELL_W,
                  color: 'var(--color-label-tertiary)',
                  borderLeft: isFirstOfYear ? '1px solid var(--color-separator)' : undefined,
                }}
              >
                R{round}
              </div>
            );
          })}
        </div>

        {/* Team rows */}
        {sortedRosters.map((roster, rowIdx) => {
          const picks = rosterPicks[roster.roster_id] ?? {};
          const user = leagueUsers.find(u => u.user_id === roster.owner_id);
          const name = getUserDisplayName(roster.owner_id);
          const avatarHash = user?.avatar;
          const totalHeld = countPicksHeld(picks);

          return (
            <div
              key={roster.roster_id}
              className="flex items-center"
              style={{
                borderBottom: '1px solid var(--color-separator)',
                background: rowIdx % 2 === 0 ? 'transparent' : 'var(--color-fill-secondary)',
                minHeight: '44px',
              }}
            >
              {/* Team name column */}
              <div
                className="flex items-center gap-2 px-3 shrink-0"
                style={{ width: LEFT_COL }}
              >
                {avatarHash ? (
                  <img
                    src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                    alt={name}
                    className="w-6 h-6 rounded-full shrink-0 object-cover"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--color-fill)', fontSize: '10px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                    {name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-label)' }}>
                    {name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
                    {totalHeld} picks
                  </div>
                </div>
              </div>

              {/* Pick cells */}
              {slots.map(({ key, year }, i) => {
                const cell = picks[key] ?? { ownStatus: 'own', acquired: [] };
                const isFirstOfYear = i === 0 || slots[i - 1].year !== year;
                return (
                  <PickCell
                    key={key}
                    cell={cell}
                    rosters={rosters}
                    getUserDisplayName={getUserDisplayName}
                    width={CELL_W}
                    borderLeft={isFirstOfYear}
                  />
                );
              })}
            </div>
          );
        })}
        </div>
      </div>
      <HorizontalScrollCue left={picksScrollCue.left} right={picksScrollCue.right} />
    </div>
  );
}

function PickCell({ cell, rosters, getUserDisplayName, width, borderLeft }) {
  const { ownStatus, acquired } = cell;
  const hasAnyPick = ownStatus === 'own' || acquired.length > 0;

  return (
    <div
      className="flex flex-col items-center justify-center gap-1 shrink-0"
      style={{
        width,
        minHeight: '44px',
        padding: '4px 0',
        borderLeft: borderLeft ? '1px solid var(--color-separator)' : undefined,
      }}
    >
      {/* Own pick: amber filled dot */}
      {ownStatus === 'own' && <OwnDot />}

      {/* Acquired picks: filled accent dot + team abbreviation label */}
      {acquired.map(fromRosterId => {
        const ownerName = getUserDisplayName(
          rosters.find(r => r.roster_id === fromRosterId)?.owner_id
        );
        const abbr = (ownerName || '?').slice(0, 3).toUpperCase();
        return (
          <div key={fromRosterId} className="flex flex-col items-center" style={{ gap: '1px' }}>
            <AcquiredDot />
            <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.02em', lineHeight: 1 }}>
              {abbr}
            </span>
          </div>
        );
      })}

      {/* No pick at all: dim empty circle */}
      {!hasAnyPick && <EmptyDot />}
    </div>
  );
}

function OwnDot() {
  return (
    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, background: 'var(--color-signature)' }} />
  );
}

function AcquiredDot() {
  return (
    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, background: 'var(--color-accent)' }} />
  );
}

function EmptyDot() {
  return (
    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, border: '2px solid var(--color-label-tertiary)' }} />
  );
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function countPicksHeld(picks) {
  if (!picks) return 0;
  let count = 0;
  for (const cell of Object.values(picks)) {
    if (cell.ownStatus === 'own') count++;
    count += cell.acquired.length;
  }
  return count;
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-20 px-6">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
