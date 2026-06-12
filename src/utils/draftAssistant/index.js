import { buildRosterNeedProfile, getPositionNeedScore } from './rosterNeed.js';
import { getPlayerProjectionProfile, playerSupportsDraftAssistant, sortDraftPlayersByProjection } from './projections.js';
import { rankDraftCandidates } from './recommendations.js';
import { createPointsCalculator, getRecentAvg } from '../scoringEngine.js';
export {
  getSleeperDraftStatus,
  getSleeperDraftStartMs,
  getSleeperDraftPicksSignature,
  getSleeperDraftSemanticSignature,
  getSleeperDraftTradedPicksSignature,
  getScheduledDraftCountdownParts,
  isSleeperDraftActiveRoom,
  isSleeperDraftLive,
  isSleeperDraftMock,
  isSleeperDraftPollable,
  isSleeperDraftPreDraft,
  isSleeperUserDraftParticipant,
  resolveLeagueDraftId,
  shouldShowSleeperDraftGlobalNotice,
  shouldRefreshSleeperDraftPicks,
  shouldRefreshSleeperDraftTradedPicks,
} from './draftStatus.js';

export const DEFAULT_DRAFT_MODEL_WEIGHTS = {
  marketRank: 40,
  pastProduction: 25,
  scoringFit: 20,
  rosterNeed: 15,
};
const DRAFT_MODEL_WEIGHT_TOTAL = 100;

const SCORING_CATEGORY_DEFINITIONS = [
  {
    id: 'passing',
    label: 'Passing',
    positions: ['QB'],
    keys: ['pass_yd', 'pass_td', 'pass_int', 'pass_cmp', 'pass_att', 'pass_inc', 'pass_fd', 'pass_sack', 'bonus_pass_yd_300', 'bonus_pass_yd_400', 'bonus_pass_cmp_25', 'bonus_pass_td_40p', 'bonus_pass_td_50p', 'bonus_pass_cmp_40p'],
  },
  {
    id: 'receiving',
    label: 'Receiving',
    positions: ['RB', 'WR', 'TE'],
    keys: ['rec', 'rec_yd', 'rec_td', 'rec_fd', 'bonus_rec_rb', 'bonus_rec_wr', 'bonus_rec_te', 'rec_0_4', 'rec_5_9', 'rec_10_19', 'rec_20_29', 'rec_30_39'],
  },
  {
    id: 'rushing',
    label: 'Rushing',
    positions: ['QB', 'RB'],
    keys: ['rush_yd', 'rush_td', 'rush_fd', 'bonus_rush_att', 'bonus_rush_yd_100', 'bonus_rush_yd_200', 'bonus_rush_att_20', 'bonus_rush_td_40p', 'bonus_rush_td_50p', 'bonus_rush_40p'],
  },
  {
    id: 'te-premium',
    label: 'TE Premium',
    positions: ['TE'],
    keys: ['bonus_rec_te'],
  },
  {
    id: 'first-downs',
    label: 'First Downs',
    positions: ['QB', 'RB', 'WR', 'TE'],
    keys: ['pass_fd', 'rush_fd', 'rec_fd', 'bonus_fd_qb', 'bonus_fd_rb', 'bonus_fd_wr', 'bonus_fd_te'],
  },
  {
    id: 'big-play',
    label: 'Big Play',
    positions: ['QB', 'RB', 'WR', 'TE', 'DEF', 'DL', 'LB', 'DB'],
    keys: ['bonus_pass_td_40p', 'bonus_pass_td_50p', 'bonus_pass_cmp_40p', 'bonus_rush_td_40p', 'bonus_rush_td_50p', 'bonus_rec_td_40p', 'bonus_rec_td_50p', 'bonus_rec_40p', 'bonus_rush_40p', 'bonus_def_fum_td_50p', 'bonus_def_int_td_50p'],
  },
  {
    id: 'kicker',
    label: 'Kicker',
    positions: ['K'],
    keys: ['fgm', 'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50_59', 'fgm_60p', 'fgm_yds', 'fgm_yds_over_30', 'xpm'],
  },
  {
    id: 'dst',
    label: 'Defense',
    positions: ['DEF'],
    keys: ['def_td', 'def_2pt', 'def_3_and_out', 'def_4_and_stop', 'def_forced_punts', 'def_pass_def', 'sack', 'int', 'safe', 'pts_allow', 'yds_allow'],
  },
  {
    id: 'idp',
    label: 'IDP',
    positions: ['DL', 'LB', 'DB'],
    keys: ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'idp_sack', 'idp_int', 'idp_ff', 'idp_fr', 'idp_pd', 'idp_qbhit', 'bonus_sack_2p', 'bonus_tkl_10p', 'idp_pass_def_3p'],
  },
];

function normalizePosition(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'DST') return 'DEF';
  return normalized || null;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function roundTo(value, precision = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** precision;
  return Math.round(parsed * factor) / factor;
}

export function getDraftStatsSeason(draftSeason) {
  const numeric = Number.parseInt(String(draftSeason ?? ''), 10);
  if (!Number.isFinite(numeric)) return null;
  return String(Math.max(2017, numeric - 1));
}

export function normalizeDraftModelWeights(weights = {}) {
  const raw = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_DRAFT_MODEL_WEIGHTS)) {
    const value = toFiniteNumber(weights?.[key]);
    raw[key] = Math.round(clamp(value ?? defaultValue, 0, DRAFT_MODEL_WEIGHT_TOTAL) ?? defaultValue);
  }
  const rawTotal = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (rawTotal <= DRAFT_MODEL_WEIGHT_TOTAL) return raw;

  return distributeDraftModelWeights(
    Object.keys(DEFAULT_DRAFT_MODEL_WEIGHTS),
    DRAFT_MODEL_WEIGHT_TOTAL,
    raw,
  );
}

function distributeDraftModelWeights(keys, total, sourceWeights) {
  if (!keys.length) return {};

  const nextTotal = Math.round(clamp(total, 0, DRAFT_MODEL_WEIGHT_TOTAL) ?? 0);
  if (nextTotal <= 0) return Object.fromEntries(keys.map((key) => [key, 0]));

  const sources = keys.map((key, index) => ({
    key,
    index,
    source: Math.max(0, toFiniteNumber(sourceWeights?.[key]) ?? 0),
  }));
  const sourceTotal = sources.reduce((sum, item) => sum + item.source, 0);
  const allocations = sources.map((item) => {
    const quota = sourceTotal > 0
      ? (item.source / sourceTotal) * nextTotal
      : nextTotal / sources.length;
    const floor = Math.floor(quota);
    return {
      ...item,
      floor,
      fraction: quota - floor,
    };
  });

  let remainder = nextTotal - allocations.reduce((sum, item) => sum + item.floor, 0);
  const remainderOrder = [...allocations].sort((a, b) => (
    b.fraction - a.fraction
      || b.source - a.source
      || a.index - b.index
  ));
  const result = Object.fromEntries(allocations.map((item) => [item.key, item.floor]));
  for (const item of remainderOrder) {
    if (remainder <= 0) break;
    result[item.key] += 1;
    remainder -= 1;
  }
  return result;
}

