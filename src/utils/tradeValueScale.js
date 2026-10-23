import { calcPointsFromTotals } from './scoringEngine.js';
import { getProviderIdentityKey, getProviderPlayerIdentity } from './providerPlayerIdentity.js';

export const LEGACY_TRADE_VALUE_SCALE_IDS = Object.freeze(['league-utility-0-100-v1', 'fantasy-viability-0-100-v2']);
export const TRADE_VALUE_SCALE_ID = 'fantasy-baseline-0-100-v3';
export const TRADE_VALUE_SCALE_MIN = 0;
export const TRADE_VALUE_SCALE_MAX = 100;

export function fmtTradeValue(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Math.round(Number(value)).toLocaleString();
}

const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'DEF'];
const GROUP_ALIASES = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', KICKER: 'K',
  DL: 'DL', DE: 'DL', DT: 'DL', EDG: 'DL', EDGE: 'DL', NT: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  DB: 'DB', CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB',
  DEF: 'DEF', DST: 'DEF', 'D/ST': 'DEF',
};
const SLOT_GROUPS = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], PK: ['K'], KICKER: ['K'],
  DEF: ['DEF'], DST: ['DEF'], 'D/ST': ['DEF'],
  DL: ['DL'], DE: ['DL'], DT: ['DL'], EDG: ['DL'], EDGE: ['DL'],
  LB: ['LB'], ILB: ['LB'], OLB: ['LB'], MLB: ['LB'],
  DB: ['DB'], CB: ['DB'], S: ['DB'], SS: ['DB'], FS: ['DB'],
  FLEX: ['RB', 'WR', 'TE'], REC_FLEX: ['RB', 'WR', 'TE'], WRT_FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'], RBWR_FLEX: ['RB', 'WR'], RB_WR: ['RB', 'WR'],
  WR_TE: ['WR', 'TE'], WRTE_FLEX: ['WR', 'TE'], 'WR/TE': ['WR', 'TE'],
  'RB/WR': ['RB', 'WR'], 'WR/RB': ['RB', 'WR'],
  'RB/WR/TE': ['RB', 'WR', 'TE'], 'WR/RB/TE': ['RB', 'WR', 'TE'], 'WR/TE/RB': ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], SUPERFLEX: ['QB', 'RB', 'WR', 'TE'], OP: ['QB', 'RB', 'WR', 'TE'],
  IDP: ['DL', 'LB', 'DB'], IDP_FLEX: ['DL', 'LB', 'DB'], FLEX_IDP: ['DL', 'LB', 'DB'], DP: ['DL', 'LB', 'DB'],
};

export function normalizeTradePositionGroup(position) {
  return GROUP_ALIASES[String(position ?? '').trim().toUpperCase()] ?? null;
}

export function getTradeCurrentContextLabels(context) {
  if (!context) return [];
  const injury = String(context.injury ?? '').trim();
  const practiceStatus = context.practiceReports?.at(-1)?.status;
  return [
    Number.isFinite(context.weeklyProjection) ? `BDL ${context.weeklyProjection.toFixed(1)} proj` : null,
    context.gameStatus ? `BDL ${context.gameStatus}` : null,
    injury ? `Injury: ${injury.slice(0, 30)}` : null,
    practiceStatus ? `Practice ${practiceStatus}` : null,
    context.active === false ? 'BDL inactive' : null,
  ].filter(Boolean);
}

