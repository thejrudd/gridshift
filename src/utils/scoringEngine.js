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
  rush_att: 0.0,       // per rushing attempt
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
  team_win: 0.0,       // ESPN-only NFL team result bonus
  team_loss: 0.0,      // ESPN-only NFL team result penalty
  team_tie: 0.0,       // ESPN-only NFL team result bonus/penalty
  kr_td: 0.0,          // kickoff return TD
  pr_td: 0.0,          // punt return TD
  blk_kick: 2.0,
  blk_kick_ret_td: 0.0,
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
  fgm_0_39: 0.0,
  fgm_40_49: 0.0,
  fgm_50_59: 0.0,
  fgm_60p: 0.0,
  fgmiss: 0.0,
  fgmiss_0_19: 0.0,
  fgmiss_20_29: 0.0,
  fgmiss_30_39: 0.0,
  fgmiss_0_39: 0.0,
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
  def_1pt_safe: 0.0,
  def_int_td: 0.0,
  def_fum_td: 0.0,
  def_ff: 0.0,
  def_3_and_out: 0.0,
  def_4_and_stop: 0.0,
  def_forced_punts: 0.0,
  def_pass_def: 0.0,
  def_st_tkl_solo: 0.0,
  def_kr_yd: 0.0,
  def_pr_yd: 0.0,
  sack: 0.0,              // team DST sack (distinct from idp_sack)
  sack_half: 0.0,         // ESPN "1/2 Sack" scoring unit
  sack_yd: 0.0,           // team DST sack yards
  int: 0.0,               // team DST interception
  int_ret_yd: 0.0,        // team DST INT return yards
  safe: 0.0,              // team DST safety
  tkl: 0.0,               // team DST tackles
  tkl_solo: 0.0,
  tkl_ast: 0.0,
  tkl_3: 0.0,             // ESPN "Every 3 Total Tackles"
  tkl_5: 0.0,             // ESPN "Every 5 Total Tackles"
  tkl_loss: 0.0,
  qb_hit: 0.0,            // team DST QB hit
  def_kr_yd_10: 0.0,      // ESPN "Every 10 kickoff return yards"
  def_kr_yd_25: 0.0,      // ESPN "Every 25 kickoff return yards"
  def_pr_yd_10: 0.0,      // ESPN "Every 10 punt return yards"
  def_pr_yd_25: 0.0,      // ESPN "Every 25 punt return yards"
  pts_allow: 0.0,         // per-point-allowed (rate; mutually exclusive with tier brackets)
  pts_allow_0: 0.0,
  pts_allow_1_6: 0.0,
  pts_allow_7_13: 0.0,
  pts_allow_14_17: 0.0,
  pts_allow_18_21: 0.0,
  pts_allow_22_27: 0.0,
  pts_allow_14_20: 0.0,
  pts_allow_21_27: 0.0,
  pts_allow_28_34: 0.0,
  pts_allow_35_45: 0.0,
  pts_allow_46p: 0.0,
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

const ROUND_2 = (value) => Math.round(value * 100) / 100;
export const ESPN_APPLIED_STAT_FALLBACK_PREFIX = 'espn_stat_';

function normalizePosition(position) {
  const pos = String(position ?? '').toUpperCase();
  if (pos === 'DST' || pos === 'D/ST') return 'DEF';
  if (['DE', 'DT'].includes(pos)) return 'DL';
  if (['CB', 'S', 'SS', 'FS'].includes(pos)) return 'DB';
  if (['ILB', 'OLB'].includes(pos)) return 'LB';
  return pos;
}

export function getFlatScoringSettings(scoring) {
  if (!scoring) return { ...DEFAULT_SCORING };
  const base = scoring.settings && typeof scoring.settings === 'object'
    ? scoring.settings
    : scoring;
  return { ...DEFAULT_SCORING, ...base };
}

export function getPositionScoringSettings(scoring, position = null) {
  const flat = getFlatScoringSettings(scoring);
  const pos = normalizePosition(position);
  const overrides = scoring?.positionOverrides?.[pos] ?? {};
  return { ...flat, ...overrides };
}

