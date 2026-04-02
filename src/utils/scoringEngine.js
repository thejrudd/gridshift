// ── Default scoring settings ──────────────────────────────────────────────────

export const SCORING_PRESETS = {
  ppr: {
    label: 'PPR',
    rec: 1.0,
  },
  half_ppr: {
    label: 'Half PPR',
    rec: 0.5,
  },
  standard: {
    label: 'Standard',
    rec: 0.0,
  },
};

export const DEFAULT_SCORING = {
  // Passing
  pass_yd: 0.04,       // 1 pt per 25 yards
  pass_td: 4.0,
  pass_int: -2.0,
  pass_int_td: 0.0,    // pick 6 thrown (extra penalty when INT returned for TD)
  pass_2pt: 2.0,
  pass_sack: 0.0,
  pass_cmp: 0.0,
  pass_att: 0.0,
  pass_inc: 0.0,
  pass_fd: 0.0,        // first down (passing)

  // Rushing
  rush_yd: 0.1,        // 1 pt per 10 yards
  rush_td: 6.0,
  rush_2pt: 2.0,
  rush_fd: 0.0,        // first down (rushing)
  bonus_rush_att: 0.0, // per-carry bonus

  // Receiving
  rec: 1.0,            // PPR by default
  rec_yd: 0.1,
  rec_td: 6.0,
  rec_2pt: 2.0,
  rec_fd: 0.0,         // first down (receiving)
  bonus_rec_te: 0.0,   // TE premium (extra pts per TE reception)
  bonus_rec_rb: 0.0,   // per-reception bonus for RBs only
  bonus_rec_wr: 0.0,   // per-reception bonus for WRs only
  // Tiered reception bonuses (points per catch of a specific distance range)
  rec_0_4:   0.0,
  rec_5_9:   0.0,
  rec_10_19: 0.0,
  rec_20_29: 0.0,
  rec_30_39: 0.0,

  // Misc / Fumbles / Special Teams
  fum: 0.0,            // fumble (any)
  fum_lost: -2.0,
  fum_rec: 0.0,        // offensive fumble recovery
  fum_ret_td: 6.0,
  st_td: 6.0,
  ret_td: 6.0,         // kick/punt return TD
  blk_kick: 2.0,
  // Special teams player stats
  kr_yd: 0.0,          // kick return yards
  pr_yd: 0.0,          // punt return yards
  st_tkl_solo: 0.0,    // special teams solo tackle
  blk_kick_ret_yd: 0.0,
  fg_ret_yd: 0.0,      // missed FG return yards
  fum_ret_yd: 0.0,     // fumble return yards (player)

  // Position-specific first down bonuses
  bonus_fd_qb: 0.0,    // extra pts per first down for QBs (pass + rush FDs)
  bonus_fd_rb: 0.0,    // extra pts per first down for RBs (rush + rec FDs)
  bonus_fd_wr: 0.0,    // extra pts per first down for WRs (rec FDs)
  bonus_fd_te: 0.0,    // extra pts per first down for TEs (rec FDs)

  // Yardage-milestone bonuses (binary per-game flags, off by default)
  bonus_pass_yd_300: 0.0,
  bonus_pass_yd_400: 0.0,
  bonus_rush_yd_100: 0.0,
  bonus_rush_yd_200: 0.0,
  bonus_rec_yd_100: 0.0,
  bonus_rec_yd_200: 0.0,
  bonus_rush_rec_yd_100: 0.0, // combined rush + rec 100+ yards
  bonus_rush_rec_yd_200: 0.0, // combined rush + rec 200+ yards

  // Game-threshold bonuses (binary per-game flags)
  bonus_pass_cmp_25: 0.0,  // 25+ completions in a game
  bonus_rush_att_20: 0.0,  // 20+ rush attempts in a game

  // Big-play TD / completion bonuses (off by default)
  bonus_pass_td_40p: 0.0,  // bonus pts per 40+ yard passing TD
  bonus_pass_td_50p: 0.0,  // bonus pts per 50+ yard passing TD
  bonus_pass_cmp_40p: 0.0, // bonus pts per 40+ yard completion
  bonus_rush_td_40p: 0.0,  // bonus pts per 40+ yard rushing TD
  bonus_rush_td_50p: 0.0,  // bonus pts per 50+ yard rushing TD
  bonus_rec_td_40p: 0.0,   // bonus pts per 40+ yard receiving TD
  bonus_rec_td_50p: 0.0,   // bonus pts per 50+ yard receiving TD
  bonus_rec_40p: 0.0,      // bonus pts per 40+ yard reception
  bonus_rush_40p: 0.0,     // bonus pts per 40+ yard rush
  // Defense/ST big-play bonuses
  bonus_def_fum_td_50p: 0.0, // 50+ yard fumble return TD
  bonus_def_int_td_50p: 0.0, // 50+ yard INT return TD

  // IDP — off by default (most leagues don't use IDP)
  idp_tkl: 0.0,
  idp_tkl_solo: 0.0,
  idp_tkl_ast: 0.0,
  idp_tkl_loss: 0.0,
  idp_sack: 0.0,
  idp_sack_yd: 0.0,
  idp_int: 0.0,
  idp_int_ret_yd: 0.0,
  idp_int_td: 0.0,
  idp_ff: 0.0,
  idp_fr: 0.0,
  idp_fr_yd: 0.0,
  idp_fr_td: 0.0,
  idp_def_td: 0.0,     // generic defensive TD
  idp_pd: 0.0,
  idp_qbhit: 0.0,
  idp_safety: 0.0,
  idp_blk_kick: 0.0,
  // IDP threshold bonuses
  bonus_sack_2p: 0.0,      // 2+ sack game bonus
  bonus_tkl_10p: 0.0,      // 10+ tackle game bonus
  idp_pass_def_3p: 0.0,    // 3+ pass deflections bonus

  // Kicker — off by default
  fgm: 0.0,
  fgm_0_19: 0.0,
  fgm_20_29: 0.0,
  fgm_30_39: 0.0,
  fgm_40_49: 0.0,
  fgm_50_59: 0.0,
  fgm_60p: 0.0,
  fgmiss: 0.0,
  fgmiss_0_19: 0.0,
  fgmiss_20_29: 0.0,
  fgmiss_30_39: 0.0,
  fgmiss_40_49: 0.0,
  fgmiss_50_59: 0.0,
  fgmiss_60p: 0.0,
  xpm: 0.0,
  xpmiss: 0.0,
  fgm_yds: 0.0,          // pts per FG yard
  fgm_yds_over_30: 0.0,  // pts per FG yard beyond 30

  // Team Defense / DST — off by default
  def_td: 0.0,
  def_2pt: 0.0,
  def_3_and_out: 0.0,
  def_4_and_stop: 0.0,
  def_forced_punts: 0.0,
  def_pass_def: 0.0,
  def_st_tkl_solo: 0.0,
  def_kr_yd: 0.0,
  def_pr_yd: 0.0,
  sack: 0.0,              // team DST sack (distinct from idp_sack)
  sack_yd: 0.0,           // team DST sack yards
  int: 0.0,               // team DST interception
  int_ret_yd: 0.0,        // team DST INT return yards
  safe: 0.0,              // team DST safety
  tkl: 0.0,               // team DST tackles
  tkl_solo: 0.0,
  tkl_ast: 0.0,
  tkl_loss: 0.0,
  qb_hit: 0.0,            // team DST QB hit
  pts_allow: 0.0,         // per-point-allowed (rate; mutually exclusive with tier brackets)
  pts_allow_0: 0.0,
  pts_allow_1_6: 0.0,
  pts_allow_7_13: 0.0,
  pts_allow_14_20: 0.0,
  pts_allow_21_27: 0.0,
  pts_allow_28_34: 0.0,
  pts_allow_35p: 0.0,
  yds_allow: 0.0,         // per-yard-allowed (rate)
  yds_allow_0_100: 0.0,
  yds_allow_100_199: 0.0,
  yds_allow_200_299: 0.0,
  yds_allow_300_349: 0.0,
  yds_allow_350_399: 0.0,
  yds_allow_400_449: 0.0,
  yds_allow_450_499: 0.0,
  yds_allow_500_549: 0.0,
  yds_allow_550p: 0.0,
};

