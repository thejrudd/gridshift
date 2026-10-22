import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server;
let Breakdown;
let state;
before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'matchup-test-context',
      enforce: 'pre',
      resolveId(source) {
        if (/\/context\/SleeperContext(?:\.jsx)?$/.test(source)) return '\0matchup-test-sleeper';
        if (/\/context\/ThemeContext(?:\.jsx)?$/.test(source)) return '\0matchup-test-theme';
      },
      load(id) {
        if (id === '\0matchup-test-sleeper') return 'export const useSleeperBase = () => globalThis.__gridshiftMatchupRenderState;';
        if (id === '\0matchup-test-theme') return 'export const useTheme = () => ({ darkMode: true });';
      },
    }],
  });
  Breakdown = (await server.ssrLoadModule('/src/components/companion/PlayerMatchupBreakdown.jsx')).default;
});
after(async () => { await server?.close(); delete globalThis.__gridshiftMatchupRenderState; });

function render({ kickoff, completed = false, points = null, weeklyStats = null, projection = { projected: 16.8 }, baseline = null, enriched = {}, week = 1, scheduleMap = null, benchComparison = null, onViewBenchPlayer = null, scoring = { pass_yd: 0.04 } }) {
  const resolvedScheduleMap = scheduleMap ?? { [week]: { JAX: { kickoff, completed, opp: 'CLE' } } };
  state = { platform: 'sleeper', selectedLeagueId: 'league', players: { player: { full_name: 'Test Quarterback', position: 'QB', team: 'JAX' } }, weeklyStats, season: '2026', activeScoringSettings: scoring, scheduleMap: resolvedScheduleMap };
  globalThis.__gridshiftMatchupRenderState = state;
  return renderToStaticMarkup(createElement(Breakdown, { playerId: 'player', week, projection, baseline, enrichedPlayer: { oppTeam: 'CLE', weekPts: points, gameStarted: completed, scheduleEntry: resolvedScheduleMap?.[week]?.JAX, ...enriched }, benchComparison, onViewBenchPlayer, onClose() {} }));
}

test('pregame renders the projection briefing with no performance view switcher', () => {
  const html = render({ kickoff: '2099-09-12T17:00:00Z' });
  assert.match(html, /data-game-phase="pregame"/);
  assert.match(html, /Projected fantasy points/);
  assert.match(html, /16\.8/);
  assert.doesNotMatch(html, /Game has not started|Fantasy points so far|Player performance view/);
});

test('pregame briefing surfaces outlook, expected range, opponent comparison, injury, and outdoor context', () => {
  const html = render({
    kickoff: '2099-09-12T17:00:00Z',
    projection: { projected: 18, min: 12, max: 24, factors: { seasonBase: 15, source: 'current-season' } },
    enriched: {
      avgPPG: 15,
      availabilityStatus: 'Questionable',
      isHome: true,
      isIndoor: false,
      stadium: { name: 'Test Field', city: 'Jacksonville' },
      weather: { temp_c: 20, wind_kph: 10, precipitation_mm: 0 },
      opponentFantasyContext: { team: 'CLE', position: 'QB', ptsAllowedPerGame: 14, leagueAveragePtsAllowed: 17, differenceFromLeagueAverage: -3, rank: 3, teamCount: 32, currentGames: 4, evidenceKind: 'current' },
      rank: { rank: 7, posCount: 32, posLabel: 'QB' },
    },
  });
  assert.match(html, /Likely range/);
  assert.match(html, /12\.0–24\.0/);
  assert.match(html, /CLE 3rd of 32 vs QB/);
  assert.match(html, /14\.0 pts allowed per game to QBs against a 17\.0 league average/);
  assert.match(html, /Season rank/);
  assert.match(html, /QB7/);
  assert.match(html, /Questionable/);
  assert.match(html, /Test Field · Jacksonville · 68°F/);
  assert.match(html, /vs 15\.0 season average/);
  // legacy briefing pieces are gone: headline sentence, conditions tile, ladder
  assert.doesNotMatch(html, /pmd-headline|No significant weather impact|by total season fantasy points/);
});

