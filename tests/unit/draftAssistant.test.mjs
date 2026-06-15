import test from 'node:test';
import assert from 'node:assert/strict';

import { formatLeagueLogsMarketProfile, selectLeagueLogsMarketProfile } from '../../src/api/leagueLogsApi.js';
import { buildAppPath, parseAppRoute } from '../../src/utils/appRoutes.js';
import { resolveStatisticsPlayerMetaFromSleeperId } from '../../src/utils/playerDrilldown.js';
import {
  DEFAULT_DRAFT_MODEL_WEIGHTS,
  buildDraftAssistantViewModel,
  buildPickOrder,
  categorizeDraftScoringSettings,
  getDraftStatsSeason,
  getScheduledDraftCountdownParts,
  getSleeperDraftStartMs,
  getSleeperDraftSemanticSignature,
  getSleeperDraftPicksSignature,
  isSleeperDraftPollable,
  isSleeperDraftPreDraft,
  isSleeperUserDraftParticipant,
  normalizeDraftPick,
  normalizeDraftModelWeights,
  rebalanceDraftModelWeights,
  resolveLeagueDraftId,
  shouldShowSleeperDraftGlobalNotice,
  shouldRefreshSleeperDraftPicks,
  shouldRefreshSleeperDraftTradedPicks,
} from '../../src/utils/draftAssistant/index.js';
import {
  buildDraftAnalyticsCompareRows,
  buildDraftAnalyticsScatter,
  getDraftAnalyticsCompareLimit,
} from '../../src/utils/draftAssistant/analytics.js';
import { rankDraftCandidates } from '../../src/utils/draftAssistant/recommendations.js';
import {
  addPlayerToBoard,
  addPlayerToOrderedBoard,
  createOrderedBoardState,
  moveOverallBoardPlayer,
  movePlayerToBoardPosition,
  moveOrderedBoardPlayerWithinPosition,
  moveWithinPosition,
  playerCanSlotIntoBoardPosition,
  removePlayerFromBoard,
} from '../../src/utils/draftAssistant/board.js';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';

const players = {
  qb1: {
    player_id: 'qb1',
    full_name: 'Alpha Quarterback',
    position: 'QB',
    fantasy_positions: ['QB'],
    team: 'BUF',
    search_rank: 8,
    projected: {
      '2026': {
        pass_yd: 4200,
        pass_td: 31,
        pass_int: 11,
        rush_yd: 260,
        rush_td: 3,
      },
    },
  },
  rb1: {
    player_id: 'rb1',
    full_name: 'Bravo Runner',
    position: 'RB',
    fantasy_positions: ['RB'],
    team: 'KC',
    search_rank: 10,
    projected: {
      '2026': {
        rush_yd: 1180,
        rush_td: 10,
        rec: 46,
        rec_yd: 320,
        rec_td: 2,
      },
    },
  },
  wr1: {
    player_id: 'wr1',
    full_name: 'Charlie Receiver',
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'DAL',
    search_rank: 14,
    projected: {
      '2026': {
        rec: 92,
        rec_yd: 1210,
        rec_td: 9,
        rush_yd: 80,
      },
    },
  },
  te1: {
    player_id: 'te1',
    full_name: 'Delta Tight End',
    position: 'TE',
    fantasy_positions: ['TE'],
    team: 'DET',
    search_rank: 24,
    projected: {
      '2026': {
        rec: 74,
        rec_yd: 810,
        rec_td: 6,
      },
    },
  },
};

const rosters = [
  { roster_id: 1, owner_id: 'u1', players: [], reserve: [] },
  { roster_id: 2, owner_id: 'u2', players: [], reserve: [] },
  { roster_id: 3, owner_id: 'u3', players: [], reserve: [] },
];

const league = {
  settings: { type: 0 },
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'],
};

const leagueLogsProfiles = {
  profiles: [
    { key: 'redraft-1qb-12t-ppr1', profile: { format: 'redraft', numQbs: 1, numTeams: 12, ppr: 1 } },
    { key: 'redraft-1qb-12t-ppr0_5', profile: { format: 'redraft', numQbs: 1, numTeams: 12, ppr: 0.5 } },
    { key: 'redraft-2qb-12t-ppr1', profile: { format: 'redraft', numQbs: 2, numTeams: 12, ppr: 1 } },
    { key: 'dynasty-1qb-12t-ppr1', profile: { format: 'dynasty', numQbs: 1, numTeams: 12, ppr: 1 } },
    { key: 'dynasty-2qb-12t-ppr1', profile: { format: 'dynasty', numQbs: 2, numTeams: 12, ppr: 1 } },
  ],
};

test('draft route round-trips cleanly', () => {
  const route = parseAppRoute('/draft');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'war-room');
  assert.equal(buildAppPath(route), '/draft');
});

test('legacy companion draft route redirects to top-level draft', () => {
  const route = parseAppRoute('/companion/draft');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'war-room');
  assert.equal(buildAppPath(route), '/draft');
});

test('draft results route round-trips cleanly', () => {
  const route = parseAppRoute('/draft/results');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'results');
  assert.equal(buildAppPath(route), '/draft/results');
});

test('draft override query round-trips cleanly', () => {
  const route = parseAppRoute('/draft/results', '?sleeperDraftId=123456789012345678');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'results');
  assert.equal(route.sleeperDraftId, '123456789012345678');
  assert.equal(buildAppPath(route), '/draft/results?sleeperDraftId=123456789012345678');
});

test('legacy draftId query normalizes to sleeperDraftId', () => {
  const route = parseAppRoute('/draft/results', '?draftId=123456789012345678');
  assert.equal(route.sleeperDraftId, '123456789012345678');
  assert.equal(buildAppPath(route), '/draft/results?sleeperDraftId=123456789012345678');
});

