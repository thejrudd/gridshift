import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { buildAppPath, isSameAppRoute, normalizeAppRoute, parseAppRoute } from '../../src/utils/appRoutes.js';
import { buildUnitMatchupTable } from '../../src/utils/defenseRankings.js';
import {
  buildGameTrackerPanel,
  buildMatchupKeys,
  buildSeasonGlanceRows,
  buildTeamSeasonLeaders,
  buildTeamSeasonSummary,
  buildUnitPanel,
  getElapsedGameMinutes,
  getGameUnitValues,
  getUnitEdge,
  normalizeEspnGameSummary,
  resolveMatchupPhase,
} from '../../src/utils/nflMatchupModel.js';
import { createNflTeamStatsRouter, flattenEspnTeamStatistics } from '../../server/nflTeamStatsHandlers.js';

// ── routes ──────────────────────────────────────────────────────────────────

test('Schedule matchup drill-in survives the team-schedule route round trip', () => {
  const route = normalizeAppRoute({
    activeTab: 'statistics',
    statisticsView: 'schedule',
    statisticsScheduleMode: 'team',
    statisticsScheduleTeamId: 'kc',
    statisticsScheduleGameId: '401772510',
  });
  const path = buildAppPath(route);
  assert.equal(path, '/statistics/schedule?mode=team&team=KC&game=401772510');
  const url = new URL(path, 'https://gridshift.local');
  assert.equal(parseAppRoute(url.pathname, url.search).statisticsScheduleGameId, '401772510');
});

test('Opening, closing and pinning are real route changes', () => {
  const closed = { activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'team', statisticsScheduleTeamId: 'KC' };
  assert.equal(isSameAppRoute(closed, { ...closed, statisticsScheduleGameId: '401772510' }), false);
  const defenses = { activeTab: 'fantasy', companionView: 'defenses' };
  assert.equal(isSameAppRoute(defenses, { ...defenses, defensePinnedTeams: 'KC,BUF' }), false);
  assert.equal(isSameAppRoute(defenses, { ...defenses, defenseReturnGameId: '1', defenseReturnTeamId: 'KC' }), false);
});

test('Schedule matchup id survives a selected week or team schedule and rejects malformed ids', () => {
  assert.equal(parseAppRoute('/statistics/schedule', '?mode=week&week=4&game=401772510').statisticsScheduleGameId, '401772510');
  assert.equal(parseAppRoute('/statistics/schedule', '?mode=week&game=401772510').statisticsScheduleGameId, null);
  assert.equal(parseAppRoute('/statistics/schedule', '?mode=team&team=KC&game=%3Cscript%3E').statisticsScheduleGameId, null);
});

test('Defenses keeps pinned matchup teams and the way back', () => {
  const route = normalizeAppRoute({
    activeTab: 'fantasy',
    companionView: 'defenses',
    defensePosition: 'WR',
    defenseStat: 'rec_yd',
    defenseSort: 'avg',
    defensePinnedTeams: 'kc,buf,kc,mia',
    defenseReturnGameId: '401772510',
    defenseReturnTeamId: 'kc',
  });
  assert.equal(route.defensePinnedTeams, 'KC,BUF');
  const path = buildAppPath(route);
  const url = new URL(path, 'https://gridshift.local');
  const parsed = parseAppRoute(url.pathname, url.search);
  assert.equal(parsed.defensePinnedTeams, 'KC,BUF');
  assert.equal(parsed.defenseReturnGameId, '401772510');
  assert.equal(parsed.defenseReturnTeamId, 'KC');
  assert.equal(parsed.defensePosition, 'WR');
  assert.equal(parsed.defenseStat, 'rec_yd');
});

test('A return trip needs both the game and the team', () => {
  const route = normalizeAppRoute({ activeTab: 'fantasy', companionView: 'defenses', defenseReturnGameId: '401772510' });
  assert.equal(route.defenseReturnGameId, null);
  assert.equal(route.defenseReturnTeamId, null);
  assert.equal(buildAppPath(route), '/fantasy/defenses');
});

// ── unit table ──────────────────────────────────────────────────────────────

