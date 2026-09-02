import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCurrentShareUrl,
  getPageShareMetadata,
  renderPageShareMetadataHtml,
} from '../../src/utils/pageShare.js';

const teams = [
  { id: 'BUF', name: 'Buffalo Bills' },
  { id: 'KC', name: 'Kansas City Chiefs' },
];

test('page metadata names the active route and selected prediction team', () => {
  assert.deepEqual(
    getPageShareMetadata({
      route: { activeTab: 'predictions', seasonView: 'predictions', predictionsTeamId: 'buf' },
      season: 2026,
      teams,
    }),
    {
      title: '2026 Buffalo Bills Prediction',
      description: 'See the Buffalo Bills forecast and season path.',
      text: '2026 Buffalo Bills Prediction — See the Buffalo Bills forecast and season path.',
      siteName: 'GridShift',
    },
  );
});

test('page metadata keeps fantasy route context without leaking league details', () => {
  const metadata = getPageShareMetadata({
    route: { activeTab: 'fantasy', companionView: 'rankings' },
    season: 2026,
    teams,
  });

  assert.equal(metadata.title, 'Fantasy Rankings · 2026');
  assert.equal(metadata.description, 'Compare fantasy players with league-aware rankings.');
  assert.equal(metadata.description.includes('League name'), false);
});

test('player metadata uses the visible player name or a direct-route slug', () => {
  assert.equal(
    getPageShareMetadata({
      route: { activeTab: 'statistics', statisticsView: 'player', statisticsPlayerSlug: 'justin-jefferson' },
      season: 2026,
    }).title,
    'Justin Jefferson · NFL Stats',
  );
  assert.equal(
    getPageShareMetadata({
      route: { activeTab: 'statistics', statisticsView: 'player', statisticsPlayerSlug: 'justin-jefferson' },
      playerMeta: { displayName: 'Justin Jefferson' },
      season: 2026,
    }).description,
    "Review Justin Jefferson's NFL and fantasy statistics.",
  );
});

test('current share URL preserves route state and prediction fragments', () => {
  assert.equal(
    getCurrentShareUrl({
      href: 'https://gridshiftapp.com/fantasy/rankings?pos=WR#gs1.abc',
      origin: 'https://gridshiftapp.com',
      pathname: '/fantasy/rankings',
      search: '?pos=WR',
      hash: '#gs1.abc',
    }),
    'https://gridshiftapp.com/fantasy/rankings?pos=WR#gs1.abc',
  );
});

test('server-readable metadata varies the static preview by route', () => {
  const html = `<!doctype html><html><head><!-- gridshift-page-share:start -->old<!-- gridshift-page-share:end --></head></html>`;
  const rendered = renderPageShareMetadataHtml(html, getPageShareMetadata({
    route: { activeTab: 'statistics', statisticsView: 'scores' },
    season: 2026,
  }));

  assert.match(rendered, /<title>NFL Scores · 2026 \| GridShift<\/title>/);
  assert.match(rendered, /property="og:title" content="NFL Scores · 2026"/);
  assert.doesNotMatch(rendered, /2026 NFL Season/);
});