test('draft board route round-trips cleanly', () => {
  const route = parseAppRoute('/draft/my-board');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'my-board');
  assert.equal(buildAppPath(route), '/draft/my-board');
});

test('future draft routes normalize for staged views', () => {
  const route = parseAppRoute('/draft/gauntlet');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'gauntlet');
  assert.equal(buildAppPath(route), '/draft/gauntlet');
});

test('legacy draft order route normalizes to results', () => {
  const route = parseAppRoute('/draft/draft-order');
  assert.equal(route.activeTab, 'draft');
  assert.equal(route.draftView, 'results');
  assert.equal(buildAppPath(route), '/draft/results');
});

test('draft board helpers add, dedupe, move, and remove players by position', () => {
  let board = {};
  board = addPlayerToBoard(board, { id: 'rb1', position: 'RB' });
  board = addPlayerToBoard(board, { id: 'rb2', position: 'RB' });
  board = addPlayerToBoard(board, { id: 'rb1', position: 'RB' });
  assert.deepEqual(board, { RB: ['rb2', 'rb1'] });

  board = moveWithinPosition(board, 'RB', 'rb1', -1);
  assert.deepEqual(board.RB, ['rb1', 'rb2']);

  board = movePlayerToBoardPosition(board, 'WR', 'wr1', null);
  board = movePlayerToBoardPosition(board, 'RB', 'wr1', 'rb2');
  assert.deepEqual(board, { RB: ['rb1', 'wr1', 'rb2'] });

  board = removePlayerFromBoard(board, 'wr1');
  assert.deepEqual(board, { RB: ['rb1', 'rb2'] });
});

test('draft board helpers reject moves into ineligible position lanes', () => {
  const runner = { id: 'rb1', position: 'RB', fantasy_positions: ['RB'] };
  const receiver = { id: 'wr1', position: 'WR', fantasy_positions: ['WR'] };

  assert.equal(playerCanSlotIntoBoardPosition(runner, 'RB'), true);
  assert.equal(playerCanSlotIntoBoardPosition(runner, 'WR'), false);

  let board = addPlayerToBoard({}, runner);
  board = movePlayerToBoardPosition(board, 'WR', runner.id, null, runner);
  assert.deepEqual(board, { RB: ['rb1'] });

  board = movePlayerToBoardPosition(board, 'WR', receiver.id, null, receiver);
  assert.deepEqual(board, { RB: ['rb1'], WR: ['wr1'] });
});

test('draft board overall order drives positional lane order', () => {
  const state = createOrderedBoardState({
    RB: ['rb2', 'rb1'],
    WR: ['wr1'],
  }, ['rb1', 'wr1', 'rb2']);

  assert.deepEqual(state.overallIds, ['rb1', 'wr1', 'rb2']);
  assert.deepEqual(state.boardByPosition, { RB: ['rb1', 'rb2'], WR: ['wr1'] });
});

test('draft board positional moves swap overall slots in the background', () => {
  const initial = createOrderedBoardState({
    RB: ['rb1', 'rb2'],
    WR: ['wr1'],
  }, ['rb1', 'wr1', 'rb2']);

  const moved = moveOrderedBoardPlayerWithinPosition(initial, 'RB', 'rb2', -1);
  assert.deepEqual(moved.boardByPosition.RB, ['rb2', 'rb1']);
  assert.deepEqual(moved.overallIds, ['rb2', 'wr1', 'rb1']);
});

test('draft board overall moves persist while positional view stays derived', () => {
  let state = createOrderedBoardState({
    RB: ['rb1', 'rb2'],
    WR: ['wr1'],
  }, ['rb1', 'wr1', 'rb2']);

  state = moveOverallBoardPlayer(state, 'rb2', -1);
  assert.deepEqual(state.overallIds, ['rb1', 'rb2', 'wr1']);
  assert.deepEqual(state.boardByPosition.RB, ['rb1', 'rb2']);

  state = moveOverallBoardPlayer(state, 'rb2', -1);
  assert.deepEqual(state.overallIds, ['rb2', 'rb1', 'wr1']);
  assert.deepEqual(state.boardByPosition.RB, ['rb2', 'rb1']);
});

test('draft board ordered helper appends new players to overall memory', () => {
  let state = createOrderedBoardState({ RB: ['rb1'] }, ['rb1']);
  state = addPlayerToOrderedBoard(state, { id: 'wr1', position: 'WR', fantasy_positions: ['WR'] });

  assert.deepEqual(state.overallIds, ['rb1', 'wr1']);
  assert.deepEqual(state.boardByPosition, { RB: ['rb1'], WR: ['wr1'] });
});

const analyticsCandidates = [
  {
    id: 'wr1',
    name: 'Alpha Receiver',
    position: 'WR',
    team: 'DAL',
    projection: { marketRank: 10 },
    workload: { ppg: 18.4, primaryVolume: 144 },
    draftRoom: { teamNeed: 0.82 },
    draftModel: {
      score: 86,
      components: { marketRank: 92, pastProduction: 84, workload: 80, rosterNeed: 82, schedule: 65 },
    },
    rank: { tier: 1, trend: { direction: 'up', label: 'Rising' }, sourceLabel: 'Market rank' },
    schedule: { label: 'Plus' },
  },
  {
    id: 'wr2',
    name: 'Beta Receiver',
    position: 'WR',
    team: 'LAC',
    projection: { marketRank: 40 },
    workload: { ppg: 12.1, primaryVolume: 108 },
    draftRoom: { teamNeed: 0.42 },
    draftModel: {
      score: 72,
      components: { marketRank: 68, pastProduction: 58, workload: 60, rosterNeed: 42 },
    },
    rank: { tier: 3, trend: { direction: 'down', label: 'Falling' } },
    schedule: { label: 'Neutral' },
  },
  {
    id: 'rb1',
    name: 'Pinned Runner',
    position: 'RB',
    team: 'KC',
    projection: { marketRank: 18 },
    workload: { ppg: 15.7, primaryVolume: 232 },
    draftRoom: { teamNeed: 0.3 },
    draftModel: {
      score: 80,
      components: { marketRank: 84, pastProduction: 76, workload: 88, rosterNeed: 30 },
    },
    rank: { tier: 2, trend: { direction: 'flat', label: 'Flat' } },
    schedule: { label: 'Tough' },
  },
  {
    id: 'wr3',
    name: 'Sparse Receiver',
    position: 'WR',
    team: 'FA',
    draftModel: { components: {} },
    rank: {},
  },
];