// Stat keys that Sleeper uses, mapped to our scoring setting keys
// (Most are 1:1; entries with different keys use explicit mapping)
export const STAT_TO_SCORING_KEY = {
  // Passing
  pass_yd: 'pass_yd',
  pass_td: 'pass_td',
  pass_int: 'pass_int',
  pass_int_td: 'pass_int_td',  // pick 6 thrown
  int_ret_td: 'pass_int_td',   // Sleeper scoring_settings alternate key
  pass_2pt: 'pass_2pt',
  pass_sack: 'pass_sack',
  pass_cmp: 'pass_cmp',
  pass_att: 'pass_att',
  pass_inc: 'pass_inc',
  pass_fd: 'pass_fd',
  // Rushing
  rush_yd: 'rush_yd',
  rush_td: 'rush_td',
  rush_2pt: 'rush_2pt',
  rush_fd: 'rush_fd',
  // NOTE: bonus_rush_att is position-specific (RB only) — handled in calcPoints position block
  // Receiving
  rec: 'rec',
  rec_yd: 'rec_yd',
  rec_td: 'rec_td',
  rec_2pt: 'rec_2pt',
  rec_fd: 'rec_fd',
  // Tiered reception bonuses
  rec_0_4:   'rec_0_4',
  rec_5_9:   'rec_5_9',
  rec_10_19: 'rec_10_19',
  rec_20_29: 'rec_20_29',
  rec_30_39: 'rec_30_39',
  // NOTE: bonus_rec_te/rb/wr are position-specific — handled in calcPoints position block
  // Misc / Fumbles / ST
  fum: 'fum',
  fum_lost: 'fum_lost',
  fum_rec: 'fum_rec',
  fum_ret_td: 'fum_ret_td',
  fum_rec_td: 'fum_ret_td',    // Sleeper alternate key
  st_td: 'st_td',
  ret_td: 'ret_td',
  blk_kick: 'blk_kick',
  kr_yd: 'kr_yd',
  pr_yd: 'pr_yd',
  st_tkl_solo: 'st_tkl_solo',
  blk_kick_ret_yd: 'blk_kick_ret_yd',
  fg_ret_yd: 'fg_ret_yd',
  fum_ret_yd: 'fum_ret_yd',
  // NOTE: bonus_fd_* are position-specific — handled in calcPoints position block
  // Yardage-milestone bonuses
  bonus_pass_yd_300: 'bonus_pass_yd_300',
  bonus_pass_yd_400: 'bonus_pass_yd_400',
  bonus_rush_yd_100: 'bonus_rush_yd_100',
  bonus_rush_yd_200: 'bonus_rush_yd_200',
  bonus_rec_yd_100:  'bonus_rec_yd_100',
  bonus_rec_yd_200:  'bonus_rec_yd_200',
  bonus_rush_rec_yd_100: 'bonus_rush_rec_yd_100',
  bonus_rush_rec_yd_200: 'bonus_rush_rec_yd_200',
  // Game-threshold bonuses
  bonus_pass_cmp_25: 'bonus_pass_cmp_25',
  bonus_rush_att_20: 'bonus_rush_att_20',
  // Big-play TD / completion bonuses — Sleeper weekly stat key → scoring setting key
  pass_td_40p:  'bonus_pass_td_40p',
  pass_td_50p:  'bonus_pass_td_50p',
  pass_cmp_40p: 'bonus_pass_cmp_40p',
  rush_td_40p:  'bonus_rush_td_40p',
  rush_td_50p:  'bonus_rush_td_50p',
  rec_td_40p:   'bonus_rec_td_40p',
  rec_td_50p:   'bonus_rec_td_50p',
  rec_40p:      'bonus_rec_40p',
  rush_40p:     'bonus_rush_40p',
  bonus_def_fum_td_50p: 'bonus_def_fum_td_50p',
  bonus_def_int_td_50p: 'bonus_def_int_td_50p',
  // IDP
  idp_tkl: 'idp_tkl',
  idp_tkl_solo: 'idp_tkl_solo',
  idp_tkl_ast: 'idp_tkl_ast',
  idp_tkl_loss: 'idp_tkl_loss',
  idp_sack: 'idp_sack',
  idp_sack_yd: 'idp_sack_yd',
  idp_int: 'idp_int',
  idp_int_ret_yd: 'idp_int_ret_yd',
  idp_int_td: 'idp_int_td',
  idp_ff: 'idp_ff',
  idp_fr: 'idp_fr',
  idp_fum_rec: 'idp_fr',          // Sleeper alternate key
  idp_fr_yd: 'idp_fr_yd',
  idp_fum_ret_yd: 'idp_fr_yd',    // Sleeper alternate key
  idp_fr_td: 'idp_fr_td',
  idp_def_td: 'idp_def_td',
  idp_pd: 'idp_pd',
  idp_pass_def: 'idp_pd',         // Sleeper alternate weekly stat key
  idp_qbhit: 'idp_qbhit',
  idp_qb_hit: 'idp_qbhit',        // Sleeper alternate weekly stat key
  idp_safety: 'idp_safety',
  idp_safe: 'idp_safety',          // Sleeper alternate key
  idp_blk_kick: 'idp_blk_kick',
  bonus_sack_2p: 'bonus_sack_2p',
  bonus_tkl_10p: 'bonus_tkl_10p',
  idp_pass_def_3p: 'idp_pass_def_3p',
  // Kicker
  fgm: 'fgm',
  fgm_0_19: 'fgm_0_19',
  fgm_20_29: 'fgm_20_29',
  fgm_30_39: 'fgm_30_39',
  fgm_40_49: 'fgm_40_49',
  fgm_50_59: 'fgm_50_59',
  fgm_60p: 'fgm_60p',
  fgmiss: 'fgmiss',
  fgmiss_0_19: 'fgmiss_0_19',
  fgmiss_20_29: 'fgmiss_20_29',
  fgmiss_30_39: 'fgmiss_30_39',
  fgmiss_40_49: 'fgmiss_40_49',
  fgmiss_50_59: 'fgmiss_50_59',
  fgmiss_60p: 'fgmiss_60p',
  xpm: 'xpm',
  xpmiss: 'xpmiss',
  fgm_yds: 'fgm_yds',
  fgm_yds_over_30: 'fgm_yds_over_30',
  // Team Defense / DST
  def_td: 'def_td',
  def_2pt: 'def_2pt',
  def_3_and_out: 'def_3_and_out',
  def_4_and_stop: 'def_4_and_stop',
  def_forced_punts: 'def_forced_punts',
  def_pass_def: 'def_pass_def',
  def_st_tkl_solo: 'def_st_tkl_solo',
  def_kr_yd: 'def_kr_yd',
  def_pr_yd: 'def_pr_yd',
  sack: 'sack',
  sack_yd: 'sack_yd',
  int: 'int',
  int_ret_yd: 'int_ret_yd',
  safe: 'safe',
  tkl: 'tkl',
  tkl_solo: 'tkl_solo',
  tkl_ast: 'tkl_ast',
  tkl_loss: 'tkl_loss',
  qb_hit: 'qb_hit',
  pts_allow: 'pts_allow',
  pts_allow_0: 'pts_allow_0',
  pts_allow_1_6: 'pts_allow_1_6',
  pts_allow_7_13: 'pts_allow_7_13',
  pts_allow_14_20: 'pts_allow_14_20',
  pts_allow_21_27: 'pts_allow_21_27',
  pts_allow_28_34: 'pts_allow_28_34',
  pts_allow_35p: 'pts_allow_35p',
  yds_allow: 'yds_allow',
  yds_allow_0_100: 'yds_allow_0_100',
  yds_allow_100_199: 'yds_allow_100_199',
  yds_allow_200_299: 'yds_allow_200_299',
  yds_allow_300_349: 'yds_allow_300_349',
  yds_allow_350_399: 'yds_allow_350_399',
  yds_allow_400_449: 'yds_allow_400_449',
  yds_allow_450_499: 'yds_allow_450_499',
  yds_allow_500_549: 'yds_allow_500_549',
  yds_allow_550p: 'yds_allow_550p',
};

