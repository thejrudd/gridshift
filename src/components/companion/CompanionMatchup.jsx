import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, DEFAULT_SCORING, STAT_TO_SCORING_KEY } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG, getDefenseStrength, buildDefenseTable, projectPlayer, getDefensePercentile } from '../../utils/projectionEngine';
import { STADIUMS, WEEK_DATES_2025 } from '../../data/stadiums';
import { getTeamColorKey, getTeamPalette } from '../../data/teamColors.js';
import { fetchGameWeather, formatWeather } from '../../api/weatherApi';
import { getMatchups } from '../../api/sleeperApi';
import PlayerMatchupBreakdown, { STAT_LABELS } from './PlayerMatchupBreakdown';
import PlayerWeeklySheet from './PlayerWeeklySheet';
import useCardGlow from '../../hooks/useCardGlow.jsx';

const TOTAL_WEEKS = 18;
const POSITION_COLORS = {
  QB: '#ef4444', RB: '#22c55e', WR: '#3b82f6', TE: '#f59e0b', K: '#8b5cf6',
};
const MATCHUP_CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';

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
      rowBg: 'var(--color-bg-secondary)',
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

export default function CompanionMatchup({ onViewPlayer, initialWeekRequest = null, onConsumeInitialWeekRequest = null }) {
  const { darkMode } = useTheme();
  const {
    sleeperUser, selectedLeagueId, league,
    rosters, players, loadPlayers,
    weeklyStats, seasonStats, scheduleMap, loadSeasonStats,
    statsLoading, statsProgress, scoringSettings,
    myRoster, getUserDisplayName,
  } = useSleeper();

  // Playoff start week from league settings; default to 15 if unknown
  const playoffStart = league?.settings?.playoff_week_start ?? 18;
  const totalWeeks = TOTAL_WEEKS;

  const [matchups, setMatchups] = useState(null);
  // Default to last regular-season week
  const [week, setWeek] = useState(() => Math.max(1, playoffStart - 1));
  const [matchupLoading, setMatchupLoading] = useState(false);
  const [showBench, setShowBench] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { id, projection }
  const [selectedTeam, setSelectedTeam] = useState(null); // 'mine' | 'opp'
  const [selectedRosterPlayerId, setSelectedRosterPlayerId] = useState(null);
  const [weatherMap, setWeatherMap] = useState({}); // { 'TEAM-DATE': weather }

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    setMatchupLoading(true);
    getMatchups(selectedLeagueId, week)
      .then(data => setMatchups(data ?? []))
      .catch(() => setMatchups([]))
      .finally(() => setMatchupLoading(false));
  }, [selectedLeagueId, week]);

  useEffect(() => {
    if (!initialWeekRequest?.week) return;
    setWeek(Math.max(1, Math.min(TOTAL_WEEKS, Number(initialWeekRequest.week) || 1)));
  }, [initialWeekRequest]);

  const myRosterData = myRoster();

  const myMatchup = useMemo(() => {
    if (!matchups || !myRosterData) return null;
    return matchups.find(m => m.roster_id === myRosterData.roster_id) ?? null;
  }, [matchups, myRosterData]);

  const opponentMatchup = useMemo(() => {
    if (!matchups || !myMatchup) return null;
    return matchups.find(m => m.matchup_id === myMatchup.matchup_id && m.roster_id !== myMatchup.roster_id) ?? null;
  }, [matchups, myMatchup]);

  const opponentRoster = useMemo(() => {
    if (!opponentMatchup) return null;
    return rosters.find(r => r.roster_id === opponentMatchup.roster_id) ?? null;
  }, [opponentMatchup, rosters]);

  const opponentName = useMemo(() => {
    if (!opponentRoster) return 'Opponent';
    return getUserDisplayName(opponentRoster.owner_id);
  }, [opponentRoster, getUserDisplayName]);

  const myName = useMemo(() => {
    if (!sleeperUser) return 'You';
    return getUserDisplayName(sleeperUser.user_id);
  }, [sleeperUser, getUserDisplayName]);

  const matchupOutcome = useMemo(() => {
    const myPoints = myMatchup?.points ?? null;
    const oppPoints = opponentMatchup?.points ?? null;
    if (myPoints == null || oppPoints == null) return { mine: 'pending', opp: 'pending' };
    if (myPoints === oppPoints) return { mine: 'tie', opp: 'tie' };
    return myPoints > oppPoints
      ? { mine: 'win', opp: 'loss' }
      : { mine: 'loss', opp: 'win' };
  }, [myMatchup, opponentMatchup]);

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings],
  );

  // Per-week positional ranks for the selected week
  const weeklyRanks = useMemo(() => {
    if (!weeklyStats || !players) return {};
    const SKILL = ['QB', 'RB', 'WR', 'TE', 'K'];
    const IDP_MAP = { DL: ['DL', 'DE', 'DT'], LB: ['LB', 'ILB', 'OLB'], DB: ['DB', 'CB', 'S', 'SS', 'FS'] };
    function normalizePos(pos) {
      if (SKILL.includes(pos)) return pos;
      for (const [norm, variants] of Object.entries(IDP_MAP)) {
        if (variants.includes(pos)) return norm;
      }
      return null;
    }
    const byPos = {};
    for (const [playerId, weeks] of Object.entries(weeklyStats)) {
      const weekEntry = weeks.find(w => w.week === week);
      if (!weekEntry) continue;
      const p = players[playerId];
      if (!p) continue;
      const pos = normalizePos(p.position);
      if (!pos) continue;
      const pts = calcPoints(weekEntry, scoringSettings, p.position);
      if (pts <= 0) continue;
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push({ id: playerId, pts });
    }
    const ranks = {};
    for (const [pos, list] of Object.entries(byPos)) {
      list.sort((a, b) => b.pts - a.pts);
      list.forEach(({ id }, i) => { ranks[id] = { rank: i + 1, posLabel: pos }; });
    }
    return ranks;
  }, [weeklyStats, players, scoringSettings, week]);

  // Pre-computed defense table: { [teamAbbr]: { [normPos]: { [week]: totalPts } } }
  // Built once when all data is available; used for O(1) opponent strength lookups.
  const defenseTable = useMemo(
    () => weeklyStats && players && scheduleMap
      ? buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings)
      : null,
    [weeklyStats, players, scheduleMap, scoringSettings],
  );

  const enrichPlayer = useCallback((id) => {
    if (!id || !players) return null;
    const p = players[id];
    if (!p) return { id, name: 'Empty', position: '?', team: '', pts: null, avgPPG: 0, rank: null, oppTeam: null, isHome: null, isIndoor: null, homeTeam: null, injuryStatus: null, weekly: [] };

    const weekly = weeklyStats?.[id] ?? [];
    const weekEntry = weekly.find(w => w.week === week) ?? null;
    const myTeam = p.team || 'FA';
    // Derive opponent + home/away: prefer stat entry fields, fall back to ESPN schedule
    const schedEntry = scheduleMap?.[week]?.[myTeam] ?? null;
    const oppTeam = weekEntry?.opp?.toUpperCase() ?? schedEntry?.opp ?? null;
    // Prefer ESPN schedEntry.home (reliable) over Sleeper weekEntry.home (often unreliable/zero)
    const isHome = schedEntry != null
      ? schedEntry.home
      : weekEntry != null ? (weekEntry.home === 1 || weekEntry.home === true) : null;
    // Home team hosts → determines whose stadium we use
    const homeTeam = isHome === true ? myTeam : isHome === false ? oppTeam : null;
    const stadium = homeTeam ? (STADIUMS[homeTeam] ?? null) : null;
    const defStrength = oppTeam && defenseTable
      ? getDefenseStrength(defenseTable, oppTeam, p.position, week)
      : null;
    const isDefensivePos = ['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS'].includes(p.position);
    const defPercentile = oppTeam && defenseTable && !isDefensivePos
      ? getDefensePercentile(defenseTable, oppTeam, p.position, week)
      : null;
    // Bye detection: week has games for other teams but not this team
    const weekHasGames = !!scheduleMap && Object.keys(scheduleMap[week] ?? {}).length > 0;
    const isBye = weekHasGames && !schedEntry && myTeam !== 'FA';

    return {
      id,
      name: p.full_name || `${p.first_name} ${p.last_name}`,
      position: p.position,
      team: myTeam,
      weekPts: weekEntry ? calcPoints(weekEntry, scoringSettings, p.position) : null,
      avgPPG: getAvgPPG(weekly, scoringSettings, p.position),
      rank: positionalRanks[id] ?? null,
      weekRank: weeklyRanks[id] ?? null,
      oppTeam,
      isHome,
      homeTeam,
      stadium,
      isIndoor: stadium?.indoor ?? null,
      weekly,
      injuryStatus: p.injury_status,
      defStrength,
      defPercentile,
      isBye,
      teamTheme: teamRowTheme(myTeam, darkMode),
    };
  }, [players, seasonStats, weeklyStats, scoringSettings, positionalRanks, weeklyRanks, week, scheduleMap, defenseTable, darkMode]);

  // Ordered slot positions for each starter slot (filters out BN/IR)
  const starterPositions = useMemo(
    () => (league?.roster_positions ?? []).filter(p => p !== 'BN' && p !== 'IR'),
    [league],
  );

  // Zip starters by slot index for side-by-side display
  const starterSlots = useMemo(() => {
    const myIds = myMatchup?.starters ?? [];
    const oppIds = opponentMatchup?.starters ?? [];
    const len = Math.max(myIds.length, oppIds.length);
    return Array.from({ length: len }, (_, i) => ({
      mine: enrichPlayer(myIds[i]),
      opp: enrichPlayer(oppIds[i]),
      slotPos: starterPositions[i] ?? null,
    }));
  }, [myMatchup, opponentMatchup, enrichPlayer, starterPositions]);

  // Bench players
  const myBench = useMemo(() => {
    if (!myRosterData || !myMatchup) return [];
    const starterSet = new Set(myMatchup.starters ?? []);
    return (myRosterData.players ?? []).filter(id => !starterSet.has(id)).map(enrichPlayer).filter(Boolean);
  }, [myRosterData, myMatchup, enrichPlayer]);

  const oppBench = useMemo(() => {
    if (!opponentRoster || !opponentMatchup) return [];
    const starterSet = new Set(opponentMatchup.starters ?? []);
    return (opponentRoster.players ?? []).filter(id => !starterSet.has(id)).map(enrichPlayer).filter(Boolean);
  }, [opponentRoster, opponentMatchup, enrichPlayer]);

  // Fetch weather for all outdoor home stadiums referenced by starters
  useEffect(() => {
    const date = WEEK_DATES_2025[week];
    if (!date) return;

    const toFetch = new Map(); // homeTeam → { lat, lng }
    const allPlayers = [
      ...starterSlots.flatMap(s => [s.mine, s.opp]),
    ].filter(Boolean);

    for (const player of allPlayers) {
      if (!player.homeTeam || player.isIndoor) continue;
      const s = STADIUMS[player.homeTeam];
      if (s && !s.indoor) {
        const key = `${player.homeTeam}-${date}`;
        if (!weatherMap[key]) toFetch.set(player.homeTeam, { lat: s.lat, lng: s.lng, key });
      }
    }

    for (const [, { lat, lng, key }] of toFetch) {
      fetchGameWeather(lat, lng, date).then(w => {
        if (w) setWeatherMap(prev => ({ ...prev, [key]: w }));
      });
    }
  }, [starterSlots, week]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add projections once weather is available
  const enrichedSlots = useMemo(() => {
    const date = WEEK_DATES_2025[week];

    function addProjection(player) {
      if (!player || !player.weekly?.length || player.name === 'Empty') return player;
      const key = player.homeTeam && date ? `${player.homeTeam}-${date}` : null;
      const weather = player.isIndoor ? null : (key ? (weatherMap[key] ?? null) : null);
      const proj = projectPlayer({
        weeklyArr: player.weekly,
        pos: player.position,
        oppTeam: player.oppTeam,
        isHome: player.isHome,
        isIndoor: player.isIndoor ?? false,
        weather,
        allWeeklyStats: weeklyStats,
        players,
        scoringSettings,
        scheduleMap,
        week,
        defStrength: player.defStrength ?? null,
      });
      return { ...player, projection: proj, weather };
    }

    return starterSlots.map(slot => ({
      mine: addProjection(slot.mine),
      opp: addProjection(slot.opp),
      slotPos: slot.slotPos,
    }));
  }, [starterSlots, weatherMap, week, weeklyStats, players, scoringSettings, scheduleMap]);

  useEffect(() => {
    const requestedPlayerId = initialWeekRequest?.playerId;
    const requestedWeek = Number(initialWeekRequest?.week);
    if (!requestedPlayerId || requestedWeek !== week) return;

    const matchupPlayers = [
      ...enrichedSlots.flatMap((slot) => [slot.mine, slot.opp]),
      ...myBench,
      ...oppBench,
    ].filter(Boolean);

    const match = matchupPlayers.find((player) => player?.id === requestedPlayerId);
    if (!match) return;

    setSelectedPlayer({
      id: match.id,
      projection: match.projection ?? null,
      enriched: match,
    });
    onConsumeInitialWeekRequest?.();
  }, [enrichedSlots, initialWeekRequest, myBench, oppBench, onConsumeInitialWeekRequest, week]);

  if (!matchups && !matchupLoading) {
    return <EmptyState message="No matchup data available." />;
  }

  return (
    <div className="pb-6">
      {/* Week selector */}
      <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}>
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => {
          const isPlayoff = w >= playoffStart;
          const isSelected = week === w;
          // Inject a "PLAYOFFS" divider label before the first playoff week
          return (
            <div key={w} className="flex items-center gap-2 shrink-0">
              {w === playoffStart && (
                <span
                  className="text-xs font-bold uppercase tracking-widest shrink-0 select-none"
                  style={{ color: 'var(--color-label-quaternary)' }}
                >
                  Playoffs
                </span>
              )}
              <button
                onClick={() => setWeek(w)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: isSelected
                    ? (isPlayoff ? 'var(--color-accent)' : 'var(--color-signature)')
                    : 'var(--color-fill)',
                  color: isSelected
                    ? '#fff'
                    : isPlayoff
                    ? 'var(--color-label-tertiary)'
                    : 'var(--color-label-secondary)',
                  opacity: isPlayoff && !isSelected ? 0.7 : 1,
                }}
              >
                Wk {w}
              </button>
            </div>
          );
        })}
      </div>

      {statsLoading && (
        <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}>
          <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>Loading stats {statsProgress}%</span>
        </div>
      )}

      {matchupLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading matchup…</span>
        </div>
      ) : !myMatchup ? (
        <EmptyState message="No matchup found for this week." />
      ) : (
        <>
          {/* Scoreboard header */}
          <div
            className="mx-4 mb-4 px-4 py-4 rounded-xl"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              boxShadow: MATCHUP_CARD_SHADOW,
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-label-tertiary)' }}>
                  Matchup
                </div>
                <div className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                  Week {week}
                </div>
              </div>
              <button
                onClick={() => setShowBench(v => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] active:opacity-60"
                style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                  background: showBench ? 'var(--color-signature)' : 'var(--color-fill)',
                  color: showBench ? 'var(--color-signature-fg)' : 'var(--color-signature)',
                  border: `1px solid ${showBench ? 'var(--color-signature)' : 'var(--color-signature)'}`,
                  borderRadius: 0,
                  boxShadow: showBench ? '0 1px 3px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7h18" />
                  <path d="M6 12h12" />
                  <path d="M9 17h6" />
                </svg>
                {showBench ? 'Bench On' : 'Show Bench'}
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <button
                className="min-w-0 px-4 py-3 text-center active:opacity-60 transition-opacity"
                onClick={() => setSelectedTeam('mine')}
                style={{
                  border: '1px solid var(--color-separator)',
                  background: matchupOutcome.mine === 'win'
                    ? 'rgba(46,213,120,0.18)'
                    : matchupOutcome.mine === 'loss'
                      ? 'rgba(255,68,51,0.16)'
                      : 'var(--color-fill-secondary)',
                  borderRadius: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {matchupOutcome.mine !== 'pending' && matchupOutcome.mine !== 'tie' && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: '18px',
                      transform: 'translateY(-50%)',
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                      fontSize: '64px',
                      fontWeight: 800,
                      lineHeight: 0.9,
                      color: matchupOutcome.mine === 'win' ? 'rgba(46,213,120,0.30)' : 'rgba(255,68,51,0.28)',
                      pointerEvents: 'none',
                    }}
                  >
                    {matchupOutcome.mine === 'win' ? 'W' : 'L'}
                  </div>
                )}
                <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}>Your Side</div>
                <div className="relative z-[1] mt-1 truncate uppercase" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: '32px', fontWeight: 800, lineHeight: 0.96 }}>
                  {myName}
                </div>
                <div className="relative z-[1] mt-1 tabular-nums" style={{ color: 'var(--color-signature)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: '38px', fontWeight: 800, lineHeight: 0.92 }}>
                  {myMatchup.points?.toFixed(2) ?? '?'}
                </div>
              </button>
              <div className="px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)', borderRadius: 0 }}>vs</div>
              <button
                className="min-w-0 px-4 py-3 text-center active:opacity-60 transition-opacity"
                onClick={() => setSelectedTeam('opp')}
                style={{
                  border: '1px solid var(--color-separator)',
                  background: matchupOutcome.opp === 'win'
                    ? 'rgba(46,213,120,0.18)'
                    : matchupOutcome.opp === 'loss'
                      ? 'rgba(255,68,51,0.16)'
                      : 'var(--color-fill-secondary)',
                  borderRadius: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {matchupOutcome.opp !== 'pending' && matchupOutcome.opp !== 'tie' && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '18px',
                      transform: 'translateY(-50%)',
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                      fontSize: '64px',
                      fontWeight: 800,
                      lineHeight: 0.9,
                      color: matchupOutcome.opp === 'win' ? 'rgba(46,213,120,0.30)' : 'rgba(255,68,51,0.28)',
                      pointerEvents: 'none',
                    }}
                  >
                    {matchupOutcome.opp === 'win' ? 'W' : 'L'}
                  </div>
                )}
                <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}>Opponent</div>
                <div className="relative z-[1] mt-1 truncate uppercase" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: '32px', fontWeight: 800, lineHeight: 0.96 }}>
                  {opponentName}
                </div>
                <div className="relative z-[1] mt-1 tabular-nums" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: '38px', fontWeight: 800, lineHeight: 0.92 }}>
                  {opponentMatchup?.points?.toFixed(2) ?? '?'}
                </div>
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>{myName}</span>
              <span className="text-center text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Slot</span>
              <span className="text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>{opponentName}</span>
            </div>
          </div>

          {/* Head-to-head starter rows */}
          <div>
            {enrichedSlots.map((slot, i) => (
              <HeadToHeadRow
                key={i}
                mine={slot.mine}
                opp={slot.opp}
                slotPos={slot.slotPos}
                onSelectMine={() => slot.mine?.id && setSelectedPlayer({ id: slot.mine.id, projection: slot.mine.projection ?? null, enriched: slot.mine })}
                onSelectOpp={() => slot.opp?.id && setSelectedPlayer({ id: slot.opp.id, projection: slot.opp.projection ?? null, enriched: slot.opp })}
              />
            ))}
          </div>

          {/* Bench section */}
          {(myBench.length > 0 || oppBench.length > 0) && (
            <>
              <div className="mx-4 mt-5 mb-2 px-4 py-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'white', background: 'var(--color-label)' }}>
                Bench
              </div>
              {showBench && (() => {
                const len = Math.max(myBench.length, oppBench.length);
                return (
                  <div>
                    {Array.from({ length: len }, (_, i) => (
                      <HeadToHeadRow
                        key={i}
                        mine={myBench[i] ?? null}
                        opp={oppBench[i] ?? null}
                        bench
                        onSelectMine={() => myBench[i]?.id && setSelectedPlayer({ id: myBench[i].id, projection: null, enriched: myBench[i] })}
                        onSelectOpp={() => oppBench[i]?.id && setSelectedPlayer({ id: oppBench[i].id, projection: null, enriched: oppBench[i] })}
                      />
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

      {selectedPlayer && (
        <PlayerMatchupBreakdown
          playerId={selectedPlayer.id}
          week={week}
          projection={selectedPlayer.projection}
          enrichedPlayer={selectedPlayer.enriched ?? null}
          onClose={() => setSelectedPlayer(null)}
          onViewStats={onViewPlayer}
          onOpenRosterPlayer={(playerId) => setSelectedRosterPlayerId(playerId)}
        />
      )}

      {selectedRosterPlayerId && (
        <PlayerWeeklySheet
          playerId={selectedRosterPlayerId}
          onClose={() => setSelectedRosterPlayerId(null)}
          onOpenWeek={(playerId, requestedWeek) => {
            setSelectedRosterPlayerId(null);
            setSelectedPlayer(null);
            setWeek(requestedWeek);
            const matchupPlayers = [
              ...enrichedSlots.flatMap((slot) => [slot.mine, slot.opp]),
              ...myBench,
              ...oppBench,
            ].filter(Boolean);
            const match = matchupPlayers.find((player) => player?.id === playerId);
            if (match) {
              setSelectedPlayer({
                id: match.id,
                projection: match.projection ?? null,
                enriched: match,
              });
            }
          }}
        />
      )}

      {selectedTeam && (
        <TeamScoreBreakdown
          teamName={selectedTeam === 'mine' ? myName : opponentName}
          playerIds={enrichedSlots.map(s => selectedTeam === 'mine' ? s.mine?.id : s.opp?.id).filter(Boolean)}
          week={week}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
}

// Sleeper flex/special slot names → short display labels
const SLOT_LABELS = {
  FLEX: 'FLX', REC_FLEX: 'FLX', WRRB_FLEX: 'FLX',
  SUPER_FLEX: 'SF', IDP_FLEX: 'IDP', DEF: 'DST',
};

function HeadToHeadRow({ mine, opp, bench, slotPos, onSelectMine, onSelectOpp }) {
  const { darkMode } = useTheme();
  const [isMineHovered, setIsMineHovered] = useState(false);
  const [isOppHovered, setIsOppHovered] = useState(false);
  const slotLabel = slotPos ? (SLOT_LABELS[slotPos] ?? slotPos) : (mine?.position ?? opp?.position ?? '?');
  const posColor = POSITION_COLORS[slotPos] ?? POSITION_COLORS[mine?.position ?? opp?.position] ?? 'var(--color-label-tertiary)';
  const mineTheme = mine?.teamTheme ?? teamRowTheme('', darkMode);
  const oppTheme = opp?.teamTheme ?? teamRowTheme('', darkMode);
  const mineGlowColor = mineTheme.accent ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const oppGlowColor = oppTheme.accent ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const mineGlow = useCardGlow({
    enabled: isMineHovered && !!mine,
    color: mineGlowColor,
    cardColor: mineTheme.accent ?? null,
    darkMode,
    coreColor: darkMode ? (mineTheme.glowCore ?? '#FFFFFF') : null,
    outerColor: mineTheme.accent ?? mineGlowColor,
  });
  const oppGlow = useCardGlow({
    enabled: isOppHovered && !!opp,
    color: oppGlowColor,
    cardColor: oppTheme.accent ?? null,
    darkMode,
    coreColor: darkMode ? (oppTheme.glowCore ?? '#FFFFFF') : null,
    outerColor: oppTheme.accent ?? oppGlowColor,
  });
  const mineRowShadow = mineGlow.glowShadow ? `${mineGlow.glowShadow}, ${MATCHUP_CARD_SHADOW}` : MATCHUP_CARD_SHADOW;
  const oppRowShadow = oppGlow.glowShadow ? `${oppGlow.glowShadow}, ${MATCHUP_CARD_SHADOW}` : MATCHUP_CARD_SHADOW;

  return (
    <div className="px-4" style={{ opacity: bench ? 0.72 : 1 }}>
      <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch gap-2">
      {/* My player — left */}
      <button
        onClick={onSelectMine}
        disabled={!mine}
        onMouseEnter={() => setIsMineHovered(true)}
        onMouseLeave={() => setIsMineHovered(false)}
        onFocus={() => setIsMineHovered(true)}
        onBlur={() => setIsMineHovered(false)}
        onMouseMove={mineGlow.glowHandlers.onMouseMove}
        className="min-w-0 flex items-center gap-3 px-4 py-3 text-left active:opacity-60 transition-opacity"
        style={{
          border: '1px solid var(--color-separator)',
          borderLeft: mineTheme.accent ? `4px solid ${mineTheme.accent}` : '4px solid var(--color-separator)',
          background: isMineHovered ? mineTheme.hoverBg : mineTheme.rowBg,
          boxShadow: mineRowShadow,
          transform: isMineHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          cursor: mine ? 'pointer' : 'default',
        }}
      >
        {mineGlow.borderOverlay}
        <PlayerThumb player={mine} />
        <PlayerInfo player={mine} />
      </button>

      {/* Position badge — center */}
      <div className="flex items-center justify-center">
        <span
          className="font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${posColor}20`, color: posColor, fontSize: '10px' }}
        >
          {slotLabel}
        </span>
      </div>

      {/* Opponent — right (mirrored) */}
      <button
        onClick={onSelectOpp}
        disabled={!opp}
        onMouseEnter={() => setIsOppHovered(true)}
        onMouseLeave={() => setIsOppHovered(false)}
        onFocus={() => setIsOppHovered(true)}
        onBlur={() => setIsOppHovered(false)}
        onMouseMove={oppGlow.glowHandlers.onMouseMove}
        className="min-w-0 flex items-center gap-3 px-4 py-3 text-right active:opacity-60 transition-opacity flex-row-reverse"
        style={{
          border: '1px solid var(--color-separator)',
          borderLeft: oppTheme.accent ? `4px solid ${oppTheme.accent}` : '4px solid var(--color-separator)',
          background: isOppHovered ? oppTheme.hoverBg : oppTheme.rowBg,
          boxShadow: oppRowShadow,
          transform: isOppHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          cursor: opp ? 'pointer' : 'default',
        }}
      >
        {oppGlow.borderOverlay}
        <PlayerThumb player={opp} />
        <PlayerInfo player={opp} align="right" />
      </button>
      </div>
    </div>
  );
}

function PlayerInfo({ player, align = 'left' }) {
  const isRight = align === 'right';
  const { darkMode } = useTheme();
  const rankLabel = player?.weekRank ? `${player.weekRank.posLabel}${player.weekRank.rank}` : (player?.rank ? `${player.rank.posLabel}${player.rank.rank}` : null);
  if (!player || player.name === 'Empty') return <div className="flex-1 min-w-0" />;

  const weekPts = player.weekPts ?? null;
  const projMin = player.projection?.min ?? null;
  const projMax = player.projection?.max ?? null;

  const scoreColor = (() => {
    if (weekPts == null || projMin == null || projMax == null) return 'var(--color-label)';
    if (weekPts < projMin) return '#ef4444';
    if (weekPts > projMax) return '#22c55e';
    const range = projMax - projMin;
    if (range <= 0) return 'var(--color-label)';
    const pos = (weekPts - projMin) / range;
    if (pos <= 0.30) return '#f97316';
    if (pos <= 0.70) return 'var(--color-label)';
    return '#84cc16';
  })();

  const defPercentile = player.defPercentile ?? null;
  let badge = null;
  if (defPercentile !== null) {
    if (defPercentile <= 0.20)      badge = { label: 'Difficult matchup',   bg: 'rgba(239,68,68,0.18)',   color: '#ef4444' };
    else if (defPercentile <= 0.40) badge = { label: 'Challenging matchup', bg: 'rgba(249,115,22,0.18)',  color: '#f97316' };
    else if (defPercentile <= 0.60) badge = { label: 'Average matchup',     bg: 'rgba(120,120,128,0.16)', color: 'var(--color-label-tertiary)' };
    else if (defPercentile <= 0.80) badge = { label: 'Favorable matchup',   bg: 'rgba(132,204,22,0.18)',  color: '#84cc16' };
    else                            badge = { label: 'Easy matchup',         bg: 'rgba(34,197,94,0.18)',   color: '#22c55e' };
  }
  const locationStr = player.isHome === true ? 'Home' : player.isHome === false ? 'Away' : null;
  const weatherStr  = formatWeather(player.weather, player.isIndoor ?? false);
  const metaColor = darkMode ? 'rgba(228,235,244,0.78)' : 'rgba(12,15,20,0.72)';
  const subduedColor = darkMode ? 'rgba(228,235,244,0.62)' : 'rgba(12,15,20,0.56)';

  return (
    <div className={`flex-1 min-w-0 ${isRight ? 'text-right' : ''}`}>
      <div className={`flex items-center gap-1 flex-wrap ${isRight ? 'justify-end' : ''}`}>
        <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
          {player.name}
        </span>
        <span className="text-xs shrink-0" style={{ color: metaColor }}>
          {player.position} - {player.team}
        </span>
        {player.injuryStatus && (
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--color-accent-red)' }}
          >
            {player.injuryStatus}
          </span>
        )}
      </div>
      <div className={`flex items-center gap-1.5 mt-0.5 flex-wrap ${isRight ? 'justify-end' : ''}`}>
        {weekPts == null ? (
          projMin != null && projMax != null ? (
            <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--color-label)' }}>
              proj {projMin}-{projMax}
            </span>
          ) : null
        ) : (
          <>
            <span className="text-xs tabular-nums font-bold" style={{ color: scoreColor }}>
              {weekPts.toFixed(2)} pts
            </span>
            {projMin != null && projMax != null && (
              <span className="text-xs tabular-nums" style={{ color: subduedColor }}>
                - proj {projMin}-{projMax}
              </span>
            )}
          </>
        )}
        {rankLabel && (
          <span className="text-xs font-bold tabular-nums" style={{ color: subduedColor }}>
            - {rankLabel}
          </span>
        )}
      </div>
      {player.oppTeam ? (
        <div className={`flex items-center gap-1 flex-wrap mt-0.5 ${isRight ? 'justify-end' : ''}`}>
          <span className="text-xs" style={{ color: metaColor }}>
            vs {player.oppTeam}{locationStr ? ` - ${locationStr}` : ''}{weatherStr ? ` - ${weatherStr}` : ''}
          </span>
          {badge && (
            <span
              className="text-[10px] font-bold px-1.5 py-px rounded-full shrink-0"
              style={{ background: badge.bg, color: badge.color }}
            >
              {badge.label}
            </span>
          )}
        </div>
      ) : player.isBye ? (
        <div className={`mt-0.5 ${isRight ? 'text-right' : ''}`}>
          <span
            className="text-[10px] font-bold px-1.5 py-px rounded-full"
            style={{ background: 'var(--color-fill)', color: metaColor }}
          >
            BYE WEEK
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PlayerThumb({ player }) {
  if (!player || player.name === 'Empty') {
    return <div className="w-14 h-14 rounded-full shrink-0" style={{ background: 'var(--color-fill)' }} />;
  }
  return (
    <img
      src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
      alt={player.name}
      className="w-14 h-14 rounded-full shrink-0 object-cover"
      style={{
        background: 'var(--color-fill)',
        border: player.teamTheme?.avatarBorder ? `2px solid ${player.teamTheme.avatarBorder}` : '2px solid transparent',
      }}
      onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
    />
  );
}

const TEAM_SCORE_LABELS = {
  ...STAT_LABELS,
  bonus_rush_rec_yd_100: '100+ Rush/Rec Yd Bonus',
  bonus_rush_rec_yd_200: '200+ Rush/Rec Yd Bonus',
  bonus_pass_cmp_25: '25+ Completion Bonus',
  bonus_rush_att_20: '20+ Carry Bonus',
  pass_td_40p: '40+ Pass TD Bonus',
  pass_td_50p: '50+ Pass TD Bonus',
  pass_cmp_40p: '40+ Completion Bonus',
  rush_td_40p: '40+ Rush TD Bonus',
  rush_td_50p: '50+ Rush TD Bonus',
  rec_td_40p: '40+ Rec TD Bonus',
  rec_td_50p: '50+ Rec TD Bonus',
  rec_40p: '40+ Reception Bonus',
  rush_40p: '40+ Rush Bonus',
  bonus_def_fum_td_50p: '50+ Fumble TD Bonus',
  bonus_def_int_td_50p: '50+ INT TD Bonus',
  idp_qb_hit: 'QB Hit',
  idp_pass_def: 'Pass Deflection',
  idp_fum_rec: 'Fumble Recovery',
  idp_fum_ret_yd: 'Fumble Return Yds',
  idp_safe: 'Safety',
  idp_sack_yd: 'Sack Yards',
  idp_int_ret_yd: 'INT Return Yds',
  idp_int_td: 'INT Return TD',
  idp_fr_yd: 'Fumble Return Yds',
  idp_fr_td: 'Fumble Return TD',
  def_td: 'DST TD',
  def_2pt: 'DST 2PT Return',
  def_3_and_out: '3 and Out',
  def_4_and_stop: '4th Down Stop',
  def_forced_punts: 'Forced Punt',
  def_pass_def: 'Pass Deflection',
  def_st_tkl_solo: 'ST Solo Tackle',
  def_kr_yd: 'Kick Return Yds',
  def_pr_yd: 'Punt Return Yds',
  sack: 'DST Sack',
};

function formatScoringKeyLabel(key) {
  return key
    .replace(/^bonus_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function TeamScoreBreakdown({ teamName, playerIds, week, onClose }) {
  const { weeklyStats, scoringSettings, players } = useSleeper();

  const { rows, total } = useMemo(() => {
    if (!weeklyStats) return { rows: [], total: 0 };
    const settings = { ...DEFAULT_SCORING, ...scoringSettings };
    const totals = new Map();
    let exactTotal = 0;

    const addRow = (key, label, statVal, pts, showStat = true) => {
      if (Math.abs(pts) < 0.005) return;
      const existing = totals.get(key);
      if (existing) {
        existing.pts += pts;
        existing.statVal = showStat
          ? ((existing.statVal ?? 0) + (statVal ?? 0))
          : null;
        return;
      }
      totals.set(key, {
        key,
        label,
        statVal: showStat ? (statVal ?? 0) : null,
        pts,
      });
    };

    for (const id of playerIds) {
      const weekly = weeklyStats[id] ?? [];
      const entry = weekly.find(w => w.week === week);
      if (!entry) continue;
      const position = players?.[id]?.position ?? null;
      exactTotal += calcPoints(entry, settings, position);

      for (const [statKey, statVal] of Object.entries(entry)) {
        if (!statVal) continue;
        const scoringKey = STAT_TO_SCORING_KEY[statKey];
        if (!scoringKey || !settings[scoringKey]) continue;
        addRow(
          scoringKey,
          TEAM_SCORE_LABELS[statKey] ?? TEAM_SCORE_LABELS[scoringKey] ?? formatScoringKeyLabel(scoringKey),
          Number(statVal),
          Number(statVal) * settings[scoringKey],
          true,
        );
      }

      if (position && entry.rec) {
        const bonusKey = position === 'TE'
          ? 'bonus_rec_te'
          : position === 'RB'
            ? 'bonus_rec_rb'
            : position === 'WR'
              ? 'bonus_rec_wr'
              : null;
        if (bonusKey && settings[bonusKey]) {
          addRow(bonusKey, `${position} Rec Bonus`, Number(entry.rec), Number(entry.rec) * settings[bonusKey], true);
        }
      }

      if (position === 'RB' && entry.rush_att && settings.bonus_rush_att) {
        addRow('bonus_rush_att', 'Carry Bonus', Number(entry.rush_att), Number(entry.rush_att) * settings.bonus_rush_att, true);
      }

      if (position === 'QB' && settings.bonus_fd_qb) {
        const fdTotal = Number(entry.pass_fd ?? 0) + Number(entry.rush_fd ?? 0);
        if (fdTotal) addRow('bonus_fd_qb', 'QB First Down Bonus', fdTotal, fdTotal * settings.bonus_fd_qb, true);
      }

      if (position === 'RB' && settings.bonus_fd_rb) {
        const fdTotal = Number(entry.rush_fd ?? 0) + Number(entry.rec_fd ?? 0);
        if (fdTotal) addRow('bonus_fd_rb', 'RB First Down Bonus', fdTotal, fdTotal * settings.bonus_fd_rb, true);
      }

      if (position === 'WR' && settings.bonus_fd_wr && entry.rec_fd) {
        addRow('bonus_fd_wr', 'WR First Down Bonus', Number(entry.rec_fd), Number(entry.rec_fd) * settings.bonus_fd_wr, true);
      }

      if (position === 'TE' && settings.bonus_fd_te && entry.rec_fd) {
        addRow('bonus_fd_te', 'TE First Down Bonus', Number(entry.rec_fd), Number(entry.rec_fd) * settings.bonus_fd_te, true);
      }
    }

    const rows = Array.from(totals.values())
      .map(row => ({
        ...row,
        pts: Math.round(row.pts * 100) / 100,
        statVal: row.statVal != null ? Math.round(row.statVal * 100) / 100 : null,
      }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));

    const breakdownTotal = rows.reduce((sum, row) => sum + row.pts, 0);
    const remainder = Math.round((exactTotal - breakdownTotal) * 100) / 100;
    if (Math.abs(remainder) >= 0.01) {
      rows.push({
        key: 'other_adjustments',
        label: 'Other Scoring Adjustments',
        statVal: null,
        pts: remainder,
      });
    }

    return {
      rows,
      total: Math.round(exactTotal * 100) / 100,
    };
  }, [weeklyStats, scoringSettings, playerIds, week, players]);

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: 'var(--color-bg-secondary)',
            maxWidth: '480px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base truncate" style={{ color: 'var(--color-label)' }}>
                {teamName}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                Week {week} · Scoring Breakdown
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center px-5 py-2 sticky top-0"
            style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
          >
            <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Category</span>
            <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Value</span>
            <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {rows.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No stat data for Week {week}.</span>
              </div>
            ) : (
              <>
                {rows.map(row => (
                  <div
                    key={row.statKey}
                    className="flex items-center px-5 py-2.5"
                    style={{ borderBottom: '1px solid var(--color-separator)' }}
                  >
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>
                      {row.label}
                    </span>
                    <span className="w-14 text-right text-sm tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                      {Number.isInteger(row.statVal) ? row.statVal : row.statVal.toFixed(1)}
                    </span>
                    <span
                      className="w-16 text-right text-sm font-semibold tabular-nums"
                      style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}
                    >
                      {row.pts > 0 ? `+${row.pts.toFixed(2)}` : row.pts.toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Total row */}
                <div
                  className="flex items-center px-5 py-4"
                  style={{ background: 'var(--color-fill-secondary)', borderTop: '1px solid var(--color-separator)' }}
                >
                  <span className="flex-1 text-sm font-bold" style={{ color: 'var(--color-label)' }}>Total</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-signature)' }}>
                    {total.toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-20 px-6">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