export function rebalanceDraftModelWeights(weights = {}, changedKey, changedValue) {
  const keys = Object.keys(DEFAULT_DRAFT_MODEL_WEIGHTS);
  if (!keys.includes(changedKey)) return normalizeDraftModelWeights(weights);

  const current = normalizeDraftModelWeights(weights);
  const fixedValue = Math.round(clamp(changedValue, 0, DRAFT_MODEL_WEIGHT_TOTAL) ?? 0);
  const next = {
    ...current,
    [changedKey]: fixedValue,
  };
  const nextTotal = Object.values(next).reduce((sum, value) => sum + value, 0);
  if (nextTotal <= DRAFT_MODEL_WEIGHT_TOTAL) return next;

  const otherKeys = keys.filter((key) => key !== changedKey);
  const remainingTotal = DRAFT_MODEL_WEIGHT_TOTAL - fixedValue;
  if (remainingTotal <= 0) {
    return Object.fromEntries(keys.map((key) => [key, key === changedKey ? fixedValue : 0]));
  }
  const distributed = distributeDraftModelWeights(
    otherKeys,
    remainingTotal,
    current,
  );

  return Object.fromEntries(keys.map((key) => [
    key,
    key === changedKey ? fixedValue : distributed[key],
  ]));
}

function getScoringValue(scoringSettings, key) {
  const value = toFiniteNumber(scoringSettings?.[key]);
  return value == null ? 0 : value;
}

export function categorizeDraftScoringSettings(scoringSettings = {}) {
  return SCORING_CATEGORY_DEFINITIONS
    .map((definition) => {
      const activeKeys = definition.keys
        .map((key) => ({ key, value: getScoringValue(scoringSettings, key) }))
        .filter((item) => item.value !== 0);
      if (!activeKeys.length) return null;
      return {
        id: definition.id,
        label: definition.label,
        positions: definition.positions,
        keys: activeKeys,
      };
    })
    .filter(Boolean);
}

function getRelevantScoringLevers(scoringCategories, position) {
  const normalized = normalizePosition(position);
  return (scoringCategories ?? [])
    .filter((category) => category.positions.includes(normalized))
    .map((category) => ({
      id: category.id,
      label: category.label,
      keys: category.keys.slice(0, 4),
    }));
}

function getAveragePpg(weeklyRows, scoringSettings, position) {
  if (!weeklyRows?.length) return 0;
  const calcPoints = createPointsCalculator(scoringSettings);
  const scored = weeklyRows.map((week) => calcPoints(week, position)).filter((points) => points > 0);
  if (!scored.length) return 0;
  return Math.round((scored.reduce((sum, points) => sum + points, 0) / scored.length) * 10) / 10;
}

function computeDraftPositionalRanks(seasonStats, players, scoringSettings) {
  if (!seasonStats || !players) return {};
  const calcPoints = createPointsCalculator(scoringSettings);
  const byPosition = {};

  for (const [id, stats] of Object.entries(seasonStats ?? {})) {
    const player = players?.[id];
    const position = normalizePosition(player?.fantasy_positions?.[0] ?? player?.position);
    if (!position) continue;
    const points = calcPoints(stats, player?.position);
    if (points <= 0) continue;
    if (!byPosition[position]) byPosition[position] = [];
    byPosition[position].push({ id, points });
  }

  const ranks = {};
  for (const [position, rows] of Object.entries(byPosition)) {
    rows.sort((a, b) => b.points - a.points);
    rows.forEach((row, index) => {
      ranks[row.id] = { rank: index + 1, posCount: rows.length, posLabel: position };
    });
  }
  return ranks;
}

function normalizeRosterId(value) {
  return value == null || value === '' ? null : String(value);
}

const NON_CURRENT_PLAYER_STATUSES = new Set([
  'inactive',
  'retired',
  'reserve/retired',
  'reserve retired',
]);

function normalizePlayerStatus(player) {
  return String(player?.status ?? player?.metadata?.status ?? '').trim().toLowerCase();
}

function hasCurrentTeam(player) {
  const team = String(player?.team ?? player?.team_abbr ?? '').trim().toUpperCase();
  return Boolean(team) && team !== 'FA' && team !== 'NONE' && team !== '—';
}

function isCurrentDraftCandidate(player, projection) {
  const status = normalizePlayerStatus(player);
  if (NON_CURRENT_PLAYER_STATUSES.has(status)) return false;
  if (player?.active === false) return false;
  if (projection?.marketRank != null || projection?.marketPositionRank != null) return true;
  return hasCurrentTeam(player);
}

function resolvePickRosterId(rawPick, draft = null) {
  const explicitRosterId = rawPick?.roster_id != null ? String(rawPick.roster_id) : null;
  if (explicitRosterId) return explicitRosterId;

  const draftSlot = rawPick?.draft_slot ?? rawPick?.slot;
  if (draftSlot == null) return null;

  const slotRosterId = draft?.slot_to_roster_id?.[String(draftSlot)] ?? draft?.slot_to_roster_id?.[Number(draftSlot)];
  return slotRosterId != null ? String(slotRosterId) : null;
}

export function normalizeDraftPick(rawPick, index = 0, draft = null) {
  if (!rawPick || typeof rawPick !== 'object') return null;
  const playerId = rawPick.player_id != null ? String(rawPick.player_id) : null;
  const rosterId = resolvePickRosterId(rawPick, draft);
  const pickedBy = rawPick.picked_by != null ? String(rawPick.picked_by) : null;
  const round = toFiniteNumber(rawPick.round ?? rawPick.draft_round);
  const draftSlot = toFiniteNumber(rawPick.draft_slot ?? rawPick.pick_no ?? rawPick.pick ?? rawPick.round_pick);
  const overall = toFiniteNumber(rawPick.pick_no ?? rawPick.pick_number ?? rawPick.metadata?.pick_no) ?? (index + 1);
  if (!rosterId || !round) return null;
  return {
    id: String(rawPick.pick_id ?? rawPick.transaction_id ?? `${rosterId}-${overall}`),
    playerId,
    rosterId,
    pickedBy,
    round,
    overall,
    draftSlot: draftSlot ?? null,
    metadata: rawPick.metadata ?? null,
  };
}

function getDraftType(draft) {
  const type = String(draft?.type ?? draft?.settings?.type ?? '').toLowerCase();
  return type === 'linear' ? 'linear' : 'snake';
}

function getDraftSlotEntries(draft, rosters = []) {
  const slotToRosterId = draft?.slot_to_roster_id ?? null;
  if (slotToRosterId && typeof slotToRosterId === 'object') {
    return Object.entries(slotToRosterId)
      .map(([slot, rosterId]) => ({ slot: Number(slot), originalRosterId: normalizeRosterId(rosterId) }))
      .filter((item) => Number.isFinite(item.slot) && item.originalRosterId);
  }

  const draftOrder = draft?.draft_order ?? null;
  if (draftOrder && typeof draftOrder === 'object') {
    return Object.entries(draftOrder)
      .map(([ownerId, slot]) => {
        const roster = rosters.find((item) => String(item.owner_id) === String(ownerId));
        return { slot: Number(slot), originalRosterId: normalizeRosterId(roster?.roster_id) };
      })
      .filter((item) => Number.isFinite(item.slot) && item.originalRosterId);
  }

  return [];
}