// ── Core calculation ──────────────────────────────────────────────────────────

/**
 * Calculate fantasy points for a single game/week stats object.
 * @param {Object} stats - Sleeper stat object for one player one week
 * @param {Object} scoring - Scoring settings (merged with DEFAULT_SCORING)
 * @param {string|null} position - Player position for position-specific bonuses
 * @returns {number} Fantasy points (rounded to 2 decimal places)
 */
export function calcPoints(stats, scoring, position = null) {
  if (!stats) return 0;
  const settings = { ...DEFAULT_SCORING, ...scoring };
  let pts = 0;

  for (const [statKey, scoringKey] of Object.entries(STAT_TO_SCORING_KEY)) {
    const statVal = stats[statKey];
    if (statVal && settings[scoringKey]) {
      pts += statVal * settings[scoringKey];
    }
  }

  // Position-specific bonuses (require position context)
  if (position) {
    // Per-reception bonuses by position
    if (stats.rec) {
      if (position === 'TE' && settings.bonus_rec_te) pts += stats.rec * settings.bonus_rec_te;
      if (position === 'RB' && settings.bonus_rec_rb) pts += stats.rec * settings.bonus_rec_rb;
      if (position === 'WR' && settings.bonus_rec_wr) pts += stats.rec * settings.bonus_rec_wr;
    }
    // Per-carry bonus (RBs only)
    if (position === 'RB' && settings.bonus_rush_att && stats.rush_att) {
      pts += stats.rush_att * settings.bonus_rush_att;
    }
    // Position-specific first down bonuses
    if (settings.bonus_fd_qb && position === 'QB') {
      pts += ((stats.pass_fd ?? 0) + (stats.rush_fd ?? 0)) * settings.bonus_fd_qb;
    }
    if (settings.bonus_fd_rb && position === 'RB') {
      pts += ((stats.rush_fd ?? 0) + (stats.rec_fd ?? 0)) * settings.bonus_fd_rb;
    }
    if (settings.bonus_fd_wr && position === 'WR' && stats.rec_fd) {
      pts += stats.rec_fd * settings.bonus_fd_wr;
    }
    if (settings.bonus_fd_te && position === 'TE' && stats.rec_fd) {
      pts += stats.rec_fd * settings.bonus_fd_te;
    }
  }

  // Fallback: if raw stat keys produced nothing, use Sleeper's pre-computed points.
  // This handles cases where the API returns only pts_ppr/pts_std without raw stats.
  if (pts === 0) {
    const rec = settings.rec ?? 1.0;
    if (rec >= 1.0 && stats.pts_ppr != null)      return Math.round(stats.pts_ppr * 100) / 100;
    if (rec >= 0.5 && stats.pts_half_ppr != null)  return Math.round(stats.pts_half_ppr * 100) / 100;
    if (stats.pts_std != null)                     return Math.round(stats.pts_std * 100) / 100;
    if (stats.pts_ppr != null)                     return Math.round(stats.pts_ppr * 100) / 100;
  }

  return Math.round(pts * 100) / 100;
}

