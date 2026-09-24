import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchupPreviewModel } from '../../src/utils/matchupPreviewModel.js';

const SLOT_LABELS = { FLEX: 'W/R/T', DEF: 'DST' };

const player = (name, position, projected, overrides = {}) => ({
  id: `${name}-id`,
  name,
  position,
  team: overrides.team ?? 'ATL',
  oppTeam: overrides.oppTeam ?? 'CAR',
  isHome: overrides.isHome ?? true,
  isBye: false,
  gameStarted: overrides.gameStarted ?? false,
  gameDate: '2026-09-20',
  scheduleEntry: { date: '2026-09-20', kickoff: overrides.kickoff ?? '2026-09-20T17:00:00Z', ...overrides.scheduleEntry },
  projection: projected == null ? null : { projected },
  weekPts: overrides.weekPts ?? null,
  avgPPG: overrides.avgPPG ?? 11,
  rank: overrides.rank ?? 10,
  weekly: overrides.weekly ?? [],
  availabilityStatus: overrides.availabilityStatus ?? null,
  opponentFantasyContext: overrides.opponentFantasyContext ?? null,
  weather: overrides.weather ?? null,
  isIndoor: overrides.isIndoor ?? true,
});

const slots = [
  { slotPos: 'QB', mine: player('Stafford', 'QB', 19.2), opp: player('Lawrence', 'QB', 16.8) },
  { slotPos: 'RB', mine: player('Robinson', 'RB', 18.4), opp: player('Gibbs', 'RB', 15.1) },
  { slotPos: 'RB', mine: player('Walker', 'RB', 12.1), opp: player('Brown', 'RB', 11.4) },
  { slotPos: 'TE', mine: player('McBride', 'TE', 11.8), opp: player('Bowers', 'TE', 15.6) },
  { slotPos: 'FLEX', mine: player('Waddle', 'WR', 10.9), opp: player('Odunze', 'WR', 9.2) },
];

const rosters = [
  { roster_id: 1, settings: { wins: 1, losses: 1, fpts: 231, fpts_decimal: 40, fpts_against: 226, fpts_against_decimal: 90 } },
  { roster_id: 2, settings: { wins: 2, losses: 0, fpts: 244, fpts_decimal: 80, fpts_against: 212, fpts_against_decimal: 0 } },
  { roster_id: 3, settings: { wins: 0, losses: 2, fpts: 180, fpts_decimal: 0, fpts_against: 260, fpts_against_decimal: 0 } },
];

const baseInput = {
  leagueId: 'league-1',
  season: '2026',
  week: 3,
  phase: 'pre',
  sides: {
    a: { rosterId: 1, name: 'Fourth & Long', managerName: 'You', abbr: 'F&L', initials: 'FL', palette: ['#5AADFF', '#2E6FA8'] },
    b: { rosterId: 2, name: 'Second Bower', managerName: 'D. Mahler', abbr: 'BOW', initials: 'SB', palette: ['#FF8C1A', '#A85A10'] },
  },
  slots,
  benches: { a: [], b: [] },
  winProbability: {
    probA: 53, expectedA: 72.4, expectedB: 68.1, expectedMarginA: 4.3,
    starterCount: 10, projectedCount: 10, explanation: { swing: 24 },
  },
  rosters,
  slotLabels: SLOT_LABELS,
};

test('builds both sides from the league rosters', () => {
  const model = buildMatchupPreviewModel(baseInput);
  assert.equal(model.sides.a.record, '1–1');
  assert.equal(model.sides.b.record, '2–0');
  assert.equal(model.sides.a.seedLabel, '2nd seed');
  assert.equal(model.sides.b.seedLabel, '1st seed');
  assert.equal(model.sides.a.pointsFor, 231.4);
  assert.equal(model.sides.b.pointsAgainst, 212);
  assert.equal(model.league.teamCount, 3);
});

test('aggregates slot groups and marks the leading side', () => {
  const model = buildMatchupPreviewModel(baseInput);
  const rb = model.slotGroups.find((group) => group.label === 'RB');
  assert.equal(rb.starters, 2);
  assert.equal(rb.a, 30.5);
  assert.equal(rb.b, 26.5);
  assert.equal(rb.lead, 'a');
  const te = model.slotGroups.find((group) => group.label === 'TE');
  assert.equal(te.lead, 'b');
});

