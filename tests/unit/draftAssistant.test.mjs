import test from 'node:test';
import assert from 'node:assert/strict';

import { formatLeagueLogsMarketProfile, selectLeagueLogsMarketProfile } from '../../src/api/leagueLogsApi.js';
import { buildAppPath, parseAppRoute } from '../../src/utils/appRoutes.js';
import { resolveStatisticsPlayerMetaFromSleeperId } from '../../src/utils/playerDrilldown.js';
import {
  DEFAULT_DRAFT_MODEL_WEIGHTS,
  buildDraftAssistantViewModel,
  buildDraftPositionRanks,
  buildPickOrder,
  categorizeDraftScoringSettings,
  computeDraftOutcomes,
  getDraftResultsPresentation,
  getDraftTourContext,
  isDraftLeagueSelectionReady,
  getDraftResultsSeason,
  getDraftRosterEligiblePositions,
  getDraftStatsSeason,
  getScheduledDraftCountdownParts,
  getSleeperDraftStartMs,
  getSleeperDraftSemanticSignature,
  getSleeperDraftPicksSignature,
  isSleeperDraftPollable,
  isSleeperDraftPreDraft,
  isSleeperUserDraftParticipant,
  isPlayerEligibleForDraftRoster,
  normalizeDraftPick,
  normalizeDraftModelWeights,
  rebalanceDraftModelWeights,
  resolveDraftPickManagerId,
  resolveLeagueDraftId,
  shouldShowSleeperDraftGlobalNotice,
  shouldRefreshSleeperDraftPicks,
  shouldRefreshSleeperDraftTradedPicks,
} from '../../src/utils/draftAssistant/index.js';
import {
  buildDraftAnalyticsCompareRows,
  buildDraftAnalyticsScatter,
  buildDraftAnalyticsSnapshot,
  getDraftAnalyticsAxisOptions,
  getDraftAnalyticsCompareLimit,
} from '../../src/utils/draftAssistant/analytics.js';
import {
  DRAFT_RANKING_PRIORITY_CONTROLS,
  DRAFT_RANKING_PRIORITY_HELP,
  DRAFT_RANKING_PRIORITY_RESET_LABEL,
  DRAFT_RANKING_PRIORITY_TITLE,
} from '../../src/utils/draftAssistant/priorityCopy.js';
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

test('draft ranking priority copy explains the personalized ranking tradeoff', () => {
  assert.equal(DRAFT_RANKING_PRIORITY_TITLE, 'Adjust ranking priorities');
  assert.equal(DRAFT_RANKING_PRIORITY_RESET_LABEL, 'Reset priorities');
  assert.match(DRAFT_RANKING_PRIORITY_HELP, /balance player value, scoring fit, team needs, and the schedule ahead/);
  assert.match(DRAFT_RANKING_PRIORITY_HELP, /more influence on player rankings/);
  assert.deepEqual(
    DRAFT_RANKING_PRIORITY_CONTROLS.map(({ key, label }) => ({ key, label })),
    [
      { key: 'marketRank', label: 'Player value' },
      { key: 'adp', label: 'BALLDONTLIE ADP' },
      { key: 'pastProduction', label: 'Points per game' },
      { key: 'scoringFit', label: 'Scoring fit' },
      { key: 'rosterNeed', label: 'Team need' },
      { key: 'schedule', label: 'Schedule' },
    ],
  );
});

test('draft roster eligibility expands flex slots without treating bench slots as universal eligibility', () => {
  assert.deepEqual(
    [...getDraftRosterEligiblePositions(['QB', 'FLEX', 'BN', 'IR'])].sort(),
    ['QB', 'RB', 'TE', 'WR'],
  );
  assert.equal(
    isPlayerEligibleForDraftRoster({ position: 'LB', fantasy_positions: ['LB'] }, league.roster_positions),
    false,
  );
  assert.equal(
    isPlayerEligibleForDraftRoster({ position: 'LB', fantasy_positions: ['LB'] }, ['QB', 'IDP_FLEX', 'BN']),
    true,
  );
  assert.equal(
    isPlayerEligibleForDraftRoster({ position: 'DE', fantasy_positions: ['DE'] }, ['DL', 'BN']),
    true,
  );
  assert.equal(
    isPlayerEligibleForDraftRoster({ position: 'DST', fantasy_positions: ['DST'] }, ['DEF', 'BN']),
    true,
  );
});

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