/** Join optional, fresh BDL context by exact name/team/position identity. */
export function buildTradeCurrentContextMap({
  players,
  projections = new Map(),
  projectionFresh = false,
  designations = [],
  designationsFresh = false,
} = {}) {
  const result = new Map();
  const playerIdsByKey = new Map();
  Object.entries(players ?? {}).forEach(([id, player]) => {
    const key = getProviderIdentityKey(getProviderPlayerIdentity({
      name: player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' '),
      team: player?.team,
      position: player?.position,
    }));
    if (!key) return;
    const ids = playerIdsByKey.get(key) ?? [];
    ids.push(String(id));
    playerIdsByKey.set(key, ids);
  });

  const designationsByKey = new Map();
  if (designationsFresh) {
    (designations ?? []).forEach((row) => {
      const name = [row?.player?.first_name, row?.player?.last_name].filter(Boolean).join(' ');
      const key = getProviderIdentityKey(getProviderPlayerIdentity({
        name,
        team: row?.team?.abbreviation,
        position: row?.position ?? row?.player?.position_abbreviation ?? row?.player?.position,
      }));
      if (!key) return;
      const matches = designationsByKey.get(key) ?? [];
      matches.push(row);
      designationsByKey.set(key, matches);
    });
  }

  const ids = new Set([
    ...(projectionFresh ? projections.keys() : []),
    ...(designationsFresh ? [...designationsByKey.keys()].flatMap((key) => playerIdsByKey.get(key) ?? []) : []),
  ]);
  ids.forEach((id) => {
    const context = {};
    const projection = projectionFresh ? projections.get(String(id)) : null;
    if (Number.isFinite(projection?.projected)) {
      context.weeklyProjection = projection.projected;
      context.projectionUpdatedAt = projection?.factors?.providerCollectedAt ?? null;
    }
    if (designationsFresh) {
      const player = players?.[id];
      const key = getProviderIdentityKey(getProviderPlayerIdentity({
        name: player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' '),
        team: player?.team,
        position: player?.position,
      }));
      const matchingPlayerIds = key ? playerIdsByKey.get(key) ?? [] : [];
      const matches = key ? designationsByKey.get(key) ?? [] : [];
      if (matchingPlayerIds.length === 1 && matches.length === 1) {
        const row = matches[0];
        context.injury = row.injury ?? null;
        context.gameStatus = row.game_status ?? null;
        context.active = typeof row.active === 'boolean' ? row.active : null;
        context.practiceReports = (row.practice_reports ?? [])
          .filter((report) => report?.status)
          .map((report) => ({ date: report.date ?? null, status: report.status }));
        context.designationUpdatedAt = row.updated_at ?? null;
        // BDL's starter/did_not_play fields are postgame facts, so we
        // intentionally omit them from current/future Trade context.
      }
    }
    if (Object.values(context).some((value) => value != null && value !== '' && (!Array.isArray(value) || value.length))) {
      result.set(String(id), context);
    }
  });
  return result;
}

function getStarterEquivalents(rosterPositions = []) {
  const counts = Object.fromEntries(POSITION_GROUPS.map((group) => [group, 0]));
  const slots = Array.isArray(rosterPositions) ? rosterPositions : [];
  for (const rawSlot of slots) {
    const slot = String(rawSlot ?? '').trim().toUpperCase();
    const groups = SLOT_GROUPS[slot];
    if (!groups?.length) continue;
    const share = 1 / groups.length;
    for (const group of groups) counts[group] += share;
  }
  return counts;
}

function numericStat(stats, keys) {
  for (const key of keys) {
    const value = Number(stats?.[key]);
    if (stats?.[key] != null && Number.isFinite(value)) return value;
  }
  return null;
}

function gamesPlayed(stats, rows = []) {
  const explicit = Number(stats?.gp ?? stats?.games_played ?? stats?.gamesPlayed);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return rows.filter((row) => Number(row?.gp ?? row?.games_played ?? row?.gamesPlayed ?? 0) > 0
    || Object.entries(row ?? {}).some(([key, value]) => (
      !key.startsWith('_') && key !== 'week' && Number.isFinite(Number(value)) && Number(value) !== 0
    ))).length;
}

function roleVolume(position, stats) {
  const group = normalizeTradePositionGroup(position);
  if (!group || !stats) return null;
  if (group === 'QB') return (numericStat(stats, ['pass_att']) ?? 0) + (numericStat(stats, ['rush_att']) ?? 0);
  if (group === 'RB') {
    const attempts = numericStat(stats, ['rush_att']);
    const targets = numericStat(stats, ['rec_tgt', 'targets', 'tgt']);
    const receptions = numericStat(stats, ['rec']);
    return (attempts ?? 0) + (targets ?? receptions ?? 0);
  }
  if (group === 'WR' || group === 'TE') return numericStat(stats, ['rec_tgt', 'targets', 'tgt']) ?? numericStat(stats, ['rec']);
  if (group === 'K') {
    return ['fgm', 'fgmiss', 'xpm', 'xpmiss'].reduce((sum, key) => sum + (numericStat(stats, [key]) ?? 0), 0);
  }
  if (group === 'DL' || group === 'LB' || group === 'DB') {
    const tackles = numericStat(stats, ['idp_tkl'])
      ?? (numericStat(stats, ['idp_tkl_solo']) ?? 0) + (numericStat(stats, ['idp_tkl_ast']) ?? 0);
    return tackles
      + (numericStat(stats, ['idp_sack']) ?? 0)
      + (numericStat(stats, ['idp_int']) ?? 0)
      + (numericStat(stats, ['idp_pd', 'idp_pass_def']) ?? 0)
      + (numericStat(stats, ['idp_ff']) ?? 0)
      + (numericStat(stats, ['idp_fr', 'idp_fum_rec']) ?? 0)
      + (numericStat(stats, ['idp_qbhit', 'idp_qb_hit']) ?? 0);
  }
  if (group === 'DEF') {
    return (numericStat(stats, ['sack']) ?? 0)
      + (numericStat(stats, ['int']) ?? 0)
      + (numericStat(stats, ['def_ff']) ?? 0)
      + (numericStat(stats, ['def_td']) ?? 0)
      + (numericStat(stats, ['def_pass_def']) ?? 0);
  }
  return null;
}

