import { calcPointsFromTotals } from './scoringEngine.js';
import { getProviderIdentityKey, getProviderPlayerIdentity } from './providerPlayerIdentity.js';

export const LEGACY_TRADE_VALUE_SCALE_IDS = Object.freeze(['league-utility-0-100-v1']);
export const TRADE_VALUE_SCALE_ID = 'fantasy-viability-0-100-v2';
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

function rankScores(entries) {
  const sorted = entries.filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => right.value - left.value);
  const result = new Map();
  if (!sorted.length) return result;
  if (sorted.length === 1) {
    result.set(sorted[0].id, 50);
    return result;
  }
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    const averageIndex = (index + end - 1) / 2;
    const score = Math.round(1 + 99 * (1 - averageIndex / (sorted.length - 1)));
    for (let cursor = index; cursor < end; cursor += 1) result.set(sorted[cursor].id, score);
    index = end;
  }
  return result;
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

/**
 * Build the local production-and-role portion of the Trade score. Production
 * is ranked across supported fantasy positions, role is ranked within position,
 * then values receive a light starter-slot scarcity signal.
 * No replacement player or replacement PPG is calculated.
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
  const productionEntries = [];
  const roleEntries = new Map(POSITION_GROUPS.map((group) => [group, []]));
  const projectionEntries = new Map(POSITION_GROUPS.map((group) => [group, []]));
  const evidenceById = new Map();

  for (const [id, player] of Object.entries(players)) {
    const group = normalizeTradePositionGroup(player?.position);
    if (!group || starterCounts[group] <= 0) continue;
    const currentStats = seasonStats?.[id] ?? null;
    const currentWeeks = weeklyStats?.[id] ?? [];
    const priorStats = format === 'dynasty' ? priorSeasonStats?.[id] ?? null : null;
    const priorWeeks = format === 'dynasty' ? priorWeeklyStats?.[id] ?? [] : [];
    const currentGames = gamesPlayed(currentStats, currentWeeks);
    const priorGames = gamesPlayed(priorStats, priorWeeks);
    const currentPoints = currentStats && currentGames > 0
      ? calcPointsFromTotals(currentStats, scoringSettings, player.position) / currentGames
      : null;
    const priorPoints = priorStats && priorGames > 0
      ? calcPointsFromTotals(priorStats, scoringSettings, player.position) / priorGames
      : null;
    const ppg = weightedMean([[currentPoints, 1], [priorPoints, 1]]);
    if (Number.isFinite(ppg)) productionEntries.push({ id: String(id), value: ppg });

    const currentVolume = currentWeeks.length
      ? weightedMean(currentWeeks.map((row) => [roleVolume(player.position, row), 1]))
      : currentStats && currentGames > 0 ? (roleVolume(player.position, currentStats) ?? 0) / currentGames : null;
    const priorVolume = priorWeeks.length
      ? weightedMean(priorWeeks.map((row) => [roleVolume(player.position, row), 1]))
      : priorStats && priorGames > 0 ? (roleVolume(player.position, priorStats) ?? 0) / priorGames : null;
    const roleValue = weightedMean([[currentVolume, 1], [priorVolume, 1]]);
    const roleGames = Math.max(currentGames, priorGames);
    const roleConfidence = Math.min(1, roleGames / 4);
    if (Number.isFinite(roleValue) && roleValue > 0) roleEntries.get(group).push({ id: String(id), value: roleValue });

    const projection = Number(currentContextMap?.get(String(id))?.weeklyProjection);
    if (Number.isFinite(projection) && projection > 0) projectionEntries.get(group).push({ id: String(id), value: projection });
    evidenceById.set(String(id), {
      group,
      ppg,
      productionConfidence: Math.min(1, Math.max(currentGames, priorGames) / 4),
      roleValue,
      roleConfidence,
      projection,
    });
  }

  const productionRanks = new Map();
  const roleRanks = new Map();
  const projectionRanks = new Map();
  for (const [id, score] of rankScores(productionEntries)) productionRanks.set(id, score);
  for (const group of POSITION_GROUPS) {
    for (const [id, score] of rankScores(roleEntries.get(group))) roleRanks.set(id, score);
    for (const [id, score] of rankScores(projectionEntries.get(group))) projectionRanks.set(id, score);
  }

  const activeScarcityEntries = POSITION_GROUPS
    .filter((group) => starterCounts[group] > 0)
    .map((group) => ({ id: group, value: starterCounts[group] }));
  const scarcityRanks = rankScores(activeScarcityEntries);
  const scarcityByGroup = new Map(POSITION_GROUPS.map((group) => [group, scarcityRanks.get(group) ?? 50]));

  for (const [id, evidence] of evidenceById) {
    const productionScore = productionRanks.has(id)
      ? confidenceAdjusted(productionRanks.get(id), evidence.productionConfidence)
      : null;
    const localRoleScore = roleRanks.has(id)
      ? confidenceAdjusted(roleRanks.get(id), evidence.roleConfidence)
      : null;
    const projectionScore = projectionRanks.get(id) ?? null;
    const roleScore = weightedMean([
      [localRoleScore, evidence.roleConfidence],
      [projectionScore, Number.isFinite(evidence.projection) ? 1 : 0],
    ]);
    if (!Number.isFinite(productionScore) && !Number.isFinite(roleScore)) continue;
    const scarcityScore = starterCounts[evidence.group] > 0 ? scarcityByGroup.get(evidence.group) : null;
    // 35% production, 35% role, and 5% mild starter-slot scarcity make up the
    // 75% local portion. Missing evidence is redistributed across available
    // local signals; KTC supplies the separate 25% when present.
    const score = weightedMean([
      [productionScore, 35],
      [roleScore, 35],
      [scarcityScore, 5],
    ]);
    if (Number.isFinite(score)) result.set(id, Math.max(1, Math.min(100, Math.round(score))));
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
  const rankFromBottom = less + (equal - 1) / 2;
  return Math.round(1 + 99 * rankFromBottom / (peers.length - 1));
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