test('post-game movers carry the projection delta as a chip, without repeating the game state', () => {
  const model = buildMatchupPreviewModel({ ...baseInput, nowMs: NOW_MS, phase: 'live', slots: underwaySlots() });
  for (const entry of [...model.watch.a, ...model.watch.b]) {
    assert.match(entry.chip, /^[+−]\d+\.\d vs projection$/);
    assert.match(entry.tag, /^Final · /);
  }
});

test('leaves a slot group total null when a starter has no projection', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    slots: [...slots.slice(0, 2), { slotPos: 'RB', mine: player('Walker', 'RB', null), opp: player('Brown', 'RB', 11.4) }],
  });
  const rb = model.slotGroups.find((group) => group.label === 'RB');
  assert.equal(rb.a, null, 'a missing projection must not be counted as zero');
  assert.equal(rb.lead, null);
});

test('reports at most three players to watch a side, highest projection first', () => {
  const model = buildMatchupPreviewModel(baseInput);
  assert.equal(model.watch.a.length, 3);
  assert.equal(model.watch.a[0].name, 'Stafford');
  assert.ok(model.watch.a[0].value >= model.watch.a[1].value);
});

test('reports the largest same-position bench upgrade', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    benches: { a: [player('Bench RB', 'RB', 16.9), player('Bench WR', 'WR', 12.0)], b: [] },
  });
  // Bench RB 16.9 over Walker 12.1 beats Bench WR 12.0 over Waddle 10.9.
  assert.equal(model.sides.a.benchUpgrade, 4.8);
  assert.match(model.sides.a.benchUpgradeLabel, /Bench RB over Walker/);
});

test('ignores a bench player whose position nobody starts', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    // No kicker starts in this lineup, so a kicker on the bench is not an
    // upgrade over anyone. Slot eligibility beyond matching positions depends
    // on league roster settings this model deliberately does not assume.
    benches: { a: [player('Bench K', 'K', 40)], b: [] },
  });
  assert.equal(model.sides.a.benchUpgrade, null);
  assert.equal(model.sides.a.benchUpgradeLabel, null);
});

test('reports no bench upgrade when the bench is weaker', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    benches: { a: [player('Backup', 'RB', 4.2)], b: [] },
  });
  assert.equal(model.sides.a.benchUpgrade, null);
});

test('settles into the final phase when the forecast is settled', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    phase: 'live',
    winProbability: { ...baseInput.winProbability, settled: true, actualA: 121.6, actualB: 114.2 },
  });
  assert.equal(model.phase, 'post');
  assert.equal(model.bigLabel, 'final');
  assert.equal(model.keysTitle, 'How it was won');
});

test('counts starters on fallback estimates', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    winProbability: { ...baseInput.winProbability, starterCount: 10, projectedCount: 7 },
  });
  assert.equal(model.fallbackCount, 3);
  assert.match(model.odds.note, /3 on fallback estimates/);
});

test('splits kickoffs into early and late windows', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    slots: [
      { slotPos: 'QB', mine: player('Early', 'QB', 20, { kickoff: '2026-09-20T17:00:00Z' }), opp: player('Also early', 'QB', 10, { kickoff: '2026-09-20T17:00:00Z' }) },
      { slotPos: 'RB', mine: player('Primetime', 'RB', 15, { kickoff: '2026-09-22T00:15:00Z' }), opp: player('Early back', 'RB', 9, { kickoff: '2026-09-20T17:00:00Z' }) },
    ],
  });
  assert.equal(model.sides.a.earlyWindowProjection, 20);
  assert.equal(model.sides.a.lateWindowProjection, 15);
  assert.equal(model.sides.b.lateWindowProjection, null);
});

test('carries the opponent defensive context onto a watched starter', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    slots: [{
      slotPos: 'TE',
      mine: player('Bowers', 'TE', 15.6, {
        opponentFantasyContext: { rank: 30, teamCount: 32, ptsAllowedPerGame: 14.2, leagueAveragePtsAllowed: 9.1, differenceFromLeagueAverage: 5.1, position: 'TE' },
      }),
      opp: player('McBride', 'TE', 11.8),
    }],
  });
  const watched = model.watch.a[0];
  assert.equal(watched.opponentContext.rank, 30);
  assert.equal(watched.tag, '#30 vs TE');
  assert.equal(watched.tone, 'good');
});

