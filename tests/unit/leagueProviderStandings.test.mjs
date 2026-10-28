import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildFinalPlacements, buildSeasonStandings, normalizeSeasonBrackets } from '../../src/utils/leagueHistory.js';
import { buildSleeperStandingsModel, mapSleeperLeagueSummary } from '../../src/utils/sleeperLeagueAdapter.js';
import {
  buildGridShiftRecentForm,
  buildGridShiftStandingsModel,
  getGridShiftThroughWeek,
  mapGridShiftLeagueSummary,
  mapGridShiftTeams,
} from '../../src/utils/gridshiftLeagueAdapter.js';
import { LEAGUE_CAPABILITIES, canUseLeagueCapability, getLeagueProvider } from '../../src/utils/leagueProviderContract.js';
import { isGridShiftPlatformConfigured, listGridShiftLeagues } from '../../src/api/gridshiftPlatformApi.js';

// ── Sleeper fixtures ────────────────────────────────────────────────────────

const users = [
  { user_id: 'user-a', display_name: 'Alex', metadata: { team_name: 'Alpha' } },
  { user_id: 'user-b', display_name: 'Blair', metadata: { team_name: 'Beta' } },
  { user_id: 'user-c', display_name: 'Casey', metadata: { team_name: 'Gamma' } },
  { user_id: 'user-d', display_name: 'Drew' },
];
const rosters = users.map((user, index) => ({ roster_id: index + 1, owner_id: user.user_id }));
const week = (pairs) => pairs.flatMap(([a, pa, b, pb], m) => [
  { matchup_id: m + 1, roster_id: a, points: pa },
  { matchup_id: m + 1, roster_id: b, points: pb },
]);
const currentSnapshot = {
  season: '2026',
  completed: false,
  league: { settings: { last_scored_leg: 3, playoff_week_start: 15, playoff_teams: 2 } },
  users,
  rosters,
  matchupsByWeek: {
    1: week([[1, 110.5, 2, 95], [3, 88, 4, 88]]),
    2: week([[1, 90, 3, 120.25], [2, 101, 4, 99]]),
    3: week([[1, 130, 4, 70], [2, 80, 3, 81]]),
  },
  winnersBracket: [],
  losersBracket: [],
  transactions: [],
};
const completedSnapshot = {
  season: '2025',
  completed: true,
  league: { settings: { last_scored_leg: 4, playoff_week_start: 4, playoff_teams: 2 }, metadata: {} },
  users,
  rosters,
  matchupsByWeek: {
    1: week([[1, 110, 2, 95], [3, 88, 4, 90]]),
    2: week([[1, 90, 3, 120], [2, 101, 4, 99]]),
    3: week([[1, 130, 3, 70], [2, 80, 4, 81]]),
    4: week([[1, 100, 3, 90], [2, 85, 4, 84]]),
  },
  winnersBracket: [{ r: 1, m: 1, t1: 1, t2: 3, w: 1, l: 3, p: 1 }],
  losersBracket: [{ r: 1, m: 2, t1: 2, t2: 4, w: 2, l: 4, p: 3 }],
  transactions: [],
};
const historyBase = { platform: 'sleeper', eligibleLeagueHistory: [{ season: '2026' }], error: '', retry() {} };
const SLEEPER_HISTORIES = {
  current: { ...historyBase, season: '2026', snapshots: [currentSnapshot], loading: false },
  completed: { ...historyBase, season: '2025', eligibleLeagueHistory: [{ season: '2025' }, { season: '2024' }], snapshots: [completedSnapshot], loading: false },
  loading: { ...historyBase, season: '2026', snapshots: null, loading: true },
  error: { ...historyBase, season: '2026', snapshots: [], loading: false, error: 'Network down' },
  empty: { ...historyBase, season: '2026', snapshots: [{ ...currentSnapshot, matchupsByWeek: {}, league: { settings: { last_scored_leg: 0 } } }], loading: false },
  espn: { ...historyBase, platform: 'espn', season: '2026', snapshots: [], loading: false },
};

