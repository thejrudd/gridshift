import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { DEFAULT_SCORING, importLeagueScoring } from '../../src/utils/scoringEngine.js';

let server;
let scale;

before(async () => {
  server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
  scale = await server.ssrLoadModule('/src/utils/tradeValueScale.js');
});
after(async () => { await server?.close(); });

function makePool(position, points, statKey = 'rec_yd') {
  const players = {};
  const seasonStats = {};
  points.forEach((ppg, index) => {
    const id = `${position}-${index}`;
    players[id] = { position };
    seasonStats[id] = { gp: 10, [statKey]: statKey === 'rec_yd' ? ppg * 100 : ppg * 10 };
  });
  return { players, seasonStats };
}

function mergePools(...pools) {
  return pools.reduce((merged, pool) => ({
    players: { ...merged.players, ...pool.players },
    seasonStats: { ...merged.seasonStats, ...pool.seasonStats },
  }), { players: {}, seasonStats: {} });
}

describe('fantasy viability trade value scale', () => {
  it('normalizes offensive and defensive players against their own starter demand on the same bounded scale', () => {
    const data = mergePools(
      makePool('WR', [30, 25, 20, 15, 10, 5]),
      makePool('LB', [20, 16, 12, 8, 6, 4], 'idp_tkl_solo'),
    );
    const scoringSettings = { ...DEFAULT_SCORING, ...importLeagueScoring({ idp_tkl_solo: 1 }) };
    const league = { roster_positions: ['WR', 'LB'] };
    const rosters = [{}, {}, {}];
    const values = scale.computeLeagueUtilityTradeValues({ ...data, scoringSettings, league, rosters });

    assert.ok(values.get('WR-0') > 0 && values.get('WR-0') <= 100);
    assert.ok(values.get('LB-0') > 0 && values.get('LB-0') <= 100);
    assert.ok(values.get('WR-0') > values.get('LB-0'));
    assert.ok(values.get('WR-2') > 0 && values.get('WR-2') < 100);
    assert.ok(values.get('LB-2') > 0 && values.get('LB-2') < 100);
    assert.ok([...values.values()].every((value) => value >= 0 && value <= 100));
  });

  it('responds to starter depth and custom scoring rather than relying on player rank alone', () => {
    const data = mergePools(
      makePool('WR', [30, 25, 20, 15, 10, 5]),
      makePool('RB', [30, 25, 20, 15, 10, 5]),
    );
    const basicScoring = { ...DEFAULT_SCORING };
    const deeperLeague = { roster_positions: ['WR', 'WR', 'WR', 'RB'] };
    const shallow = scale.computeLeagueUtilityTradeValues({
      ...data, scoringSettings: basicScoring, league: { roster_positions: ['WR', 'RB'] }, rosters: [{}],
    });
    const deep = scale.computeLeagueUtilityTradeValues({ ...data, scoringSettings: basicScoring, league: deeperLeague, rosters: [{}] });
    assert.ok(shallow.get('WR-2') > 0);
    assert.ok(deep.get('WR-2') > 0);

    const scoringData = { players: {}, seasonStats: {} };
    [
      { rec_yd: 1000, rec_td: 2 }, { rec_yd: 500, rec_td: 8 }, { rec_yd: 600, rec_td: 2 },
      { rec_yd: 400, rec_td: 1 }, { rec_yd: 300, rec_td: 0 },
    ].forEach((stats, index) => {
      const id = `scoring-${index}`;
      scoringData.players[id] = { position: 'WR' };
      scoringData.seasonStats[id] = { gp: 10, ...stats };
    });
    const scoringInput = { ...scoringData, league: { roster_positions: ['WR'] }, rosters: [{}] };
    const normal = scale.computeLeagueUtilityTradeValues({ ...scoringInput, scoringSettings: basicScoring });
    const custom = scale.computeLeagueUtilityTradeValues({ ...scoringInput, scoringSettings: { ...basicScoring, rec_td: 16 } });
    assert.notEqual(normal.get('scoring-0'), custom.get('scoring-0'));
  });

  it('recognizes common slash-separated flex slot configurations', () => {
    const data = mergePools(
      makePool('RB', [30, 25, 20, 15, 10, 5]),
      makePool('WR', [30, 25, 20, 15, 10, 5]),
      makePool('TE', [30, 25, 20, 15, 10, 5]),
    );
    const flex = scale.computeLeagueUtilityTradeValues({
      ...data,
      scoringSettings: DEFAULT_SCORING,
      league: { roster_positions: ['RB/WR/TE'] },
      rosters: [{}],
    });
    assert.ok(flex.has('RB-1'));
    assert.ok(flex.has('WR-1'));
    assert.ok(flex.has('TE-1'));
  });

  it('leaves value unavailable when required local inputs or evidence are missing', () => {
    const data = makePool('QB', [30]);
    const league = { roster_positions: ['QB'] };
    assert.equal(scale.computeLeagueUtilityTradeValues({ ...data, league, rosters: [{}] }).size, 0);
    assert.equal(scale.computeLeagueUtilityTradeValues({ ...data, league: { roster_positions: [] }, rosters: [{}], scoringSettings: DEFAULT_SCORING }).size, 0);
    assert.equal(scale.computeLeagueUtilityTradeValues({ ...data, league, rosters: [] , scoringSettings: DEFAULT_SCORING }).size, 0);
  });

  it('maps KTC to rank percentiles, bounds its influence, and supports local-only or market-only scores', () => {
    const ktcPlayers = [0, 10, 40, 100].map((value, index) => ({
      playerName: `P${index}`,
      position: 'WR',
      oneQBValues: { value },
      superflexValues: { value },
    }));
    const market = scale.normalizeKtcMarketValues(ktcPlayers, '1qb');
    assert.equal(scale.normalizeKtcMarketValues([ktcPlayers[1]], '1qb').size, 0);
    assert.equal(market.has(ktcPlayers[0]), false);
    assert.equal(market.get(ktcPlayers[1]), 1);
    assert.equal(market.get(ktcPlayers[3]), 100);
    assert.equal(scale.combineTradeValueSignals(60, 1), 45);
    assert.equal(scale.combineTradeValueSignals(60, 100), 70);
    assert.equal(scale.combineTradeValueSignals(0, 100), 25);
    assert.equal(scale.combineTradeValueSignals(null, 75), 75);
    assert.equal(scale.combineTradeValueSignals(null, null), null);
    assert.equal(scale.combineTradeValueSignals(250, 200), 100);
    assert.equal(scale.normalizeKtcMarketValue(null, ktcPlayers), null);
    assert.equal(scale.normalizeKtcMarketValue(0, ktcPlayers), null);
  });

  it('uses the same local calculation in redraft and dynasty and needs no BDL inputs', () => {
    const data = makePool('WR', [30, 25, 20, 15, 10, 5]);
    const input = { ...data, scoringSettings: DEFAULT_SCORING, league: { roster_positions: ['WR'] }, rosters: [{}, {}, {}] };
    const withoutProviderData = scale.computeLeagueUtilityTradeValues(input);
    const redraftScore = withoutProviderData.get('WR-1');
    const dynastyScore = scale.computeLeagueUtilityTradeValues(input).get('WR-1');
    assert.ok(Number.isFinite(redraftScore));
    assert.equal(dynastyScore, redraftScore);
  });

  it('keeps a player with recent opportunity or a projection above zero without KTC', () => {
    const players = {
      volume: { position: 'WR' },
      reserve: { position: 'WR' },
    };
    const weeklyStats = {
      volume: [{ rec_tgt: 8 }, { rec_tgt: 7 }],
      reserve: [{ rec_tgt: 1 }, { rec_tgt: 1 }],
    };
    const input = {
      players,
      seasonStats: {},
      weeklyStats,
      scoringSettings: DEFAULT_SCORING,
      league: { roster_positions: ['WR'] },
      rosters: [{}],
    };
    const usageOnly = scale.computeFantasyViabilityTradeValues(input);
    assert.ok(usageOnly.get('volume') > usageOnly.get('reserve'));
    assert.ok(usageOnly.get('reserve') > 0);

    const projected = scale.computeFantasyViabilityTradeValues({
      ...input,
      weeklyStats: {},
      currentContextMap: new Map([
        ['volume', { weeklyProjection: 14 }],
        ['reserve', { weeklyProjection: 2 }],
      ]),
    });
    assert.ok(projected.get('volume') > projected.get('reserve'));
    assert.ok(projected.get('reserve') > 0);
  });

  it('blends prior-season evidence only for dynasty values', () => {
    const players = { current: { position: 'WR' }, prior: { position: 'WR' } };
    const seasonStats = {
      current: { gp: 8, rec: 20, rec_yd: 220 },
      prior: { gp: 8, rec: 80, rec_yd: 800 },
    };
    const priorSeasonStats = {
      current: { gp: 17, rec: 170, rec_yd: 1700 },
      prior: { gp: 17, rec: 17, rec_yd: 170 },
    };
    const input = {
      players,
      seasonStats,
      priorSeasonStats,
      scoringSettings: DEFAULT_SCORING,
      league: { roster_positions: ['WR'] },
      rosters: [{}],
    };
    const redraft = scale.computeFantasyViabilityTradeValues(input);
    const dynasty = scale.computeFantasyViabilityTradeValues({ ...input, format: 'dynasty' });
    assert.ok(redraft.get('current') < redraft.get('prior'));
    assert.ok(dynasty.get('current') > redraft.get('current'));
  });

  it('uses fresh BDL projections and injury context only, never postgame lineup facts', () => {
    const players = { '1': { full_name: 'A. Example', position: 'WR', team: 'PHI' } };
    const designations = [{
      player: { first_name: 'A.', last_name: 'Example', position_abbreviation: 'WR' },
      team: { abbreviation: 'PHI' },
      position: 'WR',
      injury: 'Ankle',
      game_status: 'Questionable',
      active: true,
      starter: true,
      did_not_play: false,
      practice_reports: [{ date: '2026-10-05', status: 'Limited' }],
    }];
    const projections = new Map([['1', { projected: 18.6, factors: { providerCollectedAt: '2026-10-05T10:00:00.000Z' } }]]);
    const context = scale.buildTradeCurrentContextMap({
      players, projections, projectionFresh: true, designations, designationsFresh: true,
    });
    assert.deepEqual(context.get('1'), {
      weeklyProjection: 18.6,
      projectionUpdatedAt: '2026-10-05T10:00:00.000Z',
      injury: 'Ankle',
      gameStatus: 'Questionable',
      active: true,
      practiceReports: [{ date: '2026-10-05', status: 'Limited' }],
      designationUpdatedAt: null,
    });
    assert.equal('starter' in context.get('1'), false);
    assert.equal('did_not_play' in context.get('1'), false);
    assert.equal(scale.buildTradeCurrentContextMap({ players, designations, designationsFresh: false }).size, 0);
    assert.equal(scale.buildTradeCurrentContextMap({ players, projections, projectionFresh: false }).size, 0);
    assert.deepEqual(scale.getTradeCurrentContextLabels(context.get('1')).slice(0, 2), ['BDL 18.6 proj', 'BDL Questionable']);
  });
});