const players = {
  qbK: { position: 'QB', team: 'KC' },
  wrK: { position: 'WR', team: 'KC' },
  teK: { position: 'TE', team: 'KC' },
  qbB: { position: 'QB', team: 'BUF' },
  wrB: { position: 'WR', team: 'BUF' },
  rbM: { position: 'RB', team: 'MIA' },
};
const weeklyStats = {
  qbK: [{ week: 1, team: 'KC', pass_yd: 300 }, { week: 2, team: 'KC', pass_yd: 200 }],
  wrK: [{ week: 1, team: 'KC', rec_yd: 180 }, { week: 2, team: 'KC', rec_yd: 60 }],
  teK: [{ week: 1, team: 'KC', rec_yd: 120 }, { week: 2, team: 'KC', rec_yd: 140 }],
  qbB: [{ week: 1, team: 'BUF', pass_yd: 150 }, { week: 2, team: 'BUF', pass_yd: 250 }],
  wrB: [{ week: 1, team: 'BUF', rec_yd: 150 }, { week: 2, team: 'BUF', rec_yd: 250 }],
  rbM: [{ week: 2, team: 'MIA', rush_yd: 90, rec_yd: 10 }],
};
const scheduleMap = {
  1: { KC: { opp: 'BUF' }, BUF: { opp: 'KC' } },
  2: { KC: { opp: 'MIA' }, MIA: { opp: 'KC' }, BUF: { opp: 'NYJ' }, NYJ: { opp: 'BUF' } },
};
const teams = ['BUF', 'KC', 'MIA', 'NYJ'];

test('Unit table ranks offense by most produced and defense by fewest allowed, per game', () => {
  const table = buildUnitMatchupTable({ weeklyStats, players, scheduleMap, teams });
  const kc = table.get('KC');
  assert.equal(kc.games, 2);
  assert.equal(kc.offense.PASS.avg, 250);
  assert.equal(kc.offense.TE.avg, 130);
  assert.equal(kc.offense.TE.rank, 1);
  // KC allowed BUF's 150 pass yards in week 1, MIA threw none in week 2.
  assert.equal(kc.defense.PASS.avg, 75);
  assert.equal(table.get('BUF').defense.PASS.avg, 150);
  assert.deepEqual(['KC', 'BUF', 'MIA', 'NYJ'].map((team) => table.get(team).defense.PASS.rank), [1, 2, 3, 4]);
  assert.equal(table.get('MIA').offense.RB.avg, 100);
});

test('throughWeek limits the sample so final games can compare ranks before and after', () => {
  const before = buildUnitMatchupTable({ weeklyStats, players, scheduleMap, teams, throughWeek: 1 });
  assert.equal(before.get('KC').games, 1);
  assert.equal(before.get('KC').offense.PASS.avg, 300);
  assert.equal(before.get('MIA').games, 0);
  assert.equal(before.get('MIA').offense.RB.avg, null);
});

test('Edges need a rank gap of eight, and #1 is the strongest on both sides', () => {
  assert.equal(getUnitEdge(1, 29), 'offense');
  assert.equal(getUnitEdge(20, 2), 'defense');
  assert.equal(getUnitEdge(9, 8), 'even');
  assert.equal(getUnitEdge(null, 3), null);
});

test('Unit panels and keys name the widest gaps', () => {
  const table = new Map([
    ['KC', { team: 'KC', offense: { PASS: { avg: 250, rank: 9 }, RUN: { avg: 110, rank: 15 }, QB: { avg: 244, rank: 8 }, RB: { avg: 94, rank: 16 }, WR: { avg: 132, rank: 14 }, TE: { avg: 78, rank: 1 }, K: { avg: 1.7, rank: 20 } }, defense: {} }],
    ['BUF', { team: 'BUF', offense: {}, defense: { PASS: { avg: 214, rank: 8 }, RUN: { avg: 103, rank: 20 }, QB: { avg: 205, rank: 6 }, RB: { avg: 112, rank: 26 }, WR: { avg: 118, rank: 5 }, TE: { avg: 66, rank: 29 }, K: { avg: 2, rank: 21 } } }],
  ]);
  const panel = buildUnitPanel(table, 'KC', 'BUF');
  assert.equal(panel.length, 7);
  assert.equal(panel.find((row) => row.unit.id === 'TE').edge, 'offense');
  assert.equal(panel.find((row) => row.unit.id === 'WR').edge, 'defense');
  const keys = buildMatchupKeys([panel], { KC: 'Kansas City Chiefs', BUF: 'Buffalo Bills' });
  assert.equal(keys[0].tag, 'KC offense · TE');
  assert.ok(keys.length <= 3);
});

// ── schedule summaries and glance rows ──────────────────────────────────────

const schedule = {
  weeks: [
    { week: 1, games: [{ id: 'g1', awayTeamId: 'DEN', homeTeamId: 'KC', awayScore: 17, homeScore: 27, status: 'final' }] },
    { week: 2, games: [{ id: 'g2', awayTeamId: 'KC', homeTeamId: 'LAC', awayScore: 20, homeScore: 24, status: 'final' }] },
    { week: 3, games: [{ id: 'g3', awayTeamId: 'BUF', homeTeamId: 'KC', awayScore: 27, homeScore: 24, status: 'final' }] },
  ],
};

