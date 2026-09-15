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

function render({ kickoff, completed = false, points = null, weeklyStats = null, projection = { projected: 16.8 }, baseline = null, enriched = {}, week = 1, scheduleMap = null, benchComparison = null, onViewBenchPlayer = null }) {
  const resolvedScheduleMap = scheduleMap ?? { [week]: { JAX: { kickoff, completed, opp: 'CLE' } } };
  state = { platform: 'sleeper', selectedLeagueId: 'league', players: { player: { full_name: 'Test Quarterback', position: 'QB', team: 'JAX' } }, weeklyStats, season: '2026', activeScoringSettings: { pass_yd: 0.04 }, scheduleMap: resolvedScheduleMap };
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
  assert.match(html, /#3/);
  assert.match(html, /14\.0 pts allowed\/game · 17\.0 league average/);
  assert.match(html, /Season points rank/);
  assert.match(html, /by total season fantasy points/);
  assert.match(html, /Questionable/);
  assert.match(html, /Test Field · Jacksonville · 68°F/);
  // the headline restates the visible projection and opponent evidence
  assert.match(html, /pmd-headline/);
  assert.match(html, /season average/);
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
  assert.match(html, /No projection was available to compare against/);
});

test('actual scoring unavailable stays unavailable instead of becoming zero', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true });
  assert.match(html, /Actual scoring has not been reported/);
  assert.doesNotMatch(html, /0\.00/);
});

test('actual stat rows retain league-scored performance detail', () => {
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: true, weeklyStats: { player: [{ week: 1, pass_yd: 250 }] } });
  assert.match(html, /Fantasy scoring breakdown/);
  assert.match(html, /Pass Yards/);
  assert.match(html, /10\.00/);
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
  assert.match(html, /Last 5 games vs season average/);
  assert.match(html, /Wk 5 · CLE/);
  assert.match(html, /Season average/);
});

// The ladder is current-season only by design: no prior-season backfill. What
// matters is that it starts using current-season results as soon as they exist,
// rather than waiting for a full five-game sample.
test('pregame ladder uses current-season results as soon as any week completes', () => {
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
  assert.match(html, /Last 5 games vs season average/);
  // both completed weeks are plotted, newest first
  assert.match(html, /Wk 2 · CLE/);
  assert.match(html, /Wk 1 · CLE/);
  // the season-average marker is present on a two-game sample
  assert.match(html, /Season average \d/);
  // and nothing is invented for weeks that have not been played
  assert.doesNotMatch(html, /Wk 3 · /);
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

test('a live game shows estimated play contributions with their disclosure', () => {
  // kickoff passed, game not yet complete
  const html = render({ kickoff: '2020-09-12T17:00:00Z', completed: false, points: 12, enriched: { gameStarted: true } });
  assert.match(html, /data-game-phase="live"/);
  assert.match(html, /What earned the points/);
  assert.match(html, /Estimated play contributions; bonuses, corrections and missing plays can differ from the official total/);
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
  assert.doesNotMatch(html, /What earned the points/);
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
  assert.match(html, /Higher projected option on your bench/);
  assert.match(html, /View Bench Quarterback bench comparison/);
  assert.match(html, /\+2\.4 projected pts/);
});