const SNAP_FIELDS = {
  QB: ['off_snp', 'tm_off_snp'], RB: ['off_snp', 'tm_off_snp'], WR: ['off_snp', 'tm_off_snp'], TE: ['off_snp', 'tm_off_snp'],
  DL: ['def_snp', 'tm_def_snp'], LB: ['def_snp', 'tm_def_snp'], DB: ['def_snp', 'tm_def_snp'],
};
const RECENT_ROLE_WEEKS = 4;

/**
 * Share of team snaps over the team's most recent games, with the number of
 * team games observed, or null when snaps are not reported. Games the player
 * sat out still count, so an inactive player shows a zero share.
 */
function snapShare(position, rows = [], totals = null) {
  const [ownKey, teamKey] = SNAP_FIELDS[normalizeTradePositionGroup(position)] ?? [];
  if (!ownKey) return null;
  const recent = rows.filter((row) => Number(row?.[teamKey]) > 0)
    .sort((left, right) => Number(left?.week ?? 0) - Number(right?.week ?? 0))
    .slice(-RECENT_ROLE_WEEKS);
  const source = recent.length ? recent : (Number(totals?.[teamKey]) > 0 ? [totals] : []);
  const teamSnaps = source.reduce((sum, row) => sum + Number(row[teamKey]), 0);
  if (!teamSnaps) return null;
  const ownSnaps = source.reduce((sum, row) => sum + (Number(row?.[ownKey]) || 0), 0);
  return {
    share: Math.max(0, Math.min(1, ownSnaps / teamSnaps)),
    games: recent.length || Math.max(1, Number(totals?.gp) || 0),
  };
}

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Fill every team's lineup the way managers would: dedicated slots first, then
 * flex slots (narrowest first) with the best remaining eligible player. The
 * last player started at each position is that position's baseline, so
 * superflex and IDP flex demand move the baselines without hand tuning.
 */
function computePositionBaselines(pointsByGroup, rosterPositions, teams) {
  const sorted = new Map(POSITION_GROUPS.map((group) => [
    group,
    [...(pointsByGroup.get(group) ?? [])].sort((left, right) => right - left),
  ]));
  const started = Object.fromEntries(POSITION_GROUPS.map((group) => [group, 0]));
  const flexSlots = [];
  for (const rawSlot of Array.isArray(rosterPositions) ? rosterPositions : []) {
    const groups = SLOT_GROUPS[String(rawSlot ?? '').trim().toUpperCase()];
    if (!groups?.length) continue;
    if (groups.length === 1) started[groups[0]] += teams;
    else flexSlots.push(groups);
  }
  flexSlots.sort((left, right) => left.length - right.length);
  // A position that only reaches the lineup through flex, with nobody good
  // enough to start there, is measured against that flex slot's cutoff.
  const flexCutoff = new Map();
  for (const groups of flexSlots) {
    for (let team = 0; team < teams; team += 1) {
      let best = null;
      for (const group of groups) {
        const next = sorted.get(group)[started[group]];
        if (Number.isFinite(next) && (best == null || next > sorted.get(best)[started[best]])) best = group;
      }
      if (!best) continue;
      const filled = sorted.get(best)[started[best]];
      started[best] += 1;
      for (const group of groups) flexCutoff.set(group, Math.min(flexCutoff.get(group) ?? Infinity, filled));
    }
  }
  const baselines = new Map();
  for (const group of POSITION_GROUPS) {
    const points = sorted.get(group);
    const starters = Math.min(started[group], points.length);
    if (starters > 0) baselines.set(group, { points: points[starters - 1], starterCount: starters });
    else if (points.length && flexCutoff.has(group)) baselines.set(group, { points: flexCutoff.get(group), starterCount: 0 });
  }
  return baselines;
}

