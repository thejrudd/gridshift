import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkInjurySlotAction,
  getInjurySlotEligibility,
  normalizeInjurySlotSettings,
} from '../../src/utils/independentInjurySlotRules.js';

test('a weekly Questionable tag does not erase verified reserve eligibility', () => {
  for (const status of ['IR', 'PUP', 'NFI', 'OUT']) {
    const result = getInjurySlotEligibility(['QUESTIONABLE', status]);
    assert.equal(result.eligible, true);
    assert.equal(result.qualifyingStatus, status);
  }
});

test('commissioner toggles grant only their own optional status', () => {
  const settings = { allowQuestionable: true };
  assert.equal(getInjurySlotEligibility(['QUESTIONABLE']).eligible, false);
  assert.equal(getInjurySlotEligibility(['QUESTIONABLE'], settings).eligible, true);
  assert.equal(getInjurySlotEligibility(['DOUBTFUL'], settings).eligible, false);
  assert.equal(getInjurySlotEligibility(['SUSPENDED'], settings).eligible, false);
  assert.equal(getInjurySlotEligibility(['DOUBTFUL'], { allowDoubtful: true }).eligible, true);
  assert.equal(getInjurySlotEligibility(['SUSPENDED'], { allowSuspended: true }).eligible, true);
});

test('enabling every optional status cannot make unrelated statuses eligible', () => {
  const settings = { allowDoubtful: true, allowQuestionable: true, allowSuspended: true };
  for (const code of ['EXEMPT', 'DNR', 'NA', 'INACTIVE', 'DNP', 'HEALTHY', 'ACTIVE', 'RETIRED', 'RESERVE', 'PROBABLE', 'COVID-19', 'UNKNOWN']) {
    assert.equal(getInjurySlotEligibility([code], settings).eligible, false, code);
  }
  assert.equal(getInjurySlotEligibility([null, '', undefined]).reason, 'missing_status');
  assert.throws(() => getInjurySlotEligibility({ reserve: ['player-1'] }), TypeError);
});

test('malformed settings cannot enable optional statuses or disable restrictions', () => {
  assert.throws(() => normalizeInjurySlotSettings({ allowQuestionable: 'false' }), TypeError);
  assert.throws(() => normalizeInjurySlotSettings({ allowHealthy: true }), TypeError);
  assert.throws(() => normalizeInjurySlotSettings({ ineligiblePolicy: 'typo' }), TypeError);
  const settings = normalizeInjurySlotSettings({ allowSuspended: true });
  assert.equal(settings.ineligiblePolicy, 'restrict_acquisitions');
  assert.equal(normalizeInjurySlotSettings().allowSuspended, false);
});

test('a status change blocks a pending acquisition when execution is rechecked', () => {
  const command = { action: 'waiver_acquisition' };
  assert.equal(checkInjurySlotAction({ ...command, hasIneligiblePlayer: false }).allowed, true);
  assert.equal(checkInjurySlotAction({ ...command, hasIneligiblePlayer: true }).allowed, false);
  assert.equal(checkInjurySlotAction({ action: 'lineup_change', hasIneligiblePlayer: true }).allowed, true);
  assert.equal(checkInjurySlotAction({ action: 'drop', hasIneligiblePlayer: true }).allowed, true);
});

test('a combined transaction may acquire players only when its resulting roster is valid', () => {
  for (const action of ['incoming_trade', 'free_agent_add', 'waiver_acquisition']) {
    assert.equal(checkInjurySlotAction({ action, hasIneligiblePlayer: true }).allowed, false);
    assert.equal(checkInjurySlotAction({ action, hasIneligiblePlayer: true, resultingRosterValid: true }).allowed, true);
  }
  assert.equal(checkInjurySlotAction({ action: 'outgoing_trade', hasIneligiblePlayer: true }).allowed, true);
});

test('strict mode allows making activation space without prematurely unlocking the roster', () => {
  const settings = { ineligiblePolicy: 'lock_roster_moves' };
  const violation = { hasIneligiblePlayer: true, settings };
  assert.equal(checkInjurySlotAction({ ...violation, action: 'drop', createsActivationSpace: true }).allowed, true);
  assert.equal(checkInjurySlotAction({ ...violation, action: 'lineup_change' }).allowed, false);
  assert.equal(checkInjurySlotAction({ ...violation, action: 'activate_from_injury', removesIneligiblePlayer: true }).allowed, true);
  assert.equal(checkInjurySlotAction({ ...violation, action: 'drop', removesIneligiblePlayer: true }).allowed, true);
  assert.equal(checkInjurySlotAction({ action: 'lineup_change', hasIneligiblePlayer: false, settings }).allowed, true);
});

test('strict mode does not allow ordinary moves even if a proposed trade would resolve the violation', () => {
  const violation = { hasIneligiblePlayer: true, settings: { ineligiblePolicy: 'lock_roster_moves' } };
  for (const action of ['lineup_change', 'roster_move', 'free_agent_add', 'waiver_acquisition', 'incoming_trade', 'outgoing_trade', 'drop', 'activate_from_injury']) {
    assert.equal(checkInjurySlotAction({ ...violation, action, resultingRosterValid: true }).allowed, false, action);
  }
});

test('a commissioner policy change is reflected on the next evaluation', () => {
  const action = { action: 'lineup_change', hasIneligiblePlayer: true };
  assert.equal(checkInjurySlotAction(action).allowed, true);
  assert.equal(checkInjurySlotAction({ ...action, settings: { ineligiblePolicy: 'lock_roster_moves' } }).allowed, false);
  const warning = checkInjurySlotAction({ action: 'incoming_trade', hasIneligiblePlayer: true, settings: { ineligiblePolicy: 'warn_only' } });
  assert.deepEqual(warning, { allowed: true, reason: 'warning_only' });
});

test('invalid or missing action facts cannot silently grant a write', () => {
  assert.throws(() => checkInjurySlotAction({ action: 'invented', hasIneligiblePlayer: true }), TypeError);
  assert.throws(() => checkInjurySlotAction({ action: 'lineup_change' }), TypeError);
  assert.throws(() => checkInjurySlotAction({ action: 'drop', hasIneligiblePlayer: true, createsActivationSpace: 'true' }), TypeError);
});