test('draft results presentation changes from Picks when the draft starts', () => {
  assert.deepEqual(getDraftResultsPresentation({ status: 'pre_draft' }), {
    phase: 'pre_draft',
    label: 'Picks',
  });
  assert.deepEqual(getDraftResultsPresentation({ status: 'drafting' }), {
    phase: 'results',
    label: 'Results',
  });
  assert.deepEqual(getDraftResultsPresentation({ status: 'complete' }), {
    phase: 'results',
    label: 'Results',
  });
});

test('draft league selection waits for the target season snapshot before rendering', () => {
  assert.equal(isDraftLeagueSelectionReady({ season: '2026', league: { season: '2025' }, seasonSwitching: '2026' }), false);
  assert.equal(isDraftLeagueSelectionReady({ season: '2026', league: { season: '2025' }, seasonSwitching: null }), false);
  assert.equal(isDraftLeagueSelectionReady({ season: '2026', league: { season: '2026' }, seasonSwitching: null }), true);
});

test('draft tour context distinguishes current and historical league years', () => {
  assert.deepEqual(getDraftTourContext({
    selectedSeason: '2026',
    currentSeason: '2026',
    draft: { status: 'pre_draft' },
  }), {
    draftTourState: 'current_pre_draft',
    selectedLeagueSeason: '2026',
    currentLeagueSeason: '2026',
  });
  assert.deepEqual(getDraftTourContext({
    selectedSeason: '2025',
    currentSeason: '2026',
    draft: { status: 'complete' },
  }), {
    draftTourState: 'historical_results',
    selectedLeagueSeason: '2025',
    currentLeagueSeason: '2026',
  });
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
  {
    id: 'wr4',
    name: 'Practice Squad Receiver',
    position: 'WR',
    team: 'DAL',
    status: 'Practice Squad',
    projection: { marketRank: 500 },
    workload: { ppg: 0.4, primaryVolume: 3 },
    draftRoom: { teamNeed: 0.1 },
    draftModel: {
      score: 2,
      components: { marketRank: 1, pastProduction: 1, workload: 1, rosterNeed: 10 },
    },
    rank: {},
  },
  {
    id: 'wr5',
    name: 'Inactive Receiver',
    position: 'WR',
    team: 'LAC',
    raw: { active: false },
    projection: { marketRank: 450 },
    workload: { ppg: 0.2, primaryVolume: 1 },
    draftRoom: { teamNeed: 0.1 },
    draftModel: {
      score: 4,
      components: { marketRank: 1, pastProduction: 1, workload: 1, rosterNeed: 10 },
    },
    rank: {},
  },
  {
    id: 'wr6',
    name: 'Sentinel Receiver',
    position: 'WR',
    team: 'KC',
    projection: { marketRank: 999, marketValue: 0.5 },
    workload: { ppg: 1.8, primaryVolume: 12 },
    draftRoom: { teamNeed: 0.1 },
    draftModel: {
      score: 12,
      components: { marketRank: 1, pastProduction: 8, workload: 10, rosterNeed: 10 },
    },
    rank: {},
  },
  {
    id: 'wr7',
    name: 'Rotational Receiver',
    position: 'WR',
    team: 'SF',
    projection: { marketRank: 75, marketValue: 8.4 },
    workload: { ppg: 7.2, primaryVolume: 66 },
    draftRoom: { teamNeed: 0.32 },
    draftModel: {
      score: 54,
      components: { marketRank: 54, pastProduction: 45, workload: 44, rosterNeed: 32 },
    },
    rank: { tier: 5, trend: { direction: 'flat', label: 'Flat' } },
  },
  {
    id: 'wr8',
    name: 'Rookie Receiver',
    position: 'WR',
    team: 'NYG',
    years_exp: 0,
    projection: { marketRank: 62, marketValue: 12.2 },
    workload: { ppg: 9.9, primaryVolume: 88 },
    draftRoom: { teamNeed: 0.68 },
    draftModel: {
      score: 69,
      components: { marketRank: 61, pastProduction: 50, workload: 52, rosterNeed: 68 },
    },
    rank: { tier: 4, trend: { direction: 'flat', label: 'Flat' } },
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

  assert.equal(scatter.peerCount, 4);
  assert.equal(plottedIds.has('rb1'), true);
  assert.equal(plottedIds.has('wr7'), true);
  assert.equal(plottedIds.has('wr8'), true);
  assert.equal(plottedIds.has('wr3'), false);
  assert.equal(plottedIds.has('wr4'), false);
  assert.equal(plottedIds.has('wr5'), false);
  assert.equal(plottedIds.has('wr6'), false);
  assert.equal(pinned.pinned, true);
  assert.equal(alpha.focused, true);
  assert.equal(alpha.x > beta.x, true);
  assert.equal(scatter.xAxis.minLabel, '#75');
  assert.equal(scatter.xAxis.maxLabel, '#10');
  assert.equal(scatter.referenceLine.kind, 'fair');
  assert.equal(scatter.referenceLine.label, 'Fair value');
  assert.equal(scatter.unavailableCount, 0);
});

test('draft analytics scatter uses a dynamic trend line for non-market rating axis pairs', () => {
  const scatter = buildDraftAnalyticsScatter({
    candidates: analyticsCandidates,
    focusedPlayerId: 'wr1',
    xAxis: 'workload',
    yAxis: 'ppg',
  });

  assert.equal(scatter.referenceLine.kind, 'trend');
  assert.equal(scatter.referenceLine.label, 'Trend');
  assert.notDeepEqual(
    [scatter.referenceLine.x1, scatter.referenceLine.y1, scatter.referenceLine.x2, scatter.referenceLine.y2],
    [0, 0, 100, 100],
  );
});

test('draft analytics supports BALLDONTLIE ADP as a lower-is-better selectable axis', () => {
  const candidates = [
    { ...analyticsCandidates[0], adp: 36.5, draftModel: { ...analyticsCandidates[0].draftModel, components: { ...analyticsCandidates[0].draftModel.components, adp: 88 } } },
    { ...analyticsCandidates[1], adp: 8.2, draftModel: { ...analyticsCandidates[1].draftModel, components: { ...analyticsCandidates[1].draftModel.components, adp: 98 } } },
  ];
  const scatter = buildDraftAnalyticsScatter({
    candidates,
    focusedPlayerId: 'wr1',
    xAxis: 'adp',
    yAxis: 'rating',
  });
  const alpha = scatter.points.find((point) => point.id === 'wr1');
  const beta = scatter.points.find((point) => point.id === 'wr2');
  const snapshot = buildDraftAnalyticsSnapshot(candidates[0], candidates);

  assert.equal(scatter.xAxis.id, 'adp');
  assert.equal(scatter.xAxis.label, 'ADP');
  assert.equal(alpha.x < beta.x, true);
  assert.equal(scatter.xAxis.minLabel, '#37');
  assert.equal(scatter.xAxis.maxLabel, '#8');
  assert.equal(snapshot.find((row) => row.key === 'adp').value, '#37');
  assert.equal(buildDraftAnalyticsCompareRows(candidates).find((row) => row.key === 'adp').cells[1].value, '#8');
});

test('draft analytics presents roster need as a bounded score instead of an impossible percentage', () => {
  const highNeedPlayer = {
    ...analyticsCandidates[0],
    id: 'wr-high-need',
    draftRoom: { teamNeed: 1.45 },
    draftModel: {
      ...analyticsCandidates[0].draftModel,
      components: {
        ...analyticsCandidates[0].draftModel.components,
        rosterNeed: 145,
      },
    },
  };
  const fallbackNeedPlayer = {
    ...analyticsCandidates[1],
    id: 'wr-fallback-need',
    draftRoom: { teamNeed: 1.25 },
    draftModel: {
      ...analyticsCandidates[1].draftModel,
      components: {
        ...analyticsCandidates[1].draftModel.components,
        rosterNeed: undefined,
      },
    },
  };
  const candidates = [highNeedPlayer, fallbackNeedPlayer];
  const snapshot = buildDraftAnalyticsSnapshot(highNeedPlayer, candidates);
  const compareNeed = buildDraftAnalyticsCompareRows(candidates).find((row) => row.key === 'need');
  const scatter = buildDraftAnalyticsScatter({
    candidates,
    focusedPlayerId: highNeedPlayer.id,
    xAxis: 'rosterNeed',
    yAxis: 'rating',
  });

  const snapshotNeed = snapshot.find((row) => row.key === 'need');
  assert.equal(snapshotNeed.label, 'Need');
  assert.equal(snapshotNeed.value, '100/100');
  assert.equal(snapshotNeed.detail, 'Team need score');
  assert.equal(snapshotNeed.score, 100);
  assert.deepEqual(compareNeed.cells.map((cell) => cell.value), ['100/100', '100/100']);
  assert.equal(scatter.xAxis.label, 'Team need');
  assert.equal(scatter.xAxis.domain.max, 100);
  assert.equal(scatter.points.every((point) => point.xRaw >= 0 && point.xRaw <= 100), true);
  assert.equal(scatter.xAxis.minLabel.endsWith('/100'), true);
  assert.equal(scatter.xAxis.maxLabel.endsWith('/100'), true);
  assert.equal(JSON.stringify({ snapshot, compareNeed, scatter }).includes('145%'), false);
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

test('draft analytics treats rookie past production and workload as unavailable', () => {
  const rookie = analyticsCandidates.find((candidate) => candidate.id === 'wr8');
  const snapshot = buildDraftAnalyticsSnapshot(rookie, analyticsCandidates);
  const ppgRow = snapshot.find((row) => row.key === 'ppg');
  const workloadRow = snapshot.find((row) => row.key === 'workload');

  assert.equal(ppgRow.value, 'N/A');
  assert.equal(ppgRow.score, null);
  assert.equal(ppgRow.rank, null);
  assert.equal(workloadRow.value, 'N/A');
  assert.equal(workloadRow.score, null);
  assert.equal(workloadRow.rank, null);
  assert.deepEqual(
    getDraftAnalyticsAxisOptions(rookie).map((option) => option.id),
    ['rating', 'market', 'adp', 'rosterNeed'],
  );

  const scatter = buildDraftAnalyticsScatter({
    candidates: analyticsCandidates,
    focusedPlayerId: 'wr8',
    xAxis: 'workload',
    yAxis: 'ppg',
  });

  assert.equal(scatter.xAxis.id, 'market');
  assert.equal(scatter.yAxis.id, 'rating');
  assert.equal(scatter.points.some((point) => point.id === 'wr8'), true);

  const compareRows = buildDraftAnalyticsCompareRows([rookie]);
  assert.equal(compareRows.find((row) => row.key === 'ppg').cells[0].value, 'N/A');
  assert.equal(compareRows.find((row) => row.key === 'workload').cells[0].value, 'N/A');
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
    espnId: '12345',
    espn_id: '12345',
    sourceIds: { espn: '12345' },
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

test('historical draft attribution prefers the pick manager over a replacement roster owner', () => {
  const pick = normalizeDraftPick({
    picked_by: 'drafting-manager',
    roster_id: '4',
    player_id: 'qb1',
    round: 1,
    pick_no: 1,
  });

  assert.equal(resolveDraftPickManagerId(pick), 'drafting-manager');
  assert.equal(resolveDraftPickManagerId({ rosterId: '4' }), null);
});

test('historical draft attribution rejects a replacement manager missing from the original draft order', () => {
  const pick = normalizeDraftPick({
    picked_by: 'replacement-manager',
    roster_id: '4',
    player_id: 'qb1',
    round: 1,
    pick_no: 1,
  });
  const draft = { draft_order: { 'original-manager': 4 } };

  assert.equal(resolveDraftPickManagerId(pick, draft), null);
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

test('draft assistant excludes positions the league cannot roster from every decision pool', () => {
  const draft = {
    draft_id: 'draft-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const playersWithUnsupportedPositions = {
    ...players,
    lb1: {
      player_id: 'lb1',
      full_name: 'Echo Linebacker',
      position: 'LB',
      fantasy_positions: ['LB'],
      team: 'CHI',
      search_rank: 20,
    },
    k1: {
      player_id: 'k1',
      full_name: 'Foxtrot Kicker',
      position: 'K',
      fantasy_positions: ['K'],
      team: 'BAL',
      search_rank: 30,
    },
  };

  const viewModel = buildDraftAssistantViewModel({
    players: playersWithUnsupportedPositions,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
    boardIds: ['lb1', 'k1', 'wr1'],
  });

  const candidateIds = new Set(viewModel.allCandidates.map((player) => player.id));
  assert.equal(candidateIds.has('lb1'), false);
  assert.equal(candidateIds.has('k1'), false);
  assert.equal(candidateIds.has('wr1'), true);
  assert.equal(viewModel.rankedCandidates.some((player) => player.id === 'lb1'), false);
  assert.equal(viewModel.onClockRecommendation?.id === 'lb1', false);
  assert.deepEqual(viewModel.boardRows.map((player) => player.id), ['wr1']);
  assert.equal(viewModel.bestByPosition.LB, undefined);
  assert.equal(viewModel.bestByPosition.K, undefined);
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

test('draft intelligence uses the completed season before the draft', () => {
  assert.equal(getDraftStatsSeason('2026'), '2025');
  assert.equal(getDraftStatsSeason(2025), '2024');
  assert.equal(getDraftStatsSeason('2017'), '2017');
  assert.equal(getDraftStatsSeason(null), null);
});

test('draft results uses the season played after the historical draft', () => {
  assert.equal(getDraftResultsSeason('2026'), '2026');
  assert.equal(getDraftResultsSeason(2025), '2025');
  assert.equal(getDraftResultsSeason('2017'), '2017');
  assert.equal(getDraftResultsSeason(null), null);
});

test('draft outcomes compare positional draft cost with the matching season finish', () => {
  const outcomePlayers = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => {
      const id = `qb${index + 1}`;
      return [id, { player_id: id, position: 'QB', fantasy_positions: ['QB'] }];
    }),
  );
  const seasonStats = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [`qb${index + 1}`, { pass_yd: (7 - index) * 1000 }]),
  );
  const picks = Array.from({ length: 7 }, (_, index) => ({
    id: `pick-${index + 1}`,
    playerId: `qb${index + 1}`,
    overall: index + 1,
  }));

  const outcomes = computeDraftOutcomes(picks, seasonStats, outcomePlayers, DEFAULT_SCORING);

  assert.deepEqual(outcomes.get('pick-1'), {
    pickId: 'pick-1',
    playerId: 'qb1',
    position: 'QB',
    draftPositionRank: 1,
    seasonFinishRank: 1,
    rankDelta: 0,
    tier: 'Even',
    colorTone: 'neutral',
    tolerance: 3,
  });
  assert.equal(outcomes.get('pick-7').tier, 'Even');

  const topPickFinishedFourth = computeDraftOutcomes(picks, {
    ...seasonStats,
    qb1: { pass_yd: 3500 },
  }, outcomePlayers, DEFAULT_SCORING);
  assert.equal(topPickFinishedFourth.get('pick-1').seasonFinishRank, 4);
  assert.equal(topPickFinishedFourth.get('pick-1').tier, 'Even');

  const boomPlayers = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
      const id = `boom-qb${index + 1}`;
      return [id, { player_id: id, position: 'QB', fantasy_positions: ['QB'] }];
    }),
  );
  const boomPicks = Array.from({ length: 10 }, (_, index) => ({
    id: `boom-pick-${index + 1}`,
    playerId: `boom-qb${index + 1}`,
    overall: index + 1,
  }));
  const boomAndBust = computeDraftOutcomes(boomPicks, {
    ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`boom-qb${index + 1}`, { pass_yd: (10 - index) * 1000 }])),
    'boom-qb1': { pass_yd: 100 },
    'boom-qb10': { pass_yd: 12000 },
  }, boomPlayers, DEFAULT_SCORING);
  assert.equal(boomAndBust.get('boom-pick-10').tier, 'Boom');
  assert.equal(boomAndBust.get('boom-pick-1').tier, 'Bust');
});