function buildTradedPickOwnerMap(draftTradedPicks = [], draft = null) {
  const map = new Map();
  const draftSeason = draft?.season == null ? null : String(draft.season);

  for (const pick of draftTradedPicks ?? []) {
    const pickSeason = pick?.season == null ? null : String(pick.season);
    if (draftSeason && pickSeason && pickSeason !== draftSeason) continue;

    const round = toFiniteNumber(pick?.round);
    const originalRosterId = normalizeRosterId(pick?.roster_id);
    const ownerRosterId = normalizeRosterId(pick?.owner_id);
    if (!round || !originalRosterId || !ownerRosterId) continue;

    map.set(`${round}|${originalRosterId}`, ownerRosterId);
  }

  return map;
}

export function buildPickOrder(draft, rosters = [], draftTradedPicks = []) {
  const rounds = Number(draft?.settings?.rounds ?? 0);
  const slotEntries = getDraftSlotEntries(draft, rosters);

  if (!rounds || !slotEntries.length) return [];

  const sortedSlots = slotEntries.sort((a, b) => a.slot - b.slot);
  const order = [];
  const draftType = getDraftType(draft);
  const tradedOwnerMap = buildTradedPickOwnerMap(draftTradedPicks, draft);

  for (let round = 1; round <= rounds; round += 1) {
    const roundSlots = draftType === 'snake' && round % 2 === 0
      ? [...sortedSlots].reverse()
      : sortedSlots;

    for (const [roundIndex, item] of roundSlots.entries()) {
      const currentRosterId = tradedOwnerMap.get(`${round}|${item.originalRosterId}`) ?? item.originalRosterId;
      order.push({
        overall: order.length + 1,
        round,
        roundPick: roundIndex + 1,
        rosterId: currentRosterId,
        originalRosterId: item.originalRosterId,
        slot: item.slot,
        roster: rosters.find((roster) => String(roster.roster_id) === currentRosterId) ?? null,
        originalRoster: rosters.find((roster) => String(roster.roster_id) === item.originalRosterId) ?? null,
        acquired: currentRosterId !== item.originalRosterId,
      });
    }
  }

  return order;
}

function getRosterDraftedPlayerIds(rosterId, normalizedPicks) {
  return normalizedPicks
    .filter((pick) => pick.rosterId === rosterId && pick.playerId)
    .map((pick) => pick.playerId);
}

function getRosteredPlayerIds(rosters = []) {
  const ids = new Set();
  for (const roster of rosters ?? []) {
    const rosterPlayerIds = [
      ...(roster?.players ?? []),
      ...(roster?.reserve ?? []),
      ...(roster?.taxi ?? []),
      ...(roster?.starters ?? []),
    ];
    for (const playerId of rosterPlayerIds) {
      if (playerId != null) ids.add(String(playerId));
    }
  }
  return ids;
}

function getStatValue(stats, keys) {
  for (const key of keys) {
    const value = toFiniteNumber(stats?.[key]);
    if (value != null) return value;
  }
  return null;
}

function getGamesPlayed(stats, weeklyRows) {
  return getStatValue(stats, ['gp', 'games_played', 'games']) ?? (weeklyRows?.length ?? 0);
}

function getTeamUsageContext(players = {}, seasonStats = {}) {
  const teams = {};
  for (const [playerId, stats] of Object.entries(seasonStats ?? {})) {
    const player = players?.[playerId];
    const team = String(player?.team ?? '').toUpperCase();
    if (!team || team === 'FA') continue;
    const position = normalizePosition(player?.fantasy_positions?.[0] ?? player?.position);
    const entry = teams[team] ?? {
      passAttempts: 0,
      rushAttempts: 0,
      targets: 0,
      receivingPoints: 0,
      rushingPoints: 0,
    };
    entry.passAttempts += getStatValue(stats, ['pass_att']) ?? 0;
    entry.rushAttempts += getStatValue(stats, ['rush_att']) ?? 0;
    entry.targets += getStatValue(stats, ['rec_tgt', 'targets', 'tgt']) ?? 0;
    if (position === 'WR' || position === 'TE') {
      entry.receivingPoints += (getStatValue(stats, ['rec']) ?? 0) + ((getStatValue(stats, ['rec_yd']) ?? 0) / 10) + ((getStatValue(stats, ['rec_td']) ?? 0) * 6);
    }
    if (position === 'RB') {
      entry.rushingPoints += ((getStatValue(stats, ['rush_yd']) ?? 0) / 10) + ((getStatValue(stats, ['rush_td']) ?? 0) * 6);
    }
    teams[team] = entry;
  }
  return teams;
}

function getAveragePointsAllowed(defenseTable, team, position) {
  const weekly = defenseTable?.[team]?.[position];
  if (!weekly) return null;
  const values = Object.values(weekly).map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLeagueAveragePointsAllowed(defenseTable, position) {
  const values = Object.keys(defenseTable ?? {})
    .map((team) => getAveragePointsAllowed(defenseTable, team, position))
    .filter((value) => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildDraftDefenseTable(weeklyStats, players, scheduleMap, scoringSettings) {
  if (!weeklyStats || !players) return {};
  const calcPoints = createPointsCalculator(scoringSettings);
  const table = {};
  const addValue = (team, position, week, value) => {
    if (!team || !position || !Number.isFinite(value) || value <= 0) return;
    if (!table[team]) table[team] = {};
    if (!table[team][position]) table[team][position] = {};
    table[team][position][week] = (table[team][position][week] ?? 0) + value;
  };

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    const position = normalizePosition(player?.fantasy_positions?.[0] ?? player?.position);
    if (!position) continue;
    for (const weekEntry of playerWeeks ?? []) {
      const week = Number(weekEntry?.week);
      const team = String(weekEntry?.team ?? player?.team ?? '').toUpperCase();
      const opponent = String(weekEntry?.opp ?? scheduleMap?.[week]?.[team]?.opp ?? '').toUpperCase();
      const value = calcPoints(weekEntry, player?.position);
      addValue(opponent, position, week, value);
    }
  }

  return table;
}

function getUpcomingOpponents(team, scheduleMap) {
  const normalizedTeam = String(team ?? '').toUpperCase();
  if (!normalizedTeam || !scheduleMap) return [];
  return Object.entries(scheduleMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([week, weekData]) => ({
      week: Number(week),
      opponent: String(weekData?.[normalizedTeam]?.opp ?? '').toUpperCase(),
    }))
    .filter((item) => item.opponent);
}

function buildScheduleSignal({ player, defenseTable, scheduleMap }) {
  const position = normalizePosition(player?.position);
  const opponents = getUpcomingOpponents(player?.team, scheduleMap).slice(0, 6);
  const opponentValues = opponents
    .map((item) => getAveragePointsAllowed(defenseTable, item.opponent, position))
    .filter((value) => value != null);
  const leagueAverage = getLeagueAveragePointsAllowed(defenseTable, position);
  if (!opponentValues.length || leagueAverage == null || leagueAverage === 0) {
    return {
      label: 'Unavailable',
      value: null,
      detail: null,
      opponents,
    };
  }
  const averageAllowed = opponentValues.reduce((sum, value) => sum + value, 0) / opponentValues.length;
  const index = Math.round((averageAllowed / leagueAverage) * 100);
  const label = index >= 108 ? 'Favorable' : index <= 92 ? 'Tough' : 'Neutral';
  return {
    label,
    value: index,
    detail: `${index} vs league avg`,
    opponents,
  };
}

function getMarketTrend(marketValue) {
  const candidates = [
    marketValue?.trend,
    marketValue?.movement,
    marketValue?.rankDelta,
    marketValue?.rankChange,
    marketValue?.delta,
    marketValue?.change,
  ];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (normalized.includes('up') || normalized.includes('rise') || normalized === 'positive') return { direction: 'up', label: 'Up' };
      if (normalized.includes('down') || normalized.includes('fall') || normalized === 'negative') return { direction: 'down', label: 'Down' };
      return { direction: 'flat', label: 'Flat' };
    }
    const value = Number(candidate);
    if (!Number.isFinite(value) || value === 0) continue;
    return value > 0 ? { direction: 'up', label: 'Up' } : { direction: 'down', label: 'Down' };
  }
  return { direction: 'flat', label: 'Flat' };
}

