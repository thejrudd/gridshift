import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server;
let HoverCard;
before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
  });
  HoverCard = (await server.ssrLoadModule('/src/components/companion/matchup/MatchupPlayerHoverCard.jsx')).default;
});
after(async () => { await server?.close(); });

const chips = html => [...html.matchAll(/<div class="matchup-hover-card__chips">(.*?)<\/div>/g)]
  .flatMap(([, inner]) => [...inner.matchAll(/<span>(.*?)<\/span>/g)].map(([, text]) => text));

function render(position, weeklyRows, { state = 'pregame', week = 4 } = {}) {
  return renderToStaticMarkup(createElement(HoverCard, {
    player: { name: 'Test Player', position, projection: { projected: 10 } },
    state,
    week,
    weeklyRows,
    scoringSettings: { idp_tkl_solo: 1, idp_sack: 4, sack: 1, int: 2, rec: 1, rec_yd: 0.1, fgm: 3, xpm: 1 },
    sideColor: '#000',
  }));
}

test('a linebacker shows defensive season totals, never receiving stats', () => {
  const html = render('LB', [
    { week: 1, idp_tkl: 9, idp_tkl_solo: 6, idp_sack: 1, idp_pass_def: 1 },
    { week: 2, idp_tkl: 7, idp_tkl_solo: 5, idp_tkl_loss: 2 },
  ]);
  const list = chips(html);
  assert.deepEqual(list, ['16 tackles', '1 sack', '2 TFL', '1 pass defended']);
  assert.ok(!list.some(chip => /\brec\b|yds/i.test(chip)), 'no receiving chips');
});

test('a defensive lineman always shows sacks, and tackles fall back to solo plus assisted', () => {
  assert.deepEqual(chips(render('DE', [{ week: 1, idp_tkl_solo: 2, idp_tkl_ast: 1 }])), ['3 tackles', '0 sacks']);
});

test('a team defense shows sacks, takeaways and points allowed a game', () => {
  const list = chips(render('DEF', [
    { week: 1, sack: 3, int: 1, fum_rec: 1, pts_allow: 17 },
    { week: 2, sack: 2, int: 0, def_td: 1, pts_allow: 24 },
  ]));
  assert.deepEqual(list, ['5 sacks', '2 takeaways', '1 TD', '20.5 pts allowed a game']);
});

test('a kicker and a receiver keep their own stats', () => {
  assert.deepEqual(chips(render('K', [{ week: 1, fgm: 2, xpm: 3 }])), ['2 FG', '3 XP']);
  assert.deepEqual(chips(render('WR', [{ week: 1, rec: 5, rec_yd: 62 }])), ['5 rec · 62 yds']);
});

test('a defender’s final game line is defensive too', () => {
  const list = chips(render('CB', [{ week: 4, idp_tkl: 4, idp_int: 1, idp_pd: 2 }], { state: 'final' }));
  assert.deepEqual(list, ['4 tackles', '1 INT', '2 passes defended']);
});
