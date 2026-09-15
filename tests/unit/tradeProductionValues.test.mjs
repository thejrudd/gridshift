import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { DEFAULT_SCORING, importLeagueScoring } from '../../src/utils/scoringEngine.js';
import {
  buildTradeProposalSnapshotFromSides,
  getTradeProposalAssetValue,
  swapTradeProposalPerspective,
} from '../../src/utils/tradeProposal.js';

let server;
let analytics;
let engine;
let sleeper;
let ktc;
let opportunityShared;

before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  [analytics, engine, sleeper, ktc, opportunityShared] = await Promise.all([
    server.ssrLoadModule('/src/utils/tradeAnalytics.js'),
    server.ssrLoadModule('/src/utils/tradeEngine.js'),
    server.ssrLoadModule('/src/api/sleeperApi.js'),
    server.ssrLoadModule('/src/utils/ktcApi.js'),
    server.ssrLoadModule('/src/utils/opportunity/opportunityShared.js'),
  ]);
});
after(async () => { await server?.close(); });

// Sleeper-shaped weekly rows, including defensive rows without explicit gp.
// Two players per position matter: the old null-to-zero bug requires a rank
// group with more than one scorer, even before the three-game value minimum.
const players = {
  lb: { full_name: 'Tackle Producer', position: 'LB', team: 'BUF' },
  lb2: { full_name: 'Second Linebacker', position: 'LB', team: 'BUF' },
  k: { full_name: 'Field Goal Producer', position: 'K', team: 'BUF' },
  k2: { full_name: 'Second Kicker', position: 'K', team: 'BUF' },
  dst: { full_name: 'Buffalo Defense', position: 'DEF', team: 'BUF' },
  wr: { full_name: 'Market Receiver', position: 'WR', team: 'BUF' },
  unlisted: { full_name: 'Unlisted Receiver', position: 'WR', team: 'BUF' },
};
const weeklyRows = {
  lb: { idp_tkl_solo: 6, idp_tkl_ast: 4, idp_sack: 1 },
  lb2: { idp_tkl_solo: 2 },
  k: { gp: 1, fgm_40_49: 2, xpm: 3, fgmiss: 1 },
  k2: { gp: 1, xpm: 2 },
  dst: { gp: 1, sack: 3 },
};
const scoringSettings = {
  ...DEFAULT_SCORING,
  ...importLeagueScoring({ idp_tkl_solo: 1.5, idp_tkl_ast: 0.5, idp_sack: 4, fgm_40_49: 4, xpm: 1, fgmiss: -1, sack: 1 }),
};
const ktcPlayers = [{
  playerName: 'Market Receiver', position: 'WR',
  oneQBValues: { value: 0 }, superflexValues: { value: 0 },
}];
const rosters = [{ roster_id: 1, players: Object.keys(players) }];
const league = { roster_positions: ['WR', 'IDP_FLEX', 'K', 'DEF'] };

function production(weeks) {
  return sleeper.aggregateSeasonStats(Object.fromEntries(Object.entries(weeklyRows).map(([id, row]) => [
    id, Array.from({ length: weeks }, (_, index) => ({ week: index + 1, ...row })),
  ])));
}

function snapshot(weeks, overrides = {}) {
  return analytics.buildTradeAnalyticsSnapshot({
    league, rosters, players, seasonStats: production(weeks), scoringSettings,
    adjustedKtcPlayers: ktcPlayers, adjustedDynastyKtcPlayers: [],
    leagueType: '1qb', includePlayerTradeValues: true,
    ...overrides,
  });
}

function hybridSnapshot(currentWeeks, priorWeeks, overrides = {}) {
  return snapshot(currentWeeks, {
    priorSeasonStats: production(priorWeeks),
    ...overrides,
  });
}

function side(ids, values) {
  return engine.valueSide(ids, [], players, ktcPlayers, '1qb', rosters, null, '2026', [], values.mergedIDPMap, values.playerTradeValueDetailsMap);
}

