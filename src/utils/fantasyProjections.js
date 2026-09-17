import { calcPoints, getFlatScoringSettings } from './scoringEngine.js';
import { getTeamAbbr } from './liveScoringFeed.js';
import { normalizeProviderPlayerName, normalizeProviderTeam } from './providerPlayerIdentity.js';

const IDP_POSITIONS = new Set(['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS']);

function normalizeProjectionName(name) {
  return normalizeProviderPlayerName(name);
}

function normalizePosition(position) {
  const value = String(position ?? '').trim().toUpperCase();
  if (['DST', 'D/ST', 'DEF', 'DEFENSE'].includes(value)) return 'DST';
  if (['QB', 'RB', 'WR', 'TE', 'K'].includes(value)) return value;
  if (IDP_POSITIONS.has(value)) return value;
  return null;
}

function getSleeperPlayerName(player) {
  return player?.full_name
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || '';
}

function getProviderPlayerName(row) {
  const player = row?.player ?? {};
  return [player.first_name, player.last_name].filter(Boolean).join(' ')
    || player.full_name
    || '';
}

function getProviderPosition(row) {
  return normalizePosition(row?.position)
    ?? normalizePosition(row?.player?.position_abbreviation)
    ?? normalizePosition(row?.player?.position);
}

function getProviderTeam(row) {
  return normalizeProviderTeam(row?.team?.abbreviation ?? row?.team?.short_name ?? row?.team?.name ?? row?.team);
}

function getSleeperTeam(player) {
  return getTeamAbbr(player?.team);
}