function remapLegacyEspnScoringProfile(scoring, flat) {
  const sourceMeta = scoring?.sourceMeta ?? {};
  const statIdMap = sourceMeta.statIdMap;
  const rawRows = sourceMeta.rawScoringItems;
  const hasStatIdMap = statIdMap && typeof statIdMap === 'object';
  const hasRawRows = Array.isArray(rawRows) && rawRows.length > 0;
  if (
    scoring?.provider !== 'espn'
    || (!hasStatIdMap && !hasRawRows)
  ) {
    return {
      settings: flat,
      positionOverrides: scoring?.positionOverrides ?? {},
      sourceMeta: scoring?.sourceMeta ?? null,
    };
  }

  const nextSettings = { ...flat };
  const nextOverrides = {};
  for (const [position, overrides] of Object.entries(scoring?.positionOverrides ?? {})) {
    nextOverrides[position] = { ...overrides };
  }
  const nextStatIdMap = {};
  const staleKeys = new Set();
  const stillCurrentKeys = new Set();
  const seenStatIds = new Set();

  const applyEspnMapping = (statId, legacyKey, points = null, pointsOverrides = null) => {
    const nextKey = mapEspnStatIdToSettingKey(statId);
    const normalizedOverrides = normalizeEspnPointsOverrides(pointsOverrides);
    if (!nextKey && Object.keys(normalizedOverrides).length === 0) return null;
    if (nextKey) nextStatIdMap[statId] = nextKey;
    seenStatIds.add(String(statId));

    if (legacyKey === nextKey) {
      stillCurrentKeys.add(legacyKey);
    } else if (legacyKey) {
      staleKeys.add(legacyKey);
    }

    const rawValue = points === null || points === undefined ? NaN : Number(points);
    const legacyValue = Number(flat[legacyKey]);
    if (nextKey && Number.isFinite(rawValue)) {
      nextSettings[nextKey] = rawValue;
    } else if (nextKey && Number.isFinite(legacyValue)) {
      nextSettings[nextKey] = legacyValue;
    }

    for (const [position, overrideValue] of Object.entries(normalizedOverrides)) {
      if (!Number.isFinite(Number(overrideValue))) continue;
      const overrideKey = mapEspnStatIdToSettingKey(statId, { position }) ?? nextKey;
      if (!overrideKey) continue;
      stillCurrentKeys.add(overrideKey);
      nextOverrides[position] = {
        ...(nextOverrides[position] ?? {}),
        [overrideKey]: Number(overrideValue),
      };
    }

    if (Object.keys(normalizedOverrides).length === 0 && legacyKey) {
      for (const [position, overrides] of Object.entries(nextOverrides)) {
        const legacyOverride = overrides?.[legacyKey];
        if (Number.isFinite(Number(legacyOverride))) {
          const overrideKey = mapEspnStatIdToSettingKey(statId, { position }) ?? nextKey;
          if (overrideKey) {
            overrides[overrideKey] = Number(legacyOverride);
            stillCurrentKeys.add(overrideKey);
          }
        }
      }
    }

    return nextKey;
  };

  const nextRawRows = hasRawRows
    ? rawRows.map((item) => ({
        ...item,
        mappedKey: applyEspnMapping(item?.statId, item?.mappedKey, item?.points, item?.pointsOverrides),
        pointsOverrides: normalizeEspnPointsOverrides(item?.pointsOverrides),
      }))
    : rawRows;

  if (hasStatIdMap) {
    for (const [statId, legacyKey] of Object.entries(statIdMap)) {
      if (seenStatIds.has(String(statId))) continue;
      applyEspnMapping(statId, legacyKey);
    }
  }

  for (const staleKey of staleKeys) {
    if (!staleKey || stillCurrentKeys.has(staleKey) || !(staleKey in DEFAULT_SCORING)) continue;
    nextSettings[staleKey] = DEFAULT_SCORING[staleKey];
    for (const overrides of Object.values(nextOverrides)) {
      if (overrides && staleKey in overrides) delete overrides[staleKey];
    }
  }

  return {
    settings: nextSettings,
    positionOverrides: nextOverrides,
    sourceMeta: {
      ...sourceMeta,
      statIdMap: nextStatIdMap,
      rawScoringItems: nextRawRows,
      migratedLegacyStatIdMap: true,
    },
  };
}

export function normalizeScoringProfile(scoring, provider = 'sleeper') {
  const flat = getFlatScoringSettings(scoring);
  const normalizedProvider = scoring?.provider ?? provider;
  const scoringInput = scoring && typeof scoring === 'object' ? scoring : {};
  const remapped = remapLegacyEspnScoringProfile({ ...scoringInput, provider: normalizedProvider }, flat);
  return {
    ...remapped.settings,
    provider: normalizedProvider,
    settings: remapped.settings,
    positionOverrides: remapped.positionOverrides,
    sourceMeta: remapped.sourceMeta,
  };
}

function normalizeEspnAppliedStatId(statId) {
  const normalized = String(statId ?? '').trim();
  return normalized ? normalized.replace(/[^A-Za-z0-9-]/g, '_') : null;
}

export function getEspnAppliedStatFallbackKey(statId) {
  const normalized = normalizeEspnAppliedStatId(statId);
  return normalized ? `${ESPN_APPLIED_STAT_FALLBACK_PREFIX}${normalized}` : null;
}

export function isEspnAppliedStatFallbackKey(key) {
  return String(key ?? '').startsWith(ESPN_APPLIED_STAT_FALLBACK_PREFIX);
}