describe('production-backed Trade values and unavailable assets', () => {
  for (const [id, ppg, expected] of [['lb', 15, 5376], ['k', 10, 3584]]) {
    it(`carries league-scored ${id} production through analytics, Agent, candidates and display`, () => {
      const stats = production(3);
      assert.equal(stats[id].gp, 3);
      const values = snapshot(3);
      const detail = values.playerTradeValueDetailsMap.get(id);
      assert.equal(detail?.isEstimated, true);
      assert.equal(detail.avgPPG, ppg);
      assert.equal(detail.pts, ppg * 3);
      assert.equal(detail.rawVal, ppg * 320);
      assert.equal(detail.value, expected); // rank 1 of 2: shared 1.12 modifier
      assert.equal(side([id], values).items[0].val, expected);
      const pool = engine.buildCandidatePool(1, rosters, [], [], players, ktcPlayers, '1qb', {}, {}, null, '2026', {
        seasonStats: stats, scoringSettings, rankMap: values.rankMap,
        idpValueMap: values.mergedIDPMap, playerTradeValueDetailsMap: values.playerTradeValueDetailsMap,
      });
      assert.equal(pool.find((item) => item.id === id).val, expected);
      assert.equal(ktc.fmtKtcValue(detail.value), expected.toLocaleString());
    });

    it(`keeps a ranked ${id} with only one game unavailable with KTC loaded or absent`, () => {
      for (const market of [ktcPlayers, []]) {
        const values = snapshot(1, { adjustedKtcPlayers: market });
        assert.equal(values.rankMap[id].posCount, 2);
        assert.equal(values.mergedIDPMap.has(id), false);
        assert.equal(values.playerTradeValueDetailsMap.has(id), false);
        assert.equal(side([id], values).items[0].val, null);
        assert.equal(ktc.fmtKtcValue(side([id], values).items[0].val), '—');
      }
    });

    it(`uses caller-selected preseason production and active scoring for ${id}`, () => {
      const values = snapshot(0, { valuationSeasonStats: production(17) });
      assert.equal(values.playerTradeValueDetailsMap.get(id)?.value, expected);
    });
  }

  it('keeps missing production and missing player identities null, including kickers and D/ST', () => {
    const values = snapshot(0);
    for (const id of ['lb', 'k', 'dst', 'unlisted', 'missing-player']) {
      assert.equal(side([id], values).items[0].val, null, id);
    }
  });

  it('requires a kicker slot and scores kickers with the selected league rules', () => {
    const withoutK = snapshot(3, { league: { roster_positions: ['WR', 'IDP_FLEX'] } });
    assert.equal(withoutK.mergedIDPMap.has('k'), false);
    assert.equal(side(['k'], withoutK).items[0].val, null);
    const doubled = snapshot(3, { scoringSettings: { ...scoringSettings, fgm_40_49: 8, xpm: 2, fgmiss: -2 } });
    assert.equal(doubled.playerTradeValueMap.get('k'), 3584 * 2);
    const kickerOnly = snapshot(3, { league: { roster_positions: ['WR', 'K'] } });
    assert.equal(kickerOnly.playerTradeValueMap.get('k'), 3584);
    assert.equal(kickerOnly.mergedIDPMap.has('dst'), false);
  });

  it('does not let a zero KTC placeholder suppress a qualified kicker estimate', () => {
    const zeroKtcKicker = {
      playerName: 'Field Goal Producer', position: 'K',
      oneQBValues: { value: 0 }, superflexValues: { value: 0 },
    };
    const values = snapshot(3, {
      adjustedKtcPlayers: [...ktcPlayers, zeroKtcKicker],
      adjustedDynastyKtcPlayers: [zeroKtcKicker],
    });

    const detail = values.playerTradeValueDetailsMap.get('k');
    assert.equal(detail?.isEstimated, true);
    assert.equal(detail?.rawVal, 3200);
    assert.equal(detail?.value, 3584);
    assert.equal(detail?.ktcEntry, null);

    const insufficient = snapshot(1, {
      adjustedKtcPlayers: [...ktcPlayers, zeroKtcKicker],
      adjustedDynastyKtcPlayers: [zeroKtcKicker],
    });
    assert.equal(insufficient.playerTradeValueDetailsMap.has('k'), false);
    assert.equal(side(['k'], insufficient).items[0].val, null);
  });

  it('does not mix cached kicker and D/ST values', () => {
    const values = snapshot(3);
    assert.equal(values.mergedIDPMap.get('k'), 3200);
    assert.equal(values.mergedIDPMap.get('dst'), 960);
  });

  it('prefers each qualified player\'s current production over prior-season production', () => {
    const prior = production(17);
    // Make the prior season materially stronger so this would fail if the
    // generated map were selected at the season level rather than per player.
    prior.lb = { gp: 17, idp_tkl_solo: 340 };
    const values = snapshot(3, { priorSeasonStats: prior });

    const detail = values.playerTradeValueDetailsMap.get('lb');
    assert.equal(detail?.isEstimated, true);
    assert.equal(detail?.avgPPG, 15);
    assert.equal(detail?.rawVal, 4800);
  });

  it('does not let prior production alter an offensive KTC value', () => {
    const current = production(3);
    const prior = production(17);
    current.wr = { gp: 3, rec: 3 };
    prior.wr = { gp: 17, rec: 170 };
    const values = snapshot(3, {
      seasonStats: current,
      priorSeasonStats: prior,
      adjustedKtcPlayers: [{
        ...ktcPlayers[0],
        oneQBValues: { value: 5000 },
        superflexValues: { value: 5000 },
      }],
    });

    const detail = values.playerTradeValueDetailsMap.get('wr');
    assert.equal(detail?.isEstimated, false);
    assert.equal(detail?.avgPPG, 1);
    assert.equal(detail?.rawVal, 5000);
  });

  it('uses prior production for individually insufficient IDP, D/ST, and kicker current seasons', () => {
    const values = hybridSnapshot(1, 3);

    for (const id of ['lb', 'dst', 'k']) {
      assert.equal(values.playerTradeValueDetailsMap.get(id)?.isEstimated, true, id);
      assert.ok(values.mergedIDPMap.get(id) > 0, id);
      assert.ok(side([id], values).items[0].val > 0, id);
    }
  });

  it('leaves generated positions unavailable when neither current nor prior production qualifies', () => {
    const values = hybridSnapshot(1, 1);

    for (const id of ['lb', 'dst', 'k']) {
      assert.equal(values.mergedIDPMap?.has(id), false, id);
      assert.equal(values.playerTradeValueDetailsMap.has(id), false, id);
      assert.equal(side([id], values).items[0].val, null, id);
    }
  });

  it('applies current league scoring to prior-season generated production without opening unsupported slots', () => {
    const prior = production(3);
    const doubled = snapshot(1, {
      priorSeasonStats: prior,
      scoringSettings: { ...scoringSettings, idp_tkl_solo: 3, idp_tkl_ast: 1, idp_sack: 8, fgm_40_49: 8, xpm: 2, sack: 2 },
    });
    const noGeneratedSlots = snapshot(1, {
      priorSeasonStats: prior,
      league: { roster_positions: ['WR'] },
    });

    assert.equal(doubled.mergedIDPMap.get('lb'), 9600);
    assert.equal(doubled.mergedIDPMap.get('k'), 6720);
    assert.equal(doubled.mergedIDPMap.get('dst'), 1920);
    for (const id of ['lb', 'dst', 'k']) {
      assert.equal(noGeneratedSlots.mergedIDPMap?.has(id) ?? false, false, id);
    }
  });

  it('preserves an actual market zero but never calls a partial total a fair trade', () => {
    const values = snapshot(1);
    assert.equal(side(['wr'], values).items[0].val, 0);
    assert.equal(side(['wr'], values).total, 0);
    assert.equal(ktc.fmtKtcValue(0), '0');
    assert.equal(side([], values).total, 0);
    const incomplete = side(['wr', 'lb', 'k'], values);
    assert.equal(incomplete.total, null);
    assert.deepEqual(engine.evaluateTrade(incomplete.total, 0), { verdict: 'unavailable', gap: null, pct: null });
  });

  it('keeps canonical opportunity assets unavailable when the Trade map has no value', () => {
    const idp = { id: 'idp', name: 'Early Season Linebacker', position: 'LB', normPos: 'LB', ppg: 12, recentAvg: 12, seasonPts: 12 };
    const missing = opportunityShared.buildPlayerAsset(idp, 1, new Map());
    const zero = opportunityShared.buildPlayerAsset(idp, 1, new Map([['idp', 0]]));
    const heuristic = opportunityShared.buildPlayerAsset(idp, 1);

    assert.equal(missing.value, null);
    assert.equal(zero.value, 0);
    assert.ok(heuristic.value > 0);
  });

  it('preserves unavailable values through proposal serialization and perspective changes', () => {
    const proposal = buildTradeProposalSnapshotFromSides({
      leagueId: 'test', season: '2026', sender: { rosterId: 1 }, recipient: { rosterId: 2 },
      yourSide: { items: [{ type: 'player', id: 'lb', val: null }, { type: 'player', id: 'k', val: null }], total: null },
      theirSide: { items: [{ type: 'player', id: 'wr', val: 0 }], total: 0 },
      verdict: { verdict: 'unavailable', gap: null, pct: null },
    });
    assert.deepEqual(proposal.sender.assets.map((asset) => asset.value), [null, null]);
    assert.equal(proposal.totals.sender, null);
    assert.equal(proposal.totals.recipient, 0);
    assert.equal(proposal.verdict.gap, null);
    const swapped = swapTradeProposalPerspective(JSON.parse(JSON.stringify(proposal)));
    assert.equal(getTradeProposalAssetValue(swapped.recipient.assets[0]), null);
    assert.equal(getTradeProposalAssetValue(swapped.sender.assets[0]), 0);
  });

  it('keeps the hybrid map available to both Companion and proposal value consumers', () => {
    const values = hybridSnapshot(1, 3);
    const companionValue = side(['lb'], values).items[0].val;
    const proposal = buildTradeProposalSnapshotFromSides({
      leagueId: 'test', season: '2026', sender: { rosterId: 1 }, recipient: { rosterId: 2 },
      yourSide: { items: [{ type: 'player', id: 'lb', val: companionValue }], total: companionValue },
      theirSide: { items: [], total: 0 },
      verdict: { verdict: 'unavailable', gap: null, pct: null },
    });

    assert.ok(companionValue > 0);
    assert.equal(getTradeProposalAssetValue(proposal.sender.assets[0]), companionValue);
  });
});
