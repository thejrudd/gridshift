import { buildStatMap, positionGroup } from './playerMetrics.js';
import { applyEspnBigPlayBonusesToWeeklyStats } from './espnBigPlayBonuses.js';

const POINT_EPSILON = 0.005;
const PROFILE_FANTASY_PLAYER_ID = '__profile__';

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

function setRangeStat(target, key, value, min, max = Infinity) {
  if (!Number.isFinite(value)) return;
  target[key] = value >= min && value <= max ? 1 : 0;
}

function setEveryStat(target, key, value, interval) {
  if (!Number.isFinite(value) || !Number.isFinite(interval) || interval <= 0) return;
  target[key] = Math.floor(value / interval);
}

function parseMetaScore(score) {
  const match = String(score ?? '').match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return [null, null];
  const left = Number(match[1]);
  const right = Number(match[2]);
  return [
    Number.isFinite(left) ? left : null,
    Number.isFinite(right) ? right : null,
  ];
}

function getEffectiveMetaResult(meta = {}) {
  const [teamScore, opponentScore] = parseMetaScore(meta.score);
  if (Number.isFinite(teamScore) && Number.isFinite(opponentScore)) {
    if (teamScore > opponentScore) return 'W';
    if (teamScore < opponentScore) return 'L';
    return 'T';
  }

  const result = String(meta.result ?? '-').toUpperCase();
  return ['W', 'L', 'T'].includes(result) ? result : '-';
}

function hasFantasyStatValues(entry) {
  return Object.entries(entry ?? {}).some(([key, value]) => (
    key !== 'week'
    && Number.isFinite(Number(value))
    && Math.abs(Number(value)) > POINT_EPSILON
  ));
}

function isTeamDefensePosition(position) {
  return positionGroup(position) === 'DEF';
}

function setTeamDefenseAllowanceBuckets(target, pointsAllowed, yardsAllowed) {
  setRangeStat(target, 'pts_allow_0', pointsAllowed, 0, 0);
  setRangeStat(target, 'pts_allow_1_6', pointsAllowed, 1, 6);
  setRangeStat(target, 'pts_allow_7_13', pointsAllowed, 7, 13);
  setRangeStat(target, 'pts_allow_14_17', pointsAllowed, 14, 17);
  setRangeStat(target, 'pts_allow_18_21', pointsAllowed, 18, 21);
  setRangeStat(target, 'pts_allow_22_27', pointsAllowed, 22, 27);
  setRangeStat(target, 'pts_allow_14_20', pointsAllowed, 14, 20);
  setRangeStat(target, 'pts_allow_21_27', pointsAllowed, 21, 27);
  setRangeStat(target, 'pts_allow_28_34', pointsAllowed, 28, 34);
  setRangeStat(target, 'pts_allow_35_45', pointsAllowed, 35, 45);
  setRangeStat(target, 'pts_allow_46p', pointsAllowed, 46);
  setRangeStat(target, 'pts_allow_35p', pointsAllowed, 35);

  setRangeStat(target, 'yds_allow_0_100', yardsAllowed, 0, 100);
  setRangeStat(target, 'yds_allow_100_199', yardsAllowed, 100, 199);
  setRangeStat(target, 'yds_allow_200_299', yardsAllowed, 200, 299);
  setRangeStat(target, 'yds_allow_300_349', yardsAllowed, 300, 349);
  setRangeStat(target, 'yds_allow_350_399', yardsAllowed, 350, 399);
  setRangeStat(target, 'yds_allow_400_449', yardsAllowed, 400, 449);
  setRangeStat(target, 'yds_allow_450_499', yardsAllowed, 450, 499);
  setRangeStat(target, 'yds_allow_500_549', yardsAllowed, 500, 549);
  setRangeStat(target, 'yds_allow_550p', yardsAllowed, 550);
}

