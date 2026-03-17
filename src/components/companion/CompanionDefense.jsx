import { useEffect, useMemo, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { buildDefenseTable } from '../../utils/projectionEngine';
import { calcPoints, DEFAULT_SCORING } from '../../utils/scoringEngine';
import { STADIUMS } from '../../data/stadiums';
import { TEAM_COLORS } from '../../data/teamColors';

// ── Constants ─────────────────────────────────────────────────────────────────

const OFF_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const DEF_POSITIONS = ['ALL', 'DL', 'LB', 'DB'];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const ALL_TEAMS = Object.keys(STADIUMS).sort();

const DEF_POS_GROUPS = { DL: ['DL','DE','DT'], LB: ['LB','ILB','OLB'], DB: ['DB','CB','S','SS','FS'] };
const normDefPos = (pos) => { for (const [n, s] of Object.entries(DEF_POS_GROUPS)) if (s.includes(pos)) return n; return null; };

const STAT_MODES = [
  { id: 'pts',        label: 'Fantasy Pts' },
  { id: 'rec_yd',     label: 'Rec Yds' },
  { id: 'rush_yd',    label: 'Rush Yds' },
  { id: 'game_score', label: 'Game Score' },
];

const DEF_STAT_MODES = [
  { id: 'pts',          label: 'Fantasy Pts', statKey: null },
  { id: 'idp_sack',     label: 'Sacks',       statKey: 'idp_sack' },
  { id: 'idp_int',      label: 'INT',         statKey: 'idp_int' },
  { id: 'idp_ff',       label: 'FF',          statKey: 'idp_ff' },
  { id: 'idp_tkl_loss', label: 'TFL',         statKey: 'idp_tkl_loss' },
  { id: 'idp_pd',       label: 'Pass Def',    statKey: 'idp_pd' },
  { id: 'idp_qbhit',    label: 'QB Hit',      statKey: 'idp_qbhit' },
  { id: 'idp_def_td',   label: 'TD',          statKey: 'idp_def_td' },
];

const HEATMAP_SCOPES = [
  { id: 'overall', label: 'Overall' },
  { id: 'week',    label: 'By Week' },
  { id: 'team',    label: 'By Team' },
];

const TEAM_META = {
  BUF: { conf: 'AFC', div: 'AFC East'  }, MIA: { conf: 'AFC', div: 'AFC East'  },
  NE:  { conf: 'AFC', div: 'AFC East'  }, NYJ: { conf: 'AFC', div: 'AFC East'  },
  BAL: { conf: 'AFC', div: 'AFC North' }, CIN: { conf: 'AFC', div: 'AFC North' },
  CLE: { conf: 'AFC', div: 'AFC North' }, PIT: { conf: 'AFC', div: 'AFC North' },
  HOU: { conf: 'AFC', div: 'AFC South' }, IND: { conf: 'AFC', div: 'AFC South' },
  JAX: { conf: 'AFC', div: 'AFC South' }, TEN: { conf: 'AFC', div: 'AFC South' },
  DEN: { conf: 'AFC', div: 'AFC West'  }, KC:  { conf: 'AFC', div: 'AFC West'  },
  LAC: { conf: 'AFC', div: 'AFC West'  }, LV:  { conf: 'AFC', div: 'AFC West'  },
  DAL: { conf: 'NFC', div: 'NFC East'  }, NYG: { conf: 'NFC', div: 'NFC East'  },
  PHI: { conf: 'NFC', div: 'NFC East'  }, WAS: { conf: 'NFC', div: 'NFC East'  },
  CHI: { conf: 'NFC', div: 'NFC North' }, DET: { conf: 'NFC', div: 'NFC North' },
  GB:  { conf: 'NFC', div: 'NFC North' }, MIN: { conf: 'NFC', div: 'NFC North' },
  ATL: { conf: 'NFC', div: 'NFC South' }, CAR: { conf: 'NFC', div: 'NFC South' },
  NO:  { conf: 'NFC', div: 'NFC South' }, TB:  { conf: 'NFC', div: 'NFC South' },
  ARI: { conf: 'NFC', div: 'NFC West'  }, LAR: { conf: 'NFC', div: 'NFC West'  },
  SEA: { conf: 'NFC', div: 'NFC West'  }, SF:  { conf: 'NFC', div: 'NFC West'  },
};

const TEAM_SORT_OPTIONS = [
  { id: 'alpha',    label: 'A–Z' },
  { id: 'conf',     label: 'Conference' },
  { id: 'division', label: 'Division' },
];

// Stat breakdown labels (statKey → display label + whether to show raw value)
const BREAKDOWN_DEFS = [
  // Passing
  { statKey: 'pass_yd',           scoringKey: 'pass_yd',           label: 'Pass Yds',         showStat: true  },
  { statKey: 'pass_td',           scoringKey: 'pass_td',           label: 'Pass TD',          showStat: true  },
  { statKey: 'pass_int',          scoringKey: 'pass_int',          label: 'INT Thrown',       showStat: true  },
  { statKey: 'pass_2pt',          scoringKey: 'pass_2pt',          label: 'Pass 2PT',         showStat: true  },
  { statKey: 'pass_sack',         scoringKey: 'pass_sack',         label: 'Sacked',           showStat: true  },
  { statKey: 'pass_cmp',          scoringKey: 'pass_cmp',          label: 'Completions',      showStat: true  },
  { statKey: 'pass_inc',          scoringKey: 'pass_inc',          label: 'Incompletions',    showStat: true  },
  { statKey: 'pass_fd',           scoringKey: 'pass_fd',           label: 'Pass 1st Downs',   showStat: true  },
  // Rushing
  { statKey: 'rush_yd',           scoringKey: 'rush_yd',           label: 'Rush Yds',         showStat: true  },
  { statKey: 'rush_td',           scoringKey: 'rush_td',           label: 'Rush TD',          showStat: true  },
  { statKey: 'rush_2pt',          scoringKey: 'rush_2pt',          label: 'Rush 2PT',         showStat: true  },
  { statKey: 'rush_fd',           scoringKey: 'rush_fd',           label: 'Rush 1st Downs',   showStat: true  },
  // Receiving
  { statKey: 'rec',               scoringKey: 'rec',               label: 'Receptions',       showStat: true  },
  { statKey: 'rec_yd',            scoringKey: 'rec_yd',            label: 'Rec Yds',          showStat: true  },
  { statKey: 'rec_td',            scoringKey: 'rec_td',            label: 'Rec TD',           showStat: true  },
  { statKey: 'rec_2pt',           scoringKey: 'rec_2pt',           label: 'Rec 2PT',          showStat: true  },
  { statKey: 'rec_fd',            scoringKey: 'rec_fd',            label: 'Rec 1st Downs',    showStat: true  },
  // Misc
  { statKey: 'fum_lost',          scoringKey: 'fum_lost',          label: 'Fum Lost',         showStat: true  },
  { statKey: 'ret_td',            scoringKey: 'ret_td',            label: 'Return TD',        showStat: true  },
  { statKey: 'st_td',             scoringKey: 'st_td',             label: 'ST TD',            showStat: true  },
  { statKey: 'blk_kick',          scoringKey: 'blk_kick',          label: 'Blk Kick',         showStat: true  },
  // Bonuses
  { statKey: 'bonus_pass_yd_300', scoringKey: 'bonus_pass_yd_300', label: '300+ Pass Yd Bonus', showStat: false },
  { statKey: 'bonus_pass_yd_400', scoringKey: 'bonus_pass_yd_400', label: '400+ Pass Yd Bonus', showStat: false },
  { statKey: 'bonus_rush_yd_100', scoringKey: 'bonus_rush_yd_100', label: '100+ Rush Yd Bonus', showStat: false },
  { statKey: 'bonus_rush_yd_200', scoringKey: 'bonus_rush_yd_200', label: '200+ Rush Yd Bonus', showStat: false },
  { statKey: 'bonus_rec_yd_100',  scoringKey: 'bonus_rec_yd_100',  label: '100+ Rec Yd Bonus',  showStat: false },
  { statKey: 'bonus_rec_yd_200',  scoringKey: 'bonus_rec_yd_200',  label: '200+ Rec Yd Bonus',  showStat: false },
  // Kicker
  { statKey: 'fgm',               scoringKey: 'fgm',               label: 'FG Made',          showStat: true  },
  { statKey: 'fgm_0_19',          scoringKey: 'fgm_0_19',          label: 'FG 0–19',          showStat: true  },
  { statKey: 'fgm_20_29',         scoringKey: 'fgm_20_29',         label: 'FG 20–29',         showStat: true  },
  { statKey: 'fgm_30_39',         scoringKey: 'fgm_30_39',         label: 'FG 30–39',         showStat: true  },
  { statKey: 'fgm_40_49',         scoringKey: 'fgm_40_49',         label: 'FG 40–49',         showStat: true  },
  { statKey: 'fgm_50_59',         scoringKey: 'fgm_50_59',         label: 'FG 50–59',         showStat: true  },
  { statKey: 'fgm_60p',           scoringKey: 'fgm_60p',           label: 'FG 60+',           showStat: true  },
  { statKey: 'fgmiss',            scoringKey: 'fgmiss',            label: 'FG Miss',          showStat: true  },
  { statKey: 'xpm',               scoringKey: 'xpm',               label: 'XP Made',          showStat: true  },
  { statKey: 'xpmiss',            scoringKey: 'xpmiss',            label: 'XP Miss',          showStat: true  },
  // IDP
  { statKey: 'idp_tkl',           scoringKey: 'idp_tkl',           label: 'Tackles',          showStat: true  },
  { statKey: 'idp_tkl_solo',      scoringKey: 'idp_tkl_solo',      label: 'Solo Tackles',     showStat: true  },
  { statKey: 'idp_tkl_ast',       scoringKey: 'idp_tkl_ast',       label: 'Ast Tackles',      showStat: true  },
  { statKey: 'idp_tkl_loss',      scoringKey: 'idp_tkl_loss',      label: 'TFL',              showStat: true  },
  { statKey: 'idp_sack',          scoringKey: 'idp_sack',          label: 'Sacks',            showStat: true  },
  { statKey: 'idp_int',           scoringKey: 'idp_int',           label: 'INT',              showStat: true  },
  { statKey: 'idp_ff',            scoringKey: 'idp_ff',            label: 'Forced Fum',       showStat: true  },
  { statKey: 'idp_fr',            scoringKey: 'idp_fr',            label: 'Fum Rec',          showStat: true  },
  { statKey: 'idp_pd',            scoringKey: 'idp_pd',            label: 'Pass Def',         showStat: true  },
  { statKey: 'idp_qbhit',         scoringKey: 'idp_qbhit',         label: 'QB Hits',          showStat: true  },
  { statKey: 'idp_safety',        scoringKey: 'idp_safety',        label: 'Safety',           showStat: true  },
  { statKey: 'idp_def_td',        scoringKey: 'idp_def_td',        label: 'Def TD',           showStat: true  },
  { statKey: 'idp_blk_kick',      scoringKey: 'idp_blk_kick',      label: 'Blk Kick',         showStat: true  },
];

function getScoreBreakdown(wEntry, scoringSettings) {
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };
  const items = [];
  for (const { statKey, scoringKey, label, showStat } of BREAKDOWN_DEFS) {
    const statVal = wEntry[statKey];
    if (!statVal || !settings[scoringKey]) continue;
    const pts = statVal * settings[scoringKey];
    if (Math.abs(pts) < 0.005) continue;
    items.push({ label, statVal: showStat ? statVal : null, pts });
  }
  return items.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
}

