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

  // Receiving
  rec: 1.0,            // PPR by default
  rec_yd: 0.1,
  rec_td: 6.0,
  rec_2pt: 2.0,
  rec_fd: 0.0,         // first down (receiving)

  // Misc / Fumbles
  fum: 0.0,            // fumble (any)
  fum_lost: -2.0,
  fum_rec: 0.0,        // offensive fumble recovery
  fum_ret_td: 6.0,
  st_td: 6.0,
  ret_td: 6.0,         // kick/punt return TD
  blk_kick: 2.0,

  // Bonuses (off by default)
  bonus_pass_yd_300: 0.0,
  bonus_pass_yd_400: 0.0,
  bonus_rush_yd_100: 0.0,
  bonus_rush_yd_200: 0.0,
  bonus_rec_yd_100: 0.0,
  bonus_rec_yd_200: 0.0,

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
  idp_def_td: 0.0,   // generic defensive TD (INT ret TD + fumble ret TD)
  idp_pd: 0.0,
  idp_qbhit: 0.0,
  idp_safety: 0.0,
  idp_blk_kick: 0.0,

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
};

// Stat keys that Sleeper uses, mapped to our scoring setting keys
// (Most are 1:1 but some need mapping)
const STAT_TO_SCORING_KEY = {
  // Passing
  pass_yd: 'pass_yd',
  pass_td: 'pass_td',
  pass_int: 'pass_int',
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
  // Receiving
  rec: 'rec',
  rec_yd: 'rec_yd',
  rec_td: 'rec_td',
  rec_2pt: 'rec_2pt',
  rec_fd: 'rec_fd',
  // Misc / Fumbles
  fum: 'fum',
  fum_lost: 'fum_lost',
  fum_rec: 'fum_rec',
  fum_ret_td: 'fum_ret_td',
  st_td: 'st_td',
  ret_td: 'ret_td',
  blk_kick: 'blk_kick',
  // Bonuses
  bonus_pass_yd_300: 'bonus_pass_yd_300',
  bonus_pass_yd_400: 'bonus_pass_yd_400',
  bonus_rush_yd_100: 'bonus_rush_yd_100',
  bonus_rush_yd_200: 'bonus_rush_yd_200',
  bonus_rec_yd_100: 'bonus_rec_yd_100',
  bonus_rec_yd_200: 'bonus_rec_yd_200',
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
  idp_fum_rec: 'idp_fr',        // Sleeper alternate key
  idp_fr_yd: 'idp_fr_yd',
  idp_fum_ret_yd: 'idp_fr_yd',  // Sleeper alternate key
  idp_fr_td: 'idp_fr_td',
  idp_def_td: 'idp_def_td',
  idp_pd: 'idp_pd',
  idp_qbhit: 'idp_qbhit',
  idp_safety: 'idp_safety',
  idp_safe: 'idp_safety',        // Sleeper alternate key
  idp_blk_kick: 'idp_blk_kick',
  fum_ret_td: 'fum_ret_td',
  fum_rec_td: 'fum_ret_td',      // Sleeper alternate key
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
};

// ── Core calculation ──────────────────────────────────────────────────────────

/**
 * Calculate fantasy points for a single game/week stats object.
 * @param {Object} stats - Sleeper stat object for one player one week
 * @param {Object} scoring - Scoring settings (merged with DEFAULT_SCORING)
 * @returns {number} Fantasy points (rounded to 2 decimal places)
 */
export function calcPoints(stats, scoring) {
  if (!stats) return 0;
  const settings = { ...DEFAULT_SCORING, ...scoring };
  let pts = 0;

  for (const [statKey, scoringKey] of Object.entries(STAT_TO_SCORING_KEY)) {
    const statVal = stats[statKey];
    if (statVal && settings[scoringKey]) {
      pts += statVal * settings[scoringKey];
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
export function calcSeasonPoints(weeks, scoring) {
  if (!weeks?.length) return 0;
  return weeks.reduce((sum, week) => sum + calcPoints(week, scoring), 0);
}

/**
 * Calculate points from an already-aggregated season stats object.
 * @param {Object} seasonStats - Aggregated stats object (summed across weeks)
 * @param {Object} scoring - Scoring settings
 * @returns {number} Season total fantasy points
 */
export function calcPointsFromTotals(seasonStats, scoring) {
  return calcPoints(seasonStats, scoring);
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
  idp_safe:       'idp_safety', // Sleeper scoring_settings uses idp_safe
  fum_rec_td:     'fum_ret_td', // Sleeper scoring_settings uses fum_rec_td
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
    if (internalKey in STAT_TO_SCORING_KEY) {
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
export function getRecentForm(weeks, scoring, n = 4) {
  if (!weeks?.length) return [];
  const sorted = [...weeks].sort((a, b) => b.week - a.week).slice(0, n);
  return sorted.map(w => ({ week: w.week, pts: calcPoints(w, scoring) }));
}

/**
 * Compute average fantasy points over recent weeks.
 */
export function getRecentAvg(weeks, scoring, n = 4) {
  const form = getRecentForm(weeks, scoring, n);
  if (!form.length) return 0;
  return Math.round((form.reduce((s, w) => s + w.pts, 0) / form.length) * 10) / 10;
}