function applyTeamDefenseStats(entry, statsMap, result) {
  const pointsAllowed = getNumericStat(statsMap, 'pts_allow');
  const yardsAllowed = getNumericStat(statsMap, 'yds_allow');
  const sacks = getNumericStat(statsMap, 'sack', 'sacks') ?? 0;
  const totalTackles = getNumericStat(statsMap, 'tkl', 'totalTackles', 'tackles') ?? 0;
  const kickReturnYards = getNumericStat(statsMap, 'def_kr_yd', 'kr_yd', 'kickReturnYards') ?? 0;
  const puntReturnYards = getNumericStat(statsMap, 'def_pr_yd', 'pr_yd', 'puntReturnYards') ?? 0;

  setNumericStat(entry, 'pts_allow', pointsAllowed ?? 0);
  setNumericStat(entry, '_pts_allow_raw', getNumericStat(statsMap, 'pts_allow_raw'));
  setNumericStat(entry, '_pts_allow_adjusted', getNumericStat(statsMap, 'pts_allow_adjusted'));
  setNumericStat(entry, 'yds_allow', yardsAllowed ?? 0);
  setNumericStat(entry, '_yds_allow_raw', getNumericStat(statsMap, 'yds_allow_raw'));
  setNumericStat(entry, '_yds_allow_with_return_tds', getNumericStat(statsMap, 'yds_allow_with_return_tds'));
  setNumericStat(entry, 'sack', sacks);
  setNumericStat(entry, 'sack_half', getNumericStat(statsMap, 'sack_half') ?? sacks * 2);
  setNumericStat(entry, 'sack_yd', getNumericStat(statsMap, 'sack_yd', 'sackYards') ?? 0);
  setNumericStat(entry, 'int', getNumericStat(statsMap, 'int', 'interceptions') ?? 0);
  setNumericStat(entry, 'int_ret_yd', getNumericStat(statsMap, 'int_ret_yd', 'interceptionYards') ?? 0);
  setNumericStat(entry, 'fum_rec', getNumericStat(statsMap, 'fum_rec', 'fumblesRecovered', 'fumbleRecoveries') ?? 0);
  setNumericStat(entry, 'blk_kick', getNumericStat(statsMap, 'blk_kick', 'blockedKicks') ?? 0);
  setNumericStat(entry, 'blk_kick_ret_td', getNumericStat(statsMap, 'blk_kick_ret_td') ?? 0);
  setNumericStat(entry, 'def_ff', getNumericStat(statsMap, 'def_ff', 'fumblesForced') ?? 0);
  setNumericStat(entry, 'def_td', getNumericStat(statsMap, 'def_td', 'defensiveTouchdowns') ?? 0);
  setNumericStat(entry, 'def_2pt', getNumericStat(statsMap, 'def_2pt') ?? 0);
  setNumericStat(entry, 'def_1pt_safe', getNumericStat(statsMap, 'def_1pt_safe') ?? 0);
  setNumericStat(entry, 'def_int_td', getNumericStat(statsMap, 'def_int_td', 'interceptionTouchdowns') ?? 0);
  setNumericStat(entry, 'def_fum_td', getNumericStat(statsMap, 'def_fum_td') ?? 0);
  setNumericStat(entry, 'kr_td', getNumericStat(statsMap, 'kr_td', 'kickReturnTouchdowns') ?? 0);
  setNumericStat(entry, 'pr_td', getNumericStat(statsMap, 'pr_td', 'puntReturnTouchdowns') ?? 0);
  setNumericStat(entry, 'safe', getNumericStat(statsMap, 'safe', 'safeties') ?? 0);
  setNumericStat(entry, 'tkl', totalTackles);
  setNumericStat(entry, 'tkl_solo', getNumericStat(statsMap, 'tkl_solo', 'soloTackles') ?? 0);
  setNumericStat(entry, 'tkl_ast', getNumericStat(statsMap, 'tkl_ast', 'assistedTackles') ?? Math.max(0, totalTackles - (entry.tkl_solo ?? 0)));
  setEveryStat(entry, 'tkl_3', totalTackles, 3);
  setEveryStat(entry, 'tkl_5', totalTackles, 5);
  setNumericStat(entry, 'tkl_loss', getNumericStat(statsMap, 'tkl_loss', 'tacklesForLoss') ?? 0);
  setNumericStat(entry, 'qb_hit', getNumericStat(statsMap, 'qb_hit', 'QBHits') ?? 0);
  setNumericStat(entry, 'def_pass_def', getNumericStat(statsMap, 'def_pass_def', 'passesDefended') ?? 0);
  setNumericStat(entry, 'def_st_tkl_solo', getNumericStat(statsMap, 'def_st_tkl_solo') ?? 0);
  setNumericStat(entry, 'def_kr_yd', kickReturnYards);
  setEveryStat(entry, 'def_kr_yd_10', kickReturnYards, 10);
  setEveryStat(entry, 'def_kr_yd_25', kickReturnYards, 25);
  setNumericStat(entry, 'def_pr_yd', puntReturnYards);
  setEveryStat(entry, 'def_pr_yd_10', puntReturnYards, 10);
  setEveryStat(entry, 'def_pr_yd_25', puntReturnYards, 25);
  setTeamDefenseAllowanceBuckets(entry, pointsAllowed, yardsAllowed);
  if (result === 'W') setNumericStat(entry, 'team_win', 1);
  if (result === 'L') setNumericStat(entry, 'team_loss', 1);
  if (result === 'T') setNumericStat(entry, 'team_tie', 1);
}

