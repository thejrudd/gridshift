import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server;
let Drilldown;
before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'team-scoring-test-context',
      enforce: 'pre',
      resolveId(source) {
        if (/\/context\/SleeperContext(?:\.jsx)?$/.test(source)) return '\0team-scoring-test-sleeper';
        if (/\/context\/ThemeContext(?:\.jsx)?$/.test(source)) return '\0team-scoring-test-theme';
        if (/\.css$/.test(source)) return '\0team-scoring-test-css';
      },
      load(id) {
        if (id === '\0team-scoring-test-sleeper') return 'export const useSleeperBase = () => globalThis.__gridshiftTeamScoringState;';
        if (id === '\0team-scoring-test-theme') return 'export const useTheme = () => ({ darkMode: true });';
        if (id === '\0team-scoring-test-css') return 'export default {};';
      },
    }],
  });
  Drilldown = (await server.ssrLoadModule('/src/components/companion/TeamScoringDrilldown.jsx')).default;
});
after(async () => { await server?.close(); delete globalThis.__gridshiftTeamScoringState; });

const SCORING = { pass_yd: 0.04, pass_td: 4, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6 };

function render({ started = false, completed = false, settled = false, secondReceiver = false }) {
  globalThis.__gridshiftTeamScoringState = {
    platform: 'sleeper',
    season: '2025',
    activeScoringSettings: SCORING,
    players: { qb: { full_name: 'Test Quarterback', position: 'QB' }, wr: { full_name: 'Test Receiver', position: 'WR' }, wr2: { full_name: 'Other Receiver', position: 'WR' } },
    weeklyStats: started ? { qb: [{ week: 12, pass_yd: 250, pass_td: 2 }], wr: [{ week: 12, rec: 6, rec_yd: 90 }] } : {},
  };
  const player = (id, name, position, projected, projectedStats, weekPts) => ({
    id, name, position, avgPPG: projected,
    projection: { projected, projectedStats, factors: { source: 'sleeper' } },
    gameStarted: started,
    weekPts: started ? weekPts : null,
    scheduleEntry: { kickoff: '2025-11-23T18:00:00Z', completed },
  });
  const spots = [
    { slotPos: 'QB', slotLabel: 'QB', player: player('qb', 'Test Quarterback', 'QB', 18, { pass_yd: 250, pass_td: 2 }, 18) },
    { slotPos: 'WR', slotLabel: 'WR', player: player('wr', 'Test Receiver', 'WR', 12, { rec: 5, rec_yd: 70 }, 15) },
    ...(secondReceiver ? [{ slotPos: 'WR', slotLabel: 'WR', player: player('wr2', 'Other Receiver', 'WR', 8, { rec: 3, rec_yd: 40 }, 8) }] : []),
    { slotPos: 'DEF', slotLabel: 'DST', player: null },
  ];
  return renderToStaticMarkup(createElement(Drilldown, { teamName: 'Sandbox Squad', week: 12, spots, settled, teamPoints: started ? 33 : null, platformLabel: 'Sleeper', onClose() {} }));
}

test('game state picks the layout, with no phase tabs', () => {
  const pregame = render({});
  assert.match(pregame, /data-phase="pregame"/);
  assert.match(pregame, /Where the projection comes from/);
  assert.match(pregame, />30\.00</);
  assert.doesNotMatch(pregame, /role="tab"/);

  const live = render({ started: true });
  assert.match(live, /data-phase="live"/);
  assert.match(live, /Points so far/);
  assert.match(live, /Biggest so far/);

  const final = render({ started: true, completed: true, settled: true });
  assert.match(final, /data-phase="final"/);
  assert.match(final, /Scoring categories/);
  assert.doesNotMatch(final, />Proj</);
  assert.match(final, /Pass Yards|Passing Yards/i);
  assert.match(final, /\+3\.00/);
});

test('lists every lineup spot, including an empty one, and names the shared source', () => {
  const markup = render({});
  assert.ok(markup.indexOf('>QB<') < markup.indexOf('>WR<'));
  assert.match(markup, />DST</);
  assert.match(markup, /Empty/);
  assert.match(markup, /Same lineup, projections and points as Matchups/);
  assert.match(markup, /aria-pressed="false"/);
  // Pregame categories are lineup totals, so no player column.
  assert.doesNotMatch(markup, />Player</);
});

test('pregame categories sum each stat across the lineup', () => {
  const markup = render({ secondReceiver: true });
  const table = markup.slice(markup.indexOf('tsd-pregame-categories'));
  // rec_yd: 70 + 40 = 110 yards, 11.00 points; rec: 5 + 3 = 8, 8.00 points.
  assert.match(table, />110</);
  assert.match(table, />11\.00</);
  assert.match(table, />8\.00</);
  assert.doesNotMatch(table, />70</);
  assert.doesNotMatch(table, />40</);
});
