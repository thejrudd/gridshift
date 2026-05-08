import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buildStatMap, buildRankMap, getStatRows, getGameLogColumns, positionGroup } from '../utils/playerMetrics';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { calcPoints, DEFAULT_SCORING, STAT_TO_SCORING_KEY } from '../utils/scoringEngine';
import useMediaQuery from '../hooks/useMediaQuery.js';

// Extract a formatted stat value from a per-game statsJson
function statVal(statsJson, key, decimals = 0, suffix = '') {
  const map = buildStatMap(statsJson);
  const raw = map[key];
  if (raw === null || raw === undefined) return '--';
  const num = parseFloat(raw);
  if (isNaN(num)) return '--';
  return `${Number(num).toFixed(decimals)}${suffix}`;
}

function numericStatValue(value) {
  if (value === null || value === undefined || value === '--') return null;
  const normalized = String(value).replace(/[%,$]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getGameStatEntry(statsJson, key) {
  let fallback = null;
  const categories = statsJson?.splits?.categories ?? [];

  for (const category of categories) {
    for (const stat of (category.stats ?? [])) {
      if (stat.name !== key) continue;
      const rawValue = stat.value ?? stat.displayValue ?? null;
      const numericValue = numericStatValue(rawValue);
      const entry = {
        value: rawValue,
        displayValue: stat.displayValue ?? rawValue,
        label: stat.displayName || stat.shortDisplayName || stat.name,
        shortLabel: stat.shortDisplayName || stat.displayName || stat.name,
      };

      if (numericValue !== null && Math.abs(numericValue) > POINT_EPSILON) return entry;
      fallback ??= entry;
    }
  }

  return fallback;
}

function gameStatDisplayVal(statsJson, col) {
  if (col.decimals != null || col.suffix) return statVal(statsJson, col.key, col.decimals ?? 0, col.suffix ?? '');
  const entry = getGameStatEntry(statsJson, col.key);
  if (entry?.displayValue === null || entry?.displayValue === undefined || entry?.displayValue === '') return '--';
  return String(entry.displayValue);
}

const POINT_EPSILON = 0.005;
const FANTASY_TOTAL_POINTS_KEY = 'fantasy_total_points';

function isSameNumericValue(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) < POINT_EPSILON;
}

const STAT_LABELS = {
  pass_yd: 'Pass Yards',
  pass_td: 'Pass TD',
  pass_int: 'Interception',
  pass_int_td: 'Pick 6 Thrown',
  int_ret_td: 'Pick 6 Thrown',
  pass_2pt: 'Pass 2-Pt',
  pass_sack: 'Sack Taken',
  pass_cmp: 'Completion',
  pass_att: 'Pass Attempt',
  pass_inc: 'Incomplete Pass',
  pass_fd: 'Pass 1st Down',
  rush_yd: 'Rush Yards',
  rush_td: 'Rush TD',
  rush_2pt: 'Rush 2-Pt',
  rush_fd: 'Rush 1st Down',
  rec: 'Reception',
  rec_yd: 'Rec Yards',
  rec_td: 'Rec TD',
  rec_2pt: 'Rec 2-Pt',
  rec_fd: 'Rec 1st Down',
  rec_0_4: 'Rec 0-4',
  rec_5_9: 'Rec 5-9',
  rec_10_19: 'Rec 10-19',
  rec_20_29: 'Rec 20-29',
  rec_30_39: 'Rec 30-39',
  fum: 'Fumble',
  fum_lost: 'Fumble Lost',
  fum_rec: 'Fumble Recovery',
  fum_ret_td: 'Fumble Return TD',
  fum_rec_td: 'Fumble Return TD',
  st_td: 'Special Teams TD',
  ret_td: 'Return TD',
  blk_kick: 'Blocked Kick',
  kr_yd: 'Kick Return Yards',
  pr_yd: 'Punt Return Yards',
  st_tkl_solo: 'Special Teams Tackle',
  blk_kick_ret_yd: 'Blocked Kick Return Yards',
  fg_ret_yd: 'Missed FG Return Yards',
  fum_ret_yd: 'Fumble Return Yards',
  bonus_rec_te: 'TE Reception Bonus',
  bonus_rec_rb: 'RB Reception Bonus',
  bonus_rec_wr: 'WR Reception Bonus',
  bonus_rush_att: 'Carry Bonus',
  bonus_fd_qb: 'QB First Down Bonus',
  bonus_fd_rb: 'RB First Down Bonus',
  bonus_fd_wr: 'WR First Down Bonus',
  bonus_fd_te: 'TE First Down Bonus',
  bonus_pass_yd_300: '300+ Pass Yd Bonus',
  bonus_pass_yd_400: '400+ Pass Yd Bonus',
  bonus_rush_yd_100: '100+ Rush Yd Bonus',
  bonus_rush_yd_200: '200+ Rush Yd Bonus',
  bonus_rec_yd_100: '100+ Rec Yd Bonus',
  bonus_rec_yd_200: '200+ Rec Yd Bonus',
  bonus_rush_rec_yd_100: '100+ Rush+Rec Bonus',
  bonus_rush_rec_yd_200: '200+ Rush+Rec Bonus',
  bonus_pass_cmp_25: '25+ Completion Bonus',
  bonus_rush_att_20: '20+ Rush Att Bonus',
  bonus_pass_td_40p: '40+ Pass TD Bonus',
  bonus_pass_td_50p: '50+ Pass TD Bonus',
  bonus_pass_cmp_40p: '40+ Completion Bonus',
  bonus_rush_td_40p: '40+ Rush TD Bonus',
  bonus_rush_td_50p: '50+ Rush TD Bonus',
  bonus_rec_td_40p: '40+ Rec TD Bonus',
  bonus_rec_td_50p: '50+ Rec TD Bonus',
  bonus_rec_40p: '40+ Reception Bonus',
  bonus_rush_40p: '40+ Rush Bonus',
  bonus_def_fum_td_50p: '50+ Fumble TD Bonus',
  bonus_def_int_td_50p: '50+ INT TD Bonus',
  idp_tkl: 'Tackle',
  idp_tkl_solo: 'Solo Tackle',
  idp_tkl_ast: 'Assisted Tackle',
  idp_tkl_loss: 'Tackle for Loss',
  idp_sack: 'Sack',
  idp_sack_yd: 'Sack Yards',
  idp_int: 'Def INT',
  idp_int_ret_yd: 'INT Return Yards',
  idp_int_td: 'INT Return TD',
  idp_ff: 'Forced Fumble',
  idp_fr: 'Fumble Recovery',
  idp_fr_yd: 'Fumble Return Yards',
  idp_fr_td: 'Fumble Return TD',
  idp_def_td: 'Defensive TD',
  idp_pd: 'Pass Deflection',
  idp_qbhit: 'QB Hit',
  idp_safety: 'Safety',
  idp_blk_kick: 'Blocked Kick',
  bonus_sack_2p: '2+ Sack Bonus',
  bonus_tkl_10p: '10+ Tackle Bonus',
  idp_pass_def_3p: '3+ Pass Def Bonus',
  fgm: 'FG Made',
  fgm_0_19: 'FG 0-19',
  fgm_20_29: 'FG 20-29',
  fgm_30_39: 'FG 30-39',
  fgm_40_49: 'FG 40-49',
  fgm_50_59: 'FG 50-59',
  fgm_60p: 'FG 60+',
  fgmiss: 'FG Missed',
  fgmiss_0_19: 'FG Miss 0-19',
  fgmiss_20_29: 'FG Miss 20-29',
  fgmiss_30_39: 'FG Miss 30-39',
  fgmiss_40_49: 'FG Miss 40-49',
  fgmiss_50_59: 'FG Miss 50-59',
  fgmiss_60p: 'FG Miss 60+',
  xpm: 'XP Made',
  xpmiss: 'XP Missed',
  fgm_yds: 'FG Yards',
  fgm_yds_over_30: 'FG Yards Over 30',
  def_td: 'DST TD',
  def_2pt: 'DST 2-Pt',
  def_3_and_out: '3-and-Out',
  def_4_and_stop: '4th Down Stop',
  def_forced_punts: 'Forced Punt',
  def_pass_def: 'DST Pass Deflection',
  def_st_tkl_solo: 'DST ST Tackle',
  def_kr_yd: 'DST Kick Return Yards',
  def_pr_yd: 'DST Punt Return Yards',
  sack: 'DST Sack',
  sack_yd: 'DST Sack Yards',
  int: 'DST INT',
  int_ret_yd: 'DST INT Return Yards',
  safe: 'DST Safety',
  tkl: 'DST Tackle',
  tkl_solo: 'DST Solo Tackle',
  tkl_ast: 'DST Assisted Tackle',
  tkl_loss: 'DST Tackle for Loss',
  qb_hit: 'DST QB Hit',
  pts_allow: 'Points Allowed',
  pts_allow_0: 'Shutout',
  pts_allow_1_6: '1-6 Points Allowed',
  pts_allow_7_13: '7-13 Points Allowed',
  pts_allow_14_20: '14-20 Points Allowed',
  pts_allow_21_27: '21-27 Points Allowed',
  pts_allow_28_34: '28-34 Points Allowed',
  pts_allow_35p: '35+ Points Allowed',
  yds_allow: 'Yards Allowed',
  yds_allow_0_100: '0-100 Yards Allowed',
  yds_allow_100_199: '100-199 Yards Allowed',
  yds_allow_200_299: '200-299 Yards Allowed',
  yds_allow_300_349: '300-349 Yards Allowed',
  yds_allow_350_399: '350-399 Yards Allowed',
  yds_allow_400_449: '400-449 Yards Allowed',
  yds_allow_450_499: '450-499 Yards Allowed',
  yds_allow_500_549: '500-549 Yards Allowed',
  yds_allow_550p: '550+ Yards Allowed',
};

const FANTASY_SHORT_LABELS = {
  pass_yd: 'PaYd',
  pass_td: 'PaTD',
  pass_int: 'INT',
  pass_int_td: 'Pick6',
  pass_2pt: 'Pa2',
  pass_sack: 'SkT',
  pass_cmp: 'Cmp',
  pass_att: 'PaAtt',
  pass_inc: 'Inc',
  pass_fd: 'PaFD',
  rush_yd: 'RuYd',
  rush_td: 'RuTD',
  rush_2pt: 'Ru2',
  rush_fd: 'RuFD',
  rec: 'Rec',
  rec_yd: 'ReYd',
  rec_td: 'ReTD',
  rec_2pt: 'Re2',
  rec_fd: 'ReFD',
  rec_0_4: 'R0-4',
  rec_5_9: 'R5-9',
  rec_10_19: 'R10',
  rec_20_29: 'R20',
  rec_30_39: 'R30',
  fum: 'Fum',
  fum_lost: 'FL',
  fum_rec: 'FR',
  fum_ret_td: 'FRTD',
  st_td: 'STTD',
  ret_td: 'RetTD',
  blk_kick: 'Blk',
  kr_yd: 'KRYd',
  pr_yd: 'PRYd',
  st_tkl_solo: 'STTk',
  blk_kick_ret_yd: 'BKRYd',
  fg_ret_yd: 'FGRYd',
  fum_ret_yd: 'FRYd',
  bonus_rec_te: 'TE+',
  bonus_rec_rb: 'RB+',
  bonus_rec_wr: 'WR+',
  bonus_rush_att: 'Car+',
  bonus_fd_qb: 'QBFD+',
  bonus_fd_rb: 'RBFD+',
  bonus_fd_wr: 'WRFD+',
  bonus_fd_te: 'TEFD+',
  bonus_pass_yd_300: '300P',
  bonus_pass_yd_400: '400P',
  bonus_rush_yd_100: '100R',
  bonus_rush_yd_200: '200R',
  bonus_rec_yd_100: '100C',
  bonus_rec_yd_200: '200C',
  bonus_rush_rec_yd_100: '100Scr',
  bonus_rush_rec_yd_200: '200Scr',
  bonus_pass_cmp_25: '25Cmp',
  bonus_rush_att_20: '20Car',
  bonus_pass_td_40p: '40PTD',
  bonus_pass_td_50p: '50PTD',
  bonus_pass_cmp_40p: '40Cmp',
  bonus_rush_td_40p: '40RTD',
  bonus_rush_td_50p: '50RTD',
  bonus_rec_td_40p: '40CTD',
  bonus_rec_td_50p: '50CTD',
  bonus_rec_40p: '40Rec',
  bonus_rush_40p: '40Ru',
  bonus_def_fum_td_50p: '50Fum',
  bonus_def_int_td_50p: '50INT',
  idp_tkl: 'Tkl',
  idp_tkl_solo: 'Solo',
  idp_tkl_ast: 'Ast',
  idp_tkl_loss: 'TFL',
  idp_sack: 'Sack',
  idp_sack_yd: 'SkYd',
  idp_int: 'DINT',
  idp_int_ret_yd: 'IRYd',
  idp_int_td: 'INTTD',
  idp_ff: 'FF',
  idp_fr: 'FR',
  idp_fr_yd: 'FRYd',
  idp_fr_td: 'FRTD',
  idp_def_td: 'DefTD',
  idp_pd: 'PD',
  idp_qbhit: 'QBH',
  idp_safety: 'Saf',
  idp_blk_kick: 'Blk',
  bonus_sack_2p: '2Sk+',
  bonus_tkl_10p: '10Tk+',
  idp_pass_def_3p: '3PD+',
  fgm: 'FG',
  fgm_0_19: 'FG19',
  fgm_20_29: 'FG20',
  fgm_30_39: 'FG30',
  fgm_40_49: 'FG40',
  fgm_50_59: 'FG50',
  fgm_60p: 'FG60',
  fgmiss: 'FGM',
  fgmiss_0_19: 'Miss19',
  fgmiss_20_29: 'Miss20',
  fgmiss_30_39: 'Miss30',
  fgmiss_40_49: 'Miss40',
  fgmiss_50_59: 'Miss50',
  fgmiss_60p: 'Miss60',
  xpm: 'XP',
  xpmiss: 'XPM',
  fgm_yds: 'FGYd',
  fgm_yds_over_30: 'FG30+',
  def_td: 'DSTTD',
  def_2pt: 'DST2',
  def_3_and_out: '3Out',
  def_4_and_stop: '4Stop',
  def_forced_punts: 'Punt',
  def_pass_def: 'DPD',
  def_st_tkl_solo: 'DSTTk',
  def_kr_yd: 'DKRYd',
  def_pr_yd: 'DPRYd',
  sack: 'DSack',
  sack_yd: 'DSkYd',
  int: 'DINT',
  int_ret_yd: 'DIRYd',
  safe: 'DSaf',
  tkl: 'DTkl',
  tkl_solo: 'DSolo',
  tkl_ast: 'DAst',
  tkl_loss: 'DTFL',
  qb_hit: 'DQBH',
  pts_allow: 'PA',
  pts_allow_0: 'PA0',
  pts_allow_1_6: 'PA1',
  pts_allow_7_13: 'PA7',
  pts_allow_14_20: 'PA14',
  pts_allow_21_27: 'PA21',
  pts_allow_28_34: 'PA28',
  pts_allow_35p: 'PA35',
  yds_allow: 'YA',
  yds_allow_0_100: 'YA100',
  yds_allow_100_199: 'YA199',
  yds_allow_200_299: 'YA299',
  yds_allow_300_349: 'YA349',
  yds_allow_350_399: 'YA399',
  yds_allow_400_449: 'YA449',
  yds_allow_450_499: 'YA499',
  yds_allow_500_549: 'YA549',
  yds_allow_550p: 'YA550',
};

const FANTASY_HEADER_LABELS = {
  pass_yd: ['Pass', 'Yards'],
  pass_td: ['Pass', 'TD'],
  pass_int: ['Pass', 'INT'],
  pass_int_td: ['Pick 6', 'Thrown'],
  pass_2pt: ['Pass', '2-Pt'],
  pass_sack: ['Sack', 'Taken'],
  pass_cmp: ['Pass', 'Cmp'],
  pass_att: ['Pass', 'Att'],
  pass_inc: ['Pass', 'Inc'],
  pass_fd: ['Pass', '1st Down'],
  rush_yd: ['Rush', 'Yards'],
  rush_td: ['Rush', 'TD'],
  rush_2pt: ['Rush', '2-Pt'],
  rush_fd: ['Rush', '1st Down'],
  rec: ['Rec', null],
  rec_yd: ['Rec', 'Yards'],
  rec_td: ['Rec', 'TD'],
  rec_2pt: ['Rec', '2-Pt'],
  rec_fd: ['Rec', '1st Down'],
  fum_lost: ['Fumble', 'Lost'],
  bonus_rec_te: ['TE Rec', 'Bonus'],
  bonus_rec_rb: ['RB Rec', 'Bonus'],
  bonus_rec_wr: ['WR Rec', 'Bonus'],
  bonus_rush_att: ['Carry', 'Bonus'],
  bonus_fd_qb: ['QB 1st', 'Bonus'],
  bonus_fd_rb: ['RB 1st', 'Bonus'],
  bonus_fd_wr: ['WR 1st', 'Bonus'],
  bonus_fd_te: ['TE 1st', 'Bonus'],
  bonus_pass_yd_300: ['300 Pass', 'Bonus'],
  bonus_pass_yd_400: ['400 Pass', 'Bonus'],
  bonus_rush_yd_100: ['100 Rush', 'Bonus'],
  bonus_rush_yd_200: ['200 Rush', 'Bonus'],
  bonus_rec_yd_100: ['100 Rec', 'Bonus'],
  bonus_rec_yd_200: ['200 Rec', 'Bonus'],
  bonus_rush_rec_yd_100: ['100 Scrim', 'Bonus'],
  bonus_rush_rec_yd_200: ['200 Scrim', 'Bonus'],
  bonus_pass_cmp_25: ['25 Cmp', 'Bonus'],
  bonus_rush_att_20: ['20 Carry', 'Bonus'],
  bonus_pass_td_40p: ['40 Pass TD', 'Bonus'],
  bonus_pass_td_50p: ['50 Pass TD', 'Bonus'],
  bonus_pass_cmp_40p: ['40 Cmp', 'Bonus'],
  bonus_rush_td_40p: ['40 Rush TD', 'Bonus'],
  bonus_rush_td_50p: ['50 Rush TD', 'Bonus'],
  bonus_rec_td_40p: ['40 Rec TD', 'Bonus'],
  bonus_rec_td_50p: ['50 Rec TD', 'Bonus'],
  bonus_rec_40p: ['40 Rec', 'Bonus'],
  bonus_rush_40p: ['40 Rush', 'Bonus'],
  idp_tkl_solo: ['Solo', 'Tackle'],
  idp_tkl_ast: ['Assist', 'Tackle'],
  idp_tkl_loss: ['Tackle', 'Loss'],
  idp_sack_yd: ['Sack', 'Yards'],
  idp_int: ['Def', 'INT'],
  idp_int_ret_yd: ['INT Ret', 'Yards'],
  idp_int_td: ['INT Ret', 'TD'],
  idp_ff: ['Forced', 'Fumble'],
  idp_fr: ['Fumble', 'Rec'],
  idp_fr_yd: ['Fumble Ret', 'Yards'],
  idp_fr_td: ['Fumble Ret', 'TD'],
  idp_def_td: ['Defense', 'TD'],
  idp_pd: ['Pass', 'Deflection'],
  idp_qbhit: ['QB', 'Hit'],
  bonus_sack_2p: ['2+ Sack', 'Bonus'],
  bonus_tkl_10p: ['10+ Tackle', 'Bonus'],
  idp_pass_def_3p: ['3+ PD', 'Bonus'],
  fgm: ['FG', 'Made'],
  fgmiss: ['FG', 'Missed'],
  xpm: ['XP', 'Made'],
  xpmiss: ['XP', 'Missed'],
  fgm_yds: ['FG', 'Yards'],
  fgm_yds_over_30: ['FG Yards', 'Over 30'],
  def_td: ['DST', 'TD'],
  def_2pt: ['DST', '2-Pt'],
  def_3_and_out: ['3-and-Out', null],
  def_4_and_stop: ['4th Down', 'Stop'],
  def_forced_punts: ['Forced', 'Punt'],
  def_pass_def: ['DST Pass', 'Deflection'],
  sack: ['DST', 'Sack'],
  sack_yd: ['DST Sack', 'Yards'],
  int: ['DST', 'INT'],
  int_ret_yd: ['DST INT', 'Ret Yards'],
  safe: ['DST', 'Safety'],
  pts_allow: ['Points', 'Allowed'],
  yds_allow: ['Yards', 'Allowed'],
};

const GAME_STAT_HEADER_LABELS = {
  passingAttempts: ['Pass', 'Att'],
  completions: ['Pass', 'Cmp'],
  passingYards: ['Pass', 'Yds'],
  rushingYards: ['Rush', 'Yds'],
  passingTouchdowns: ['Pass', 'TD'],
  rushingTouchdowns: ['Rush', 'TD'],
  receivingTouchdowns: ['Rec', 'TD'],
  interceptions: ['INT', null],
  QBRating: ['Passer', 'Rating'],
  completionPct: ['Cmp', '%'],
  sacks: ['Sacks', null],
  fumbles: ['Fum', null],
  rushingAttempts: ['Rush', 'Att'],
  receptions: ['Rec', null],
  receivingYards: ['Rec', 'Yds'],
  yardsPerRushAttempt: ['Yds', 'Carry'],
  receivingYardsAfterCatch: ['YAC', null],
  receivingTargets: ['Targets', null],
  yardsPerReception: ['Yds', 'Rec'],
  totalTackles: ['Total', 'Tkl'],
  soloTackles: ['Solo', 'Tkl'],
  tacklesForLoss: ['Tkl', 'Loss'],
  QBHits: ['QB', 'Hits'],
  fumblesForced: ['Forced', 'Fum'],
  passesDefended: ['Passes', 'Def'],
  fieldGoalsMade: ['FG', 'Made'],
  fieldGoalAttempts: ['FG', 'Att'],
  longFieldGoalMade: ['Long', 'FG'],
  extraPointsMade: ['XP', 'Made'],
  extraPointAttempts: ['XP', 'Att'],
  punts: ['Punts', null],
  grossAvgPuntYards: ['Gross', 'Avg'],
  netAvgPuntYards: ['Net', 'Avg'],
  puntsInside20: ['Inside', '20'],
  puntYards: ['Punt', 'Yds'],
  longPunt: ['Long', 'Punt'],
};

const GAME_STAT_EXTRA_ORDER = [
  'passingAttempts',
  'completions',
  'completionPct',
  'passingYards',
  'passingTouchdowns',
  'QBRating',
  'totalQBR',
  'yardsPerPassAttempt',
  'yardsPerCompletion',
  'interceptions',
  'interceptionPct',
  'sacks',
  'sackYardsLost',
  'passingBigPlays',
  'passingFirstDowns',
  'passingYardsAfterCatch',
  'passingYardsAtCatch',
  'longPassing',
  'passingYardsPerGame',
  'rushingAttempts',
  'rushingYards',
  'yardsPerRushAttempt',
  'rushingTouchdowns',
  'rushingFirstDowns',
  'rushing20PlusYds',
  'longRushing',
  'rushingYardsPerGame',
  'receivingTargets',
  'receptions',
  'receivingYards',
  'yardsPerReception',
  'receivingTouchdowns',
  'longReception',
  'receivingYardsAfterCatch',
  'receiving20PlusYds',
  'receivingFirstDowns',
  'receivingYardsAtCatch',
  'receivingYardsPerGame',
  'yardsFromScrimmagePerGame',
  'totalYardsFromScrimmage',
  'fumbles',
  'fumblesLost',
  'totalTackles',
  'soloTackles',
  'tacklesForLoss',
  'sacks',
  'QBHits',
  'hurries',
  'sackYards',
  'fumblesForced',
  'passesDefended',
  'interceptionTouchdowns',
  'interceptionYards',
  'longInterception',
  'fieldGoalsMade',
  'fieldGoalAttempts',
  'fieldGoalPct',
  'longFieldGoalMade',
  'extraPointsMade',
  'extraPointAttempts',
  'extraPointPct',
  'totalKickingPoints',
  'fieldGoalsMade50',
  'fieldGoalAttempts50',
  'fieldGoalsMade50_59',
  'longFieldGoalAttempt',
  'punts',
  'puntYards',
  'grossAvgPuntYards',
  'netAvgPuntYards',
  'puntsInside20',
  'touchbacks',
  'longPunt',
  'puntsInside10',
  'puntsBlocked',
  'touchbackPct',
  'puntsInside10Pct',
  'puntsInside20Pct',
];

const GAME_STAT_EXTRA_ORDER_INDEX = new Map(GAME_STAT_EXTRA_ORDER.map((key, index) => [key, index]));
const COMPACT_GAME_IDENTITY_WIDTHS = [88, 48, 70, 132];
const MOBILE_COMPACT_GAME_IDENTITY_WIDTHS = [30, 38, 64, 64];
const COMPACT_GAME_STAT_WIDTH = 54;
const MOBILE_COMPACT_GAME_STAT_WIDTH = 48;
const EXPANDED_GAME_IDENTITY_WIDTHS = [96, 52, 76, 132];
const EXPANDED_GAME_STAT_WIDTH = 88;

function getCompactGameLogSizing(width) {
  const isMobile = width < 640;
  const identityWidths = isMobile ? MOBILE_COMPACT_GAME_IDENTITY_WIDTHS : COMPACT_GAME_IDENTITY_WIDTHS;
  const identityWidth = isMobile
    ? identityWidths.reduce((sum, colWidth) => sum + colWidth, 0)
    : width * 0.26;

  return {
    identityWidths,
    identityWidth,
    statWidth: isMobile ? MOBILE_COMPACT_GAME_STAT_WIDTH : COMPACT_GAME_STAT_WIDTH,
  };
}

function getFantasyHeaderLabel(key, label) {
  if (FANTASY_HEADER_LABELS[key]) return FANTASY_HEADER_LABELS[key];
  const fallback = label || FANTASY_SHORT_LABELS[key] || humanizeScoringKey(key);
  const normalized = fallback.replace(/\s+Bonus$/, '');

  if (fallback.endsWith(' Bonus')) {
    return [
      normalized.replace(/\bYd\b/g, 'Yds').replace(/\bReception\b/g, 'Rec'),
      'Bonus',
    ];
  }

  const parts = fallback.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [fallback, null];
  if (parts.length === 2) return [parts[0], parts[1]];
  return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')];
}

function getGameStatHeaderLabel(key, label) {
  if (GAME_STAT_HEADER_LABELS[key]) return GAME_STAT_HEADER_LABELS[key];
  return splitHeaderLabel(label);
}

function splitHeaderLabel(label) {
  const fallback = String(label || '').trim();
  if (!fallback) return ['Stat', null];
  const compact = fallback
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bTouchdowns?\b/g, 'TD')
    .replace(/\bAttempts?\b/g, 'Att')
    .replace(/\bCompletions?\b/g, 'Cmp')
    .replace(/\bInterceptions?\b/g, 'INT')
    .replace(/\bReceiving\b/g, 'Rec')
    .replace(/\bRushing\b/g, 'Rush')
    .replace(/\bPassing\b/g, 'Pass')
    .replace(/\bYards\b/g, 'Yds')
    .replace(/\bTackles?\b/g, 'Tkl')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = compact.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [compact, null];
  if (parts.length === 2) return [parts[0], parts[1]];
  return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')];
}

