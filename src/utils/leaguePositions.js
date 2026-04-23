import { normalizeIDPPos } from './idpEngine';

const BASE_FILTERS = ['QB', 'RB', 'WR', 'TE', 'K'];
const IDP_FILTERS = ['DL', 'LB', 'DB'];

const SLOT_ELIGIBILITY = {
  QB: new Set(['QB', 'SUPER_FLEX', 'OP']),
  RB: new Set(['RB', 'FLEX', 'SUPER_FLEX', 'OP', 'REC_FLEX', 'WRRB_FLEX', 'RB_WR']),
  WR: new Set(['WR', 'FLEX', 'SUPER_FLEX', 'OP', 'REC_FLEX', 'WRRB_FLEX', 'WR_TE']),
  TE: new Set(['TE', 'FLEX', 'SUPER_FLEX', 'OP', 'REC_FLEX', 'WR_TE']),
  K: new Set(['K']),
  DEF: new Set(['DEF', 'DST', 'D/ST']),
  TST: new Set(['TST', 'TMST', 'TEAM_ST', 'TEAM_SPECIAL_TEAMS', 'SPECIAL_TEAMS_TEAM']),
  STP: new Set(['STP', 'ST', 'ST_FLEX', 'SPECIAL_TEAMS_PLAYER']),
};

const POSITION_FILTER_GROUPS = {
  QB: new Set(['QB']),
  RB: new Set(['RB', 'FB']),
  WR: new Set(['WR']),
  TE: new Set(['TE']),
  K: new Set(['K']),
  DEF: new Set(['DEF', 'DST', 'D/ST']),
  TST: new Set(['TST', 'TMST', 'TEAM_ST']),
  STP: new Set(['STP', 'ST']),
  DL: new Set(['DL', 'DE', 'DT', 'NT', 'ED']),
  LB: new Set(['LB', 'ILB', 'OLB', 'MLB']),
  DB: new Set(['DB', 'CB', 'S', 'SS', 'FS']),
};

const FILTER_LABELS = {
  ALL: 'ALL',
  DEF: 'D/ST',
  TST: 'Team ST',
  STP: 'ST Player',
};

const ST_STAT_KEYS = [
  'st_td',
  'st_tkl_solo',
  'st_tkl',
  'st_ff',
  'st_fum_rec',
  'st_fum_rec_td',
  'st_blk_kick',
  'st_safety',
  'st_yd',
  'bonus_st_td_50p',
  'def_st_td',
  'def_st_tkl_solo',
  'def_st_ff',
  'def_st_fum_rec',
  'def_st_fum_rec_td',
];

function normalizeSlot(slot) {
  return String(slot ?? '').trim().toUpperCase();
}

function hasAnySlot(rosterSlots, candidateSlots) {
  return rosterSlots.some((slot) => candidateSlots.has(slot));
}

export function normalizeLeaguePlayerPosition(position) {
  const pos = normalizeSlot(position);
  if (POSITION_FILTER_GROUPS.DEF.has(pos)) return 'DEF';
  if (POSITION_FILTER_GROUPS.TST.has(pos)) return 'TST';
  if (POSITION_FILTER_GROUPS.STP.has(pos)) return 'STP';
  return normalizeIDPPos(pos) ?? (BASE_FILTERS.includes(pos) ? pos : null);
}

export function hasSpecialTeamsStats(stats) {
  if (!stats) return false;
  return ST_STAT_KEYS.some((key) => Number(stats[key] ?? 0) !== 0);
}

export function getLeaguePositionFilters(rosterPositions, { includeAll = true } = {}) {
  const slots = (rosterPositions ?? []).map(normalizeSlot).filter(Boolean);
  const filters = [];
  if (includeAll) filters.push('ALL');

  for (const filter of BASE_FILTERS) {
    if (hasAnySlot(slots, SLOT_ELIGIBILITY[filter])) filters.push(filter);
  }

  const hasIDPFlex = slots.some((slot) => ['IDP_FLEX', 'FLEX_IDP', 'DP'].includes(slot));
  for (const filter of IDP_FILTERS) {
    if (hasIDPFlex || slots.some((slot) => normalizeIDPPos(slot) === filter)) filters.push(filter);
  }

  for (const filter of ['DEF', 'TST', 'STP']) {
    if (hasAnySlot(slots, SLOT_ELIGIBILITY[filter])) filters.push(filter);
  }

  return [...new Set(filters)];
}

export function getPositionFilterLabel(filter) {
  return FILTER_LABELS[filter] ?? filter;
}

export function isValidLeaguePositionFilter(filter, filters) {
  return (filters ?? []).includes(filter);
}

export function getPlayerPositionFilterKeys(position, stats = null) {
  const pos = normalizeSlot(position);
  const keys = new Set();

  for (const [filter, group] of Object.entries(POSITION_FILTER_GROUPS)) {
    if (group.has(pos)) keys.add(filter);
  }

  const idpGroup = normalizeIDPPos(pos);
  if (idpGroup) keys.add(idpGroup);
  if (hasSpecialTeamsStats(stats) && !POSITION_FILTER_GROUPS.DEF.has(pos) && !POSITION_FILTER_GROUPS.TST.has(pos)) {
    keys.add('STP');
  }

  return keys;
}

export function positionMatchesLeagueFilter(position, filter, {
  stats = null,
  availableFilters = [],
} = {}) {
  const filterKeys = getPlayerPositionFilterKeys(position, stats);
  if (filter === 'ALL') {
    const availableSet = new Set(availableFilters);
    return [...filterKeys].some((key) => availableSet.has(key));
  }
  return filterKeys.has(filter);
}