test('the projected stat line shows the projection by stat with its total', () => {
  const html = render({ kickoff: '2099-09-12T17:00:00Z', projection: { projected: 16.8, projectedStats: { pass_yd: 250 } } });
  assert.match(html, /Projected stat line/);
  assert.match(html, /Pass Yards/);
  assert.match(html, />10\.0</);
  assert.match(html, />16\.8</);
  assert.doesNotMatch(html, /pmd-ptable|Projected total/);
});

test('final derives its own view from game phase, with no switcher to choose', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true, points: 0 });
  assert.match(html, /data-game-phase="final"/);
  assert.match(html, /Final fantasy points/);
  assert.match(html, /0\.00/);
  assert.doesNotMatch(html, /Player performance view/);
  assert.doesNotMatch(html, />Projected<\/button>|>Compare<\/button>|Compare individual stats/);
});

test('final without a projection still reports the score and says so', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true, points: 12.32, projection: null });
  assert.match(html, /data-game-phase="final"/);
  assert.doesNotMatch(html, /Player performance view/);
  assert.match(html, /12\.32/);
  assert.doesNotMatch(html, /projected<\/span>|Points vs projection/);
});

test('actual scoring unavailable stays unavailable instead of becoming zero', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true });
  assert.match(html, /Actual scoring has not been reported/);
  assert.doesNotMatch(html, /0\.00/);
});

test('actual stat rows retain league-scored performance detail', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true, weeklyStats: { player: [{ week: 1, pass_yd: 250 }] } });
  assert.match(html, /Pass Yards/);
  assert.match(html, />10\.0</);
  assert.doesNotMatch(html, /Fantasy scoring breakdown|Full scoring breakdown/);
});

test('pregame keeps recent completed results below the decision briefing', () => {
  const pairs = [
    ['JAX', 'CLE'], ['BUF', 'MIA'], ['BAL', 'PIT'], ['CIN', 'HOU'], ['IND', 'TEN'],
    ['KC', 'DEN'], ['LV', 'LAC'], ['DAL', 'PHI'], ['NYG', 'WAS'], ['CHI', 'GB'],
    ['DET', 'MIN'], ['ATL', 'CAR'], ['LAR', 'SEA'],
  ];
  const scheduleMap = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
    const week = index + 1;
    const kickoff = week === 6 ? '2099-10-22T17:00:00Z' : `2026-09-${String(week + 1).padStart(2, '0')}T17:00:00Z`;
    const games = Object.fromEntries(pairs.flatMap(([away, home]) => [
      [away, { kickoff, completed: week < 6, opp: home, home: false }],
      [home, { kickoff, completed: week < 6, opp: away, home: true }],
    ]));
    return [week, games];
  }));
  const weeklyStats = {
    player: Array.from({ length: 5 }, (_, index) => ({ week: index + 1, pass_yd: 225 + index * 10, opp: 'CLE', team: 'JAX' })),
  };
  const html = render({ kickoff: '2099-10-22T17:00:00Z', week: 6, scheduleMap, weeklyStats, projection: { projected: 15, min: 12, max: 18 } });
  assert.match(html, /Recent form/);
  assert.match(html, /last 5 \+ this week/);
  assert.match(html, /aria-label="Week 5 at CLE"/);
  assert.match(html, /aria-label="Week 6 vs CLE, projected"/);
  assert.match(html, /Week 5 at CLE: \d+\.\d points/);
  assert.match(html, />Avg \d/);
});