export function getEspnAppliedStatFallbackId(key) {
  return isEspnAppliedStatFallbackKey(key)
    ? String(key).slice(ESPN_APPLIED_STAT_FALLBACK_PREFIX.length)
    : null;
}

function getAppliedFantasyPoints(stats) {
  const value = stats?._fantasyPoints ?? stats?.fantasy_points ?? stats?.appliedTotal;
  if (Number.isFinite(Number(value))) return Number(value);

  const contributions = stats?._fantasyContributions;
  if (!contributions || typeof contributions !== 'object') return null;

  let total = 0;
  let hasContribution = false;
  for (const points of Object.values(contributions)) {
    const numeric = Number(points);
    if (!Number.isFinite(numeric)) continue;
    total += numeric;
    hasContribution = true;
  }

  return hasContribution ? total : null;
}

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
  rush_att: 'rush_att',
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
  team_win: 'team_win',
  team_loss: 'team_loss',
  team_tie: 'team_tie',
  kr_td: 'kr_td',
  pr_td: 'pr_td',
  blk_kick: 'blk_kick',
  blk_kick_ret_td: 'blk_kick_ret_td',
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
  fgm_0_39: 'fgm_0_39',
  fgm_40_49: 'fgm_40_49',
  fgm_50_59: 'fgm_50_59',
  fgm_60p: 'fgm_60p',
  fgmiss: 'fgmiss',
  fgmiss_0_19: 'fgmiss_0_19',
  fgmiss_20_29: 'fgmiss_20_29',
  fgmiss_30_39: 'fgmiss_30_39',
  fgmiss_0_39: 'fgmiss_0_39',
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
  def_1pt_safe: 'def_1pt_safe',
  def_int_td: 'def_int_td',
  def_fum_td: 'def_fum_td',
  def_ff: 'def_ff',
  def_3_and_out: 'def_3_and_out',
  def_4_and_stop: 'def_4_and_stop',
  def_forced_punts: 'def_forced_punts',
  def_pass_def: 'def_pass_def',
  def_st_tkl_solo: 'def_st_tkl_solo',
  def_kr_yd: 'def_kr_yd',
  def_pr_yd: 'def_pr_yd',
  sack: 'sack',
  sack_half: 'sack_half',
  sack_yd: 'sack_yd',
  int: 'int',
  int_ret_yd: 'int_ret_yd',
  safe: 'safe',
  tkl: 'tkl',
  tkl_solo: 'tkl_solo',
  tkl_ast: 'tkl_ast',
  tkl_3: 'tkl_3',
  tkl_5: 'tkl_5',
  tkl_loss: 'tkl_loss',
  qb_hit: 'qb_hit',
  def_kr_yd_10: 'def_kr_yd_10',
  def_kr_yd_25: 'def_kr_yd_25',
  def_pr_yd_10: 'def_pr_yd_10',
  def_pr_yd_25: 'def_pr_yd_25',
  pts_allow: 'pts_allow',
  pts_allow_0: 'pts_allow_0',
  pts_allow_1_6: 'pts_allow_1_6',
  pts_allow_7_13: 'pts_allow_7_13',
  pts_allow_14_17: 'pts_allow_14_17',
  pts_allow_18_21: 'pts_allow_18_21',
  pts_allow_22_27: 'pts_allow_22_27',
  pts_allow_14_20: 'pts_allow_14_20',
  pts_allow_21_27: 'pts_allow_21_27',
  pts_allow_28_34: 'pts_allow_28_34',
  pts_allow_35_45: 'pts_allow_35_45',
  pts_allow_46p: 'pts_allow_46p',
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
function calcPointsWithSettings(stats, settings, position = null) {
  if (!stats) return 0;
  const appliedTotal = getAppliedFantasyPoints(stats);
  if (appliedTotal != null) return ROUND_2(appliedTotal);

  const positionSettings = getPositionScoringSettings(settings, position);
  let pts = 0;

  for (const [statKey, scoringKey] of Object.entries(STAT_TO_SCORING_KEY)) {
    const statVal = stats[statKey];
    if (statVal && positionSettings[scoringKey]) {
      pts += statVal * positionSettings[scoringKey];
    }
  }

  // Position-specific bonuses (require position context)
  if (position) {
    // Per-reception bonuses by position
    if (stats.rec) {
      if (position === 'TE' && positionSettings.bonus_rec_te) pts += stats.rec * positionSettings.bonus_rec_te;
      if (position === 'RB' && positionSettings.bonus_rec_rb) pts += stats.rec * positionSettings.bonus_rec_rb;
      if (position === 'WR' && positionSettings.bonus_rec_wr) pts += stats.rec * positionSettings.bonus_rec_wr;
    }
    // Per-carry bonus (RBs only)
    if (position === 'RB' && positionSettings.bonus_rush_att && stats.rush_att) {
      pts += stats.rush_att * positionSettings.bonus_rush_att;
    }
    // Position-specific first down bonuses
    if (positionSettings.bonus_fd_qb && position === 'QB') {
      pts += ((stats.pass_fd ?? 0) + (stats.rush_fd ?? 0)) * positionSettings.bonus_fd_qb;
    }
    if (positionSettings.bonus_fd_rb && position === 'RB') {
      pts += ((stats.rush_fd ?? 0) + (stats.rec_fd ?? 0)) * positionSettings.bonus_fd_rb;
    }
    if (positionSettings.bonus_fd_wr && position === 'WR' && stats.rec_fd) {
      pts += stats.rec_fd * positionSettings.bonus_fd_wr;
    }
    if (positionSettings.bonus_fd_te && position === 'TE' && stats.rec_fd) {
      pts += stats.rec_fd * positionSettings.bonus_fd_te;
    }
  }

  // Fallback: if raw stat keys produced nothing, use Sleeper's pre-computed points.
  // This handles cases where the API returns only pts_ppr/pts_std without raw stats.
  if (pts === 0) {
    const rec = positionSettings.rec ?? 1.0;
    if (rec >= 1.0 && stats.pts_ppr != null)      return ROUND_2(stats.pts_ppr);
    if (rec >= 0.5 && stats.pts_half_ppr != null)  return ROUND_2(stats.pts_half_ppr);
    if (stats.pts_std != null)                     return ROUND_2(stats.pts_std);
    if (stats.pts_ppr != null)                     return ROUND_2(stats.pts_ppr);
  }

  return ROUND_2(pts);
}

