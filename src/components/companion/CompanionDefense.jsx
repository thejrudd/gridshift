import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, DEFAULT_SCORING } from '../../utils/scoringEngine';
import { STADIUMS } from '../../data/stadiums';
import { TEAM_COLORS } from '../../data/teamColors';
import { NFL_ODDS } from '../../data/odds';

// ── Constants ─────────────────────────────────────────────────────────────────

const OFF_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const DEF_POSITIONS = ['ALL', 'DL', 'LB', 'DB'];
const ALL_TEAMS = Object.keys(STADIUMS).sort();
const OFFENSE_POS_SET = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const TEAM_CELL_PAD_X = 10;
const TEAM_CELL_PAD_Y = 5;
const TEAM_LOGO_SIZE = 18;
const TEAM_CELL_GAP = 6;
const TEAM_PRIMARY_LINE_HEIGHT = 13;
const TEAM_META_LINE_HEIGHT = 11;
const HEATMAP_METRIC_PAD_X = 2;
const HEATMAP_CELL_HEIGHT = 40; // fixed row height: accommodates 2-line content + 10px vertical padding
const HEATMAP_METRIC_PRIMARY_SAMPLES = ['99-99', '999.9', '+10.5', '-10.5', 'PU'];
const HEATMAP_METRIC_SECONDARY_SAMPLES = ['O/U 70.5', 'WAS', 'JAX'];
const HEATMAP_METRIC_HEADER_SAMPLES = ['Wk 18', 'AVG'];

function getHeatmapMetricColWidth() {
  if (typeof document === 'undefined') return 44;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 44;

  let max = 0;

  context.font = '600 10px Figtree, sans-serif';
  for (const sample of HEATMAP_METRIC_HEADER_SAMPLES) {
    max = Math.max(max, context.measureText(sample).width);
  }

  context.font = '700 11px Figtree, sans-serif';
  for (const sample of HEATMAP_METRIC_PRIMARY_SAMPLES) {
    max = Math.max(max, context.measureText(sample).width);
  }

  context.font = '400 8px Figtree, sans-serif';
  for (const sample of HEATMAP_METRIC_SECONDARY_SAMPLES) {
    max = Math.max(max, context.measureText(sample).width);
  }

  return Math.max(HEATMAP_CELL_HEIGHT, Math.ceil(max + HEATMAP_METRIC_PAD_X * 2));
}

const DEF_POS_GROUPS = { DL: ['DL','DE','DT'], LB: ['LB','ILB','OLB'], DB: ['DB','CB','S','SS','FS'] };
const normDefPos = (pos) => { for (const [n, s] of Object.entries(DEF_POS_GROUPS)) if (s.includes(pos)) return n; return null; };

const HEATMAP_OFFENSE_TABLE_CACHE = new WeakMap();

function getCachedOffenseAllowedTable(weeklyStats, players, scheduleMap, scoringSettings, statMode) {
  let byPlayers = HEATMAP_OFFENSE_TABLE_CACHE.get(weeklyStats);
  if (!byPlayers) {
    byPlayers = new WeakMap();
    HEATMAP_OFFENSE_TABLE_CACHE.set(weeklyStats, byPlayers);
  }

  let bySchedule = byPlayers.get(players);
  if (!bySchedule) {
    bySchedule = new WeakMap();
    byPlayers.set(players, bySchedule);
  }

  let byScoring = bySchedule.get(scheduleMap);
  if (!byScoring) {
    byScoring = new WeakMap();
    bySchedule.set(scheduleMap, byScoring);
  }

  let byStatMode = byScoring.get(scoringSettings);
  if (!byStatMode) {
    byStatMode = new Map();
    byScoring.set(scoringSettings, byStatMode);
  }

  if (byStatMode.has(statMode)) return byStatMode.get(statMode);

  const table = {};
  const fallbackSeasonTeam = {};

  const addVal = (team, position, week, val) => {
    if (!table[team]) table[team] = {};
    if (!table[team][position]) table[team][position] = {};
    table[team][position][week] = (table[team][position][week] ?? 0) + val;
  };

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
    const player = players[playerId];
    const position = player?.position;
    if (!OFFENSE_POS_SET.has(position)) continue;

    for (const wEntry of playerWeeks) {
      let val;
      if (statMode === 'rec_yd') val = wEntry.rec_yd ?? 0;
      else if (statMode === 'rush_yd') val = wEntry.rush_yd ?? 0;
      else val = calcPoints(wEntry, scoringSettings, position);
      if (val <= 0) continue;

      let team = wEntry.team?.toUpperCase() ?? null;
      if (!team) {
        team = fallbackSeasonTeam[playerId];
        if (team === undefined) {
          const enhanced = playerWeeks.find(w => w._teamSource === 'espn' && w.team);
          team = enhanced?.team?.toUpperCase() ?? player.team?.toUpperCase() ?? null;
          fallbackSeasonTeam[playerId] = team;
        }
      }
      if (!team) continue;
      addVal(team, position, wEntry.week, val);
    }
  }

  byStatMode.set(statMode, table);
  return table;
}

const STAT_MODES = [
  { id: 'pts',        label: 'Fantasy Pts' },
  { id: 'rec_yd',     label: 'Rec Yds' },
  { id: 'rush_yd',    label: 'Rush Yds' },
  { id: 'game_score', label: 'Score' },
  { id: 'vegas_odds', label: 'Spread' },
];

// Use the most recent season available in the bundled odds data.
// Re-run scripts/extract_odds.py after each season to add new data.
const ODDS_SEASON = Object.keys(NFL_ODDS).length
  ? Math.max(...Object.keys(NFL_ODDS).map(Number))
  : null;

const DEF_STAT_MODES = [
  { id: 'pts',          label: 'Fantasy Pts', statKey: null },
  { id: 'idp_sack',     label: 'Sacks',       statKey: 'idp_sack' },
  { id: 'idp_int',      label: 'INT',         statKey: 'idp_int' },
  { id: 'idp_ff',       label: 'FF',          statKey: 'idp_ff' },
  { id: 'idp_tkl_loss', label: 'TFL',         statKey: 'idp_tkl_loss' },
  { id: 'idp_pd',       label: 'Pass Def',    statKey: 'idp_pd', aliases: ['idp_pass_def'] },
  { id: 'idp_qbhit',    label: 'QB Hit',      statKey: 'idp_qbhit', aliases: ['idp_qb_hit'] },
  { id: 'idp_def_td',   label: 'TD',          statKey: 'idp_def_td' },
];

