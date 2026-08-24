import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDraftAssistantViewModel,
  resolveDraftPlayerByeWeek,
} from '../../src/utils/draftAssistant/index.js';

const byeWeekBundle = {
  season: '2026',
  status: 'complete',
  complete: true,
  byeWeekByTeam: {
    BUF: 7,
    DAL: 7,
    JAX: 10,
    WAS: 12,
  },
};

const players = {
  qb1: {
    player_id: 'qb1',
    full_name: 'Available Quarterback',
    position: 'QB',
    fantasy_positions: ['QB'],
    team: 'BUF',
    search_rank: 2,
    projected: { 2026: { pass_yd: 4000, pass_td: 30 } },
  },
  wr1: {
    player_id: 'wr1',
    full_name: 'Drafted Receiver',
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'DAL',
    search_rank: 3,
    projected: { 2026: { rec: 90, rec_yd: 1200, rec_td: 8 } },
  },
  rb1: {
    player_id: 'rb1',
    full_name: 'Available Runner',
    position: 'RB',
    fantasy_positions: ['RB'],
    team: 'JAC',
    search_rank: 4,
    projected: { 2026: { rush_yd: 1100, rush_td: 9 } },
  },
};

const rosters = [
  { roster_id: 1, owner_id: 'u1', players: [], starters: [] },
  { roster_id: 2, owner_id: 'u2', players: [], starters: [] },
];

const league = {
  settings: { type: 0 },
  roster_positions: ['QB', 'RB', 'WR', 'BN'],
};

const draft = {
  draft_id: 'draft-bye-test',
  season: '2026',
  type: 'snake',
  status: 'drafting',
  settings: { rounds: 2 },
  slot_to_roster_id: { 1: 1, 2: 2 },
};

function buildViewModel(extra = {}) {
  return buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks: [{ roster_id: 2, player_id: 'wr1', round: 1, pick_no: 1 }],
    myRoster: rosters[0],
    scoringSettings: {},
    season: '2026',
    boardIds: ['qb1', 'wr1', 'rb1'],
    ...extra,
  });
}

test('schedule-derived byes reach candidates, saved drafted rows, and drafted-card enrichment', () => {
  const viewModel = buildViewModel({ byeWeekBundle });
  const quarterback = viewModel.allCandidates.find((player) => player.id === 'qb1');
  const draftedReceiver = viewModel.draftedCardsById.get('wr1');
  const draftedBoardRow = viewModel.boardRows.find((player) => player.id === 'wr1');

  assert.equal(quarterback.byeWeek, 7);
  assert.equal(quarterback.teamContext.byeWeek, 7);
  assert.equal(draftedReceiver.byeWeek, 7);
  assert.equal(draftedReceiver.teamContext.byeWeek, 7);
  assert.equal(draftedBoardRow.byeWeek, 7);
  assert.equal(draftedBoardRow.teamContext.byeWeek, 7);
});

test('bye enrichment is presentation-only and does not change recommendation order or scores', () => {
  const baseline = buildViewModel();
  const enriched = buildViewModel({ byeWeekBundle });

  assert.deepEqual(
    enriched.rankedCandidates.map((player) => player.id),
    baseline.rankedCandidates.map((player) => player.id),
  );
  assert.equal(enriched.bestOverall?.id, baseline.bestOverall?.id);
  assert.equal(enriched.onClockRecommendation?.id, baseline.onClockRecommendation?.id);
  assert.deepEqual(
    enriched.allCandidates.map((player) => [player.id, player.draftModel?.score]),
    baseline.allCandidates.map((player) => [player.id, player.draftModel?.score]),
  );
  assert.deepEqual(
    enriched.boardRows.map((player) => [player.id, player.available]),
    baseline.boardRows.map((player) => [player.id, player.available]),
  );
});

test('roster-tray resolution uses current Sleeper teams and only falls back to valid metadata for display', () => {
  const kicker = { player_id: 'k1', position: 'K', team: 'WSH', bye_week: 5 };
  const defense = { player_id: 'def1', position: 'DEF', team: 'JAC' };
  const idpRookie = { player_id: 'lb1', position: 'LB', team: 'JAX', years_exp: 0 };
  const freeAgent = { player_id: 'fa1', position: 'WR', team: null, bye_week: null };

  assert.equal(resolveDraftPlayerByeWeek({ player: kicker, team: kicker.team, draftSeason: '2026', byeWeekBundle }), 12);
  assert.equal(resolveDraftPlayerByeWeek({ player: defense, team: defense.team, draftSeason: '2026', byeWeekBundle }), 10);
  assert.equal(resolveDraftPlayerByeWeek({ player: idpRookie, team: idpRookie.team, draftSeason: '2026', byeWeekBundle }), 10);
  assert.equal(resolveDraftPlayerByeWeek({ player: freeAgent, team: freeAgent.team, draftSeason: '2026', byeWeekBundle }), null);
  assert.equal(resolveDraftPlayerByeWeek({ player: kicker, team: kicker.team, draftSeason: '2026', byeWeekBundle: null }), 5);
  assert.equal(resolveDraftPlayerByeWeek({
    player: kicker,
    team: kicker.team,
    draftSeason: '2025',
    byeWeekBundle: { ...byeWeekBundle, status: 'season-mismatch', complete: false },
  }), null);
});
