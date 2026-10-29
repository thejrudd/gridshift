import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildActivitySeasonGroups } from '../../src/utils/leagueHistory.js';
import { buildSleeperActivityModel } from '../../src/utils/sleeperLeagueAdapter.js';
import {
  buildGridShiftLineupSections,
  buildGridShiftMatchupRows,
  buildGridShiftWeekMatchups,
  buildGridShiftWeekOptions,
  buildPlayerCatalogIndex,
  getGridShiftViewer,
  listGridShiftTeamOptions,
  mapGridShiftPlayers,
  mapGridShiftWeekPoints,
} from '../../src/utils/gridshiftLeagueAdapter.js';
import {
  buildGridShiftActivityEntries,
  diffGridShiftSettings,
  matchesGridShiftActivityFilter,
} from '../../src/utils/gridshiftActivity.js';
import {
  UNPLACED_SLOT,
  checkLineupMove,
  describeLineupRejection,
  listLineupSlots,
  moveLineupPlayer,
  slotAcceptsPosition,
} from '../../src/utils/gridshiftLineup.js';
import { LEAGUE_CAPABILITIES, canUseLeagueCapability } from '../../src/utils/leagueProviderContract.js';

// Stage 5.2 shared league screens: Matchups, Rosters (lineup editing), and
// League Activity for Sleeper and GridShift leagues.

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const textOf = (html) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

// Platform responses captured from a local GridShift platform API (see _note).
const P = JSON.parse(readFileSync(new URL('../fixtures/gridshiftPlatformStage52.json', import.meta.url), 'utf8'));

// ── Sleeper fixtures (SSR parity) ───────────────────────────────────────────

const users = [
  { user_id: 'user-a', display_name: 'Alex', avatar: 'av1', metadata: { team_name: 'Alpha Dogs' } },
  { user_id: 'user-b', display_name: 'Blair', avatar: null, metadata: { team_name: 'Beta Blitz' } },
];
const rosters = [
  { roster_id: 1, owner_id: 'user-a', players: ['p1', 'p2', 'p3', 'p4'], reserve: ['p4'], keepers: ['p2'] },
  { roster_id: 2, owner_id: 'user-b', players: ['p5', 'p6'], reserve: [] },
];
const players = {
  p1: { full_name: 'Quinn Passer', position: 'QB', team: 'KC' },
  p2: { full_name: 'Rex Runner', position: 'RB', team: 'BUF', injury_status: 'Questionable' },
  p3: { full_name: 'Wade Wideout', position: 'WR', team: 'PHI' },
  p4: { full_name: 'Ivan Injured', position: 'WR', team: 'DET', injury_status: 'IR' },
  p5: { full_name: 'Tate Tightend', position: 'TE', team: 'SF' },
  p6: { full_name: 'Dell Lineman', position: 'DL', team: 'DAL' },
};
const seasonStats = {
  p1: { pass_yd: 3000, pass_td: 20, gp: 10 },
  p2: { rush_yd: 800, rush_td: 6, rec: 30, rec_yd: 200, gp: 10 },
  p3: { rec: 60, rec_yd: 900, rec_td: 5, gp: 10 },
};
const scoring = { pass_yd: 0.04, pass_td: 4, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6 };
function sleeperBase() {
  return {
    platform: 'sleeper', season: '2026', selectedLeagueId: 'L1', league: { name: 'Test League', season: '2026', settings: {} },
    leagueUsers: users, rosters, myRoster: () => rosters[0], getUserDisplayName: (id) => users.find((u) => u.user_id === id)?.metadata?.team_name ?? 'Team',
    players, loadPlayers: async () => {}, weeklyStats: {}, seasonStats, loadSeasonStats: async () => {}, statsLoading: false, activeScoringSettings: scoring,
    getTradedPicksForLeague: async () => [], getLeagueDraftsForLeague: async () => [],
  };
}
const snapshot = {
  season: '2026', completed: false, league: { settings: {} }, users,
  rosters: rosters.map(({ roster_id, owner_id }) => ({ roster_id, owner_id })),
  matchupsByWeek: {}, winnersBracket: [], losersBracket: [],
  transactions: [
    { transaction_id: 't1', type: 'trade', status: 'complete', status_updated: 1790000000000, leg: 3, roster_ids: [1, 2], adds: { p3: 2, p5: 1 }, drops: { p3: 1, p5: 2 }, draft_picks: [{ season: '2027', round: 2, roster_id: 1, owner_id: 2, previous_owner_id: 1 }] },
    { transaction_id: 't2', type: 'waiver', status: 'complete', status_updated: 1789000000000, leg: 2, roster_ids: [1], adds: { p6: 1 }, drops: { p4: 1 } },
    { transaction_id: 't3', type: 'free_agent', status: 'complete', status_updated: 1788000000000, leg: 1, roster_ids: [2], adds: { p2: 2 } },
    { transaction_id: 't4', type: 'commissioner', status: 'complete', status_updated: 1787000000000, leg: 1, roster_ids: [1], adds: {}, drops: {} },
    { transaction_id: 't5', type: 'trade', status: 'failed', status_updated: 1786000000000, roster_ids: [1, 2], adds: {}, drops: {} },
  ],
};
const historyBase = { platform: 'sleeper', eligibleLeagueHistory: [{ season: '2026' }], error: '', retry() {} };
const ACTIVITY_HISTORIES = {
  ready: { ...historyBase, season: '2026', snapshots: [snapshot], loading: false },
  loading: { ...historyBase, season: '2026', snapshots: null, loading: true },
  error: { ...historyBase, season: '2026', snapshots: [], loading: false, error: 'Network down' },
  empty: { ...historyBase, season: '2026', snapshots: [{ ...snapshot, transactions: [] }], loading: false },
  espn: { ...historyBase, platform: 'espn', season: '2026', snapshots: [], loading: false },
};
const MEDIA = { desktop: {}, phone: { '(max-width: 480px)': true, '(max-width: 1023px)': true } };