/**
 * Calculate season total fantasy points from an array of weekly stat objects.
 * @param {Object[]} weeks - Array of weekly stat objects
 * @param {Object} scoring - Scoring settings
 * @returns {number} Season total fantasy points
 */
export function calcSeasonPoints(weeks, scoring, position = null) {
  if (!weeks?.length) return 0;
  return weeks.reduce((sum, week) => sum + calcPoints(week, scoring, position), 0);
}

/**
 * Calculate points from an already-aggregated season stats object.
 * @param {Object} seasonStats - Aggregated stats object (summed across weeks)
 * @param {Object} scoring - Scoring settings
 * @returns {number} Season total fantasy points
 */
export function calcPointsFromTotals(seasonStats, scoring, position = null) {
  return calcPoints(seasonStats, scoring, position);
}

// ── Preset helpers ────────────────────────────────────────────────────────────

export function applyPreset(preset, currentSettings) {
  const presetRec = SCORING_PRESETS[preset]?.rec ?? 1.0;
  return { ...currentSettings, rec: presetRec };
}

export function detectPreset(scoring) {
  const merged = { ...DEFAULT_SCORING, ...scoring };
  if (merged.rec === 1.0) return 'ppr';
  if (merged.rec === 0.5) return 'half_ppr';
  if (merged.rec === 0.0) return 'standard';
  return 'custom';
}