function applyKickerStats(entry, statsMap) {
  const fieldGoalsMade = getNumericStat(statsMap, 'fieldGoalsMade') ?? 0;
  const fieldGoalAttempts = getNumericStat(statsMap, 'fieldGoalAttempts', 'fieldGoalsAttempted') ?? 0;
  const extraPointsMade = getNumericStat(statsMap, 'extraPointsMade') ?? 0;
  const extraPointAttempts = getNumericStat(statsMap, 'extraPointAttempts', 'extraPointsAttempted') ?? 0;

  const fgMade0_19 = getNumericStat(statsMap, 'fieldGoalsMade0_19', 'fieldGoalsMade1_19');
  const fgMade20_29 = getNumericStat(statsMap, 'fieldGoalsMade20_29');
  const fgMade30_39 = getNumericStat(statsMap, 'fieldGoalsMade30_39');
  const fgMade40_49 = getNumericStat(statsMap, 'fieldGoalsMade40_49');
  const fgMade50_59 = getNumericStat(statsMap, 'fieldGoalsMade50_59') ?? getNumericStat(statsMap, 'fieldGoalsMade50');
  const fgMade60p = getNumericStat(statsMap, 'fieldGoalsMade60', 'fieldGoalsMade60_99', 'fieldGoalsMade60Plus');

  const fgAtt0_19 = getNumericStat(statsMap, 'fieldGoalAttempts0_19', 'fieldGoalAttempts1_19');
  const fgAtt20_29 = getNumericStat(statsMap, 'fieldGoalAttempts20_29');
  const fgAtt30_39 = getNumericStat(statsMap, 'fieldGoalAttempts30_39');
  const fgAtt40_49 = getNumericStat(statsMap, 'fieldGoalAttempts40_49');
  const fgAtt50_59 = getNumericStat(statsMap, 'fieldGoalAttempts50_59') ?? getNumericStat(statsMap, 'fieldGoalAttempts50');
  const fgAtt60p = getNumericStat(statsMap, 'fieldGoalAttempts60', 'fieldGoalAttempts60_99', 'fieldGoalAttempts60Plus');

  setNumericStat(entry, 'fgm', fieldGoalsMade);
  setNumericStat(entry, 'fgmiss', Math.max(0, fieldGoalAttempts - fieldGoalsMade));
  setNumericStat(entry, 'fgm_0_19', fgMade0_19 ?? 0);
  setNumericStat(entry, 'fgm_20_29', fgMade20_29 ?? 0);
  setNumericStat(entry, 'fgm_30_39', fgMade30_39 ?? 0);
  setNumericStat(entry, 'fgm_0_39', [fgMade0_19, fgMade20_29, fgMade30_39].some(value => value != null)
    ? (fgMade0_19 ?? 0) + (fgMade20_29 ?? 0) + (fgMade30_39 ?? 0)
    : 0);
  setNumericStat(entry, 'fgm_40_49', fgMade40_49 ?? 0);
  setNumericStat(entry, 'fgm_50_59', fgMade50_59 ?? 0);
  setNumericStat(entry, 'fgm_60p', fgMade60p ?? 0);
  setNumericStat(entry, 'fgmiss_0_19', Math.max(0, (fgAtt0_19 ?? 0) - (fgMade0_19 ?? 0)));
  setNumericStat(entry, 'fgmiss_20_29', Math.max(0, (fgAtt20_29 ?? 0) - (fgMade20_29 ?? 0)));
  setNumericStat(entry, 'fgmiss_30_39', Math.max(0, (fgAtt30_39 ?? 0) - (fgMade30_39 ?? 0)));
  setNumericStat(entry, 'fgmiss_0_39', [
    fgAtt0_19, fgAtt20_29, fgAtt30_39, fgMade0_19, fgMade20_29, fgMade30_39,
  ].some(value => value != null)
    ? Math.max(0, (fgAtt0_19 ?? 0) + (fgAtt20_29 ?? 0) + (fgAtt30_39 ?? 0) - (fgMade0_19 ?? 0) - (fgMade20_29 ?? 0) - (fgMade30_39 ?? 0))
    : 0);
  setNumericStat(entry, 'fgmiss_40_49', Math.max(0, (fgAtt40_49 ?? 0) - (fgMade40_49 ?? 0)));
  setNumericStat(entry, 'fgmiss_50_59', Math.max(0, (fgAtt50_59 ?? 0) - (fgMade50_59 ?? 0)));
  setNumericStat(entry, 'fgmiss_60p', Math.max(0, (fgAtt60p ?? 0) - (fgMade60p ?? 0)));
  setNumericStat(entry, 'xpm', extraPointsMade);
  setNumericStat(entry, 'xpmiss', Math.max(0, extraPointAttempts - extraPointsMade));
}