// SHA-256 of the rendered text (tags replaced by '|') from main at 0b818b0,
// before Stage 5.2, with these fixtures. Rosters and Matchups render their
// first (server) pass here, before effects run; their full Sleeper renders are
// compared against main in the browser (see the plan's 5.2 evidence).
const SLEEPER_TEXT_GOLDEN = {
  'rosters-desktop': 'b844527fe00537b4e38286908ffe9b53f4250aac965633a888def5455142a21d',
  'rosters-phone': '83fe1bc6ba73fb051fbb606f9df63dfb2e80eca46505d101560fe9426a03fc4a',
  picks: '84be2f25298e8b7cfc7ad65b183a739657a5b7743083bc1095f826ce72a5617c',
  'activity-ready': 'a2fdb742c57d5b5b857b4b7b239e07eefda01e89346cc6790e768a3aa454a3ef',
  'activity-loading': '4af050e75380dff562b33b9cbba439a69a4c14c2ae36d37bb3442f4e227c5155',
  'activity-error': '77a345ed95011e2873066544f16b950e1338780c8d9c21744c02fbc0dacc8eae',
  'activity-empty': '55584bb3fedac0da2b1e3057303a27faafcb43d47447a3843a8705161aa6e97f',
  'activity-espn': '915317e89b3d2767ae697577db68fab10e4b41b606170eda63e98d394894252c',
  'matchups-initial': 'cbe5cfdf7c2118a9c3d78ef1d684f3afa089201352886449a06a6511cfef74a7',
};

// ── Rendering harness (Vite SSR, app contexts replaced) ─────────────────────

const SLEEPER_EXPORTS = ['AVAILABLE_SLEEPER_SEASONS', 'FantasyBaseOverride', 'FantasyProvider', 'SleeperProvider', 'useFantasy', 'useFantasyLeague', 'useFantasyStats', 'useFantasyBase', 'useFantasyStatsProgress', 'useFantasyStatsEnhancing', 'useSleeper', 'useSleeperBase', 'useSleeperLeague', 'useSleeperStats', 'useSleeperStatsEnhancing', 'useSleeperStatsProgress'];