function getWorkloadTrend(ppg, recentPpg) {
  if (!ppg || !recentPpg) return { direction: 'flat', label: 'Flat' };
  if (recentPpg >= ppg + 1) return { direction: 'up', label: 'Up' };
  if (recentPpg <= ppg - 1) return { direction: 'down', label: 'Down' };
  return { direction: 'flat', label: 'Flat' };
}

function getUsageTrend({ ppg, recentPpg, seasonVolumePerGame, recentVolumePerGame }) {
  const scoringTrend = getWorkloadTrend(ppg, recentPpg);
  if (scoringTrend.direction !== 'flat') return scoringTrend;
  if (!seasonVolumePerGame || !recentVolumePerGame) return scoringTrend;
  if (recentVolumePerGame >= seasonVolumePerGame * 1.12) return { direction: 'up', label: 'Usage up' };
  if (recentVolumePerGame <= seasonVolumePerGame * 0.88) return { direction: 'down', label: 'Usage down' };
  return scoringTrend;
}

function getRankTier(rank) {
  if (rank == null) return null;
  if (rank <= 12) return 1;
  if (rank <= 24) return 2;
  if (rank <= 48) return 3;
  if (rank <= 84) return 4;
  return 5;
}

function buildWorkloadSignal({ player, seasonStats, weeklyStats, scoringSettings, teamUsage }) {
  const stats = seasonStats?.[player.id] ?? null;
  const weeklyRows = weeklyStats?.[player.id] ?? [];
  const position = normalizePosition(player.position);
  const gamesPlayed = getGamesPlayed(stats, weeklyRows);
  const ppg = getAveragePpg(weeklyRows, scoringSettings, player.position);
  const recentPpg = getRecentAvg(weeklyRows, scoringSettings, 4, player.position);
  const rushingAttempts = getStatValue(stats, ['rush_att']);
  const passingAttempts = getStatValue(stats, ['pass_att']);
  const receptions = getStatValue(stats, ['rec']);
  const targets = getStatValue(stats, ['rec_tgt', 'targets', 'tgt']);
  const team = teamUsage?.[player.team] ?? null;
  const touchCount = position === 'RB'
    ? (rushingAttempts ?? 0) + (receptions ?? 0)
    : null;
  const primaryVolume = position === 'QB'
    ? passingAttempts
    : position === 'RB'
      ? touchCount
      : (targets ?? receptions);
  const targetShare = team?.targets && targets != null ? Math.round((targets / team.targets) * 100) : null;
  const rushShare = team?.rushAttempts && rushingAttempts != null ? Math.round((rushingAttempts / team.rushAttempts) * 100) : null;
  const weeklyPrimaryVolumes = weeklyRows
    .map((week) => {
      if (position === 'QB') return getStatValue(week, ['pass_att']);
      if (position === 'RB') return (getStatValue(week, ['rush_att']) ?? 0) + (getStatValue(week, ['rec']) ?? 0);
      return getStatValue(week, ['rec_tgt', 'targets', 'tgt']) ?? getStatValue(week, ['rec']);
    })
    .filter((value) => value != null && value > 0);
  const recentVolumes = weeklyPrimaryVolumes.slice(-4);
  const seasonVolumePerGame = weeklyPrimaryVolumes.length
    ? weeklyPrimaryVolumes.reduce((sum, value) => sum + value, 0) / weeklyPrimaryVolumes.length
    : null;
  const recentVolumePerGame = recentVolumes.length
    ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length
    : null;
  const trend = getUsageTrend({ ppg, recentPpg, seasonVolumePerGame, recentVolumePerGame });

  return {
    gamesPlayed,
    ppg: ppg || null,
    recentPpg: recentPpg || null,
    primaryVolume: primaryVolume || null,
    targets: targets ?? null,
    receptions: receptions ?? null,
    rushingAttempts: rushingAttempts ?? null,
    passingAttempts: passingAttempts ?? null,
    seasonVolumePerGame: roundTo(seasonVolumePerGame, 1),
    recentVolumePerGame: roundTo(recentVolumePerGame, 1),
    targetShare,
    rushShare,
    trend,
  };
}

function buildTeamContextSignal({ player, teamUsage }) {
  const team = teamUsage?.[player.team] ?? null;
  const passPlayRate = team && (team.passAttempts + team.rushAttempts) > 0
    ? Math.round((team.passAttempts / (team.passAttempts + team.rushAttempts)) * 100)
    : null;
  const position = normalizePosition(player.position);
  const supportValue = position === 'QB'
    ? team?.receivingPoints ?? null
    : position === 'RB'
      ? team?.rushingPoints ?? null
      : null;
  return {
    byeWeek: player.raw?.bye_week ?? player.raw?.metadata?.bye_week ?? player.raw?.metadata?.bye ?? null,
    passPlayRate,
    supportValue,
    supportLabel: supportValue == null ? null : supportValue >= 450 ? 'Strong' : supportValue >= 260 ? 'Average' : 'Thin',
  };
}

function buildScoringFitSignal({ player, projection, scoringCategories, positionRanks, seasonStats, scoringSettings, workload }) {
  const seasonRank = positionRanks?.[player.id] ?? null;
  const stats = seasonStats?.[player.id] ?? null;
  const calcPoints = createPointsCalculator(scoringSettings);
  const seasonPoints = stats ? calcPoints(stats, player.position) : null;
  return {
    projectedPoints: projection?.projectedPoints ?? null,
    pastPpg: workload?.ppg ?? null,
    seasonPoints: seasonPoints != null ? roundTo(seasonPoints, 1) : null,
    source: projection?.source ?? 'unavailable',
    positionSeasonRank: seasonRank?.rank ?? null,
    positionSeasonCount: seasonRank?.posCount ?? null,
    relevantLevers: getRelevantScoringLevers(scoringCategories, player.position),
  };
}

