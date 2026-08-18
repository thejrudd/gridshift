import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProjectedDraftSelection,
  getSleeperDraftPlayerPool,
  isPlayerDraftEligible,
  shouldExcludeRosteredPlayers,
} from '../../src/utils/draftAssistant/projectedSelection.js';

function makePlayer(id, overrides = {}) {
  return {
    player_id: id,
    full_name: `Player ${id}`,
    first_name: 'Player',
    last_name: id,
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'LAR',
    status: 'Active',
    active: true,
    years_exp: 3,
    search_rank: 500,
    ...overrides,
  };
}

test('Sleeper draft player pool reads settings.player_type (0 all, 1 rookies, 2 vets)', () => {
  assert.equal(getSleeperDraftPlayerPool({ settings: { player_type: 0 } }), 'all');
  assert.equal(getSleeperDraftPlayerPool({ settings: { player_type: 1 } }), 'rookies');
  assert.equal(getSleeperDraftPlayerPool({ settings: { player_type: '2' } }), 'veterans');
  assert.equal(getSleeperDraftPlayerPool({}), 'all');
  assert.equal(getSleeperDraftPlayerPool(null), 'all');
});

test('Rostered players are excluded for keeper/dynasty leagues and restricted pools', () => {
  assert.equal(shouldExcludeRosteredPlayers({ league: { settings: { type: 2 } }, pool: 'all' }), true);
  assert.equal(shouldExcludeRosteredPlayers({ league: { settings: { type: 1 } }, pool: 'all' }), true);
  assert.equal(shouldExcludeRosteredPlayers({ league: { settings: { type: 0 } }, pool: 'all' }), false);
  assert.equal(shouldExcludeRosteredPlayers({ league: { settings: { type: 0 } }, pool: 'rookies' }), true);
});

test('Projection skips players drafted in this draft and players rostered in a dynasty league', () => {
  const players = {
    puka: makePlayer('puka', { search_rank: 5 }),
    drafted: makePlayer('drafted', { search_rank: 1 }),
    eligible: makePlayer('eligible', { search_rank: 40 }),
  };
  const selection = buildProjectedDraftSelection({
    draft: { season: '2026', settings: { player_type: 0 } },
    league: { settings: { type: 2 } },
    players,
    rosters: [{ roster_id: 1, players: ['puka'] }],
    draftPicks: [{ player_id: 'drafted' }],
    marketValuesByPlayerId: null,
  });
  assert.equal(selection?.id, 'eligible');
  assert.equal(selection?.reason, 'Best available by Sleeper rank');
  assert.equal(selection?.rank?.overallRank, 40);
});

test('Market rank is preferred over Sleeper search rank when market data is loaded', () => {
  const players = {
    a: makePlayer('a', { search_rank: 1 }),
    b: makePlayer('b', { search_rank: 900 }),
  };
  const selection = buildProjectedDraftSelection({
    draft: { season: '2026' },
    league: { settings: { type: 0 } },
    players,
    rosters: [],
    draftPicks: [],
    marketValuesByPlayerId: new Map([['b', { overallRank: 3 }]]),
  });
  assert.equal(selection?.id, 'b');
  assert.equal(selection?.reason, 'Best available by market rank');
});

test('Rookies-only drafts never project veterans, and vice versa', () => {
  const rookie = makePlayer('rook', { years_exp: 0, search_rank: 200 });
  const vet = makePlayer('vet', { years_exp: 5, search_rank: 2 });
  const players = { rook: rookie, vet };

  const rookieDraft = buildProjectedDraftSelection({
    draft: { season: '2026', settings: { player_type: 1 } },
    league: { settings: { type: 2 } },
    players,
    rosters: [],
    draftPicks: [],
  });
  assert.equal(rookieDraft?.id, 'rook');

  const vetDraft = buildProjectedDraftSelection({
    draft: { season: '2026', settings: { player_type: 2 } },
    league: { settings: { type: 2 } },
    players,
    rosters: [],
    draftPicks: [],
  });
  assert.equal(vetDraft?.id, 'vet');
});

test('Returns null only when there is no ranking signal at all', () => {
  assert.equal(buildProjectedDraftSelection({ players: null }), null);
  const unranked = { x: makePlayer('x', { search_rank: null }) };
  assert.equal(buildProjectedDraftSelection({
    draft: {},
    league: {},
    players: unranked,
    rosters: [],
    draftPicks: [],
  }), null);
});

test('Retired and teamless legacy players are never projected', () => {
  const players = {
    retired: makePlayer('retired', { status: 'Retired', search_rank: 1 }),
    teamless: makePlayer('teamless', { team: null, search_rank: 2 }),
    ok: makePlayer('ok', { search_rank: 300 }),
  };
  const selection = buildProjectedDraftSelection({
    draft: { season: '2026' },
    league: { settings: { type: 0 } },
    players,
    rosters: [],
    draftPicks: [],
  });
  assert.equal(selection?.id, 'ok');
});

test('isPlayerDraftEligible honors drafted and rostered id sets', () => {
  const player = makePlayer('p1');
  assert.equal(isPlayerDraftEligible(player, {}), true);
  assert.equal(isPlayerDraftEligible(player, { draftedIds: new Set(['p1']) }), false);
  assert.equal(isPlayerDraftEligible(player, { rosteredIds: new Set(['p1']) }), false);
});