// ── Sleeper league scoring import ─────────────────────────────────────────────

// Some scoring_settings keys from the league endpoint differ from weekly stat keys.
// Map scoring_settings key → our internal key where they diverge.
const SCORING_SETTINGS_ALIASES = {
  idp_qb_hit:     'idp_qbhit',
  idp_pass_def:   'idp_pd',
  idp_fum_rec:    'idp_fr',
  idp_fum_ret_yd: 'idp_fr_yd',
  idp_safe:       'idp_safety',  // Sleeper scoring_settings uses idp_safe
  fum_rec_td:     'fum_ret_td',  // Sleeper scoring_settings uses fum_rec_td
  int_ret_td:     'pass_int_td', // Sleeper scoring_settings key for Pick 6 Thrown
  rush_att:       'bonus_rush_att', // Sleeper uses rush_att for per-carry scoring setting
  // Big-play bonuses: Sleeper scoring_settings omits the bonus_ prefix (e.g. pass_td_40p)
  // but our internal key and calcPoints lookup uses the bonus_ prefix form.
  pass_td_40p:  'bonus_pass_td_40p',
  pass_td_50p:  'bonus_pass_td_50p',
  pass_cmp_40p: 'bonus_pass_cmp_40p',
  rush_td_40p:  'bonus_rush_td_40p',
  rush_td_50p:  'bonus_rush_td_50p',
  rec_td_40p:   'bonus_rec_td_40p',
  rec_td_50p:   'bonus_rec_td_50p',
  rec_40p:      'bonus_rec_40p',
  rush_40p:     'bonus_rush_40p',
};