function scoreRank(rank, maxRank = 300) {
  if (rank == null) return null;
  return clamp(((maxRank - Number(rank) + 1) / maxRank) * 100);
}

function scorePositionRank(rank, count) {
  if (rank == null) return null;
  const maxRank = count && count > 0 ? Math.max(24, count) : 120;
  return scoreRank(rank, maxRank);
}

function scorePpg(position, ppg) {
  if (ppg == null) return null;
  const baselineByPosition = {
    QB: 22,
    RB: 17,
    WR: 16,
    TE: 12,
    K: 9,
    DEF: 9,
    DL: 8,
    LB: 10,
    DB: 8,
  };
  const baseline = baselineByPosition[normalizePosition(position)] ?? 12;
  return clamp((ppg / baseline) * 82);
}

function scoreWorkload(position, volume) {
  if (volume == null) return null;
  const baselineByPosition = {
    QB: 575,
    RB: 260,
    WR: 140,
    TE: 105,
    K: 34,
    DEF: 1,
    DL: 75,
    LB: 115,
    DB: 95,
  };
  const baseline = baselineByPosition[normalizePosition(position)] ?? 120;
  if (baseline === 1) return 50;
  return clamp((volume / baseline) * 82);
}

function scoreSchedule(index) {
  if (index == null) return null;
  return clamp(((index - 82) / 36) * 100);
}

function scoreTeamContext(teamContext) {
  if (!teamContext) return null;
  if (teamContext.supportLabel === 'Strong') return 85;
  if (teamContext.supportLabel === 'Average') return 60;
  if (teamContext.supportLabel === 'Thin') return 35;
  if (teamContext.passPlayRate != null) return clamp(100 - Math.abs(58 - teamContext.passPlayRate) * 2);
  return null;
}

function scoreRosterNeed(teamNeed) {
  if (teamNeed == null) return null;
  return clamp(Number(teamNeed) * 100);
}

function buildDraftModelSignal(candidate, weights) {
  const components = {
    marketRank: scoreRank(candidate.rank?.overallRank ?? candidate.projection?.fallbackRank ?? candidate.projection?.searchRank),
    pastProduction: scorePpg(candidate.position, candidate.workload?.ppg),
    workload: scoreWorkload(candidate.position, candidate.workload?.primaryVolume),
    scoringFit: scorePositionRank(candidate.scoringFit?.positionSeasonRank, candidate.scoringFit?.positionSeasonCount),
    schedule: scoreSchedule(candidate.schedule?.value),
    teamContext: scoreTeamContext(candidate.teamContext),
    rosterNeed: scoreRosterNeed(candidate.draftRoom?.teamNeed),
  };

  let weightedTotal = 0;
  let activeWeightTotal = 0;
  for (const [key, value] of Object.entries(components)) {
    const weight = weights?.[key] ?? 0;
    if (value == null || weight <= 0) continue;
    weightedTotal += value * weight;
    activeWeightTotal += weight;
  }

  const score = activeWeightTotal > 0 ? roundTo(weightedTotal / activeWeightTotal, 1) : null;
  return {
    score,
    components,
    weights,
  };
}

function attachDraftModelSignal(candidate, weights) {
  return {
    ...candidate,
    draftModel: buildDraftModelSignal(candidate, weights),
  };
}

function compareDraftPoolRankCandidates(a, b) {
  const aRank = a.projection?.marketRank ?? a.projection?.fallbackRank ?? a.projection?.searchRank ?? null;
  const bRank = b.projection?.marketRank ?? b.projection?.fallbackRank ?? b.projection?.searchRank ?? null;
  if (aRank != null || bRank != null) {
    if (aRank == null) return 1;
    if (bRank == null) return -1;
    if (aRank !== bRank) return aRank - bRank;
  }

  const aProjected = a.projection?.projectedPoints ?? null;
  const bProjected = b.projection?.projectedPoints ?? null;
  if (aProjected != null || bProjected != null) {
    if (aProjected == null) return 1;
    if (bProjected == null) return -1;
    if (aProjected !== bProjected) return bProjected - aProjected;
  }

  const aPpg = a.scoringFit?.pastPpg ?? a.workload?.ppg ?? null;
  const bPpg = b.scoringFit?.pastPpg ?? b.workload?.ppg ?? null;
  if (aPpg != null || bPpg != null) {
    if (aPpg == null) return 1;
    if (bPpg == null) return -1;
    if (aPpg !== bPpg) return bPpg - aPpg;
  }

  const aVolume = a.workload?.primaryVolume ?? null;
  const bVolume = b.workload?.primaryVolume ?? null;
  if (aVolume != null || bVolume != null) {
    if (aVolume == null) return 1;
    if (bVolume == null) return -1;
    if (aVolume !== bVolume) return bVolume - aVolume;
  }

  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

function attachDraftPoolRanks(candidates) {
  const knownRanks = (candidates ?? [])
    .map((candidate) => candidate.projection?.marketRank ?? candidate.projection?.fallbackRank ?? candidate.projection?.searchRank ?? null)
    .filter((rank) => rank != null && Number.isFinite(Number(rank)) && Number(rank) > 0)
    .map(Number);
  const firstDerivedRank = knownRanks.length > 0 ? Math.ceil(Math.max(...knownRanks)) + 1 : 1;
  const poolRankById = new Map();
  [...(candidates ?? [])]
    .filter((candidate) => candidate.rank?.overallRank == null && candidate.projection?.fallbackRank == null)
    .sort(compareDraftPoolRankCandidates)
    .forEach((candidate, index) => {
      poolRankById.set(candidate.id, firstDerivedRank + index);
    });

  return (candidates ?? []).map((candidate) => {
    if (candidate.rank?.overallRank != null || candidate.projection?.fallbackRank != null) return candidate;
    const poolRank = poolRankById.get(candidate.id) ?? null;
    if (poolRank == null) return candidate;

    return {
      ...candidate,
      projection: {
        ...(candidate.projection ?? {}),
        fallbackRank: poolRank,
        fallbackLabel: 'Draft pool rank',
        localDraftPoolRank: poolRank,
        source: candidate.projection?.source === 'unavailable' ? 'draft_pool_rank' : candidate.projection?.source,
      },
      rank: {
        ...(candidate.rank ?? {}),
        overallRank: poolRank,
        sourceRank: poolRank,
        sourceLabel: 'Draft pool rank',
        tier: candidate.rank?.tier ?? getRankTier(poolRank),
      },
    };
  });
}

function buildRankSignal({ player, projection, marketValue, positionRanks, workload }) {
  const overallRank = projection?.marketRank ?? projection?.fallbackRank ?? projection?.searchRank ?? null;
  const positionRank = projection?.marketPositionRank ?? positionRanks?.[player.id]?.rank ?? null;
  const marketTrend = getMarketTrend(marketValue);
  const trend = marketTrend.direction !== 'flat' ? marketTrend : workload?.trend ?? marketTrend;
  return {
    overallRank,
    positionRank,
    positionRankLabel: positionRank != null ? `${player.position}${Math.round(positionRank)}` : null,
    sourceRank: projection?.fallbackRank ?? projection?.searchRank ?? null,
    sourceLabel: projection?.fallbackLabel ?? (projection?.searchRank != null ? 'Sleeper search rank' : null),
    tier: getRankTier(overallRank ?? positionRank),
    trend,
  };
}

function attachDraftRoomSignal(candidate, { boardIndex, myNeedProfile, picksUntilUser, teamsBeforeUser, recentPositionCounts }) {
  const boardRank = boardIndex.get(candidate.id) ?? null;
  const teamNeed = getPositionNeedScore(myNeedProfile, candidate.position);
  return {
    ...candidate,
    draftRoom: {
      boardRank,
      teamNeed,
      picksUntilUser,
      teamsBeforeUser: teamsBeforeUser.length,
      recentPositionRun: recentPositionCounts[candidate.position] ?? 0,
    },
  };
}

function getMarketValue(marketValuesByPlayerId, playerId) {
  if (!marketValuesByPlayerId || playerId == null) return null;
  const key = String(playerId);
  if (marketValuesByPlayerId instanceof Map) return marketValuesByPlayerId.get(key) ?? null;
  return marketValuesByPlayerId[key] ?? null;
}

function enrichProjectionWithMarket(projection, marketValue) {
  if (!projection) return projection;
  const marketRank = toFiniteNumber(marketValue?.overallRank);
  const marketPositionRank = toFiniteNumber(marketValue?.positionRank);
  const marketValueScore = toFiniteNumber(marketValue?.value);
  return {
    ...projection,
    marketRank,
    marketPositionRank,
    marketValue: marketValueScore,
    fallbackRank: marketRank ?? projection.fallbackRank,
    fallbackLabel: marketRank != null ? 'Market rank' : projection.fallbackLabel,
    source: projection.projectedPoints != null
      ? projection.source
      : (marketRank != null ? 'leaguelogs_market' : projection.source),
  };
}

function buildTeamNeedRows({ rosters, draft, normalizedPicks, players }) {
  return (rosters ?? []).map((roster) => {
    const rosterId = String(roster.roster_id);
    const draftedPlayerIds = getRosterDraftedPlayerIds(rosterId, normalizedPicks);
    const existingPlayerIds = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? []), ...draftedPlayerIds])];
    const playerPositions = existingPlayerIds
      .map((playerId) => normalizePosition(players?.[playerId]?.fantasy_positions?.[0] ?? players?.[playerId]?.position))
      .filter(Boolean);
    const profile = buildRosterNeedProfile({
      rosterPositions: draft?.metadata?.scoring_type === '2QB'
        ? ['QB', ...(draft?.settings?.slots_qb ? Array.from({ length: Math.max(0, Number(draft.settings.slots_qb) - 1) }, () => 'SUPER_FLEX') : [])]
        : (draft?.metadata?.roster_positions ?? draft?.roster_positions ?? []),
      playerPositions,
    });

    const needByPosition = {};
    for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']) {
      needByPosition[position] = getPositionNeedScore(profile, position);
    }

    return {
      rosterId,
      profile,
      draftedPlayerIds,
      needByPosition,
      picksMade: draftedPlayerIds.length,
    };
  });
}