test('draft analytics scatter scopes peers by focused position and forces pinned comparisons in', () => {
  const scatter = buildDraftAnalyticsScatter({
    candidates: analyticsCandidates,
    focusedPlayerId: 'wr1',
    pinnedPlayerIds: ['rb1'],
    xAxis: 'market',
    yAxis: 'rating',
  });

  const plottedIds = new Set(scatter.points.map((point) => point.id));
  const alpha = scatter.points.find((point) => point.id === 'wr1');
  const beta = scatter.points.find((point) => point.id === 'wr2');
  const pinned = scatter.points.find((point) => point.id === 'rb1');

  assert.equal(scatter.peerCount, 3);
  assert.equal(plottedIds.has('rb1'), true);
  assert.equal(pinned.pinned, true);
  assert.equal(alpha.focused, true);
  assert.equal(alpha.x > beta.x, true);
  assert.equal(scatter.unavailableCount, 1);
});

test('draft analytics compare rows cap at four players and preserve unavailable values', () => {
  const rows = buildDraftAnalyticsCompareRows([
    ...analyticsCandidates,
    { ...analyticsCandidates[0], id: 'wr4', name: 'Extra Receiver' },
    { ...analyticsCandidates[1], id: 'wr5', name: 'Overflow Receiver' },
  ]);
  const ratingRow = rows.find((row) => row.key === 'rating');
  const ppgRow = rows.find((row) => row.key === 'ppg');

  assert.equal(ratingRow.cells.length, getDraftAnalyticsCompareLimit());
  assert.equal(ppgRow.cells.length, getDraftAnalyticsCompareLimit());
  assert.equal(ppgRow.cells.find((cell) => cell.playerId === 'wr3').value, '—');
});

test('draft player drilldown resolves null ESPN ids from team roster matches', async () => {
  const sleeperPlayers = {
    rookie1: {
      player_id: 'rookie1',
      full_name: 'Echo Rookie',
      first_name: 'Echo',
      last_name: 'Rookie',
      position: 'WR',
      team: 'KC',
      espn_id: null,
    },
  };

  const playerMeta = await resolveStatisticsPlayerMetaFromSleeperId('rookie1', sleeperPlayers, {}, {
    rosterFetcher: async (teamId) => {
      assert.equal(teamId, 'KC');
      return [
        { id: '12345', displayName: 'Echo Rookie', position: 'WR', teamId: 'KC', jersey: '17', experience: 0, status: 'Active' },
      ];
    },
  });

  assert.deepEqual(playerMeta, {
    id: '12345',
    sleeperId: 'rookie1',
    displayName: 'Echo Rookie',
    teamId: 'KC',
    position: 'WR',
    positionName: '',
    experience: 0,
    jersey: '17',
    status: 'Active',
  });
});