/**
 * Convert a Sleeper league's scoring_settings object to our scoring format.
 * Handles cases where scoring_settings key names differ from weekly stat key names.
 */
export function importLeagueScoring(leagueScoringSettings) {
  if (!leagueScoringSettings) return {};
  const result = {};
  for (const [key, val] of Object.entries(leagueScoringSettings)) {
    const internalKey = SCORING_SETTINGS_ALIASES[key] ?? key;
    // Accept keys that are stat-scoring keys OR any key in DEFAULT_SCORING
    // (covers position-specific bonuses like bonus_rec_te that aren't stat keys)
    if (internalKey in STAT_TO_SCORING_KEY || internalKey in DEFAULT_SCORING) {
      result[internalKey] = val;
    }
  }
  return result;
}

// ── Recent form ───────────────────────────────────────────────────────────────

/**
 * Get the last N weeks of fantasy points for a player.
 * @param {Object[]} weeks - Array of weekly stat objects (with .week property)
 * @param {Object} scoring
 * @param {number} n - Number of recent weeks
 * @returns {{ week: number, pts: number }[]}
 */
export function getRecentForm(weeks, scoring, n = 4, position = null) {
  if (!weeks?.length) return [];
  const sorted = [...weeks].sort((a, b) => b.week - a.week).slice(0, n);
  return sorted.map(w => ({ week: w.week, pts: calcPoints(w, scoring, position) }));
}

/**
 * Compute average fantasy points over recent weeks.
 */
export function getRecentAvg(weeks, scoring, n = 4, position = null) {
  const form = getRecentForm(weeks, scoring, n, position);
  if (!form.length) return 0;
  return Math.round((form.reduce((s, w) => s + w.pts, 0) / form.length) * 10) / 10;
}
