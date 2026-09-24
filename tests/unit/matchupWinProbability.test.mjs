import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaceAdjustedProjection } from '../../src/utils/playerMatchupPresentation.js';
import {
  buildMatchupWinProbability,
  hasFinalMatchupGameEvidence,
} from '../../src/utils/matchupWinProbability.js';

const kickoff = '2026-09-07T10:00:00.000Z';
const now = Date.parse('2026-09-07T10:00:00.000Z');

function player({
  id,
  name = id,
  position = 'RB',
  projected = 12,
  current = 0,
  started = false,
  completed = false,
  scheduleEntry = { kickoff, completed },
  isBye = false,
  source = 'balldontlie',
  collectedAt = '2026-09-07T08:00:00.000Z',
} = {}) {
  return {
    id,
    name,
    position,
    weekPts: current,
    avgPPG: 10,
    gameStarted: started,
    scheduleEntry,
    isBye,
    projection: projected == null ? null : {
      projected,
      min: projected * 0.7,
      max: projected * 1.3,
      factors: {
        source,
        providerCollectedAt: collectedAt,
        scoringSource: source === 'balldontlie' ? 'gridshift-custom-scoring' : null,
      },
    },
  };
}

test('Matchup win probability uses the shared forecast model with BDL provenance', () => {
  const result = buildMatchupWinProbability({
    myPlayers: [player({ id: 'mine', projected: 18 })],
    opponentPlayers: [player({ id: 'opponent', projected: 10 })],
    now,
  });

  assert.equal(result.mode, 'pregame');
  assert.equal(result.complete, true);
  assert.equal(result.primarySource, 'balldontlie');
  assert.equal(result.usesLeagueScoring, true);
  assert.equal(result.expectedA, 18);
  assert.equal(result.expectedB, 10);
  assert.ok(result.probA > 50);
  assert.equal(result.explanation.a.remaining, 18);
});

test('Matchup win probability switches to actual points plus remaining projection after kickoff', () => {
  const result = buildMatchupWinProbability({
    myPlayers: [player({ id: 'mine', projected: 20, current: 8, started: true })],
    opponentPlayers: [player({ id: 'opponent', projected: 12 })],
    now: Date.parse('2026-09-07T12:00:00.000Z'),
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.explanation.a.current, 8);
  assert.ok(result.explanation.a.remaining < 20);
  assert.equal(result.explanation.b.remaining, 12);
  assert.ok(result.expectedA > 8);
});

test('Matchup win probability exposes a lower-confidence fallback instead of hiding incomplete lineups', () => {
  const result = buildMatchupWinProbability({
    myPlayers: [player({ id: 'mine', projected: null })],
    opponentPlayers: [player({ id: 'opponent', projected: 12 })],
    now,
  });

  assert.equal(result.complete, false);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.projectedCount, 1);
  assert.equal(result.starterCount, 2);
  assert.ok(result.expectedA > 0, 'season-average fallback keeps an estimate available');
  assert.ok(result.sigma > 0);
});

test('Matchup win probability includes custom matchup points in the expected final', () => {
  const result = buildMatchupWinProbability({
    myPlayers: [player({ id: 'mine', projected: 10 })],
    opponentPlayers: [player({ id: 'opponent', projected: 10 })],
    myCustomPoints: 3,
    now,
  });

  assert.equal(result.expectedA, 13);
  assert.equal(result.expectedB, 10);
  assert.ok(result.probA > 50);
});

test('historical kickoff evidence waits through a game-length safety window', () => {
  const historicalPlayer = player({ id: 'historical', started: true, completed: false });

  assert.equal(hasFinalMatchupGameEvidence([historicalPlayer], {
    now: now + (5 * 60 * 60 * 1000),
  }), false);
  assert.equal(hasFinalMatchupGameEvidence([historicalPlayer], {
    now: now + (6 * 60 * 60 * 1000) + 1,
  }), true);
  assert.equal(hasFinalMatchupGameEvidence([player({ id: 'missing-schedule', started: true, scheduleEntry: null })], {
    now: now + (24 * 60 * 60 * 1000),
  }), false);
  assert.equal(hasFinalMatchupGameEvidence([player({
    id: 'postponed',
    started: true,
    scheduleEntry: { kickoff, status: 'postponed' },
  })], {
    now: now + (24 * 60 * 60 * 1000),
  }), false);
});

test('a fully final schedule week settles starters with no schedule row of their own', () => {
  const retired = player({ id: 'retired', started: false, scheduleEntry: null });
  const played = player({ id: 'played', started: true, completed: true });

  assert.equal(hasFinalMatchupGameEvidence([retired, played], { now }), false);
  assert.equal(hasFinalMatchupGameEvidence([retired, played], {
    scheduleWeekFinal: true,
    now,
  }), true);
  assert.equal(hasFinalMatchupGameEvidence([], { scheduleWeekFinal: true, now }), false);
});

test('a reconciled historical matchup locks the winning side at exact certainty', () => {
  const result = buildMatchupWinProbability({
    myPlayers: [player({ id: 'mine', current: 159.67, started: true })],
    opponentPlayers: [player({ id: 'opponent', current: 137.08, started: true })],
    settledConfirmed: true,
    officialPoints: { mine: 159.67, opponent: 137.08 },
    now: now + (24 * 60 * 60 * 1000),
  });

  assert.equal(result.mode, 'final');
  assert.equal(result.settled, true);
  assert.equal(result.probA, 100);
  assert.equal(result.expectedA, 159.7);
  assert.equal(result.expectedB, 137.1);
  assert.equal(result.sigma, 0);
  assert.equal(result.explanation.settled, true);
  assert.equal(result.explanation.playersRemaining, 0);
});

test('a final-looking schedule with a leading score locks in ahead of official settlement confirmation', () => {
  const result = buildMatchupWinProbability({
    myPlayers: [player({ id: 'mine', current: 100, started: true, completed: true })],
    opponentPlayers: [player({ id: 'opponent', current: 80, started: true, completed: true })],
    now,
  });

  assert.equal(result.settled, true);
  assert.equal(result.probA, 100);
});

test('Live pace-adjusted team projection equals the sum of the player-row projections', () => {
  const later = Date.parse('2026-09-07T11:00:00.000Z');
  const live = (id, projected, current) => player({ id, projected, current, started: true });
  const finished = player({ id: 'done', projected: 10, current: 14.26, started: true, completed: true });
  const upcoming = player({ id: 'later', projected: 9.44, scheduleEntry: { kickoff: '2026-09-07T20:00:00.000Z', completed: false } });
  const mine = [live('a', 20, 13), live('b', 12, 0), finished, upcoming];
  const result = buildMatchupWinProbability({
    myPlayers: mine,
    opponentPlayers: [live('c', 15, 6)],
    myCustomPoints: 2,
    now: later,
  });
  const rowValue = (p) => {
    if (p.scheduleEntry.completed) return p.weekPts;
    if (!p.gameStarted) return Math.round(p.projection.projected * 10) / 10;
    return getPaceAdjustedProjection({
      phase: 'live',
      total: p.weekPts,
      projected: p.projection.projected,
      scheduleEntry: p.scheduleEntry,
      now: later,
    });
  };
  const rowSum = Math.round((mine.reduce((sum, p) => sum + rowValue(p), 0) + 2) * 10) / 10;
  assert.equal(result.paceExpectedA, rowSum);
  // The neutral model behind win probability is unchanged by pace.
  assert.notEqual(result.paceExpectedA, result.expectedA);
});