function makePlayerKey({ name, team, position }) {
  const normalizedPosition = normalizePosition(position);
  const normalizedTeam = getTeamAbbr(team);
  if (!normalizedPosition || !normalizedTeam) return null;
  if (normalizedPosition === 'DST') return `dst|${normalizedTeam}`;
  const normalizedName = normalizeProjectionName(name);
  return normalizedName ? `${normalizedName}|${normalizedTeam}|${normalizedPosition}` : null;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function statNumber(stats, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(stats?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return numberOrZero(fallback);
}

function mapBdlTeamDefenseProjectionStats(stats = {}) {
  const pointsAllowed = statNumber(stats, ['points_allowed']);
  const yardsAllowed = statNumber(stats, ['yards_allowed']);
  const kickReturnYards = statNumber(stats, ['kick_return_yards']);
  const puntReturnYards = statNumber(stats, ['punt_return_yards']);
  const pointsAllowed0 = statNumber(stats, ['points_allowed_0']);
  const pointsAllowed1To6 = statNumber(stats, ['points_allowed_1_to_6'], 0);
  const pointsAllowed7To13 = statNumber(stats, ['points_allowed_7_to_13'], 0);
  const pointsAllowed14To17 = statNumber(stats, ['points_allowed_14_to_17'], 0);
  const pointsAllowed18To21 = statNumber(stats, ['points_allowed_18_to_21'], 0);
  const pointsAllowed22To27 = statNumber(stats, ['points_allowed_22_to_27'], 0);
  const pointsAllowed28To34 = statNumber(stats, ['points_allowed_28_to_34'], 0);
  const pointsAllowed35To45 = statNumber(stats, ['points_allowed_35_to_45'], 0);
  const pointsAllowed46Plus = statNumber(stats, ['points_allowed_46_plus'], 0);

  return {
    // Team defense and special teams only. Individual-defender stat keys must
    // never be attached to a D/ST projection because leagues can score IDP
    // categories globally while not awarding them to the team-defense slot.
    sack: statNumber(stats, ['defensive_sacks']),
    sack_half: statNumber(stats, ['defensive_half_sacks'], statNumber(stats, ['defensive_sacks']) * 2),
    int: statNumber(stats, ['defensive_interceptions']),
    safe: statNumber(stats, ['defensive_safeties']),
    // BDL exposes turnover-return TDs and their INT/fumble components. The
    // generic defensive TD field is only populated when BDL supplies a
    // dedicated value, avoiding double counting the component fields.
    def_td: statNumber(stats, ['defensive_touchdowns']),
    def_ff: statNumber(stats, ['fumbles_forced', 'forced_fumbles']),
    fum_rec: statNumber(stats, ['opponent_fumble_recoveries', 'fumbles_recovered']),
    def_fum_td: statNumber(stats, ['fumble_return_touchdowns', 'fumbles_touchdowns']),
    def_int_td: statNumber(stats, ['interception_return_touchdowns', 'interception_touchdowns']),
    def_pass_def: statNumber(stats, ['passes_defended']),
    blk_kick: statNumber(stats, ['kicks_blocked', 'blocked_kicks']),
    blk_kick_ret_td: statNumber(stats, ['blocked_kick_return_touchdowns']),
    kr_td: statNumber(stats, ['kick_return_touchdowns']),
    pr_td: statNumber(stats, ['punt_return_touchdowns']),
    def_kr_yd: kickReturnYards,
    def_pr_yd: puntReturnYards,
    def_kr_yd_10: statNumber(stats, ['kick_return_yards_every_10']),
    def_kr_yd_25: statNumber(stats, ['kick_return_yards_every_25']),
    def_pr_yd_10: statNumber(stats, ['punt_return_yards_every_10']),
    def_pr_yd_25: statNumber(stats, ['punt_return_yards_every_25']),
    tkl: statNumber(stats, ['total_tackles']),
    tkl_3: statNumber(stats, ['total_tackles_every_3']),
    tkl_5: statNumber(stats, ['total_tackles_every_5']),
    tkl_loss: statNumber(stats, ['defensive_stuffs']),
    pts_allow: pointsAllowed,
    pts_allow_0: pointsAllowed0,
    pts_allow_1_6: pointsAllowed1To6,
    pts_allow_7_13: pointsAllowed7To13,
    pts_allow_14_17: pointsAllowed14To17,
    pts_allow_18_21: pointsAllowed18To21,
    pts_allow_22_27: pointsAllowed22To27,
    // BDL's 18–21 bucket is the only overlap with these alternate ESPN
    // brackets. Split its probability evenly by integer point as a bounded
    // approximation when a league uses 14–20 / 21–27 scoring.
    pts_allow_14_20: statNumber(stats, ['points_allowed_14_to_20'], pointsAllowed14To17 + pointsAllowed18To21 * 0.75),
    pts_allow_21_27: statNumber(stats, ['points_allowed_21_to_27'], pointsAllowed22To27 + pointsAllowed18To21 * 0.25),
    pts_allow_28_34: pointsAllowed28To34,
    pts_allow_35_45: pointsAllowed35To45,
    pts_allow_46p: pointsAllowed46Plus,
    pts_allow_35p: statNumber(stats, ['points_allowed_35_plus'], pointsAllowed35To45 + pointsAllowed46Plus),
    yds_allow: yardsAllowed,
    yds_allow_0_100: statNumber(stats, ['yards_allowed_under_100']),
    yds_allow_100_199: statNumber(stats, ['yards_allowed_100_to_199']),
    yds_allow_200_299: statNumber(stats, ['yards_allowed_200_to_299']),
    yds_allow_300_349: statNumber(stats, ['yards_allowed_300_to_349']),
    yds_allow_350_399: statNumber(stats, ['yards_allowed_350_to_399']),
    yds_allow_400_449: statNumber(stats, ['yards_allowed_400_to_449']),
    yds_allow_450_499: statNumber(stats, ['yards_allowed_450_to_499']),
    yds_allow_500_549: statNumber(stats, ['yards_allowed_500_to_549']),
    yds_allow_550p: statNumber(stats, ['yards_allowed_550_plus']),
  };
}

/**
 * Convert BALLDONTLIE's raw projected stat names into the stat keys consumed
 * by GridShift's scoring engine. Keeping this translation local means custom
 * Sleeper scoring remains authoritative instead of being replaced by one of
 * BDL's predefined PPR formats.
 */
export function mapBdlProjectionStats(stats = {}, position = null) {
  if (normalizePosition(position) === 'DST') {
    return mapBdlTeamDefenseProjectionStats(stats);
  }

  const mapped = {
    pass_yd: numberOrZero(stats.passing_yards),
    pass_td: numberOrZero(stats.passing_touchdowns),
    pass_int: numberOrZero(stats.passing_interceptions),
    pass_cmp: numberOrZero(stats.passing_completions),
    pass_att: numberOrZero(stats.passing_attempts),
    pass_sack: numberOrZero(stats.passing_sacks_taken ?? stats.sacks),
    pass_inc: numberOrZero(stats.passing_incompletions),
    pass_fd: numberOrZero(stats.passing_first_downs),
    pass_2pt: numberOrZero(stats.passing_two_point_conversions),
    rush_att: numberOrZero(stats.rushing_attempts),
    rush_yd: numberOrZero(stats.rushing_yards),
    rush_td: numberOrZero(stats.rushing_touchdowns),
    rush_fd: numberOrZero(stats.rushing_first_downs),
    rush_2pt: numberOrZero(stats.rushing_two_point_conversions),
    rec: numberOrZero(stats.receptions),
    rec_yd: numberOrZero(stats.receiving_yards),
    rec_td: numberOrZero(stats.receiving_touchdowns),
    rec_fd: numberOrZero(stats.receiving_first_downs),
    rec_2pt: numberOrZero(stats.receiving_two_point_conversions),
    fum: numberOrZero(stats.fumbles),
    fum_lost: numberOrZero(stats.fumbles_lost),
    fum_ret_td: numberOrZero(stats.offensive_fumble_recovery_touchdowns),
    bonus_pass_yd_300: numberOrZero(stats.passing_300_to_399_yard_games),
    bonus_pass_yd_400: numberOrZero(stats.passing_400_plus_yard_games),
    bonus_rush_yd_100: numberOrZero(stats.rushing_100_to_199_yard_games),
    bonus_rush_yd_200: numberOrZero(stats.rushing_200_plus_yard_games),
    bonus_rec_yd_100: numberOrZero(stats.receiving_100_to_199_yard_games),
    bonus_rec_yd_200: numberOrZero(stats.receiving_200_plus_yard_games),
    bonus_pass_td_40p: numberOrZero(stats.passing_touchdowns_40_plus_yards),
    bonus_pass_td_50p: numberOrZero(stats.passing_touchdowns_50_plus_yards),
    bonus_rush_td_40p: numberOrZero(stats.rushing_touchdowns_40_plus_yards),
    bonus_rush_td_50p: numberOrZero(stats.rushing_touchdowns_50_plus_yards),
    bonus_rec_td_40p: numberOrZero(stats.receiving_touchdowns_40_plus_yards),
    bonus_rec_td_50p: numberOrZero(stats.receiving_touchdowns_50_plus_yards),
    bonus_rec_40p: numberOrZero(stats.receptions_40_plus_yards),
    bonus_rush_40p: numberOrZero(stats.rushing_40_plus_yards),
    fgm: numberOrZero(stats.field_goals_made),
    fgmiss: numberOrZero(stats.field_goals_missed),
    xpm: numberOrZero(stats.extra_points_made),
    xpmiss: numberOrZero(stats.extra_points_missed),
    kr_yd: numberOrZero(stats.kick_return_yards),
    pr_yd: numberOrZero(stats.punt_return_yards),
    kr_td: numberOrZero(stats.kick_return_touchdowns),
    pr_td: numberOrZero(stats.punt_return_touchdowns),
    idp_tkl: numberOrZero(stats.total_tackles),
    idp_tkl_solo: numberOrZero(stats.solo_tackles),
    idp_tkl_ast: numberOrZero(stats.assisted_tackles),
    idp_tkl_loss: numberOrZero(stats.tackles_for_loss),
    idp_sack: numberOrZero(stats.defensive_sacks),
    idp_int: numberOrZero(stats.defensive_interceptions),
    idp_int_ret_yd: numberOrZero(stats.interception_yards),
    idp_int_td: numberOrZero(stats.interception_touchdowns),
    idp_ff: numberOrZero(stats.forced_fumbles),
    idp_fr: numberOrZero(stats.fumbles_recovered),
    idp_fr_yd: numberOrZero(stats.fumble_return_yards),
    idp_fr_td: numberOrZero(stats.fumbles_touchdowns),
    idp_pd: numberOrZero(stats.passes_defended),
    idp_qbhit: numberOrZero(stats.qb_hits),
    idp_safety: numberOrZero(stats.defensive_safeties),
  };

  return mapped;
}

function selectProviderTotal(row, scoringSettings) {
  const projections = Array.isArray(row?.projections) ? row.projections : [];
  if (!projections.length) return null;
  const receptionValue = Number(getFlatScoringSettings(scoringSettings).rec ?? 0);
  const preferredKeys = receptionValue >= 1
    ? ['ppr', 'full_ppr']
    : receptionValue >= 0.5
      ? ['half_ppr', 'half-ppr']
      : ['standard', 'std', 'non_ppr'];
  const preferred = projections.find((projection) => preferredKeys.includes(String(projection?.scoring_format?.key ?? '').toLowerCase()));
  const selected = preferred ?? projections[0];
  const total = Number(selected?.total_points);
  return Number.isFinite(total) ? total : null;
}

function buildProjection(row, scoringSettings) {
  const position = getProviderPosition(row);
  const stats = mapBdlProjectionStats(row?.stats, position);
  const rawValues = Object.values(row?.stats ?? {}).map(Number).filter(Number.isFinite);
  const hasRawData = rawValues.some((value) => value !== 0);
  const localPoints = calcPoints(stats, scoringSettings, position);
  const providerPoints = selectProviderTotal(row, scoringSettings);
  // A zero from a custom D/ST profile is a valid result. Falling back to the
  // provider's standard total would silently reintroduce unconfigured team
  // defense (or IDP) scoring categories.
  // Provider totals are useful only when a row has no usable raw stat line.
  // A zero result from the active league profile is meaningful: it can mean
  // the league intentionally does not score the categories BDL projected.
  const useLocalScoring = hasRawData;
  const projected = useLocalScoring ? localPoints : providerPoints ?? localPoints;
  if (!Number.isFinite(projected)) return null;

  return {
    projected: Math.round(Math.max(0, projected) * 10) / 10,
    min: null,
    max: null,
    projectedStats: stats,
    factors: {
      source: 'balldontlie',
      provider: 'BALLDONTLIE',
      providerId: row?.id ?? null,
      providerCollectedAt: row?.collected_at ?? null,
      scoringSource: useLocalScoring ? 'gridshift-custom-scoring' : 'balldontlie-scoring-format',
    },
  };
}

/**
 * Builds a conservative crosswalk from BALLDONTLIE weekly projections to
 * GridShift/Sleeper player IDs. A row is usable only when its name, NFL team,
 * and fantasy position resolve to exactly one player on each side. DST rows
 * intentionally match by team because the provider projection has no player.
 */
export function mapFantasyProjectionsToSleeperPlayers({ players, projectionRows, scoringSettings } = {}) {
  const sleeperIdsByKey = new Map();
  Object.entries(players ?? {}).forEach(([playerId, player]) => {
    const key = makePlayerKey({
      name: getSleeperPlayerName(player),
      team: getSleeperTeam(player),
      position: player?.position,
    });
    if (!key) return;
    const current = sleeperIdsByKey.get(key) ?? [];
    current.push(String(playerId));
    sleeperIdsByKey.set(key, current);
  });

  const rowsByKey = new Map();
  (projectionRows ?? []).forEach((row) => {
    const projection = buildProjection(row, scoringSettings);
    if (!projection) return;
    const key = makePlayerKey({
      name: getProviderPlayerName(row),
      team: getProviderTeam(row),
      position: getProviderPosition(row),
    });
    if (!key) return;
    const current = rowsByKey.get(key) ?? [];
    current.push({ row, projection });
    rowsByKey.set(key, current);
  });

  const matched = new Map();
  rowsByKey.forEach((rows, key) => {
    const sleeperIds = sleeperIdsByKey.get(key) ?? [];
    if (rows.length !== 1 || sleeperIds.length !== 1) return;
    matched.set(sleeperIds[0], rows[0].projection);
  });
  return matched;
}

export function getFantasyProjectionSourceLabel(projection) {
  const source = projection?.factors?.source;
  if (source === 'balldontlie') return 'BALLDONTLIE';
  if (source === 'sleeper') return 'Sleeper';
  if (source === 'prior-season') return 'Prior season';
  if (source === 'current-season') return 'GridShift model';
  return null;
}