const WAIVER_SAMPLE = 3;
const MIN_ROSTERED_SHARE = 0.5;
// A free agent who is Doubtful, Out, or on a reserve list cannot replace anyone this week.
const WAIVER_MIN_AVAILABILITY = 0.95;
// Managers rarely bench a second kicker or D/ST, so estimated bench depth skips them.
const UNBENCHED_GROUPS = new Set(['K', 'DEF']);

function rosteredPlayerIds(rosters) {
  const ids = new Set();
  for (const roster of rosters) {
    for (const key of ['players', 'reserve', 'taxi']) {
      for (const id of roster?.[key] ?? []) if (id != null) ids.add(String(id));
    }
  }
  return ids;
}

function positionLimit(settings, group) {
  const limits = Object.entries(GROUP_ALIASES)
    .filter(([, aliasGroup]) => aliasGroup === group)
    .map(([alias]) => Number(settings?.[`position_limit_${alias.toLowerCase()}`]))
    .filter((limit) => Number.isFinite(limit) && limit > 0);
  return limits.length ? Math.max(...limits) : null;
}

/**
 * The waiver line is what a manager can add for free at each position: the
 * average of the best few players nobody has rostered. With roster data it
 * comes straight from the league; without it (or while rosters are under half
 * full), bench spots are spread across
 * positions in proportion to starter slots (kickers and D/ST excluded, and
 * capped by any position limit) to estimate how deep each position is
 * rostered. Free agents' short samples are trusted like everyone else's. The
 * line can sit above the starter line when managers leave better players on
 * waivers than some of the ones they start.
 */
function computeWaiverLines({ poolByGroup, baselines, rosters, league }) {
  const teams = rosters.length;
  const slots = (Array.isArray(league?.roster_positions) ? league.roster_positions : [])
    .map((slot) => String(slot ?? '').trim().toUpperCase());
  const benchSlots = slots.filter((slot) => slot === 'BN').length;
  // A league still drafting (or a mock) has empty rosters that would make every
  // player look freely available, so real rosters count once at least half full.
  const capacity = teams * slots.filter((slot) => slot === 'BN' || SLOT_GROUPS[slot]).length;
  const leagueRostered = rosteredPlayerIds(rosters);
  const rostered = leagueRostered.size >= capacity * MIN_ROSTERED_SHARE ? leagueRostered : new Set();
  const benchedStartersPerTeam = [...baselines]
    .filter(([group]) => !UNBENCHED_GROUPS.has(group))
    .reduce((sum, [, { starterCount }]) => sum + starterCount, 0) / teams;
  const waiverLines = new Map();
  for (const [group, baseline] of baselines) {
    const pool = [...(poolByGroup.get(group) ?? [])].sort((left, right) => right.ppg - left.ppg);
    let available;
    if (rostered.size) {
      available = pool.filter((entry) => !rostered.has(entry.id) && entry.available);
    } else {
      const benchShare = benchedStartersPerTeam > 0 && !UNBENCHED_GROUPS.has(group)
        ? benchSlots * baseline.starterCount / benchedStartersPerTeam
        : 0;
      const limit = positionLimit(league?.settings, group);
      const depth = Math.round(baseline.starterCount + benchShare);
      available = pool.slice(limit ? Math.min(depth, teams * limit) : depth).filter((entry) => entry.available);
    }
    const sample = available.slice(0, WAIVER_SAMPLE);
    if (!sample.length) {
      waiverLines.set(group, Math.min(pool.at(-1)?.ppg ?? 0, baseline.points));
      continue;
    }
    const rawLine = sample.reduce((sum, entry) => sum + entry.ppg, 0) / sample.length;
    waiverLines.set(group, sample.reduce((sum, entry) => sum + rawLine + (entry.ppg - rawLine) * entry.trust, 0) / sample.length);
  }
  return waiverLines;
}

// Points between the waiver line and the starter line only help when a player
// fills in or covers a starter, so they count at half weight. Points above the
// starter line count in full. Points below the waiver line are negative: a
// free agent would do as well.
const BENCH_WEIGHT = 0.5;

function valueOverWaivers(points, starterLine, waiverLine) {
  if (waiverLine >= starterLine) return points - waiverLine;
  if (points >= starterLine) return points - starterLine + BENCH_WEIGHT * (starterLine - waiverLine);
  if (points >= waiverLine) return BENCH_WEIGHT * (points - waiverLine);
  return points - waiverLine;
}