test('buildPickOrder supports snake drafts', () => {
  const draft = {
    type: 'snake',
    settings: { rounds: 2 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };

  const order = buildPickOrder(draft, rosters);
  assert.deepEqual(order.map((pick) => pick.rosterId), ['1', '2', '3', '3', '2', '1']);
});

test('buildPickOrder supports linear drafts', () => {
  const draft = {
    type: 'linear',
    settings: { rounds: 2 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };

  const order = buildPickOrder(draft, rosters);
  assert.deepEqual(order.map((pick) => pick.rosterId), ['1', '2', '3', '1', '2', '3']);
});

test('buildPickOrder assigns traded picks to their current owners', () => {
  const draft = {
    type: 'snake',
    season: '2026',
    settings: { rounds: 2 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const tradedPicks = [
    { season: '2026', round: 1, roster_id: 1, owner_id: 3 },
    { season: '2026', round: 2, roster_id: 3, owner_id: 1 },
  ];

  const order = buildPickOrder(draft, rosters, tradedPicks);

  assert.deepEqual(order.map((pick) => pick.rosterId), ['3', '2', '3', '1', '2', '1']);
  assert.deepEqual(order.map((pick) => pick.originalRosterId), ['1', '2', '3', '3', '2', '1']);
  assert.deepEqual(order.map((pick) => pick.roundPick), [1, 2, 3, 1, 2, 3]);
  assert.equal(order[0].acquired, true);
  assert.equal(order[1].acquired, false);
});

test('mock draft picks resolve roster ids from draft slots', () => {
  const pick = normalizeDraftPick({
    draft_id: 'mock-draft',
    draft_slot: 2,
    pick_no: 2,
    player_id: 'wr1',
    roster_id: null,
    round: 1,
  }, 1, {
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  });

  assert.equal(pick.rosterId, '2');
  assert.equal(pick.playerId, 'wr1');
  assert.equal(pick.overall, 2);
});

test('draft assistant view model keeps Sleeper mock draft picks', () => {
  const draft = {
    draft_id: 'mock-draft',
    type: 'snake',
    status: 'paused',
    settings: { rounds: 2 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const draftPicks = [
    { draft_slot: 1, player_id: 'qb1', round: 1, pick_no: 1, roster_id: null },
    { draft_slot: 2, player_id: 'wr1', round: 1, pick_no: 2, roster_id: null },
  ];

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks,
    myRoster: rosters[2],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: ['wr1', 'rb1'],
  });

  assert.equal(viewModel.currentOverall, 3);
  assert.deepEqual(viewModel.normalizedPicks.map((pick) => pick.rosterId), ['1', '2']);
  assert.equal(viewModel.draftedCardsById.has('wr1'), true);
  assert.equal(viewModel.allCandidates.some((player) => player.id === 'wr1'), false);
  assert.equal(viewModel.onClockRecommendation?.id, 'rb1');
});

test('draft status helpers keep War Room pre-draft only', () => {
  assert.equal(isSleeperDraftPreDraft({ status: 'pre_draft' }), true);
  assert.equal(isSleeperDraftPreDraft({ status: 'drafting' }), false);
  assert.equal(isSleeperDraftPreDraft({ status: 'complete' }), false);
  assert.equal(isSleeperDraftPollable({ status: 'paused' }), true);
});

test('global draft notice hides non-participant mock drafts', () => {
  const leagueDraft = { status: 'drafting', league_id: 'league-1' };
  const participantMockDraft = {
    status: 'drafting',
    league_id: null,
    draft_order: { user_1: 1, user_2: 2 },
  };
  const otherMockDraft = {
    status: 'paused',
    league_id: null,
    draft_order: { user_3: 1, user_4: 2 },
  };

  assert.equal(isSleeperUserDraftParticipant(participantMockDraft, 'user_1'), true);
  assert.equal(shouldShowSleeperDraftGlobalNotice({
    draft: leagueDraft,
    userId: 'user_1',
    leagueId: 'league-1',
  }), true);
  assert.equal(shouldShowSleeperDraftGlobalNotice({
    draft: participantMockDraft,
    userId: 'user_1',
    leagueId: 'league-1',
  }), true);
  assert.equal(shouldShowSleeperDraftGlobalNotice({
    draft: otherMockDraft,
    userId: 'user_1',
    leagueId: 'league-1',
  }), false);
  assert.equal(shouldShowSleeperDraftGlobalNotice({
    draft: { ...participantMockDraft, status: 'pre_draft' },
    userId: 'user_1',
    leagueId: 'league-1',
  }), false);
});

test('draft semantic signature ignores only elapsed clock metadata', () => {
  const baseDraft = {
    draft_id: 'draft-1',
    status: 'drafting',
    last_picked: 1000,
    start_time: 1772316000000,
    settings: { pick_timer: 60, rounds: 2 },
    metadata: { elapsed_pick_timer: 5, scoring_type: 'ppr' },
    slot_to_roster_id: { 1: 1, 2: 2 },
  };

  assert.equal(
    getSleeperDraftSemanticSignature(baseDraft),
    getSleeperDraftSemanticSignature({
      ...baseDraft,
      metadata: { ...baseDraft.metadata, elapsed_pick_timer: 22 },
    }),
  );
  assert.equal(
    getSleeperDraftSemanticSignature(baseDraft),
    getSleeperDraftSemanticSignature({ ...baseDraft, status: 'paused' }),
  );
  assert.notEqual(
    getSleeperDraftSemanticSignature(baseDraft),
    getSleeperDraftSemanticSignature({ ...baseDraft, last_picked: 2000 }),
  );
  assert.notEqual(
    getSleeperDraftSemanticSignature(baseDraft),
    getSleeperDraftSemanticSignature({ ...baseDraft, start_time: 1772402400000 }),
  );
});

test('scheduled draft helpers parse start time and format countdown units', () => {
  assert.equal(getSleeperDraftStartMs({ start_time: 1772316000 }), 1772316000000);
  assert.equal(getSleeperDraftStartMs({ start_time: 1772316000000 }), 1772316000000);
  assert.equal(
    getSleeperDraftStartMs({ metadata: { start_time: '2026-03-01T18:00:00.000Z' } }),
    Date.parse('2026-03-01T18:00:00.000Z'),
  );

  assert.deepEqual(getScheduledDraftCountdownParts(1_000_000_000, 0), {
    months: 0,
    weeks: 1,
    days: 4,
    hours: 13,
    minutes: 46,
    seconds: 40,
  });
  assert.equal(
    getScheduledDraftCountdownParts(
      Date.parse('2026-03-01T00:00:00'),
      Date.parse('2026-01-01T00:00:00'),
    ).months,
    2,
  );
  assert.equal(getScheduledDraftCountdownParts(1_000, 1_000), null);
});

test('live draft pick refresh policy follows state changes instead of every clock tick', () => {
  const previousDraft = {
    draft_id: 'draft-1',
    status: 'drafting',
    last_picked: 1000,
    settings: { pick_timer: 60 },
  };
  const elapsedOnlyDraft = {
    ...previousDraft,
    metadata: { elapsed_pick_timer: 12 },
  };

  assert.equal(shouldRefreshSleeperDraftPicks({
    initialLoad: false,
    previousDraft,
    nextDraft: elapsedOnlyDraft,
    now: 2_000,
    lastPicksPollAt: 1_000,
    liveRefreshMs: 5_000,
  }), false);

  assert.equal(shouldRefreshSleeperDraftPicks({
    initialLoad: false,
    previousDraft,
    nextDraft: { ...elapsedOnlyDraft, status: 'paused' },
    now: 2_000,
    lastPicksPollAt: 1_000,
    liveRefreshMs: 5_000,
  }), false);

  assert.equal(shouldRefreshSleeperDraftPicks({
    initialLoad: false,
    previousDraft: { ...previousDraft, status: 'pre_draft' },
    nextDraft: elapsedOnlyDraft,
    now: 2_000,
    lastPicksPollAt: 1_000,
    liveRefreshMs: 5_000,
  }), true);

  assert.equal(shouldRefreshSleeperDraftPicks({
    initialLoad: false,
    previousDraft,
    nextDraft: { ...elapsedOnlyDraft, last_picked: 2_000 },
    now: 2_100,
    lastPicksPollAt: 1_000,
    liveRefreshMs: 5_000,
  }), true);

  assert.equal(shouldRefreshSleeperDraftPicks({
    initialLoad: false,
    previousDraft,
    nextDraft: elapsedOnlyDraft,
    now: 6_500,
    lastPicksPollAt: 1_000,
    liveRefreshMs: 5_000,
  }), true);
});

test('draft traded picks refresh slower than live pick confirmation', () => {
  const previousDraft = { draft_id: 'draft-1', status: 'drafting', last_picked: 1000 };
  const nextDraft = { ...previousDraft, metadata: { elapsed_pick_timer: 20 } };

  assert.equal(shouldRefreshSleeperDraftTradedPicks({
    initialLoad: false,
    previousDraft,
    nextDraft,
    now: 10_000,
    lastTradedPicksPollAt: 1_000,
    refreshMs: 30_000,
  }), false);

  assert.equal(shouldRefreshSleeperDraftTradedPicks({
    initialLoad: false,
    previousDraft,
    nextDraft,
    now: 31_500,
    lastTradedPicksPollAt: 1_000,
    refreshMs: 30_000,
  }), true);
});

test('draft pick signatures change when Sleeper confirms a player selection', () => {
  const pendingSignature = getSleeperDraftPicksSignature([
    { pick_no: 1, roster_id: '1', player_id: 'qb1' },
  ]);
  const selectedSignature = getSleeperDraftPicksSignature([
    { pick_no: 1, roster_id: '1', player_id: 'rb1' },
  ]);

  assert.notEqual(pendingSignature, selectedSignature);
});

test('league draft resolver prefers active and pre-draft rooms before completed history', () => {
  assert.equal(
    resolveLeagueDraftId({ draft_id: 'completed-draft' }, [
      { draft_id: 'completed-draft', status: 'complete' },
      { draft_id: 'future-draft', status: 'pre_draft' },
    ]),
    'future-draft',
  );
  assert.equal(
    resolveLeagueDraftId({ draft_id: 'completed-draft' }, [
      { draft_id: 'completed-draft', status: 'complete' },
      { draft_id: 'paused-mock', status: 'paused' },
      { draft_id: 'live-draft', status: 'drafting' },
      { draft_id: 'future-draft', status: 'pre_draft' },
    ]),
    'live-draft',
  );
  assert.equal(
    resolveLeagueDraftId({ draft_id: 'completed-draft' }, [
      { draft_id: 'completed-draft', status: 'complete' },
      { draft_id: 'future-draft', status: 'pre_draft' },
      { draft_id: 'paused-mock', status: 'paused' },
    ]),
    'paused-mock',
  );
  assert.equal(resolveLeagueDraftId({ draft_id: 'completed-draft' }, []), 'completed-draft');
});

test('draft assistant recommendations respect board rank and current pick state', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'drafting',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const draftPicks = [
    { roster_id: '1', player_id: 'qb1', round: 1, pick_no: 1 },
    { roster_id: '2', player_id: 'te1', round: 1, pick_no: 2 },
  ];

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks,
    myRoster: rosters[2],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: ['wr1', 'rb1'],
  });

  assert.equal(viewModel.currentOverall, 3);
  assert.equal(viewModel.nextMyPick.overall, 3);
  assert.equal(viewModel.bestOverall.id, 'wr1');
  assert.equal(viewModel.bestOverall.boardRank, 1);
  assert.equal(viewModel.bestByPosition.RB.id, 'rb1');
  assert.equal(viewModel.bestOverall.availability, undefined);
  assert.equal(viewModel.bestOverall.draftRoom.availability, undefined);
});

test('draft assistant enriches drafted players into draftedCardsById without leaking them into candidates', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'drafting',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const draftPicks = [
    { roster_id: '1', player_id: 'qb1', round: 1, pick_no: 1 },
    { roster_id: '2', player_id: 'te1', round: 1, pick_no: 2 },
  ];

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks,
    myRoster: rosters[2],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: ['wr1', 'rb1'],
  });

  // Drafted players surface as enriched cards with the metrics the Results view renders.
  assert.ok(viewModel.draftedCardsById instanceof Map);
  const qbCard = viewModel.draftedCardsById.get('qb1');
  const teCard = viewModel.draftedCardsById.get('te1');
  assert.ok(qbCard, 'qb1 should have a drafted card');
  assert.ok(teCard, 'te1 should have a drafted card');
  assert.equal(qbCard.position, 'QB');
  assert.equal(qbCard.team, 'BUF');
  assert.equal(typeof qbCard.draftModel?.score, 'number');
  assert.notEqual(qbCard.rank?.overallRank, undefined);
  assert.notEqual(qbCard.rank?.tier, undefined);

  // The candidate pool (and therefore War Room) must still exclude drafted players.
  const candidateIds = new Set(viewModel.allCandidates.map((candidate) => candidate.id));
  assert.equal(candidateIds.has('qb1'), false);
  assert.equal(candidateIds.has('te1'), false);
});