// The ladder is current-season only by design: no prior-season backfill. What
// matters is that it starts using current-season results as soon as they exist,
// rather than waiting for a full five-game sample.
test('pregame recent form uses current-season results as soon as any week completes', () => {
  const pairs = [
    ['JAX', 'CLE'], ['BUF', 'MIA'], ['BAL', 'PIT'], ['CIN', 'HOU'], ['IND', 'TEN'],
    ['KC', 'DEN'], ['LV', 'LAC'], ['DAL', 'PHI'], ['NYG', 'WAS'], ['CHI', 'GB'],
    ['DET', 'MIN'], ['ATL', 'CAR'], ['LAR', 'SEA'],
  ];
  const scheduleMap = Object.fromEntries(Array.from({ length: 3 }, (_, index) => {
    const week = index + 1;
    const completed = week < 3;
    const kickoff = completed ? `2026-09-${String(week + 1).padStart(2, '0')}T17:00:00Z` : '2099-10-22T17:00:00Z';
    const games = Object.fromEntries(pairs.flatMap(([away, home]) => [
      [away, { kickoff, completed, opp: home, home: false }],
      [home, { kickoff, completed, opp: away, home: true }],
    ]));
    return [week, games];
  }));
  const weeklyStats = {
    player: [
      { week: 1, pass_yd: 230, opp: 'CLE', team: 'JAX' },
      { week: 2, pass_yd: 305, opp: 'CLE', team: 'JAX' },
    ],
  };
  const html = render({ kickoff: '2099-10-22T17:00:00Z', week: 3, scheduleMap, weeklyStats, projection: { projected: 15, min: 12, max: 18 } });
  assert.match(html, /data-game-phase="pregame"/);
  assert.match(html, /Recent form/);
  // both completed weeks are plotted beside this week's projection
  assert.match(html, /aria-label="Week 1 at CLE"/);
  assert.match(html, /aria-label="Week 2 at CLE"/);
  assert.match(html, /aria-label="Week 3 vs CLE, projected"/);
  // the season-average line is present on a two-game sample
  assert.match(html, />Avg \d/);
  // and nothing is invented for weeks that have not been played
  assert.doesNotMatch(html, /aria-label="Week 3 at CLE"/);
});

test('known kickoff appears in the fixed phase strip', () => {
  const html = render({ kickoff: '2099-09-12T17:00:00Z' });
  assert.ok(html.includes('pmd-ctx--lead'));
  assert.ok(html.includes('GMT'));
});

test('final score is cued against its projection and keeps the estimate disclosed', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true, points: -1, projection: { projected: 8, min: 5, max: 11 } });
  assert.match(html, /Final fantasy points/);
  assert.match(html, /-1\.00/);
  // the hero number carries the shortfall tone rather than reading as neutral
  assert.match(html, /pmd-big pmd-num pmd-down/);
  assert.match(html, /-9\.0/);
  assert.match(html, /Available estimate/);
});

test('final keeps a weekly rank visible when the available rank has no peer count', () => {
  const html = render({
    kickoff: '2020-09-12T17:00:00Z',
    completed: true,
    points: 7.3,
    projection: { projected: 17.1 },
    enriched: {
      rank: { rank: 7, posCount: 32, posLabel: 'QB' },
      weekRank: { rank: 2, posLabel: 'QB' },
    },
  });
  assert.match(html, /QB2/);
  assert.match(html, /2nd among QBs/);
  assert.doesNotMatch(html, /Week 1 finish.*Not established/);
});

test('a recorded pregame projection is the settled week’s benchmark', () => {
  const scheduleMap = {
    1: { JAX: { kickoff: '2020-09-05T17:00:00Z', completed: true, opp: 'CLE', home: false }, CLE: { kickoff: '2020-09-05T17:00:00Z', completed: true, opp: 'JAX', home: true } },
    2: { JAX: { kickoff: '2020-09-12T17:00:00Z', completed: true, opp: 'CLE', home: false }, CLE: { kickoff: '2020-09-12T17:00:00Z', completed: true, opp: 'JAX', home: true } },
  };
  const html = render({
    kickoff: '2020-09-12T17:00:00Z',
    completed: true,
    week: 2,
    points: 7.3,
    scheduleMap,
    weeklyStats: { player: [
      { week: 1, pass_yd: 225, opp: 'CLE', team: 'JAX' },
      { week: 2, pass_yd: 182.5, opp: 'CLE', team: 'JAX' },
    ] },
    projection: { projected: 17.1 },
    baseline: { capturedAt: '2020-09-12T16:00:00Z', projection: { projected: 17.1 } },
  });
  assert.match(html, /vs 17\.1 projected/);
  assert.match(html, /Pregame projection · 17\.1/);
  assert.match(html, /Season trend/);
  assert.match(html, /aria-label="Week 2 vs CLE, this week"/);
});

