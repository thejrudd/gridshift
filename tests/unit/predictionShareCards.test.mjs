import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPredictionShareView,
  formatPredictionRecord,
} from '../../src/components/predictions/share/shareCardModel.js';
import { SHARE_CARD_TITLES, getShareCardTitle } from '../../src/components/predictions/share/shareCardTitles.js';

const teams = [
  { id: 'BUF', name: 'Buffalo Bills', conference: 'AFC', division: 'AFC East' },
  { id: 'MIA', name: 'Miami Dolphins', conference: 'AFC', division: 'AFC East' },
  { id: 'NE', name: 'New England Patriots', conference: 'AFC', division: 'AFC East' },
  { id: 'NYJ', name: 'New York Jets', conference: 'AFC', division: 'AFC East' },
  { id: 'PHI', name: 'Philadelphia Eagles', conference: 'NFC', division: 'NFC East' },
];

test('formats tied and untied records for the fixed-size card copy', () => {
  assert.equal(formatPredictionRecord({ wins: 11, losses: 6 }), '11-6');
  assert.equal(formatPredictionRecord({ wins: 10, losses: 6, ties: 1 }), '10-6-1');
});

test('builds display divisions and standings from a canonical record snapshot', () => {
  const view = createPredictionShareView({
    season: 2026,
    teams,
    records: {
      BUF: { wins: 13, losses: 4, divisionWins: 5 },
      MIA: { wins: 10, losses: 7, divisionWins: 3 },
      NE: { wins: 8, losses: 9, divisionWins: 3 },
      NYJ: { wins: 6, losses: 11, divisionWins: 1 },
      PHI: { wins: 12, losses: 5, divisionWins: 5 },
    },
  });

  assert.equal(view.divisions[0].label, 'AFC East');
  assert.deepEqual(view.divisions[0].teams.map(team => team.id), ['BUF', 'MIA', 'NE', 'NYJ']);
  assert.equal(view.divisionWinners[0].id, 'BUF');
  assert.equal(view.seeds.AFC[0].id, 'BUF');
  assert.equal(view.seeds.NFC[0].id, 'PHI');
});

test('preserves both Super Bowl participants and the selected champion for bracket cards', () => {
  const view = createPredictionShareView({
    teams,
    conferenceChampions: { AFC: 'BUF', NFC: 'PHI' },
    champion: 'PHI',
  });

  assert.equal(view.conferenceChampions.AFC.id, 'BUF');
  assert.equal(view.conferenceChampions.NFC.id, 'PHI');
  assert.equal(view.champion.id, 'PHI');
});

test('wraps curated title selection without ever admitting free-form title copy', () => {
  for (const titles of Object.values(SHARE_CARD_TITLES)) {
    assert.ok(titles.length >= 15 && titles.length <= 25);
  }
  assert.deepEqual(getShareCardTitle('board', SHARE_CARD_TITLES.board.length), SHARE_CARD_TITLES.board[0]);
  assert.deepEqual(getShareCardTitle('champions', -1), SHARE_CARD_TITLES.champions.at(-1));
});
