import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server;
let Compare;

before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'matchup-compare-test-context',
      enforce: 'pre',
      resolveId(source) {
        if (/\/context\/SleeperContext(?:\.jsx)?$/.test(source)) return '\0matchup-compare-test-sleeper';
        if (/\/context\/ThemeContext(?:\.jsx)?$/.test(source)) return '\0matchup-compare-test-theme';
      },
      load(id) {
        if (id === '\0matchup-compare-test-sleeper') return 'export const useSleeperBase = () => globalThis.__gridshiftMatchupCompareRenderState;';
        if (id === '\0matchup-compare-test-theme') return 'export const useTheme = () => ({ darkMode: true });';
      },
    }],
  });
  Compare = (await server.ssrLoadModule('/src/components/companion/PlayerMatchupCompare.jsx')).default;
});

after(async () => {
  await server?.close();
  delete globalThis.__gridshiftMatchupCompareRenderState;
});

function render({ left = {}, right = {} } = {}) {
  globalThis.__gridshiftMatchupCompareRenderState = {
    players: {},
    weeklyStats: {},
    activeScoringSettings: { pass_yd: 0.04 },
    scheduleMap: {},
  };

  return renderToStaticMarkup(createElement(Compare, {
    left: {
      id: 'left', name: 'Left Quarterback', position: 'QB', team: 'BUF',
      scheduleEntry: { kickoff: '2099-10-22T17:00:00Z', completed: false, opp: 'CLE' },
      projection: { projected: 16 },
      ...left,
    },
    right: {
      id: 'right', name: 'Right Quarterback', position: 'QB', team: 'CLE',
      scheduleEntry: { kickoff: '2099-10-22T17:00:00Z', completed: false, opp: 'BUF' },
      projection: { projected: 14 },
      ...right,
    },
    week: 6,
    onClose() {},
    onViewStats() {},
  }));
}

test('comparison player headers expose one labeled, focusable statistics control per player', () => {
  const html = render();
  const heroes = [...html.matchAll(/<button\b[^>]*pmd-cmp-hero[^>]*>[\s\S]*?<\/button>/g)];
  const labels = heroes.map(([hero]) => hero.match(/aria-label="([^"]+)"/)?.[1]);
  const classNames = heroes.map(([hero]) => hero.match(/class="([^"]*pmd-cmp-hero[^"]*)"/)?.[1] ?? '');

  assert.equal(heroes.length, 2);
  assert.deepEqual(labels, [
    'View Left Quarterback statistics',
    'View Right Quarterback statistics',
  ]);
  assert.ok(classNames.every(className => className.includes('focus-visible:outline')));
  assert.doesNotMatch(heroes[0][0], /<button[\s\S]*<button/);
  assert.doesNotMatch(heroes[1][0], /<button[\s\S]*<button/);
  assert.match(html, /(?:stronger QB forecast|QB forecast leans|projection edge|pregame lean)/);
  assert.doesNotMatch(html, /Right Quarterback projects 2\.0 higher\./);
});

test('pregame verdict adds stable matchup-specific context to the projection edge', () => {
  const html = render({
    left: {
      oppTeam: 'HOU',
      isHome: false,
      opponentFantasyContext: {
        ptsAllowedPerGame: 19.4,
        leagueAveragePtsAllowed: 15.8,
        differenceFromLeagueAverage: 3.6,
      },
    },
    right: { oppTeam: 'DEN', isHome: true },
  });
  const headline = html.match(/<p class="pmd-headline">([^<]*)<\/p>/)?.[1] ?? '';
  assert.match(headline, /HOU/);
  assert.match(headline, /2\.0/);
  assert.doesNotMatch(headline, /projects 2\.0 higher\./);
  assert.doesNotMatch(headline, /with the \d+\.\d forecast sits/);
});

test('positional projected stats use compact display precision', () => {
  const html = render({
    left: {
      projection: { projected: 18, projectedStats: { pass_td: 1.259964, pass_yd: 234.7311204 } },
    },
    right: {
      projection: { projected: 17, projectedStats: { pass_td: 1.4111037, pass_yd: 207.53650439 } },
    },
  });

  assert.match(html, />1\.3<\/span>/);
  assert.match(html, />1\.4(?:<i[^>]*>▲<\/i>)?<\/span>/);
  assert.match(html, />234\.7<\/span>/);
  assert.match(html, />207\.5<\/span>/);
  assert.doesNotMatch(html, /1\.259964|1\.4111037|234\.7311204|207\.53650439/);
});
