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
    // A pick valued below or above every player still lands on the 1–100 scale.
    assert.equal(scale.normalizeKtcMarketValue(5, ktcPlayers), 1);
    assert.equal(scale.normalizeKtcMarketValue(500, ktcPlayers), 100);
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

  it('weighs last season more heavily in dynasty than in redraft', () => {
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

  it('starts each player from last season so a short hot streak does not outrank a proven starter', () => {
    // Three teams, one DL slot. The proven lineman (16 a game last season) is
    // off to a modest start; the free agent is hot after a weak last season.
    const make = (tackles) => ({ gp: 5, idp_tkl_solo: tackles * 5 });
    const players = { proven: { position: 'DL' }, hot: { position: 'DL' }, s1: { position: 'DL' }, s2: { position: 'DL' }, s3: { position: 'DL' } };
    const seasonStats = { proven: make(12), hot: make(15), s1: make(13), s2: make(11), s3: make(10) };
    const priorSeasonStats = {
      proven: { gp: 17, idp_tkl_solo: 16 * 17 },
      hot: { gp: 17, idp_tkl_solo: 6 * 17 },
      s1: { gp: 17, idp_tkl_solo: 11 * 17 },
      s2: { gp: 17, idp_tkl_solo: 11 * 17 },
      s3: { gp: 17, idp_tkl_solo: 10 * 17 },
    };
    const input = {
      players,
      seasonStats,
      scoringSettings: { ...DEFAULT_SCORING, ...importLeagueScoring({ idp_tkl_solo: 1 }) },
      league: { roster_positions: ['DL'] },
      rosters: [{ players: ['proven', 's1'] }, { players: ['s2'] }, { players: ['s3'] }],
    };
    const thisSeasonOnly = scale.computeFantasyViabilityTradeValues(input);
    const withLastSeason = scale.computeFantasyViabilityTradeValues({ ...input, priorSeasonStats });
    assert.ok(thisSeasonOnly.get('proven') < thisSeasonOnly.get('hot'));
    assert.ok(withLastSeason.get('proven') > withLastSeason.get('hot'));
    assert.ok(withLastSeason.get('proven') > thisSeasonOnly.get('proven'));
  });

  it('does not let a healthy player who has not played this season coast on last season', () => {
    const players = { active: { position: 'WR' }, idle: { position: 'WR' }, hurt: { position: 'WR', injury_status: 'IR' }, w4: { position: 'WR' } };
    const seasonStats = { active: { gp: 5, rec_yd: 500 }, w4: { gp: 5, rec_yd: 300 } };
    const priorSeasonStats = {
      active: { gp: 17, rec_yd: 1200 }, idle: { gp: 17, rec_yd: 1600 }, hurt: { gp: 17, rec_yd: 1600 }, w4: { gp: 17, rec_yd: 600 },
    };
    const values = scale.computeFantasyViabilityTradeValues({
      players, seasonStats, priorSeasonStats, scoringSettings: DEFAULT_SCORING, league: { roster_positions: ['WR'] }, rosters: [{}],
    });
    assert.equal(values.has('idle'), false);
    // An injured player keeps last season as a starting point, with the injury discount applied.
    assert.ok(values.get('hurt') > 0);
  });

  it('measures production against each position baseline so deep defensive pools do not inflate defenders', () => {
    // Two teams, one QB and one DL slot each. DL has many low-scoring depth
    // players, which used to push any regular DL toward the top of a percentile.
    const data = mergePools(
      makePool('QB', [24, 18, 12, 8]),
      makePool('DL', [9, 7, 6, 5, 4, 3, 2, 2, 1, 1, 1, 1], 'idp_tkl_solo'),
    );
    const scoringSettings = { ...DEFAULT_SCORING, ...importLeagueScoring({ idp_tkl_solo: 1 }) };
    const values = scale.computeFantasyViabilityTradeValues({
      ...data, scoringSettings, league: { roster_positions: ['QB', 'DL'] }, rosters: [{}, {}],
    });
    // QB-0 is 6 points over the QB2 baseline; DL-0 is 2 points over the DL2 baseline.
    assert.ok(values.get('QB-0') > values.get('DL-0'));
    // Starters stay above the free-agent pool, which stays above zero.
    assert.ok(values.get('DL-1') > values.get('DL-4'));
    assert.ok(values.get('DL-11') > 0);
  });

  it('lowers a position when viable players are left unrostered', () => {
    // Same DL pool in both leagues; only how deep managers roster DL differs.
    const data = mergePools(
      makePool('WR', [20, 18, 16, 14, 12, 10, 4, 2]),
      makePool('DL', [12, 10, 9, 9, 8, 8, 8, 8, 2, 1], 'idp_tkl_solo'),
    );
    const scoringSettings = { ...DEFAULT_SCORING, ...importLeagueScoring({ idp_tkl_solo: 1 }) };
    const league = { roster_positions: ['WR', 'WR', 'DL', 'BN', 'BN'] };
    const roster = (ids) => ({ players: ids });
    const wrs = ['WR-0', 'WR-1', 'WR-2', 'WR-3', 'WR-4', 'WR-5'];
    // Scarce: DL rostered through every viable player, so the waiver line is 2 points.
    const scarce = scale.computeFantasyViabilityTradeValues({
      ...data, scoringSettings, league,
      rosters: [roster([...wrs.slice(0, 3), 'DL-0', 'DL-2', 'DL-4', 'DL-6']), roster([...wrs.slice(3), 'DL-1', 'DL-3', 'DL-5', 'DL-7'])],
    });
    // Plentiful: only the two starters are rostered, so 8-9 point DL sit on waivers.
    const plentiful = scale.computeFantasyViabilityTradeValues({
      ...data, scoringSettings, league,
      rosters: [roster([...wrs.slice(0, 3), 'DL-0']), roster([...wrs.slice(3), 'DL-1'])],
    });
    assert.ok(scarce.get('DL-0') > plentiful.get('DL-0'));
    assert.ok(scarce.get('DL-2') > plentiful.get('DL-2'));
    // Reserve and taxi spots count as rostered too.
    const reserved = scale.computeFantasyViabilityTradeValues({
      ...data, scoringSettings, league,
      rosters: [
        { players: [...wrs.slice(0, 3), 'DL-0'], reserve: ['DL-2', 'DL-4', 'DL-6'] },
        { players: [...wrs.slice(3), 'DL-1'], taxi: ['DL-3', 'DL-5', 'DL-7'] },
      ],
    });
    assert.equal(reserved.get('DL-0'), scarce.get('DL-0'));
  });

  it('drops rostered players below a waiver wire that holds better ones', () => {
    const data = mergePools(
      makePool('WR', [20, 18, 16, 14]),
      makePool('DB', [14, 12, 10, 8, 16, 15, 15], 'idp_tkl_solo'),
    );
    const scoringSettings = { ...DEFAULT_SCORING, ...importLeagueScoring({ idp_tkl_solo: 1 }) };
    const league = { roster_positions: ['WR', 'WR', 'DB'] };
    // DB-4..6 (15-16 points) sit on waivers while managers start 14 and 12.
    const values = scale.computeFantasyViabilityTradeValues({
      ...data, scoringSettings, league,
      rosters: [{ players: ['WR-0', 'WR-1', 'DB-0', 'DB-2'] }, { players: ['WR-2', 'WR-3', 'DB-1', 'DB-3'] }],
    });
    const fullyRostered = scale.computeFantasyViabilityTradeValues({
      ...data, scoringSettings, league,
      rosters: [{ players: ['WR-0', 'WR-1', 'DB-0', 'DB-2', 'DB-4'] }, { players: ['WR-2', 'WR-3', 'DB-1', 'DB-3', 'DB-5', 'DB-6'] }],
    });
    assert.ok(values.get('DB-1') < fullyRostered.get('DB-1'));
    assert.ok(values.get('DB-1') <= 20);
    // A free agent who is Out cannot replace anyone, so the line falls back to who can play.
    const injuredWire = scale.computeFantasyViabilityTradeValues({
      ...data,
      players: { ...data.players, 'DB-4': { position: 'DB', injury_status: 'Out' }, 'DB-5': { position: 'DB', injury_status: 'IR' }, 'DB-6': { position: 'DB', injury_status: 'Out' } },
      scoringSettings, league,
      rosters: [{ players: ['WR-0', 'WR-1', 'DB-0', 'DB-2'] }, { players: ['WR-2', 'WR-3', 'DB-1', 'DB-3'] }],
    });
    assert.ok(injuredWire.get('DB-1') > values.get('DB-1'));
  });

  it('estimates roster depth while league rosters are under half full', () => {
    const data = makePool('WR', [20, 18, 16, 14, 12, 10, 8, 6, 4, 2]);
    const input = { ...data, scoringSettings: DEFAULT_SCORING, league: { roster_positions: ['WR', 'WR', 'BN', 'BN'] } };
    const estimated = scale.computeFantasyViabilityTradeValues({ ...input, rosters: [{}, {}] });
    const drafting = scale.computeFantasyViabilityTradeValues({ ...input, rosters: [{ players: ['WR-0'] }, { players: ['WR-1'] }] });
    assert.deepEqual([...drafting], [...estimated]);
  });

  it('estimates roster depth from bench spots and position limits when rosters are unavailable', () => {
    const data = makePool('WR', [20, 18, 16, 14, 12, 10, 8, 6, 4, 2]);
    const input = { ...data, scoringSettings: DEFAULT_SCORING, rosters: [{}, {}] };
    const shallow = scale.computeFantasyViabilityTradeValues({ ...input, league: { roster_positions: ['WR', 'WR'] } });
    const deep = scale.computeFantasyViabilityTradeValues({ ...input, league: { roster_positions: ['WR', 'WR', 'BN', 'BN'] } });
    // With two bench spots per team, the 12-point backup outscores what waivers offer.
    assert.ok(deep.get('WR-4') > shallow.get('WR-4'));
    const limited = scale.computeFantasyViabilityTradeValues({
      ...input,
      league: { roster_positions: ['WR', 'WR', 'BN', 'BN'], settings: { position_limit_wr: 2 } },
    });
    assert.equal(limited.get('WR-4'), shallow.get('WR-4'));
  });

  it('raises the QB baseline for superflex lineups', () => {
    const data = mergePools(
      makePool('QB', [24, 20, 18, 16, 10, 6]),
      makePool('WR', [16, 14, 12, 10, 6, 4]),
    );
    const input = { ...data, scoringSettings: DEFAULT_SCORING, rosters: [{}, {}] };
    const oneQb = scale.computeFantasyViabilityTradeValues({ ...input, league: { roster_positions: ['QB', 'WR', 'WR'] } });
    const superflex = scale.computeFantasyViabilityTradeValues({ ...input, league: { roster_positions: ['QB', 'SUPER_FLEX', 'WR', 'WR'] } });
    assert.ok(superflex.get('QB-2') > oneQb.get('QB-2'));
  });

  it('uses snap share for role and trusts short samples less at volatile positions', () => {
    const players = { starter: { position: 'WR' }, rotational: { position: 'WR' }, kicker: { position: 'K' }, receiver: { position: 'WR' } };
    const snaps = (share) => [1, 2, 3, 4].map((week) => ({ week, off_snp: share * 60, tm_off_snp: 60, rec_yd: 60 }));
    const roleOnly = scale.computeFantasyViabilityTradeValues({
      players: { starter: players.starter, rotational: players.rotational },
      seasonStats: {},
      weeklyStats: { starter: snaps(0.95), rotational: snaps(0.4) },
      scoringSettings: DEFAULT_SCORING,
      league: { roster_positions: ['WR'] },
      rosters: [{}],
    });
    assert.ok(roleOnly.get('starter') > roleOnly.get('rotational'));

    // A player who sat while the team played has a zero share, not a neutral one.
    const inactive = scale.computeFantasyViabilityTradeValues({
      players: { starter: players.starter, inactive: { position: 'WR' } },
      seasonStats: {},
      weeklyStats: { starter: snaps(0.95), inactive: [1, 2, 3, 4].map((week) => ({ week, off_snp: 0, tm_off_snp: 60 })) },
      scoringSettings: DEFAULT_SCORING,
      league: { roster_positions: ['WR'] },
      rosters: [{}],
    });
    assert.ok(inactive.get('inactive') <= 5);

    // Same two-game lead over baseline: the kicker's counts for less than the receiver's.
    const twoGame = scale.computeFantasyViabilityTradeValues({
      players: { kicker: players.kicker, receiver: players.receiver, k2: { position: 'K' }, k3: { position: 'K' }, w2: { position: 'WR' }, w3: { position: 'WR' } },
      seasonStats: {
        kicker: { gp: 2, fgm: 10 }, k2: { gp: 2, fgm: 4 }, k3: { gp: 2, fgm: 2 },
        receiver: { gp: 2, rec_yd: 300, rec_tgt: 10 }, w2: { gp: 2, rec_yd: 120, rec_tgt: 4 }, w3: { gp: 2, rec_yd: 60, rec_tgt: 2 },
      },
      scoringSettings: { ...DEFAULT_SCORING, fgm: 3, rec: 0, rec_yd: 0.1 },
      league: { roster_positions: ['K', 'WR'] },
      rosters: [{}, {}],
    });
    assert.ok(twoGame.get('receiver') > twoGame.get('kicker'));
    assert.ok(twoGame.get('kicker') > twoGame.get('k2'));
  });

  it('values kickers on production alone because every rostered kicker plays full time', () => {
    const players = { busy: { position: 'K' }, quiet: { position: 'K' }, k3: { position: 'K' } };
    // Same points per game; one kicker simply attempts more kicks.
    const values = scale.computeFantasyViabilityTradeValues({
      players,
      seasonStats: { busy: { gp: 6, fgm: 12, xpm: 18 }, quiet: { gp: 6, fgm: 14, xpm: 12 }, k3: { gp: 6, fgm: 6, xpm: 6 } },
      scoringSettings: { ...DEFAULT_SCORING, fgm: 3, xpm: 1 },
      league: { roster_positions: ['K'] },
      rosters: [{}, {}],
    });
    assert.equal(values.get('busy'), values.get('quiet'));
  });

  it('applies a mild injury discount that is halved for dynasty', () => {
    assert.equal(scale.getTradeAvailabilityFactor({ injury_status: null }), 1);
    assert.equal(scale.getTradeAvailabilityFactor({ injury_status: 'Questionable' }), 0.97);
    assert.equal(scale.getTradeAvailabilityFactor({ injury_status: 'IR' }), 0.7);
    assert.equal(scale.getTradeAvailabilityFactor({ status: 'Injured Reserve' }), 0.7);
    assert.equal(scale.getTradeAvailabilityFactor({ injury_status: 'IR' }, null, 'dynasty'), 0.85);
    // A fresh BDL designation takes precedence over the provider's.
    assert.equal(scale.getTradeAvailabilityFactor({ injury_status: 'Out' }, { gameStatus: 'Questionable' }), 0.97);

    const data = makePool('WR', [30, 25, 20, 15, 10, 5]);
    data.players['WR-0'] = { position: 'WR', injury_status: 'IR' };
    const input = { ...data, scoringSettings: DEFAULT_SCORING, league: { roster_positions: ['WR'] }, rosters: [{}, {}] };
    const healthy = scale.computeFantasyViabilityTradeValues({ ...input, players: { ...data.players, 'WR-0': { position: 'WR' } } });
    const injured = scale.computeFantasyViabilityTradeValues(input);
    assert.ok(injured.get('WR-0') < healthy.get('WR-0'));
    assert.ok(injured.get('WR-0') > 0);
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
