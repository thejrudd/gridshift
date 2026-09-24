import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { baselineScope } from '../../src/utils/matchupProjectionBaseline.js';

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

function render({ left = {}, right = {}, state = {}, week = 6, leftBaseline = null, rightBaseline = null } = {}) {
  globalThis.__gridshiftMatchupCompareRenderState = {
    players: {},
    weeklyStats: {},
    activeScoringSettings: { pass_yd: 0.04 },
    scheduleMap: {},
    ...state,
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
    week,
    leftBaseline,
    rightBaseline,
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

test('comparison season form uses both played rows before the selected week', () => {
  const scheduleMap = {
    1: { BUF: { opp: 'CLE', home: false }, CLE: { opp: 'BUF', home: true } },
    2: { BUF: { opp: 'CLE', home: false }, CLE: { opp: 'BUF', home: true }, OTHER: { opp: 'THIRD', completed: false } },
  };
  const html = render({
    week: 3,
    state: {
      players: {
        left: { position: 'QB', team: 'BUF' },
        right: { position: 'QB', team: 'CLE' },
      },
      weeklyStats: {
        left: [{ week: 1, team: 'BUF', pass_yd: 250, gp: 1 }, { week: 2, team: 'BUF', pass_yd: 500, gp: 1 }],
        right: [{ week: 1, team: 'CLE', pass_yd: 200, gp: 1 }, { week: 2, team: 'CLE', pass_yd: 400, gp: 1 }],
      },
      scheduleMap,
    },
  });
  assert.match(html, /Season form · <span>through 2 games<\/span>/);
  assert.match(html, />15\.0<\/span>/);
  assert.match(html, />30\.0<\/span>/);
  assert.match(html, />20\.0<\/span>/);
});

test('historical projection labels sit on their own side and expose an unrecorded peer value', () => {
  const scheduleMap = {
    1: { BUF: { opp: 'CLE', home: false }, CLE: { opp: 'BUF', home: true } },
  };
  const html = render({
    week: 2,
    state: {
      players: {
        left: { position: 'QB', team: 'BUF' },
        right: { position: 'QB', team: 'CLE' },
      },
      weeklyStats: {
        left: [{ week: 1, team: 'BUF', pass_yd: 250, gp: 1 }],
        right: [{ week: 1, team: 'CLE', pass_yd: 200, gp: 1 }],
      },
      scheduleMap,
    },
    leftBaseline: { week: 1, projection: { projected: 16.8 } },
  });
  const leftTrack = html.match(/<div class="pmd-cmp-fcell is-left">([\s\S]*?)<\/div>\s*<div class="pmd-cmp-lrow-k/ )?.[1] ?? '';
  assert.match(leftTrack, /class="is-target" style="right:/);
  assert.match(leftTrack, />16\.8<\/span>/);
  assert.match(html, /title="Projection not recorded" aria-label="Projection not recorded">—<\/span>/);
});

test('comparison resolves a provider seed back to the displayed player before reading form data', () => {
  const scheduleMap = {
    1: { SF: { opp: 'SEA', home: true }, JAX: { opp: 'DEN', home: false } },
    2: { SF: { opp: 'NE', home: true }, JAX: { opp: 'DEN', home: false } },
  };
  const previousStorage = globalThis.localStorage;
  const storageData = new Map();
  const storage = {
    get length() { return storageData.size; },
    key(index) { return [...storageData.keys()][index] ?? null; },
    getItem(key) { return storageData.get(key) ?? null; },
    setItem(key, value) { storageData.set(key, value); },
    removeItem(key) { storageData.delete(key); },
  };
  const putProjection = (playerId, week, projected) => {
    const record = {
      leagueId: 'league',
      season: '2026',
      week: String(week),
      playerId,
      scoringFingerprint: JSON.stringify({ pass_yd: 0.04 }),
      projection: { projected },
      capturedAt: Date.parse('2099-10-22T16:00:00Z'),
      kickoff: '2099-10-22T17:00:00Z',
    };
    storage.setItem(
      `gridshift-matchup-projection-baselines-v2:${encodeURIComponent(baselineScope(record))}:${record.capturedAt}`,
      JSON.stringify(record),
    );
  };
  putProjection('brock-id', 1, 17.2);
  putProjection('brock-id', 2, 23.3);
  putProjection('trevor-id', 1, 16.8);
  putProjection('trevor-id', 2, 21.4);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });

  let html;
  try {
    html = render({
      week: 3,
      left: {
        // The visible seed is Brock, but its provider id is Trevor's. This is
        // the identity handoff that used to make the two sides trade histories.
        id: 'trevor-id',
        name: 'Brock Purdy',
        team: 'SF',
        rank: { rank: 3, posCount: 42, posLabel: 'QB' },
      },
      right: {
        id: 'brock-id',
        name: 'Trevor Lawrence',
        team: 'JAX',
        rank: { rank: 14, posCount: 42, posLabel: 'QB' },
      },
      state: {
        players: {
          'brock-id': { full_name: 'Brock Purdy', position: 'QB', team: 'SF' },
          'trevor-id': { full_name: 'Trevor Lawrence', position: 'QB', team: 'JAX' },
        },
        weeklyStats: {
          'brock-id': [
            { week: 1, team: 'SF', pass_yd: 309, gp: 1 },
            { week: 2, team: 'SF', pass_yd: 365, gp: 1 },
          ],
          'trevor-id': [
            { week: 1, team: 'JAX', pass_yd: 843, gp: 1 },
            { week: 2, team: 'JAX', pass_yd: 71, gp: 1 },
          ],
        },
        scheduleMap,
        selectedLeagueId: 'league',
        season: '2026',
      },
    });
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage });
  }
  const seasonFormHtml = html.slice(html.indexOf('>Season form'));
  const leftValues = [...seasonFormHtml.matchAll(/<div class="pmd-cmp-v is-left[^>]*>[\s\S]*?<span class="pmd-cmp-n[^>]*>(?:<i[^>]*>[^<]*<\/i>)?([^<]+)<\/span>/g)]
    .map(([, value]) => value);
  const rightValues = [...seasonFormHtml.matchAll(/<div class="pmd-cmp-v is-right[^>]*>[\s\S]*?<span class="pmd-cmp-n[^>]*>([^<]+)(?:<i[^>]*>[^<]*<\/i>)?<\/span>/g)]
    .map(([, value]) => value);

  assert.deepEqual(leftValues.slice(0, 5), ['QB3', '13.5', '27.0', '14.6', '2']);
  assert.deepEqual(rightValues.slice(0, 5), ['QB14', '18.3', '36.6', '33.7', '2']);
  assert.match(html, /pmd-cmp-lrow-v is-left[^>]*>14\.6<\/div>/);
  assert.match(html, /pmd-cmp-lrow-v pmd-num[^>]*>2\.8<\/div>/);
  const targetLabelsFor = (side) => [...html.matchAll(new RegExp(`<div class="pmd-cmp-fcell is-${side}">[\\s\\S]*?<span class="is-target" style="[^"]*">([^<]+)<\\/span>`, 'g'))]
    .map(([, value]) => value);
  assert.deepEqual(targetLabelsFor('left'), ['23.3', '17.2']);
  assert.deepEqual(targetLabelsFor('right'), ['21.4', '16.8']);
});