export function calcPoints(stats, scoring, position = null) {
  return calcPointsWithSettings(stats, scoring ?? DEFAULT_SCORING, position);
}

export function createPointsCalculator(scoring) {
  const settings = scoring ?? DEFAULT_SCORING;
  return (stats, position = null) => calcPointsWithSettings(stats, settings, position);
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
  const merged = getFlatScoringSettings(scoring);
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

const ESPN_ONLY_SCORING_KEYS = new Set(['team_win', 'team_loss', 'team_tie']);

/**
 * Convert a Sleeper league's scoring_settings object to our scoring format.
 * Handles cases where scoring_settings key names differ from weekly stat key names.
 */
export function importLeagueScoring(leagueScoringSettings) {
  if (!leagueScoringSettings) return {};
  const result = {};
  for (const [key, val] of Object.entries(leagueScoringSettings)) {
    const internalKey = SCORING_SETTINGS_ALIASES[key] ?? key;
    if (ESPN_ONLY_SCORING_KEYS.has(internalKey)) continue;
    // Accept keys that are stat-scoring keys OR any key in DEFAULT_SCORING
    // (covers position-specific bonuses like bonus_rec_te that aren't stat keys)
    if (internalKey in STAT_TO_SCORING_KEY || internalKey in DEFAULT_SCORING) {
      result[internalKey] = val;
    }
  }
  return result;
}

export const ESPN_SLOT_TO_POSITION = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'DEF',
  17: 'K',
};

function normalizeEspnPointsOverrides(pointsOverrides = {}) {
  const normalized = {};
  for (const [slotId, points] of Object.entries(pointsOverrides ?? {})) {
    if (!Number.isFinite(Number(points))) continue;
    const normalizedSlot = normalizePosition(slotId);
    const position = ESPN_SLOT_TO_POSITION[slotId]
      ?? (['QB', 'RB', 'WR', 'TE', 'DEF', 'K'].includes(normalizedSlot) ? normalizedSlot : `slot:${slotId}`);
    normalized[position] = Number(points);
  }
  return normalized;
}