// Multi-stop heatmap: dark red → orange → yellow → green
function heatColor(t) {
  const stops = [
    { t: 0.00, r: 176, g: 20,  b: 20  },
    { t: 0.30, r: 220, g: 95,  b: 15  },
    { t: 0.58, r: 235, g: 205, b: 25  },
    { t: 1.00, r: 30,  g: 155, b: 55  },
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const prev = stops[i - 1], curr = stops[i];
      const f = (t - prev.t) / (curr.t - prev.t);
      return `rgba(${Math.round(prev.r + f*(curr.r-prev.r))}, ${Math.round(prev.g + f*(curr.g-prev.g))}, ${Math.round(prev.b + f*(curr.b-prev.b))}, 0.78)`;
    }
  }
  return 'rgba(30, 155, 55, 0.78)';
}

// ESPN CDN uses different abbreviations for a handful of teams
const ESPN_ID = { WAS: 'wsh' };
const espnLogoUrl = (team) =>
  `https://a.espncdn.com/i/teamlogos/nfl/500/${(ESPN_ID[team] ?? team).toLowerCase()}.png`;

// STADIUMS / Sleeper use WAS and LAR; TEAM_COLORS uses wsh and la
const TEAM_COLOR_KEY = { WAS: 'wsh', LAR: 'la' };

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Blend a hex color with the app background to produce a fully opaque color.
// Used for sticky cells so scrolled content doesn't bleed through.
function blendColor(hex, alpha, isDark) {
  const [bgR, bgG, bgB] = isDark ? [12, 15, 20] : [242, 241, 236];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(bgR + (r - bgR) * alpha)}, ${Math.round(bgG + (g - bgG) * alpha)}, ${Math.round(bgB + (b - bgB) * alpha)})`;
}

// Interpolate between two hex colors at position t (0→1)
function heatColorTeam(t, hexLow, hexHigh) {
  const parse = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hexLow);
  const [r2, g2, b2] = parse(hexHigh);
  return `rgba(${Math.round(r1 + t * (r2 - r1))}, ${Math.round(g1 + t * (g2 - g1))}, ${Math.round(b1 + t * (b2 - b1))}, 0.85)`;
}

// ── Filter UI helpers ─────────────────────────────────────────────────────────

function Btn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors shrink-0"
      style={{
        background: active ? 'var(--color-signature)' : 'var(--color-fill)',
        color: active ? '#000' : 'var(--color-label-secondary)',
      }}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {children}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompanionDefense({ onViewPlayer }) {
  const { weeklyStats, players, scheduleMap, scoringSettings } = useSleeper();
  const { favoriteTeam, darkMode } = useTheme();

  const [viewMode, setViewMode] = useState('offense');  // 'offense' | 'defense'
  const [pos, setPos]       = useState('ALL');           // offense position
  const [defPos, setDefPos] = useState('ALL');           // defense position
  const [statMode, setStatMode]         = useState('pts');
  const [defStatMode, setDefStatMode]   = useState('pts');
  const [heatmapScope, setHeatmapScope] = useState('overall');
  const [sortKey, setSortKey] = useState('avg');
  const [sortDir, setSortDir] = useState('desc');
  const [teamSort, setTeamSort] = useState('alpha');
  const [drilldown, setDrilldown] = useState(null); // { team, week }
  const [useTeamColors, setUseTeamColors] = useState(false);

  // Lock body scroll while drilldown is open
  useEffect(() => {
    if (!drilldown) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [drilldown]);

  // ── Tables ─────────────────────────────────────────────────────────────────

  // Offense-allowed table: keyed by opponent team
  const offenseAllowedTable = useMemo(() => {
    if (!weeklyStats || !players || !scheduleMap) return null;
    let valueFn;
    if (statMode === 'rec_yd')  valueFn = (w) => w.rec_yd  ?? 0;
    if (statMode === 'rush_yd') valueFn = (w) => w.rush_yd ?? 0;
    return buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings, valueFn);
  }, [weeklyStats, players, scheduleMap, scoringSettings, statMode]);

  // Defense-scored table: keyed by the defensive player's own team
  const defenseScoredTable = useMemo(() => {
    if (!weeklyStats || !players) return null;
    const defMode = DEF_STAT_MODES.find(m => m.id === defStatMode);
    const getValue = defMode?.statKey
      ? (wEntry) => wEntry[defMode.statKey] ?? 0
      : (wEntry) => calcPoints(wEntry, scoringSettings);
    const table = {};
    for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
      const player = players[playerId];
      if (!player) continue;
      const normPos = normDefPos(player.position);
      if (!normPos) continue;
      for (const wEntry of playerWeeks) {
        const val = getValue(wEntry);
        if (val <= 0) continue;
        const team = (wEntry.team || player.team)?.toUpperCase();
        if (!team) continue;
        // Only count weeks the team actually played — filters out phantom bye-week data
        if (scheduleMap && !scheduleMap[wEntry.week]?.[team]) continue;
        if (!table[team]) table[team] = {};
        if (!table[team][normPos]) table[team][normPos] = {};
        table[team][normPos][wEntry.week] = (table[team][normPos][wEntry.week] ?? 0) + val;
      }
    }
    return table;
  }, [weeklyStats, players, scoringSettings, defStatMode, scheduleMap]);

  const activeTable = viewMode === 'offense' ? offenseAllowedTable : defenseScoredTable;
  const activePositions = viewMode === 'offense' ? OFF_POSITIONS : DEF_POSITIONS;
  const activePos = viewMode === 'offense' ? pos : defPos;
  const setActivePos = viewMode === 'offense' ? setPos : setDefPos;

  // ── Rows ───────────────────────────────────────────────────────────────────

  const baseRows = useMemo(() => {
    // Game Score mode: pull actual points-allowed directly from scheduleMap
    if (viewMode === 'offense' && statMode === 'game_score') {
      return ALL_TEAMS.map(team => {
        const weekPts = {};
        if (scheduleMap) {
          for (const w of WEEKS) {
            const entry = scheduleMap[w]?.[team];
            if (entry?.ptsAgainst != null) weekPts[w] = entry.ptsAgainst;
          }
        }
        const total = Object.values(weekPts).reduce((s, v) => s + v, 0);
        const weeksPlayed = scheduleMap ? WEEKS.filter(w => scheduleMap[w]?.[team] != null).length : Object.keys(weekPts).length;
        const avg = weeksPlayed > 0 && Object.keys(weekPts).length > 0 ? total / weeksPlayed : null;
        return { team, weekPts, avg };
      });
    }

    const posList = viewMode === 'offense' ? ['QB','RB','WR','TE','K'] : Object.keys(DEF_POS_GROUPS);
    return ALL_TEAMS.map(team => {
      let weekData = {};
      if (activeTable) {
        const teamData = activeTable[team] ?? {};
        if (activePos === 'ALL') {
          for (const p of posList) {
            for (const [w, v] of Object.entries(teamData[p] ?? {})) {
              weekData[w] = (weekData[w] ?? 0) + v;
            }
          }
        } else {
          weekData = teamData[activePos] ?? {};
        }
      }
      const total = Object.values(weekData).reduce((s, v) => s + v, 0);
      const weeksPlayed = scheduleMap ? WEEKS.filter(w => scheduleMap[w]?.[team] != null).length : Object.keys(weekData).length;
      const avg = weeksPlayed > 0 && Object.keys(weekData).length > 0 ? total / weeksPlayed : null;
      return { team, weekPts: weekData, avg };
    });
  }, [activeTable, activePos, viewMode, statMode, scheduleMap]);

  const rows = useMemo(() => {
    if (sortKey === 'team') {
      return [...baseRows].sort((a, b) => {
        const am = TEAM_META[a.team] ?? { conf: 'ZZZ', div: 'ZZZ' };
        const bm = TEAM_META[b.team] ?? { conf: 'ZZZ', div: 'ZZZ' };
        if (teamSort === 'division') {
          const d = am.div.localeCompare(bm.div); if (d) return d;
        } else if (teamSort === 'conf') {
          const c = am.conf.localeCompare(bm.conf); if (c) return c;
        }
        return a.team.localeCompare(b.team);
      });
    }
    return [...baseRows].sort((a, b) => {
      const aVal = sortKey === 'avg' ? a.avg : a.weekPts[sortKey];
      const bVal = sortKey === 'avg' ? b.avg : b.weekPts[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [baseRows, sortKey, sortDir, teamSort]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function resetSort() { setSortKey('avg'); setSortDir('desc'); setTeamSort('alpha'); }

  // ── Column averages ────────────────────────────────────────────────────────

  const colAvgs = useMemo(() => {
    const avgs = {};
    for (const w of WEEKS) {
      const vals = baseRows.map(r => r.weekPts[w]).filter(v => v != null);
      if (vals.length) avgs[w] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    return avgs;
  }, [baseRows]);

  // ── Heatmap ────────────────────────────────────────────────────────────────

  const heatRanges = useMemo(() => {
    const allVals = baseRows.flatMap(r => Object.values(r.weekPts));
    const overallMin = allVals.length ? Math.min(...allVals) : 0;
    const overallMax = allVals.length ? Math.max(...allVals) : 1;
    const weekMin = {}, weekMax = {};
    for (const w of WEEKS) {
      const vals = baseRows.map(r => r.weekPts[w]).filter(v => v != null);
      if (vals.length) { weekMin[w] = Math.min(...vals); weekMax[w] = Math.max(...vals); }
    }
    const teamMin = {}, teamMax = {};
    for (const { team, weekPts } of baseRows) {
      const vals = Object.values(weekPts);
      if (vals.length) { teamMin[team] = Math.min(...vals); teamMax[team] = Math.max(...vals); }
    }
    const avgVals = baseRows.map(r => r.avg).filter(v => v != null);
    const avgMin = avgVals.length ? Math.min(...avgVals) : 0;
    const avgMax = avgVals.length ? Math.max(...avgVals) : 1;
    return { overallMin, overallMax, weekMin, weekMax, teamMin, teamMax, avgMin, avgMax };
  }, [baseRows, viewMode]);

  function cellBg(pts, team, week) {
    if (pts == null) return undefined;
    let min, max;
    if (week === null) {
      min = heatRanges.avgMin; max = heatRanges.avgMax;
    } else if (heatmapScope === 'week') {
      min = heatRanges.weekMin[week]; max = heatRanges.weekMax[week];
    } else if (heatmapScope === 'team') {
      min = heatRanges.teamMin[team]; max = heatRanges.teamMax[team];
    } else {
      min = heatRanges.overallMin; max = heatRanges.overallMax;
    }
    if (min == null || max == null || max === min) return undefined;
    const raw = (pts - min) / (max - min);
    const t = viewMode === 'defense' ? raw : 1 - raw;
    if (useTeamColors && favoriteTeam && TEAM_COLORS[favoriteTeam]) {
      const tc = TEAM_COLORS[favoriteTeam];
      const hexLow  = darkMode ? (tc.darkSecondary ?? tc.secondary) : tc.secondary;
      const hexHigh = darkMode ? (tc.darkPrimary   ?? tc.primary)   : tc.primary;
      return heatColorTeam(t, hexLow, hexHigh);
    }
    return heatColor(t);
  }

  const sortIndicator = (key) => sortKey === key
    ? <span style={{ marginLeft: '3px', opacity: 0.7 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
    : null;

  // ── Drilldown players ──────────────────────────────────────────────────────

  const drilldownPlayers = useMemo(() => {
    if (!drilldown || !weeklyStats || !players) return [];
    const { team, week } = drilldown;
    const results = [];

    if (viewMode === 'offense') {
      const matchPos = activePos === 'ALL' ? null : activePos;
      for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
        const player = players[playerId];
        if (!player) continue;
        if (matchPos && player.position !== matchPos) continue;
        if (!matchPos && !['QB','RB','WR','TE','K'].includes(player.position)) continue;
        const wEntry = playerWeeks.find(w => w.week === week);
        if (!wEntry) continue;
        const entryOpp = wEntry.opp?.toUpperCase();
        if (entryOpp) { if (entryOpp !== team) continue; }
        else {
          const currentTeam = player.team?.toUpperCase();
          if (!currentTeam || !scheduleMap) continue;
          const inferred = scheduleMap[week]?.[currentTeam]?.opp?.toUpperCase();
          if (inferred !== team) continue;
        }
        let val;
        if (statMode === 'rec_yd')       val = wEntry.rec_yd  ?? 0;
        else if (statMode === 'rush_yd') val = wEntry.rush_yd ?? 0;
        else val = calcPoints(wEntry, scoringSettings);
        if (val <= 0) continue;
        const breakdown = statMode === 'pts' ? getScoreBreakdown(wEntry, scoringSettings) : null;
        const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || playerId;
        results.push({ playerId, name, position: player.position, val, breakdown });
      }
    } else {
      // Defense scored: players who scored FOR that team
      const matchNorm = activePos === 'ALL' ? null : activePos;
      const defMode = DEF_STAT_MODES.find(m => m.id === defStatMode);
      const getDefVal = defMode?.statKey
        ? (wEntry) => wEntry[defMode.statKey] ?? 0
        : (wEntry) => calcPoints(wEntry, scoringSettings);
      for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
        const player = players[playerId];
        if (!player) continue;
        const normPos = normDefPos(player.position);
        if (!normPos) continue;
        if (matchNorm && normPos !== matchNorm) continue;
        const wEntry = playerWeeks.find(w => w.week === week);
        if (!wEntry) continue;
        const playerTeam = (wEntry.team || player.team)?.toUpperCase();
        if (playerTeam !== team) continue;
        const val = getDefVal(wEntry);
        if (val <= 0) continue;
        const breakdown = defStatMode === 'pts' ? getScoreBreakdown(wEntry, scoringSettings) : null;
        const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || playerId;
        results.push({ playerId, name, position: player.position, val, breakdown });
      }
    }

    return results.sort((a, b) => b.val - a.val);
  }, [drilldown, weeklyStats, players, viewMode, activePos, statMode, defStatMode, scoringSettings, scheduleMap]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const loaded = viewMode === 'offense' ? !!offenseAllowedTable : !!defenseScoredTable;

  return (
    <div className="pb-6 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Unified filter bar — single row on wide screens, wraps on mobile */}
      <div className="px-4 sm:px-6 lg:px-8 pb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <FilterGroup label="View">
          {[{ id: 'offense', label: 'Allowed' }, { id: 'defense', label: 'Scored' }].map(m => (
            <Btn key={m.id} active={viewMode === m.id} onClick={() => { setViewMode(m.id); resetSort(); }}>
              {m.label}
            </Btn>
          ))}
        </FilterGroup>

        {!(viewMode === 'offense' && statMode === 'game_score') && (
          <FilterGroup label="Position">
            {activePositions.map(p => (
              <Btn key={p} active={activePos === p} onClick={() => { setActivePos(p); resetSort(); }}>
                {p}
              </Btn>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="Stat">
          {(viewMode === 'offense' ? STAT_MODES : DEF_STAT_MODES).map(m => (
            <Btn
              key={m.id}
              active={viewMode === 'offense' ? statMode === m.id : defStatMode === m.id}
              onClick={() => viewMode === 'offense' ? setStatMode(m.id) : setDefStatMode(m.id)}
            >
              {m.label}
            </Btn>
          ))}
        </FilterGroup>

        <FilterGroup label="Color">
          {HEATMAP_SCOPES.map(s => (
            <Btn key={s.id} active={heatmapScope === s.id} onClick={() => setHeatmapScope(s.id)}>
              {s.label}
            </Btn>
          ))}
        </FilterGroup>

        {favoriteTeam && (
          <Btn active={useTeamColors} onClick={() => setUseTeamColors(v => !v)}>
            {favoriteTeam.toUpperCase()} Colors
          </Btn>
        )}
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-16 px-4">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            Load season stats to see defensive rankings.
          </span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'var(--defense-grid-max-height)', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 'max-content', width: '100%', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={stickyHeadStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Team</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {TEAM_SORT_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => { setTeamSort(opt.id); setSortKey('team'); }}
                          style={{
                            fontSize: '9px', padding: '1px 4px', borderRadius: '3px',
                            border: 'none', cursor: 'pointer', fontWeight: 600,
                            background: sortKey === 'team' && teamSort === opt.id
                              ? 'var(--color-signature)' : 'var(--color-fill)',
                            color: sortKey === 'team' && teamSort === opt.id
                              ? '#000' : 'var(--color-label-secondary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </th>
                <th style={{ ...headStyle(true), cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('avg')}>
                  <div>AVG{sortIndicator('avg')}</div>
                </th>
                {WEEKS.map(w => (
                  <th key={w} style={{ ...headStyle(false), cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort(w)}>
                    <div>Wk {w}{sortIndicator(w)}</div>
                    {colAvgs[w] != null && (
                      <div style={{ color: 'var(--color-label-secondary)', fontWeight: 400, fontSize: '10px' }}>
                        {colAvgs[w].toFixed(1)}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ team, weekPts, avg }, idx) => {
                const rowBg = idx % 2 === 0 ? 'var(--color-bg)' : 'var(--color-fill)';
                const tc = TEAM_COLORS[TEAM_COLOR_KEY[team] ?? team.toLowerCase()];
                const teamHex = tc ? (darkMode ? (tc.darkPrimary ?? tc.primary) : tc.primary) : null;
                const colorAlpha = darkMode ? 0.55 : 0.75;
                // Use a fully opaque blended color for the sticky column so scrolled
                // content doesn't bleed through the semi-transparent team color.
                const teamBg = teamHex ? blendColor(teamHex, colorAlpha, darkMode) : rowBg;
                return (
                  <tr key={team}>
                    <td style={{ ...stickyBodyStyle, background: teamBg }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <img
                          src={espnLogoUrl(team)}
                          alt={team}
                          width={18}
                          height={18}
                          style={{ objectFit: 'contain', flexShrink: 0 }}
                        />
                        {team}
                        {sortKey === 'team' && teamSort === 'conf' && TEAM_META[team] && (
                          <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--color-label-tertiary)', marginLeft: 4 }}>
                            {TEAM_META[team].conf}
                          </span>
                        )}
                        {sortKey === 'team' && teamSort === 'division' && TEAM_META[team] && (
                          <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--color-label-tertiary)', marginLeft: 4 }}>
                            {TEAM_META[team].div}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...cellStyle(true), background: avg != null ? cellBg(avg, team, null) : rowBg, color: avg != null ? '#000' : 'var(--color-label)' }}>
                      {avg != null ? avg.toFixed(1) : '—'}
                    </td>
                    {WEEKS.map(w => {
                      const pts = weekPts[w];
                      const played = scheduleMap?.[w]?.[team] != null;
                      // A bye is a week that has game data for other teams but not this one
                      const weekHasGames = !!scheduleMap && Object.keys(scheduleMap[w] ?? {}).length > 0;
                      const isBye = weekHasGames && !played;
                      const clickable = pts != null && !(viewMode === 'offense' && statMode === 'game_score');
                      return (
                        <td
                          key={w}
                          onClick={clickable ? () => setDrilldown({ team, week: w }) : undefined}
                          style={{
                            ...cellStyle(false),
                            background: pts != null ? cellBg(pts, team, w) : rowBg,
                            color: pts != null ? '#000' : 'var(--color-label-secondary)',
                            cursor: clickable ? 'pointer' : 'default',
                          }}
                        >
                          {pts != null ? (
                            <>
                              <div>{statMode === 'game_score' || (viewMode === 'defense' && DEF_STAT_MODES.find(m => m.id === defStatMode)?.statKey) ? (Number.isInteger(pts) ? pts : pts.toFixed(1)) : pts.toFixed(1)}</div>
                              {scheduleMap?.[w]?.[team]?.opp && (
                                <div style={{ fontSize: '8px', opacity: 0.6, marginTop: '1px' }}>
                                  {scheduleMap[w][team].opp}
                                </div>
                              )}
                            </>
                          ) : isBye ? (
                            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.55 }}>BYE</span>
                          ) : played ? '—' : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drilldown modal */}
      {drilldown && (
        <div
          onClick={() => setDrilldown(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg)',
              borderRadius: '16px',
              padding: '24px 20px',
              width: '100%',
              maxWidth: '400px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
              textAlign: 'center',
            }}
          >
            {/* Header */}
            {(() => {
              const sched = scheduleMap?.[drilldown.week]?.[drilldown.team];
              const opp = sched?.opp;
              const homeTeam = sched?.home ? drilldown.team : opp;
              const awayTeam = sched?.home ? opp : drilldown.team;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginBottom: 6 }}>
                    Week {drilldown.week}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {awayTeam && <img src={espnLogoUrl(awayTeam)} width={28} height={28} style={{ objectFit: 'contain' }} alt={awayTeam} />}
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                      {awayTeam ?? drilldown.team}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)' }}>vs</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                      {homeTeam ?? '—'}
                    </span>
                    {homeTeam && <img src={espnLogoUrl(homeTeam)} width={28} height={28} style={{ objectFit: 'contain' }} alt={homeTeam} />}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 6 }}>
                    {viewMode === 'offense' ? (activePos === 'ALL' ? 'All positions' : activePos) : (activePos === 'ALL' ? 'All defense' : activePos)}
                    {' · '}
                    {viewMode === 'offense'
                      ? STAT_MODES.find(m => m.id === statMode)?.label
                      : DEF_STAT_MODES.find(m => m.id === defStatMode)?.label}
                    {' · '}{drilldownPlayers.length} player{drilldownPlayers.length !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })()}

            {drilldownPlayers.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-label-tertiary)', padding: '16px 0' }}>
                No data found for this matchup.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {drilldownPlayers.map(({ name, position, val, breakdown, playerId }, i) => {
                  const valLabel = viewMode === 'offense'
                    ? (statMode === 'rec_yd' || statMode === 'rush_yd' ? 'yds' : 'pts')
                    : (DEF_STAT_MODES.find(m => m.id === defStatMode)?.statKey
                        ? DEF_STAT_MODES.find(m => m.id === defStatMode)?.label.toLowerCase()
                        : 'pts');
                  return (
                    <div
                      key={i}
                      style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--color-fill)' }}
                    >
                      {/* Compact header: name · pos · value */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: breakdown?.length ? 6 : 0 }}>
                        <button
                          onClick={onViewPlayer && players?.[playerId]?.espn_id ? () => { setDrilldown(null); onViewPlayer(String(players[playerId].espn_id), { displayName: name, teamId: players[playerId].team?.toUpperCase() }); } : undefined}
                          style={{
                            fontSize: 13, fontWeight: 700, color: onViewPlayer && players?.[playerId]?.espn_id ? 'var(--color-interactive)' : 'var(--color-label)',
                            background: 'none', border: 'none', padding: 0, cursor: onViewPlayer && players?.[playerId]?.espn_id ? 'pointer' : 'default',
                            textAlign: 'left',
                          }}
                        >
                          {name}
                        </button>
                        <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)' }}>{position}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums' }}>
                          {val % 1 === 0 ? val : val.toFixed(1)} {valLabel}
                        </span>
                      </div>

                      {/* Score breakdown */}
                      {breakdown?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {breakdown.map((item, j) => (
                            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-label-secondary)' }}>
                              <span>
                                {item.label}{item.statVal != null ? `: ${Number.isInteger(item.statVal) ? item.statVal : item.statVal.toFixed(1)}` : ''}
                              </span>
                              <span style={{ fontWeight: 600, color: item.pts < 0 ? 'rgba(220,60,60,0.9)' : 'var(--color-label)', fontVariantNumeric: 'tabular-nums' }}>
                                {item.pts > 0 ? '+' : ''}{item.pts.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setDrilldown(null)}
              style={{
                marginTop: 16, width: '100%', padding: '10px',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--color-fill)',
                fontSize: 13, fontWeight: 600, color: 'var(--color-label-secondary)',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Corner cell: sticky both top + left, highest z-index
// Uses --color-bg (opaque) instead of --color-fill-secondary (semi-transparent)
const stickyHeadStyle = {
  position: 'sticky', left: 0, top: 0, zIndex: 4,
  background: 'var(--color-bg)',
  padding: '6px 10px',
  textAlign: 'left',
  color: 'var(--color-label-secondary)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontSize: '10px',
  borderBottom: '1px solid var(--color-separator-opaque)',
  borderRight: '1px solid var(--color-separator-opaque)',
  whiteSpace: 'nowrap',
};

// Regular header cells: sticky top only
function headStyle(isAvg) {
  return {
    position: 'sticky', top: 0, zIndex: 3,
    padding: '6px 8px',
    textAlign: 'center',
    color: 'var(--color-label-secondary)',
    fontWeight: 600,
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    background: 'var(--color-bg)',
    borderBottom: '1px solid var(--color-separator-opaque)',
    borderLeft: '1px solid var(--color-separator)',
    whiteSpace: 'nowrap',
    minWidth: isAvg ? '44px' : '40px',
  };
}

// Body first-column cells: sticky left, fully opaque background set inline.
// Uses opaque separators so scrolled heatmap cells don't bleed through the border gap.
const stickyBodyStyle = {
  position: 'sticky', left: 0, zIndex: 2,
  padding: '5px 10px',
  fontWeight: 700,
  fontSize: '11px',
  color: 'var(--color-label)',
  borderRight: '1px solid var(--color-separator-opaque)',
  borderBottom: '1px solid var(--color-separator-opaque)',
  whiteSpace: 'nowrap',
};

function cellStyle(isAvg) {
  return {
    padding: '5px 6px',
    textAlign: 'center',
    fontWeight: isAvg ? 700 : 400,
    borderLeft: '1px solid var(--color-separator)',
    borderBottom: '1px solid var(--color-separator)',
    whiteSpace: 'nowrap',
    color: 'var(--color-label)',
  };
}