test('draft scoring categorization exposes active scoring levers', () => {
  const categories = categorizeDraftScoringSettings({
    ...DEFAULT_SCORING,
    rec: 1,
    bonus_rec_te: 0.5,
    rush_fd: 0.25,
    bonus_pass_td_40p: 1,
    idp_tkl: 1,
  });

  assert.deepEqual(
    categories.map((category) => category.id),
    ['passing', 'receiving', 'rushing', 'te-premium', 'first-downs', 'big-play', 'idp'],
  );
  assert.equal(categories.find((category) => category.id === 'te-premium').keys[0].key, 'bonus_rec_te');
});

test('draft stats season uses the completed season before the draft season', () => {
  assert.equal(getDraftStatsSeason('2026'), '2025');
  assert.equal(getDraftStatsSeason(2025), '2024');
  assert.equal(getDraftStatsSeason('2017'), '2017');
  assert.equal(getDraftStatsSeason(null), null);
});

test('draft model weights normalize missing and out-of-range values', () => {
  const weights = normalizeDraftModelWeights({
    marketRank: 120,
    pastProduction: -10,
    workload: 45,
  });

  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 100);
  assert.deepEqual(Object.keys(weights), ['marketRank', 'pastProduction', 'scoringFit', 'rosterNeed']);
  assert.equal(weights.marketRank, 74);
  assert.equal(weights.pastProduction, 0);
  assert.equal(weights.scoringFit, 15);
  assert.equal(weights.rosterNeed, 11);
  assert.equal(weights.workload, undefined);
});