function buildRecentPositionCounts(normalizedPicks, players) {
  const recent = normalizedPicks.slice(-12);
  const counts = {};
  for (const pick of recent) {
    const position = normalizePosition(players?.[pick.playerId]?.fantasy_positions?.[0] ?? players?.[pick.playerId]?.position);
    if (!position) continue;
    counts[position] = (counts[position] ?? 0) + 1;
  }
  return counts;
}

function getMyUpcomingWindow(pickOrder, myRosterId, normalizedPicks) {
  const currentOverall = normalizedPicks.length + 1;
  const currentPick = pickOrder.find((pick) => pick.overall === currentOverall) ?? null;
  const nextMyPick = pickOrder.find((pick) => pick.overall >= currentOverall && pick.rosterId === myRosterId) ?? null;
  const upcomingPicks = pickOrder.filter((pick) => pick.overall >= currentOverall);
  const picksBeforeUser = nextMyPick
    ? pickOrder.filter((pick) => pick.overall >= currentOverall && pick.overall < nextMyPick.overall)
    : [];
  return {
    currentOverall,
    currentPick,
    nextMyPick,
    upcomingPicks,
    picksBeforeUser,
  };
}

function buildOnClockRecommendation({
  candidates = [],
  currentPick = null,
  teamNeedRows = [],
  recentPositionCounts = {},
}) {
  if (!currentPick?.rosterId || !candidates.length) return null;
  const onClockNeedRow = teamNeedRows.find((row) => row.rosterId === currentPick.rosterId) ?? null;
  const onClockNeedProfile = onClockNeedRow?.profile ?? null;
  const standardWeightedCandidates = candidates.map((candidate) => attachDraftModelSignal({
    ...candidate,
    draftRoom: {
      ...(candidate.draftRoom ?? {}),
      boardRank: null,
      teamNeed: getPositionNeedScore(onClockNeedProfile, candidate.position),
      picksUntilUser: 0,
      teamsBeforeUser: 0,
      recentPositionRun: recentPositionCounts[candidate.position] ?? 0,
    },
  }, DEFAULT_DRAFT_MODEL_WEIGHTS));

  return rankDraftCandidates({
    candidates: standardWeightedCandidates,
    boardIndex: new Map(),
    myNeedProfile: onClockNeedProfile,
    picksUntilUser: 0,
    teamsBeforeUser: [],
    recentPositionCounts,
  })[0] ?? null;
}

