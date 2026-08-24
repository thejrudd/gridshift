export const IGNORED_SLOTS = new Set(['BN', 'IR', 'TAXI']);

export const WAIVER_SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

export const POSITION_LABELS = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  DEF: 'D/ST',
  DL: 'DL',
  LB: 'LB',
  DB: 'DB',
};

export const SLOT_ELIGIBILITY = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  WRTE_FLEX: ['WR', 'TE'],
  WRT_FLEX: ['RB', 'WR', 'TE'],
  RBWR_FLEX: ['RB', 'WR'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  FLEX_IDP: ['DL', 'LB', 'DB'],
  DP: ['DL', 'LB', 'DB'],
};

export function normalizeOpportunityPos(pos) {
  if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'].includes(pos)) return pos;
  if (['DE', 'DT'].includes(pos)) return 'DL';
  if (['ILB', 'OLB'].includes(pos)) return 'LB';
  if (['CB', 'S', 'SS', 'FS'].includes(pos)) return 'DB';
  return null;
}

export function getOpportunityPositionLabel(pos) {
  return POSITION_LABELS[normalizeOpportunityPos(pos) ?? pos] ?? pos;
}

export function supportsWaiverOpportunity(pos) {
  return WAIVER_SUPPORTED_POSITIONS.has(normalizeOpportunityPos(pos));
}

export function getSlotEligiblePositions(slot) {
  return SLOT_ELIGIBILITY[slot] ?? [];
}