test('produces keys and a lede without markup', () => {
  const model = buildMatchupPreviewModel(baseInput);
  assert.ok(model.keys.length > 0);
  assert.ok(model.lede.length > 0);
  for (const key of model.keys) {
    assert.ok(!/[<>]/.test(key.text));
  }
});

test('degrades to null rather than guessing when a side is missing', () => {
  assert.equal(buildMatchupPreviewModel({ ...baseInput, sides: { a: baseInput.sides.a } }), null);
});

test('omits season shape when no roster season data exists', () => {
  const model = buildMatchupPreviewModel({ ...baseInput, rosters: null });
  assert.equal(model.seasonShape, null);
  assert.equal(model.sides.a.record, null);
  assert.equal(model.sides.a.pointsFor, null);
});

test('records the projection drift against the captured baseline', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    baselines: { 'Stafford-id': { projection: { projected: 14.1 } } },
  });
  const stafford = model.slots[0].a;
  assert.equal(stafford.baselineProjected, 14.1);
  assert.equal(stafford.projected, 19.2);
});

const NOW_MS = Date.parse('2026-09-20T18:00:00Z');
const finalGame = { completed: true };
const underwaySlots = () => [
  {
    slotPos: 'QB',
    mine: player('Finished Star', 'QB', 15, { gameStarted: true, weekPts: 34.7, scheduleEntry: finalGame }),
    opp: player('Waiting QB', 'QB', 20, { gameStarted: false, weekPts: 0, kickoff: '2026-09-21T20:25:00Z' }),
  },
  {
    slotPos: 'RB',
    mine: player('Waiting Back', 'RB', 14, { gameStarted: false, weekPts: 0, kickoff: '2026-09-21T17:00:00Z' }),
    opp: player('Finished Back', 'RB', 9, { gameStarted: true, weekPts: 8.4, scheduleEntry: finalGame }),
  },
];

test('a week with only final and unstarted games is underway, not live', () => {
  const model = buildMatchupPreviewModel({ ...baseInput, nowMs: NOW_MS, phase: 'live', slots: underwaySlots() });
  assert.equal(model.phase, 'live');
  assert.equal(model.liveNow, false);
  assert.equal(model.bigLabel, 'so far');
  assert.equal(model.odds.mid, 'Estimated win chance');
  assert.equal(model.odds.band, 'Week underway');
  assert.equal(model.odds.bandTone, '');
  assert.equal(model.watch.title, 'Top scorers so far');
  assert.ok(model.nextKickoff);
});

test('a started, unfinished game makes the week live', () => {
  const slotsWithLive = underwaySlots();
  slotsWithLive[0].opp = player('Playing QB', 'QB', 20, { gameStarted: true, weekPts: 6.2, kickoff: '2026-09-20T17:00:00Z' });
  const model = buildMatchupPreviewModel({ ...baseInput, nowMs: NOW_MS, phase: 'live', slots: slotsWithLive });
  assert.equal(model.liveNow, true);
  assert.equal(model.bigLabel, 'live');
  assert.equal(model.odds.mid, 'Live win chance');
  assert.equal(model.odds.band, 'In progress');
  assert.equal(model.watch.title, 'Live movers');
});

test('movers list only starters whose games have started and never tags an unstarted game in progress', () => {
  const model = buildMatchupPreviewModel({ ...baseInput, nowMs: NOW_MS, phase: 'live', slots: underwaySlots() });
  const names = [...model.watch.a, ...model.watch.b].map((entry) => entry.name);
  assert.deepEqual(names.sort(), ['Finished Back', 'Finished Star']);
  for (const entry of [...model.watch.a, ...model.watch.b]) {
    assert.match(entry.tag, /^Final · /);
  }
});

test('a future kickoff outranks stat-row evidence, so the week stays a preview', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    nowMs: Date.parse('2026-09-08T12:00:00Z'),
    phase: 'live',
    slots: [{
      slotPos: 'QB',
      mine: player('Zero Row', 'QB', 18, { gameStarted: true, weekPts: 0, kickoff: '2026-09-10T00:20:00Z' }),
      opp: player('Zero Row Two', 'QB', 17, { gameStarted: true, weekPts: 0, kickoff: '2026-09-10T00:20:00Z' }),
    }],
  });
  assert.equal(model.phase, 'pre');
  assert.equal(model.liveNow, false);
  assert.equal(model.bigLabel, 'projected');
});