function humanizeScoringKey(key) {
  return String(key)
    .replace(/^bonus_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roundPoints(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatFantasyValue(value) {
  if (!Number.isFinite(value) || Math.abs(value) < POINT_EPSILON) return '--';
  return roundPoints(value).toFixed(2);
}

function compareNullableValues(left, right, direction) {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';

  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const comparison = Number(left) - Number(right);
  return direction === 'desc' ? comparison * -1 : comparison;
}

function getGameLogStatSortValue(game, col, fantasyOnly, scoringSettings, position, sleeperWeekByWeek) {
  if (fantasyOnly) {
    if (col.key === FANTASY_TOTAL_POINTS_KEY) {
      return getGameLogFantasyTotalPoints(game, sleeperWeekByWeek, scoringSettings, position);
    }

    const rows = buildGameLogFantasyOptionRows(game, sleeperWeekByWeek, scoringSettings, position);
    return rows.find((row) => row.key === col.key)?.points ?? null;
  }

  const entry = getGameStatEntry(game?.statsJson, col.key);
  return numericStatValue(entry?.value ?? entry?.displayValue);
}

function buildAttainedGameLogColumns(gameLog, presetColumns = []) {
  const columnByKey = new Map();
  const attainedKeys = new Set();

  for (const game of gameLog ?? []) {
    const categories = game?.statsJson?.splits?.categories ?? [];
    for (const category of categories) {
      for (const stat of (category.stats ?? [])) {
        const key = stat.name;
        if (!key) continue;
        const numericValue = numericStatValue(stat.value ?? stat.displayValue);
        if (numericValue === null || Math.abs(numericValue) < POINT_EPSILON) continue;
        attainedKeys.add(key);

        if (!columnByKey.has(key)) {
          const label = stat.displayName || stat.shortDisplayName || humanizeScoringKey(key);
          columnByKey.set(key, {
            key,
            label,
            title: label,
            headerLabel: getGameStatHeaderLabel(key, label),
          });
        }
      }
    }
  }

  const ordered = [];
  for (const col of presetColumns) {
    if (!attainedKeys.has(col.key)) continue;
    const apiColumn = columnByKey.get(col.key);
    ordered.push({
      ...col,
      title: apiColumn?.title ?? col.label,
      headerLabel: getGameStatHeaderLabel(col.key, apiColumn?.title ?? col.label),
    });
    columnByKey.delete(col.key);
  }

  const extras = [...columnByKey.values()].sort((left, right) => {
    const leftIndex = GAME_STAT_EXTRA_ORDER_INDEX.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = GAME_STAT_EXTRA_ORDER_INDEX.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || String(left.title ?? left.label).localeCompare(String(right.title ?? right.label));
  });

  return [...ordered, ...extras];
}

function useVisibleGameStatColumnCount(containerRef, columnCount, enabled) {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    if (!enabled || columnCount <= 0) return undefined;

    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;

    let frameId = null;
    const updateVisibleCount = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const width = element.getBoundingClientRect().width;
        const { identityWidth, statWidth } = getCompactGameLogSizing(width);
        const available = Math.max(0, width - identityWidth);
        const nextCount = Math.max(1, Math.min(columnCount, Math.floor(available / statWidth)));
        setVisibleCount(nextCount);
      });
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(element);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [columnCount, containerRef, enabled]);

  if (!enabled) return columnCount;
  if (columnCount <= 0) return 0;
  return Math.max(1, Math.min(columnCount, visibleCount));
}

