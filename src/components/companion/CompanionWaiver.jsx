import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPoints, calcPointsFromTotals, getRecentAvg } from '../../utils/scoringEngine';
import { projectPlayer, buildDefenseTable, getDefenseStrength, getLeagueAvgPPG } from '../../utils/projectionEngine';
import { STADIUMS } from '../../data/stadiums';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const POSITION_COLORS = {
  QB: '#ef4444', RB: '#22c55e', WR: '#3b82f6', TE: '#f59e0b', K: '#8b5cf6',
};

export default function CompanionWaiver({ onViewPlayer }) {
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

  const [posFilter, setPosFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'projected' | 'recent' | 'season'
  const debounceRef = useRef(null);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  // Build set of all rostered player IDs across the whole league
  const rosteredIds = useMemo(() => {
    const ids = new Set();
    for (const r of rosters) {
      for (const id of (r.players || [])) ids.add(id);
      for (const id of (r.reserve || [])) ids.add(id);
    }
    return ids;
  }, [rosters]);

  // My roster IDs (memoized — myRoster() is a function, not a value)
  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const myPlayerIds = useMemo(() => {
    if (!myRosterData) return new Set();
    return new Set([...(myRosterData.players || []), ...(myRosterData.reserve || [])]);
  }, [myRosterData]);
  void myPlayerIds; // used for "add" context in future

  // Projection week: last scored leg + 1, or last regular-season week
  const week = useMemo(() => {
    const playoffStart = league?.settings?.playoff_week_start ?? 18;
    const lastScored = league?.settings?.last_scored_leg;
    if (lastScored) return Math.min(lastScored + 1, playoffStart - 1);
    return Math.max(1, playoffStart - 1);
  }, [league]);

  // ── Pre-compute defense table once (replaces per-player getOpponentStrength calls) ──
  const defenseTable = useMemo(() => {
    if (!weeklyStats || !players) return null;
    return buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings);
  }, [weeklyStats, players, scheduleMap, scoringSettings]);

  // ── Pre-compute league avg PPG per position (replaces per-player getLeagueAvgPPG calls) ──
  const leagueAvgByPos = useMemo(() => {
    if (!weeklyStats || !players) return {};
    const result = {};
    for (const pos of SKILL_POSITIONS) {
      result[pos] = getLeagueAvgPPG(pos, weeklyStats, players, scoringSettings, week);
    }
    return result;
  }, [weeklyStats, players, scoringSettings, week]);

  // ── Enrich all available players with projections (no filter/sort deps) ──────
  // This is the expensive memo. It only recomputes when the underlying data changes,
  // not when the user changes position filter, search, or sort column.
  const enrichedPlayers = useMemo(() => {
    if (!players || !seasonStats) return [];

    return Object.entries(seasonStats)
      .map(([id, stats]) => {
        if (rosteredIds.has(id)) return null;
        const p = players[id];
        if (!p) return null;
        const pos = p.position;
        if (!SKILL_POSITIONS.has(pos)) return null;

        const pts = calcPointsFromTotals(stats, scoringSettings);
        if (pts <= 0) return null;

        const weekly = weeklyStats?.[id] ?? [];
        const recentAvg = getRecentAvg(weekly, scoringSettings, 4);

        // Season average from weekly game scores
        const gamePts = weekly.map(w => calcPoints(w, scoringSettings)).filter(p => p > 0);
        const seasonAvg = gamePts.length > 0 ? gamePts.reduce((s, v) => s + v, 0) / gamePts.length : 0;

        // Trending: recent avg ≥ 25% above season avg and at least 2 pts higher
        const isTrending = recentAvg > 0 && seasonAvg > 0
          && recentAvg >= seasonAvg * 1.25
          && (recentAvg - seasonAvg) >= 2;

        // Upcoming matchup from scheduleMap
        const team = p.team?.toUpperCase();
        const matchup = scheduleMap?.[week]?.[team];
        const oppTeam = matchup?.opp ?? null;
        const isHome = matchup?.home ?? null;

        // Indoor: game is played at the home team's venue
        const venueTeam = isHome === true ? team : isHome === false ? oppTeam : null;
        const isIndoor = venueTeam ? (STADIUMS[venueTeam]?.indoor ?? false) : false;

        // Projection using pre-computed defense table (O(1) lookup, no full scan)
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
            allWeeklyStats: null,  // not needed — skipOpponentLookup prevents fallback
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
        };
      })
      .filter(Boolean);
  }, [players, seasonStats, weeklyStats, scheduleMap, scoringSettings, rosteredIds, week, espnIdOverrides, defenseTable, leagueAvgByPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter, sort, and slice (cheap — no projection math) ─────────────────────
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedPlayers
      .filter(p => posFilter === 'ALL' || p.position === posFilter)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
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
  }, [enrichedPlayers, posFilter, search, sortBy]);

  const sortLabel = sortBy === 'projected' ? 'projected pts' : sortBy === 'season' ? 'season total' : 'recent avg (last 4 weeks)';

  return (
    <div className="pb-6">
      {/* Filters */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: posFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)',
                color: posFilter === pos ? '#0C0F14' : 'var(--color-label-secondary)',
              }}
            >
              {pos}
            </button>
          ))}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-label-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(e.target.value), 200);
            }}
            placeholder="Search players…"
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

      {/* Sorting note */}
      <div className="px-4 pb-2">
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
          Sorted by {sortLabel}
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
        <div className="w-9 shrink-0" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
        <ColHeader label="Proj" active={sortBy === 'projected'} onClick={() => setSortBy(s => s === 'projected' ? 'recent' : 'projected')} />
        <ColHeader label="Season" active={sortBy === 'season'} onClick={() => setSortBy(s => s === 'season' ? 'recent' : 'season')} />
        <ColHeader label="4-Wk Avg" active={sortBy === 'recent'} onClick={() => setSortBy('recent')} />
      </div>

      {!seasonStats && !statsLoading && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading stats…</span>
        </div>
      )}

      {available.map(player => (
        <WaiverRow
          key={player.id}
          player={player}
          onViewPlayer={onViewPlayer}
          sortBy={sortBy}
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
      className="w-14 text-right shrink-0 flex items-center justify-end gap-0.5"
      style={{ color: active ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}
    >
      <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
      {active && <span style={{ fontSize: '9px' }}>↓</span>}
    </button>
  );
}

function WaiverRow({ player, onViewPlayer, sortBy }) {
  const isInjured = player.injuryStatus && !['Questionable', 'Probable'].includes(player.injuryStatus);
  const posColor = POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)';
  const canNav = !!(onViewPlayer && player.espnId);

  return (
    <div className="flex items-center px-4 py-2.5 gap-3" style={{ borderBottom: '1px solid var(--color-separator)' }}>
      <img
        src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
        alt={player.name}
        className="w-9 h-9 rounded-full shrink-0 object-cover"
        style={{ background: 'var(--color-fill)' }}
        onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={canNav ? () => onViewPlayer(String(player.espnId), {
              displayName: player.name,
              teamId: player.team,
              position: player.position,
              experience: player.yearsExp != null ? player.yearsExp + 1 : undefined,
            }) : undefined}
            className="font-semibold text-sm truncate text-left"
            style={{ color: canNav ? 'var(--color-accent)' : 'var(--color-label)', background: 'none', border: 'none', padding: 0, cursor: canNav ? 'pointer' : 'default' }}
          >
            {player.name}
          </button>
          {player.isTrending && (
            <span
              className="shrink-0 text-xs font-bold px-1 py-0.5 rounded"
              style={{ fontSize: '9px', background: 'rgba(30,155,55,0.12)', color: 'var(--color-accent-green)' }}
            >
              ↑ HOT
            </span>
          )}
          {player.injuryStatus && (
            <span
              className="text-xs font-bold px-1 py-0.5 rounded shrink-0"
              style={{
                background: isInjured ? 'rgba(239,68,68,0.12)' : 'rgba(245,183,0,0.12)',
                color: isInjured ? 'var(--color-accent-red)' : 'var(--color-signature)',
                fontSize: '10px',
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

      {/* Projected */}
      <div className="w-14 text-right shrink-0">
        <span
          className="font-bold tabular-nums text-sm"
          style={{ color: player.projected != null
            ? (sortBy === 'projected' ? 'var(--color-label)' : 'var(--color-label-secondary)')
            : 'var(--color-label-quaternary)' }}
        >
          {player.projected != null ? player.projected.toFixed(1) : '—'}
        </span>
      </div>

      {/* Season total */}
      <div className="w-14 text-right shrink-0">
        <span className="tabular-nums text-sm" style={{ color: sortBy === 'season' ? 'var(--color-label)' : 'var(--color-label-secondary)' }}>
          {player.pts.toFixed(1)}
        </span>
      </div>

      {/* 4-week avg */}
      <div className="w-14 text-right shrink-0">
        <span className="tabular-nums text-sm" style={{ color: sortBy === 'recent' ? 'var(--color-label)' : 'var(--color-label-secondary)' }}>
          {player.recentAvg > 0 ? player.recentAvg.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  );
}