export function buildDraftAssistantViewModel({
  players = {},
  rosters = [],
  league = null,
  draft = null,
  draftPicks = [],
  draftTradedPicks = [],
  myRoster = null,
  scoringSettings = {},
  season = null,
  boardIds = [],
  marketValuesByPlayerId = null,
  seasonStats = null,
  weeklyStats = null,
  scheduleMap = null,
  modelWeights = DEFAULT_DRAFT_MODEL_WEIGHTS,
}) {
  const normalizedModelWeights = normalizeDraftModelWeights(modelWeights);
  const normalizedPicks = draftPicks
    .map((pick, index) => normalizeDraftPick(pick, index, draft))
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
  const draftedIds = new Set(normalizedPicks.map((pick) => pick.playerId).filter(Boolean));
  const pickOrder = buildPickOrder(draft, rosters, draftTradedPicks);
  const myRosterId = myRoster?.roster_id != null ? String(myRoster.roster_id) : null;
  const teamNeedRows = buildTeamNeedRows({ rosters, draft: league ?? draft, normalizedPicks, players });
  const myNeedRow = teamNeedRows.find((row) => row.rosterId === myRosterId) ?? null;
  const upcomingWindow = getMyUpcomingWindow(pickOrder, myRosterId, normalizedPicks);
  const teamsBeforeUser = upcomingWindow.picksBeforeUser.map((pick) => {
    const team = teamNeedRows.find((row) => row.rosterId === pick.rosterId);
    return {
      rosterId: pick.rosterId,
      pickOverall: pick.overall,
      needByPosition: team?.needByPosition ?? {},
    };
  });
  const recentPositionCounts = buildRecentPositionCounts(normalizedPicks, players);

  const boardIndex = new Map(boardIds.map((playerId, index) => [String(playerId), index + 1]));
  const rosteredIds = getRosteredPlayerIds(rosters);
  const scoringCategories = categorizeDraftScoringSettings(scoringSettings);
  const positionRanks = seasonStats
    ? computeDraftPositionalRanks(seasonStats, players, scoringSettings)
    : {};
  const teamUsage = getTeamUsageContext(players, seasonStats);
  const defenseTable = weeklyStats && scheduleMap
    ? buildDraftDefenseTable(weeklyStats, players, scheduleMap, scoringSettings)
    : {};
  const candidatesWithoutModel = Object.values(players)
    .filter((player) => player?.player_id != null && !draftedIds.has(String(player.player_id)))
    .filter((player) => playerSupportsDraftAssistant(player))
    .map((player) => {
      const playerId = String(player.player_id);
      const marketValue = getMarketValue(marketValuesByPlayerId, playerId);
      const projection = enrichProjectionWithMarket(
        getPlayerProjectionProfile(player, scoringSettings, season),
        marketValue,
      );
      if (!isCurrentDraftCandidate(player, projection)) return null;
      const baseCandidate = {
        id: playerId,
        name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
        team: String(player.team ?? 'FA').toUpperCase(),
        position: normalizePosition(player.fantasy_positions?.[0] ?? player.position),
        projection,
        rostered: rosteredIds.has(playerId),
        raw: player,
      };
      const workload = buildWorkloadSignal({
        player: baseCandidate,
        seasonStats,
        weeklyStats,
        scoringSettings,
        teamUsage,
      });
      const rank = buildRankSignal({
        player: baseCandidate,
        projection,
        marketValue,
        positionRanks,
        workload,
      });
      const scoringFit = buildScoringFitSignal({
        player: baseCandidate,
        projection,
        scoringCategories,
        positionRanks,
        seasonStats,
        scoringSettings,
        workload,
      });
      const teamContext = buildTeamContextSignal({ player: baseCandidate, teamUsage });
      const schedule = buildScheduleSignal({ player: baseCandidate, defenseTable, scheduleMap });
      const withDraftRoom = attachDraftRoomSignal({
        ...baseCandidate,
        rank,
        scoringFit,
        workload,
        teamContext,
        schedule,
      }, {
        boardIndex,
        myNeedProfile: myNeedRow?.profile ?? null,
        picksUntilUser: upcomingWindow.picksBeforeUser.length,
        teamsBeforeUser,
        recentPositionCounts,
      });
      return withDraftRoom;
    })
    .filter(Boolean);
  const allCandidates = attachDraftPoolRanks(candidatesWithoutModel)
    .map((candidate) => attachDraftModelSignal(candidate, normalizedModelWeights));

  const rankedCandidatePool = allCandidates.filter((item) => (
    item.projection?.projectedPoints != null
    || item.projection?.fallbackRank != null
    || boardIndex.has(item.id)
  ));
  const projectionBackedCandidates = rankedCandidatePool.filter((item) => item.projection?.projectedPoints != null);
  const rankedCandidates = rankDraftCandidates({
    candidates: rankedCandidatePool,
    boardIndex,
    myNeedProfile: myNeedRow?.profile ?? null,
    picksUntilUser: upcomingWindow.picksBeforeUser.length,
    teamsBeforeUser,
    recentPositionCounts,
  });

  const bestOverall = rankedCandidates[0] ?? null;
  const onClockRecommendation = buildOnClockRecommendation({
    candidates: rankedCandidatePool,
    currentPick: upcomingWindow.currentPick,
    teamNeedRows,
    recentPositionCounts,
  });
  const bestByPosition = {};
  for (const candidate of rankedCandidates) {
    if (!bestByPosition[candidate.position]) bestByPosition[candidate.position] = candidate;
  }

  const boardRows = boardIds.map((playerId, index) => {
    const matched = allCandidates.find((candidate) => candidate.id === String(playerId));
    if (matched) return { ...matched, boardRank: index + 1, available: true };

    const rawPlayer = players?.[playerId];
    const position = normalizePosition(rawPlayer?.fantasy_positions?.[0] ?? rawPlayer?.position);
    const marketValue = getMarketValue(marketValuesByPlayerId, playerId);
    const projection = enrichProjectionWithMarket(
      getPlayerProjectionProfile(rawPlayer ?? {}, scoringSettings, season),
      marketValue,
    );
    const baseCandidate = {
      id: String(playerId),
      name: rawPlayer?.full_name || `${rawPlayer?.first_name ?? ''} ${rawPlayer?.last_name ?? ''}`.trim() || `Player ${playerId}`,
      team: String(rawPlayer?.team ?? '—').toUpperCase(),
      position,
      projection,
      boardRank: index + 1,
      available: false,
      rostered: rosteredIds.has(String(playerId)),
      raw: rawPlayer ?? null,
    };
    const workload = buildWorkloadSignal({
      player: baseCandidate,
      seasonStats,
      weeklyStats,
      scoringSettings,
      teamUsage,
    });
    const rank = buildRankSignal({
      player: baseCandidate,
      projection,
      marketValue,
      positionRanks,
      workload,
    });
    const row = {
      ...baseCandidate,
      rank,
      scoringFit: buildScoringFitSignal({
        player: baseCandidate,
        projection,
        scoringCategories,
        positionRanks,
        seasonStats,
        scoringSettings,
        workload,
      }),
      workload,
      teamContext: buildTeamContextSignal({ player: baseCandidate, teamUsage }),
      schedule: buildScheduleSignal({ player: baseCandidate, defenseTable, scheduleMap }),
      draftRoom: {
        boardRank: index + 1,
        teamNeed: getPositionNeedScore(myNeedRow?.profile ?? null, position),
        picksUntilUser: upcomingWindow.picksBeforeUser.length,
        teamsBeforeUser: teamsBeforeUser.length,
        recentPositionRun: recentPositionCounts[position] ?? 0,
      },
    };
    return attachDraftModelSignal(row, normalizedModelWeights);
  });

  // Drafted players are excluded from the candidate pool above, so their Rating/Rank/Tier are
  // never computed there. Enrich them on their own (same signal builders + model score path as
  // boardRows) so the Results view can surface War-Room-grade metrics for completed picks. Keeps
  // the candidate pool — and therefore War Room — untouched.
  const draftedCardsById = new Map();
  for (const pick of normalizedPicks) {
    const playerId = pick.playerId;
    if (!playerId || draftedCardsById.has(String(playerId))) continue;
    const rawPlayer = players?.[playerId];
    const position = normalizePosition(rawPlayer?.fantasy_positions?.[0] ?? rawPlayer?.position);
    const marketValue = getMarketValue(marketValuesByPlayerId, playerId);
    const projection = enrichProjectionWithMarket(
      getPlayerProjectionProfile(rawPlayer ?? {}, scoringSettings, season),
      marketValue,
    );
    const baseCandidate = {
      id: String(playerId),
      name: rawPlayer?.full_name || `${rawPlayer?.first_name ?? ''} ${rawPlayer?.last_name ?? ''}`.trim() || `Player ${playerId}`,
      team: String(rawPlayer?.team ?? '—').toUpperCase(),
      position,
      projection,
      rostered: rosteredIds.has(String(playerId)),
      raw: rawPlayer ?? null,
    };
    const workload = buildWorkloadSignal({
      player: baseCandidate,
      seasonStats,
      weeklyStats,
      scoringSettings,
      teamUsage,
    });
    const rank = buildRankSignal({
      player: baseCandidate,
      projection,
      marketValue,
      positionRanks,
      workload,
    });
    const row = {
      ...baseCandidate,
      rank,
      scoringFit: buildScoringFitSignal({
        player: baseCandidate,
        projection,
        scoringCategories,
        positionRanks,
        seasonStats,
        scoringSettings,
        workload,
      }),
      workload,
      teamContext: buildTeamContextSignal({ player: baseCandidate, teamUsage }),
      schedule: buildScheduleSignal({ player: baseCandidate, defenseTable, scheduleMap }),
      draftRoom: {
        teamNeed: getPositionNeedScore(myNeedRow?.profile ?? null, position),
        picksUntilUser: upcomingWindow.picksBeforeUser.length,
        teamsBeforeUser: teamsBeforeUser.length,
        recentPositionRun: recentPositionCounts[position] ?? 0,
      },
    };
    draftedCardsById.set(String(playerId), attachDraftModelSignal(row, normalizedModelWeights));
  }

  return {
    normalizedPicks,
    pickOrder,
    currentOverall: upcomingWindow.currentOverall,
    currentPick: upcomingWindow.currentPick,
    nextMyPick: upcomingWindow.nextMyPick,
    upcomingPicks: upcomingWindow.upcomingPicks,
    picksBeforeUser: upcomingWindow.picksBeforeUser,
    teamNeedRows,
    myNeedRow,
    allCandidates,
    draftedCardsById,
    rankedCandidates,
    onClockRecommendation,
    bestOverall,
    bestByPosition,
    boardRows,
    projectionBackedCandidates: sortDraftPlayersByProjection(projectionBackedCandidates),
    rankedCandidatePool: sortDraftPlayersByProjection(rankedCandidatePool),
    hasProjectionData: projectionBackedCandidates.length > 0,
    hasRecommendationData: rankedCandidatePool.length > 0,
    scoringCategories,
    modelWeights: normalizedModelWeights,
  };
}