test('Season summaries count only final games in range', () => {
  const before = buildTeamSeasonSummary(schedule, 'KC', { beforeWeek: 3 });
  assert.deepEqual([before.wins, before.losses, before.pointsFor, before.pointsAgainst], [1, 1, 47, 41]);
  const after = buildTeamSeasonSummary(schedule, 'KC', { throughWeek: 3 });
  assert.equal(after.losses, 2);
  assert.equal(after.results.at(-1).result, 'L');
});

test('Glance rows read ESPN team stats, fall back to totals per game, and drop rows neither team has', () => {
  const summary = buildTeamSeasonSummary(schedule, 'KC', { beforeWeek: 3 });
  const rows = buildSeasonGlanceRows({
    left: { summary, stats: { 'miscellaneous.thirdDownConvPct': { value: 44.6 }, 'rushing.rushingYards': { value: 220, perGameValue: null }, 'miscellaneous.possessionTimeSeconds': { value: 3720, perGameValue: null } } },
    right: { summary: buildTeamSeasonSummary(schedule, 'BUF', { beforeWeek: 3 }), stats: null },
  });
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId.ppg.a, '23.5');
  assert.equal(byId.third.a, '44.6%');
  assert.equal(byId.rush.a, '110.0');
  assert.equal(byId.possession.a, '31:00');
  assert.equal(byId.sacks, undefined);
  assert.equal(byId.ppg.b, '—');
});

test('Season leaders pick a passer, rusher and receiver for the team', () => {
  const leaders = buildTeamSeasonLeaders({ weeklyStats, players, teamId: 'KC' });
  assert.deepEqual(leaders.map((row) => row.kind), ['passing', 'receiving']);
  assert.equal(leaders[1].id, 'teK');
});

// ── ESPN game summary ───────────────────────────────────────────────────────

const espnSummary = {
  header: {
    competitions: [{
      status: { period: 3, displayClock: '7:48', type: { state: 'in', completed: false, shortDetail: '7:48 - 3rd' } },
      competitors: [
        { homeAway: 'home', score: '17', team: { id: '12', abbreviation: 'KC' }, linescores: [{ displayValue: '7' }, { displayValue: '3' }, { displayValue: '7' }] },
        { homeAway: 'away', score: '20', team: { id: '2', abbreviation: 'BUF' }, linescores: [{ displayValue: '3' }, { displayValue: '10' }, { displayValue: '7' }], possession: true },
      ],
    }],
  },
  situation: { downDistanceText: '2nd & 12 at BUF 44', possessionText: 'BUF 44', possession: '2', homeTimeouts: 2, awayTimeouts: 3 },
  boxscore: {
    teams: [
      { team: { abbreviation: 'KC' }, statistics: [{ name: 'netPassingYards', displayValue: '196' }, { name: 'rushingYards', displayValue: '48' }, { name: 'thirdDownEff', displayValue: '5-9' }, { name: 'sacksYardsLost', displayValue: '3-21' }] },
      { team: { abbreviation: 'BUF' }, statistics: [{ name: 'netPassingYards', displayValue: '220' }, { name: 'rushingYards', displayValue: '90' }, { name: 'thirdDownEff', displayValue: '6-10' }, { name: 'sacksYardsLost', displayValue: '2-14' }] },
    ],
    players: [{
      team: { abbreviation: 'KC' },
      statistics: [
        { name: 'passing', keys: ['completions/passingAttempts', 'passingYards', 'passingTouchdowns', 'interceptions'], athletes: [{ athlete: { id: '1', displayName: 'Patrick Mahomes', position: { abbreviation: 'QB' } }, stats: ['17/24', '204', '2', '1'] }] },
        { name: 'receiving', keys: ['receptions', 'receivingYards', 'receivingTouchdowns'], athletes: [
          { athlete: { id: '2', displayName: 'Rashee Rice', position: { abbreviation: 'WR' } }, stats: ['6', '71', '0'] },
          { athlete: { id: '3', displayName: 'Tight End', position: { abbreviation: 'TE' } }, stats: ['4', '52', '0'] },
        ] },
        { name: 'rushing', keys: ['rushingAttempts', 'rushingYards'], athletes: [{ athlete: { id: '4', displayName: 'Running Back', position: { abbreviation: 'RB' } }, stats: ['10', '40'] }] },
        { name: 'kicking', keys: ['fieldGoalsMade/fieldGoalAttempts'], athletes: [{ athlete: { id: '5', displayName: 'Kicker', position: { abbreviation: 'PK' } }, stats: ['1/1'] }] },
      ],
    }],
  },
  drives: {
    previous: [{ id: 'd1', team: { abbreviation: 'KC' }, plays: [{ id: 'p1', period: { number: 3 }, clock: { displayValue: '9:05' }, text: 'Touchdown pass', scoringPlay: true, homeScore: 17, awayScore: 20 }] }],
    current: { id: 'd2', team: { abbreviation: 'BUF' }, offensivePlays: 3, yards: 9, timeElapsed: { displayValue: '1:17' }, plays: [{ id: 'p2', period: { number: 3 }, clock: { displayValue: '7:48' }, text: 'Run for -2', statYardage: -2, start: { shortDownDistanceText: '1st & 10' } }] },
  },
  scoringPlays: [{ id: 's1', team: { abbreviation: 'KC' }, period: { number: 1 }, clock: { displayValue: '9:14' }, text: 'TD', homeScore: 7, awayScore: 0 }],
};