function addFantasyRow(rows, { key, label, statVal, multiplier }) {
  const numericStat = Number(statVal);
  const numericMultiplier = Number(multiplier);
  if (!Number.isFinite(numericStat) || !Number.isFinite(numericMultiplier)) return;
  if (numericStat === 0 || numericMultiplier === 0) return;
  const points = numericStat * numericMultiplier;
  if (Math.abs(points) < POINT_EPSILON) return;
  rows.push({ key, label, points });
}

const BASE_FANTASY_OPTIONS = Object.values(Object.entries(STAT_TO_SCORING_KEY).reduce((acc, [statKey, scoringKey]) => {
  if (!acc[scoringKey]) {
    acc[scoringKey] = {
      key: scoringKey,
      label: STAT_LABELS[scoringKey] ?? STAT_LABELS[statKey] ?? humanizeScoringKey(scoringKey),
      statKeys: [],
    };
  }
  acc[scoringKey].statKeys.push(statKey);
  return acc;
}, {}));

const POSITION_FANTASY_OPTIONS = [
  { key: 'bonus_rec_te', label: STAT_LABELS.bonus_rec_te, positions: ['TE'], statKeys: ['rec'] },
  { key: 'bonus_rec_rb', label: STAT_LABELS.bonus_rec_rb, positions: ['RB'], statKeys: ['rec'] },
  { key: 'bonus_rec_wr', label: STAT_LABELS.bonus_rec_wr, positions: ['WR'], statKeys: ['rec'] },
  { key: 'bonus_rush_att', label: STAT_LABELS.bonus_rush_att, positions: ['RB'], statKeys: ['rush_att'] },
  { key: 'bonus_fd_qb', label: STAT_LABELS.bonus_fd_qb, positions: ['QB'], statKeys: ['pass_fd', 'rush_fd'] },
  { key: 'bonus_fd_rb', label: STAT_LABELS.bonus_fd_rb, positions: ['RB'], statKeys: ['rush_fd', 'rec_fd'] },
  { key: 'bonus_fd_wr', label: STAT_LABELS.bonus_fd_wr, positions: ['WR'], statKeys: ['rec_fd'] },
  { key: 'bonus_fd_te', label: STAT_LABELS.bonus_fd_te, positions: ['TE'], statKeys: ['rec_fd'] },
];

const FANTASY_OPTIONS = [...BASE_FANTASY_OPTIONS, ...POSITION_FANTASY_OPTIONS];

const PASSING_FANTASY_KEYS = [
  'pass_cmp',
  'pass_att',
  'pass_inc',
  'pass_yd',
  'pass_td',
  'pass_2pt',
  'pass_fd',
  'bonus_fd_qb',
  'bonus_pass_cmp_25',
  'bonus_pass_yd_300',
  'bonus_pass_yd_400',
  'bonus_pass_td_40p',
  'bonus_pass_td_50p',
  'bonus_pass_cmp_40p',
];

