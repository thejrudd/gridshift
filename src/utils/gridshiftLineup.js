// GridShift-league weekly lineups (Stage 5.2): pure helpers over the
// platform's lineup view (`GET …/teams/:teamId/lineup?week=`).
//
// A lineup is `{ [slotType]: Array<playerId | null> }`. The platform owns every
// rule (locks, slot eligibility, IR eligibility and policy, roster lock); these
// helpers only arrange the view, predict which moves are worth offering, and
// apply a move optimistically. Whatever the server answers wins: a rejected
// save rolls back to the last lineup the server confirmed.

export const LINEUP_SLOT_ORDER = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'DL', 'LB', 'DB', 'BENCH', 'IR']);
export const LINEUP_RESERVE_SLOTS = Object.freeze(['BENCH', 'IR']);
const FLEX_POSITIONS = new Set(['RB', 'WR', 'TE']);

const SLOT_LABELS = Object.freeze({ FLEX: 'W/R/T', BENCH: 'Bench', IR: 'IR', DST: 'DST' });

export function getLineupSlotLabel(slotType) {
  return SLOT_LABELS[slotType] ?? slotType;
}

/** The platform's `positionFitsSlot`: FLEX takes RB/WR/TE, BENCH and IR anyone, other slots their own position. */
export function slotAcceptsPosition(slotType, position) {
  if (slotType === 'BENCH' || slotType === 'IR') return true;
  if (slotType === 'FLEX') return FLEX_POSITIONS.has(position);
  return slotType === position;
}

/** Slot instances in display order: `[{ type, index, playerId }]`. */
export function listLineupSlots(assignment) {
  const slots = [];
  for (const type of LINEUP_SLOT_ORDER) {
    const entries = Array.isArray(assignment?.[type]) ? assignment[type] : [];
    entries.forEach((playerId, index) => slots.push({ type, index, playerId: playerId ?? null }));
  }
  return slots;
}

export function cloneLineup(assignment) {
  const next = {};
  for (const [type, entries] of Object.entries(assignment ?? {})) next[type] = Array.isArray(entries) ? [...entries] : [];
  return next;
}

const sameSlot = (left, right) => left?.type === right?.type && left?.index === right?.index;

/**
 * A player on the roster but in no slot (acquired after the week's lineup was
 * saved): `{ type: UNPLACED, playerId }` as a move source.
 */
export const UNPLACED_SLOT = 'UNPLACED';

const occupant = (assignment, slot) => (slot?.type === UNPLACED_SLOT ? slot.playerId ?? null : assignment?.[slot?.type]?.[slot?.index] ?? null);

/**
 * Swaps the occupants of two slots (moving into an empty slot leaves the
 * source empty). From an unplaced player, the player takes the slot and
 * whoever was there leaves the lineup.
 */
export function moveLineupPlayer(assignment, from, to) {
  const next = cloneLineup(assignment);
  if (from?.type === UNPLACED_SLOT) {
    if (next[to.type]) next[to.type][to.index] = from.playerId;
    return next;
  }
  if (!next[from.type] || !next[to.type] || sameSlot(from, to)) return next;
  const moving = next[from.type][from.index] ?? null;
  const displaced = next[to.type][to.index] ?? null;
  next[to.type][to.index] = moving;
  next[from.type][from.index] = displaced;
  return next;
}

/**
 * Whether offering this move makes sense, from the lineup view alone. The
 * server still decides; this only keeps obviously refused moves off screen.
 *
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkLineupMove({ assignment, from, to, positionOf, lockedIds = [], irEligibleIds = [] }) {
  const locked = new Set(lockedIds);
  const irEligible = new Set(irEligibleIds);
  const moving = occupant(assignment, from);
  const displaced = occupant(assignment, to);
  if (!moving || sameSlot(from, to) || to?.type === UNPLACED_SLOT) return { ok: false, reason: '' };
  // A locked player cannot leave a slot; placing an unplaced one is the platform's call.
  if (locked.has(moving) && from.type !== UNPLACED_SLOT) return { ok: false, reason: 'Locked: this player\'s game has started.' };
  if (displaced && locked.has(displaced)) return { ok: false, reason: 'Locked: that player\'s game has started.' };
  if (!slotAcceptsPosition(to.type, positionOf(moving))) return { ok: false, reason: `Not a ${getLineupSlotLabel(to.type)} slot for this player.` };
  if (displaced && from.type !== UNPLACED_SLOT && !slotAcceptsPosition(from.type, positionOf(displaced))) return { ok: false, reason: '' };
  if (to.type === 'IR' && from.type !== 'IR' && !irEligible.has(moving)) return { ok: false, reason: 'Not eligible for IR.' };
  if (displaced && from.type === 'IR' && to.type !== 'IR' && !irEligible.has(displaced)) return { ok: false, reason: '' };
  return { ok: true, reason: '' };
}

/** Every slot the player in `from` could move to, with the reason the others are not offered. */
export function listLineupDestinations({ assignment, from, positionOf, lockedIds, irEligibleIds }) {
  return listLineupSlots(assignment)
    .filter((slot) => !sameSlot(slot, from))
    .map((slot) => ({ slot, ...checkLineupMove({ assignment, from, to: slot, positionOf, lockedIds, irEligibleIds }) }));
}

/** Plain text for a refused save: the platform's message, then each rule it named. */
export function describeLineupRejection(error, providerLabel) {
  const violations = Array.isArray(error?.violations) ? error.violations : [];
  const details = [...new Set(violations.map((violation) => String(violation?.message ?? '').trim()).filter(Boolean))];
  const message = String(error?.message ?? '').trim() || 'The change was not saved.';
  return {
    title: `${providerLabel} did not accept that lineup change.`,
    message,
    details: details.filter((detail) => detail !== message),
  };
}
