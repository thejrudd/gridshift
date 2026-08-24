import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFantasyAdpPlayersForLeague,
  getFantasyAdpSnapshotUpdatedAt,
  mapFantasyAdpToSleeperPlayers,
} from '../../src/utils/fantasyAdp.js';

const players = {
  allen: { full_name: 'Josh Allen', team: 'BUF', position: 'QB' },
  gibbs: { full_name: 'Jahmyr Gibbs', team: 'DET', position: 'RB' },
  bills: { full_name: 'Buffalo Bills', team: 'BUF', position: 'DEF' },
};

test('maps BALLDONTLIE ADP only when name, team, and position agree exactly', () => {
  const matched = mapFantasyAdpToSleeperPlayers({
    players,
    adpRows: [
      {
        player: { first_name: 'Josh', last_name: 'Allen', position_abbreviation: 'QB' },
        team: { abbreviation: 'BUF' },
        position: 'QB',
        average_draft_position: 22.09,
      },
      {
        player: { first_name: 'Jahmyr', last_name: 'Gibbs', position_abbreviation: 'RB' },
        team: { abbreviation: 'ATL' },
        position: 'RB',
        average_draft_position: 2,
      },
      {
        team: { abbreviation: 'BUF' },
        position: 'DST',
        average_draft_position: 191.5,
      },
    ],
  });

  assert.equal(matched.get('allen')?.averageDraftPosition, 22.09);
  assert.equal(matched.get('allen')?.adpRow?.player?.last_name, 'Allen');
  assert.equal(matched.get('allen')?.player, undefined);
  assert.equal(matched.has('gibbs'), false);
  assert.equal(matched.get('bills')?.averageDraftPosition, 191.5);
});

test('omits ambiguous player matches instead of guessing', () => {
  const matched = mapFantasyAdpToSleeperPlayers({
    players: {
      one: { full_name: 'Chris Jones', team: 'KC', position: 'WR' },
      two: { full_name: 'Chris Jones', team: 'KC', position: 'WR' },
    },
    adpRows: [{
      player: { first_name: 'Chris', last_name: 'Jones', position_abbreviation: 'WR' },
      team: { abbreviation: 'KC' },
      position: 'WR',
      average_draft_position: 100,
    }],
  });

  assert.equal(matched.size, 0);
});

test('accepts provider fallback identity fields and preserves matches before league filters initialize', () => {
  const adpRows = [{
    player: {
      first_name: 'Jahmyr',
      last_name: 'Gibbs',
      position_abbreviation: 'RB',
      team: { abbreviation: 'DET' },
    },
    position: 'Running Back',
    team: { name: 'Detroit Lions' },
    average_draft_position: 1.47,
  }];

  const mapped = mapFantasyAdpToSleeperPlayers({
    players: { gibbs: players.gibbs },
    adpRows,
  });
  assert.equal(mapped.get('gibbs')?.averageDraftPosition, 1.47);

  const uninitialized = getFantasyAdpPlayersForLeague({
    players: { gibbs: players.gibbs },
    adpRows,
    availablePositions: ['ALL'],
  });
  assert.equal(uninitialized.size, 1);

  const quarterbackOnly = getFantasyAdpPlayersForLeague({
    players: { gibbs: players.gibbs },
    adpRows,
    availablePositions: ['ALL', 'QB'],
  });
  assert.equal(quarterbackOnly.size, 0);
});

test('uses the newest available market timestamp for attribution', () => {
  assert.equal(getFantasyAdpSnapshotUpdatedAt([
    { collected_at: '2026-08-20T13:15:00.154Z' },
    { market_updated_at: '2026-08-21T12:30:15.366Z' },
  ]), '2026-08-21T12:30:15.366Z');
});