const QB_NEGATIVE_FANTASY_KEYS = ['pass_int', 'pass_int_td', 'pass_sack', 'fum', 'fum_lost'];

const RUSHING_FANTASY_KEYS = [
  'rush_yd',
  'rush_td',
  'rush_2pt',
  'rush_fd',
  'bonus_rush_att',
  'bonus_fd_rb',
  'bonus_rush_att_20',
  'bonus_rush_yd_100',
  'bonus_rush_yd_200',
  'bonus_rush_td_40p',
  'bonus_rush_td_50p',
  'bonus_rush_40p',
];

const RECEIVING_FANTASY_KEYS = [
  'rec',
  'rec_yd',
  'rec_td',
  'rec_2pt',
  'rec_fd',
  'bonus_rec_te',
  'bonus_rec_rb',
  'bonus_rec_wr',
  'bonus_fd_wr',
  'bonus_fd_te',
  'rec_0_4',
  'rec_5_9',
  'rec_10_19',
  'rec_20_29',
  'rec_30_39',
  'bonus_rec_yd_100',
  'bonus_rec_yd_200',
  'bonus_rec_td_40p',
  'bonus_rec_td_50p',
  'bonus_rec_40p',
];

const SCRIMMAGE_BONUS_FANTASY_KEYS = ['bonus_rush_rec_yd_100', 'bonus_rush_rec_yd_200'];
const MISC_FANTASY_KEYS = [
  'fum',
  'fum_lost',
  'fum_rec',
  'fum_ret_td',
  'st_td',
  'ret_td',
  'blk_kick',
  'kr_yd',
  'pr_yd',
  'st_tkl_solo',
  'blk_kick_ret_yd',
  'fg_ret_yd',
  'fum_ret_yd',
  ...SCRIMMAGE_BONUS_FANTASY_KEYS,
];

const IDP_TACKLING_FANTASY_KEYS = ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'bonus_tkl_10p'];
const IDP_PASS_RUSH_FANTASY_KEYS = ['idp_sack', 'idp_sack_yd', 'idp_qbhit', 'idp_ff', 'bonus_sack_2p'];
const IDP_COVERAGE_FANTASY_KEYS = ['idp_int', 'idp_int_ret_yd', 'idp_int_td', 'idp_pd', 'idp_pass_def_3p'];
const IDP_SCORING_FANTASY_KEYS = [
  'idp_fr',
  'idp_fr_yd',
  'idp_fr_td',
  'idp_def_td',
  'idp_safety',
  'idp_blk_kick',
  'bonus_def_fum_td_50p',
  'bonus_def_int_td_50p',
];

const FIELD_GOAL_FANTASY_KEYS = [
  'fgm',
  'fgm_0_19',
  'fgm_20_29',
  'fgm_30_39',
  'fgm_40_49',
  'fgm_50_59',
  'fgm_60p',
  'fgm_yds',
  'fgm_yds_over_30',
  'fgmiss',
  'fgmiss_0_19',
  'fgmiss_20_29',
  'fgmiss_30_39',
  'fgmiss_40_49',
  'fgmiss_50_59',
  'fgmiss_60p',
];
const EXTRA_POINT_FANTASY_KEYS = ['xpm', 'xpmiss'];

const DST_SCORING_FANTASY_KEYS = ['def_td', 'def_2pt', 'safe'];
const DST_PASS_RUSH_FANTASY_KEYS = ['sack', 'sack_yd', 'qb_hit', 'tkl_loss'];
const DST_TURNOVER_FANTASY_KEYS = ['int', 'int_ret_yd', 'def_pass_def', 'def_3_and_out', 'def_4_and_stop', 'def_forced_punts'];
const DST_TACKLING_FANTASY_KEYS = ['tkl', 'tkl_solo', 'tkl_ast'];
const DST_RETURN_FANTASY_KEYS = ['def_st_tkl_solo', 'def_kr_yd', 'def_pr_yd'];
const DST_POINTS_ALLOWED_FANTASY_KEYS = ['pts_allow', 'pts_allow_0', 'pts_allow_1_6', 'pts_allow_7_13', 'pts_allow_14_20', 'pts_allow_21_27', 'pts_allow_28_34', 'pts_allow_35p'];
const DST_YARDS_ALLOWED_FANTASY_KEYS = ['yds_allow', 'yds_allow_0_100', 'yds_allow_100_199', 'yds_allow_200_299', 'yds_allow_300_349', 'yds_allow_350_399', 'yds_allow_400_449', 'yds_allow_450_499', 'yds_allow_500_549', 'yds_allow_550p'];

const GENERIC_FANTASY_SECTIONS = [
  { heading: 'Passing', keys: [...PASSING_FANTASY_KEYS, ...QB_NEGATIVE_FANTASY_KEYS] },
  { heading: 'Rushing', keys: RUSHING_FANTASY_KEYS },
  { heading: 'Receiving', keys: [...RECEIVING_FANTASY_KEYS, 'bonus_fd_rb'] },
  { heading: 'Miscellaneous', keys: MISC_FANTASY_KEYS },
  { heading: 'Tackling', keys: IDP_TACKLING_FANTASY_KEYS },
  { heading: 'Pass Rush', keys: IDP_PASS_RUSH_FANTASY_KEYS },
  { heading: 'Coverage', keys: IDP_COVERAGE_FANTASY_KEYS },
  { heading: 'Defensive Scoring', keys: IDP_SCORING_FANTASY_KEYS },
  { heading: 'Field Goals', keys: FIELD_GOAL_FANTASY_KEYS },
  { heading: 'Extra Points', keys: EXTRA_POINT_FANTASY_KEYS },
  { heading: 'Team Defense', keys: [...DST_SCORING_FANTASY_KEYS, ...DST_PASS_RUSH_FANTASY_KEYS, ...DST_TURNOVER_FANTASY_KEYS, ...DST_TACKLING_FANTASY_KEYS, ...DST_RETURN_FANTASY_KEYS, ...DST_POINTS_ALLOWED_FANTASY_KEYS, ...DST_YARDS_ALLOWED_FANTASY_KEYS] },
];

function getFantasySectionDefinitions(position) {
  const rawPosition = (position ?? '').toUpperCase();
  if (['DEF', 'DST', 'D/ST'].includes(rawPosition)) {
    return [
      { heading: 'Scoring', keys: DST_SCORING_FANTASY_KEYS },
      { heading: 'Pass Rush', keys: DST_PASS_RUSH_FANTASY_KEYS },
      { heading: 'Turnovers', keys: DST_TURNOVER_FANTASY_KEYS },
      { heading: 'Tackling', keys: DST_TACKLING_FANTASY_KEYS },
      { heading: 'Returns', keys: DST_RETURN_FANTASY_KEYS },
      { heading: 'Points Allowed', keys: DST_POINTS_ALLOWED_FANTASY_KEYS },
      { heading: 'Yards Allowed', keys: DST_YARDS_ALLOWED_FANTASY_KEYS },
    ];
  }

  switch (positionGroup(position)) {
    case 'QB':
      return [
        { heading: 'Passing', keys: PASSING_FANTASY_KEYS },
        { heading: 'Rushing', keys: RUSHING_FANTASY_KEYS },
        { heading: 'Negative Plays', keys: QB_NEGATIVE_FANTASY_KEYS },
        { heading: 'Miscellaneous', keys: MISC_FANTASY_KEYS },
      ];
    case 'RB':
      return [
        { heading: 'Rushing', keys: RUSHING_FANTASY_KEYS },
        { heading: 'Receiving', keys: [...RECEIVING_FANTASY_KEYS, 'bonus_fd_rb'] },
        { heading: 'Miscellaneous', keys: MISC_FANTASY_KEYS },
      ];
    case 'WR':
    case 'TE':
      return [
        { heading: 'Receiving', keys: RECEIVING_FANTASY_KEYS },
        { heading: 'Rushing', keys: RUSHING_FANTASY_KEYS },
        { heading: 'Miscellaneous', keys: MISC_FANTASY_KEYS },
      ];
    case 'DL':
      return [
        { heading: 'Tackling', keys: IDP_TACKLING_FANTASY_KEYS },
        { heading: 'Pass Rush', keys: IDP_PASS_RUSH_FANTASY_KEYS },
        { heading: 'Defensive Scoring', keys: [...IDP_COVERAGE_FANTASY_KEYS, ...IDP_SCORING_FANTASY_KEYS] },
      ];
    case 'LB':
      return [
        { heading: 'Tackling', keys: IDP_TACKLING_FANTASY_KEYS },
        { heading: 'Pass Rush', keys: IDP_PASS_RUSH_FANTASY_KEYS },
        { heading: 'Coverage', keys: IDP_COVERAGE_FANTASY_KEYS },
        { heading: 'Defensive Scoring', keys: IDP_SCORING_FANTASY_KEYS },
      ];
    case 'DB':
      return [
        { heading: 'Tackling', keys: IDP_TACKLING_FANTASY_KEYS },
        { heading: 'Coverage', keys: IDP_COVERAGE_FANTASY_KEYS },
        { heading: 'Pass Rush', keys: IDP_PASS_RUSH_FANTASY_KEYS },
        { heading: 'Defensive Scoring', keys: IDP_SCORING_FANTASY_KEYS },
      ];
    case 'K':
      return [
        { heading: 'Field Goals', keys: FIELD_GOAL_FANTASY_KEYS },
        { heading: 'Extra Points', keys: EXTRA_POINT_FANTASY_KEYS },
      ];
    default:
      return GENERIC_FANTASY_SECTIONS;
  }
}

function buildFantasyValueSectionsFromRows(rowByKey, position) {
  const usedKeys = new Set();
  const sections = getFantasySectionDefinitions(position)
    .map(({ heading, keys }) => {
      const rows = keys
        .map((key) => rowByKey.get(key))
        .filter((row) => row && !usedKeys.has(row.key));
      rows.forEach((row) => usedKeys.add(row.key));
      return rows.length > 0 ? { heading, rows } : null;
    })
    .filter(Boolean);

  const fallbackRows = FANTASY_OPTIONS
    .map(({ key }) => rowByKey.get(key))
    .filter((row) => row && !usedKeys.has(row.key));

  if (fallbackRows.length > 0) {
    sections.push({ heading: 'Other', rows: fallbackRows });
  }

  return sections;
}

function getStatTotal(entry, statKeys) {
  return statKeys.reduce((sum, key) => sum + (Number(entry?.[key]) || 0), 0);
}

function buildFantasyOptionRows(weekEntry, scoringSettings, position) {
  if (!weekEntry || !scoringSettings) return [];
  const rows = [];

  for (const option of FANTASY_OPTIONS) {
    if (option.positions && !option.positions.includes(position)) continue;
    addFantasyRow(rows, {
      key: option.key,
      label: option.label,
      statVal: getStatTotal(weekEntry, option.statKeys),
      multiplier: scoringSettings[option.key] ?? 0,
    });
  }

  return rows;
}