// One curve for every position, fixed at three points: the waiver line
// scores 15, the league's median starter scores 50, and the 95th-percentile
// starter scores 90. Positions with plenty of viable free agents sit lower,
// and nobody hits a hard zero cutoff.
const WAIVER_SCORE = 15;
const TOP_STARTER_SCORE = 90;
const TOP_STARTER_QUANTILE = 0.95;
const MIN_CURVE_SPREAD = 0.25;

function buildProductionCurve(starterValues) {
  const median = Math.max(0, quantile(starterValues, 0.5) ?? 0);
  const top = Math.max(median, quantile(starterValues, TOP_STARTER_QUANTILE) ?? median);
  const lowSpread = Math.max(MIN_CURVE_SPREAD, median / Math.log(100 / WAIVER_SCORE - 1));
  const highSpread = Math.max(MIN_CURVE_SPREAD, (top - median) / Math.log(TOP_STARTER_SCORE / (100 - TOP_STARTER_SCORE)));
  // A logistic centered on the median starter scores exactly 50 there.
  return (value) => {
    const spread = value < median ? lowSpread : highSpread;
    return 100 / (1 + Math.exp((median - value) / spread));
  };
}

// Mild current-availability discount. Dynasty spans several seasons, so a
// current absence carries half the redraft discount.
const AVAILABILITY_FACTORS = {
  QUESTIONABLE: 0.97, DOUBTFUL: 0.9, OUT: 0.85, SUS: 0.8, SUSPENDED: 0.8, IR: 0.7, PUP: 0.7, NFI: 0.7,
};
const RESERVE_STATUS_PATTERN = /INJURED RESERVE|PHYSICALLY UNABLE|NON[- ]FOOTBALL/;

export function getTradeAvailabilityFactor(player, context = null, format = 'redraft') {
  const designation = String(context?.gameStatus ?? player?.injury_status ?? '').trim().toUpperCase();
  const rosterStatus = String(player?.status ?? '').trim().toUpperCase();
  const factor = Math.min(
    AVAILABILITY_FACTORS[designation] ?? 1,
    RESERVE_STATUS_PATTERN.test(rosterStatus) ? AVAILABILITY_FACTORS.IR : 1,
  );
  return format === 'dynasty' ? 1 - (1 - factor) / 2 : factor;
}

function confidenceAdjusted(score, confidence) {
  return Math.round(50 + ((score ?? 50) - 50) * Math.max(0, Math.min(1, confidence)));
}

function weightedMean(signals) {
  let total = 0;
  let weight = 0;
  for (const [score, signalWeight] of signals) {
    if (!Number.isFinite(score) || signalWeight <= 0) continue;
    total += score * signalWeight;
    weight += signalWeight;
  }
  return weight ? total / weight : null;
}

// A fresh weekly projection counts as two games of evidence.
const PROJECTION_GAMES = 2;
// Points above or below the lines are trusted as games / (games + c), where
// c = (1 - rho) / rho and rho is the measured game-to-game reliability of
// fantasy scoring at the position: odd-week vs. even-week points per game for
// regular players in 2024 and 2025 (selected by playing time, not points),
// stepped up to one game with Spearman-Brown, geometric mean of both seasons.
const STABILITY_GAMES = { QB: 5, RB: 1.5, WR: 2, TE: 1.5, LB: 4, DL: 5, DB: 20, K: 30, DEF: 30 };
const PRODUCTION_WEIGHT = 60;
const FULL_PHASE_GROUPS = new Set(['K', 'DEF']);

// Last season is each player's starting point once it has a quarter-season
// sample. Both numbers below were fitted per position on 2023->2024 and
// 2024->2025 (games with 15+ snaps, 20+ for quarterbacks): PRIOR_WORTH_GAMES
// is how many current-season games last season is worth when blending it with
// weeks 1-7 to predict weeks 8-18, and CARRYOVER is the share of that blended
// edge over the position that actually held up for the rest of the season.
const MIN_PRIOR_GAMES = 4;
const PRIOR_WORTH_GAMES = { QB: 5, RB: 6, WR: 3.5, TE: 4, K: 10.5, DEF: 2.5, DL: 9.5, LB: 6.5, DB: 12 };
const CARRYOVER = { QB: 0.5, RB: 0.95, WR: 0.8, TE: 0.95, K: 0.35, DEF: 0.7, DL: 0.85, LB: 0.65, DB: 0.45 };

function sampleTrust(evidence) {
  return evidence.currentEvidence / (evidence.currentEvidence + STABILITY_GAMES[evidence.group]);
}
const ROLE_WEIGHT = 15;

