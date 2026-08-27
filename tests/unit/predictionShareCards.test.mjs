import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createPredictionShareView,
  formatPredictionRecord,
  getPredictionShareTeamLogoUrl,
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

test('uses bundled same-origin logos for every prediction team', () => {
  const schedule = JSON.parse(readFileSync(new URL('../../public/nfl-data-2026.json', import.meta.url), 'utf8'));

  for (const team of schedule.teams) {
    const logoUrl = getPredictionShareTeamLogoUrl(team);
    assert.equal(logoUrl, `/logos/${team.id}.png`);
    assert.equal(
      existsSync(new URL(`../../public${logoUrl}`, import.meta.url)),
      true,
      `Missing bundled share-card logo for ${team.id}`,
    );
  }

  assert.equal(getPredictionShareTeamLogoUrl(null), null);
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

test('expands one selected team and its ordered Advanced Mode matchup rows', () => {
  const view = createPredictionShareView({
    teams,
    records: { BUF: { wins: 13, losses: 4 }, MIA: { wins: 10, losses: 7 } },
    teamRecord: {
      teamId: 'BUF',
      rows: [
        { gameId: 'w1', week: 1, venue: 'home', opponentId: 'MIA', result: 'W' },
        { gameId: 'w2', week: 2, venue: 'away', opponentId: 'NE', result: 'L' },
      ],
    },
  });

  assert.equal(view.teamRecord.team.id, 'BUF');
  assert.equal(view.teamRecord.team.record.wins, 13);
  assert.deepEqual(view.teamRecord.matchups.map(row => [row.week, row.opponent.id, row.result]), [
    [1, 'MIA', 'W'],
    [2, 'NE', 'L'],
  ]);
});

test('wraps curated title selection without ever admitting free-form title copy', () => {
  for (const titles of Object.values(SHARE_CARD_TITLES)) {
    assert.ok(titles.length >= 15 && titles.length <= 25);
  }
  assert.deepEqual(getShareCardTitle('board', SHARE_CARD_TITLES.board.length), SHARE_CARD_TITLES.board[0]);
  assert.deepEqual(getShareCardTitle('champions', -1), SHARE_CARD_TITLES.champions.at(-1));
});