export function buildDraftResultsViewModel({
  players = {},
  rosters = [],
  league = null,
  draft = null,
  draftPicks = [],
  draftTradedPicks = [],
  myRoster = null,
  scoringSettings = {},
  season = null,
  marketValuesByPlayerId = null,
  seasonStats = null,
  weeklyStats = null,
  scheduleMap = null,
  modelWeights = DEFAULT_DRAFT_MODEL_WEIGHTS,
}) {
  const normalizedModelWeights = normalizeDraftModelWeights(modelWeights);
  const normalizedPicks = draftPicks
    .map((pick, index) => normalizeDraftPick(pick, index, draft))
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
  const pickOrder = buildPickOrder(draft, rosters, draftTradedPicks);
  const myRosterId = myRoster?.roster_id != null ? String(myRoster.roster_id) : null;
  const teamNeedRows = buildTeamNeedRows({ rosters, draft: league ?? draft, normalizedPicks, players });
  const myNeedRow = teamNeedRows.find((row) => row.rosterId === myRosterId) ?? null;
  const upcomingWindow = getMyUpcomingWindow(pickOrder, myRosterId, normalizedPicks);
  const teamsBeforeUser = upcomingWindow.picksBeforeUser.map((pick) => {
    const team = teamNeedRows.find((row) => row.rosterId === pick.rosterId);
    return {
      rosterId: pick.rosterId,
      pickOverall: pick.overall,
      needByPosition: team?.needByPosition ?? {},
    };
  });
  const recentPositionCounts = buildRecentPositionCounts(normalizedPicks, players);
  const rosteredIds = getRosteredPlayerIds(rosters);
  const scoringCategories = categorizeDraftScoringSettings(scoringSettings);
  const positionRanks = seasonStats
    ? computeDraftPositionalRanks(seasonStats, players, scoringSettings)
    : {};
  const teamUsage = getTeamUsageContext(players, seasonStats);
  const defenseTable = weeklyStats && scheduleMap
    ? buildDraftDefenseTable(weeklyStats, players, scheduleMap, scoringSettings)
    : {};

  const draftedCardsById = new Map();
  for (const pick of normalizedPicks) {
    const playerId = pick.playerId;
    if (!playerId || draftedCardsById.has(String(playerId))) continue;
    const rawPlayer = players?.[playerId];
    const position = normalizePosition(rawPlayer?.fantasy_positions?.[0] ?? rawPlayer?.position);
    const marketValue = getMarketValue(marketValuesByPlayerId, playerId);
    const projection = enrichProjectionWithMarket(
      getPlayerProjectionProfile(rawPlayer ?? {}, scoringSettings, season),
      marketValue,
    );
    const baseCandidate = {
      id: String(playerId),
      name: rawPlayer?.full_name || `${rawPlayer?.first_name ?? ''} ${rawPlayer?.last_name ?? ''}`.trim() || `Player ${playerId}`,
      team: String(rawPlayer?.team ?? '—').toUpperCase(),
      position,
      projection,
      rostered: rosteredIds.has(String(playerId)),
      raw: rawPlayer ?? null,
    };
    const workload = buildWorkloadSignal({
      player: baseCandidate,
      seasonStats,
      weeklyStats,
      scoringSettings,
      teamUsage,
    });
    const rank = buildRankSignal({
      player: baseCandidate,
      projection,
      marketValue,
      positionRanks,
      workload,
    });
    const row = {
      ...baseCandidate,
      rank,
      scoringFit: buildScoringFitSignal({
        player: baseCandidate,
        projection,
        scoringCategories,
        positionRanks,
        seasonStats,
        scoringSettings,
        workload,
      }),
      workload,
      teamContext: buildTeamContextSignal({ player: baseCandidate, teamUsage }),
      schedule: buildScheduleSignal({ player: baseCandidate, defenseTable, scheduleMap }),
      draftRoom: {
        teamNeed: getPositionNeedScore(myNeedRow?.profile ?? null, position),
        picksUntilUser: upcomingWindow.picksBeforeUser.length,
        teamsBeforeUser: teamsBeforeUser.length,
        recentPositionRun: recentPositionCounts[position] ?? 0,
      },
    };
    draftedCardsById.set(String(playerId), attachDraftModelSignal(row, normalizedModelWeights));
  }

  return {
    normalizedPicks,
    pickOrder,
    currentOverall: upcomingWindow.currentOverall,
    currentPick: upcomingWindow.currentPick,
    nextMyPick: upcomingWindow.nextMyPick,
    upcomingPicks: upcomingWindow.upcomingPicks,
    picksBeforeUser: upcomingWindow.picksBeforeUser,
    teamNeedRows,
    myNeedRow,
    draftedCardsById,
    modelWeights: normalizedModelWeights,
  };
}