/**
 * Build the local production-and-role portion of the Trade score.
 * Production is points per game over the position's waiver line, with full
 * credit above the league's starter line, on one cross-position curve. Role
 * is the share of team snaps (or opportunity volume when snaps are
 * unreported), relative to a typical starter at the position. A mild injury
 * discount applies last.
 */
export function computeFantasyViabilityTradeValues({
  players,
  seasonStats,
  weeklyStats,
  priorSeasonStats = null,
  priorWeeklyStats = null,
  scoringSettings,
  league,
  rosters,
  format = 'redraft',
  currentContextMap = null,
} = {}) {
  const result = new Map();
  if (!players || !scoringSettings || !Array.isArray(rosters) || !rosters.length) return result;

  const starterCounts = getStarterEquivalents(league?.roster_positions);
  const evidenceById = new Map();
  let maxGames = 0;

  for (const [id, player] of Object.entries(players)) {
    const group = normalizeTradePositionGroup(player?.position);
    if (!group || starterCounts[group] <= 0) continue;
    const currentStats = seasonStats?.[id] ?? null;
    const currentWeeks = weeklyStats?.[id] ?? [];
    const priorStats = priorSeasonStats?.[id] ?? null;
    const priorWeeks = priorWeeklyStats?.[id] ?? [];
    const currentGames = gamesPlayed(currentStats, currentWeeks);
    const priorGames = gamesPlayed(priorStats, priorWeeks);
    const currentPoints = currentStats && currentGames > 0
      ? calcPointsFromTotals(currentStats, scoringSettings, player.position) / currentGames
      : null;
    const priorPoints = priorStats && priorGames > 0
      ? calcPointsFromTotals(priorStats, scoringSettings, player.position) / priorGames
      : null;
    const sampleGames = currentGames;
    const projection = Number(currentContextMap?.get(String(id))?.weeklyProjection);
    const hasProjection = Number.isFinite(projection) && projection > 0;
    const currentEvidence = currentGames + (hasProjection ? PROJECTION_GAMES : 0);
    const currentPpg = weightedMean([[currentPoints, currentGames], [projection, hasProjection ? PROJECTION_GAMES : 0]]);
    // Dynasty's multi-year view weighs last season at least as much as this one.
    const hasPrior = Number.isFinite(priorPoints) && priorGames >= MIN_PRIOR_GAMES;
    const redraftPriorWeight = hasPrior ? Math.min(PRIOR_WORTH_GAMES[group], priorGames) : 0;
    const priorWeight = hasPrior && format === 'dynasty' ? Math.max(redraftPriorWeight, currentEvidence) : redraftPriorWeight;

    const currentSnaps = snapShare(player.position, currentWeeks, currentStats);
    const priorSnaps = snapShare(player.position, priorWeeks, priorStats);
    const currentVolume = currentWeeks.length
      ? weightedMean(currentWeeks.map((row) => [roleVolume(player.position, row), 1]))
      : currentStats && currentGames > 0 ? (roleVolume(player.position, currentStats) ?? 0) / currentGames : null;
    const priorVolume = priorWeeks.length
      ? weightedMean(priorWeeks.map((row) => [roleVolume(player.position, row), 1]))
      : priorStats && priorGames > 0 ? (roleVolume(player.position, priorStats) ?? 0) / priorGames : null;

    maxGames = Math.max(maxGames, sampleGames);
    evidenceById.set(String(id), {
      group,
      currentPpg,
      currentEvidence,
      priorPoints: hasPrior ? priorPoints : null,
      priorWeight,
      sampleGames,
      hasProjection,
      currentSnaps,
      priorSnaps,
      currentVolume,
      priorVolume,
      availability: getTradeAvailabilityFactor(player, currentContextMap?.get(String(id)), format),
      canPlayNow: getTradeAvailabilityFactor(player, currentContextMap?.get(String(id))) >= WAIVER_MIN_AVAILABILITY,
    });
  }

  // Once games are underway, a healthy player who has not played this season
  // does not coast on last season's points or snaps.
  for (const evidence of evidenceById.values()) {
    const priorCounts = maxGames === 0 || evidence.currentEvidence > 0 || !evidence.canPlayNow;
    evidence.priorCounts = priorCounts && evidence.priorWeight > 0;
    evidence.pooledPpg = weightedMean([
      [evidence.priorPoints, evidence.priorCounts ? evidence.priorWeight : 0],
      [evidence.currentPpg, evidence.currentEvidence],
    ]);
    const priorRole = priorCounts ? 1 : 0;
    evidence.share = weightedMean([[evidence.currentSnaps?.share, 1], [evidence.priorSnaps?.share, priorRole]]);
    evidence.volume = weightedMean([[evidence.currentVolume, 1], [evidence.priorVolume, priorRole]]);
    const roleGames = Math.max(evidence.currentSnaps?.games ?? 0, priorRole ? evidence.priorSnaps?.games ?? 0 : 0, evidence.sampleGames);
    evidence.roleConfidence = Math.min(1, roleGames / RECENT_ROLE_WEEKS);
  }

  // One-game samples can rank a fill-in ahead of real starters, so the lines
  // use players with at least two games this season once it has that many.
  const baselineSample = Math.min(2, maxGames);
  const playingNow = (evidence) => evidence.sampleGames >= baselineSample || evidence.hasProjection;
  const sharesByGroup = new Map(POSITION_GROUPS.map((group) => [group, []]));
  const volumesByGroup = new Map(POSITION_GROUPS.map((group) => [group, []]));
  for (const evidence of evidenceById.values()) {
    if (evidence.share > 0) sharesByGroup.get(evidence.group).push(evidence.share);
    if (evidence.volume > 0) volumesByGroup.get(evidence.group).push(evidence.volume);
  }
  const computeLines = (pointsOf, trustOf) => {
    const poolByGroup = new Map(POSITION_GROUPS.map((group) => [group, []]));
    for (const [id, evidence] of evidenceById) {
      const points = pointsOf(evidence);
      if (!Number.isFinite(points) || !playingNow(evidence)) continue;
      poolByGroup.get(evidence.group).push({ id, ppg: points, trust: trustOf(evidence), available: evidence.canPlayNow });
    }
    const pointsByGroup = new Map([...poolByGroup].map(([group, pool]) => [group, pool.map((entry) => entry.ppg)]));
    const baselines = computePositionBaselines(pointsByGroup, league?.roster_positions, rosters.length);
    return { baselines, waiverLines: computeWaiverLines({ poolByGroup, baselines, rosters, league }) };
  };
  // A returning player's blend keeps the measured share of its edge over the
  // position's starter line. A player without a recent season settles toward
  // this season's waiver line, the level any manager can reach for free, in
  // proportion to games played.
  const firstPass = computeLines((evidence) => evidence.pooledPpg, (evidence) => (evidence.priorCounts ? CARRYOVER[evidence.group] : sampleTrust(evidence)));
  for (const evidence of evidenceById.values()) {
    const starterLine = firstPass.baselines.get(evidence.group)?.points;
    const waiverLine = firstPass.waiverLines.get(evidence.group);
    if (!Number.isFinite(evidence.pooledPpg)) evidence.ppg = null;
    else if (evidence.priorCounts) {
      evidence.ppg = Number.isFinite(starterLine)
        ? starterLine + (evidence.pooledPpg - starterLine) * CARRYOVER[evidence.group]
        : evidence.pooledPpg;
    } else {
      evidence.ppg = Number.isFinite(waiverLine) ? waiverLine + (evidence.pooledPpg - waiverLine) * sampleTrust(evidence) : null;
    }
  }
  // Starter and waiver lines then come from everyone's settled scoring, so a
  // free agent's short hot streak does not set the bar for the position.
  const { baselines, waiverLines } = computeLines((evidence) => evidence.ppg, () => 1);
  const trustedValue = (evidence) => {
    const baseline = baselines.get(evidence.group);
    if (!baseline || !Number.isFinite(evidence.ppg)) return null;
    return valueOverWaivers(evidence.ppg, baseline.points, waiverLines.get(evidence.group));
  };
  const starterValues = [];
  for (const evidence of evidenceById.values()) {
    const baseline = baselines.get(evidence.group);
    if (!baseline || !(evidence.ppg >= baseline.points) || !playingNow(evidence)) continue;
    starterValues.push(trustedValue(evidence));
  }
  const productionCurve = buildProductionCurve(starterValues);
  // A typical starter's role (90th percentile at the position) counts as a full role.
  const fullShare = new Map(POSITION_GROUPS.map((group) => [group, quantile(sharesByGroup.get(group), 0.9)]));
  const fullVolume = new Map(POSITION_GROUPS.map((group) => [group, quantile(volumesByGroup.get(group), 0.9)]));

  for (const [id, evidence] of evidenceById) {
    const value = trustedValue(evidence);
    const productionScore = Number.isFinite(value) ? productionCurve(value) : null;
    const shareNorm = fullShare.get(evidence.group);
    const volumeNorm = fullVolume.get(evidence.group);
    const rawRole = Number.isFinite(evidence.share) && shareNorm > 0
      ? 100 * Math.min(1, evidence.share / shareNorm)
      : evidence.volume > 0 && volumeNorm > 0 ? 100 * Math.min(1, evidence.volume / volumeNorm) : null;
    // Every rostered kicker and D/ST plays its whole phase, so role adds no
    // playing-time signal there; it only stands in when production is missing.
    const roleCounts = !FULL_PHASE_GROUPS.has(evidence.group) || !Number.isFinite(productionScore);
    const roleScore = Number.isFinite(rawRole) && roleCounts ? confidenceAdjusted(rawRole, evidence.roleConfidence) : null;
    // Missing evidence is redistributed across the available local signals;
    // KTC supplies the separate 25% when present.
    const score = weightedMean([
      [productionScore, PRODUCTION_WEIGHT],
      [roleScore, ROLE_WEIGHT],
    ]);
    if (Number.isFinite(score)) {
      result.set(id, Math.max(1, Math.min(100, Math.round(score * evidence.availability))));
    }
  }

  return result;
}