test('ESPN summaries normalize into live score, situation, drive, plays and box score', () => {
  const game = normalizeEspnGameSummary(espnSummary);
  assert.equal(resolveMatchupPhase({ status: 'final' }, game), 'live');
  assert.equal(game.teams.KC.score, 17);
  assert.deepEqual(game.teams.BUF.linescores, [3, 10, 7]);
  assert.equal(game.situation.possessionTeam, 'BUF');
  assert.equal(game.currentDrive.plays, 3);
  assert.equal(game.recentPlays[0].id, 'p2');
  assert.equal(game.recentPlays[1].scoring, true);
  assert.equal(game.scoringPlays[0].team, 'KC');
  const values = getGameUnitValues(game, 'KC');
  assert.deepEqual(values, { PASS: 196, RUN: 48, QB: 204, RB: 40, WR: 71, TE: 52, K: 1 });
});

test('Elapsed game time drives pace, and the tracker compares against the defense average', () => {
  assert.equal(getElapsedGameMinutes(3, '7:48'), 37.2);
  assert.equal(getElapsedGameMinutes(5, '10:00'), 60);
  const game = normalizeEspnGameSummary(espnSummary);
  const table = new Map([['BUF', { defense: { PASS: { avg: 214.3, rank: 8 }, RUN: { avg: 103.7, rank: 20 }, QB: { avg: 205, rank: 6 }, RB: { avg: 112.3, rank: 26 }, WR: { avg: 118, rank: 5 }, TE: { avg: 66, rank: 29 }, K: { avg: 2, rank: 21 } } }]]);
  const rows = buildGameTrackerPanel({ game, table, offenseTeam: 'KC', defenseTeam: 'BUF', live: true });
  const byId = Object.fromEntries(rows.map((row) => [row.unit.id, row]));
  assert.equal(Math.round(byId.PASS.pace), 316);
  assert.equal(byId.PASS.verdict, 'above');
  assert.equal(byId.RUN.verdict, 'under');
  const final = buildGameTrackerPanel({ game, table, offenseTeam: 'KC', defenseTeam: 'BUF', live: false });
  assert.equal(final.find((row) => row.unit.id === 'PASS').pace, null);
});

// ── sidecar ─────────────────────────────────────────────────────────────────

test('ESPN team statistics flatten by category', () => {
  const flat = flattenEspnTeamStatistics({ splits: { categories: [{ name: 'miscellaneous', stats: [{ name: 'thirdDownConvPct', value: 44.6, displayValue: '44.6' }] }] } });
  assert.deepEqual(flat['miscellaneous.thirdDownConvPct'], { value: 44.6, perGameValue: null, displayValue: '44.6', rank: null });
});

test('Team stats endpoint validates input, caches ESPN, and maps teams to ESPN ids', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ splits: { categories: [{ name: 'defensive', stats: [{ name: 'sacks', value: 11 }] }] } }) };
  };
  const app = express();
  app.use('/team-stats', createNflTeamStatsRouter({ fetcher, now: () => Date.parse('2026-09-23T10:00:00Z') }));
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/team-stats`;
    const bad = await fetch(`${base}?team=XYZ&season=2026`);
    assert.equal(bad.status, 400);
    const first = await (await fetch(`${base}?team=kc&season=2026`)).json();
    const second = await (await fetch(`${base}?team=KC&season=2026`)).json();
    assert.equal(first.stats['defensive.sacks'].value, 11);
    assert.equal(second.team, 'KC');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /seasons\/2026\/types\/2\/teams\/12\/statistics$/);
  } finally {
    server.close();
  }
});