export function buildFantasyStatsFromGameLogStats(statsJson, position, meta = {}) {
  if (!statsJson) return null;
  const statsMap = buildStatMap(statsJson);
  const group = positionGroup(position);
  const result = getEffectiveMetaResult(meta);
  const entry = {};

  if (isTeamDefensePosition(position)) {
    applyTeamDefenseStats(entry, statsMap, result);
    return entry;
  }

  if (group === 'K') {
    applyKickerStats(entry, statsMap);
    if (result === 'W') setNumericStat(entry, 'team_win', 1);
    if (result === 'L') setNumericStat(entry, 'team_loss', 1);
    if (result === 'T') setNumericStat(entry, 'team_tie', 1);
    return entry;
  }

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
  if (result === 'W') setNumericStat(entry, 'team_win', 1);
  if (result === 'L') setNumericStat(entry, 'team_loss', 1);
  if (result === 'T') setNumericStat(entry, 'team_tie', 1);

  return entry;
}

export function buildFantasyRowsFromGameLog(gameLog, position) {
  if (!Array.isArray(gameLog)) return [];
  return gameLog
    .map((game) => {
      const entry = buildFantasyStatsFromGameLogStats(game?.statsJson, position, game?.meta);
      if (!hasFantasyStatValues(entry)) return null;
      const week = Number(game?.meta?.week);
      return Number.isFinite(week) ? { ...entry, week, _isPostseason: !!game?.meta?.isPostseason } : entry;
    })
    .filter(Boolean);
}

export function applyScoringPlayBonusesToFantasyRows(rows = [], bonusesByWeek = {}) {
  if (!rows.length || !Object.keys(bonusesByWeek ?? {}).length) return rows;

  let weeklyStats = { [PROFILE_FANTASY_PLAYER_ID]: rows };
  for (const [week, bonuses] of Object.entries(bonusesByWeek ?? {})) {
    weeklyStats = applyEspnBigPlayBonusesToWeeklyStats(weeklyStats, Number(week), {
      [PROFILE_FANTASY_PLAYER_ID]: bonuses,
    });
  }

  return weeklyStats[PROFILE_FANTASY_PLAYER_ID] ?? rows;
}

export { PROFILE_FANTASY_PLAYER_ID };