export const ESPN_STAT_ID_TO_SCORING_KEY = {
  0: 'pass_att',
  1: 'pass_cmp',
  2: 'pass_inc',
  3: 'pass_yd',
  4: 'pass_td',
  15: 'pass_td_40p',
  16: 'pass_td_50p',
  17: 'bonus_pass_yd_300',
  18: 'bonus_pass_yd_400',
  19: 'pass_2pt',
  20: 'pass_int',
  23: 'rush_att',
  24: 'rush_yd',
  25: 'rush_td',
  26: 'rush_2pt',
  35: 'rush_td_40p',
  36: 'rush_td_50p',
  37: 'bonus_rush_yd_100',
  38: 'bonus_rush_yd_200',
  41: 'rec',
  42: 'rec_yd',
  43: 'rec_td',
  44: 'rec_2pt',
  45: 'rec_td_40p',
  46: 'rec_td_50p',
  53: 'rec',
  56: 'bonus_rec_yd_100',
  57: 'bonus_rec_yd_200',
  58: 'rec_fd',
  63: 'fum_rec_td',
  64: 'pass_sack',
  68: 'fum',
  72: 'fum_lost',
  74: 'fgm_50_59',
  77: 'fgm_40_49',
  80: 'fgm_0_39',
  82: 'fgmiss_0_39',
  83: 'fgm',
  85: 'fgmiss',
  86: 'xpm',
  88: 'xpmiss',
  89: 'pts_allow_0',
  90: 'pts_allow_1_6',
  91: 'pts_allow_7_13',
  92: 'pts_allow_14_17',
  93: 'blk_kick_ret_td',
  94: 'def_td',
  95: 'int',
  96: 'fum_rec',
  97: 'blk_kick',
  98: 'safe',
  99: 'sack',
  100: 'sack_half',
  101: 'kr_td',
  102: 'pr_td',
  103: 'def_int_td',
  104: 'def_fum_td',
  105: 'def_td',
  106: 'def_ff',
  107: 'tkl_ast',
  108: 'tkl_solo',
  109: 'tkl',
  110: 'tkl_3',
  111: 'tkl_5',
  112: 'tkl_loss',
  113: 'def_pass_def',
  114: 'kr_yd',
  115: 'pr_yd',
  116: 'def_kr_yd_10',
  117: 'def_kr_yd_25',
  118: 'def_pr_yd_10',
  119: 'def_pr_yd_25',
  120: 'pts_allow',
  121: 'pts_allow_18_21',
  122: 'pts_allow_22_27',
  123: 'pts_allow_28_34',
  124: 'pts_allow_35_45',
  125: 'pts_allow_46p',
  127: 'yds_allow',
  128: 'yds_allow_0_100',
  129: 'yds_allow_100_199',
  130: 'yds_allow_200_299',
  131: 'yds_allow_300_349',
  132: 'yds_allow_350_399',
  133: 'yds_allow_400_449',
  134: 'yds_allow_450_499',
  135: 'yds_allow_500_549',
  136: 'yds_allow_550p',
  155: 'team_win',
  156: 'team_loss',
  157: 'team_tie',
  187: 'pts_allow',
  188: 'pts_allow_0',
  189: 'pts_allow_1_6',
  190: 'pts_allow_7_13',
  191: 'pts_allow_14_17',
  192: 'pts_allow_18_21',
  193: 'pts_allow_22_27',
  194: 'pts_allow_28_34',
  195: 'pts_allow_35_45',
  196: 'pts_allow_46p',
  198: 'fgm_50_59',
  200: 'fgmiss_50_59',
  201: 'fgm_60p',
  203: 'fgmiss_60p',
  205: 'def_2pt',
  206: 'def_2pt',
  209: 'def_1pt_safe',
  211: 'pass_fd',
  212: 'rush_fd',
  213: 'rec_fd',
  214: 'fgm_yds',
};

const ESPN_DEFENSE_POSITION_STAT_ID_TO_SCORING_KEY = {
  114: 'def_kr_yd',
  115: 'def_pr_yd',
};

function getEspnMappingPosition(context = {}) {
  const rawPosition = typeof context === 'string' ? context : context?.position;
  return normalizePosition(rawPosition);
}

export function mapEspnStatIdToScoringKey(statId, context = {}) {
  const position = getEspnMappingPosition(context);
  if (position === 'DEF') {
    const defenseKey = ESPN_DEFENSE_POSITION_STAT_ID_TO_SCORING_KEY[String(statId)]
      ?? ESPN_DEFENSE_POSITION_STAT_ID_TO_SCORING_KEY[Number(statId)];
    if (defenseKey) return defenseKey;
  }
  return ESPN_STAT_ID_TO_SCORING_KEY[String(statId)] ?? ESPN_STAT_ID_TO_SCORING_KEY[Number(statId)] ?? null;
}

export function mapEspnStatIdToSettingKey(statId, context = {}) {
  const statKey = mapEspnStatIdToScoringKey(statId, context);
  return STAT_TO_SCORING_KEY[statKey] ?? statKey;
}

export function mapEspnStatIdToContributionKey(statId, context = {}) {
  return mapEspnStatIdToSettingKey(statId, context) ?? getEspnAppliedStatFallbackKey(statId);
}