test('a live game shows estimated play contributions with their disclosure', () => {
  // kickoff passed, game not yet complete
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: false, points: 12, enriched: { gameStarted: true } });
  assert.match(html, /data-game-phase="live"/);
  assert.match(html, /Scoring plays/);
  assert.match(html, /About play points/);
  assert.match(html, /Play points are estimates\. Bonuses and stat corrections can change the official total\./);
});

test('a live hero compares its score with expected pace instead of the full-game projection', () => {
  const kickoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const html = render({
    kickoff,
    points: 6.46,
    projection: { projected: 14.2 },
    enriched: { gameStarted: true },
  });
  assert.match(html, /data-game-phase="live"/);
  assert.match(html, /pmd-big pmd-num pmd-up/);
  assert.doesNotMatch(html, /pmd-big pmd-num pmd-down/);
  assert.match(html, /vs 3\.5 expected pace/);
  assert.doesNotMatch(html, /vs 14\.2 full-game projection/);
});

test('a settled game drops the play timeline and reports the final NFL score', () => {
  const html = render({
    kickoff: '2020-09-12T17:00:00Z',
    completed: true,
    points: 12,
    scheduleMap: { 1: { JAX: { kickoff: '2020-09-12T17:00:00Z', completed: true, opp: 'CLE', ptsFor: 28, ptsAgainst: 24 } } },
  });
  assert.match(html, /data-game-phase="final"/);
  assert.doesNotMatch(html, /About play points/);
  assert.match(html, /<strong>JAX 28<\/strong> · CLE 24/);
});

test('drilldown honors a refreshed final entry when its context schedule is stale', () => {
  const html = render({
    kickoff: '2020-09-12T17:00:00Z',
    points: 12,
    scheduleMap: { 1: { JAX: { kickoff: '2020-09-12T17:00:00Z', completed: false, opp: 'CLE' } } },
    enriched: {
      gameStarted: true,
      scheduleEntry: {
        kickoff: '2020-09-12T17:00:00Z',
        completed: true,
        status: 'final',
        opp: 'CLE',
        ptsFor: 28,
        ptsAgainst: 24,
      },
    },
  });

  assert.match(html, /data-game-phase="final"/);
  assert.doesNotMatch(html, /About play points/);
  assert.match(html, /<strong>JAX 28<\/strong> · CLE 24/);
});

test('pregame surfaces one eligible higher projected bench option', () => {
  const kickoff = '2099-09-12T17:00:00Z';
  const bench = { id: 'bench', name: 'Bench Quarterback', position: 'QB', team: 'BUF', projection: { projected: 19.2 }, scheduleEntry: { kickoff, opp: 'MIA' } };
  const html = render({
    kickoff,
    benchComparison: {
      isUser: true,
      slot: 'QB',
      starter: { id: 'player', position: 'QB', projection: { projected: 16.8 }, scheduleEntry: { kickoff, opp: 'CLE' } },
      bench: [bench],
      players: { bench },
    },
    onViewBenchPlayer() {},
  });
  assert.match(html, /Better bench option/);
  assert.match(html, /View Bench Quarterback bench comparison/);
  assert.match(html, /\+2\.4</);
});

