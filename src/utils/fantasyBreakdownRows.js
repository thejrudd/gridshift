import {
  calcPoints,
  DEFAULT_SCORING,
  getEspnAppliedStatFallbackId,
  getPositionScoringSettings,
  isEspnAppliedStatFallbackKey,
  STAT_TO_SCORING_KEY,
} from './scoringEngine.js';

export const FANTASY_BREAKDOWN_EPSILON = 0.005;

export const FANTASY_BREAKDOWN_LABELS = {
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
  rush_att: 'Rush Attempt',
  rec: 'Reception',
  rec_yd: 'Rec Yards',
  rec_td: 'Rec TD',
  rec_2pt: 'Rec 2-Pt',
  rec_fd: 'Rec 1st Down',
  fum: 'Fumble',
  fum_lost: 'Fumble Lost',
  fum_rec: 'Fumble Recovery',
  fum_ret_td: 'Fumble Return TD',
  fum_rec_td: 'Fumble Return TD',
  st_td: 'Special Teams TD',
  ret_td: 'Return TD',
  team_win: 'Team Win',
  team_loss: 'Team Loss',
  team_tie: 'Team Tie',
  kr_td: 'Kickoff Return TD',
  pr_td: 'Punt Return TD',
  blk_kick: 'Blocked Kick',
  blk_kick_ret_td: 'Blocked Kick Return TD',
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
  idp_qb_hit: 'QB Hit',
  idp_safety: 'Safety',
  idp_safe: 'Safety',
  idp_blk_kick: 'Blocked Kick',
  bonus_sack_2p: '2+ Sack Bonus',
  bonus_tkl_10p: '10+ Tackle Bonus',
  idp_pass_def_3p: '3+ Pass Def Bonus',
  fgm: 'FG Made',
  fgm_0_19: 'FG 0-19',
  fgm_20_29: 'FG 20-29',
  fgm_30_39: 'FG 30-39',
  fgm_0_39: 'FG 0-39',
  fgm_40_49: 'FG 40-49',
  fgm_50_59: 'FG 50-59',
  fgm_60p: 'FG 60+',
  fgmiss: 'FG Missed',
  fgmiss_0_19: 'FG Miss 0-19',
  fgmiss_20_29: 'FG Miss 20-29',
  fgmiss_30_39: 'FG Miss 30-39',
  fgmiss_0_39: 'FG Miss 0-39',
  fgmiss_40_49: 'FG Miss 40-49',
  fgmiss_50_59: 'FG Miss 50-59',
  fgmiss_60p: 'FG Miss 60+',
  xpm: 'XP Made',
  xpmiss: 'XP Missed',
  fgm_yds: 'FG Yards',
  fgm_yds_over_30: 'FG Yards Over 30',
  def_td: 'DST TD',
  def_2pt: 'DST 2-Pt',
  def_1pt_safe: 'DST 1-Pt Safety',
  def_int_td: 'DST INT Return TD',
  def_fum_td: 'DST Fumble Return TD',
  def_ff: 'DST Forced Fumble',
  def_3_and_out: '3-and-Out',
  def_4_and_stop: '4th Down Stop',
  def_forced_punts: 'Forced Punt',
  def_pass_def: 'DST Pass Deflection',
  def_st_tkl_solo: 'DST ST Tackle',
  def_kr_yd: 'DST Kick Return Yards',
  def_pr_yd: 'DST Punt Return Yards',
  sack: 'DST Sack',
  sack_half: 'DST Half Sack',
  sack_yd: 'DST Sack Yards',
  int: 'DST INT',
  int_ret_yd: 'DST INT Return Yards',
  safe: 'DST Safety',
  tkl: 'DST Tackle',
  tkl_solo: 'DST Solo Tackle',
  tkl_ast: 'DST Assisted Tackle',
  tkl_3: 'DST Every 3 Tackles',
  tkl_5: 'DST Every 5 Tackles',
  tkl_loss: 'DST Tackle for Loss',
  qb_hit: 'DST QB Hit',
  def_kr_yd_10: 'DST Every 10 Kick Return Yards',
  def_kr_yd_25: 'DST Every 25 Kick Return Yards',
  def_pr_yd_10: 'DST Every 10 Punt Return Yards',
  def_pr_yd_25: 'DST Every 25 Punt Return Yards',
  pts_allow: 'Points Allowed',
  pts_allow_0: 'Shutout',
  pts_allow_1_6: '1-6 Points Allowed',
  pts_allow_7_13: '7-13 Points Allowed',
  pts_allow_14_17: '14-17 Points Allowed',
  pts_allow_18_21: '18-21 Points Allowed',
  pts_allow_22_27: '22-27 Points Allowed',
  pts_allow_14_20: '14-20 Points Allowed',
  pts_allow_21_27: '21-27 Points Allowed',
  pts_allow_28_34: '28-34 Points Allowed',
  pts_allow_35_45: '35-45 Points Allowed',
  pts_allow_46p: '46+ Points Allowed',
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
  espn_unmapped_scoring: 'Unmapped ESPN Scoring',
};