export function importEspnScoringProfile(scoringSettings = {}) {
  const scoringItems = Array.isArray(scoringSettings)
    ? scoringSettings
    : scoringSettings.scoringItems ?? [];
  const flat = {};
  const positionOverrides = {};
  const statIdMap = {};
  const rawScoringItems = [];
  const unmappedScoringItems = [];

  for (const item of scoringItems) {
    const scoringKey = mapEspnStatIdToSettingKey(item?.statId);
    const normalizedOverrides = normalizeEspnPointsOverrides(item?.pointsOverrides);
    const rawItem = {
      statId: item?.statId,
      points: Number.isFinite(Number(item?.points)) ? Number(item.points) : null,
      pointsOverrides: normalizedOverrides,
      mappedKey: scoringKey,
    };
    rawScoringItems.push(rawItem);
    const mappedOverrideKeys = Object.keys(normalizedOverrides)
      .map((position) => mapEspnStatIdToSettingKey(item?.statId, { position }))
      .filter(Boolean);
    if (!scoringKey && mappedOverrideKeys.length === 0) {
      unmappedScoringItems.push(rawItem);
      continue;
    }
    if (scoringKey) statIdMap[item.statId] = scoringKey;
    if (scoringKey && Number.isFinite(Number(item.points))) {
      flat[scoringKey] = Number(item.points);
    }

    for (const [position, points] of Object.entries(normalizedOverrides)) {
      if (!position || !Number.isFinite(Number(points))) continue;
      const overrideKey = mapEspnStatIdToSettingKey(item?.statId, { position }) ?? scoringKey;
      if (!overrideKey) continue;
      positionOverrides[position] = {
        ...(positionOverrides[position] ?? {}),
        [overrideKey]: Number(points),
      };
    }
  }

  return normalizeScoringProfile({
    provider: 'espn',
    settings: { ...DEFAULT_SCORING, ...flat },
    positionOverrides,
    sourceMeta: {
      provider: 'espn',
      statIdMap,
      rawScoringItems,
      unmappedScoringItems,
    },
  }, 'espn');
}

export function getEspnScoringImportAudit(scoring) {
  const sourceMeta = scoring?.sourceMeta ?? {};
  const flat = getFlatScoringSettings(scoring);
  const rawRows = Array.isArray(sourceMeta.rawScoringItems) ? sourceMeta.rawScoringItems : [];

  if (rawRows.length > 0) {
    const rows = rawRows.map((item) => {
      const mappedKey = item.mappedKey ?? mapEspnStatIdToSettingKey(item.statId);
      return {
        statId: item.statId,
        espnPoints: item.points,
        espnPositionOverrides: item.pointsOverrides ?? {},
        gridshiftKey: mappedKey,
        gridshiftValue: mappedKey ? (flat[mappedKey] ?? null) : null,
        status: mappedKey ? 'mapped' : 'unmapped',
      };
    });
    return {
      provider: sourceMeta.provider ?? scoring?.provider ?? null,
      rows,
      unmappedRows: rows.filter((row) => row.status === 'unmapped'),
      positionOverrides: scoring?.positionOverrides ?? {},
    };
  }

  const rows = Object.entries(sourceMeta.statIdMap ?? {}).map(([statId, mappedKey]) => ({
    statId,
    espnPoints: null,
    espnPositionOverrides: {},
    gridshiftKey: mappedKey,
    gridshiftValue: flat[mappedKey] ?? null,
    status: mappedKey ? 'mapped' : 'unmapped',
  }));
  return {
    provider: sourceMeta.provider ?? scoring?.provider ?? null,
    rows,
    unmappedRows: [],
    positionOverrides: scoring?.positionOverrides ?? {},
  };
}