test('draft model weights can total less than 100', () => {
  const weights = normalizeDraftModelWeights({
    marketRank: 10,
    pastProduction: 5,
    workload: 0,
    scoringFit: 0,
    schedule: 0,
    teamContext: 0,
    rosterNeed: 0,
    availability: 0,
  });

  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 15);
  assert.equal(weights.marketRank, 10);
  assert.equal(weights.pastProduction, 5);
  assert.equal(weights.workload, undefined);
  assert.equal(weights.availability, undefined);
});

test('draft model weight edits do not rebalance while total stays under 100', () => {
  const weights = rebalanceDraftModelWeights({
    marketRank: 25,
    pastProduction: 20,
    workload: 10,
    scoringFit: 0,
    schedule: 0,
    teamContext: 0,
    rosterNeed: 0,
    availability: 0,
  }, 'marketRank', 30);

  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 50);
  assert.equal(weights.marketRank, 30);
  assert.equal(weights.pastProduction, 20);
  assert.equal(weights.scoringFit, 0);
  assert.equal(weights.workload, undefined);
});

test('draft model weight edits only rebalance other weights when total exceeds 100', () => {
  const weights = rebalanceDraftModelWeights({
    marketRank: 70,
    pastProduction: 20,
    workload: 10,
    scoringFit: 10,
    schedule: 0,
    teamContext: 0,
    rosterNeed: 0,
    availability: 0,
  }, 'marketRank', 85);

  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(weights.marketRank, 85);
  assert.equal(weights.pastProduction, 10);
  assert.equal(weights.scoringFit, 5);
  assert.equal(weights.rosterNeed, 0);
  assert.equal(weights.workload, undefined);
});

test('pre-draft recommendation scoring ignores availability pressure', () => {
  const candidate = {
    id: 'wr1',
    name: 'Charlie Receiver',
    position: 'WR',
    projection: { fallbackRank: 42, fallbackLabel: 'Sleeper search rank', projectedPoints: null },
    draftModel: { score: 76, weights: { marketRank: 40, pastProduction: 25, scoringFit: 20, rosterNeed: 15 } },
    workload: { ppg: 12.4 },
    schedule: { label: 'Unavailable' },
    draftRoom: {},
  };

  const early = rankDraftCandidates({
    candidates: [candidate],
    picksUntilUser: 1,
  })[0];
  const late = rankDraftCandidates({
    candidates: [candidate],
    picksUntilUser: 14,
    teamsBeforeUser: [{ needByPosition: { WR: 1 } }, { needByPosition: { WR: 1 } }],
    recentPositionCounts: { WR: 8 },
  })[0];

  assert.equal(early.recommendationScore, late.recommendationScore);
  assert.equal(early.availability, undefined);
  assert.equal(early.draftRoom.availability, undefined);
  assert.doesNotMatch(early.why, /make it back|Take now|Could go either way|Likely survives/);
});