async function startHarness(root) {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'screens-parity-context',
      enforce: 'pre',
      resolveId(source) {
        if (/\/context\/SleeperContext(?:\.jsx)?$/.test(source)) return '\0sp-sleeper';
        if (/\/context\/ThemeContext(?:\.jsx)?$/.test(source)) return '\0sp-theme';
        if (/\/hooks\/useLeagueHistoryData(?:\.js)?$/.test(source)) return '\0sp-history';
        if (/\/hooks\/useMediaQuery(?:\.js)?$/.test(source)) return '\0sp-media';
        if (/\/context\/LeagueSourceContext(?:\.js)?$/.test(source)) return '\0sp-source';
        if (/\/hooks\/useGridShiftLeague(?:\.js)?$/.test(source)) return '\0sp-gridshift';
      },
      load(id) {
        if (id === '\0sp-sleeper') {
          return [
            "import { createElement, Fragment } from 'react';",
            ...SLEEPER_EXPORTS.map((name) => {
              if (name === 'AVAILABLE_SLEEPER_SEASONS') return "export const AVAILABLE_SLEEPER_SEASONS = ['2026'];";
              if (name === 'FantasyBaseOverride' || name === 'FantasyProvider' || name === 'SleeperProvider') return `export function ${name}({ children }) { return createElement(Fragment, null, children); }`;
              if (/Progress$/.test(name)) return `export function ${name}() { return globalThis.__spProgress ?? null; }`;
              if (/Enhancing$/.test(name)) return `export function ${name}() { return false; }`;
              return `export function ${name}() { return globalThis.__spBase; }`;
            }),
          ].join('\n');
        }
        if (id === '\0sp-theme') return "export function useTheme() { return { darkMode: false, toggleDarkMode() {} }; } export function ThemeProvider({ children }) { return children; } export default {};";
        if (id === '\0sp-history') return 'export default function useLeagueHistoryData() { return globalThis.__spHistory; }';
        if (id === '\0sp-media') return 'export default function useMediaQuery(query) { return Boolean(globalThis.__spMedia?.[query]); }';
        if (id === '\0sp-source') return 'export function useLeagueSource() { return globalThis.__spSource ?? { provider: "sleeper", gridshiftLeague: null }; } export default null;';
        if (id === '\0sp-gridshift') {
          return ['useGridShiftLeagueBase', 'useGridShiftActivity', 'useGridShiftWeekPoints', 'useGridShiftMatchupData', 'useGridShiftMatchupLineups', 'useGridShiftLineupEditor']
            .map((name) => `export function ${name}(...args) { return globalThis.__spGridShift?.${name}?.(...args); }`).join('\n');
        }
      },
    }],
  });
  const load = async (path) => (await server.ssrLoadModule(path)).default;
  return {
    server,
    CompanionLeague: await load('/src/components/companion/CompanionLeague.jsx'),
    CompanionActivity: await load('/src/components/companion/CompanionActivity.jsx'),
    CompanionMatchup: await load('/src/components/companion/CompanionMatchup.jsx'),
    render(Component, props = {}, { base = null, history = null, source = null, media = null, gridshift = null } = {}) {
      globalThis.__spBase = base;
      globalThis.__spHistory = history;
      globalThis.__spSource = source;
      globalThis.__spMedia = media;
      globalThis.__spGridShift = gridshift;
      return renderToStaticMarkup(createElement(Component, props));
    },
  };
}

let h;
before(async () => {
  h = await startHarness(new URL('../..', import.meta.url).pathname);
});
after(async () => {
  await h?.server.close();
  for (const key of ['__spBase', '__spHistory', '__spSource', '__spMedia', '__spGridShift', '__spProgress']) delete globalThis[key];
});

const matchupBase = () => ({ ...sleeperBase(), currentFantasyWeek: 3, loadMatchups: async () => [], scheduleMap: {}, statsBySeason: {}, linkedLeagueHistory: [], linkedLeagueSeasonOptions: ['2026'], espnIdOverrides: {}, loadStatsForSeason: async () => {}, scoringOverride: null });

// ── Sleeper parity ──────────────────────────────────────────────────────────

test('Sleeper Rosters, League Activity, and Matchups text is unchanged from main', () => {
  const rendered = {
    'rosters-desktop': h.render(h.CompanionLeague, { routeState: { subView: 'roster', rosterId: '1' }, onTradePlayer() {} }, { base: sleeperBase(), media: MEDIA.desktop }),
    'rosters-phone': h.render(h.CompanionLeague, { routeState: { subView: 'roster', rosterId: '1' }, onTradePlayer() {} }, { base: sleeperBase(), media: MEDIA.phone }),
    picks: h.render(h.CompanionLeague, { routeState: { subView: 'picks' } }, { base: sleeperBase(), media: {} }),
    'matchups-initial': h.render(h.CompanionMatchup, {}, { base: matchupBase(), history: ACTIVITY_HISTORIES.ready, media: {} }),
  };
  for (const [name, history] of Object.entries(ACTIVITY_HISTORIES)) {
    rendered[`activity-${name}`] = h.render(h.CompanionActivity, {}, { base: sleeperBase(), history, media: {} });
  }
  for (const [name, digest] of Object.entries(SLEEPER_TEXT_GOLDEN)) {
    assert.equal(sha256(textOf(rendered[name])), digest, `${name} text changed`);
  }
});

test('the Sleeper activity model is the leagueHistory activity groups, unchanged', () => {
  const model = buildSleeperActivityModel(ACTIVITY_HISTORIES.ready, players);
  assert.equal(model.provider, 'sleeper');
  assert.equal(model.status, 'ready');
  assert.equal(model.hideCommissionerByDefault, true);
  assert.deepEqual(model.entries, buildActivitySeasonGroups(ACTIVITY_HISTORIES.ready.snapshots, players)[0].entries);
  assert.equal(buildSleeperActivityModel(ACTIVITY_HISTORIES.loading, players).status, 'loading');
  assert.equal(buildSleeperActivityModel(ACTIVITY_HISTORIES.error, players).status, 'error');
  assert.equal(buildSleeperActivityModel(ACTIVITY_HISTORIES.empty, players).status, 'empty');
  assert.equal(buildSleeperActivityModel(ACTIVITY_HISTORIES.espn, players).status, 'unsupported');
});

