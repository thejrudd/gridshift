const FLEX_SLOT_MAP = {
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  WR_TE: ['WR', 'TE'],
  RB_WR: ['RB', 'WR'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  FLEX_IDP: ['DL', 'LB', 'DB'],
  DP: ['DL', 'LB', 'DB'],
};

const BENCH_SLOT_SET = new Set(['BN', 'BENCH', 'IR', 'RESERVE', 'TAXI']);

function normalizeSlot(slot) {
  return String(slot ?? '').trim().toUpperCase();
}

function normalizePosition(position) {
  const value = String(position ?? '').trim().toUpperCase();
  if (value === 'DST') return 'DEF';
  if (!value) return null;
  return value;
}

function getSlotEligibilities(slot) {
  if (FLEX_SLOT_MAP[slot]) return FLEX_SLOT_MAP[slot];
  if (BENCH_SLOT_SET.has(slot)) return [];
  return [slot];
}

function isBenchSlot(slot) {
  return BENCH_SLOT_SET.has(slot);
}

export function buildRosterNeedProfile({
  rosterPositions = [],
  playerPositions = [],
}) {
  const starterSlots = rosterPositions
    .map(normalizeSlot)
    .filter((slot) => slot && !isBenchSlot(slot));
  const benchSlots = rosterPositions
    .map(normalizeSlot)
    .filter((slot) => isBenchSlot(slot));
  const assignedPositions = playerPositions
    .map(normalizePosition)
    .filter(Boolean);

  const slotUsage = starterSlots.map((slot) => ({
    slot,
    eligibilities: getSlotEligibilities(slot),
    assigned: null,
  }));

  for (const position of assignedPositions) {
    const exactIndex = slotUsage.findIndex((entry) => !entry.assigned && entry.slot === position);
    if (exactIndex >= 0) {
      slotUsage[exactIndex].assigned = position;
      continue;
    }

    const flexIndex = slotUsage.findIndex((entry) => !entry.assigned && entry.eligibilities.includes(position));
    if (flexIndex >= 0) {
      slotUsage[flexIndex].assigned = position;
    }
  }

  const openStarterCounts = {};
  const filledStarterCounts = {};
  for (const entry of slotUsage) {
    if (entry.assigned) {
      filledStarterCounts[entry.assigned] = (filledStarterCounts[entry.assigned] ?? 0) + 1;
      continue;
    }

    for (const eligible of entry.eligibilities) {
      openStarterCounts[eligible] = (openStarterCounts[eligible] ?? 0) + (1 / entry.eligibilities.length);
    }
  }

  const benchCount = Math.max(0, benchSlots.length);
  const benchUsed = Math.max(0, assignedPositions.length - starterSlots.length);
  const openBenchSlots = Math.max(0, benchCount - benchUsed);

  return {
    starterSlots,
    benchSlots,
    slotUsage,
    filledStarterCounts,
    openStarterCounts,
    openBenchSlots,
    totalPlayers: assignedPositions.length,
  };
}

export function getPositionNeedScore(profile, position) {
  const normalized = normalizePosition(position);
  if (!profile || !normalized) return 0;

  const openStarterNeed = Number(profile.openStarterCounts?.[normalized] ?? 0);
  const benchNeed = profile.openBenchSlots > 0 ? 0.12 : 0;
  return Math.round((openStarterNeed + benchNeed) * 100) / 100;
}