test('the headline score and lede use the caller\'s live totals, not the projection', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    nowMs: NOW_MS,
    phase: 'live',
    slots: underwaySlots(),
    liveTotals: { a: 194.3, b: 143.0 },
  });
  assert.equal(model.big.a, 194.3);
  assert.equal(model.big.b, 143);
  assert.equal(model.liveMargin, 51.3);
  const lede = model.lede.map((part) => part.text ?? part).join('');
  assert.match(lede, /leads by 51\.3 pts/);
  // Both sides' remaining projections appear so the lede reads consistently with the keys.
  assert.match(lede, /20\.0 pts of projection still to play, against 14\.0 pts/);
});

test('a live headline without a real score is unavailable rather than the projection', () => {
  const model = buildMatchupPreviewModel({ ...baseInput, nowMs: NOW_MS, phase: 'live', slots: underwaySlots() });
  assert.equal(model.big.a, null);
  assert.equal(model.big.b, null);
});

test('each mover carries its own unit: final games are final, unfinished games are live', () => {
  const slotsWithLive = underwaySlots();
  slotsWithLive[1].opp = player('Playing Back', 'RB', 9, { gameStarted: true, weekPts: 5.5, kickoff: '2026-09-20T17:00:00Z' });
  const model = buildMatchupPreviewModel({ ...baseInput, nowMs: NOW_MS, phase: 'live', slots: slotsWithLive });
  assert.equal(model.watch.a.find((entry) => entry.name === 'Finished Star').unit, 'final');
  assert.equal(model.watch.b.find((entry) => entry.name === 'Playing Back').unit, 'live');
  assert.equal('note' in model.watch, false);
});

test('carries the primary header\'s projected final, delta and season summary onto each side', () => {
  const summary = { record: '1-0', pointsFor: '231.4', pointsAgainst: '226.9' };
  const model = buildMatchupPreviewModel({
    ...baseInput,
    nowMs: NOW_MS,
    phase: 'live',
    slots: underwaySlots(),
    liveTotals: { a: 120, b: 100 },
    headerExtras: {
      a: { projectedFinal: 130.24, projectionDelta: '−10.2', summary },
      b: { projectedFinal: null, summary: null },
    },
  });
  assert.equal(model.sides.a.projectedFinal, 130.2);
  assert.equal(model.sides.a.projectionDelta, '−10.2');
  assert.deepEqual(model.sides.a.summary, summary);
  assert.equal(model.sides.b.projectedFinal, null);
  assert.equal(model.sides.b.summary, null);
});

test('the live keys state both sides\' figures without contradicting the lede', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    nowMs: NOW_MS,
    phase: 'live',
    slots: underwaySlots(),
    liveTotals: { a: 194.3, b: 143 },
    keyLimit: 8,
  });
  const text = (parts) => parts.map((part) => part.text ?? part).join('');
  const comeback = model.keys.find((key) => key.tag === 'Still to come');
  if (comeback) {
    assert.match(text(comeback.parts), /51\.3 pts/);
    assert.doesNotMatch(text(comeback.parts), /more left to play/);
  }
  for (const key of model.keys) {
    assert.doesNotMatch(text(key.parts), /Sunday-night/);
  }
});

test('a finished late game no longer counts toward the late-window projection', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    nowMs: NOW_MS,
    phase: 'live',
    slots: [{
      slotPos: 'QB',
      mine: player('Done Late', 'QB', 20, { gameStarted: true, weekPts: 18, kickoff: '2026-09-20T21:25:00Z', scheduleEntry: { completed: true } }),
      opp: player('Coming Late', 'QB', 15, { kickoff: '2026-09-21T00:20:00Z' }),
    }],
  });
  assert.equal(model.sides.a.lateWindowProjection, null);
  assert.equal(model.sides.b.lateWindowProjection, 15);
});

test('the comeback key states where the projected finish lands, in the trailing side\'s terms', () => {
  const model = buildMatchupPreviewModel({
    ...baseInput,
    nowMs: NOW_MS,
    phase: 'live',
    slots: underwaySlots(),
    liveTotals: { a: 100, b: 60 },
    keyLimit: 8,
  });
  const comeback = model.keys.find((key) => key.tag === 'Still to come');
  assert.ok(comeback);
  const text = comeback.parts.map((part) => part.text ?? part).join('');
  assert.match(text, /40\.0 pts/);
  assert.match(text, /projected to score .* (more|fewer) than/);
});