// SHA-256 of CompanionStandings' markup for each fixture, rendered from the
// component as it was on main at 9c8b5bd (before the provider contract). The
// Sleeper path must keep producing exactly this markup.
const SLEEPER_GOLDEN = {
  current: '2b65fe46eb5e6d5932a0b5d549908b7f855697978346c64ece15681663f18960',
  completed: 'b2cc3b1d8203ca36dbf160ea7df194b24420ca76dfddbc8205c4ccae2541ff04',
  loading: '56804c25b2b66db34232f581d28e255078f9f5bc626a9a40f6a5f96f7b8cf395',
  error: '3e325414ea40a46c84555ae21c65467d23895ff7e75cbee614c8100816bdcc04',
  empty: '23b37b1406bf3b3931ca486d697ffc16456f827fd781f8d83fd45d448bdaf100',
  espn: 'a7df2201e63457121fac0fa44509f1fa0f129e68793cfbdbb7f9cfab27b48de8',
};

// ── GridShift platform fixture ──────────────────────────────────────────────
// Responses captured from a local platform API (branch
// phase-3.4-transaction-screens) after seeding a four-team league through its
// HTTP API and finalizing weeks 5 to 7; rosters and timestamps trimmed.

const TEAM = {
  gamblers: 'b18ee0ca-5149-4b2c-8179-606f68cf2e42',
  casey: '083c7dcd-07c2-4cb1-a796-26b51c92a51c',
  blair: 'e9064e53-200f-4991-b438-94f39e6abae5',
  drew: '0416c264-5ad4-4fc0-aff5-03e65b00eb41',
};
const USER = { jrudd: 'F7Wf6AvrsJ7pfGWUPl5NDf9rjFe3Z8jI', casey: 'gQxe4KwrPgixK1Fw42KsimZPGtrZNDZg', blair: 'NReWxM6M9lWxwbNzytO1xHMJd4mjYce6', drew: 'qTzbe7SSKbquwtOCopLF4m6xrDGCJh1S' };
const side = (teamId, total) => ({ teamId, providerPoints: total, adjustments: 0, total });
const PLATFORM = {
  leagues: { leagues: [{ id: '83911f56-09ef-4b4a-a5a0-48f135d94dd0', name: 'Rudd Pilot League', season: 2026, role: 'commissioner' }] },
  league: {
    league: { id: '83911f56-09ef-4b4a-a5a0-48f135d94dd0', name: 'Rudd Pilot League', season: 2026, maxMembers: 4 },
    viewerRole: 'commissioner',
    members: Object.entries(USER).map(([username, userId], index) => ({ userId, username, role: index === 0 ? 'commissioner' : 'manager', joinedAt: '2026-10-28T02:58:12.397Z' })),
  },
  teams: {
    teams: [
      { id: TEAM.gamblers, name: 'Gridiron Gamblers', managerUserId: USER.jrudd, managerUsername: 'jrudd', roster: [] },
      { id: TEAM.casey, name: 'Casey at the Bat', managerUserId: USER.casey, managerUsername: 'casey', roster: [] },
      { id: TEAM.blair, name: 'Blair Witch Blitz', managerUserId: USER.blair, managerUsername: 'blair', roster: [] },
      { id: TEAM.drew, name: 'Drew Brees Knees', managerUserId: USER.drew, managerUsername: 'drew', roster: [] },
    ],
  },
  standings: {
    standings: [
      { rank: 1, teamId: TEAM.drew, wins: 2, losses: 1, ties: 0, pointsFor: 289.72, pointsAgainst: 292.18, gamesPlayed: 3 },
      { rank: 2, teamId: TEAM.blair, wins: 2, losses: 1, ties: 0, pointsFor: 259.94, pointsAgainst: 261.3, gamesPlayed: 3 },
      { rank: 3, teamId: TEAM.casey, wins: 1, losses: 2, ties: 0, pointsFor: 267.88, pointsAgainst: 258.98, gamesPlayed: 3 },
      { rank: 4, teamId: TEAM.gamblers, wins: 1, losses: 2, ties: 0, pointsFor: 254.42, pointsAgainst: 259.5, gamesPlayed: 3 },
    ],
  },
  weeks: {
    season: 2026,
    startWeek: 5,
    championshipWeek: 8,
    currentWeek: 8,
    weeks: [
      { week: 5, status: 'final', leagueWeek: 'regular' },
      { week: 6, status: 'final', leagueWeek: 'regular' },
      { week: 7, status: 'final', leagueWeek: 'regular' },
      { week: 8, status: 'upcoming', leagueWeek: 'championship' },
    ],
  },
  matchups: {
    matchups: [
      { id: 'm5a', week: 5, kind: 'regular', status: 'final', home: side(TEAM.gamblers, 98.86), away: side(TEAM.drew, 88.78) },
      { id: 'm5b', week: 5, kind: 'regular', status: 'final', home: side(TEAM.casey, 81.28), away: side(TEAM.blair, 82.5) },
      { id: 'm6a', week: 6, kind: 'regular', status: 'final', home: side(TEAM.blair, 85.38), away: side(TEAM.gamblers, 83.84) },
      { id: 'm6b', week: 6, kind: 'regular', status: 'final', home: side(TEAM.casey, 101.26), away: side(TEAM.drew, 104.76) },
      { id: 'm7a', week: 7, kind: 'regular', status: 'final', home: side(TEAM.gamblers, 71.72), away: side(TEAM.casey, 85.34) },
      { id: 'm7b', week: 7, kind: 'regular', status: 'final', home: side(TEAM.blair, 92.06), away: side(TEAM.drew, 96.18) },
      { id: 'm8', week: 8, kind: 'championship', status: 'scheduled', home: { teamId: TEAM.drew, providerPoints: null, adjustments: 0, total: null }, away: { teamId: TEAM.blair, providerPoints: null, adjustments: 0, total: null } },
    ],
  },
};