test('draft position ranks use the league pick order instead of market rank', () => {
  const players = {
    wr1: { player_id: 'wr1', position: 'WR', fantasy_positions: ['WR'] },
    qb1: { player_id: 'qb1', position: 'QB', fantasy_positions: ['QB'] },
    qb2: { player_id: 'qb2', position: 'QB', fantasy_positions: ['QB'] },
  };
  const ranks = buildDraftPositionRanks([
    { id: 'pick-1', playerId: 'wr1', overall: 1 },
    { id: 'pick-4', playerId: 'qb1', overall: 4 },
    { id: 'pick-11', playerId: 'qb2', overall: 11 },
  ], players);

  assert.deepEqual(ranks.get('pick-4'), { position: 'QB', rank: 1, label: 'QB1' });
  assert.deepEqual(ranks.get('pick-11'), { position: 'QB', rank: 2, label: 'QB2' });
});

test('draft model weights normalize missing and out-of-range values', () => {
  const weights = normalizeDraftModelWeights({
    marketRank: 120,
    pastProduction: -10,
    workload: 45,
  });

  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 100);
  assert.deepEqual(Object.keys(weights), ['marketRank', 'pastProduction', 'scoringFit', 'rosterNeed', 'schedule', 'adp']);
  assert.equal(weights.marketRank, 72);
  assert.equal(weights.pastProduction, 0);
  assert.equal(weights.scoringFit, 14);
  assert.equal(weights.rosterNeed, 7);
  assert.equal(weights.schedule, 7);
  assert.equal(weights.adp, 0);
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
  // Upcoming opponents come from the draft season's own schedule, not the prior season's.
  const upcomingScheduleMap = {
    1: { DAL: { opp: 'NYG', home: true }, NYG: { opp: 'DAL' }, KC: { opp: 'LV', home: true }, LV: { opp: 'KC' } },
    2: { DAL: { opp: 'NYG' }, NYG: { opp: 'DAL', home: true }, KC: { opp: 'LV' }, LV: { opp: 'KC', home: true } },
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
    upcomingScheduleMap,
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
  // This fixture only covers four teams, which is below the coverage floor for percentile
  // tiering — the signal must decline rather than tier off two data points. Full-league
  // schedule behavior is covered in draftScheduleStrength.test.mjs.
  assert.equal(wr.schedule.label, 'Unavailable');
  assert.equal(wr.schedule.value, null);
  assert.equal(wr.draftRoom.boardRank, 1);
  assert.equal(typeof wr.draftModel.score, 'number');
  assert.equal(wr.draftModel.weights.marketRank, DEFAULT_DRAFT_MODEL_WEIGHTS.marketRank);
  assert.deepEqual(Object.keys(wr.draftModel.weights), ['marketRank', 'pastProduction', 'scoringFit', 'rosterNeed', 'schedule', 'adp']);
  assert.equal(wr.draftModel.weights.adp, 0);
  assert.equal(wr.draftModel.components.adp, null);
  assert.equal(wr.draftModel.components.workload != null, true);
  assert.equal(wr.draftModel.components.schedule, null, 'an unavailable schedule must not score as zero');
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

test('BALLDONTLIE ADP stays neutral by default and changes model order only when prioritized', () => {
  const draft = {
    draft_id: 'draft-adp-1',
    type: 'snake',
    status: 'pre_draft',
    settings: { rounds: 4 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const rankingOnlyPlayers = {
    rb1: { ...players.rb1, projected: undefined, search_rank: 10 },
    wr1: { ...players.wr1, projected: undefined, search_rank: 80 },
  };
  const adpByPlayerId = new Map([
    ['rb1', { average_draft_position: 75.4 }],
    ['wr1', { average_draft_position: 4.6 }],
  ]);
  const sharedArgs = {
    players: rankingOnlyPlayers,
    rosters,
    league,
    draft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
  };
  const baseline = buildDraftAssistantViewModel(sharedArgs);
  const neutralAdp = buildDraftAssistantViewModel({ ...sharedArgs, adpByPlayerId });
  const adpWeighted = buildDraftAssistantViewModel({
    ...sharedArgs,
    adpByPlayerId,
    modelWeights: {
      marketRank: 0,
      adp: 100,
      pastProduction: 0,
      scoringFit: 0,
      rosterNeed: 0,
      schedule: 0,
    },
  });

  assert.equal(DEFAULT_DRAFT_MODEL_WEIGHTS.adp, 0);
  assert.equal(neutralAdp.modelWeights.adp, 0);
  assert.equal(neutralAdp.allCandidates.find((player) => player.id === 'rb1').adp, 75.4);
  assert.equal(neutralAdp.allCandidates.find((player) => player.id === 'wr1').adp, 4.6);
  assert.equal(neutralAdp.rankedCandidates[0].id, baseline.rankedCandidates[0].id);
  assert.equal(adpWeighted.rankedCandidates[0].id, 'wr1');
  assert.equal(adpWeighted.rankedCandidates[0].draftModel.components.adp > adpWeighted.rankedCandidates[1].draftModel.components.adp, true);
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

test('draft assistant restricts a Sleeper rookie draft pool to rookies, even for stale-active retired veterans', () => {
  const rookieDraft = {
    draft_id: 'draft-rookie-1',
    type: 'linear',
    status: 'pre_draft',
    season: '2026',
    settings: { rounds: 4, player_type: 1 },
    slot_to_roster_id: { 1: 1, 2: 2, 3: 3 },
  };
  const rookiePoolPlayers = {
    ...players,
    staleRetiredVeteranQb: {
      player_id: 'staleRetiredVeteranQb',
      full_name: 'Stale Retired Veteran Quarterback',
      position: 'QB',
      fantasy_positions: ['QB'],
      team: 'PIT',
      active: true,
      status: 'Active',
      years_exp: 18,
      search_rank: 176,
    },
    rookieWr: {
      player_id: 'rookieWr',
      full_name: 'Foxtrot Rookie Receiver',
      position: 'WR',
      fantasy_positions: ['WR'],
      team: 'CHI',
      active: true,
      status: 'Active',
      years_exp: 0,
      search_rank: 40,
    },
  };

  const viewModel = buildDraftAssistantViewModel({
    players: rookiePoolPlayers,
    rosters,
    league,
    draft: rookieDraft,
    draftPicks: [],
    myRoster: rosters[0],
    scoringSettings: DEFAULT_SCORING,
    season: '2026',
  });

  assert.equal(viewModel.allCandidates.some((player) => player.id === 'staleRetiredVeteranQb'), false);
  assert.equal(viewModel.allCandidates.some((player) => player.id === 'qb1'), false);
  assert.equal(viewModel.allCandidates.some((player) => player.id === 'rookieWr'), true);
});
