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
    tradeAnalytics,
    sleeperApi,
    projectionEngine,
    ktcApi,
    idpEngine,
    draftPickDisplay,
  ] = await Promise.all([
    server.ssrLoadModule('/src/utils/tradeValue.js'),
    server.ssrLoadModule('/src/utils/tradeEngine.js'),
    server.ssrLoadModule('/src/utils/tradeAnalytics.js'),
    server.ssrLoadModule('/src/api/sleeperApi.js'),
    server.ssrLoadModule('/src/utils/projectionEngine.js'),
    server.ssrLoadModule('/src/utils/ktcApi.js'),
    server.ssrLoadModule('/src/utils/idpEngine.js'),
    server.ssrLoadModule('/src/utils/draftPickDisplay.js'),
  ]);

  modules = { tradeValue, tradeEngine, tradeAnalytics, sleeperApi, projectionEngine, ktcApi, idpEngine, draftPickDisplay };
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

  it('uses only year and round for tradable pick labels', () => {
    const displayInfo = modules.draftPickDisplay.getDraftPickDisplayInfo({
      year: '2027',
      round: 1,
      fromRosterId: 2,
    });

    assert.deepEqual(displayInfo, {
      displayMode: 'round',
      label: '2027 1st',
      roundOrdinal: '1st',
    });
  });

  it('uses one flat redraft value for every pick in a year and round', () => {
    const firstPick = modules.tradeEngine.valueDraftPick({ year: TEST_SEASON, round: 1, fromRosterId: 1 }, {
      pickValueMap: { 1: 5000 },
      currentSeason: TEST_SEASON,
    });
    const secondPick = modules.tradeEngine.valueDraftPick({ year: TEST_SEASON, round: 1, fromRosterId: 2 }, {
      pickValueMap: { 1: 5000 },
      currentSeason: TEST_SEASON,
    });

    assert.equal(firstPick.value, 5000);
    assert.equal(firstPick.value, secondPick.value);
  });

  it('uses prior completed-season production for preseason IDP estimates', () => {
    const idpPlayerId = 'idp-101';
    const idpPlayers = {
      ...players,
      [idpPlayerId]: {
        player_id: idpPlayerId,
        full_name: 'Production Linebacker',
        position: 'LB',
        team: 'BUF',
      },
    };
    const idpRosters = rosters.map((roster) => roster.roster_id === 1
      ? { ...roster, players: [...roster.players, idpPlayerId] }
      : roster);
    const priorSeasonStats = {
      ...inputs.seasonStats,
      [idpPlayerId]: { gp: 17, idp_tkl: 112, idp_sack: 4 },
    };
    const idpLeague = {
      ...league,
      roster_positions: [...league.roster_positions, 'LB'],
    };
    const idpScoring = {
      ...inputs.scoringSettings,
      idp_tkl: 1.5,
      idp_sack: 4,
    };

    const snapshot = modules.tradeAnalytics.buildTradeAnalyticsSnapshot({
      league: idpLeague,
      rosters: idpRosters,
      players: idpPlayers,
      seasonStats: null,
      idpSeasonStats: priorSeasonStats,
      scoringSettings: idpScoring,
      adjustedKtcPlayers: ktcPlayers,
      adjustedDynastyKtcPlayers: ktcPlayers,
      leagueType: '1qb',
      includePlayerTradeValues: true,
    });

    const detail = snapshot.playerTradeValueDetailsMap.get(idpPlayerId);
    assert.equal(detail.isEstimated, true);
    assert.ok(detail.value > 0);
    assert.equal(detail.rawVal, snapshot.mergedIDPMap.get(idpPlayerId));
  });

  it('does not present an unsupported IDP player as a zero-value KTC fallback', () => {
    const detail = modules.tradeValue.computeTradePlayerValueDetail({
      id: 'idp-rookie',
      players: {
        'idp-rookie': {
          player_id: 'idp-rookie',
          full_name: 'Rookie Linebacker',
          position: 'LB',
          team: 'BUF',
        },
      },
      adjustedKtcPlayers: ktcPlayers,
      adjustedDynastyKtcPlayers: [],
      leagueType: '1qb',
      seasonStats: null,
      scoringSettings: inputs.scoringSettings,
      positionalAvgPPG: null,
      positionalValuePerPPG: null,
      rankMap: null,
      mergedIDPMap: new Map(),
    });

    assert.equal(detail, null);
  });

  it('applies league scoring to both KTC-backed offense and generated IDP values', () => {
    const scoringPlayers = {
      wr: {
        player_id: 'wr',
        full_name: 'Reception Specialist',
        position: 'WR',
        team: 'BUF',
        mflid: 'wr-1',
      },
      lb: {
        player_id: 'lb',
        full_name: 'Tackle Specialist',
        position: 'LB',
        team: 'BUF',
      },
    };
    const scoringKtc = [{
      mflid: 'wr-1',
      playerName: 'Reception Specialist',
      position: 'WR',
      oneQBValues: { value: 5000 },
      superflexValues: { value: 5000 },
    }];
    const stats = {
      wr: { gp: 10, rec: 100, rec_yd: 1000 },
      lb: { gp: 10, idp_tkl: 100 },
    };
    const lowScoring = { ...DEFAULT_SCORING, rec: 0, idp_tkl: 0.25 };
    const highScoring = { ...DEFAULT_SCORING, rec: 2, idp_tkl: 2 };

    const lowOffense = modules.tradeValue.computeTradePlayerValueDetail({
      id: 'wr',
      players: scoringPlayers,
      adjustedKtcPlayers: scoringKtc,
      adjustedDynastyKtcPlayers: [],
      leagueType: '1qb',
      seasonStats: stats,
      scoringSettings: lowScoring,
      positionalAvgPPG: { WR: 20 },
      positionalValuePerPPG: null,
      rankMap: null,
      mergedIDPMap: null,
    });
    const highOffense = modules.tradeValue.computeTradePlayerValueDetail({
      id: 'wr',
      players: scoringPlayers,
      adjustedKtcPlayers: scoringKtc,
      adjustedDynastyKtcPlayers: [],
      leagueType: '1qb',
      seasonStats: stats,
      scoringSettings: highScoring,
      positionalAvgPPG: { WR: 20 },
      positionalValuePerPPG: null,
      rankMap: null,
      mergedIDPMap: null,
    });
    const lowIDP = modules.idpEngine.computeIDPValues(scoringPlayers, stats, lowScoring, ['LB']);
    const highIDP = modules.idpEngine.computeIDPValues(scoringPlayers, stats, highScoring, ['LB']);

    assert.ok(highOffense.value > lowOffense.value);
    assert.ok(highIDP.get('lb') > lowIDP.get('lb'));
  });

  it('does not cap a scoring-derived IDP value below an offensive value above 10,000', () => {
    const values = modules.idpEngine.computeIDPValues(
      {
        lb: { player_id: 'lb', full_name: 'Elite Linebacker', position: 'LB', team: 'BUF' },
      },
      {
        lb: { gp: 10, idp_tkl: 500 },
      },
      { ...DEFAULT_SCORING, idp_tkl: 1 },
      ['LB'],
    );

    assert.ok(values.get('lb') > 10_000);
  });

  it('calibrates one flat redraft pick value per round from canonical player values', () => {
    const calibrationPool = [
      { rank: 1, value: 1000 },
      { rank: 2, value: 1500 },
      { rank: 3, value: 2000 },
    ];
    const calibrated = modules.tradeEngine.computeRedraftPickValues(ktcPlayers, 3, '1qb', {
      calibrationPool,
      fallbackValueMultiplier: 1.4,
    });

    // The full round median is already on the Trade scale, so only the 7%
    // first-round uncertainty discount applies.
    assert.equal(calibrated[1], 1395);
  });

  it('keeps early picks close to their expected player range while discounting later rounds more', () => {
    const calibrationPool = Array.from({ length: 32 }, (_, index) => ({
      rank: index + 1,
      value: 10_000 - index * 100,
    }));
    const values = modules.tradeEngine.computeRedraftPickValues(ktcPlayers, 16, '1qb', {
      calibrationPool,
    });

    // Every pick in a round uses the full round's median, then receives the
    // round's selection-risk discount.
    assert.equal(values[2], Math.round(7_700 * 0.87));
    assert.equal(values[1], Math.round(9_300 * 0.93));
  });

  it('falls back to adjusted KTC round values when the calibration round is too sparse', () => {
    const fallback = modules.tradeEngine.computeRedraftPickValues(ktcPlayers, 3, '1qb', {
      fallbackValueMultiplier: 1.2,
    });
    const sparse = modules.tradeEngine.computeRedraftPickValues(ktcPlayers, 3, '1qb', {
      calibrationPool: [{ rank: 1, value: null }],
      fallbackValueMultiplier: 1.2,
    });

    assert.equal(sparse[1], fallback[1]);
  });

  it('uses the same dynasty pick value regardless of original roster', () => {
    const firstPick = modules.tradeEngine.valueDraftPick({ year: '2027', round: 1, fromRosterId: 1 }, {
      rosters,
      ktcPlayers,
      leagueType: '1qb',
      currentSeason: TEST_SEASON,
      league,
      drafts,
    });
    const secondPick = modules.tradeEngine.valueDraftPick({ year: '2027', round: 1, fromRosterId: 2 }, {
      rosters,
      ktcPlayers,
      leagueType: '1qb',
      currentSeason: TEST_SEASON,
      league,
      drafts,
    });

    assert.equal(firstPick.value, secondPick.value);
    assert.equal(firstPick.value, 3870);
  });
});
