import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, calcPointsFromTotals, getRecentAvg } from '../../utils/scoringEngine';
import { projectPlayer, buildDefenseTable, getDefenseStrength, getLeagueAvgPPG } from '../../utils/projectionEngine';
import { STADIUMS } from '../../data/stadiums';
import { getTeamColorKey, getTeamPalette } from '../../data/teamColors.js';
import useCardGlow from '../../hooks/useCardGlow.jsx';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const POSITION_COLORS = {
  QB: '#ef4444',
  RB: '#22c55e',
  WR: '#3b82f6',
  TE: '#f59e0b',
  K: '#8b5cf6',
};
const METRIC_COL_WIDTH = 72;
const WAIVER_ROW_GAP = 12;
const WAIVER_ROW_SIDE_PADDING = 16;
const WAIVER_ROW_LEFT_BORDER = 4;
const WAIVER_HEADER_LEFT_INSET = WAIVER_ROW_SIDE_PADDING + WAIVER_ROW_LEFT_BORDER;
const WAIVER_TABLE_TEMPLATE = `44px minmax(0, 1fr) repeat(3, ${METRIC_COL_WIDTH}px)`;

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

function getSharedNameColumnWidth(players) {
  if (typeof document === 'undefined' || !players.length) return 0;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;

  context.font = '600 14px Figtree, sans-serif';
  const measured = Math.ceil(players.reduce((max, player) => (
    Math.max(max, context.measureText(player.name ?? '').width)
  ), 0)) + 6;
  return Math.min(measured, 168);
}