function roundPoints(value) {
  return Math.round(Number(value) * 100) / 100;
}

function humanizeScoringKey(key) {
  return String(key ?? '')
    .replace(/^bonus_/, '')
    .replace(/^espn_stat_/, 'ESPN Stat ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function getFantasyBreakdownLabel(key) {
  if (FANTASY_BREAKDOWN_LABELS[key]) return FANTASY_BREAKDOWN_LABELS[key];
  if (isEspnAppliedStatFallbackKey(key)) {
    const statId = getEspnAppliedStatFallbackId(key);
    return statId ? `ESPN Stat #${statId}` : 'ESPN Applied Stat';
  }
  return humanizeScoringKey(key);
}

function addBreakdownRow(rows, { key, statKey = key, label, statVal = null, pts }) {
  const numericPts = Number(pts);
  if (!Number.isFinite(numericPts) || Math.abs(numericPts) < FANTASY_BREAKDOWN_EPSILON) return;
  rows.push({
    key,
    statKey,
    label: label ?? getFantasyBreakdownLabel(statKey ?? key),
    statVal,
    pts: roundPoints(numericPts),
  });
}

function getAppliedFantasyTotal(entry) {
  const value = entry?._fantasyPoints ?? entry?.fantasy_points ?? entry?.appliedTotal;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function getRawStatValue(entry, statKey) {
  const value = Number(entry?.[statKey]);
  return Number.isFinite(value) ? value : 0;
}

function addPositionSpecificRows(rows, entry, settings, position) {
  if (!position) return;
  const normalizedPosition = String(position).toUpperCase();
  const rec = getRawStatValue(entry, 'rec');
  if (rec) {
    if (normalizedPosition === 'TE' && settings.bonus_rec_te) {
      addBreakdownRow(rows, { key: 'bonus_rec_te', statKey: 'bonus_rec_te', statVal: rec, pts: rec * settings.bonus_rec_te });
    }
    if (normalizedPosition === 'RB' && settings.bonus_rec_rb) {
      addBreakdownRow(rows, { key: 'bonus_rec_rb', statKey: 'bonus_rec_rb', statVal: rec, pts: rec * settings.bonus_rec_rb });
    }
    if (normalizedPosition === 'WR' && settings.bonus_rec_wr) {
      addBreakdownRow(rows, { key: 'bonus_rec_wr', statKey: 'bonus_rec_wr', statVal: rec, pts: rec * settings.bonus_rec_wr });
    }
  }

  const rushAtt = getRawStatValue(entry, 'rush_att');
  if (normalizedPosition === 'RB' && rushAtt && settings.bonus_rush_att) {
    addBreakdownRow(rows, { key: 'bonus_rush_att', statKey: 'bonus_rush_att', statVal: rushAtt, pts: rushAtt * settings.bonus_rush_att });
  }

  if (normalizedPosition === 'QB' && settings.bonus_fd_qb) {
    const firstDowns = getRawStatValue(entry, 'pass_fd') + getRawStatValue(entry, 'rush_fd');
    addBreakdownRow(rows, { key: 'bonus_fd_qb', statKey: 'bonus_fd_qb', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_qb });
  }
  if (normalizedPosition === 'RB' && settings.bonus_fd_rb) {
    const firstDowns = getRawStatValue(entry, 'rush_fd') + getRawStatValue(entry, 'rec_fd');
    addBreakdownRow(rows, { key: 'bonus_fd_rb', statKey: 'bonus_fd_rb', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_rb });
  }
  if (normalizedPosition === 'WR' && settings.bonus_fd_wr) {
    const firstDowns = getRawStatValue(entry, 'rec_fd');
    addBreakdownRow(rows, { key: 'bonus_fd_wr', statKey: 'bonus_fd_wr', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_wr });
  }
  if (normalizedPosition === 'TE' && settings.bonus_fd_te) {
    const firstDowns = getRawStatValue(entry, 'rec_fd');
    addBreakdownRow(rows, { key: 'bonus_fd_te', statKey: 'bonus_fd_te', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_te });
  }
}

export function buildFantasyScoringBreakdown(entry, scoringSettings = DEFAULT_SCORING, position = null, options = {}) {
  if (!entry) return { rows: [], total: 0 };

  const settings = getPositionScoringSettings(scoringSettings ?? DEFAULT_SCORING, position);
  const authoritativeTotal = Number.isFinite(Number(options.authoritativeTotal))
    ? Number(options.authoritativeTotal)
    : calcPoints(entry, scoringSettings ?? DEFAULT_SCORING, position);
  const appliedContributions = options.preferRawStats ? null : entry?._fantasyContributions;
  const rows = [];
  const seenKeys = new Set();

  if (appliedContributions && typeof appliedContributions === 'object') {
    for (const [key, points] of Object.entries(appliedContributions)) {
      const pts = Number(points);
      if (!Number.isFinite(pts)) continue;
      seenKeys.add(key);
      addBreakdownRow(rows, {
        key,
        statKey: key,
        label: getFantasyBreakdownLabel(key),
        statVal: null,
        pts,
      });
    }
  }

  for (const [statKey, scoringKey] of Object.entries(STAT_TO_SCORING_KEY)) {
    if (seenKeys.has(scoringKey)) continue;
    const statVal = getRawStatValue(entry, statKey);
    if (!statVal) continue;
    const multiplier = Number(settings[scoringKey] ?? 0);
    if (!multiplier) continue;
    seenKeys.add(scoringKey);
    addBreakdownRow(rows, {
      key: scoringKey,
      statKey,
      label: FANTASY_BREAKDOWN_LABELS[statKey] ?? FANTASY_BREAKDOWN_LABELS[scoringKey] ?? getFantasyBreakdownLabel(scoringKey),
      statVal,
      pts: statVal * multiplier,
    });
  }

  addPositionSpecificRows(rows, entry, settings, position);

  const rowTotal = roundPoints(rows.reduce((sum, row) => sum + row.pts, 0));
  const adjustment = roundPoints(authoritativeTotal - rowTotal);

  if (rows.length === 0 && Math.abs(authoritativeTotal) >= FANTASY_BREAKDOWN_EPSILON && options.includeFallbackTotal !== false) {
    addBreakdownRow(rows, {
      key: 'fantasy_points_total',
      statKey: 'fantasy_points_total',
      label: options.fallbackTotalLabel ?? 'Fantasy Points',
      statVal: null,
      pts: authoritativeTotal,
    });
  } else if (Math.abs(adjustment) >= 0.01) {
    addBreakdownRow(rows, {
      key: options.adjustmentKey ?? 'scoring_adjustment',
      statKey: options.adjustmentKey ?? 'scoring_adjustment',
      label: options.adjustmentLabel ?? 'Scoring Adjustment',
      statVal: null,
      pts: adjustment,
    });
  }

  return {
    rows: rows.sort((left, right) => Math.abs(right.pts) - Math.abs(left.pts)),
    total: roundPoints(authoritativeTotal),
    appliedTotal: getAppliedFantasyTotal(entry),
  };
}

export function mergeOfficialFantasyTotal(officialEntry, derivedEntry) {
  if (!officialEntry && !derivedEntry) return null;
  if (!derivedEntry) return officialEntry ?? null;

  const officialTotal = getAppliedFantasyTotal(officialEntry);
  const merged = {
    ...(officialEntry ?? {}),
    ...derivedEntry,
    week: officialEntry?.week ?? derivedEntry.week,
    team: officialEntry?.team ?? derivedEntry.team,
    opp: officialEntry?.opp ?? derivedEntry.opp,
    home: officialEntry?.home ?? derivedEntry.home,
  };

  if (officialTotal != null) {
    merged._fantasyPoints = officialTotal;
    merged.fantasy_points = officialTotal;
    delete merged._fantasyContributions;
    delete merged._espnAppliedStats;
  }

  return merged;
}