test('draft assistant builds transparent intelligence profiles from available stats', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const seasonStats = {
    wr1: { gp: 2, rec: 14, rec_yd: 180, rec_td: 1, rec_tgt: 24 },
    rb1: { gp: 2, rush_att: 34, rush_yd: 160, rush_td: 2, rec: 4, rec_yd: 20 },
    qb1: { gp: 2, pass_att: 70, pass_yd: 580, pass_td: 4, pass_int: 1 },
    te1: { gp: 2, rec: 8, rec_yd: 80, rec_td: 1, rec_tgt: 11 },
  };
  const weeklyStats = {
    wr1: [
      { week: 1, team: 'DAL', rec: 6, rec_yd: 80, rec_td: 0, rec_tgt: 10 },
      { week: 2, team: 'DAL', rec: 8, rec_yd: 100, rec_td: 1, rec_tgt: 14 },
    ],
    rb1: [
      { week: 1, team: 'KC', rush_att: 18, rush_yd: 90, rush_td: 1, rec: 2, rec_yd: 10 },
      { week: 2, team: 'KC', rush_att: 16, rush_yd: 70, rush_td: 1, rec: 2, rec_yd: 10 },
    ],
  };
  const scheduleMap = {
    1: { DAL: { opp: 'NYG' }, NYG: { opp: 'DAL' }, KC: { opp: 'LV' }, LV: { opp: 'KC' } },
    2: { DAL: { opp: 'NYG' }, NYG: { opp: 'DAL' }, KC: { opp: 'LV' }, LV: { opp: 'KC' } },
  };

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: { ...DEFAULT_SCORING, bonus_rec_te: 0.5 },
    season: '2026',
    boardIds: ['wr1'],
    seasonStats,
    weeklyStats,
    scheduleMap,
  });

  const wr = viewModel.allCandidates.find((player) => player.id === 'wr1');
  assert.equal(viewModel.scoringCategories.some((category) => category.id === 'te-premium'), true);
  assert.equal(wr.rank.overallRank, 14);
  assert.equal(wr.rank.tier, 2);
  assert.equal(wr.scoringFit.positionSeasonRank, 1);
  assert.equal(wr.scoringFit.pastPpg, 19);
  assert.equal(wr.scoringFit.seasonPoints, 38);
  assert.equal(wr.scoringFit.relevantLevers.some((lever) => lever.id === 'receiving'), true);
  assert.equal(wr.workload.primaryVolume, 24);
  assert.equal(wr.workload.targetShare, 100);
  assert.equal(wr.teamContext.byeWeek, null);
  assert.equal(wr.schedule.value, 100);
  assert.equal(wr.draftRoom.boardRank, 1);
  assert.equal(typeof wr.draftModel.score, 'number');
  assert.equal(wr.draftModel.weights.marketRank, DEFAULT_DRAFT_MODEL_WEIGHTS.marketRank);
  assert.deepEqual(Object.keys(wr.draftModel.weights), ['marketRank', 'pastProduction', 'scoringFit', 'rosterNeed']);
  assert.equal(wr.draftModel.components.workload != null, true);
  assert.equal(wr.draftModel.components.schedule != null, true);
  assert.equal(Object.hasOwn(wr.draftModel.components, 'teamContext'), true);
  assert.equal(wr.draftModel.components.availability, undefined);
});

test('draft model weights affect derived recommendation order', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const rankingOnlyPlayers = {
    rb1: { ...players.rb1, projected: undefined, search_rank: 10 },
    wr1: { ...players.wr1, projected: undefined, search_rank: 80 },
  };
  const seasonStats = {
    rb1: { gp: 2, rush_att: 18, rush_yd: 70, rec: 2, rec_yd: 10 },
    wr1: { gp: 2, rec: 20, rec_yd: 260, rec_td: 2, rec_tgt: 30 },
  };
  const weeklyStats = {
    rb1: [
      { week: 1, team: 'KC', rush_att: 9, rush_yd: 35, rec: 1, rec_yd: 5 },
      { week: 2, team: 'KC', rush_att: 9, rush_yd: 35, rec: 1, rec_yd: 5 },
    ],
    wr1: [
      { week: 1, team: 'DAL', rec: 10, rec_yd: 130, rec_td: 1, rec_tgt: 15 },
      { week: 2, team: 'DAL', rec: 10, rec_yd: 130, rec_td: 1, rec_tgt: 15 },
    ],
  };

  const marketWeighted = buildDraftAssistantViewModel({
    players: rankingOnlyPlayers,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    seasonStats,
    weeklyStats,
    modelWeights: {
      marketRank: 100,
      pastProduction: 0,
      scoringFit: 0,
      rosterNeed: 0,
    },
  });
  const productionWeighted = buildDraftAssistantViewModel({
    players: rankingOnlyPlayers,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    seasonStats,
    weeklyStats,
    modelWeights: {
      marketRank: 0,
      pastProduction: 100,
      scoringFit: 0,
      rosterNeed: 0,
    },
  });

  assert.equal(marketWeighted.rankedCandidates[0].id, 'rb1');
  assert.equal(productionWeighted.rankedCandidates[0].id, 'wr1');
});

test('draft assistant pick window follows current traded-pick owners', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    season: '2026',
    status: 'drafting',
    settings: { rounds: 2 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const draftTradedPicks = [
    { season: '2026', round: 1, roster_id: 1, owner_id: 3 },
    { season: '2026', round: 2, roster_id: 3, owner_id: 1 },
  ];

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks: [],
    draftTradedPicks,
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: [],
  });

  assert.equal(viewModel.currentPick.rosterId, '3');
  assert.equal(viewModel.currentPick.originalRosterId, '1');
  assert.equal(viewModel.currentPick.acquired, true);
  assert.equal(viewModel.nextMyPick.overall, 4);
  assert.deepEqual(viewModel.picksBeforeUser.map((pick) => pick.rosterId), ['3', '2', '3']);
});

test('draft assistant falls back to Sleeper search rank when projections are absent', () => {
  const rankingOnlyPlayers = Object.fromEntries(
    Object.entries(players).map(([id, player]) => [id, { ...player, projected: undefined }]),
  );
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'drafting',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };

  const viewModel = buildDraftAssistantViewModel({
    players: rankingOnlyPlayers,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: [],
  });

  assert.equal(viewModel.hasProjectionData, false);
  assert.equal(viewModel.hasRecommendationData, true);
  assert.equal(viewModel.bestOverall.id, 'rb1');
  assert.equal(viewModel.bestOverall.projection.projectedPoints, null);
  assert.match(viewModel.bestOverall.why, /Sleeper search rank/);
});