function getNumericStat(statsMap, ...keys) {
  for (const key of keys) {
    if (!key) continue;
    const value = Number(statsMap?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function setNumericStat(target, key, value) {
  if (!Number.isFinite(value)) return;
  target[key] = value;
}

function setThresholdStat(target, key, value, threshold) {
  if (!Number.isFinite(value)) return;
  target[key] = value >= threshold ? 1 : 0;
}

function buildSleeperStatsFromGameLogStats(statsJson, position) {
  if (!statsJson) return null;
  const statsMap = buildStatMap(statsJson);
  const group = positionGroup(position);
  const isIdp = ['DL', 'LB', 'DB'].includes(group);
  const entry = {};

  const passCmp = getNumericStat(statsMap, 'completions', 'passingCompletions');
  const passAtt = getNumericStat(statsMap, 'passingAttempts');
  const passYds = getNumericStat(statsMap, 'passingYards');
  const passTd = getNumericStat(statsMap, 'passingTouchdowns');
  const passInt = getNumericStat(statsMap, 'passingInterceptions', group === 'QB' ? 'interceptions' : null);
  const passSacks = group === 'QB' ? getNumericStat(statsMap, 'sacks') : null;
  const rushAtt = getNumericStat(statsMap, 'rushingAttempts');
  const rushYds = getNumericStat(statsMap, 'rushingYards');
  const rushTd = getNumericStat(statsMap, 'rushingTouchdowns');
  const rec = getNumericStat(statsMap, 'receptions');
  const recYds = getNumericStat(statsMap, 'receivingYards');
  const recTd = getNumericStat(statsMap, 'receivingTouchdowns');
  const scrimmageYds = (rushYds ?? 0) + (recYds ?? 0);

  setNumericStat(entry, 'pass_cmp', passCmp ?? 0);
  setNumericStat(entry, 'pass_att', passAtt ?? 0);
  setNumericStat(entry, 'pass_inc', passAtt != null && passCmp != null ? passAtt - passCmp : 0);
  setNumericStat(entry, 'pass_yd', passYds ?? 0);
  setNumericStat(entry, 'pass_td', passTd ?? 0);
  setNumericStat(entry, 'pass_int', passInt ?? 0);
  setNumericStat(entry, 'pass_sack', passSacks ?? 0);
  setNumericStat(entry, 'pass_fd', getNumericStat(statsMap, 'passingFirstDowns') ?? 0);
  setThresholdStat(entry, 'bonus_pass_cmp_25', passCmp ?? 0, 25);
  setThresholdStat(entry, 'bonus_pass_yd_300', passYds ?? 0, 300);
  setThresholdStat(entry, 'bonus_pass_yd_400', passYds ?? 0, 400);

  setNumericStat(entry, 'rush_att', rushAtt ?? 0);
  setNumericStat(entry, 'rush_yd', rushYds ?? 0);
  setNumericStat(entry, 'rush_td', rushTd ?? 0);
  setNumericStat(entry, 'rush_fd', getNumericStat(statsMap, 'rushingFirstDowns') ?? 0);
  setThresholdStat(entry, 'bonus_rush_att_20', rushAtt ?? 0, 20);
  setThresholdStat(entry, 'bonus_rush_yd_100', rushYds ?? 0, 100);
  setThresholdStat(entry, 'bonus_rush_yd_200', rushYds ?? 0, 200);
  setThresholdStat(entry, 'bonus_rush_rec_yd_100', scrimmageYds, 100);
  setThresholdStat(entry, 'bonus_rush_rec_yd_200', scrimmageYds, 200);

  setNumericStat(entry, 'rec', rec ?? 0);
  setNumericStat(entry, 'rec_yd', recYds ?? 0);
  setNumericStat(entry, 'rec_td', recTd ?? 0);
  setNumericStat(entry, 'rec_fd', getNumericStat(statsMap, 'receivingFirstDowns') ?? 0);
  setThresholdStat(entry, 'bonus_rec_yd_100', recYds ?? 0, 100);
  setThresholdStat(entry, 'bonus_rec_yd_200', recYds ?? 0, 200);

  setNumericStat(entry, 'fum', getNumericStat(statsMap, 'fumbles') ?? 0);
  setNumericStat(entry, 'fum_lost', getNumericStat(statsMap, 'fumblesLost') ?? 0);

  if (isIdp) {
    setNumericStat(entry, 'idp_tkl', getNumericStat(statsMap, 'totalTackles', 'tackles') ?? 0);
    setNumericStat(entry, 'idp_tkl_solo', getNumericStat(statsMap, 'soloTackles') ?? 0);
    setNumericStat(entry, 'idp_tkl_ast', getNumericStat(statsMap, 'assistedTackles') ?? 0);
    setNumericStat(entry, 'idp_tkl_loss', getNumericStat(statsMap, 'tacklesForLoss') ?? 0);
    setNumericStat(entry, 'idp_sack', getNumericStat(statsMap, 'sacks') ?? 0);
    setNumericStat(entry, 'idp_sack_yd', getNumericStat(statsMap, 'sackYards') ?? 0);
    setNumericStat(entry, 'idp_int', getNumericStat(statsMap, 'interceptions') ?? 0);
    setNumericStat(entry, 'idp_int_ret_yd', getNumericStat(statsMap, 'interceptionYards') ?? 0);
    setNumericStat(entry, 'idp_int_td', getNumericStat(statsMap, 'interceptionTouchdowns') ?? 0);
    setNumericStat(entry, 'idp_ff', getNumericStat(statsMap, 'fumblesForced') ?? 0);
    setNumericStat(entry, 'idp_fr', getNumericStat(statsMap, 'fumblesRecovered', 'fumbleRecoveries') ?? 0);
    setNumericStat(entry, 'idp_pd', getNumericStat(statsMap, 'passesDefended') ?? 0);
    setNumericStat(entry, 'idp_qbhit', getNumericStat(statsMap, 'QBHits') ?? 0);
    setThresholdStat(entry, 'bonus_sack_2p', entry.idp_sack ?? 0, 2);
    setThresholdStat(entry, 'bonus_tkl_10p', entry.idp_tkl ?? 0, 10);
    setThresholdStat(entry, 'idp_pass_def_3p', entry.idp_pd ?? 0, 3);
  }

  const fieldGoalsMade = getNumericStat(statsMap, 'fieldGoalsMade') ?? 0;
  const fieldGoalAttempts = getNumericStat(statsMap, 'fieldGoalAttempts') ?? 0;
  const extraPointsMade = getNumericStat(statsMap, 'extraPointsMade') ?? 0;
  const extraPointAttempts = getNumericStat(statsMap, 'extraPointAttempts') ?? 0;
  setNumericStat(entry, 'fgm', fieldGoalsMade);
  setNumericStat(entry, 'fgmiss', Math.max(0, fieldGoalAttempts - fieldGoalsMade));
  setNumericStat(entry, 'fgm_50_59', getNumericStat(statsMap, 'fieldGoalsMade50_59') ?? getNumericStat(statsMap, 'fieldGoalsMade50') ?? 0);
  setNumericStat(entry, 'xpm', extraPointsMade);
  setNumericStat(entry, 'xpmiss', Math.max(0, extraPointAttempts - extraPointsMade));

  return entry;
}

function buildGameLogFantasyOptionRows(game, sleeperWeekByWeek, scoringSettings, position) {
  const weekEntry = getGameLogFantasyWeekEntry(game, sleeperWeekByWeek, position);

  return buildFantasyOptionRows(weekEntry, scoringSettings, position);
}

function getGameLogFantasyWeekEntry(game, sleeperWeekByWeek, position) {
  return game?.meta?.isPostseason
    ? buildSleeperStatsFromGameLogStats(game?.statsJson, position)
    : sleeperWeekByWeek.get(Number(game?.meta?.week));
}

function getGameLogFantasyTotalPoints(game, sleeperWeekByWeek, scoringSettings, position) {
  const weekEntry = getGameLogFantasyWeekEntry(game, sleeperWeekByWeek, position);
  if (!weekEntry || !scoringSettings) return null;
  return calcPoints(weekEntry, scoringSettings, position);
}

function buildFantasyOptionRankMap(seasonStats, sleeperPlayers, scoringSettings) {
  if (!seasonStats || !scoringSettings) return new Map();
  const entriesByKey = new Map();

  for (const [candidateId, totals] of Object.entries(seasonStats)) {
    const candidatePosition = sleeperPlayers?.[candidateId]?.position ?? null;
    for (const row of buildFantasyOptionRows(totals, scoringSettings, candidatePosition)) {
      if (!entriesByKey.has(row.key)) entriesByKey.set(row.key, []);
      entriesByKey.get(row.key).push({ sleeperId: candidateId, points: row.points });
    }
  }

  const ranksByKey = new Map();
  for (const [key, entries] of entriesByKey.entries()) {
    const rankMap = new Map();
    let previousScore = null;
    let previousRank = 0;

    entries
      .sort((a, b) => b.points - a.points)
      .forEach((entry, index) => {
        const roundedScore = roundPoints(entry.points);
        const rank = previousScore != null && roundedScore === previousScore ? previousRank : index + 1;
        rankMap.set(entry.sleeperId, rank);
        previousScore = roundedScore;
        previousRank = rank;
      });

    ranksByKey.set(key, rankMap);
  }

  return ranksByKey;
}

function buildFantasyOptionPositionRankMap(seasonStats, sleeperPlayers, scoringSettings) {
  if (!seasonStats || !sleeperPlayers || !scoringSettings) return new Map();
  const entriesByKeyAndPosition = new Map();

  for (const [candidateId, totals] of Object.entries(seasonStats)) {
    const candidatePosition = positionGroup(sleeperPlayers?.[candidateId]?.position);
    if (candidatePosition === 'OTHER') continue;

    for (const row of buildFantasyOptionRows(totals, scoringSettings, sleeperPlayers[candidateId]?.position)) {
      if (!entriesByKeyAndPosition.has(row.key)) entriesByKeyAndPosition.set(row.key, new Map());
      const entriesByPosition = entriesByKeyAndPosition.get(row.key);
      if (!entriesByPosition.has(candidatePosition)) entriesByPosition.set(candidatePosition, []);
      entriesByPosition.get(candidatePosition).push({ sleeperId: candidateId, points: row.points });
    }
  }

  const ranksByKey = new Map();
  for (const [key, entriesByPosition] of entriesByKeyAndPosition.entries()) {
    const rankMap = new Map();

    for (const [posLabel, entries] of entriesByPosition.entries()) {
      let previousScore = null;
      let previousRank = 0;

      entries
        .sort((a, b) => b.points - a.points)
        .forEach((entry, index) => {
          const roundedScore = roundPoints(entry.points);
          const rank = previousScore != null && roundedScore === previousScore ? previousRank : index + 1;
          rankMap.set(entry.sleeperId, { rank, posLabel });
          previousScore = roundedScore;
          previousRank = rank;
        });
    }

    ranksByKey.set(key, rankMap);
  }

  return ranksByKey;
}

const PlayerStatTable = ({
  year,
  statsJson,
  position,
  sleeperId = null,
  expanded,
  onToggle,
  loading,
  error,
  gameLog,
  gameLogLoading,
  honors = [],
  accentColor,
  displayMode = 'game',
  fantasySeason = null,
  fantasyAvailable = null,
  fantasyScoringSettings = null,
  fantasyWeeklyRows = null,
  fantasyRowsLoading = false,
}) => {
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [highlightColumnHighs, setHighlightColumnHighs] = useState(false);
  const [highlightColumnLows, setHighlightColumnLows] = useState(false);
  const isMobileFantasyLayout = useMediaQuery('(max-width: 1023px)');
  const { hasLeague, activeScoringSettings } = useSleeperLeague();
  const {
    players: sleeperPlayers,
    seasonStats: sleeperSeasonStats,
    weeklyStats: sleeperWeeklyStats,
    statsLoading: sleeperStatsLoading,
    loadSeasonStats,
  } = useSleeperStats();

  const { standard, advanced } = useMemo(() => {
    if (!statsJson) return { standard: [], advanced: [] };
    const map = buildStatMap(statsJson);
    const rankMap = buildRankMap(statsJson);
    const sections = getStatRows(map, position, rankMap);
    return sections;
  }, [position, statsJson]);

  const label = year === 'career' ? 'Career' : `${year} Season`;
  const canShowFantasyValue = (fantasyAvailable ?? (String(year) === String(fantasySeason))) && hasLeague && !!(fantasyScoringSettings ?? activeScoringSettings);
  const scoringSettings = useMemo(
    () => {
      const settings = fantasyScoringSettings ?? activeScoringSettings;
      return settings ? { ...DEFAULT_SCORING, ...settings } : null;
    },
    [activeScoringSettings, fantasyScoringSettings],
  );
  const activeDisplayMode = canShowFantasyValue ? displayMode : 'game';
  const showFantasyOnly = activeDisplayMode === 'fantasy';
  const sleeperWeeklyRows = useMemo(
    () => fantasyWeeklyRows ?? (sleeperId ? (sleeperWeeklyStats?.[sleeperId] ?? []) : []),
    [fantasyWeeklyRows, sleeperId, sleeperWeeklyStats],
  );

  useEffect(() => {
    if (!canShowFantasyValue || fantasyWeeklyRows || sleeperSeasonStats || sleeperStatsLoading) return;
    loadSeasonStats?.();
  }, [canShowFantasyValue, fantasyWeeklyRows, loadSeasonStats, sleeperSeasonStats, sleeperStatsLoading]);

  const fantasyTotalsByKey = useMemo(() => {
    if (!showFantasyOnly || !scoringSettings || sleeperWeeklyRows.length === 0) return new Map();
    const totalsByKey = new Map();

    for (const weekEntry of sleeperWeeklyRows) {
      for (const row of buildFantasyOptionRows(weekEntry, scoringSettings, position)) {
        totalsByKey.set(row.key, (totalsByKey.get(row.key) ?? 0) + row.points);
      }
    }

    return totalsByKey;
  }, [position, scoringSettings, showFantasyOnly, sleeperWeeklyRows]);

  const fantasyColumns = useMemo(() => {
    if (!showFantasyOnly || fantasyTotalsByKey.size === 0) return [];
    const activeOptions = FANTASY_OPTIONS.filter((option) => fantasyTotalsByKey.has(option.key));

    if (isMobileFantasyLayout) {
      activeOptions.sort((left, right) => {
        const rightTotal = Number(fantasyTotalsByKey.get(right.key)) || 0;
        const leftTotal = Number(fantasyTotalsByKey.get(left.key)) || 0;
        return rightTotal - leftTotal || FANTASY_OPTIONS.indexOf(left) - FANTASY_OPTIONS.indexOf(right);
      });
    }

    return [
      {
        key: FANTASY_TOTAL_POINTS_KEY,
        label: 'Fantasy Points',
        title: 'Fantasy Points',
        headerLabel: ['Fantasy', 'Pts'],
      },
      ...activeOptions.map(({ key, label }) => ({
        key,
        label,
        headerLabel: getFantasyHeaderLabel(key, label),
      })),
    ];
  }, [fantasyTotalsByKey, isMobileFantasyLayout, showFantasyOnly]);

  const sleeperWeekByWeek = useMemo(
    () => new Map(sleeperWeeklyRows.map((weekEntry) => [Number(weekEntry.week), weekEntry])),
    [sleeperWeeklyRows],
  );
  const shouldBuildFantasyRanks = canShowFantasyValue
    && showFantasyOnly
    && fantasyTotalsByKey.size > 0
    && String(year) === String(fantasySeason);
  const fantasyRankByOption = useMemo(() => (
    shouldBuildFantasyRanks
      ? buildFantasyOptionRankMap(sleeperSeasonStats, sleeperPlayers, scoringSettings)
      : new Map()
  ), [scoringSettings, shouldBuildFantasyRanks, sleeperPlayers, sleeperSeasonStats]);
  const fantasyPositionRankByOption = useMemo(() => (
    shouldBuildFantasyRanks
      ? buildFantasyOptionPositionRankMap(sleeperSeasonStats, sleeperPlayers, scoringSettings)
      : new Map()
  ), [scoringSettings, shouldBuildFantasyRanks, sleeperPlayers, sleeperSeasonStats]);

  const fantasyValueSections = useMemo(() => {
    if (!showFantasyOnly || fantasyTotalsByKey.size === 0) return [];

    const rowsByKey = new Map(FANTASY_OPTIONS
      .filter((option) => fantasyTotalsByKey.has(option.key))
      .map((option) => {
        const row = {
          key: option.key,
          label: option.label,
          value: formatFantasyValue(fantasyTotalsByKey.get(option.key)),
          valueSuffix: null,
          rank: sleeperId ? (fantasyRankByOption.get(option.key)?.get(sleeperId) ?? null) : null,
          positionRank: sleeperId ? (fantasyPositionRankByOption.get(option.key)?.get(sleeperId) ?? null) : null,
        };
        return row.value !== '--' ? [option.key, row] : null;
      })
      .filter(Boolean));

    return rowsByKey.size > 0 ? buildFantasyValueSectionsFromRows(rowsByKey, position) : [];
  }, [fantasyPositionRankByOption, fantasyRankByOption, fantasyTotalsByKey, position, showFantasyOnly, sleeperId]);

  // Merge advanced sections into display when More Stats is on.
  const displayBaseSections = showMoreStats ? [...standard, ...advanced] : standard;
  const displaySections = showFantasyOnly ? fantasyValueSections : displayBaseSections;
  const hasAdvanced = !showFantasyOnly && advanced.length > 0;
  const hasGameLogMoreStats = useMemo(() => {
    if (showFantasyOnly || year === 'career' || !gameLog || gameLog.length === 0) return false;
    const { standard: standardGameCols, advanced: advancedGameCols } = getGameLogColumns(position);
    const coreCols = buildAttainedGameLogColumns(gameLog, standardGameCols);
    const allCols = buildAttainedGameLogColumns(gameLog, [...standardGameCols, ...advancedGameCols]);
    return allCols.length > coreCols.length;
  }, [gameLog, position, showFantasyOnly, year]);
  const hasMoreStats = hasAdvanced || hasGameLogMoreStats;
  const hasHighlightableGameLog = year !== 'career'
    && Array.isArray(gameLog)
    && gameLog.some((game) => !game?.meta?.isBye && !game?.meta?.isInactive);
  const hasTableControls = hasMoreStats || hasHighlightableGameLog;
  const isSelectedLeagueSeason = String(year) === String(fantasySeason);
  const emptyStateMessage = isSelectedLeagueSeason
    ? (showFantasyOnly
      ? `No fantasy values have been recorded for the ${year} season yet. They will appear once the season begins and your league has scoring data.`
      : `No stats have been recorded for the ${year} season yet. They will appear once the season begins.`)
    : (showFantasyOnly ? 'No fantasy values are available for this season.' : 'No stats available for this season.');

  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all"
      style={expanded && accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : undefined}
    >
      {/* Accordion header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold shrink-0">
            {label}
          </span>
          {honors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {honors.map(honor => <HonorBadge key={honor} honor={honor} />)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <svg
              className="animate-spin w-4 h-4"
              style={{ color: accentColor ?? '#3b82f6' }}
              fill="none" viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Stat content */}
      {expanded && (
        <div className="bg-white dark:bg-gray-900">
          {error ? (
            <p className="px-4 py-3 text-sm text-red-500 dark:text-red-400 italic">{error}</p>
          ) : loading ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">Loading stats…</p>
          ) : showFantasyOnly && (sleeperStatsLoading || fantasyRowsLoading) && displaySections.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">Loading fantasy values...</p>
          ) : displaySections.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">
              {emptyStateMessage}
            </p>
          ) : (
            <>
              {/* Season totals — grouped by category */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                {hasTableControls && (
                  <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-x-5 gap-y-2">
                    {hasMoreStats && (
                      <StatTableSwitch
                        checked={showMoreStats}
                        label="More Stats"
                        accentColor={accentColor}
                        onChange={() => setShowMoreStats(v => !v)}
                      />
                    )}
                    {hasHighlightableGameLog && (
                      <StatTableSwitch
                        checked={highlightColumnHighs}
                        label="Column Highs"
                        accentColor={accentColor}
                        onChange={() => setHighlightColumnHighs(v => !v)}
                      />
                    )}
                    {hasHighlightableGameLog && (
                      <StatTableSwitch
                        checked={highlightColumnLows}
                        label="Column Lows"
                        accentColor="var(--color-accent-red)"
                        onChange={() => setHighlightColumnLows(v => !v)}
                      />
                    )}
                  </div>
                )}

                <StatSections sections={displaySections} accentColor={accentColor} />
              </div>

              {/* Game-by-game log (not shown for career row) */}
              {year !== 'career' && (
                <GameLog
                  gameLog={gameLog}
                  gameLogLoading={gameLogLoading}
                  position={position}
                  showMoreStats={showMoreStats}
                  displayMode={activeDisplayMode}
                  scoringSettings={scoringSettings}
                  fantasyColumns={fantasyColumns}
                  sleeperWeekByWeek={sleeperWeekByWeek}
                  fantasyLoading={sleeperStatsLoading}
                  highlightColumnHighs={highlightColumnHighs}
                  highlightColumnLows={highlightColumnLows}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const StatTableSwitch = ({ checked, label, accentColor, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className="flex items-center gap-2 group"
  >
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 ${!checked ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600' : ''}`}
      style={checked && accentColor ? { background: accentColor, borderColor: accentColor } : undefined}
    >
      <span className={`absolute left-0.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-3' : 'translate-x-0'}`} />
    </span>
    <span
      className={`text-xs font-semibold transition-colors ${!checked ? 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400' : ''}`}
      style={checked && accentColor ? { color: accentColor } : undefined}
    >
      {label}
    </span>
  </button>
);

// Color config for each award/honor type
const HONOR_CONFIG = {
  'NFL MVP':                          { label: 'MVP',      cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600' },
  'Super Bowl MVP':                   { label: 'SB MVP',   cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600' },
  'NFL Offensive Player of the Year': { label: 'OPOY',     cls: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-600' },
  'NFL Defensive Player of the Year': { label: 'DPOY',     cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600' },
  'NFL Offensive Rookie of the Year': { label: 'OROTY',    cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600' },
  'NFL Defensive Rookie of the Year': { label: 'DROTY',    cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600' },
  'NFL Comeback Player of the Year':  { label: 'CPOY',     cls: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-600' },
  'Walter Payton NFL Man of the Year':{ label: 'WPMOY',    cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-600' },
  'Pro Bowl':                         { label: 'Pro Bowl', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600' },
  '1st Team All-Pro':                 { label: '1st AP',   cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600' },
  '2nd Team All-Pro':                 { label: '2nd AP',   cls: 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600' },
};

export const HonorBadge = ({ honor }) => {
  const c = HONOR_CONFIG[honor] ?? { label: honor, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${c.cls}`}>
      {c.label}
    </span>
  );
};

function formatOrdinalRank(rank) {
  if (rank == null) return null;
  const numericRank = Number(rank);
  if (!Number.isInteger(numericRank) || numericRank <= 0) return String(rank);
  const mod100 = numericRank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${numericRank}th`;
  switch (numericRank % 10) {
    case 1: return `${numericRank}st`;
    case 2: return `${numericRank}nd`;
    case 3: return `${numericRank}rd`;
    default: return `${numericRank}th`;
  }
}

function formatRankMeta(rank, positionRank) {
  const parts = [];
  if (rank) parts.push(formatOrdinalRank(rank));
  if (positionRank?.rank && positionRank?.posLabel) parts.push(`${positionRank.posLabel}${positionRank.rank}`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

const StatSections = ({ sections, accentColor }) => (
  <div className="space-y-4">
    {sections.map(({ heading, rows }) => (
      <div key={heading}>
        <div
          className="text-[10px] font-bold uppercase tracking-widest pb-1 mb-2 border-b"
          style={accentColor
            ? { color: accentColor, borderBottomColor: `${accentColor}40` }
            : { color: undefined, borderBottomColor: undefined }
          }
        >
          <span className={accentColor ? '' : 'text-gray-400 dark:text-gray-500'}>{heading}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2">
          {rows.map(({ key, label, value, valueSuffix, rank, positionRank }) => {
            const rankMeta = formatRankMeta(rank, positionRank);
            return (
              <div key={key ?? label} className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">{label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-gray-800 dark:text-gray-100">{value}</span>
                  {valueSuffix && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{valueSuffix}</span>
                  )}
                  {rankMeta && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{rankMeta}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

function SortDirectionIndicator({ active, direction }) {
  return (
    <span
      className={`inline-flex w-2 justify-center text-[9px] leading-none transition-opacity ${active ? 'opacity-80' : 'opacity-0'}`}
      aria-hidden="true"
    >
      {direction === 'desc' ? '↓' : '↑'}
    </span>
  );
}

function SortableGameLogHeader({
  className,
  style,
  title,
  ariaLabel,
  active,
  direction,
  onClick,
  children,
  align = 'left',
}) {
  return (
    <th
      className={className}
      style={style}
      title={title}
      aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        className={`group flex min-w-0 max-w-full items-center gap-0.5 rounded-sm uppercase transition-colors hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] dark:hover:text-gray-300 ${
          align === 'center' ? 'mx-auto justify-center text-center' : 'justify-start text-left'
        }`}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children}
        <SortDirectionIndicator active={active} direction={direction} />
      </button>
    </th>
  );
}

const GameLog = ({
  gameLog,
  gameLogLoading,
  position,
  showMoreStats = false,
  displayMode = 'game',
  scoringSettings = null,
  fantasyColumns = [],
  sleeperWeekByWeek = new Map(),
  fantasyLoading = false,
  highlightColumnHighs = false,
  highlightColumnLows = false,
}) => {
  const tableContainerRef = useRef(null);
  const [sortConfig, setSortConfig] = useState(null);
  const { standard: standardGameCols, advanced: advancedGameCols } = useMemo(() => getGameLogColumns(position), [position]);
  const coreGameStatColumns = useMemo(
    () => buildAttainedGameLogColumns(gameLog, standardGameCols),
    [gameLog, standardGameCols],
  );
  const allGameStatColumns = useMemo(() => {
    return buildAttainedGameLogColumns(gameLog, [...standardGameCols, ...advancedGameCols]);
  }, [advancedGameCols, gameLog, standardGameCols]);
  const fantasyOnly = displayMode === 'fantasy' && !!scoringSettings;
  const isMobileGameLogLayout = useMediaQuery('(max-width: 639px)');
  const visibleCoreCount = useVisibleGameStatColumnCount(
    tableContainerRef,
    coreGameStatColumns.length,
    !fantasyOnly && !showMoreStats,
  );
  const fittedCoreGameStatColumns = useMemo(() => {
    return coreGameStatColumns.slice(0, visibleCoreCount);
  }, [coreGameStatColumns, visibleCoreCount]);
  const gameStatColumns = showMoreStats ? allGameStatColumns : fittedCoreGameStatColumns;
  const cols = fantasyOnly ? fantasyColumns : gameStatColumns;
  const expandedGameStats = showMoreStats && !fantasyOnly;
  const useExpandedStatLayout = fantasyOnly || expandedGameStats;
  const [scrollIndicators, setScrollIndicators] = useState({ left: false, right: false });
  const expandedGameIdentityWidths = isMobileGameLogLayout
    ? MOBILE_COMPACT_GAME_IDENTITY_WIDTHS
    : EXPANDED_GAME_IDENTITY_WIDTHS;
  const expandedGameStatWidth = isMobileGameLogLayout
    ? MOBILE_COMPACT_GAME_STAT_WIDTH
    : EXPANDED_GAME_STAT_WIDTH;
  const compactGameIdentityWidths = isMobileGameLogLayout
    ? MOBILE_COMPACT_GAME_IDENTITY_WIDTHS
    : COMPACT_GAME_IDENTITY_WIDTHS;
  const compactGameStatWidth = isMobileGameLogLayout
    ? MOBILE_COMPACT_GAME_STAT_WIDTH
    : COMPACT_GAME_STAT_WIDTH;
  const expandedGameTableWidth = expandedGameIdentityWidths.reduce((sum, width) => sum + width, 0) + (cols.length * expandedGameStatWidth);
  const compactGameTableWidth = compactGameIdentityWidths.reduce((sum, width) => sum + width, 0) + (cols.length * compactGameStatWidth);
  const useTightIdentitySpacing = fantasyOnly || isMobileGameLogLayout;
  const baseHeaderClass = useTightIdentitySpacing
    ? 'px-1 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase whitespace-nowrap text-[9px] lg:text-[10px] tracking-normal lg:tracking-[0.04em]'
    : 'px-2 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase whitespace-nowrap text-[9px] lg:text-[10px] tracking-normal lg:tracking-[0.04em]';
  const statHeaderClass = 'px-1 py-2 text-center align-middle font-semibold text-gray-400 dark:text-gray-500 uppercase text-[9px] lg:text-[10px] tracking-normal lg:tracking-[0.04em] overflow-hidden';
  const baseCellClass = useTightIdentitySpacing
    ? 'px-1 py-1.5 align-middle whitespace-nowrap'
    : 'px-1 sm:px-2 py-1.5 align-middle whitespace-nowrap';
  const identityCellPaddingClass = useTightIdentitySpacing ? 'px-1' : 'px-3';
  const statCellClass = 'px-1 py-1.5 text-center text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap text-[10px] lg:text-[11px]';
  const tableClassName = expandedGameStats
    ? 'table-fixed text-xs'
    : fantasyOnly
      ? 'w-full text-xs min-w-max lg:min-w-0 lg:table-fixed'
      : 'table-fixed text-xs';
  const wrapperClassName = useExpandedStatLayout
    ? `${fantasyOnly ? 'overflow-x-auto lg:overflow-x-visible' : 'overflow-x-auto scrollbar-hide'} border-t border-gray-100 dark:border-gray-800`
    : 'overflow-x-auto scrollbar-hide border-t border-gray-100 dark:border-gray-800';
  const identityColClasses = useExpandedStatLayout
    ? [
        fantasyOnly ? 'lg:w-[4%]' : '',
        fantasyOnly ? 'lg:w-[5%]' : '',
        fantasyOnly ? 'lg:w-[6%]' : '',
        fantasyOnly ? 'lg:w-[9%]' : '',
      ]
    : ['', '', '', ''];
  const identityColStyles = expandedGameStats
    ? expandedGameIdentityWidths.map((width) => ({ width: `${width}px` }))
    : useExpandedStatLayout
      ? [undefined, undefined, undefined, undefined]
      : compactGameIdentityWidths.map((width) => ({ width: `${width}px` }));
  const stickyIdentityLefts = expandedGameIdentityWidths.map((_, index) => (
    expandedGameIdentityWidths.slice(0, index).reduce((sum, width) => sum + width, 0)
  ));
  const statColumnClass = useExpandedStatLayout ? '' : '';
  const statColumnStyle = expandedGameStats
    ? { width: `${expandedGameStatWidth}px` }
    : !useExpandedStatLayout
      ? { width: `${compactGameStatWidth}px` }
      : undefined;
  const tableStyle = expandedGameStats
    ? { width: `${expandedGameTableWidth}px`, minWidth: '100%' }
    : !useExpandedStatLayout
      ? { width: `${compactGameTableWidth}px`, minWidth: '100%' }
      : undefined;
  const getStickyIdentityStyle = (index) => expandedGameStats
    ? { left: `${stickyIdentityLefts[index]}px`, zIndex: 20 }
    : undefined;
  const getStickyIdentityClass = (index, baseClass, rowBackgroundClass = 'bg-white dark:bg-gray-900') => {
    if (!expandedGameStats) return baseClass;
    const separator = index === 3 ? ' shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]' : '';
    return `${baseClass} sticky ${rowBackgroundClass}${separator}`;
  };
  const expandedIdentityWidth = expandedGameIdentityWidths.reduce((sum, width) => sum + width, 0);
  const shouldShowScrollIndicators = expandedGameStats || (isMobileGameLogLayout && useExpandedStatLayout);
  const getSortHeaderState = (key) => ({
    active: sortConfig?.key === key,
    direction: sortConfig?.key === key ? sortConfig.direction : 'desc',
  });
  const handleSort = (key, col = null) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return { ...current, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }

      return {
        key,
        direction: 'desc',
        col,
      };
    });
  };
  const sortedGameLog = useMemo(() => {
    if (!sortConfig) return gameLog ?? [];

    return [...(gameLog ?? [])]
      .map((game, originalIndex) => ({ game, originalIndex }))
      .sort((left, right) => {
        const leftValue = getGameLogStatSortValue(left.game, sortConfig.col, fantasyOnly, scoringSettings, position, sleeperWeekByWeek);
        const rightValue = getGameLogStatSortValue(right.game, sortConfig.col, fantasyOnly, scoringSettings, position, sleeperWeekByWeek);
        const comparison = compareNullableValues(leftValue, rightValue, sortConfig.direction);
        return comparison || left.originalIndex - right.originalIndex;
      })
      .map(({ game }) => game);
  }, [fantasyOnly, gameLog, position, scoringSettings, sleeperWeekByWeek, sortConfig]);
  const columnHighs = useMemo(() => {
    if (!highlightColumnHighs || cols.length === 0) return new Map();

    const highs = new Map();
    for (const game of gameLog ?? []) {
      if (game?.meta?.isBye || game?.meta?.isInactive) continue;

      for (const col of cols) {
        const value = getGameLogStatSortValue(game, col, fantasyOnly, scoringSettings, position, sleeperWeekByWeek);
        if (!Number.isFinite(value) || Math.abs(value) < POINT_EPSILON) continue;
        const current = highs.get(col.key);
        if (current === undefined || value > current) highs.set(col.key, value);
      }
    }

    return highs;
  }, [cols, fantasyOnly, gameLog, highlightColumnHighs, position, scoringSettings, sleeperWeekByWeek]);
  const columnLows = useMemo(() => {
    if (!highlightColumnLows || cols.length === 0) return new Map();

    const lows = new Map();
    for (const game of gameLog ?? []) {
      if (game?.meta?.isBye || game?.meta?.isInactive) continue;

      for (const col of cols) {
        const value = getGameLogStatSortValue(game, col, fantasyOnly, scoringSettings, position, sleeperWeekByWeek);
        if (!Number.isFinite(value) || Math.abs(value) < POINT_EPSILON) continue;
        const current = lows.get(col.key);
        if (current === undefined || value < current) lows.set(col.key, value);
      }
    }

    return lows;
  }, [cols, fantasyOnly, gameLog, highlightColumnLows, position, scoringSettings, sleeperWeekByWeek]);

  useEffect(() => {
    if (!sortConfig) return;
    if (cols.some((col) => col.key === sortConfig.key)) return;
    setSortConfig(null);
  }, [cols, sortConfig]);

  useEffect(() => {
    if (!shouldShowScrollIndicators) {
      setScrollIndicators({ left: false, right: false });
      return undefined;
    }

    const element = tableContainerRef.current;
    if (!element) return undefined;

    const updateScrollState = () => {
      const maxScrollLeft = element.scrollWidth - element.clientWidth;
      const nextIndicators = {
        left: element.scrollLeft > 2,
        right: maxScrollLeft - element.scrollLeft > 2,
      };

      setScrollIndicators((current) => (
        current.left === nextIndicators.left && current.right === nextIndicators.right
          ? current
          : nextIndicators
      ));
    };

    updateScrollState();
    element.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    observer?.observe(element);

    return () => {
      element.removeEventListener('scroll', updateScrollState);
      observer?.disconnect();
    };
  }, [compactGameTableWidth, expandedGameTableWidth, shouldShowScrollIndicators]);

  if (gameLogLoading || (fantasyOnly && fantasyLoading && cols.length === 0)) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 text-sm text-gray-400 italic border-t border-gray-100 dark:border-gray-800">
        <svg className="animate-spin w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading game log…
      </div>
    );
  }

  if (!gameLog || gameLog.length === 0) return null;

  if (fantasyOnly && cols.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-gray-400 italic border-t border-gray-100 dark:border-gray-800">
        No fantasy scoring rows are available for this game log.
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={tableContainerRef} className={wrapperClassName}>
        <table className={tableClassName} style={tableStyle}>
        {(fantasyOnly || cols.length > 0) && (
          <colgroup>
            <col className={identityColClasses[0]} style={identityColStyles[0]} />
            <col className={identityColClasses[1]} style={identityColStyles[1]} />
            <col className={identityColClasses[2]} style={identityColStyles[2]} />
            <col className={identityColClasses[3]} style={identityColStyles[3]} />
            {cols.map(col => (
              <col key={col.key} className={statColumnClass} style={statColumnStyle} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60">
            {[
              { key: 'week', title: 'Week', text: 'Wk' },
              { key: 'team', title: 'Team', text: 'Team' },
              { key: 'opponent', title: 'Opponent', text: useTightIdentitySpacing ? 'Opp' : 'Opponent' },
              { key: 'result', title: 'Result', text: fantasyOnly ? 'Res' : 'Result' },
            ].map((header, index) => (
              <th
                key={header.key}
                className={getStickyIdentityClass(index, baseHeaderClass, 'bg-gray-50 dark:bg-gray-800')}
                style={getStickyIdentityStyle(index)}
                title={header.title}
              >
                {header.text}
              </th>
            ))}
            {cols.map(col => {
              const [primaryLabel, secondaryLabel] = col.headerLabel ?? [col.label, null];
              const { active, direction } = getSortHeaderState(col.key);
              return (
                <SortableGameLogHeader
                  key={col.key}
                  className={statHeaderClass}
                  title={col.title ?? col.label}
                  ariaLabel={`Sort game log by ${col.title ?? col.label} ${active && direction === 'desc' ? 'ascending' : 'descending'}`}
                  active={active}
                  direction={direction}
                  onClick={() => handleSort(col.key, col)}
                  align="center"
                >
                  <span className="flex min-w-0 max-w-full flex-col items-center justify-center gap-0.5 text-center leading-[1.05]">
                    <span className="block max-w-full whitespace-normal break-normal [overflow-wrap:normal]">{primaryLabel}</span>
                    {secondaryLabel && (
                      <span className="block max-w-full whitespace-normal break-normal [overflow-wrap:normal]">{secondaryLabel}</span>
                    )}
                  </span>
                </SortableGameLogHeader>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {sortedGameLog.map((game, i) => {
            const { meta } = game;
            const isBye      = !!meta.isBye;
            const isInactive = !!meta.isInactive;
            const result     = meta.result ?? '-';
            const isPost     = !!meta.isPostseason;
            const prevIsPost = i > 0 && !!sortedGameLog[i - 1].meta.isPostseason;
            const showPlayoffDivider = !sortConfig && isPost && !prevIsPost;

            // BYE belongs in the frozen Opponent identity column, not the scrollable stat band.
            if (isBye) {
              return (
                <tr key={game.eventId} className="bg-gray-50/40 dark:bg-gray-800/20 italic">
                  <td className={getStickyIdentityClass(0, `${identityCellPaddingClass} py-1 text-gray-400 dark:text-gray-600 tabular-nums text-[11px]`, 'bg-gray-50 dark:bg-gray-800')} style={getStickyIdentityStyle(0)}>{meta.week}</td>
                  <td className={getStickyIdentityClass(1, `${identityCellPaddingClass} py-1 text-gray-400 dark:text-gray-600 text-[11px]`, 'bg-gray-50 dark:bg-gray-800')} style={getStickyIdentityStyle(1)}>{meta.myTeam ?? '—'}</td>
                  <td className={getStickyIdentityClass(2, `${identityCellPaddingClass} py-1 text-gray-400 dark:text-gray-600 font-medium tracking-wide`, 'bg-gray-50 dark:bg-gray-800')} style={getStickyIdentityStyle(2)}>
                    BYE
                  </td>
                  <td className={getStickyIdentityClass(3, `${identityCellPaddingClass} py-1 text-gray-400 dark:text-gray-600 font-medium`, 'bg-gray-50 dark:bg-gray-800')} style={getStickyIdentityStyle(3)}>
                    -
                  </td>
                  {cols.length > 0 && (
                    <td colSpan={cols.length} className={`${statCellClass} bg-gray-50/40 dark:bg-gray-800/20`} aria-hidden="true" />
                  )}
                </tr>
              );
            }

            const resultColor =
              result === 'W' ? 'text-green-600 dark:text-green-400' :
              result === 'L' ? 'text-red-500 dark:text-red-400' :
              'text-gray-400';

            const rowBg = isPost
              ? 'bg-amber-50/60 dark:bg-amber-900/10'
              : isInactive
                ? 'bg-gray-50/60 dark:bg-gray-800/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/40';

            const weekLabel = isPost
              ? (meta.roundLabel ?? 'Playoffs')
              : (meta.week ?? i + 1);
            const opponentLabel = meta.opponent ?? '—';
            const resultLabel = result !== '-' ? `${result} ${meta.score ?? ''}` : '—';

            const dimText = isInactive ? 'opacity-60' : '';
            const fantasyPointsByKey = fantasyOnly
              ? new Map([
                  [
                    FANTASY_TOTAL_POINTS_KEY,
                    getGameLogFantasyTotalPoints(game, sleeperWeekByWeek, scoringSettings, position),
                  ],
                  ...buildGameLogFantasyOptionRows(game, sleeperWeekByWeek, scoringSettings, position).map((row) => [row.key, row.points]),
                ])
              : null;

            return (
              <Fragment key={game.eventId ?? i}>
                {showPlayoffDivider && (
                  <tr key={`divider-${game.eventId}`}>
                    {expandedGameStats ? (
                      <>
                        <td
                          colSpan={4}
                          className="sticky left-0 z-30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]"
                          style={{ width: `${expandedIdentityWidth}px` }}
                        >
                          Playoffs
                        </td>
                        {cols.length > 0 && (
                          <td
                            colSpan={cols.length}
                            className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800"
                          />
                        )}
                      </>
                    ) : (
                      <td
                        colSpan={4 + cols.length}
                        className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800"
                      >
                        Playoffs
                      </td>
                    )}
                  </tr>
                )}
                <tr key={game.eventId ?? i} className={`transition-colors ${rowBg} ${dimText}`}>
                  <td
                    className={getStickyIdentityClass(0, `${baseCellClass} text-gray-400 dark:text-gray-500 tabular-nums text-[11px]`)}
                    style={getStickyIdentityStyle(0)}
                    title={String(weekLabel)}
                  >
                    {weekLabel}
                  </td>
                  <td
                    className={getStickyIdentityClass(1, `${baseCellClass} font-medium text-gray-500 dark:text-gray-400 text-[11px]`)}
                    style={getStickyIdentityStyle(1)}
                    title={meta.myTeam ?? '—'}
                  >
                    {meta.myTeam ?? '—'}
                  </td>
                  <td
                    className={getStickyIdentityClass(2, `${baseCellClass} font-medium ${isPost ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`)}
                    style={getStickyIdentityStyle(2)}
                    title={opponentLabel}
                  >
                    {opponentLabel}
                  </td>
                  <td
                    className={getStickyIdentityClass(3, `${baseCellClass} font-semibold ${resultColor}`)}
                    style={getStickyIdentityStyle(3)}
                    title={isInactive ? `${resultLabel} (inactive)` : resultLabel}
                  >
                    {resultLabel}
                    {isInactive && (
                      <span className="ml-1 text-[10px] font-normal text-gray-400 dark:text-gray-500 not-italic normal-case sm:ml-1.5">
                        (inactive)
                      </span>
                    )}
                  </td>
                  {cols.map(col => {
                    const numericValue = getGameLogStatSortValue(game, col, fantasyOnly, scoringSettings, position, sleeperWeekByWeek);
                    const isColumnHigh = highlightColumnHighs && isSameNumericValue(numericValue, columnHighs.get(col.key));
                    const isColumnLow = highlightColumnLows && isSameNumericValue(numericValue, columnLows.get(col.key));
                    const highlightStyle = isColumnHigh
                      ? {
                          background: 'color-mix(in srgb, var(--color-signature) 18%, transparent)',
                          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-signature) 34%, transparent)',
                          color: 'var(--color-label)',
                        }
                      : isColumnLow
                        ? {
                            background: 'color-mix(in srgb, var(--color-accent-red) 14%, transparent)',
                            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent-red) 30%, transparent)',
                            color: 'var(--color-label)',
                          }
                        : undefined;

                    return (
                      <td
                        key={col.key}
                        className={`${statCellClass} ${highlightStyle ? 'font-bold' : ''}`}
                        style={highlightStyle}
                      >
                        {fantasyOnly
                          ? formatFantasyValue(fantasyPointsByKey?.get(col.key))
                          : gameStatDisplayVal(game.statsJson, col)}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        </table>
      </div>
      {shouldShowScrollIndicators && scrollIndicators.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-white via-white/85 to-transparent pl-2 pr-8 dark:from-gray-900 dark:via-gray-900/85">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300">
            <span className="text-lg leading-none" aria-hidden="true">‹</span>
          </div>
        </div>
      )}
      {shouldShowScrollIndicators && scrollIndicators.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-white via-white/85 to-transparent pl-8 pr-2 dark:from-gray-900 dark:via-gray-900/85">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300">
            <span className="text-lg leading-none" aria-hidden="true">›</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerStatTable;