// Compatibility export for existing callers while the shared snapshot and
// consumers migrate from the old replacement-based name.
export const computeLeagueUtilityTradeValues = computeFantasyViabilityTradeValues;

/** Convert a KTC value to its ordinal market percentile, bounded to 0–100. */
export function normalizeKtcMarketValues(ktcPlayers, leagueType = '1qb') {
  const values = (ktcPlayers ?? []).map((player) => {
    const group = normalizeTradePositionGroup(player?.position);
    const entry = leagueType === 'sf' ? player?.superflexValues : player?.oneQBValues;
    return { player, group, value: entry?.value == null || entry.value === '' ? NaN : Number(entry.value) };
  // KTC uses zero for unvalued/placeholder entries as well as the floor of
  // its list. A zero cannot establish that an asset has no trade utility, so
  // exclude it from both the percentile population and player lookup.
  }).filter((entry) => entry.group && Number.isFinite(entry.value) && entry.value > 0);

  const scores = new Map();
  if (values.length < 2) return scores;
  for (const entries of [values]) {
    entries.sort((left, right) => right.value - left.value);
    let index = 0;
    while (index < entries.length) {
      let end = index + 1;
      while (end < entries.length && entries[end].value === entries[index].value) end += 1;
      const averageIndex = (index + end - 1) / 2;
      const score = entries.length === 1
        ? 100
        : Math.round(1 + 99 * (1 - averageIndex / (entries.length - 1)));
      for (let cursor = index; cursor < end; cursor += 1) scores.set(entries[cursor].player, score);
      index = end;
    }
  }
  return scores;
}

