import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsEnhancing } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, DEFAULT_SCORING } from '../../utils/scoringEngine';
import { STADIUMS } from '../../data/stadiums';
import { TEAM_COLORS } from '../../data/teamColors';
import { NFL_ODDS } from '../../data/odds';
import useMediaQuery from '../../hooks/useMediaQuery';
import { getLeaguePositionFilters, getPositionFilterLabel } from '../../utils/leaguePositions';
import CompanionPlayerPreviewSheet from './CompanionPlayerPreviewSheet';
import { CompanionSelectorButton } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';
import Modal from '../Modal.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const OFF_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const DEF_POSITIONS = ['ALL', 'DEF', 'DL', 'LB', 'DB'];
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
const MOBILE_SHEET_QUERY = '(max-width: 1023px)';

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
const normDefPos = (pos) => {
  if (pos === 'DEF') return 'DEF';
  for (const [n, s] of Object.entries(DEF_POS_GROUPS)) if (s.includes(pos)) return n;
  return null;
};

function filterHeatmapPositions(positionOrder, leaguePositions) {
  const availableSet = new Set(leaguePositions);
  const concretePositions = positionOrder.filter(position => position !== 'ALL' && availableSet.has(position));
  if (concretePositions.length <= 1) return concretePositions;
  return ['ALL', ...concretePositions];
}

const HEATMAP_OFFENSE_TABLE_CACHE = new WeakMap();
const HEATMAP_DEFENSE_TABLE_CACHE = new WeakMap();
const SHARED_GAME_STAT_MODES = new Set(['game_score', 'vegas_odds']);
const POSITIONLESS_GAME_STAT_MODES = new Set(['game_score', 'vegas_odds']);
const FILTER_GROUP_WIDTHS = {
  phase: 188,
  position: 320,
  stat: 530,
  location: 216,
  color: 252,
  result: 158,
};
const PHASE_POSITION_LABEL_WIDTH = 62;
const MOBILE_FILTER_LABEL_WIDTH = PHASE_POSITION_LABEL_WIDTH;