export default function CompanionWaiver({ onViewPlayer, initialPositionRequest, onConsumeInitialPositionRequest }) {
  const {
    players, loadPlayers,
    rosters,
    league,
    seasonStats, loadSeasonStats,
    weeklyStats,
    scheduleMap,
    espnIdOverrides,
    statsLoading, statsProgress,
    scoringSettings,
    myRoster,
  } = useSleeper();
  const { darkMode } = useTheme();

  const [posFilter, setPosFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const debounceRef = useRef(null);
  const requestedPosition = initialPositionRequest?.position;
  const activePosFilter = requestedPosition && POSITIONS.includes(requestedPosition)
    ? requestedPosition
    : posFilter;

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const rosteredIds = useMemo(() => {
    const ids = new Set();
    for (const r of rosters) {
      for (const id of (r.players || [])) ids.add(id);
      for (const id of (r.reserve || [])) ids.add(id);
    }
    return ids;
  }, [rosters]);

  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const myPlayerIds = useMemo(() => {
    if (!myRosterData) return new Set();
    return new Set([...(myRosterData.players || []), ...(myRosterData.reserve || [])]);
  }, [myRosterData]);
  void myPlayerIds;

  const week = useMemo(() => {
    const playoffStart = league?.settings?.playoff_week_start ?? 18;
    const lastScored = league?.settings?.last_scored_leg;
    if (lastScored) return Math.min(lastScored + 1, playoffStart - 1);
    return Math.max(1, playoffStart - 1);
  }, [league]);

  const defenseTable = useMemo(() => {
    if (!weeklyStats || !players) return null;
    return buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings);
  }, [weeklyStats, players, scheduleMap, scoringSettings]);

  const leagueAvgByPos = useMemo(() => {
    if (!weeklyStats || !players) return {};
    const result = {};
    for (const pos of SKILL_POSITIONS) {
      result[pos] = getLeagueAvgPPG(pos, weeklyStats, players, scoringSettings, week);
    }
    return result;
  }, [weeklyStats, players, scoringSettings, week]);

  const enrichedPlayers = useMemo(() => {
    if (!players || !seasonStats) return [];

    return Object.entries(seasonStats)
      .map(([id, stats]) => {
        if (rosteredIds.has(id)) return null;
        const p = players[id];
        if (!p) return null;
        const pos = p.position;
        if (!SKILL_POSITIONS.has(pos)) return null;

        const pts = calcPointsFromTotals(stats, scoringSettings, pos);
        if (pts <= 0) return null;

        const weekly = weeklyStats?.[id] ?? [];
        const recentAvg = getRecentAvg(weekly, scoringSettings, 4, pos);
        const gamePts = weekly.map(w => calcPoints(w, scoringSettings, pos)).filter(value => value > 0);
        const seasonAvg = gamePts.length > 0 ? gamePts.reduce((sum, value) => sum + value, 0) / gamePts.length : 0;
        const isTrending = recentAvg > 0 && seasonAvg > 0
          && recentAvg >= seasonAvg * 1.25
          && (recentAvg - seasonAvg) >= 2;

        const team = p.team?.toUpperCase();
        const matchup = scheduleMap?.[week]?.[team];
        const oppTeam = matchup?.opp ?? null;
        const isHome = matchup?.home ?? null;
        const venueTeam = isHome === true ? team : isHome === false ? oppTeam : null;
        const isIndoor = venueTeam ? (STADIUMS[venueTeam]?.indoor ?? false) : false;

        let proj = null;
        if (weekly.length >= 2 && defenseTable) {
          const defStrength = oppTeam
            ? getDefenseStrength(defenseTable, oppTeam, pos, week)
            : null;
          proj = projectPlayer({
            weeklyArr: weekly,
            pos,
            oppTeam,
            isHome,
            isIndoor,
            weather: null,
            allWeeklyStats: null,
            players: null,
            scoringSettings,
            scheduleMap,
            week,
            defStrength,
            leagueAvg: leagueAvgByPos[pos] ?? 0,
            skipOpponentLookup: true,
          });
        }

        const espnId = p.espn_id ?? espnIdOverrides?.[id] ?? null;

        return {
          id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: pos,
          team: p.team || 'FA',
          pts,
          seasonAvg,
          recentAvg,
          projected: proj?.projected ?? null,
          oppTeam,
          isTrending,
          injuryStatus: p.injury_status,
          espnId,
          yearsExp: p.years_exp,
          teamTheme: teamRowTheme(p.team || '', darkMode),
        };
      })
      .filter(Boolean);
  }, [players, seasonStats, weeklyStats, scheduleMap, scoringSettings, rosteredIds, week, espnIdOverrides, defenseTable, leagueAvgByPos, darkMode]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedPlayers
      .filter(player => activePosFilter === 'ALL' || player.position === activePosFilter)
      .filter(player => !q || player.name.toLowerCase().includes(q) || player.team.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'projected') {
          const ap = a.projected ?? -1;
          const bp = b.projected ?? -1;
          return bp - ap || b.recentAvg - a.recentAvg;
        }
        if (sortBy === 'season') return b.pts - a.pts || b.recentAvg - a.recentAvg;
        return b.recentAvg - a.recentAvg || b.pts - a.pts;
      })
      .slice(0, 100);
  }, [enrichedPlayers, activePosFilter, search, sortBy]);

  const sharedNameColumnWidth = useMemo(
    () => getSharedNameColumnWidth(available),
    [available],
  );

  const sortLabel = sortBy === 'projected' ? 'projected pts' : sortBy === 'season' ? 'season total' : 'recent avg (last 4 weeks)';

  return (
    <div className="pb-6">
      <div className="px-4 pb-3 flex flex-col gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => {
                onConsumeInitialPositionRequest?.();
                setPosFilter(pos);
              }}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: activePosFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)',
                color: activePosFilter === pos ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
              }}
            >
              {pos}
            </button>
          ))}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-label-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(e.target.value), 200);
            }}
            placeholder="Search players..."
            className="w-full pl-9 pr-3 py-2 rounded-xl font-medium focus:outline-none"
            style={{ fontSize: '16px', background: 'var(--color-fill-secondary)', color: 'var(--color-label)' }}
          />
        </div>
      </div>

      {statsLoading && (
        <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)' }}>
          <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>{statsProgress}%</span>
        </div>
      )}

      <div className="px-4 pb-2">
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
          Sorted by {sortLabel}
        </span>
      </div>

      <div className="px-4">
        <div
          className="grid items-center pb-2 mb-1"
          style={{
            borderBottom: '1px solid var(--color-separator)',
            gridTemplateColumns: WAIVER_TABLE_TEMPLATE,
            columnGap: WAIVER_ROW_GAP,
            paddingLeft: WAIVER_HEADER_LEFT_INSET,
            paddingRight: WAIVER_ROW_SIDE_PADDING,
          }}
        >
          <div />
          <span className="min-w-0 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
          <ColHeader label="Proj" active={sortBy === 'projected'} onClick={() => setSortBy(value => value === 'projected' ? 'recent' : 'projected')} />
          <ColHeader label="Season" active={sortBy === 'season'} onClick={() => setSortBy(value => value === 'season' ? 'recent' : 'season')} />
          <ColHeader label="4-Wk Avg" active={sortBy === 'recent'} onClick={() => setSortBy('recent')} />
        </div>
      </div>

      {!seasonStats && !statsLoading && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading stats...</span>
        </div>
      )}

      {available.map(player => (
        <WaiverRow
          key={player.id}
          player={player}
          onViewPlayer={onViewPlayer}
          sortBy={sortBy}
          nameColumnWidth={sharedNameColumnWidth}
        />
      ))}

      {available.length === 0 && seasonStats && (
        <div className="flex items-center justify-center py-16 px-6 text-center">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            {rosteredIds.size === 0
              ? 'Connect a league to see available players.'
              : 'No available players found.'}
          </span>
        </div>
      )}
    </div>
  );
}