test('capabilities: GridShift Matchups, Rosters, lineup editing, and Activity are read through the contract', () => {
  for (const capability of [LEAGUE_CAPABILITIES.MATCHUPS, LEAGUE_CAPABILITIES.ROSTERS, LEAGUE_CAPABILITIES.LINEUP_EDITING, LEAGUE_CAPABILITIES.ACTIVITY, LEAGUE_CAPABILITIES.STANDINGS]) {
    assert.equal(canUseLeagueCapability('gridshift', capability), true, capability);
  }
  assert.equal(canUseLeagueCapability('gridshift', LEAGUE_CAPABILITIES.HISTORY), false);
  assert.equal(canUseLeagueCapability('sleeper', LEAGUE_CAPABILITIES.ACTIVITY), true);
  assert.equal(canUseLeagueCapability('sleeper', LEAGUE_CAPABILITIES.LINEUP_EDITING), false);
});

// ── Lineup rules (client side: arrangement and offered moves only) ──────────

const LINEUP = { QB: ['qb'], RB: ['rb1', null], WR: ['wr1', 'wr2'], FLEX: ['te2'], TE: ['te1'], BENCH: ['rb2'], IR: [null] };
const POS = { qb: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', te1: 'TE', te2: 'TE', new: 'RB' };
const positionOf = (id) => POS[id];

test('lineup moves swap occupants, fill empty slots, and place unplaced players', () => {
  assert.deepEqual(moveLineupPlayer(LINEUP, { type: 'BENCH', index: 0 }, { type: 'RB', index: 1 }).RB, ['rb1', 'rb2']);
  assert.deepEqual(moveLineupPlayer(LINEUP, { type: 'BENCH', index: 0 }, { type: 'RB', index: 1 }).BENCH, [null]);
  const swapped = moveLineupPlayer(LINEUP, { type: 'RB', index: 0 }, { type: 'BENCH', index: 0 });
  assert.deepEqual([swapped.RB[0], swapped.BENCH[0]], ['rb2', 'rb1']);
  assert.deepEqual(moveLineupPlayer(LINEUP, { type: UNPLACED_SLOT, index: 0, playerId: 'new' }, { type: 'RB', index: 1 }).RB, ['rb1', 'new']);
  assert.deepEqual(LINEUP.RB, ['rb1', null], 'the input is not mutated');
  assert.deepEqual(listLineupSlots(LINEUP).map((slot) => slot.type), ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BENCH', 'IR']);
  assert.equal(slotAcceptsPosition('FLEX', 'TE'), true);
  assert.equal(slotAcceptsPosition('FLEX', 'QB'), false);
});

test('only plausible moves are offered: locks, slot positions, IR eligibility', () => {
  const check = (from, to, extra = {}) => checkLineupMove({ assignment: LINEUP, from, to, positionOf, ...extra });
  assert.equal(check({ type: 'BENCH', index: 0 }, { type: 'RB', index: 1 }).ok, true);
  assert.equal(check({ type: 'BENCH', index: 0 }, { type: 'QB', index: 0 }).ok, false);
  assert.match(check({ type: 'RB', index: 0 }, { type: 'BENCH', index: 0 }, { lockedIds: ['rb1'] }).reason, /Locked/);
  assert.match(check({ type: 'BENCH', index: 0 }, { type: 'RB', index: 0 }, { lockedIds: ['rb1'] }).reason, /Locked/);
  assert.equal(check({ type: 'FLEX', index: 0 }, { type: 'WR', index: 0 }).ok, false, 'a TE cannot take a WR slot');
  assert.match(check({ type: 'BENCH', index: 0 }, { type: 'IR', index: 0 }).reason, /Not eligible for IR/);
  assert.equal(check({ type: 'BENCH', index: 0 }, { type: 'IR', index: 0 }, { irEligibleIds: ['rb2'] }).ok, true);
  // An unplaced locked player may still be placed; the platform decides.
  assert.equal(check({ type: UNPLACED_SLOT, index: 0, playerId: 'new' }, { type: 'RB', index: 1 }, { lockedIds: ['new'] }).ok, true);
});

test('a refused save is described with the connected platform\'s name and each rule it named', () => {
  const described = describeLineupRejection({
    message: 'That lineup breaks the league rules.',
    violations: [{ message: 'Patrick Mahomes is locked in QB slot 1; their game has started.' }, { message: 'Patrick Mahomes is locked in QB slot 1; their game has started.' }],
  }, 'GridShift');
  assert.deepEqual(described, {
    title: 'GridShift did not accept that lineup change.',
    message: 'That lineup breaks the league rules.',
    details: ['Patrick Mahomes is locked in QB slot 1; their game has started.'],
  });
  assert.equal(describeLineupRejection({ message: '' }, 'Other').title, 'Other did not accept that lineup change.');
});

// ── GridShift mapping (captured platform responses) ─────────────────────────

const PLAYERS = mapGridShiftPlayers(P.directory);
const viewer = getGridShiftViewer(P);
const teamByName = Object.fromEntries(P.teams.teams.map((team) => [team.name, team.id]));
const idOf = (name) => P.directory.players.find((player) => player.name === name)?.playerId;

test('platform players map with injury, ranks, and owner; catalog matches only by identity', () => {
  const mahomes = PLAYERS.get(idOf('Patrick Mahomes'));
  assert.equal(mahomes.position, 'QB');
  assert.equal(mahomes.nflTeam, 'KC');
  assert.equal(mahomes.positionRank, 1);
  assert.equal(mahomes.sleeperId, '', 'no catalog: no core id, so the platform uuid never reaches core\'s catalog');
  assert.equal(PLAYERS.get(idOf('Christian McCaffrey')).injuryStatus, 'Injured Reserve');
  assert.equal(PLAYERS.get(idOf('Khalil Shakir')).injuryStatus, 'Questionable');
  const catalog = {
    4046: { full_name: 'Patrick Mahomes', team: 'KC', position: 'QB' },
    9999: { full_name: 'Josh Allen', team: 'BUF', position: 'QB' },
    9998: { full_name: 'Josh Allen', team: 'BUF', position: 'QB' },
  };
  const matched = mapGridShiftPlayers(P.directory, { catalogIndex: buildPlayerCatalogIndex(catalog) });
  assert.equal(matched.get(idOf('Patrick Mahomes')).sleeperId, '4046');
  assert.equal(matched.get(idOf('Josh Allen')).sleeperId, '', 'ambiguous catalog identities never match');
});

test('the viewer manages one team and edits only it unless commissioner', () => {
  assert.equal(viewer.role, 'commissioner');
  assert.equal(viewer.teamId, teamByName['Supercalifragilisticexpialidocious Blitz']);
  assert.equal(viewer.canEditTeam(teamByName['Casey at the Bat']), true);
  const manager = getGridShiftViewer({ ...P, league: { ...P.league, viewerRole: 'manager' } });
  assert.equal(manager.canEditTeam(teamByName['Casey at the Bat']), false);
  assert.equal(manager.canEditTeam(viewer.teamId), true);
  assert.deepEqual(listGridShiftTeamOptions(P.teams, viewer).map((option) => [option.name, option.isMe]), [
    ['Supercalifragilisticexpialidocious Blitz', true], ['Blair Witch Blitz', false], ['Casey at the Bat', false], ['Drew Brees Knees', false],
  ]);
});

test('lineup sections follow the platform slot order with locks, IR reasons, and mid-week changes', () => {
  const blair = teamByName['Blair Witch Blitz'];
  const view = P.lineups[blair][7];
  const sections = buildGridShiftLineupSections(view, PLAYERS, mapGridShiftWeekPoints(P.points[7]), { teamId: blair });
  assert.deepEqual(sections.map((section) => section.label), ['QB', 'RB', 'WR', 'TE', 'W/R/T', 'DL', 'LB', 'DB', 'Bench', 'IR', 'Not in lineup']);
  const ir = sections.find((section) => section.type === 'IR').rows[0];
  assert.equal(ir.player.name, 'Christian McCaffrey');
  assert.equal(ir.irEligible, true);
  assert.match(ir.irMessage, /Eligible for an injury slot: status IR/);
  assert.equal(sections.find((section) => section.type === 'RB').rows[0].player, null, 'the slot McCaffrey left is empty');
  assert.deepEqual(sections.at(-1).rows.map((row) => row.player.name), ['Zamir White'], 'added after the week started: in no slot');
  assert.equal(sections.find((section) => section.type === 'QB').rows[0].locked, true);
  // The commissioner's week-7 lineup still holds Shakir, traded away mid-week.
  const mine = buildGridShiftLineupSections(P.lineups[viewer.teamId][7], PLAYERS, new Map(), { teamId: viewer.teamId });
  const shakir = mine.flatMap((section) => section.rows).find((row) => row.player?.name === 'Khalil Shakir');
  assert.equal(shakir.leftRoster, true);
  assert.deepEqual(mine.at(-1).rows.map((row) => row.player.name), ['Amon-Ra St. Brown']);
});

test('week matchups put the viewer on the left with totals, adjustments, and records', () => {
  const week6 = buildGridShiftWeekMatchups({ ...P, viewer, week: 6 });
  assert.equal(week6[0].mine.isViewer, true);
  assert.equal(week6[0].mine.adjustments, 4.5);
  assert.equal(week6[0].mine.total, 117.96);
  assert.equal(week6[0].status, 'final');
  const week7 = buildGridShiftWeekMatchups({ ...P, viewer, week: 7 });
  assert.equal(week7[0].status, 'provisional');
  assert.deepEqual(week7[0].mine.record, { wins: 2, losses: 0, ties: 0, pointsFor: 257.74, pointsAgainst: 241.46 });
  const weeks = buildGridShiftWeekOptions(P.weeks);
  assert.deepEqual(weeks.options.map((option) => option.week), [5, 6, 7, 8, 9]);
  assert.equal(weeks.currentWeek, 7);
  assert.equal(weeks.championshipWeek, 9);
});

test('matchup rows pair slots with week points; a player no longer rostered keeps the points list name', () => {
  const [matchup] = buildGridShiftWeekMatchups({ ...P, viewer, week: 7 });
  const rows = buildGridShiftMatchupRows({
    mineLineup: P.lineups[matchup.mine.teamId][7],
    opponentLineup: P.lineups[matchup.opponent.teamId][7],
    points: P.points[7],
    players: PLAYERS,
    weekStatus: 'in_progress',
  });
  assert.equal(rows[0].slotLabel, 'QB');
  assert.equal(rows[0].mine.name, 'Patrick Mahomes');
  assert.equal(rows[0].mine.weekPts, 4.32);
  assert.equal(rows[0].mine.gameStarted, true);
  assert.equal(rows[0].mine.oppTeam, 'BUF');
  const bench = rows.find((row) => row.slotType === 'BENCH');
  assert.equal(bench.bench, true);
  assert.equal(bench.opponent.name, 'Keon Coleman', 'dropped on waivers after the week began; named from the week\'s points');
});

// ── GridShift League Activity ───────────────────────────────────────────────

const ENTRIES = buildGridShiftActivityEntries({ activity: P.activity, teams: P.teams, players: PLAYERS, season: '2026' });
const entry = (label) => ENTRIES.find((item) => item.label === label);

test('activity covers trades, waivers, free agents, draft, settings, adjustments, lock changes, and commissioner changes', () => {
  const trade = entry('Trade completed');
  assert.equal(trade.type, 'trade');
  assert.deepEqual(trade.adds.map((asset) => [asset.playerName, asset.team.teamName]).sort(), [
    ['Amon-Ra St. Brown', 'Supercalifragilisticexpialidocious Blitz'], ['Khalil Shakir', 'Casey at the Bat'],
  ]);
  const waiver = entry('Waiver claim awarded');
  assert.deepEqual([waiver.adds[0].playerName, waiver.drops[0].playerName], ['Brock Purdy', 'Keon Coleman']);
  const freeAgents = ENTRIES.filter((item) => item.type === 'free_agent');
  assert.deepEqual(freeAgents.map((item) => [item.adds.map((a) => a.playerName), item.drops.map((a) => a.playerName)]), [
    [['Jalen Tolbert'], ['Brock Purdy']], [['Zamir White'], []],
  ]);
  const draft = entry('Draft complete');
  assert.equal(draft.adds.length, 44);
  assert.equal(draft.adds[0].playerName, 'Patrick Mahomes');
  assert.equal(entry('Draft set up').description, 'Snake order · 11 rounds · 1 h per pick');
  // Lineup and IR-slot moves are not activity (user decision, 2026-10-29), even when a commissioner sets them.
  assert.ok(P.activity.activity.some((row) => row.kind === 'lineup.set_by_commissioner'));
  assert.equal(ENTRIES.some((item) => /lineup|IR move/i.test(item.label)), false);
  const adjustment = entry('Score adjusted');
  assert.deepEqual(adjustment.changes, [{ label: 'Supercalifragilisticexpialidocious Blitz total', before: '113.46', after: '117.96' }]);
  assert.equal(adjustment.description, '+4.50 points · Stat correction: missed sack credit');
  const locks = ENTRIES.filter((item) => item.label === 'Roster lock changed');
  assert.deepEqual(locks.map((item) => item.changes[0].after), ['Allowed', 'Blocked']);
  const settings = ENTRIES.find((item) => item.label === 'League settings changed' && item.tags.includes('ir'));
  assert.deepEqual(settings.changes, [
    { label: 'IR: Questionable eligible', before: 'Off', after: 'On' },
    { label: 'Trade deadline', before: 'Week 14', after: 'Week 12' },
  ]);
  assert.deepEqual(entry('Role changed').changes, [{ label: 'casey', before: 'Manager', after: 'Commissioner' }]);
  assert.deepEqual(entry('Team renamed').changes[0].before.startsWith('Team '), true);
  // Negotiation and private claims stay out.
  for (const kind of ['trade.proposed', 'waivers.processed']) assert.ok(P.activity.activity.some((row) => row.kind === kind), kind);
  assert.equal(ENTRIES.some((item) => /proposed/i.test(item.label)), false);
  assert.ok(ENTRIES.every((item, index) => index === 0 || ENTRIES[index - 1].timestamp >= item.timestamp), 'newest first');
});

test('activity filters use the GridShift tags', () => {
  const count = (filter) => ENTRIES.filter((item) => matchesGridShiftActivityFilter(item, filter)).length;
  assert.equal(count('all'), ENTRIES.length);
  assert.equal(count('trade'), 1);
  assert.equal(count('waiver'), 1);
  assert.equal(count('free_agent'), 2);
  assert.equal(count('settings'), 4, 'four league settings changes, two of them roster-lock changes');
  assert.equal(ENTRIES.filter((item) => item.tags.includes('lock')).length, 3, 'two roster-lock changes and the freeze change');
  assert.ok(count('commissioner') >= 8);
});

test('settings diffs read before/after as the platform recorded them', () => {
  const diff = diffGridShiftSettings(
    { settings: { injury: { ineligiblePolicy: 'lock_roster_moves' }, roster: { slots: { FLEX: 1 } } } },
    { settings: { injury: { ineligiblePolicy: 'warn_only' }, roster: { slots: { FLEX: 2 } } } },
  );
  assert.deepEqual(diff.changes, [
    { label: 'IR policy', before: 'Lock roster moves', after: 'Warn only' },
    { label: 'W/R/T slots', before: '1', after: '2' },
  ]);
  assert.equal(diff.ir, true);
  assert.equal(diff.lock, false);
});

// ── The same screens on a GridShift league (no Sleeper data) ────────────────

const SOURCE = { provider: 'gridshift', gridshiftLeague: { provider: 'gridshift', leagueId: P.league.league.id, name: 'Rudd Pilot League', season: '2026' } };
const ready = (data) => ({ status: 'ready', data, error: '', retry() {} });
function gridshiftHooks({ editor = {} } = {}) {
  return {
    useGridShiftLeagueBase: () => ({ ...ready({ league: P.league, teams: P.teams, weeks: P.weeks, directory: P.directory, session: P.session }), players: PLAYERS, viewer, catalogIndex: null }),
    useGridShiftMatchupData: () => ready({ matchups: P.matchups, standings: P.standings }),
    useGridShiftMatchupLineups: (leagueId, week, teamIds) => ready(Object.fromEntries(teamIds.map((id) => [id, P.lineups[id]?.[week]]))),
    useGridShiftWeekPoints: () => ready(P.points[7]),
    useGridShiftActivity: () => ({ provider: 'gridshift', status: 'ready', season: '2026', error: '', retry() {}, entries: ENTRIES, filters: [{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft' }], hideCommissionerByDefault: false }),
    useGridShiftLineupEditor: ({ teamId, week }) => ({ status: 'ready', error: '', retry() {}, lineup: P.lineups[teamId]?.[week] ?? null, saving: false, rejection: null, clearRejection() {}, warnings: [], move() {}, ...editor }),
  };
}
const SLEEPER_ONLY_TEXT = ['Alpha Dogs', 'Beta Blitz', 'Quinn Passer', 'Rex Runner', 'Sleeper'];

test('League Activity renders a GridShift league with before/after rows and no lineup moves or Sleeper data', () => {
  const html = h.render(h.CompanionActivity, {}, { base: sleeperBase(), history: ACTIVITY_HISTORIES.ready, source: SOURCE, gridshift: gridshiftHooks() });
  assert.match(html, /<strong>24 events<\/strong> in the <strong>2026<\/strong> season\./);
  assert.equal(html.includes('IR move'), false);
  assert.match(html, /Roster lock changed/);
  assert.match(html, /league-activity-changes__before" title="Blocked">Blocked<\/span>.*league-activity-changes__after" title="Allowed">Allowed<\/strong>/s);
  assert.match(html, /Drafted by/);
  assert.match(html, /<strong title="Supercalifragilisticexpialidocious Blitz">Supercalifragilisticexpialidocious Blitz<\/strong>/);
  assert.equal(html.includes('Commissioner · '), false, 'commissioner changes are shown, not hidden behind a toggle');
  for (const text of SLEEPER_ONLY_TEXT) assert.equal(html.includes(text), false, text);
});

test('Rosters renders the GridShift lineup with locks, IR reasons, and Move controls for the viewer', () => {
  const html = h.render(h.CompanionLeague, { routeState: { subView: 'roster' } }, { base: sleeperBase(), source: SOURCE, media: MEDIA.desktop, gridshift: gridshiftHooks() });
  assert.match(html, /Week 7 lineup/);
  assert.match(html, /Supercalifragilisticexpialidocious Blitz \(Me\)/);
  assert.match(html, /aria-label="Patrick Mahomes is locked: game started"/);
  assert.match(html, /aria-label="Move Khalil Shakir"/);
  assert.match(html, /Left roster/);
  assert.match(html, /Not in lineup/);
  assert.match(html, /aria-label="Move Amon-Ra St\. Brown"/);
  assert.match(html, /Empty IR/);
  for (const text of SLEEPER_ONLY_TEXT) assert.equal(html.includes(text), false, text);
  const picks = h.render(h.CompanionLeague, { routeState: { subView: 'picks' } }, { base: sleeperBase(), source: SOURCE, media: {}, gridshift: gridshiftHooks() });
  assert.match(picks, /Draft picks are not available for this league yet\./);
});

test('a refused lineup change shows the platform\'s reason plainly', () => {
  const rejection = describeLineupRejection({ message: 'That lineup breaks the league rules.', violations: [{ message: 'Player Zamir White must be in a slot.' }] }, 'GridShift');
  const html = h.render(h.CompanionLeague, { routeState: { subView: 'roster' } }, { base: sleeperBase(), source: SOURCE, media: MEDIA.phone, gridshift: gridshiftHooks({ editor: { rejection, saving: true } }) });
  assert.match(html, /role="alert"[^>]*>.*GridShift did not accept that lineup change\..*That lineup breaks the league rules\..*Player Zamir White must be in a slot\./s);
  assert.match(html, /Saving…/);
});

test('Matchups renders a GridShift week with totals, records, and slot rows', () => {
  const html = h.render(h.CompanionMatchup, { selectedWeek: 6 }, { base: matchupBase(), source: SOURCE, media: {}, gridshift: gridshiftHooks() });
  assert.match(html, /Week 6/);
  assert.match(html, /title="Supercalifragilisticexpialidocious Blitz">Supercalifragilisticexpialidocious Blitz</);
  assert.match(html, />117\.96</);
  assert.match(html, /Final score/);
  assert.match(html, /\+4\.50 commissioner adjustment/);
  const live = h.render(h.CompanionMatchup, {}, { base: matchupBase(), source: SOURCE, media: {}, gridshift: gridshiftHooks() });
  assert.match(live, /Week 7/);
  assert.match(live, /Live score/);
  assert.match(live, /Patrick Mahomes/);
  assert.match(live, />4\.32</);
  for (const text of SLEEPER_ONLY_TEXT) assert.equal(live.includes(text), false, text);
});

test('GridShift screen states are plain and provider-neutral', () => {
  const loading = { ...gridshiftHooks(), useGridShiftLeagueBase: () => ({ status: 'loading', data: null, error: '', retry() {}, players: new Map(), viewer: null }) };
  assert.match(h.render(h.CompanionLeague, { routeState: { subView: 'roster' } }, { base: sleeperBase(), source: SOURCE, media: {}, gridshift: loading }), /Loading rosters\.\.\./);
  const signedOut = { ...gridshiftHooks(), useGridShiftLeagueBase: () => ({ status: 'signed-out', data: null, error: '', retry() {}, players: new Map(), viewer: null }) };
  assert.match(h.render(h.CompanionMatchup, {}, { base: matchupBase(), source: SOURCE, media: {}, gridshift: signedOut }), /Sign in to view this league\./);
  const errored = { ...gridshiftHooks(), useGridShiftActivity: () => ({ provider: 'gridshift', status: 'error', season: '2026', error: 'GridShift could not be reached.', retry() {}, entries: [], filters: [], hideCommissionerByDefault: false }) };
  const html = h.render(h.CompanionActivity, {}, { base: sleeperBase(), history: ACTIVITY_HISTORIES.ready, source: SOURCE, gridshift: errored });
  assert.match(html, /League activity is unavailable right now\.[\s\S]*GridShift could not be reached\.[\s\S]*Try again/);
  assert.equal(html.includes('Sleeper'), false);
});