function getCachedOffenseAllowedTable(weeklyStats, players, scheduleMap, activeScoringSettings, statMode) {
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

  let byStatMode = byScoring.get(activeScoringSettings);
  if (!byStatMode) {
    byStatMode = new Map();
    byScoring.set(activeScoringSettings, byStatMode);
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
      else val = calcPoints(wEntry, activeScoringSettings, position);
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
  { id: 'rec_yd',     label: 'Rec Yds', scoringKeys: ['rec_yd'] },
  { id: 'rush_yd',    label: 'Rush Yds', scoringKeys: ['rush_yd'] },
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
  { id: 'sack',         label: 'DST Sacks',   statKey: 'sack', positions: ['DEF'], scoringKeys: ['sack'] },
  { id: 'int',          label: 'DST INT',     statKey: 'int', positions: ['DEF'], scoringKeys: ['int'] },
  { id: 'def_td',       label: 'DST TD',      statKey: 'def_td', positions: ['DEF'], scoringKeys: ['def_td'] },
  { id: 'safe',         label: 'DST Safety',  statKey: 'safe', positions: ['DEF'], scoringKeys: ['safe'] },
  { id: 'tkl_loss',     label: 'DST TFL',     statKey: 'tkl_loss', positions: ['DEF'], scoringKeys: ['tkl_loss'] },
  { id: 'qb_hit',       label: 'DST QB Hit',  statKey: 'qb_hit', positions: ['DEF'], scoringKeys: ['qb_hit'] },
  { id: 'idp_sack',     label: 'Sacks',       statKey: 'idp_sack', positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_sack'] },
  { id: 'idp_int',      label: 'INT',         statKey: 'idp_int', positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_int'] },
  { id: 'idp_ff',       label: 'FF',          statKey: 'idp_ff', positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_ff'] },
  { id: 'idp_tkl_loss', label: 'TFL',         statKey: 'idp_tkl_loss', positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_tkl_loss'] },
  { id: 'idp_pd',       label: 'Pass Def',    statKey: 'idp_pd', aliases: ['idp_pass_def'], positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_pd'] },
  { id: 'idp_qbhit',    label: 'QB Hit',      statKey: 'idp_qbhit', aliases: ['idp_qb_hit'], positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_qbhit'] },
  { id: 'idp_def_td',   label: 'TD',          statKey: 'idp_def_td', positions: ['DL', 'LB', 'DB'], scoringKeys: ['idp_def_td'] },
];

const DEF_STAT_FILTERS = [
  DEF_STAT_MODES[0],
  STAT_MODES.find(mode => mode.id === 'game_score'),
  STAT_MODES.find(mode => mode.id === 'vegas_odds'),
  ...DEF_STAT_MODES.slice(1),
].filter(Boolean);

function modeHasScoringValue(mode, scoringSettings) {
  if (!mode?.scoringKeys) return true;
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };
  return mode.scoringKeys.some(key => Number(settings[key] ?? 0) !== 0);
}

function modeMatchesPositions(mode, positions) {
  if (!mode?.positions) return true;
  const positionSet = new Set(positions);
  return mode.positions.some(position => positionSet.has(position));
}

function getAvailableOffenseStatModes(scoringSettings) {
  return STAT_MODES.filter(mode => modeHasScoringValue(mode, scoringSettings));
}

function getAvailableDefenseStatModes(scoringSettings, defensePositions) {
  return DEF_STAT_FILTERS.filter(mode => (
    modeHasScoringValue(mode, scoringSettings)
    && modeMatchesPositions(mode, defensePositions)
  ));
}

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

function getCachedDefenseScoredTable(weeklyStats, players, scheduleMap, activeScoringSettings, defStatMode) {
  let byPlayers = HEATMAP_DEFENSE_TABLE_CACHE.get(weeklyStats);
  if (!byPlayers) {
    byPlayers = new WeakMap();
    HEATMAP_DEFENSE_TABLE_CACHE.set(weeklyStats, byPlayers);
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

  let byMode = byScoring.get(activeScoringSettings);
  if (!byMode) {
    byMode = new Map();
    byScoring.set(activeScoringSettings, byMode);
  }

  if (byMode.has(defStatMode)) return byMode.get(defStatMode);

  const defMode = DEF_STAT_MODES.find(m => m.id === defStatMode);
  const getValue = defMode?.statKey
    ? (wEntry) => getModeStatValue(wEntry, defMode)
    : (wEntry, pos) => calcPoints(wEntry, activeScoringSettings, pos);
  const table = {};
  for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
    const player = players[playerId];
    if (!player) continue;
    const normalizedPosition = normDefPos(player.position);
    if (!normalizedPosition) continue;
    if (defMode?.positions && !defMode.positions.includes(normalizedPosition)) continue;
    for (const wEntry of playerWeeks) {
      const val = getValue(wEntry, player.position);
      if (val <= 0) continue;
      const team = (wEntry.team || player.team)?.toUpperCase();
      if (!team) continue;
      if (scheduleMap && !scheduleMap[wEntry.week]?.[team]) continue;
      if (!table[team]) table[team] = {};
      if (!table[team][normalizedPosition]) table[team][normalizedPosition] = {};
      table[team][normalizedPosition][wEntry.week] = (table[team][normalizedPosition][wEntry.week] ?? 0) + val;
    }
  }

  byMode.set(defStatMode, table);
  return table;
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
  // D/ST
  { statKey: 'def_td',            scoringKey: 'def_td',            label: 'D/ST TD',          showStat: true  },
  { statKey: 'def_2pt',           scoringKey: 'def_2pt',           label: 'D/ST 2PT',         showStat: true  },
  { statKey: 'def_3_and_out',     scoringKey: 'def_3_and_out',     label: '3-and-Out',        showStat: true  },
  { statKey: 'def_4_and_stop',    scoringKey: 'def_4_and_stop',    label: '4th Down Stop',    showStat: true  },
  { statKey: 'def_forced_punts',  scoringKey: 'def_forced_punts',  label: 'Forced Punt',      showStat: true  },
  { statKey: 'def_pass_def',      scoringKey: 'def_pass_def',      label: 'D/ST Pass Def',    showStat: true  },
  { statKey: 'def_st_tkl_solo',   scoringKey: 'def_st_tkl_solo',   label: 'D/ST ST Tackle',   showStat: true  },
  { statKey: 'def_kr_yd',         scoringKey: 'def_kr_yd',         label: 'D/ST KR Yds',      showStat: true  },
  { statKey: 'def_pr_yd',         scoringKey: 'def_pr_yd',         label: 'D/ST PR Yds',      showStat: true  },
  { statKey: 'sack',              scoringKey: 'sack',              label: 'D/ST Sack',        showStat: true  },
  { statKey: 'sack_yd',           scoringKey: 'sack_yd',           label: 'D/ST Sack Yds',    showStat: true  },
  { statKey: 'int',               scoringKey: 'int',               label: 'D/ST INT',         showStat: true  },
  { statKey: 'int_ret_yd',        scoringKey: 'int_ret_yd',        label: 'INT Return Yds',   showStat: true  },
  { statKey: 'safe',              scoringKey: 'safe',              label: 'D/ST Safety',      showStat: true  },
  { statKey: 'tkl',               scoringKey: 'tkl',               label: 'D/ST Tackles',     showStat: true  },
  { statKey: 'tkl_solo',          scoringKey: 'tkl_solo',          label: 'D/ST Solo Tkl',    showStat: true  },
  { statKey: 'tkl_ast',           scoringKey: 'tkl_ast',           label: 'D/ST Ast Tkl',     showStat: true  },
  { statKey: 'tkl_loss',          scoringKey: 'tkl_loss',          label: 'D/ST TFL',         showStat: true  },
  { statKey: 'qb_hit',            scoringKey: 'qb_hit',            label: 'D/ST QB Hit',      showStat: true  },
  { statKey: 'pts_allow',         scoringKey: 'pts_allow',         label: 'Points Allowed',   showStat: true  },
  { statKey: 'pts_allow_0',       scoringKey: 'pts_allow_0',       label: 'Shutout',          showStat: false },
  { statKey: 'pts_allow_1_6',     scoringKey: 'pts_allow_1_6',     label: '1-6 Pts Allowed',  showStat: false },
  { statKey: 'pts_allow_7_13',    scoringKey: 'pts_allow_7_13',    label: '7-13 Pts Allowed', showStat: false },
  { statKey: 'pts_allow_14_20',   scoringKey: 'pts_allow_14_20',   label: '14-20 Pts Allowed', showStat: false },
  { statKey: 'pts_allow_21_27',   scoringKey: 'pts_allow_21_27',   label: '21-27 Pts Allowed', showStat: false },
  { statKey: 'pts_allow_28_34',   scoringKey: 'pts_allow_28_34',   label: '28-34 Pts Allowed', showStat: false },
  { statKey: 'pts_allow_35p',     scoringKey: 'pts_allow_35p',     label: '35+ Pts Allowed',  showStat: false },
  { statKey: 'yds_allow',         scoringKey: 'yds_allow',         label: 'Yards Allowed',    showStat: true  },
  { statKey: 'yds_allow_0_100',   scoringKey: 'yds_allow_0_100',   label: '0-100 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_100_199', scoringKey: 'yds_allow_100_199', label: '100-199 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_200_299', scoringKey: 'yds_allow_200_299', label: '200-299 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_300_349', scoringKey: 'yds_allow_300_349', label: '300-349 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_350_399', scoringKey: 'yds_allow_350_399', label: '350-399 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_400_449', scoringKey: 'yds_allow_400_449', label: '400-449 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_450_499', scoringKey: 'yds_allow_450_499', label: '450-499 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_500_549', scoringKey: 'yds_allow_500_549', label: '500-549 Yds Allowed', showStat: false },
  { statKey: 'yds_allow_550p',    scoringKey: 'yds_allow_550p',    label: '550+ Yds Allowed', showStat: false },
];

function getScoreBreakdown(wEntry, activeScoringSettings, position = null) {
  const settings = { ...DEFAULT_SCORING, ...activeScoringSettings };
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

function Btn({ active, disabled = false, onClick, title, children }) {
  return (
    <CompanionSelectorButton
      onClick={disabled ? undefined : onClick}
      active={active}
      disabled={disabled}
      size="xs"
      title={title}
    >
      {children}
    </CompanionSelectorButton>
  );
}

function FilterGroup({ label, width = null, style = null, labelWidth = null, children }) {
  const sizingStyle = width ? { flex: `1 1 ${width}px`, maxWidth: `${width}px` } : null;
  return (
    <div
      className="companion-selector-rail-row"
      style={{ ...(sizingStyle ?? {}), ...(style ?? {}) }}
    >
      <span
        className="companion-selector-rail-label"
        style={labelWidth ? { width: `${labelWidth}px` } : null}
      >
        {label}
      </span>
      <div
        className="companion-selector-rail"
        role="group"
        aria-label={`${label} filter`}
        style={{ flexWrap: 'wrap', overflow: 'visible', paddingBottom: 0 }}
      >
        {children}
      </div>
    </div>
  );
}

const HEATMAP_TEAM_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: `${TEAM_LOGO_SIZE}px minmax(0, 1fr)`,
  columnGap: TEAM_CELL_GAP,
  alignItems: 'center',
};

const HEATMAP_TEAM_LOGO_STYLE = {
  objectFit: 'contain',
  flexShrink: 0,
  alignSelf: 'center',
};

const HEATMAP_TEAM_TEXT_STACK_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minHeight: `${HEATMAP_CELL_HEIGHT - TEAM_CELL_PAD_Y * 2}px`,
  minWidth: 0,
};

const HEATMAP_TEAM_CODE_STYLE = {
  lineHeight: `${TEAM_PRIMARY_LINE_HEIGHT}px`,
};

const HEATMAP_CELL_SECONDARY_STYLE = {
  fontSize: '8px',
  opacity: 0.6,
  marginTop: '1px',
};

const HEATMAP_BYE_STYLE = {
  fontSize: '8px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  opacity: 0.55,
};

const HEATMAP_FILTERED_STYLE = {
  fontSize: '8px',
  opacity: 0.35,
};

function fmtHeatmapNumber(value, fractionDigits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(fractionDigits);
}

function fmtSignedMargin(value) {
  const abs = Math.abs(value);
  const n = Number.isInteger(abs) ? String(Math.round(abs)) : abs.toFixed(1);
  if (value > 0) return `+${n}`;
  if (value < 0) return `-${n}`;
  return 'PU';
}

function fmtSpreadLine(value) {
  if (value == null) return '—';
  const n = Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
  return value > 0 ? `+${n}` : n;
}

function HeatmapSortIndicator({ active, dir }) {
  if (!active) return null;
  return <span style={{ marginLeft: '3px', opacity: 0.7 }}>{dir === 'desc' ? '↓' : '↑'}</span>;
}

const HeatmapCell = memo(function HeatmapCell({ cell }) {
  return (
    <td
      data-heatmap-week={cell.clickable ? cell.week : undefined}
      style={cell.style}
    >
      {cell.kind === 'value' ? (
        <>
          <div>{cell.primary}</div>
          {cell.secondary && (
            <div style={HEATMAP_CELL_SECONDARY_STYLE}>{cell.secondary}</div>
          )}
        </>
      ) : cell.kind === 'bye' ? (
        <span style={HEATMAP_BYE_STYLE}>BYE</span>
      ) : cell.kind === 'filtered' ? (
        <span style={HEATMAP_FILTERED_STYLE}>—</span>
      ) : cell.kind === 'dash' ? (
        '—'
      ) : null}
    </td>
  );
});

const HeatmapRow = memo(function HeatmapRow({ row, showAvg, onCellDrilldown }) {
  const handleClick = useCallback((event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    const cell = target.closest('td[data-heatmap-week]');
    if (!cell || !event.currentTarget.contains(cell)) return;
    onCellDrilldown(row.team, Number(cell.dataset.heatmapWeek));
  }, [onCellDrilldown, row.team]);

  return (
    <tr onClick={handleClick}>
      <td style={row.teamCellStyle}>
        <div style={HEATMAP_TEAM_GRID_STYLE}>
          <img
            src={row.logoUrl}
            alt={row.team}
            width={TEAM_LOGO_SIZE}
            height={TEAM_LOGO_SIZE}
            style={HEATMAP_TEAM_LOGO_STYLE}
          />
          <div style={HEATMAP_TEAM_TEXT_STACK_STYLE}>
            <span style={HEATMAP_TEAM_CODE_STYLE}>{row.team}</span>
            {row.teamMeta && (
              <span style={row.teamMetaStyle}>{row.teamMeta}</span>
            )}
          </div>
        </div>
      </td>
      {row.cells.map(cell => (
        <HeatmapCell key={cell.week} cell={cell} />
      ))}
      {showAvg ? (
        <td style={row.avgCell.style}>{row.avgCell.value}</td>
      ) : (
        <td style={row.avgCell.style} />
      )}
    </tr>
  );
});

const HeatmapTable = memo(function HeatmapTable({
  rows,
  weekHeaders,
  showAvg,
  styles,
  teamSort,
  sortKey,
  sortDir,
  onSort,
  onTeamSortChange,
  onCellDrilldown,
}) {
  return (
    <table style={styles.table}>
      <colgroup>
        <col style={styles.teamCol} />
      </colgroup>
      <thead>
        <tr>
          <th style={styles.stickyHead}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>Team</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {TEAM_SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => onTeamSortChange(opt.id)}
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
          {weekHeaders.map(({ week, avg }) => (
            <th key={week} style={styles.sortableHead} onClick={() => onSort(week)}>
              <div>
                Wk {week}
                <HeatmapSortIndicator active={sortKey === week} dir={sortDir} />
              </div>
              {avg != null && (
                <div style={styles.headerAvg}>{avg}</div>
              )}
            </th>
          ))}
          {showAvg ? (
            <th style={styles.sortableHead} onClick={() => onSort('avg')}>
              <div>
                AVG
                <HeatmapSortIndicator active={sortKey === 'avg'} dir={sortDir} />
              </div>
            </th>
          ) : (
            <th style={styles.head} />
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <HeatmapRow
            key={row.team}
            row={row}
            showAvg={showAvg}
            onCellDrilldown={onCellDrilldown}
          />
        ))}
      </tbody>
    </table>
  );
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompanionDefense({ onViewPlayer, routeState = null, onRouteStateChange = null }) {
  const {
    weeklyStats,
    players,
    scheduleMap,
    activeScoringSettings,
    espnIdOverrides,
    loadPlayers,
    loadSeasonStats,
    statsLoading,
    league,
  } = useSleeperBase();
  const statsEnhancing = useSleeperStatsEnhancing();
  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if ((weeklyStats && scheduleMap) || statsLoading) return;
    loadSeasonStats();
  }, [weeklyStats, scheduleMap, statsLoading, loadSeasonStats]);
  const { favoriteTeam, darkMode } = useTheme();
  const useMobilePreviewSheet = useMediaQuery(MOBILE_SHEET_QUERY);

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
  const [previewPlayerId, setPreviewPlayerId] = useState(null);
  const [useTeamColors, setUseTeamColors] = useState(false);
  const [vegasOddsView, setVegasOddsView] = useState('spread'); // 'spread' | 'ou'
  const [vegasInfoOpen, setVegasInfoOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [gridMaxHeight, setGridMaxHeight] = useState('60vh');
  const filterBarRef = useRef(null);
  const tableContainerRef = useRef(null);
  const routeHydratingRef = useRef(false);
  const previousIncomingRouteRef = useRef(null);
  const skipNextRouteEmitRef = useRef(false);
  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  const leaguePositionFilters = useMemo(
    () => getLeaguePositionFilters(league?.roster_positions),
    [league?.roster_positions],
  );
  const offensePositions = useMemo(
    () => filterHeatmapPositions(OFF_POSITIONS, leaguePositionFilters),
    [leaguePositionFilters],
  );
  const defensePositions = useMemo(
    () => filterHeatmapPositions(DEF_POSITIONS, leaguePositionFilters),
    [leaguePositionFilters],
  );
  const offenseStatModes = useMemo(
    () => getAvailableOffenseStatModes(activeScoringSettings),
    [activeScoringSettings],
  );
  const defenseStatModes = useMemo(
    () => getAvailableDefenseStatModes(activeScoringSettings, defensePositions),
    [activeScoringSettings, defensePositions],
  );
  const fantasySeasonWeeks = useMemo(() => {
    const maxWeek = Number.isFinite(lastScoredLeg) && lastScoredLeg > 0
      ? Math.min(lastScoredLeg, 18)
      : 17;
    return Array.from({ length: maxWeek }, (_, i) => i + 1);
  }, [lastScoredLeg]);

  const localRouteState = useMemo(() => ({
    viewMode,
    position: pos,
    defensePosition: defPos,
    statMode,
    defenseStatMode: defStatMode,
    scope: heatmapScope,
    location: locationFilter,
    sortKey,
    sortDir,
    teamSort,
    useTeamColors,
    vegasView: vegasOddsView,
  }), [
    viewMode,
    pos,
    defPos,
    statMode,
    defStatMode,
    heatmapScope,
    locationFilter,
    sortKey,
    sortDir,
    teamSort,
    useTeamColors,
    vegasOddsView,
  ]);

  const normalizedIncomingRouteState = useMemo(() => {
    if (!routeState) return null;
    return {
      viewMode: routeState.viewMode ?? 'offense',
      position: routeState.position ?? 'ALL',
      defensePosition: routeState.defensePosition ?? 'ALL',
      statMode: routeState.statMode ?? 'pts',
      defenseStatMode: routeState.defenseStatMode ?? 'pts',
      scope: routeState.scope ?? 'overall',
      location: routeState.location ?? 'all',
      sortKey: routeState.sortKey ?? 'avg',
      sortDir: routeState.sortDir ?? 'desc',
      teamSort: routeState.teamSort ?? 'alpha',
      useTeamColors: Boolean(routeState.useTeamColors),
      vegasView: routeState.vegasView ?? 'spread',
    };
  }, [routeState]);

  useEffect(() => {
    if (!normalizedIncomingRouteState) return;
    const incomingSerialized = JSON.stringify(normalizedIncomingRouteState);
    if (previousIncomingRouteRef.current === incomingSerialized) return;
    previousIncomingRouteRef.current = incomingSerialized;
    skipNextRouteEmitRef.current = true;
    if (incomingSerialized === JSON.stringify(localRouteState)) return;

    routeHydratingRef.current = true;
    setViewMode(normalizedIncomingRouteState.viewMode);
    setPos(normalizedIncomingRouteState.position);
    setDefPos(normalizedIncomingRouteState.defensePosition);
    setStatMode(normalizedIncomingRouteState.statMode);
    setDefStatMode(normalizedIncomingRouteState.defenseStatMode);
    setHeatmapScope(normalizedIncomingRouteState.scope);
    setLocationFilter(normalizedIncomingRouteState.location);
    setSortKey(normalizedIncomingRouteState.sortKey);
    setSortDir(normalizedIncomingRouteState.sortDir);
    setTeamSort(normalizedIncomingRouteState.teamSort);
    setUseTeamColors(normalizedIncomingRouteState.useTeamColors);
    setVegasOddsView(normalizedIncomingRouteState.vegasView);
  }, [normalizedIncomingRouteState, localRouteState]);

  useEffect(() => {
    if (skipNextRouteEmitRef.current) {
      skipNextRouteEmitRef.current = false;
      return;
    }
    if (routeHydratingRef.current) {
      routeHydratingRef.current = false;
      return;
    }
    if (normalizedIncomingRouteState && JSON.stringify(normalizedIncomingRouteState) === JSON.stringify(localRouteState)) {
      return;
    }
    onRouteStateChange?.(localRouteState);
  }, [onRouteStateChange, normalizedIncomingRouteState, localRouteState]);

  useEffect(() => {
    if (!offensePositions.includes(pos)) setPos(offensePositions[0] ?? 'ALL');
  }, [offensePositions, pos]);

  useEffect(() => {
    if (!defensePositions.includes(defPos)) setDefPos(defensePositions[0] ?? 'ALL');
  }, [defensePositions, defPos]);

  useEffect(() => {
    if (offenseStatModes.some(mode => mode.id === statMode)) return;
    setStatMode('pts');
  }, [offenseStatModes, statMode]);

  useEffect(() => {
    if (defenseStatModes.some(mode => mode.id === defStatMode)) return;
    setDefStatMode('pts');
  }, [defenseStatModes, defStatMode]);

  // Dynamically compute the table container's max-height based on its actual
  // top position in the viewport. This correctly handles variable filter bar
  // heights (wrapping on narrow screens) and device safe-area insets (PWA).
  const computeGridMaxHeight = useCallback(() => {
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
  }, []);

  useEffect(() => {
    computeGridMaxHeight();
    const ro = new ResizeObserver(computeGridMaxHeight);
    if (filterBarRef.current) ro.observe(filterBarRef.current);
    window.addEventListener('resize', computeGridMaxHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeGridMaxHeight);
    };
  }, [computeGridMaxHeight]);

  useEffect(() => {
    computeGridMaxHeight();
  }, [computeGridMaxHeight, mobileFiltersOpen]);

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
    if (!weeklyStats || !players || !scheduleMap) return null;
    if (statMode === 'game_score' || statMode === 'vegas_odds') return {};
    return getCachedOffenseAllowedTable(weeklyStats, players, scheduleMap, activeScoringSettings, statMode);
  }, [statsEnhancing, weeklyStats, players, scheduleMap, activeScoringSettings, statMode]);

  // Defense-scored table: keyed by the defensive player's own team
  const defenseScoredTable = useMemo(() => {
    if (statsEnhancing) return null;
    if (!weeklyStats || !players || !scheduleMap) return null;
    return getCachedDefenseScoredTable(weeklyStats, players, scheduleMap, activeScoringSettings, defStatMode);
  }, [statsEnhancing, weeklyStats, players, scheduleMap, activeScoringSettings, defStatMode]);

  const activeTable = viewMode === 'offense' ? offenseAllowedTable : defenseScoredTable;
  const activePositions = viewMode === 'offense' ? offensePositions : defensePositions;
  const activePos = viewMode === 'offense' ? pos : defPos;
  const setActivePos = viewMode === 'offense' ? setPos : setDefPos;
  const activePositionSet = useMemo(
    () => new Set(activePositions.filter(position => position !== 'ALL')),
    [activePositions],
  );
  const isGameStatMode = SHARED_GAME_STAT_MODES.has(statMode);

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
    if (statMode === 'vegas_odds') {
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
    if (statMode === 'game_score') {
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

    const posList = activePositions.filter(position => position !== 'ALL');
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
  }, [activeTable, activePos, activePositions, viewMode, statMode, scheduleMap, weekMatchesLocation, vegasOddsView, fantasySeasonWeeks]);

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

  const handleSort = useCallback((key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  const resetSort = useCallback(() => {
    setSortKey('avg');
    setSortDir('desc');
    setTeamSort('alpha');
  }, []);

  const handleTeamSortChange = useCallback((key) => {
    setTeamSort(key);
    setSortKey('team');
  }, []);

  const handleCellDrilldown = useCallback((team, week) => {
    setDrilldown({ team, week });
  }, []);

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

  const cellBg = useCallback((pts, team, week) => {
    if (pts == null) return undefined;

    // Spread: binary covered/missed — no gradient, just green or red.
    // O/U falls through to the standard heatmap gradient below.
    if (statMode === 'vegas_odds' && vegasOddsView === 'spread') {
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
    if (min == null || max == null) return undefined;
    if (max === min) {
      if (pts === 0) return undefined;
      const t = pts > 0 ? 1 : 0;
      if (useTeamColors && favoriteTeam && TEAM_COLORS[favoriteTeam]) {
        const tc = TEAM_COLORS[favoriteTeam];
        const hexLow  = darkMode ? (tc.darkSecondary ?? tc.secondary) : tc.secondary;
        const hexHigh = darkMode ? (tc.darkPrimary   ?? tc.primary)   : tc.primary;
        return heatColorTeam(t, hexLow, hexHigh);
      }
      return heatColor(t);
    }
    const raw = (pts - min) / (max - min);
    const t = raw;
    if (useTeamColors && favoriteTeam && TEAM_COLORS[favoriteTeam]) {
      const tc = TEAM_COLORS[favoriteTeam];
      const hexLow  = darkMode ? (tc.darkSecondary ?? tc.secondary) : tc.secondary;
      const hexHigh = darkMode ? (tc.darkPrimary   ?? tc.primary)   : tc.primary;
      return heatColorTeam(t, hexLow, hexHigh);
    }
    return heatColor(t);
  }, [darkMode, favoriteTeam, heatRanges, heatmapScope, statMode, useTeamColors, vegasOddsView]);

  // ── Drilldown players ──────────────────────────────────────────────────────

  const drilldownPlayers = useMemo(() => {
    if (!drilldown || !weeklyStats || !players) return [];
    if (isGameStatMode) return []; // box score mode
    const { team, week } = drilldown;
    const results = [];

    if (viewMode === 'offense') {
      const matchPos = activePos === 'ALL' ? null : activePos;
      for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
        const player = players[playerId];
        if (!player) continue;
        if (matchPos && player.position !== matchPos) continue;
        if (!matchPos && !activePositionSet.has(player.position)) continue;
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
        else val = calcPoints(wEntry, activeScoringSettings, player.position);
        if (val <= 0) continue;
        const breakdown = statMode === 'pts' ? getScoreBreakdown(wEntry, activeScoringSettings, player.position) : null;
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
        : (wEntry, pos) => calcPoints(wEntry, activeScoringSettings, pos);
      for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
        const player = players[playerId];
        if (!player) continue;
        const normPos = normDefPos(player.position);
        if (!normPos) continue;
        if (!activePositionSet.has(normPos)) continue;
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
        const breakdown = defStatMode === 'pts' ? getScoreBreakdown(wEntry, activeScoringSettings, player.position) : null;
        const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || playerId;
        const teamSource = wEntry._teamSource ?? 'fallback';
        results.push({ playerId, name, position: player.position, val, breakdown, teamSource });
      }
    }

    return results.sort((a, b) => b.val - a.val);
  }, [drilldown, weeklyStats, players, viewMode, activePos, activePositionSet, statMode, defStatMode, activeScoringSettings, scheduleMap, isGameStatMode]);

  // ── Game box score (Game Score stat mode) ─────────────────────────────────

  const gameBoxScore = useMemo(() => {
    if (!drilldown || !isGameStatMode) return null;
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
  }, [drilldown, isGameStatMode, scheduleMap, weeklyStats, players, espnIdOverrides]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const loaded = isGameStatMode ? !!scheduleMap : (viewMode === 'offense' ? !!offenseAllowedTable : !!defenseScoredTable);
  const showAvg = statMode !== 'vegas_odds';
  const mobileFilterLabelWidth = useMobilePreviewSheet ? MOBILE_FILTER_LABEL_WIDTH : null;

  const heatmapStyles = useMemo(() => {
    const head = headStyle();
    const cell = cellStyle(false);
    const avgCell = cellStyle(true);
    return {
      table: {
        borderCollapse: 'separate',
        borderSpacing: 0,
        tableLayout: 'fixed',
        width: '100%',
        minWidth: `${teamColumnWidth + (fantasySeasonWeeks.length + 1) * metricColumnWidth}px`,
        fontSize: '11px',
      },
      teamCol: { width: `${teamColumnWidth}px` },
      stickyHead: stickyHeadStyleFor(teamColumnWidth),
      stickyBody: stickyBodyStyleFor(teamColumnWidth),
      head,
      sortableHead: { ...head, cursor: 'pointer', userSelect: 'none' },
      headerAvg: {
        color: 'var(--color-label-secondary)',
        fontWeight: 400,
        fontSize: '10px',
      },
      cell,
      avgCell,
    };
  }, [fantasySeasonWeeks.length, metricColumnWidth, teamColumnWidth]);

  const weekHeaders = useMemo(() => (
    fantasySeasonWeeks.map(week => ({
      week,
      avg: colAvgs[week] != null ? colAvgs[week].toFixed(1) : null,
    }))
  ), [colAvgs, fantasySeasonWeeks]);

  const weekGameCounts = useMemo(() => {
    const counts = {};
    for (const week of fantasySeasonWeeks) {
      counts[week] = scheduleMap ? Object.keys(scheduleMap[week] ?? {}).length : 0;
    }
    return counts;
  }, [fantasySeasonWeeks, scheduleMap]);

  const defStatModeHasStatKey = useMemo(
    () => Boolean(DEF_STAT_MODES.find(mode => mode.id === defStatMode)?.statKey),
    [defStatMode],
  );
  const activeStatModes = viewMode === 'offense' ? offenseStatModes : defenseStatModes;

  const heatmapRows = useMemo(() => rows.map(({ team, weekPts, avg }, idx) => {
    const rowBg = idx % 2 === 0 ? 'var(--color-bg)' : 'var(--color-fill)';
    const tc = TEAM_COLORS[TEAM_COLOR_KEY[team] ?? team.toLowerCase()];
    const teamHex = tc ? (darkMode ? (tc.darkPrimary ?? tc.primary) : tc.primary) : null;
    const colorAlpha = darkMode ? 0.55 : 0.90;
    const teamMeta = sortKey === 'team'
      ? (teamSort === 'conf'
        ? (TEAM_META[team]?.conf ?? '')
        : (teamSort === 'division' ? (TEAM_META[team]?.div ?? '') : ''))
      : '';
    const teamBg = teamHex ? blendColor(teamHex, colorAlpha, darkMode) : rowBg;
    const teamTextColor = teamHex ? getContrastColor(teamHex, colorAlpha, darkMode) : 'var(--color-label)';
    const teamCellStyle = {
      ...heatmapStyles.stickyBody,
      background: teamBg,
      color: teamTextColor,
    };
    const teamMetaStyle = {
      fontSize: '9px',
      lineHeight: `${TEAM_META_LINE_HEIGHT}px`,
      height: `${TEAM_META_LINE_HEIGHT}px`,
      fontWeight: 500,
      color: teamTextColor === '#ffffff' ? 'rgba(255,255,255,0.72)' : 'var(--color-label-secondary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    };

    const cells = fantasySeasonWeeks.map((week) => {
      const pts = weekPts[week];
      const played = scheduleMap?.[week]?.[team] != null;
      const matchesLoc = weekMatchesLocation(team, week);
      const isBye = weekGameCounts[week] > 0 && !played;
      const isFiltered = played && !matchesLoc;
      const clickable = pts != null && !isFiltered;
      const style = {
        ...heatmapStyles.cell,
        background: pts != null && !isFiltered ? cellBg(pts, team, week) : rowBg,
        color: pts != null && !isFiltered ? '#000' : 'var(--color-label-secondary)',
        cursor: clickable ? 'pointer' : 'default',
      };

      if (pts != null && !isFiltered) {
        if (statMode === 'game_score') {
          const opp = scheduleMap?.[week]?.[team]?.opp?.toUpperCase();
          const ownScore = opp ? (scheduleMap?.[week]?.[opp]?.ptsAgainst ?? null) : null;
          const oppScore = Math.round(pts);
          return {
            week,
            clickable,
            style,
            kind: 'value',
            primary: ownScore != null ? `${Math.round(ownScore)}-${oppScore}` : fmtHeatmapNumber(pts),
            secondary: ownScore != null ? `${team}·${scheduleMap[week][team].opp}` : null,
          };
        }

        if (statMode === 'vegas_odds') {
          const oddsEntry = NFL_ODDS[ODDS_SEASON]?.[week]?.[team];
          return {
            week,
            clickable,
            style,
            kind: 'value',
            primary: vegasOddsView === 'ou' ? fmtSignedMargin(pts) : fmtSpreadLine(oddsEntry?.spread),
            secondary: vegasOddsView === 'ou'
              ? (oddsEntry?.total != null ? `O/U ${oddsEntry.total}` : null)
              : (scheduleMap?.[week]?.[team]?.opp ?? null),
          };
        }

        return {
          week,
          clickable,
          style,
          kind: 'value',
          primary: viewMode === 'defense' && defStatModeHasStatKey
            ? fmtHeatmapNumber(pts)
            : pts.toFixed(1),
          secondary: scheduleMap?.[week]?.[team]?.opp ?? null,
        };
      }

      return {
        week,
        clickable: false,
        style,
        kind: isBye ? 'bye' : isFiltered ? 'filtered' : played ? 'dash' : 'empty',
      };
    });

    const avgCell = showAvg
      ? {
          style: {
            ...heatmapStyles.avgCell,
            background: avg != null ? cellBg(avg, team, null) : rowBg,
            color: avg != null ? '#000' : 'var(--color-label)',
          },
          value: avg != null ? avg.toFixed(2) : '—',
        }
      : {
          style: {
            ...heatmapStyles.cell,
            background: rowBg,
          },
          value: null,
        };

    return {
      team,
      logoUrl: espnLogoUrl(team),
      teamMeta,
      teamCellStyle,
      teamMetaStyle,
      cells,
      avgCell,
    };
  }), [
    cellBg,
    darkMode,
    defStatModeHasStatKey,
    fantasySeasonWeeks,
    heatmapStyles,
    rows,
    scheduleMap,
    showAvg,
    sortKey,
    statMode,
    teamSort,
    vegasOddsView,
    viewMode,
    weekGameCounts,
    weekMatchesLocation,
  ]);

  const activeStatLabel = useMemo(() => {
    if (viewMode === 'offense' || SHARED_GAME_STAT_MODES.has(statMode)) {
      return offenseStatModes.find(mode => mode.id === statMode)?.label ?? 'Fantasy Pts';
    }
    return defenseStatModes.find(mode => mode.id === defStatMode)?.label ?? 'Fantasy Pts';
  }, [defStatMode, defenseStatModes, offenseStatModes, statMode, viewMode]);

  const activeLocationLabel = useMemo(() => (
    [{ id: 'all', label: 'All' }, { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }]
      .find(option => option.id === locationFilter)?.label ?? 'All'
  ), [locationFilter]);

  const activeScopeLabel = useMemo(() => (
    HEATMAP_SCOPES.find(scope => scope.id === heatmapScope)?.label ?? 'Overall'
  ), [heatmapScope]);

  const mobileFilterSummary = useMemo(() => {
    const phaseLabel = viewMode === 'defense' ? 'Defense' : 'Offense';
    const positionLabel = activePos === 'ALL' ? 'All' : activePos;
    const summary = [phaseLabel, positionLabel, activeStatLabel, activeLocationLabel, activeScopeLabel];
    if (statMode === 'vegas_odds') {
      summary.push(vegasOddsView === 'ou' ? 'O/U' : 'Spread');
    }
    return summary;
  }, [activeLocationLabel, activePos, activeScopeLabel, activeStatLabel, statMode, vegasOddsView, viewMode]);

  const showFilterPanel = !useMobilePreviewSheet || mobileFiltersOpen;

  useEffect(() => {
    if (!loaded) return;
    computeGridMaxHeight();
  }, [loaded, computeGridMaxHeight]);

  return (
    <div className="lg:-mx-8">
      <div ref={filterBarRef} className="px-4 sm:px-6 lg:px-8 pb-3">
        <div className="companion-heatmap-mobile-filter-summary">
          <CompanionSelectorButton
            active={mobileFiltersOpen}
            className="companion-heatmap-mobile-filter-toggle"
            size="xs"
            onClick={() => setMobileFiltersOpen(open => !open)}
            aria-expanded={mobileFiltersOpen}
            aria-controls="companion-heatmap-filter-panel"
          >
            {mobileFiltersOpen ? 'Hide Filters' : 'Show Filters'}
          </CompanionSelectorButton>
          <div className="companion-heatmap-mobile-filter-summary__rail" aria-label="Active heatmap filters">
            {mobileFilterSummary.map(item => (
              <span key={item} className="companion-heatmap-mobile-filter-summary__chip">
                {item}
              </span>
            ))}
          </div>
          {statMode === 'vegas_odds' && (
            <div className="relative shrink-0">
              <button
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
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

        {showFilterPanel && (
          <div id="companion-heatmap-filter-panel" className="flex items-center gap-2 max-lg:pt-2">
            {/* Filter groups wrap as needed instead of becoming horizontally scrollable. */}
            <div className="flex-1 min-w-0 flex flex-wrap items-start gap-x-5 gap-y-2 overflow-visible">
          <div
            style={{
              display: 'flex',
              flex: `1 1 ${FILTER_GROUP_WIDTHS.position}px`,
              maxWidth: `${FILTER_GROUP_WIDTHS.position}px`,
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <FilterGroup label="Phase" labelWidth={PHASE_POSITION_LABEL_WIDTH} style={{ flex: '0 0 auto', maxWidth: 'none' }}>
              {[{ id: 'offense', label: 'Offense' }, { id: 'defense', label: 'Defense' }].map(m => {
                return (
                  <Btn
                    key={m.id}
                    active={viewMode === m.id}
                    onClick={() => { setViewMode(m.id); resetSort(); }}
                  >
                    {m.label}
                  </Btn>
                );
              })}
            </FilterGroup>

            <FilterGroup label="Position" labelWidth={PHASE_POSITION_LABEL_WIDTH} style={{ flex: '0 0 auto', maxWidth: 'none' }}>
              {activePositions.map(p => {
                const disabled = POSITIONLESS_GAME_STAT_MODES.has(statMode);
                return (
                  <Btn
                    key={p}
                    active={!disabled && activePos === p}
                    disabled={disabled}
                    title={disabled ? 'Position filters are not used for score or odds views.' : undefined}
                    onClick={() => { setActivePos(p); resetSort(); }}
                  >
                    {getPositionFilterLabel(p)}
                  </Btn>
                );
              })}
            </FilterGroup>
          </div>

          <FilterGroup label="Stat" width={FILTER_GROUP_WIDTHS.stat} labelWidth={mobileFilterLabelWidth}>
            {activeStatModes.map(m => {
              const sharedGameStat = SHARED_GAME_STAT_MODES.has(m.id);
              const active = sharedGameStat || viewMode === 'offense'
                ? statMode === m.id
                : !isGameStatMode && defStatMode === m.id;
              return (
                <Btn
                  key={m.id}
                  active={active}
                  onClick={() => {
                    if (viewMode === 'offense' || sharedGameStat) {
                      setStatMode(m.id);
                    } else {
                      setStatMode('pts');
                      setDefStatMode(m.id);
                    }
                    resetSort();
                  }}
                >
                  {m.label}
                </Btn>
              );
            })}
          </FilterGroup>

          <FilterGroup label="Location" width={FILTER_GROUP_WIDTHS.location} labelWidth={mobileFilterLabelWidth}>
            {[{ id: 'all', label: 'All' }, { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }].map(opt => (
              <Btn key={opt.id} active={locationFilter === opt.id} onClick={() => setLocationFilter(opt.id)}>
                {opt.label}
              </Btn>
            ))}
          </FilterGroup>

          <FilterGroup label="Color" width={FILTER_GROUP_WIDTHS.color} labelWidth={mobileFilterLabelWidth}>
            {HEATMAP_SCOPES.map(s => {
              const disabled = statMode === 'vegas_odds';
              return (
                <Btn
                  key={s.id}
                  active={!disabled && heatmapScope === s.id}
                  disabled={disabled}
                  title={disabled ? 'Odds use covered/missed colors instead of heatmap color scales.' : undefined}
                  onClick={() => setHeatmapScope(s.id)}
                >
                  {s.label}
                </Btn>
              );
            })}
          </FilterGroup>

          {favoriteTeam && (
            <Btn active={useTeamColors} onClick={() => setUseTeamColors(v => !v)}>
              {favoriteTeam.toUpperCase()} Colors
            </Btn>
          )}

          <FilterGroup
            label="Result"
            width={FILTER_GROUP_WIDTHS.result}
            labelWidth={mobileFilterLabelWidth}
            style={useMobilePreviewSheet ? null : { marginLeft: 'auto' }}
          >
            {[
              { id: 'spread', label: 'Spread' },
              { id: 'ou', label: 'O/U' },
            ].map(opt => {
              const disabled = statMode !== 'vegas_odds';
              return (
                <Btn
                  key={opt.id}
                  active={!disabled && vegasOddsView === opt.id}
                  disabled={disabled}
                  title={disabled ? 'Choose the Spread stat to use result filters.' : undefined}
                  onClick={() => setVegasOddsView(opt.id)}
                >
                  {opt.label}
                </Btn>
              );
            })}
          </FilterGroup>
        </div>

        {/* Info icon — outside the overflow container so tooltip is never clipped */}
        {statMode === 'vegas_odds' && !useMobilePreviewSheet && (
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
        )}
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-16 px-4">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            {statsEnhancing ? 'Preparing heatmap…' : 'Load season stats to see defensive rankings.'}
          </span>
        </div>
      ) : (
        <div className="companion-heatmap-scroll-frame">
          <div
            ref={tableContainerRef}
            className="companion-heatmap-table-scroller"
            style={{
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: gridMaxHeight,
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorX: 'contain',
              width: '100%',
            }}
          >
            <HeatmapTable
              rows={heatmapRows}
              weekHeaders={weekHeaders}
              showAvg={showAvg}
              styles={heatmapStyles}
              teamSort={teamSort}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onTeamSortChange={handleTeamSortChange}
              onCellDrilldown={handleCellDrilldown}
            />
          </div>
        </div>
      )}

      {/* Drilldown modal */}
      {drilldown && (
        <Modal
          onClose={() => setDrilldown(null)}
          mobileSheet
          ariaLabel="Heatmap drilldown"
          containerClassName="companion-heatmap-drilldown-panel"
          containerStyle={{
            background: 'var(--color-bg)',
            width: '100%',
            maxWidth: '400px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div
            className="companion-heatmap-drilldown-content"
            style={{
              padding: '24px 20px',
              flex: '1 1 auto',
              overflowY: 'auto',
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
                    {isGameStatMode
                      ? 'Score'
                      : <>
                          {viewMode === 'offense' ? (activePos === 'ALL' ? 'All positions' : getPositionFilterLabel(activePos)) : (activePos === 'ALL' ? 'All defense' : getPositionFilterLabel(activePos))}
                          {' · '}
                          {viewMode === 'offense'
                            ? offenseStatModes.find(m => m.id === statMode)?.label
                            : defenseStatModes.find(m => m.id === defStatMode)?.label}
                          {' · '}{drilldownPlayers.length} player{drilldownPlayers.length !== 1 ? 's' : ''}
                        </>
                    }
                  </div>
                </div>
              );
            })()}

            {isGameStatMode ? (
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
                          <CompanionPlayerRow
                            key={i}
                            player={{ ...(players?.[playerId] ?? {}), id: playerId, name, position, team: teamId }}
                            darkMode={darkMode}
                            compact
                            showTeamLogo={false}
                            interactive={canNav}
                            onClick={canNav ? () => {
                              setDrilldown(null);
                              if (useMobilePreviewSheet) {
                                setPreviewPlayerId(playerId);
                                return;
                              }
                              const yearsExp = players?.[playerId]?.years_exp;
                              onViewPlayer(String(espnId), { displayName: name, teamId, position, experience: yearsExp != null ? yearsExp + 1 : undefined });
                            } : undefined}
                            metaSegments={statLine ? [statLine] : []}
                            gridTemplate="34px auto minmax(0, 1fr)"
                            style={{
                              minHeight: 52,
                              borderRadius: 0,
                              borderLeftWidth: 3,
                              marginBottom: i < data.performers.length - 1 ? 6 : 0,
                            }}
                          />
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
                  const espnId = players?.[playerId]?.espn_id ?? espnIdOverrides?.[playerId];
                  const canNav = !!(onViewPlayer && espnId);
                  const teamId = players?.[playerId]?.team?.toUpperCase();
                  return (
                    <div
                      key={i}
                      style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--color-fill)' }}
                    >
                      {/* Compact header: name · pos · value */}
                      <CompanionPlayerRow
                        player={{ ...(players?.[playerId] ?? {}), id: playerId, name, position, team: teamId }}
                        darkMode={darkMode}
                        compact
                        showTeamLogo={false}
                        interactive={canNav}
                        onClick={canNav ? () => {
                          setDrilldown(null);
                          if (useMobilePreviewSheet) {
                            setPreviewPlayerId(playerId);
                            return;
                          }
                          const yearsExp = players?.[playerId]?.years_exp;
                          onViewPlayer(String(espnId), { displayName: name, teamId, position, experience: yearsExp != null ? yearsExp + 1 : undefined });
                        } : undefined}
                        columns={[
                          <CompanionPlayerMetric
                            key="value"
                            compact
                            align="end"
                            value={val % 1 === 0 ? val : val.toFixed(1)}
                            label={valLabel}
                          />,
                        ]}
                        status={teamSource === 'fallback' ? (
                          <CompanionPlayerStatus
                            label="est."
                            title="Team attribution estimated — this player may have been traded or signed after the season. Stats may be misattributed."
                          />
                        ) : null}
                        gridTemplate="34px auto minmax(0, 1fr) auto auto"
                        style={{
                          minHeight: 52,
                          borderRadius: 0,
                          borderLeftWidth: 3,
                          marginBottom: breakdown?.length ? 6 : 0,
                        }}
                      />

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
        </Modal>
      )}
      {previewPlayerId && (
        <CompanionPlayerPreviewSheet
          playerId={previewPlayerId}
          onClose={() => setPreviewPlayerId(null)}
          onViewStats={(playerId) => {
            const player = players?.[playerId];
            const espnId = player?.espn_id ?? espnIdOverrides?.[playerId];
            if (!espnId) return;
            onViewPlayer?.(String(espnId), {
              displayName: player?.full_name,
              teamId: player?.team?.toUpperCase(),
              position: player?.position,
              experience: player?.years_exp != null ? player.years_exp + 1 : undefined,
            });
          }}
        />
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