// ── Rendering harness (Vite SSR, contexts replaced) ─────────────────────────

let server;
let CompanionStandings;
before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'league-provider-test-context',
      enforce: 'pre',
      resolveId(source) {
        if (/\/hooks\/useLeagueHistoryData(?:\.js)?$/.test(source)) return '\0lp-history';
        if (/\/hooks\/useGridShiftStandings(?:\.js)?$/.test(source)) return '\0lp-gridshift';
        if (/\/context\/LeagueSourceContext(?:\.js)?$/.test(source)) return '\0lp-source';
      },
      load(id) {
        if (id === '\0lp-history') return 'export default function useLeagueHistoryData() { return globalThis.__lpHistory; }';
        if (id === '\0lp-gridshift') return 'export default function useGridShiftStandings() { return globalThis.__lpGridShift; }';
        if (id === '\0lp-source') return 'export function useLeagueSource() { return globalThis.__lpSource ?? { provider: "sleeper", gridshiftLeague: null }; }';
      },
    }],
  });
  CompanionStandings = (await server.ssrLoadModule('/src/components/companion/CompanionStandings.jsx')).default;
});
after(async () => {
  await server?.close();
  delete globalThis.__lpHistory;
  delete globalThis.__lpGridShift;
  delete globalThis.__lpSource;
});

