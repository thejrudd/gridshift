import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizePersistedSleeperState } from '../../src/utils/sleeperSeasonState.js';

test('sanitized Sleeper state clears a persisted prior-season league snapshot', () => {
  const state = {
    season: '2026',
    selectedLeagueId: 'league-2025',
    league: { league_id: 'league-2025', season: '2025' },
    rosters: [{ roster_id: 1, owner_id: 'departed-manager' }],
    leagueUsers: [{ user_id: 'departed-manager' }],
    leaguesBySeason: {
      2026: [{ league_id: 'league-2026', season: '2026' }],
    },
  };

  const sanitized = sanitizePersistedSleeperState(state);
  assert.equal(sanitized.selectedLeagueId, null);
  assert.equal(sanitized.league, null);
  assert.deepEqual(sanitized.rosters, []);
  assert.deepEqual(sanitized.leagueUsers, []);
  assert.deepEqual(sanitized.leagues, state.leaguesBySeason[2026]);
});

test('sanitized Sleeper state preserves a coherent league snapshot', () => {
  const state = {
    season: '2026',
    selectedLeagueId: 'league-2026',
    league: { league_id: 'league-2026', season: '2026' },
    rosters: [{ roster_id: 1, owner_id: 'current-manager' }],
    leagueUsers: [{ user_id: 'current-manager' }],
  };

  assert.equal(sanitizePersistedSleeperState(state), state);
});

test('sanitized Sleeper state rejects a snapshot without season metadata', () => {
  const state = {
    season: '2026',
    selectedLeagueId: 'league-2026',
    league: { league_id: 'league-2026' },
    rosters: [{ roster_id: 1, owner_id: 'stale-manager' }],
    leagueUsers: [{ user_id: 'stale-manager' }],
  };

  const sanitized = sanitizePersistedSleeperState(state);
  assert.equal(sanitized.selectedLeagueId, null);
  assert.equal(sanitized.league, null);
  assert.deepEqual(sanitized.rosters, []);
  assert.deepEqual(sanitized.leagueUsers, []);
});