function getModeStatValue(wEntry, mode) {
  if (!mode?.statKey) return null;
  const direct = wEntry[mode.statKey];
  if (direct != null) return direct;
  for (const alias of (mode.aliases ?? [])) {
    const aliased = wEntry[alias];
    if (aliased != null) return aliased;
  }
  return 0;
}

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
  { id: 'conf',     label: 'Conf' },
  { id: 'division', label: 'Div' },
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

function getScoreBreakdown(wEntry, scoringSettings, position = null) {
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };
  const items = [];
  for (const { statKey, scoringKey, label, showStat } of BREAKDOWN_DEFS) {
    const statVal = wEntry[statKey];
    if (!statVal || !settings[scoringKey]) continue;
    const pts = statVal * settings[scoringKey];
    if (Math.abs(pts) < 0.005) continue;
    items.push({ label, statVal: showStat ? statVal : null, pts });
  }
  // Position-specific reception bonuses
  if (position && wEntry.rec) {
    const bonusKey = position === 'TE' ? 'bonus_rec_te' : position === 'RB' ? 'bonus_rec_rb' : position === 'WR' ? 'bonus_rec_wr' : null;
    if (bonusKey && settings[bonusKey]) {
      const pts = wEntry.rec * settings[bonusKey];
      if (Math.abs(pts) >= 0.005) items.push({ label: `${position} Rec Bonus`, statVal: wEntry.rec, pts });
    }
  }
  // Per-carry bonus
  if (position === 'RB' && wEntry.rush_att && settings.bonus_rush_att) {
    const pts = wEntry.rush_att * settings.bonus_rush_att;
    if (Math.abs(pts) >= 0.005) items.push({ label: 'Carry Bonus', statVal: wEntry.rush_att, pts });
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

// Returns '#fff' or '#111' based on the WCAG relative luminance of the blended color,
// so team name text is always readable against the team-tinted row background.
function getContrastColor(hex, alpha, isDark) {
  const [bgR, bgG, bgB] = isDark ? [12, 15, 20] : [242, 241, 236];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toLinear = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const bR = Math.round(bgR + (r - bgR) * alpha);
  const bG = Math.round(bgG + (g - bgG) * alpha);
  const bB = Math.round(bgB + (b - bgB) * alpha);
  const L = 0.2126 * toLinear(bR) + 0.7152 * toLinear(bG) + 0.0722 * toLinear(bB);
  return L > 0.35 ? '#111111' : '#ffffff';
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
        color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
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
  const { weeklyStats, players, scheduleMap, scoringSettings, espnIdOverrides, loadPlayers, statsEnhancing, league } = useSleeper();
  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  const { favoriteTeam, darkMode } = useTheme();

  const [viewMode, setViewMode] = useState('offense');  // 'offense' | 'defense'
  const [pos, setPos]       = useState('ALL');           // offense position
  const [defPos, setDefPos] = useState('ALL');           // defense position
  const [statMode, setStatMode]         = useState('pts');
  const [defStatMode, setDefStatMode]   = useState('pts');
  const [heatmapScope, setHeatmapScope] = useState('overall');
  const [locationFilter, setLocationFilter] = useState('all'); // 'all' | 'home' | 'away'
  const [sortKey, setSortKey] = useState('avg');
  const [sortDir, setSortDir] = useState('desc');
  const [teamSort, setTeamSort] = useState('alpha');
  const [drilldown, setDrilldown] = useState(null); // { team, week }
  const [useTeamColors, setUseTeamColors] = useState(false);
  const [vegasOddsView, setVegasOddsView] = useState('spread'); // 'spread' | 'ou'
  const [vegasInfoOpen, setVegasInfoOpen] = useState(false);
  const [gridMaxHeight, setGridMaxHeight] = useState('60vh');
  const filterBarRef = useRef(null);
  const tableContainerRef = useRef(null);
  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  const fantasySeasonWeeks = useMemo(() => {
    const maxWeek = Number.isFinite(lastScoredLeg) && lastScoredLeg > 0
      ? Math.min(lastScoredLeg, 18)
      : 17;
    return Array.from({ length: maxWeek }, (_, i) => i + 1);
  }, [lastScoredLeg]);

  // Dynamically compute the table container's max-height based on its actual
  // top position in the viewport. This correctly handles variable filter bar
  // heights (wrapping on narrow screens) and device safe-area insets (PWA).
  useEffect(() => {
    const compute = () => {
      requestAnimationFrame(() => {
        if (!tableContainerRef.current) return;
        const top = tableContainerRef.current.getBoundingClientRect().top;
        const isDesktop = window.innerWidth >= 1024;
        const bottomPad = isDesktop
          ? 4
          : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-height-tab')) || 0)
            + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom')) || 0)
            + 8;
        const available = window.innerHeight - top - bottomPad;
        setGridMaxHeight(`${Math.max(200, available)}px`);
      });
    };

    compute();
    const ro = new ResizeObserver(compute);
    if (filterBarRef.current) ro.observe(filterBarRef.current);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, []);

  // Lock body scroll while drilldown is open
  useEffect(() => {
    if (!drilldown) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [drilldown]);

  // Lock page scroll so only the grid scrolls (applies on all viewport sizes)
  useEffect(() => {
    const prev = document.body.style.overflowY;
    document.body.style.overflowY = 'hidden';
    return () => { document.body.style.overflowY = prev; };
  }, []);

  // ── Tables ─────────────────────────────────────────────────────────────────

  // Offense-allowed table: keyed by opponent team
  const offenseAllowedTable = useMemo(() => {
    if (statsEnhancing) return null;
    if (viewMode !== 'offense') return null;
    if (!weeklyStats || !players || !scheduleMap) return null;
    return getCachedOffenseAllowedTable(weeklyStats, players, scheduleMap, scoringSettings, statMode);
  }, [statsEnhancing, viewMode, weeklyStats, players, scheduleMap, scoringSettings, statMode]);

  // Defense-scored table: keyed by the defensive player's own team
  const defenseScoredTable = useMemo(() => {
    if (statsEnhancing) return null;
    if (viewMode !== 'defense') return null;
    if (!weeklyStats || !players) return null;
    const defMode = DEF_STAT_MODES.find(m => m.id === defStatMode);
    const getValue = defMode?.statKey
      ? (wEntry) => getModeStatValue(wEntry, defMode)
      : (wEntry, pos) => calcPoints(wEntry, scoringSettings, pos);
    const table = {};
    for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
      const player = players[playerId];
      if (!player) continue;
      const normPos = normDefPos(player.position);
      if (!normPos) continue;
      for (const wEntry of playerWeeks) {
        const val = getValue(wEntry, player.position);
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
  }, [statsEnhancing, viewMode, weeklyStats, players, scoringSettings, defStatMode, scheduleMap]);

  const activeTable = viewMode === 'offense' ? offenseAllowedTable : defenseScoredTable;
  const activePositions = viewMode === 'offense' ? OFF_POSITIONS : DEF_POSITIONS;
  const activePos = viewMode === 'offense' ? pos : defPos;
  const setActivePos = viewMode === 'offense' ? setPos : setDefPos;

  // ── Rows ───────────────────────────────────────────────────────────────────

  // Returns true if a given team/week passes the current location filter.
  const weekMatchesLocation = useCallback((team, w) => {
    if (locationFilter === 'all') return true;
    const entry = scheduleMap?.[w]?.[team];
    if (!entry) return false;
    return locationFilter === 'home' ? entry.home === true : entry.home === false;
  }, [locationFilter, scheduleMap]);

  const baseRows = useMemo(() => {
    // Vegas Odds mode:
    //   spread view — cover margin = (teamScore - oppScore) + spread; positive = covered
    //   O/U view    — total margin = (teamScore + oppScore) - total;   positive = over hit
    if (viewMode === 'offense' && statMode === 'vegas_odds') {
      const seasonOdds = ODDS_SEASON ? NFL_ODDS[ODDS_SEASON] : null;
      const isOU = vegasOddsView === 'ou';
      return ALL_TEAMS.map(team => {
        const weekPts = {};
        if (scheduleMap && seasonOdds) {
          for (const w of fantasySeasonWeeks) {
            const sched = scheduleMap[w]?.[team];
            if (!sched || !weekMatchesLocation(team, w)) continue;
            const opp = sched.opp?.toUpperCase();
            if (!opp) continue;
            const oddsEntry = seasonOdds[w]?.[team];
            if (!oddsEntry) continue;
            const teamScore = scheduleMap[w]?.[opp]?.ptsAgainst ?? null;
            const oppScore  = sched.ptsAgainst ?? null;
            if (teamScore == null || oppScore == null) continue;
            weekPts[w] = isOU
              ? (teamScore + oppScore) - oddsEntry.total
              : (teamScore - oppScore) + oddsEntry.spread;
          }
        }
        const vals = Object.values(weekPts);
        const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        return { team, weekPts, avg };
      });
    }

    // Game Score mode: pull actual points-allowed directly from scheduleMap
    if (viewMode === 'offense' && statMode === 'game_score') {
      return ALL_TEAMS.map(team => {
        const weekPts = {};
        if (scheduleMap) {
          for (const w of fantasySeasonWeeks) {
            const entry = scheduleMap[w]?.[team];
            if (entry?.ptsAgainst != null && weekMatchesLocation(team, w)) weekPts[w] = entry.ptsAgainst;
          }
        }
        const total = Object.values(weekPts).reduce((s, v) => s + v, 0);
        const weeksPlayed = scheduleMap ? fantasySeasonWeeks.filter(w => scheduleMap[w]?.[team] != null && weekMatchesLocation(team, w)).length : Object.keys(weekPts).length;
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
              if (weekMatchesLocation(team, w)) weekData[w] = (weekData[w] ?? 0) + v;
            }
          }
        } else {
          for (const [w, v] of Object.entries(teamData[activePos] ?? {})) {
            if (weekMatchesLocation(team, w)) weekData[w] = v;
          }
        }
      }
      const total = Object.values(weekData).reduce((s, v) => s + v, 0);
        const weeksPlayed = scheduleMap ? fantasySeasonWeeks.filter(w => scheduleMap[w]?.[team] != null && weekMatchesLocation(team, w)).length : Object.keys(weekData).length;
      const avg = weeksPlayed > 0 && Object.keys(weekData).length > 0 ? total / weeksPlayed : null;
      return { team, weekPts: weekData, avg };
    });
  }, [activeTable, activePos, viewMode, statMode, scheduleMap, weekMatchesLocation, vegasOddsView, fantasySeasonWeeks]);

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

  // Computed from ALL_TEAMS (module constant) with empty deps so it never
  // recomputes when sort/filter state changes — keeps column width stable.
  // Always measures conf + div meta widths so the column never grows when
  // the user toggles team sort between alpha / conf / division.
  const teamColumnWidth = useMemo(() => {
    if (typeof document === 'undefined') return 132;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 132;

    context.font = '700 11px Figtree, sans-serif';
    const mainLineWidth = ALL_TEAMS.reduce((max, team) => {
      const textWidth = context.measureText(team).width;
      return Math.max(max, TEAM_LOGO_SIZE + TEAM_CELL_GAP + textWidth);
    }, 0);

    // Always measure both conf and div labels so width covers all sort states.
    context.font = '500 9px Figtree, sans-serif';
    const metaLineWidth = ALL_TEAMS.reduce((max, team) => {
      const conf = TEAM_META[team]?.conf ?? '';
      const div  = TEAM_META[team]?.div  ?? '';
      return Math.max(max, context.measureText(conf).width, context.measureText(div).width);
    }, 0);

    // Measure the sort-chips row inside the header cell.
    // Each chip: text + 4px padding each side (8px). Gaps between chips: 3px each.
    context.font = '600 9px Figtree, sans-serif';
    const chipTextTotal = TEAM_SORT_OPTIONS.reduce((sum, opt) => sum + context.measureText(opt.label).width, 0);
    const chipsRowContentWidth = chipTextTotal
      + TEAM_SORT_OPTIONS.length * 8          // 4px padding × 2 per chip
      + (TEAM_SORT_OPTIONS.length - 1) * 3;   // 3px gap between chips

    const contentWidth = Math.max(mainLineWidth, metaLineWidth, chipsRowContentWidth);
    return Math.ceil(contentWidth + TEAM_CELL_PAD_X * 2);
  }, []);

  const metricColumnWidth = useMemo(() => getHeatmapMetricColWidth(), []);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function resetSort() { setSortKey('avg'); setSortDir('desc'); setTeamSort('alpha'); }

  // ── Column averages ────────────────────────────────────────────────────────

  const colAvgs = useMemo(() => {
    const avgs = {};
    for (const w of fantasySeasonWeeks) {
      const vals = baseRows.map(r => r.weekPts[w]).filter(v => v != null);
      if (vals.length) avgs[w] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    return avgs;
  }, [baseRows, fantasySeasonWeeks]);

  // ── Heatmap ────────────────────────────────────────────────────────────────

  const heatRanges = useMemo(() => {
    const allVals = baseRows.flatMap(r => Object.values(r.weekPts));
    const overallMin = allVals.length ? Math.min(...allVals) : 0;
    const overallMax = allVals.length ? Math.max(...allVals) : 1;
    const weekMin = {}, weekMax = {};
    for (const w of fantasySeasonWeeks) {
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
  }, [baseRows, viewMode, fantasySeasonWeeks]);

  function cellBg(pts, team, week) {
    if (pts == null) return undefined;

    // Spread: binary covered/missed — no gradient, just green or red.
    // O/U falls through to the standard heatmap gradient below.
    if (viewMode === 'offense' && statMode === 'vegas_odds' && vegasOddsView === 'spread') {
      if (pts === 0) return 'rgba(130, 130, 130, 0.55)'; // push
      if (pts > 0 && useTeamColors && favoriteTeam && TEAM_COLORS[favoriteTeam]) {
        const tc = TEAM_COLORS[favoriteTeam];
        return hexToRgba(darkMode ? (tc.darkPrimary ?? tc.primary) : tc.primary, 0.82);
      }
      if (pts > 0) return 'rgba(30, 155, 55, 0.82)';   // covered
      return 'rgba(200, 35, 35, 0.82)';                 // missed
    }

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
    const t = raw;
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
    if (viewMode === 'offense' && (statMode === 'game_score' || statMode === 'vegas_odds')) return []; // box score mode
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

        if (!scheduleMap?.[week]?.[team]) continue; // team had no game this week

        // Determine this player's game-time team.
        const gameTeam = wEntry.team?.toUpperCase();
        const currentTeam = player.team?.toUpperCase();
        let playerTeam = gameTeam;
        if (!playerTeam) {
          const enhancedEntry = playerWeeks.find(w => w._teamSource === 'espn' && w.team);
          playerTeam = enhancedEntry?.team?.toUpperCase() ?? currentTeam;
        }
        if (!playerTeam) continue;

        // Only show players who were on team T's own roster this week.
        if (playerTeam !== team) continue;

        let val;
        if (statMode === 'rec_yd')       val = wEntry.rec_yd  ?? 0;
        else if (statMode === 'rush_yd') val = wEntry.rush_yd ?? 0;
        else val = calcPoints(wEntry, scoringSettings, player.position);
        if (val <= 0) continue;
        const breakdown = statMode === 'pts' ? getScoreBreakdown(wEntry, scoringSettings, player.position) : null;
        const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || playerId;
        const teamSource = wEntry._teamSource ?? 'fallback';
        results.push({ playerId, name, position: player.position, val, breakdown, teamSource });
      }
    } else {
      // Defense scored: players who scored FOR that team
      const matchNorm = activePos === 'ALL' ? null : activePos;
      const defMode = DEF_STAT_MODES.find(m => m.id === defStatMode);
      const getDefVal = defMode?.statKey
        ? (wEntry) => getModeStatValue(wEntry, defMode)
        : (wEntry, pos) => calcPoints(wEntry, scoringSettings, pos);
      for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
        const player = players[playerId];
        if (!player) continue;
        const normPos = normDefPos(player.position);
        if (!normPos) continue;
        if (matchNorm && normPos !== matchNorm) continue;
        const wEntry = playerWeeks.find(w => w.week === week);
        if (!wEntry) continue;

        // Same inferred-team logic as the Allowed side: prefer ESPN-confirmed game-time
        // team, fall back to other enhanced weeks, then player.team.
        const gameTeam = wEntry.team?.toUpperCase();
        let playerTeam = gameTeam;
        if (!playerTeam) {
          const enhancedEntry = playerWeeks.find(w => w._teamSource === 'espn' && w.team);
          playerTeam = enhancedEntry?.team?.toUpperCase() ?? player.team?.toUpperCase();
        }
        if (playerTeam !== team) continue;

        const val = getDefVal(wEntry, player.position);
        if (val <= 0) continue;
        const breakdown = defStatMode === 'pts' ? getScoreBreakdown(wEntry, scoringSettings, player.position) : null;
        const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || playerId;
        const teamSource = wEntry._teamSource ?? 'fallback';
        results.push({ playerId, name, position: player.position, val, breakdown, teamSource });
      }
    }

    return results.sort((a, b) => b.val - a.val);
  }, [drilldown, weeklyStats, players, viewMode, activePos, statMode, defStatMode, scoringSettings, scheduleMap]);

  // ── Game box score (Game Score stat mode) ─────────────────────────────────

  const gameBoxScore = useMemo(() => {
    if (!drilldown || !(viewMode === 'offense' && (statMode === 'game_score' || statMode === 'vegas_odds'))) return null;
    if (!scheduleMap || !weeklyStats || !players) return null;
    const { team, week } = drilldown;
    const sched = scheduleMap?.[week]?.[team];
    if (!sched) return null;
    const opp = sched.opp?.toUpperCase();
    if (!opp) return null;

    const homeKnown = sched.home != null;
    // Broadcast convention: AWAY on left, HOME on right
    const leftTeam  = homeKnown ? (sched.home ? opp  : team) : team;
    const rightTeam = homeKnown ? (sched.home ? team : opp)  : opp;
    // Each team's score = how many points the other side allowed (ptsAgainst)
    const leftScore  = scheduleMap?.[week]?.[rightTeam]?.ptsAgainst ?? null;
    const rightScore = scheduleMap?.[week]?.[leftTeam]?.ptsAgainst  ?? null;

    const buildTeamData = (teamCode) => {
      const totals = { passYds: 0, rushYds: 0, tds: 0, int: 0, fum: 0, sacks: 0 };
      const performers = [];
      for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
        const player = players[playerId];
        if (!player || !['QB','RB','WR','TE','K'].includes(player.position)) continue;
        const wEntry = playerWeeks.find(e => e.week === week);
        if (!wEntry) continue;
        if (!scheduleMap?.[week]?.[teamCode]) continue;
        const gameTeam = wEntry.team?.toUpperCase();
        let playerTeam = gameTeam;
        if (!playerTeam) {
          const enhanced = playerWeeks.find(e => e._teamSource === 'espn' && e.team);
          playerTeam = enhanced?.team?.toUpperCase() ?? player.team?.toUpperCase();
        }
        if (!playerTeam || playerTeam !== teamCode) continue;
        const tds = (wEntry.pass_td ?? 0) + (wEntry.rush_td ?? 0) + (wEntry.rec_td ?? 0) + (wEntry.ret_td ?? 0) + (wEntry.st_td ?? 0);
        totals.passYds += wEntry.pass_yd ?? 0;
        totals.rushYds += wEntry.rush_yd ?? 0;
        totals.tds += tds;
        totals.int += wEntry.pass_int ?? 0;
        totals.fum += wEntry.fum_lost ?? 0;
        totals.sacks += wEntry.pass_sack ?? 0;
        const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
        const espnId = player.espn_id ?? espnIdOverrides?.[playerId];
        const passYds = wEntry.pass_yd ?? 0;
        const rushYds = wEntry.rush_yd ?? 0;
        const recYds  = wEntry.rec_yd  ?? 0;
        performers.push({
          name, position: player.position, playerId, espnId,
          passYds, rushYds, recYds, tds,
          passCmp: wEntry.pass_cmp ?? 0,
          passAtt: (wEntry.pass_cmp ?? 0) + (wEntry.pass_inc ?? 0),
          passInt: wEntry.pass_int ?? 0,
          rec:     wEntry.rec     ?? 0,
          // Sort key: dominant yardage for the position
          sortYds: passYds || (rushYds + recYds),
        });
      }
      performers.sort((a, b) => b.sortYds - a.sortYds);
      return { totals, performers: performers.slice(0, 4) };
    };

    return {
      leftTeam, rightTeam, leftScore, rightScore,
      separator: homeKnown ? '@' : 'vs',
      left: buildTeamData(leftTeam),
      right: buildTeamData(rightTeam),
    };
  }, [drilldown, viewMode, statMode, scheduleMap, weeklyStats, players, scoringSettings, espnIdOverrides]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const loaded = viewMode === 'offense' ? !!offenseAllowedTable : !!defenseScoredTable;
  const showAvg = !(viewMode === 'offense' && statMode === 'vegas_odds');

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      {/* Filter bar — scrollable strip + pinned info icon in the same row */}
      <div ref={filterBarRef} className="px-4 sm:px-6 lg:px-8 pb-3 flex items-center gap-2">
        {/* Horizontally scrollable filter strip — never wraps to a second line */}
        <div className="flex-1 min-w-0 flex items-center gap-x-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
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

          {!['rec_yd', 'rush_yd', 'game_score', 'vegas_odds'].includes(statMode) && (
            <FilterGroup label="Phase">
              {[{ id: 'offense', label: 'Offense' }, { id: 'defense', label: 'Defense' }].map(m => (
                <Btn key={m.id} active={viewMode === m.id} onClick={() => { setViewMode(m.id); resetSort(); }}>
                  {m.label}
                </Btn>
              ))}
            </FilterGroup>
          )}

          {!(viewMode === 'offense' && (statMode === 'game_score' || statMode === 'vegas_odds')) && (
            <FilterGroup label="Position">
              {activePositions.map(p => (
                <Btn key={p} active={activePos === p} onClick={() => { setActivePos(p); resetSort(); }}>
                  {p}
                </Btn>
              ))}
            </FilterGroup>
          )}

          {!(viewMode === 'offense' && statMode === 'vegas_odds') && (
            <FilterGroup label="Color">
              {HEATMAP_SCOPES.map(s => (
                <Btn key={s.id} active={heatmapScope === s.id} onClick={() => setHeatmapScope(s.id)}>
                  {s.label}
                </Btn>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Location">
            {[{ id: 'all', label: 'All' }, { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }].map(opt => (
              <Btn key={opt.id} active={locationFilter === opt.id} onClick={() => setLocationFilter(opt.id)}>
                {opt.label}
              </Btn>
            ))}
          </FilterGroup>

          {viewMode === 'offense' && statMode === 'vegas_odds' && (
            <FilterGroup label="Result">
              <Btn active={vegasOddsView === 'spread'} onClick={() => setVegasOddsView('spread')}>Spread</Btn>
              <Btn active={vegasOddsView === 'ou'} onClick={() => setVegasOddsView('ou')}>O/U</Btn>
            </FilterGroup>
          )}

          {favoriteTeam && (
            <Btn active={useTeamColors} onClick={() => setUseTeamColors(v => !v)}>
              {favoriteTeam.toUpperCase()} Colors
            </Btn>
          )}
        </div>

        {/* Info icon — outside the overflow container so tooltip is never clipped */}
        {viewMode === 'offense' && statMode === 'vegas_odds' && (
          <div className="relative shrink-0">
            <button
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)' }}
              onMouseEnter={() => setVegasInfoOpen(true)}
              onMouseLeave={() => setVegasInfoOpen(false)}
              onClick={() => setVegasInfoOpen(v => !v)}
              aria-label="Odds data info"
            >
              i
            </button>
            {vegasInfoOpen && (
              <div
                className="absolute bottom-full right-0 mb-2 z-20 rounded-lg p-2.5 text-xs leading-relaxed"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-separator)',
                  color: 'var(--color-label-secondary)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                  width: '280px',
                }}
              >
                {vegasOddsView === 'ou'
                  ? `Odds via nflverse · ${ODDS_SEASON} season · margin shown is actual total − O/U line (+ = over, − = under)`
                  : `Odds via nflverse · ${ODDS_SEASON} season · spread shown is from each team's perspective (− = favored)`}
              </div>
            )}
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-16 px-4">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            {statsEnhancing ? 'Preparing heatmap…' : 'Load season stats to see defensive rankings.'}
          </span>
        </div>
      ) : (
        <div ref={tableContainerRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: gridMaxHeight, WebkitOverflowScrolling: 'touch' }}>
          <table style={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            tableLayout: 'fixed',
            width: '100%',
            minWidth: `${teamColumnWidth + (fantasySeasonWeeks.length + 1) * metricColumnWidth}px`,
            fontSize: '11px',
          }}>
            <colgroup>
              <col style={{ width: `${teamColumnWidth}px` }} />
            </colgroup>
            <thead>
              <tr>
                <th style={stickyHeadStyleFor(teamColumnWidth)}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Team</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
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
                {fantasySeasonWeeks.map(w => (
                  <th key={w} style={{ ...headStyle(), cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort(w)}>
                    <div>Wk {w}{sortIndicator(w)}</div>
                    {colAvgs[w] != null && (
                      <div style={{ color: 'var(--color-label-secondary)', fontWeight: 400, fontSize: '10px' }}>
                        {colAvgs[w].toFixed(1)}
                      </div>
                    )}
                  </th>
                ))}
                {/* AVG column — always rendered; placeholder when hidden to keep column count stable */}
                {showAvg ? (
                  <th style={{ ...headStyle(), cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('avg')}>
                    <div>AVG{sortIndicator('avg')}</div>
                  </th>
                ) : (
                  <th style={headStyle()} />
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ team, weekPts, avg }, idx) => {
                const rowBg = idx % 2 === 0 ? 'var(--color-bg)' : 'var(--color-fill)';
                const tc = TEAM_COLORS[TEAM_COLOR_KEY[team] ?? team.toLowerCase()];
                const teamHex = tc ? (darkMode ? (tc.darkPrimary ?? tc.primary) : tc.primary) : null;
                const colorAlpha = darkMode ? 0.55 : 0.90;
                const teamMeta = sortKey === 'team'
                  ? (teamSort === 'conf'
                    ? (TEAM_META[team]?.conf ?? '')
                    : (teamSort === 'division' ? (TEAM_META[team]?.div ?? '') : ''))
                  : '';
                // Use a fully opaque blended color for the sticky column so scrolled
                // content doesn't bleed through the semi-transparent team color.
                const teamBg = teamHex ? blendColor(teamHex, colorAlpha, darkMode) : rowBg;
                const teamTextColor = teamHex ? getContrastColor(teamHex, colorAlpha, darkMode) : 'var(--color-label)';
                return (
                  <tr key={team}>
                    <td style={{ ...stickyBodyStyleFor(teamColumnWidth), background: teamBg, color: teamTextColor }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `${TEAM_LOGO_SIZE}px minmax(0, 1fr)`, columnGap: TEAM_CELL_GAP, alignItems: 'center' }}>
                        <img
                          src={espnLogoUrl(team)}
                          alt={team}
                          width={TEAM_LOGO_SIZE}
                          height={TEAM_LOGO_SIZE}
                          style={{ objectFit: 'contain', flexShrink: 0, alignSelf: 'center' }}
                        />
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            minHeight: `${HEATMAP_CELL_HEIGHT - TEAM_CELL_PAD_Y * 2}px`,
                            minWidth: 0,
                          }}
                        >
                          <span style={{ lineHeight: `${TEAM_PRIMARY_LINE_HEIGHT}px` }}>{team}</span>
                          {teamMeta && (
                            <span
                              style={{
                                fontSize: '9px',
                                lineHeight: `${TEAM_META_LINE_HEIGHT}px`,
                                height: `${TEAM_META_LINE_HEIGHT}px`,
                                fontWeight: 500,
                                color: teamTextColor === '#ffffff' ? 'rgba(255,255,255,0.72)' : 'var(--color-label-secondary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {teamMeta}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {fantasySeasonWeeks.map(w => {
                      const pts = weekPts[w];
                      const played = scheduleMap?.[w]?.[team] != null;
                      const matchesLoc = weekMatchesLocation(team, w);
                      // A bye is a week that has game data for other teams but not this one
                      const weekHasGames = !!scheduleMap && Object.keys(scheduleMap[w] ?? {}).length > 0;
                      const isBye = weekHasGames && !played;
                      // Filtered-out: team played this week but it doesn't match location filter
                      const isFiltered = played && !matchesLoc;
                      const isVegasOdds = viewMode === 'offense' && statMode === 'vegas_odds';
                      const clickable = pts != null && !isFiltered;
                      return (
                        <td
                          key={w}
                          onClick={clickable ? () => setDrilldown({ team, week: w }) : undefined}
                          style={{
                            ...cellStyle(false),
                            background: pts != null && !isFiltered ? cellBg(pts, team, w) : rowBg,
                            color: pts != null && !isFiltered ? '#000' : 'var(--color-label-secondary)',
                            cursor: clickable ? 'pointer' : 'default',
                          }}
                        >
                          {pts != null && !isFiltered ? (
                            <>
                              {statMode === 'game_score' ? (() => {
                                  const opp = scheduleMap?.[w]?.[team]?.opp?.toUpperCase();
                                  const ownScore = opp ? (scheduleMap?.[w]?.[opp]?.ptsAgainst ?? null) : null;
                                  const oppScore = Math.round(pts);
                                  return ownScore != null ? (
                                    <>
                                      <div>{Math.round(ownScore)}-{oppScore}</div>
                                      <div style={{ fontSize: '8px', opacity: 0.6, marginTop: '1px' }}>{team}·{scheduleMap[w][team].opp}</div>
                                    </>
                                  ) : (
                                    <div>{Number.isInteger(pts) ? pts : pts.toFixed(1)}</div>
                                  );
                                })() : (
                                <>
                                  <div>{isVegasOdds ? (() => {
                                      if (vegasOddsView === 'ou') {
                                        // Show the signed margin from the O/U line (pts = totalScored - ouLine)
                                        const n = Math.abs(pts) % 1 === 0 ? String(Math.round(Math.abs(pts))) : Math.abs(pts).toFixed(1);
                                        return pts > 0 ? `+${n}` : pts < 0 ? `-${n}` : 'PU';
                                      }
                                      const s = NFL_ODDS[ODDS_SEASON]?.[w]?.[team]?.spread;
                                      if (s == null) return '—';
                                      const n = s % 1 === 0 ? String(Math.round(s)) : s.toFixed(1);
                                      return s > 0 ? `+${n}` : n;
                                    })()
                                    : (viewMode === 'defense' && DEF_STAT_MODES.find(m => m.id === defStatMode)?.statKey)
                                      ? (Number.isInteger(pts) ? pts : pts.toFixed(1))
                                      : pts.toFixed(1)}</div>
                                  {isVegasOdds && vegasOddsView === 'ou' ? (
                                    (() => {
                                      const t = NFL_ODDS[ODDS_SEASON]?.[w]?.[team]?.total;
                                      return t != null ? (
                                        <div style={{ fontSize: '8px', opacity: 0.6, marginTop: '1px' }}>O/U {t}</div>
                                      ) : null;
                                    })()
                                  ) : scheduleMap?.[w]?.[team]?.opp && (
                                    <div style={{ fontSize: '8px', opacity: 0.6, marginTop: '1px' }}>
                                      {scheduleMap[w][team].opp}
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          ) : isBye ? (
                            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.55 }}>BYE</span>
                          ) : isFiltered ? (
                            <span style={{ fontSize: '8px', opacity: 0.35 }}>—</span>
                          ) : played ? '—' : ''}
                        </td>
                      );
                    })}
                    {/* AVG column — always rendered; empty placeholder when hidden */}
                    {showAvg ? (
                      <td style={{ ...cellStyle(true), background: avg != null ? cellBg(avg, team, null) : rowBg, color: avg != null ? '#000' : 'var(--color-label)' }}>
                        {avg != null ? avg.toFixed(1) : '—'}
                      </td>
                    ) : (
                      <td style={{ ...cellStyle(false), background: rowBg }} />
                    )}
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
              const homeKnown = sched?.home != null;
              const homeTeam = homeKnown ? (sched.home ? drilldown.team : opp) : null;
              const awayTeam = homeKnown ? (sched.home ? opp : drilldown.team) : null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginBottom: 6 }}>
                    Week {drilldown.week}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {(awayTeam ?? drilldown.team) && <img src={espnLogoUrl(awayTeam ?? drilldown.team)} width={28} height={28} style={{ objectFit: 'contain' }} alt={awayTeam ?? drilldown.team} />}
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                      {awayTeam ?? drilldown.team}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)' }}>{homeKnown ? '@' : 'vs'}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                      {homeTeam ?? opp ?? '—'}
                    </span>
                    {(homeTeam ?? opp) && <img src={espnLogoUrl(homeTeam ?? opp)} width={28} height={28} style={{ objectFit: 'contain' }} alt={homeTeam ?? opp} />}
                  </div>
                  {/* Vegas odds line — shown directly under the team row */}
                  {statMode === 'vegas_odds' && ODDS_SEASON && awayTeam && homeTeam && (() => {
                    const fmtSpread = (s) => {
                      if (s == null) return null;
                      const n = s % 1 === 0 ? String(Math.round(s)) : s.toFixed(1);
                      return s > 0 ? `+${n}` : n;
                    };
                    const awayEntry = NFL_ODDS[ODDS_SEASON]?.[drilldown.week]?.[awayTeam];
                    const homeEntry = NFL_ODDS[ODDS_SEASON]?.[drilldown.week]?.[homeTeam];
                    if (!awayEntry && !homeEntry) return null;
                    // scores: each team's points = the opponent's ptsAgainst
                    const awayScore = scheduleMap?.[drilldown.week]?.[homeTeam]?.ptsAgainst ?? null;
                    const homeScore = scheduleMap?.[drilldown.week]?.[awayTeam]?.ptsAgainst ?? null;
                    const coverResult = (spread, teamScore, oppScore) => {
                      if (spread == null || teamScore == null || oppScore == null) return null;
                      const margin = (teamScore - oppScore) + spread;
                      if (margin > 0) return { text: 'Covered',       color: 'rgb(30,155,55)' };
                      if (margin < 0) return { text: "Didn't cover",  color: 'rgb(200,35,35)' };
                      return               { text: 'Push',            color: 'var(--color-label-secondary)' };
                    };
                    const awayResult = coverResult(awayEntry?.spread, awayScore, homeScore);
                    const homeResult = coverResult(homeEntry?.spread, homeScore, awayScore);
                    const total    = awayEntry?.total ?? homeEntry?.total;
                    const totalPts = awayScore != null && homeScore != null ? awayScore + homeScore : null;
                    const ouResult = total != null && totalPts != null
                      ? (totalPts > total ? 'Over' : totalPts < total ? 'Under' : 'Push')
                      : null;
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 5, fontSize: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-label)' }}>
                            {awayTeam} {fmtSpread(awayEntry?.spread) ?? '—'}
                          </span>
                          <span style={{ color: 'var(--color-label-tertiary)' }}>·</span>
                          <span style={{ color: 'var(--color-label-secondary)' }}>O/U {total ?? '—'}</span>
                          <span style={{ color: 'var(--color-label-tertiary)' }}>·</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-label)' }}>
                            {fmtSpread(homeEntry?.spread) ?? '—'} {homeTeam}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 3, flexWrap: 'wrap' }}>
                          {awayResult && <span style={{ fontWeight: 600, color: awayResult.color }}>{awayResult.text}</span>}
                          {ouResult && (
                            <>
                              <span style={{ color: 'var(--color-label-tertiary)' }}>·</span>
                              <span style={{ color: 'var(--color-label-secondary)' }}>
                                {ouResult}{totalPts != null ? ` (${totalPts} pts)` : ''}
                              </span>
                            </>
                          )}
                          {homeResult && (
                            <>
                              <span style={{ color: 'var(--color-label-tertiary)' }}>·</span>
                              <span style={{ fontWeight: 600, color: homeResult.color }}>{homeResult.text}</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 6 }}>
                    {viewMode === 'offense' && (statMode === 'game_score' || statMode === 'vegas_odds')
                      ? 'Score'
                      : <>
                          {viewMode === 'offense' ? (activePos === 'ALL' ? 'All positions' : activePos) : (activePos === 'ALL' ? 'All defense' : activePos)}
                          {' · '}
                          {viewMode === 'offense'
                            ? STAT_MODES.find(m => m.id === statMode)?.label
                            : DEF_STAT_MODES.find(m => m.id === defStatMode)?.label}
                          {' · '}{drilldownPlayers.length} player{drilldownPlayers.length !== 1 ? 's' : ''}
                        </>
                    }
                  </div>
                </div>
              );
            })()}

            {viewMode === 'offense' && (statMode === 'game_score' || statMode === 'vegas_odds') ? (
              /* ── Box Score ── */
              gameBoxScore ? (
                <>
                  {/* Score */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                        {gameBoxScore.leftScore ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', marginTop: 4 }}>{gameBoxScore.leftTeam}</div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
                      {gameBoxScore.separator}
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                        {gameBoxScore.rightScore ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', marginTop: 4 }}>{gameBoxScore.rightTeam}</div>
                    </div>
                  </div>

                  {/* Team stat comparison */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                    gap: '3px 8px', marginBottom: 16, fontSize: 12,
                    padding: '10px 12px', borderRadius: 10, background: 'var(--color-fill)',
                  }}>
                    {[
                      { label: 'Pass Yds',  l: gameBoxScore.left.totals.passYds, r: gameBoxScore.right.totals.passYds },
                      { label: 'Rush Yds',  l: gameBoxScore.left.totals.rushYds, r: gameBoxScore.right.totals.rushYds },
                      { label: 'TDs',       l: gameBoxScore.left.totals.tds,     r: gameBoxScore.right.totals.tds     },
                      { label: 'INT',       l: gameBoxScore.left.totals.int,     r: gameBoxScore.right.totals.int     },
                      { label: 'Fum Lost',  l: gameBoxScore.left.totals.fum,     r: gameBoxScore.right.totals.fum     },
                      { label: 'Sacked',    l: gameBoxScore.left.totals.sacks,   r: gameBoxScore.right.totals.sacks   },
                    ].map(({ label, l, r }) => (
                      <Fragment key={label}>
                        <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-label)' }}>{l}</div>
                        <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)' }}>{label}</div>
                        <div style={{ textAlign: 'left', fontWeight: 700, color: 'var(--color-label)' }}>{r}</div>
                      </Fragment>
                    ))}
                  </div>

                  {/* Top performers per team */}
                  {[
                    { teamCode: gameBoxScore.leftTeam, data: gameBoxScore.left },
                    { teamCode: gameBoxScore.rightTeam, data: gameBoxScore.right },
                  ].map(({ teamCode, data }) => (
                    <div key={teamCode} style={{ marginBottom: 12, textAlign: 'left' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-label-tertiary)', marginBottom: 6 }}>
                        {teamCode} Leaders
                      </div>
                      {data.performers.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', padding: '4px 0' }}>No data</div>
                      ) : data.performers.map(({ name, position, passYds, rushYds, recYds, tds, passCmp, passAtt, passInt, rec, playerId, espnId }, i) => {
                        const canNav = !!(onViewPlayer && espnId);
                        const teamId = players?.[playerId]?.team?.toUpperCase();
                        let statLine = '';
                        if (position === 'QB') {
                          const parts = [];
                          if (passAtt > 0) parts.push(`${passCmp}/${passAtt}, ${passYds} yds`);
                          if (tds > 0) parts.push(`${tds} TD`);
                          if (passInt > 0) parts.push(`${passInt} INT`);
                          if (rushYds > 0) parts.push(`${rushYds} rush yds`);
                          statLine = parts.join(', ');
                        } else if (position === 'RB') {
                          const parts = [];
                          if (rushYds > 0) parts.push(`${rushYds} rush yds`);
                          if (rec > 0) parts.push(`${rec} rec, ${recYds} yds`);
                          if (tds > 0) parts.push(`${tds} TD`);
                          statLine = parts.join(' · ');
                        } else {
                          const parts = [];
                          if (rec > 0) parts.push(`${rec} rec, ${recYds} yds`);
                          if (rushYds > 0) parts.push(`${rushYds} rush yds`);
                          if (tds > 0) parts.push(`${tds} TD`);
                          statLine = parts.join(' · ');
                        }
                        return (
                          <div key={i} style={{
                            padding: '5px 0',
                            borderBottom: i < data.performers.length - 1 ? '1px solid var(--color-separator)' : 'none',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <button
                                onClick={canNav ? () => { setDrilldown(null); const yearsExp = players?.[playerId]?.years_exp; onViewPlayer(String(espnId), { displayName: name, teamId, position, experience: yearsExp != null ? yearsExp + 1 : undefined }); } : undefined}
                                style={{ fontSize: 12, fontWeight: 700, color: canNav ? 'var(--color-accent)' : 'var(--color-label)', background: 'none', border: 'none', padding: 0, cursor: canNav ? 'pointer' : 'default', textAlign: 'left' }}
                              >
                                {name}
                              </button>
                              <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)' }}>{position}</span>
                            </div>
                            {statLine && (
                              <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 1 }}>{statLine}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--color-label-tertiary)', padding: '16px 0' }}>
                  No score data available.
                </div>
              )
            ) : drilldownPlayers.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-label-tertiary)', padding: '16px 0' }}>
                No data found for this matchup.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {drilldownPlayers.map(({ name, position, val, breakdown, playerId, teamSource }, i) => {
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
                        {(() => {
                          const espnId = players?.[playerId]?.espn_id ?? espnIdOverrides?.[playerId];
                          const canNav = !!(onViewPlayer && espnId);
                          const teamId = players?.[playerId]?.team?.toUpperCase();
                          return (
                            <button
                              onClick={canNav ? () => { setDrilldown(null); const yearsExp = players?.[playerId]?.years_exp; onViewPlayer(String(espnId), { displayName: name, teamId, position, experience: yearsExp != null ? yearsExp + 1 : undefined }); } : undefined}
                              style={{
                                fontSize: 13, fontWeight: 700, color: canNav ? 'var(--color-accent)' : 'var(--color-label)',
                                background: 'none', border: 'none', padding: 0, cursor: canNav ? 'pointer' : 'default',
                                textAlign: 'left',
                              }}
                            >
                              {name}
                            </button>
                          );
                        })()}
                        <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)' }}>{position}</span>
                        {teamSource === 'fallback' && (
                          <span
                            title="Team attribution estimated — this player may have been traded or signed after the season. Stats may be misattributed."
                            style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                              background: 'var(--color-fill-secondary)',
                              color: 'var(--color-label-tertiary)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            est.
                          </span>
                        )}
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
  // box-shadow renders in the element's own stacking context, so it always
  // appears above scrolled content — unlike borders which can bleed through.
  boxShadow: '1px 0 0 0 var(--color-separator-opaque), 0 1px 0 0 var(--color-separator-opaque)',
  whiteSpace: 'nowrap',
};

function stickyHeadStyleFor(teamColumnWidth) {
  return {
    ...stickyHeadStyle,
    width: `${teamColumnWidth}px`,
    minWidth: `${teamColumnWidth}px`,
    maxWidth: `${teamColumnWidth}px`,
  };
}

// Regular header cells: sticky top only
// With table-layout: fixed, column widths are distributed by the table —
// no explicit width/minWidth/maxWidth needed on individual cells.
function headStyle() {
  return {
    position: 'sticky', top: 0, zIndex: 3,
    padding: `6px ${HEATMAP_METRIC_PAD_X}px`,
    textAlign: 'center',
    color: 'var(--color-label-secondary)',
    fontWeight: 600,
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    background: 'var(--color-bg)',
    boxShadow: '0 1px 0 0 var(--color-separator-opaque)',
    borderLeft: '1px solid var(--color-separator)',
    whiteSpace: 'nowrap',
  };
}

// Body first-column cells: sticky left, fully opaque background set inline.
// Uses opaque separators so scrolled heatmap cells don't bleed through the border gap.
const stickyBodyStyle = {
  position: 'sticky', left: 0, zIndex: 2,
  padding: '5px 10px',
  height: `${HEATMAP_CELL_HEIGHT}px`,
  verticalAlign: 'middle',
  fontWeight: 700,
  fontSize: '11px',
  color: 'var(--color-label)',
  boxShadow: '1px 0 0 0 var(--color-separator-opaque), 0 1px 0 0 var(--color-separator-opaque)',
  whiteSpace: 'nowrap',
};

function stickyBodyStyleFor(teamColumnWidth) {
  return {
    ...stickyBodyStyle,
    padding: `${TEAM_CELL_PAD_Y}px ${TEAM_CELL_PAD_X}px`,
    width: `${teamColumnWidth}px`,
    minWidth: `${teamColumnWidth}px`,
    maxWidth: `${teamColumnWidth}px`,
  };
}

function cellStyle(isAvg) {
  return {
    padding: `5px ${HEATMAP_METRIC_PAD_X}px`,
    textAlign: 'center',
    verticalAlign: 'middle',
    fontWeight: isAvg ? 700 : 400,
    borderLeft: '1px solid var(--color-separator)',
    borderBottom: '1px solid var(--color-separator)',
    whiteSpace: 'nowrap',
    color: 'var(--color-label)',
    height: `${HEATMAP_CELL_HEIGHT}px`,
  };
}