function renderStandings({ history = null, gridshift = null, source = null } = {}) {
  globalThis.__lpHistory = history;
  globalThis.__lpGridShift = gridshift;
  globalThis.__lpSource = source;
  return renderToStaticMarkup(createElement(CompanionStandings));
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// ── Sleeper parity ──────────────────────────────────────────────────────────

test('Sleeper Standings markup is unchanged by the provider contract', () => {
  for (const [name, history] of Object.entries(SLEEPER_HISTORIES)) {
    assert.equal(sha256(renderStandings({ history })), SLEEPER_GOLDEN[name], `${name} markup changed`);
  }
});

test('the Sleeper adapter returns the leagueHistory standings, brackets, and placements unchanged', () => {
  for (const [history, snapshot] of [[SLEEPER_HISTORIES.current, currentSnapshot], [SLEEPER_HISTORIES.completed, completedSnapshot]]) {
    const model = buildSleeperStandingsModel(history);
    const historical = Boolean(snapshot.completed);
    const brackets = normalizeSeasonBrackets(snapshot);
    assert.equal(model.provider, 'sleeper');
    assert.equal(model.status, 'ready');
    assert.equal(model.historical, historical);
    assert.deepEqual(model.standings, buildSeasonStandings(snapshot, { historical }));
    assert.deepEqual(model.brackets, brackets);
    assert.deepEqual(model.finalPlacements, historical ? buildFinalPlacements(snapshot, brackets) : null);
    assert.deepEqual(model.postseason, { kind: 'bracket', week: snapshot.league.settings.playoff_week_start });
  }
  assert.equal(buildSleeperStandingsModel(SLEEPER_HISTORIES.loading).status, 'loading');
  assert.equal(buildSleeperStandingsModel(SLEEPER_HISTORIES.error).status, 'error');
  assert.equal(buildSleeperStandingsModel(SLEEPER_HISTORIES.empty).status, 'empty');
  assert.equal(buildSleeperStandingsModel(SLEEPER_HISTORIES.espn).status, 'unsupported');
});

test('the Sleeper league summary reads only the connected Sleeper league', () => {
  assert.deepEqual(
    mapSleeperLeagueSummary({ platform: 'sleeper', selectedLeagueId: '123', season: '2026', league: { name: 'Dynasty', season: '2026' } }),
    { provider: 'sleeper', leagueId: '123', name: 'Dynasty', season: '2026', viewerRole: null },
  );
  assert.equal(mapSleeperLeagueSummary({ platform: 'espn', selectedLeagueId: '1', league: {} }), null);
  assert.equal(mapSleeperLeagueSummary({ platform: 'sleeper', selectedLeagueId: null, league: null }), null);
});

// ── GridShift provider ──────────────────────────────────────────────────────

test('GridShift standings map from the platform responses in the platform rank order', () => {
  const model = buildGridShiftStandingsModel(PLATFORM);
  assert.equal(model.provider, 'gridshift');
  assert.equal(model.status, 'ready');
  assert.equal(model.season, '2026');
  assert.equal(model.historical, false);
  assert.equal(model.standings.throughWeek, 7);
  assert.deepEqual(model.postseason, { kind: 'championship', week: 8 });
  assert.equal(model.brackets, null);
  assert.equal(model.finalPlacements, null);
  assert.deepEqual(model.standings.rows, [
    { participantId: TEAM.drew, seed: 1, teamName: 'Drew Brees Knees', managerName: 'drew', wins: 2, losses: 1, ties: 0, recentForm: ['L', 'W', 'W'], pointsFor: 289.72, pointsAgainst: 292.18 },
    { participantId: TEAM.blair, seed: 2, teamName: 'Blair Witch Blitz', managerName: 'blair', wins: 2, losses: 1, ties: 0, recentForm: ['W', 'W', 'L'], pointsFor: 259.94, pointsAgainst: 261.3 },
    { participantId: TEAM.casey, seed: 3, teamName: 'Casey at the Bat', managerName: 'casey', wins: 1, losses: 2, ties: 0, recentForm: ['L', 'L', 'W'], pointsFor: 267.88, pointsAgainst: 258.98 },
    { participantId: TEAM.gamblers, seed: 4, teamName: 'Gridiron Gamblers', managerName: 'jrudd', wins: 1, losses: 2, ties: 0, recentForm: ['W', 'L', 'L'], pointsFor: 254.42, pointsAgainst: 259.5 },
  ]);
  assert.deepEqual(model.standings.divisions, [{ id: 'League', label: 'League', rows: model.standings.rows }]);
});

test('GridShift rows keep the platform tiebreak order even where core would sort differently', () => {
  const standings = { standings: [
    { rank: 1, teamId: TEAM.gamblers, wins: 1, losses: 1, ties: 0, pointsFor: 100, pointsAgainst: 90 },
    { rank: 2, teamId: TEAM.casey, wins: 1, losses: 1, ties: 0, pointsFor: 200, pointsAgainst: 90 },
  ] };
  const model = buildGridShiftStandingsModel({ ...PLATFORM, standings });
  assert.deepEqual(model.standings.rows.map((row) => [row.participantId, row.seed]), [[TEAM.gamblers, 1], [TEAM.casey, 2]]);
});

test('GridShift recent form counts final regular-season results only, ties and adjustments included', () => {
  const matchups = { matchups: [
    { week: 1, kind: 'regular', status: 'final', home: { teamId: 'a', providerPoints: 90, adjustments: 10, total: 100 }, away: { teamId: 'b', providerPoints: 100, adjustments: 0, total: 100 } },
    { week: 2, kind: 'regular', status: 'provisional', home: side('a', 50), away: side('b', 10) },
    { week: 3, kind: 'championship', status: 'final', home: side('a', 50), away: side('b', 10) },
  ] };
  assert.deepEqual(Object.fromEntries(buildGridShiftRecentForm(matchups)), { a: ['T'], b: ['T'] });
  assert.equal(getGridShiftThroughWeek(matchups), 1);
});

test('GridShift standings are empty until a week is final', () => {
  const model = buildGridShiftStandingsModel({
    ...PLATFORM,
    matchups: { matchups: PLATFORM.matchups.matchups.map((matchup) => ({ ...matchup, status: 'scheduled' })) },
  });
  assert.equal(model.status, 'empty');
  assert.equal(model.standings.throughWeek, 0);
});

test('GridShift summaries and teams come only from platform data', () => {
  assert.deepEqual(mapGridShiftLeagueSummary(PLATFORM.leagues.leagues[0]), {
    provider: 'gridshift', leagueId: '83911f56-09ef-4b4a-a5a0-48f135d94dd0', name: 'Rudd Pilot League', season: '2026', viewerRole: 'commissioner',
  });
  assert.equal(mapGridShiftLeagueSummary(PLATFORM.league).viewerRole, 'commissioner');
  const teams = mapGridShiftTeams({ teams: [...PLATFORM.teams.teams, { id: 'open', name: 'Open Team', managerUserId: null, managerUsername: null }] }, { viewerUserId: USER.jrudd });
  assert.equal(teams.get(TEAM.gamblers).isViewer, true);
  assert.equal(teams.get(TEAM.casey).isViewer, false);
  assert.equal(teams.get('open').managerName, 'No manager');
});

test('the same Standings component renders a GridShift league with no Sleeper data', () => {
  const html = renderStandings({
    history: SLEEPER_HISTORIES.current,
    source: { provider: 'gridshift', gridshiftLeague: { provider: 'gridshift', leagueId: PLATFORM.league.league.id, name: 'Rudd Pilot League', season: '2026' } },
    gridshift: buildGridShiftStandingsModel(PLATFORM),
  });
  assert.match(html, /<h1>2026 Standings<\/h1>/);
  assert.match(html, /Results through completed <strong>Week 7<\/strong>/);
  assert.match(html, /<strong>Drew Brees Knees<\/strong><small>drew<\/small>/);
  assert.match(html, /Championship <strong>Week 8<\/strong> — the top two teams meet\./);
  assert.ok(html.indexOf('Drew Brees Knees') < html.indexOf('Gridiron Gamblers'));
  // Nothing from the connected Sleeper league leaks in.
  for (const sleeperText of ['Alpha', 'Gamma', 'Sleeper', 'Week 3']) assert.equal(html.includes(sleeperText), false, sleeperText);
});

test('GridShift Standings states are provider-neutral', () => {
  const source = { provider: 'gridshift', gridshiftLeague: { leagueId: 'x', name: 'L', season: '2026' } };
  const state = (status, extra = {}) => renderStandings({ source, gridshift: { provider: 'gridshift', status, season: '2026', error: '', retry() {}, standings: null, ...extra } });
  assert.match(state('loading'), /Loading standings\.\.\./);
  assert.match(state('signed-out'), /Sign in to view this league\./);
  assert.match(state('error', { error: 'The league server could not be reached.' }), /The league server could not be reached\.[\s\S]*Try again/);
  assert.match(state('empty'), /No standings available for 2026 yet\./);
  for (const status of ['loading', 'signed-out', 'error', 'empty']) assert.equal(state(status).includes('Sleeper'), false);
});

// ── Contract and configuration ──────────────────────────────────────────────

test('capabilities report what each provider supplies and what core reads', () => {
  assert.equal(canUseLeagueCapability('sleeper', LEAGUE_CAPABILITIES.STANDINGS), true);
  assert.equal(canUseLeagueCapability('gridshift', LEAGUE_CAPABILITIES.STANDINGS), true);
  assert.equal(canUseLeagueCapability('gridshift', LEAGUE_CAPABILITIES.MATCHUPS), false);
  assert.equal(getLeagueProvider('sleeper').capabilities.includes(LEAGUE_CAPABILITIES.COMMISSIONER), false);
  assert.equal(getLeagueProvider('gridshift').capabilities.includes(LEAGUE_CAPABILITIES.COMMISSIONER), true);
  assert.equal(getLeagueProvider('gridshift').capabilities.includes(LEAGUE_CAPABILITIES.HISTORY), false);
  assert.equal(getLeagueProvider('unknown').id, 'sleeper');
});

test('with no platform URL configured the GridShift client is off and makes no request', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('unexpected request'); };
  try {
    assert.equal(isGridShiftPlatformConfigured(), false);
    await assert.rejects(listGridShiftLeagues(), (error) => error.code === 'not_configured');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