export const ESPN_DST_SCORING_INDEX_BY_POINTS = {
  1: { group: 'Team Defense / Special Teams', label: 'Kickoff Return Yards (KR)', expectedKey: 'def_kr_yd' },
  2: { group: 'Team Defense / Special Teams', label: 'Punt Return Yards (PR)', expectedKey: 'def_pr_yd' },
  3: { group: 'Team Defense / Special Teams', label: 'Each Sack (SK)', expectedKey: 'sack' },
  4: { group: 'Team Defense / Special Teams', label: 'Total Tackles (TK)', expectedKey: 'tkl' },
  5: { group: 'Team Defense / Special Teams', label: 'Interception Return TD (INTTD)', expectedKey: 'def_int_td' },
  6: { group: 'Team Defense / Special Teams', label: 'Fumble Return TD (FRTD)', expectedKey: 'def_fum_td' },
  7: { group: 'Team Defense / Special Teams', label: 'Kickoff Return TD (KRTD)', expectedKey: 'kr_td' },
  8: { group: 'Team Defense / Special Teams', label: 'Punt Return TD (PRTD)', expectedKey: 'pr_td' },
  9: { group: 'Team Defense / Special Teams', label: 'Blocked Punt or FG return for TD (BLKKRTD)', expectedKey: 'blk_kick_ret_td' },
  10: { group: 'Team Defense / Special Teams', label: 'Blocked Punt, PAT or FG (BLKK)', expectedKey: 'blk_kick' },
  11: { group: 'Team Defense / Special Teams', label: 'Each Interception (INT)', expectedKey: 'int' },
  12: { group: 'Team Defense / Special Teams', label: 'Each Fumble Recovered (FR)', expectedKey: 'fum_rec' },
  13: { group: 'Team Defense / Special Teams', label: 'Each Fumble Forced (FF)', expectedKey: 'def_ff' },
  14: { group: 'Team Defense / Special Teams', label: 'Each Safety (SF)', expectedKey: 'safe' },
  15: { group: 'Team Defense / Special Teams', label: 'Stuffs (ST)', expectedKey: 'tkl_loss' },
  16: { group: 'Team Defense / Special Teams', label: 'Passes Defensed (PD)', expectedKey: 'def_pass_def' },
  17: { group: 'Team Defense / Special Teams', label: 'Points Allowed (PA)', expectedKey: 'pts_allow' },
  18: { group: 'Team Defense / Special Teams', label: '0 points allowed (PA0)', expectedKey: 'pts_allow_0' },
  19: { group: 'Team Defense / Special Teams', label: '1-6 points allowed (PA1)', expectedKey: 'pts_allow_1_6' },
  20: { group: 'Team Defense / Special Teams', label: '7-13 points allowed (PA7)', expectedKey: 'pts_allow_7_13' },
  21: { group: 'Team Defense / Special Teams', label: '14-17 points allowed (PA14)', expectedKey: 'pts_allow_14_17' },
  22: { group: 'Team Defense / Special Teams', label: '18-21 points allowed (PA18)', expectedKey: 'pts_allow_18_21' },
  23: { group: 'Team Defense / Special Teams', label: '22-27 points allowed (PA22)', expectedKey: 'pts_allow_22_27' },
  24: { group: 'Team Defense / Special Teams', label: '28-34 points allowed (PA28)', expectedKey: 'pts_allow_28_34' },
  25: { group: 'Team Defense / Special Teams', label: '35-45 points allowed (PA35)', expectedKey: 'pts_allow_35_45' },
  26: { group: 'Team Defense / Special Teams', label: '46+ points allowed (PA46)', expectedKey: 'pts_allow_46p' },
  27: { group: 'Team Defense / Special Teams', label: 'Yards Allowed (YA)', expectedKey: 'yds_allow' },
  28: { group: 'Team Defense / Special Teams', label: 'Less than 100 total yards allowed (YA100)', expectedKey: 'yds_allow_0_100' },
  29: { group: 'Team Defense / Special Teams', label: '100-199 total yards allowed (YA199)', expectedKey: 'yds_allow_100_199' },
  30: { group: 'Team Defense / Special Teams', label: '200-299 total yards allowed (YA299)', expectedKey: 'yds_allow_200_299' },
  31: { group: 'Team Defense / Special Teams', label: '300-349 total yards allowed (YA349)', expectedKey: 'yds_allow_300_349' },
  32: { group: 'Team Defense / Special Teams', label: '350-399 total yards allowed (YA399)', expectedKey: 'yds_allow_350_399' },
  33: { group: 'Team Defense / Special Teams', label: '400-449 total yards allowed (YA449)', expectedKey: 'yds_allow_400_449' },
  34: { group: 'Team Defense / Special Teams', label: '450-499 total yards allowed (YA499)', expectedKey: 'yds_allow_450_499' },
  35: { group: 'Team Defense / Special Teams', label: '500-549 total yards allowed (YA549)', expectedKey: 'yds_allow_500_549' },
  36: { group: 'Team Defense / Special Teams', label: '550+ total yards allowed (YA550)', expectedKey: 'yds_allow_550p' },
  37: { group: 'Team Defense / Special Teams', label: '2pt Return (2PTRET)', expectedKey: 'def_2pt' },
  38: { group: 'Team Defense / Special Teams', label: '1pt Safety (1PSF)', expectedKey: 'def_1pt_safe' },
  39: { group: 'Miscellaneous', label: 'Kickoff Return Yards (KR)', expectedKey: 'kr_yd' },
  40: { group: 'Miscellaneous', label: 'Punt Return Yards (PR)', expectedKey: 'pr_yd' },
  41: { group: 'Miscellaneous', label: 'Kickoff Return TD (KRTD)', expectedKey: 'kr_td' },
  42: { group: 'Miscellaneous', label: 'Punt Return TD (PRTD)', expectedKey: 'pr_td' },
  43: { group: 'Miscellaneous', label: 'Fumble Recovered for TD (FTD)', expectedKey: 'fum_ret_td' },
  44: { group: 'Miscellaneous', label: 'Total Fumbles (FUM)', expectedKey: 'fum' },
  45: { group: 'Miscellaneous', label: 'Total Fumbles Lost (FUML)', expectedKey: 'fum_lost' },
  46: { group: 'Miscellaneous', label: 'Team Win (TW)', expectedKey: 'team_win' },
  47: { group: 'Miscellaneous', label: 'Team Loss (TL)', expectedKey: 'team_loss' },
  48: { group: 'Miscellaneous', label: 'Interception Return TD (INTTD)', expectedKey: 'def_int_td' },
  49: { group: 'Miscellaneous', label: 'Fumble Return TD (FRTD)', expectedKey: 'def_fum_td' },
  50: { group: 'Miscellaneous', label: 'Blocked Punt or FG return for TD (BLKKRTD)', expectedKey: 'blk_kick_ret_td' },
  51: { group: 'Miscellaneous', label: '2pt Return (2PTRET)', expectedKey: 'def_2pt' },
  52: { group: 'Miscellaneous', label: '1pt Safety (1PSF)', expectedKey: 'def_1pt_safe' },
};