export function normalizeKtcMarketValue(value, ktcPlayers, leagueType = '1qb') {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const peers = (ktcPlayers ?? []).filter((player) => player?.position !== 'RDP').map((player) => {
    const source = leagueType === 'sf' ? player?.superflexValues : player?.oneQBValues;
    return source?.value == null || source.value === '' ? NaN : Number(source.value);
  }).filter((candidate) => Number.isFinite(candidate) && candidate > 0);
  if (peers.length < 2) return null;
  const less = peers.filter((candidate) => candidate < numeric).length;
  const equal = peers.filter((candidate) => candidate === numeric).length;
  // A value outside the peer list (a pick below every player) has no tie to
  // average, so it ranks by the players beneath it and stays within 1–100.
  const rankFromBottom = less + Math.max(0, equal - 1) / 2;
  return Math.max(1, Math.min(100, Math.round(1 + 99 * rankFromBottom / (peers.length - 1))));
}

export function combineTradeValueSignals(utilityScore, marketScore) {
  const localScore = Number.isFinite(utilityScore)
    ? Math.max(TRADE_VALUE_SCALE_MIN, Math.min(TRADE_VALUE_SCALE_MAX, utilityScore))
    : null;
  const normalizedMarketScore = Number.isFinite(marketScore)
    ? Math.max(TRADE_VALUE_SCALE_MIN, Math.min(TRADE_VALUE_SCALE_MAX, marketScore))
    : null;
  if (localScore == null && normalizedMarketScore == null) return null;
  if (localScore == null) return Math.round(normalizedMarketScore);
  if (normalizedMarketScore == null) return Math.round(localScore);
  return Math.round(localScore * 0.75 + normalizedMarketScore * 0.25);
}
