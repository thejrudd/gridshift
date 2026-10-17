// Pure pilot rules. Provider adapters must supply current verified status codes;
// fantasy reserve-slot membership and display fallbacks are never evidence.
export const DEFAULT_INJURY_SLOT_SETTINGS = Object.freeze({
  allowDoubtful: false,
  allowQuestionable: false,
  allowSuspended: false,
  ineligiblePolicy: 'restrict_acquisitions',
});

const POLICIES = new Set(['restrict_acquisitions', 'lock_roster_moves', 'warn_only']);
const BASE_STATUSES = ['IR', 'PUP', 'NFI', 'OUT'];
const OPTIONAL_STATUSES = [
  ['DOUBTFUL', 'allowDoubtful'],
  ['QUESTIONABLE', 'allowQuestionable'],
  ['SUSPENDED', 'allowSuspended'],
];
const ACTIONS = new Set([
  'lineup_change', 'roster_move', 'free_agent_add', 'waiver_acquisition',
  'incoming_trade', 'outgoing_trade', 'activate_from_injury', 'drop',
]);
const ACQUISITIONS = new Set(['free_agent_add', 'waiver_acquisition', 'incoming_trade']);

export function normalizeInjurySlotSettings(settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Injury-slot settings must be an object.');
  }
  for (const key of Object.keys(settings)) {
    if (!Object.hasOwn(DEFAULT_INJURY_SLOT_SETTINGS, key)) {
      throw new TypeError(`Unsupported injury-slot setting: ${key}`);
    }
  }
  const normalized = { ...DEFAULT_INJURY_SLOT_SETTINGS, ...settings };
  for (const [, key] of OPTIONAL_STATUSES) {
    if (typeof normalized[key] !== 'boolean') {
      throw new TypeError(`${key} must be a boolean.`);
    }
  }
  if (!POLICIES.has(normalized.ineligiblePolicy)) {
    throw new TypeError('Unsupported ineligible injury-slot policy.');
  }
  return normalized;
}

/**
 * Codes are explicit domain inputs, not raw provider/player objects. Unknown
 * codes cannot qualify. A verified reserve designation survives a weekly Q tag.
 */
export function getInjurySlotEligibility(statusCodes = [], settings = {}) {
  if (!Array.isArray(statusCodes)) throw new TypeError('Status codes must be an array.');
  const normalized = normalizeInjurySlotSettings(settings);
  const codes = new Set(statusCodes
    .filter((code) => typeof code === 'string')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean));
  const qualifyingStatus = BASE_STATUSES.find((code) => codes.has(code))
    ?? OPTIONAL_STATUSES.find(([code, setting]) => codes.has(code) && normalized[setting])?.[0]
    ?? null;
  return {
    eligible: qualifyingStatus !== null,
    qualifyingStatus,
    reason: qualifyingStatus ? 'qualifying_status' : codes.size ? 'status_not_eligible' : 'missing_status',
  };
}

/**
 * Evaluates ONLY the injury-slot restriction, not general action legality.
 * All facts must be derived from authoritative before/after roster state by
 * the server. They must never be accepted as manager-supplied request flags.
 * `createsActivationSpace` means this drop reduces a binding total/position
 * capacity constraint preventing a specific ineligible player's activation;
 * merely dropping an unrelated player or creating an already-free slot is not
 * sufficient. `removesIneligiblePlayer` means the action actually removes an
 * offending player from an injury slot. General roster validation is separate.
 * Commissioner override authorization/auditing belongs to the command layer.
 */
export function checkInjurySlotAction({
  action,
  hasIneligiblePlayer,
  resultingRosterValid = false,
  removesIneligiblePlayer = false,
  createsActivationSpace = false,
  settings = {},
} = {}) {
  const { ineligiblePolicy: policy } = normalizeInjurySlotSettings(settings);
  if (!ACTIONS.has(action)) throw new TypeError('Unsupported injury-slot action.');
  for (const fact of [hasIneligiblePlayer, resultingRosterValid, removesIneligiblePlayer, createsActivationSpace]) {
    if (typeof fact !== 'boolean') throw new TypeError('Injury-slot action facts must be boolean.');
  }
  if (!hasIneligiblePlayer) return { allowed: true, reason: 'no_injury_slot_violation' };
  if (policy === 'warn_only') return { allowed: true, reason: 'warning_only' };

  if (policy === 'restrict_acquisitions') {
    const allowed = !ACQUISITIONS.has(action) || resultingRosterValid;
    return { allowed, reason: allowed ? 'permitted_by_policy' : 'injury_slot_acquisition_restricted' };
  }

  const corrective = (action === 'activate_from_injury' && removesIneligiblePlayer)
    || (action === 'drop' && (removesIneligiblePlayer || createsActivationSpace));
  return {
    allowed: corrective,
    reason: corrective ? 'corrective_move' : 'injury_slot_roster_locked',
  };
}