function getScoringIndexStatus({ expectedKey, gridshiftKey }) {
  if (!expectedKey) return gridshiftKey ? 'unexpected-map' : 'unknown-expected-key';
  if (!(expectedKey in DEFAULT_SCORING)) return 'missing-gridshift-key';
  if (!gridshiftKey) return 'missing-espn-map';
  return gridshiftKey === expectedKey ? 'match' : 'mismatch';
}

function getEspnScoringAuditPointEntries(auditRows = []) {
  const entries = [];
  for (const row of auditRows) {
    const baseKey = mapEspnStatIdToSettingKey(row.statId);
    const basePoints = Number(row.espnPoints);
    if (Number.isFinite(basePoints)) {
      entries.push({
        ...row,
        gridshiftKey: baseKey ?? row.gridshiftKey,
        indexSource: 'base',
        indexPosition: null,
        indexPoints: basePoints,
      });
    }

    for (const [position, points] of Object.entries(row.espnPositionOverrides ?? {})) {
      const numericPoints = Number(points);
      if (!Number.isFinite(numericPoints)) continue;
      const overrideKey = mapEspnStatIdToSettingKey(row.statId, { position });
      entries.push({
        ...row,
        gridshiftKey: overrideKey ?? row.gridshiftKey,
        indexSource: 'override',
        indexPosition: position,
        indexPoints: numericPoints,
        gridshiftValue: numericPoints,
      });
    }
  }
  return entries;
}

function chooseEspnDstScoringIndexEntry(matches, expected) {
  const preferredPosition = expected.group === 'Team Defense / Special Teams' ? 'DEF' : null;
  const expectedKeyMatches = matches.filter((row) => row.gridshiftKey === expected.expectedKey);
  const pools = expectedKeyMatches.length > 0 ? expectedKeyMatches : matches;

  if (preferredPosition) {
    return pools.find((row) => row.indexPosition === preferredPosition)
      ?? pools.find((row) => row.indexPosition === null)
      ?? pools[0]
      ?? null;
  }

  return pools.find((row) => row.indexPosition === null)
    ?? pools.find((row) => row.indexPosition !== 'DEF')
    ?? pools[0]
    ?? null;
}

export function getEspnDstScoringIndexAudit(scoring) {
  const audit = getEspnScoringImportAudit(scoring);
  const rowsByPoints = new Map();
  const pointEntries = getEspnScoringAuditPointEntries(audit.rows ?? []);
  for (const row of pointEntries) {
    const points = Number(row.indexPoints);
    if (!Number.isFinite(points)) continue;
    if (!rowsByPoints.has(points)) rowsByPoints.set(points, []);
    rowsByPoints.get(points).push(row);
  }

  const rows = Object.entries(ESPN_DST_SCORING_INDEX_BY_POINTS).map(([pointsText, expected]) => {
    const points = Number(pointsText);
    const matches = rowsByPoints.get(points) ?? [];
    const primary = chooseEspnDstScoringIndexEntry(matches, expected) ?? {};
    const status = matches.length === 0
      ? 'missing-espn-row'
      : getScoringIndexStatus({
          expectedKey: expected.expectedKey,
          gridshiftKey: primary.gridshiftKey,
        });

    return {
      indexPoints: points,
      expectedGroup: expected.group,
      expectedLabel: expected.label,
      expectedKey: expected.expectedKey,
      statId: primary.statId ?? null,
      gridshiftKey: primary.gridshiftKey ?? null,
      gridshiftValue: primary.gridshiftValue ?? null,
      indexSource: primary.indexSource ?? null,
      indexPosition: primary.indexPosition ?? null,
      candidateRows: matches.map((row) => ({
        statId: row.statId,
        gridshiftKey: row.gridshiftKey,
        gridshiftValue: row.gridshiftValue,
        source: row.indexSource,
        position: row.indexPosition,
      })),
      status,
    };
  });

  return {
    provider: audit.provider,
    rows,
    problemRows: rows.filter((row) => row.status !== 'match'),
    unmatchedEspnRows: pointEntries.filter((row) => (
      Number.isFinite(Number(row.indexPoints))
      && !ESPN_DST_SCORING_INDEX_BY_POINTS[Number(row.indexPoints)]
    )),
  };
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