function ColHeader({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 grid items-center"
      style={{ width: METRIC_COL_WIDTH, gridTemplateColumns: '10px 1fr 10px', color: active ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}
    >
      <span aria-hidden="true" />
      <span className="w-full text-xs font-semibold uppercase tracking-widest text-center">
        {label}
      </span>
      <span style={{ fontSize: '9px', visibility: active ? 'visible' : 'hidden' }}>↓</span>
    </button>
  );
}

function MetricCell({ children, emphasis = false, color }) {
  return (
    <div className="shrink-0 grid place-items-center" style={{ width: METRIC_COL_WIDTH }}>
      <span
        className={`${emphasis ? 'font-semibold' : ''} block w-full tabular-nums text-sm text-center`}
        style={{ color }}
      >
        {children}
      </span>
    </div>
  );
}

function WaiverRow({ player, onViewPlayer, sortBy, nameColumnWidth }) {
  const { darkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isInjured = player.injuryStatus && !['Questionable', 'Probable'].includes(player.injuryStatus);
  const posColor = POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)';
  const canNav = !!(onViewPlayer && player.espnId);
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
      <button
        onClick={canNav ? () => onViewPlayer(String(player.espnId), {
          displayName: player.name,
          teamId: player.team,
          position: player.position,
          experience: player.yearsExp != null ? player.yearsExp + 1 : undefined,
        }) : undefined}
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
        className="relative grid items-center w-full px-4 py-3 text-left active:opacity-60"
        style={{
          gridTemplateColumns: WAIVER_TABLE_TEMPLATE,
          columnGap: WAIVER_ROW_GAP,
          border: '1px solid var(--color-separator)',
          borderLeft: player.teamTheme.accent ? `4px solid ${player.teamTheme.accent}` : '4px solid var(--color-separator)',
          borderRadius: 0,
          background: isHovered ? player.teamTheme.hoverBg : player.teamTheme.rowBg,
          boxShadow: rowShadow,
          transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          cursor: canNav ? 'pointer' : 'default',
        }}
      >
        {borderOverlay}
        <img
          src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
          alt={player.name}
          className="w-11 h-11 rounded-full shrink-0 object-cover"
          style={{
            background: 'var(--color-fill)',
            border: player.teamTheme.avatarBorder ? `2px solid ${player.teamTheme.avatarBorder}` : '2px solid transparent',
          }}
          onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
        />

        <div
          className="min-w-0 grid items-center gap-2"
          style={{ gridTemplateColumns: `minmax(0, ${Math.max(nameColumnWidth, 0)}px) auto` }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="font-semibold text-sm truncate"
                style={{ color: canNav ? 'var(--color-accent)' : 'var(--color-label)' }}
              >
                {player.name}
              </span>
              {player.injuryStatus && (
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0"
                  style={{
                    background: isInjured ? 'rgba(239,68,68,0.12)' : 'rgba(245,183,0,0.12)',
                    color: isInjured ? 'var(--color-accent-red)' : 'var(--color-signature)',
                  }}
                >
                  {player.injuryStatus}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5 flex items-center gap-1.5">
              <span style={{ color: posColor, fontWeight: 600 }}>{player.position}</span>
              <span style={{ color: 'var(--color-label-tertiary)' }}>{player.team}</span>
              {player.oppTeam && (
                <span style={{ color: 'var(--color-label-quaternary)', fontSize: '10px' }}>
                  vs {player.oppTeam}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-start gap-1.5 self-center">
            <span
              className="w-[54px] shrink-0 text-[9px] font-bold px-2 py-1 rounded-lg text-center"
              style={{
                background: player.isTrending ? 'rgba(30,155,55,0.12)' : 'transparent',
                color: player.isTrending ? 'var(--color-accent-green)' : 'transparent',
              }}
            >
              ↑ HOT
            </span>

            {player.teamTheme.logoKey ? (
              <img
                src={`https://a.espncdn.com/i/teamlogos/nfl/500/${player.teamTheme.logoKey}.png`}
                alt=""
                aria-hidden="true"
                className="block shrink-0 self-center"
                style={{ width: 'auto', height: 44, maxWidth: 44, objectFit: 'contain', opacity: 0.72 }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-11 shrink-0" />
            )}
          </div>
        </div>

        <MetricCell
          emphasis
          color={player.projected != null
            ? (sortBy === 'projected' ? 'var(--color-label)' : 'var(--color-label-secondary)')
            : 'var(--color-label-quaternary)'}
        >
          {player.projected != null ? player.projected.toFixed(1) : '—'}
        </MetricCell>

        <MetricCell
          emphasis
          color={sortBy === 'season' ? 'var(--color-label)' : 'var(--color-label-secondary)'}
        >
          {player.pts.toFixed(1)}
        </MetricCell>

        <MetricCell
          emphasis
          color={sortBy === 'recent' ? 'var(--color-label)' : 'var(--color-label-secondary)'}
        >
          {player.recentAvg > 0 ? player.recentAvg.toFixed(1) : '—'}
        </MetricCell>
      </button>
    </div>
  );
}