test('draft assistant ignores sentinel Sleeper search ranks and derives a pool rank', () => {
  const rankingOnlyPlayers = Object.fromEntries(
    Object.entries(players).map(([id, player]) => [
      id,
      {
        ...player,
        projected: undefined,
        search_rank: id === 'rb1' ? 9999999 : player.search_rank,
      },
    ]),
  );
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'drafting',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };

  const viewModel = buildDraftAssistantViewModel({
    players: rankingOnlyPlayers,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: [],
  });

  const rb = viewModel.allCandidates.find((player) => player.id === 'rb1');
  assert.equal(rb.projection.searchRank, null);
  assert.equal(rb.projection.fallbackRank, 25);
  assert.equal(rb.projection.fallbackLabel, 'Draft pool rank');
  assert.equal(rb.rank.sourceLabel, 'Draft pool rank');
  assert.notEqual(rb.rank.overallRank, 9999999);
});

test('draft assistant marks rostered players separately from drafted players', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const rosteredPlayers = [
    { ...rosters[0], players: ['rb1'], starters: ['rb1'] },
    { ...rosters[1], reserve: ['wr1'] },
    { ...rosters[2], taxi: ['te1'] },
  ];

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters: rosteredPlayers,
    league,
    draft,
    draftPicks: [],
    myRoster: rosteredPlayers[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: ['rb1', 'qb1'],
  });

  assert.equal(viewModel.allCandidates.find((player) => player.id === 'rb1').rostered, true);
  assert.equal(viewModel.allCandidates.find((player) => player.id === 'wr1').rostered, true);
  assert.equal(viewModel.allCandidates.find((player) => player.id === 'te1').rostered, true);
  assert.equal(viewModel.allCandidates.find((player) => player.id === 'qb1').rostered, false);
  assert.equal(viewModel.boardRows.find((player) => player.id === 'rb1').rostered, true);
  assert.equal(viewModel.boardRows.find((player) => player.id === 'qb1').rostered, false);
});

test('LeagueLogs profile selection follows league scoring and QB setup', () => {
  const halfPpr = selectLeagueLogsMarketProfile(leagueLogsProfiles, {
    league,
    scoringSettings: { ...DEFAULT_SCORING, rec: 0.5 },
  });
  const superflex = selectLeagueLogsMarketProfile(leagueLogsProfiles, {
    league: { ...league, roster_positions: ['QB', 'SUPER_FLEX', 'RB', 'WR', 'TE'] },
    scoringSettings: { ...DEFAULT_SCORING, rec: 1 },
  });
  const dynasty = selectLeagueLogsMarketProfile(leagueLogsProfiles, {
    league: { ...league, settings: { type: 2 } },
    scoringSettings: { ...DEFAULT_SCORING, rec: 1 },
  });

  assert.equal(halfPpr.key, 'redraft-1qb-12t-ppr0_5');
  assert.equal(superflex.key, 'redraft-2qb-12t-ppr1');
  assert.equal(dynasty.key, 'dynasty-1qb-12t-ppr1');
});

test('LeagueLogs market profile labels use plain English league descriptions', () => {
  assert.deepEqual(
    leagueLogsProfiles.profiles.map((entry) => formatLeagueLogsMarketProfile(entry)),
    [
      'Redraft League - 1QB - 12+ Teams - PPR',
      'Redraft League - 1QB - 12+ Teams - Half-PPR',
      'Redraft League - 2QB - 12+ Teams - PPR',
      'Dynasty League - 1QB - 12+ Teams - PPR',
      'Dynasty League - 2QB - 12+ Teams - PPR',
    ],
  );

  assert.equal(
    formatLeagueLogsMarketProfile({ profileKey: 'redraft-1qb-10t-ppr0' }),
    'Redraft League - 1QB - 10+ Teams - Standard Scoring',
  );
  assert.equal(
    formatLeagueLogsMarketProfile({ profileKey: 'dynasty-sf-14t-ppr1_5' }),
    'Dynasty League - Superflex - 14+ Teams - 1.5 PPR',
  );
});

test('draft assistant enriches rows with LeagueLogs market ranks', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const marketValuesByPlayerId = new Map([
    ['qb1', { overallRank: 8, positionRank: 3, value: 58.49 }],
    ['rb1', { overallRank: 20, positionRank: 11, value: 33.8 }],
  ]);

  const viewModel = buildDraftAssistantViewModel({
    players,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: ['qb1'],
    marketValuesByPlayerId,
  });

  const qb = viewModel.allCandidates.find((player) => player.id === 'qb1');
  const rb = viewModel.allCandidates.find((player) => player.id === 'rb1');

  assert.equal(qb.projection.marketRank, 8);
  assert.equal(qb.projection.marketPositionRank, 3);
  assert.equal(qb.projection.marketValue, 58.49);
  assert.equal(qb.projection.fallbackRank, 8);
  assert.equal(qb.projection.fallbackLabel, 'Market rank');
  assert.equal(rb.projection.marketRank, 20);
  assert.equal(viewModel.boardRows.find((player) => player.id === 'qb1').projection.marketRank, 8);
});

test('draft assistant excludes retired historical players from the candidate pool', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const retiredPlayers = {
    ...players,
    retiredQb: {
      player_id: 'retiredQb',
      full_name: 'Retired Quarterback',
      position: 'QB',
      fantasy_positions: ['QB'],
      team: null,
      active: true,
      status: 'Retired',
      search_rank: 3,
    },
    inactiveQb: {
      player_id: 'inactiveQb',
      full_name: 'Inactive Quarterback',
      position: 'QB',
      fantasy_positions: ['QB'],
      team: 'TB',
      active: true,
      status: 'Inactive',
      search_rank: 4,
    },
  };

  const viewModel = buildDraftAssistantViewModel({
    players: retiredPlayers,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
  });

  assert.equal(viewModel.allCandidates.some((player) => player.id === 'retiredQb'), false);
  assert.equal(viewModel.allCandidates.some((player) => player.id === 'inactiveQb'), false);
  assert.equal(viewModel.allCandidates.some((player) => player.id === 'qb1'), true);
});