function completedSchedule(weeks, upcoming = null) {
  const pairs = [
    ['JAX', 'CLE'], ['BUF', 'MIA'], ['BAL', 'PIT'], ['CIN', 'HOU'], ['IND', 'TEN'],
    ['KC', 'DEN'], ['LV', 'LAC'], ['DAL', 'PHI'], ['NYG', 'WAS'], ['CHI', 'GB'],
    ['DET', 'MIN'], ['ATL', 'CAR'], ['LAR', 'SEA'],
  ];
  return Object.fromEntries(Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    const open = upcoming != null && week >= upcoming;
    const kickoff = open ? '2099-10-22T17:00:00Z' : `2026-09-${String(week + 1).padStart(2, '0')}T17:00:00Z`;
    const games = Object.fromEntries(pairs.flatMap(([away, home]) => [
      [away, { kickoff, completed: !open, opp: home, home: false, ...(open ? {} : { ptsFor: 20, ptsAgainst: 17 }) }],
      [home, { kickoff, completed: !open, opp: away, home: true, ...(open ? {} : { ptsFor: 17, ptsAgainst: 20 }) }],
    ]));
    return [week, games];
  }));
}
const seasonRows = count => Array.from({ length: count }, (_, index) => ({ week: index + 1, pass_yd: 220 + index * 15, pass_td: index % 2, opp: 'CLE', team: 'JAX', off_snp: 60 + index, tm_off_snp: 64 }));

test('a BALLDONTLIE projection bridges from the season average by scoring category', () => {
  const html = render({
    kickoff: '2099-10-22T17:00:00Z', week: 4, scheduleMap: completedSchedule(4, 4), weeklyStats: { player: seasonRows(3) },
    scoring: { pass_yd: 0.04, pass_td: 4 },
    projection: { projected: 14.4, projectedStats: { pass_yd: 260, pass_td: 1 }, factors: { source: 'balldontlie' } },
  });
  assert.match(html, /Projection build/);
  assert.doesNotMatch(html, /BALLDONTLIE projection/);
  assert.match(html, /season avg → projected pts/);
  assert.match(html, /Projection build compares the season-average points in each scoring category/);
  assert.match(html, />Passing</);
  assert.match(html, />Total</);
});

test('the GridShift model bridge applies its factors in a fixed order', () => {
  const html = render({
    kickoff: '2099-10-22T17:00:00Z', week: 4, scheduleMap: completedSchedule(4, 4), weeklyStats: { player: seasonRows(3) },
    projection: { projected: 9.6, min: 7, max: 12, factors: { source: 'current-season', seasonBase: 10, recentBase: 11, recentWeight: 0.5, shrunkBase: 10.4, oppFactor: 0.92, weatherFactor: 1, snapFactor: 1, locationFactor: 1 } },
  });
  assert.match(html, /GridShift model/);
  const order = ['Season avg', 'Recent form', 'Matchup', 'Weather', 'Projection'].map(label => html.indexOf(`>${label}</text>`));
  assert.ok(order.every(index => index > 0), 'every bridge step is drawn');
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.doesNotMatch(html, />Away game</);
});

test('final shows the stat line against its projection, usage and next week', () => {
  const weeklyStats = { player: seasonRows(3) };
  const html = render({
    kickoff: '2026-09-04T17:00:00Z', completed: true, week: 3, points: 12.4, weeklyStats,
    scheduleMap: completedSchedule(4, 4),
    projection: { projected: 11, projectedStats: { pass_yd: 250, pass_td: 1 } },
    scoring: { pass_yd: 0.04, pass_td: 4 },
  });
  assert.match(html, /data-game-phase="final"/);
  assert.match(html, /Points vs projection/);
  assert.match(html, /Season trend/);
  assert.match(html, /Usage/);
  assert.match(html, /snap share/);
  assert.match(html, /Next week/);
  assert.match(html, /Early estimate/);
  assert.match(html, /GridShift model/);
});

test('a live game draws the scoring pace against the projection', () => {
  const html = render({ kickoff: new Date(Date.now() - 45 * 60 * 1000).toISOString(), points: 6.2, projection: { projected: 14, min: 10, max: 18 } });
  assert.match(html, /data-game-phase="live"/);
  assert.match(html, /Scoring pace/);
  assert.match(html, /role="slider"/);
  assert.match(html, /Est\. finish/);
  assert.doesNotMatch(html, /Season rank/);
});
