const FLEX_SLOT_POSITIONS = {
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['RB', 'WR', 'TE'],
  WRT_FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  RBWR_FLEX: ['RB', 'WR'],
  RB_WR: ['RB', 'WR'],
  WRTE_FLEX: ['WR', 'TE'],
  WR_TE: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  IDP: ['DL', 'LB', 'DB'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  FLEX_IDP: ['DL', 'LB', 'DB'],
  DP: ['DL', 'LB', 'DB'],
};

const FLEX_FALLBACK_POSITIONS = {
  FLEX: ['RB', 'WR', 'TE'],
  REC: ['RB', 'WR', 'TE'],
  SUPER: ['QB', 'RB', 'WR', 'TE'],
  IDP: ['DL', 'LB', 'DB'],
};

function normalizeSlot(slot) {
  const value = String(slot ?? '').trim().toUpperCase();
  if (value === 'DST') return 'DEF';
  if (value === 'BE' || value === 'BENCH') return 'BN';
  return value || 'BN';
}

function getFlexibleSlotPositions(slot) {
  if (FLEX_SLOT_POSITIONS[slot]) return FLEX_SLOT_POSITIONS[slot];

  const explicitPositions = slot.match(/DEF|QB|RB|WR|TE|K|DL|LB|DB/g) ?? [];
  if (explicitPositions.length > 1) return [...new Set(explicitPositions)];

  for (const label of ['SUPER', 'IDP', 'REC', 'FLEX']) {
    if (slot.includes(label)) return FLEX_FALLBACK_POSITIONS[label];
  }
  return null;
}

/**
 * Resolve a roster slot to the positions it can accept. Recognized flex labels
 * and compound labels such as `QB/WR/RB/TE FLEX` remain flexible without
 * needing a new component-level special case.
 */
export function getRosterProjectionSlotEligibilities(slot) {
  const normalized = normalizeSlot(slot);
  const flexiblePositions = getFlexibleSlotPositions(normalized);
  if (flexiblePositions) return new Set(flexiblePositions);
  if (normalized === 'BN' || normalized === 'IR' || normalized === 'TAXI') return null;
  return new Set([normalized]);
}

/**
 * Return slot indexes in starter-priority order: dedicated slots first, then
 * flexible slots from narrowest eligibility to broadest. Array order only
 * breaks ties, so a league's source ordering cannot let FLEX consume a player
 * that belongs in a primary starter slot.
 */
export function getRosterProjectionSlotOrder(slots = []) {
  return slots
    .map((slot, index) => ({
      index,
      eligibilities: getRosterProjectionSlotEligibilities(slot?.slot ?? slot),
    }))
    .filter(({ eligibilities }) => eligibilities)
    .sort((a, b) => (
      (a.eligibilities.size - 1) - (b.eligibilities.size - 1)
      || a.eligibilities.size - b.eligibilities.size
      || a.index - b.index
    ))
    .map(({ index }) => index);
}

/**
 * Select the highest remaining saved-Board player eligible for one roster slot.
 *
 * Board lane order is preserved for a single position. Flexible slots combine
 * their eligible lanes by the user's overall Board order (`boardRank`).
 */
export function selectNextAvailableRosterProjection({
  eligiblePositions = [],
  preferredPlayersByPosition = {},
  claimedPlayerIds = new Set(),
} = {}) {
  const claimed = claimedPlayerIds instanceof Set
    ? claimedPlayerIds
    : new Set(claimedPlayerIds ?? []);
  const seen = new Set();
  const candidates = [];

  for (const position of eligiblePositions ?? []) {
    for (const candidate of preferredPlayersByPosition?.[position] ?? []) {
      const id = String(candidate?.id ?? '');
      if (!id || seen.has(id) || candidate?.available === false || claimed.has(id)) continue;
      seen.add(id);
      candidates.push(candidate);
    }
  }

  return candidates.sort((a, b) => (
    (a.boardRank ?? Number.MAX_SAFE_INTEGER) - (b.boardRank ?? Number.MAX_SAFE_INTEGER)
  ))[0] ?? null;
}
