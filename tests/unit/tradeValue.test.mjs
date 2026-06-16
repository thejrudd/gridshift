import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import {
  TEST_SEASON,
  drafts,
  ktcPlayers,
  league,
  players,
  rosters,
  tradedPicks,
  weeklyStatsForWeek,
} from '../fixtures/tradeFixtures.js';

let server;
let modules;
let inputs;

before(async () => {
  server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
  const [
    tradeValue,
    tradeEngine,
    sleeperApi,
    projectionEngine,
    ktcApi,
  ] = await Promise.all([
    server.ssrLoadModule('/src/utils/tradeValue.js'),
    server.ssrLoadModule('/src/utils/tradeEngine.js'),
    server.ssrLoadModule('/src/api/sleeperApi.js'),
    server.ssrLoadModule('/src/utils/projectionEngine.js'),
    server.ssrLoadModule('/src/utils/ktcApi.js'),
  ]);

  modules = { tradeValue, tradeEngine, sleeperApi, projectionEngine, ktcApi };
  const weeklyStats = Object.fromEntries(
    Object.keys(players).map((id) => [id, Array.from({ length: 6 }, (_, index) => weeklyStatsForWeek(index + 1)[id])]),
  );
  const seasonStats = sleeperApi.aggregateSeasonStats(weeklyStats);
  const scoringSettings = { ...DEFAULT_SCORING, ...league.scoring_settings };
  const rankMap = projectionEngine.computePositionalRanks(seasonStats, players, scoringSettings);
  const positionalAvgPPG = projectionEngine.computePositionalAvgPPG(rosters, seasonStats, players, scoringSettings);
  const positionalValuePerPPG = projectionEngine.computePositionalValuePerPPG(
    rosters,
    players,
    ktcPlayers,
    '1qb',
    seasonStats,
    scoringSettings,
    ktcApi.findKtcPlayerFromSleeper,
    ktcApi.getKtcValue,
    ktcApi.productionAdjustedValue,
  );
  inputs = { seasonStats, scoringSettings, rankMap, positionalAvgPPG, positionalValuePerPPG };
});

after(async () => {
  await server?.close();
});

describe('canonical trade values', () => {
  it('uses computeTradePlayerValueDetail for Trade Agent valueSide output', () => {
    const detail = modules.tradeValue.computeTradePlayerValueDetail({
      id: '102',
      players,
      adjustedKtcPlayers: ktcPlayers,
      adjustedDynastyKtcPlayers: ktcPlayers,
      leagueType: '1qb',
      seasonStats: inputs.seasonStats,
      scoringSettings: inputs.scoringSettings,
      positionalAvgPPG: inputs.positionalAvgPPG,
      positionalValuePerPPG: inputs.positionalValuePerPPG,
      rankMap: inputs.rankMap,
      mergedIDPMap: null,
    });
    const detailMap = new Map([['102', detail]]);
    const side = modules.tradeEngine.valueSide(['102'], [], players, ktcPlayers, '1qb', rosters, null, TEST_SEASON, ktcPlayers, null, detailMap, league, drafts);

    assert.equal(side.items[0].val, detail.value);
    assert.equal(side.total, detail.value);
  });

  it('uses the same player values in candidate pools', () => {
    const detail = modules.tradeValue.computeTradePlayerValueDetail({
      id: '102',
      players,
      adjustedKtcPlayers: ktcPlayers,
      adjustedDynastyKtcPlayers: ktcPlayers,
      leagueType: '1qb',
      seasonStats: inputs.seasonStats,
      scoringSettings: inputs.scoringSettings,
      positionalAvgPPG: inputs.positionalAvgPPG,
      positionalValuePerPPG: inputs.positionalValuePerPPG,
      rankMap: inputs.rankMap,
      mergedIDPMap: null,
    });
    const { slots, rosterPicks } = modules.tradeEngine.buildRosterPicks(tradedPicks, rosters, league, TEST_SEASON, 3);
    const pool = modules.tradeEngine.buildCandidatePool(
      1,
      rosters,
      [],
      [],
      players,
      ktcPlayers,
      '1qb',
      rosterPicks,
      slots,
      null,
      TEST_SEASON,
      {
        dynastyKtcPlayers: ktcPlayers,
        seasonStats: inputs.seasonStats,
        scoringSettings: inputs.scoringSettings,
        positionalValuePerPPG: inputs.positionalValuePerPPG,
        positionalAvgPPG: inputs.positionalAvgPPG,
        rankMap: inputs.rankMap,
        idpValueMap: null,
        playerTradeValueDetailsMap: new Map([['102', detail]]),
        league,
        drafts,
      },
    );

    assert.equal(pool.find((item) => item.id === '102').val, detail.value);
  });

  it('uses valueDraftPick for owned pick values', () => {
    const { rosterPicks } = modules.tradeEngine.buildRosterPicks(tradedPicks, rosters, league, TEST_SEASON, 3);
    const pick = rosterPicks[1]['2027|1'].ownStatus === 'own'
      ? { year: '2027', round: 1, fromRosterId: 1, isOwn: true, key: '2027|1' }
      : null;

    const valued = modules.tradeEngine.valueDraftPick(pick, {
      rosters,
      ktcPlayers,
      leagueType: '1qb',
      pickValueMap: null,
      currentSeason: TEST_SEASON,
      league,
      drafts,
    });

    assert.equal(typeof valued.value, 'number');
    assert.equal(valued.val, valued.value);
    assert.ok(valued.displayInfo.label.includes('2027'));
  });
});
