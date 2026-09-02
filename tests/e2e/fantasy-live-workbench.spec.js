import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';
import { players as fixturePlayers } from '../fixtures/tradeFixtures.js';

const LIVE_GAMES = [
  liveGame('game-buf-kc', 'BUF', 'KC', 17, 14, '2026-10-18T17:00:00.000Z'),
  liveGame('game-det-dal', 'DET', 'DAL', 21, 20, '2026-10-18T20:25:00.000Z'),
  liveGame('game-mia-lac', 'MIA', 'LAC', 10, 13, '2026-10-19T00:20:00.000Z'),
  liveGame('game-cin-sf', 'CIN', 'SF', 14, 17, '2026-10-20T00:15:00.000Z'),
];

const FANTASY_LIVE_PRODUCTION_ROUTE = '/fantasy/live?liveSandbox=off';

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page);
  await page.route('**/api/live/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      live: {
        enabled: true,
        tier: 'paid',
        mockPlaysEnabled: true,
        accessCodeRequired: true,
      },
      session: { enabled: true, canDisable: true },
    }),
  }));
  await page.route('**/api/live/games**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: LIVE_GAMES, cache: { ageMs: 120 } }),
  }));
  await page.route('**/api/live/player-stats**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      games: Object.fromEntries(LIVE_GAMES.map((game) => [game.id, []])),
    }),
  }));
});

test('a shared same-roster play opens each contributor with only their points', async ({ page }) => {
  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    players: {
      ...fixturePlayers,
      103: { ...fixturePlayers[103], team: 'BUF' },
    },
  });
  await page.unroute('**/api/live/status');
  await page.route('**/api/live/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      live: {
        enabled: true,
        tier: 'paid',
        mockPlaysEnabled: false,
        accessCodeRequired: true,
      },
      session: { enabled: true, canDisable: true },
    }),
  }));
  await page.route('**/api/live/game/*/plays', (route) => {
    const gameId = route.request().url().match(/\/game\/([^/]+)\/plays/)?.[1];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: gameId === 'game-buf-kc' ? [{
          id: 'shared-buf-touchdown',
          game_id: 'game-buf-kc',
          type_slug: 'passing-touchdown',
          team: { abbreviation: 'BUF' },
          possession_team: 'BUF',
          period: 2,
          clock: '3:38',
          start_down: 1,
          start_distance: 10,
          start_yard_line: 61,
          end_yard_line: 100,
          start_yards_to_endzone: 39,
          end_yards_to_endzone: 0,
          short_text: 'Flex Receiver 39 yard pass from Pocket Commander for a touchdown',
          text: 'Pocket Commander pass complete to Flex Receiver for 39 yards, touchdown.',
          stat_yardage: 39,
          scoring_play: true,
          touchdown: true,
          wallclock: '2026-10-18T18:20:00.000Z',
          away_score: 23,
          home_score: 14,
        }] : [],
      }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  const sharedRow = page.locator('.fl-play').filter({ hasText: 'Pocket Commander' }).filter({ hasText: 'Flex Receiver' });
  await expect(sharedRow).toHaveCount(1);
  await sharedRow.click();
  await expect(page.locator('.fl-exp .dpb')).toBeVisible();
  await expect(page.locator('.fl-exp .dpb-fantasy')).toHaveText(/^[+\u2212-]\d+\.\d$/);

  const qbBreakdown = page.getByRole('button', { name: 'Pocket Commander breakdown' });
  const receiverBreakdown = page.getByRole('button', { name: 'Flex Receiver breakdown' });
  await expect(qbBreakdown).toBeVisible();
  await expect(receiverBreakdown).toBeVisible();

  await receiverBreakdown.click();
  await expect(page.locator('.fl-analysis-stage .fl-phead__name')).toHaveText('Flex Receiver');
  await expect(page.locator('.fl-analysis-stage .fl-brow.is-selected .fl-brow__p')).toHaveText('+10.9');

  await qbBreakdown.click();
  await expect(page.locator('.fl-analysis-stage .fl-phead__name')).toHaveText('Pocket Commander');
  await expect(page.locator('.fl-analysis-stage .fl-brow.is-selected .fl-brow__p')).toHaveText('+5.6');
});

test('Fantasy Live shows an inactive-season state instead of a stale league week', async ({ page }) => {
  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    nflState: {
      season: '2026',
      season_type: 'pre',
      week: 1,
      leg: 0,
      display_week: 1,
      league_season: '2026',
    },
  });
  await page.route('**/api/live/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      live: {
        enabled: false,
        apiKeyReady: true,
        leagueScopeEnabled: false,
        cookieSigningReady: true,
      },
      session: { enabled: false },
    }),
  }));

  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.locator('.fl-top__l')).toHaveCount(0);
  await expect(page.getByText('No active matchup', { exact: true })).toBeVisible();
  await expect(page.getByText('There is no fantasy matchup this week. Fantasy Live begins with the NFL regular season.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Live · Week/)).toHaveCount(0);
  await expect(page.getByText('Matchup', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Live scoring options' }).click();
  await expect(page.getByText('Live scoring needs an allowed Sleeper league ID.', { exact: true })).toBeVisible();
});

test('Fantasy Live starts an allowlisted no-code session without showing the enable gate', async ({ page }) => {
  let statusCalls = 0;
  await page.unroute('**/api/live/status');
  await page.route('**/api/live/status', (route) => {
    statusCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        live: {
          enabled: true,
          tier: 'paid',
          mockPlaysEnabled: false,
          accessCodeRequired: false,
          leagueAllowed: true,
        },
        session: { enabled: statusCalls > 1, canDisable: true },
      }),
    });
  });
  await page.route('**/api/live/session', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, session: { enabled: true, canDisable: true } }),
    });
  });

  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => statusCalls).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Turn on live scoring for this league', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Turn on Live' })).toHaveCount(0);
  await expect(page.getByText(/No matchup games live|matchup games live/)).toBeVisible();
});

test('Fantasy Live keeps the access control available outside the active NFL season', async ({ page }) => {
  await page.unroute('**/api/live/status');
  await page.route('**/api/live/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      live: {
        enabled: true,
        tier: 'paid',
        accessCodeRequired: false,
      },
      session: { enabled: false },
    }),
  }));
  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    nflState: {
      season: '2026',
      season_type: 'pre',
      week: 1,
      leg: 0,
      display_week: 1,
      league_season: '2026',
    },
  });

  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.getByText('Turn on live scoring for this league', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn on Live' })).toHaveCount(1);
  await expect(page.getByText('There is no fantasy matchup this week. Fantasy Live begins with the NFL regular season.', { exact: true })).toBeVisible();
});

test('Fantasy Live reopens the enable gate after turning off the browser session', async ({ page }) => {
  await page.route('**/api/live/session', (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, session: { enabled: false } }),
    });
  });

  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);
  await page.getByRole('button', { name: 'Live scoring options' }).click();

  const turnOff = page.getByRole('button', { name: 'Turn off live scoring for this browser' });
  await expect(turnOff).toHaveCount(1);
  await turnOff.click();

  await expect(page.getByText('Turn on live scoring for this league', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn on Live' })).toHaveCount(1);
});

test('Fantasy Live keeps ordinary sessions from turning Live off', async ({ page }) => {
  await page.unroute('**/api/live/status');
  await page.route('**/api/live/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      live: {
        enabled: true,
        tier: 'paid',
        accessCodeRequired: true,
      },
      session: { enabled: true, canDisable: false },
    }),
  }));

  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);
  await page.getByRole('button', { name: 'Live scoring options' }).click();

  await expect(page.getByRole('button', { name: 'Turn off live scoring for this browser' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auto-updating' })).toBeVisible();
  await expect(page.getByText('Turning off Live requires the server passphrase used to enable this session.', { exact: true })).toBeVisible();
});

test('Fantasy Live keeps the league week visible without lighting up for an unrelated live game', async ({ page }) => {
  const unrelatedLiveGame = liveGame('game-cle-lv', 'CLE', 'LV', 10, 7, '2026-10-18T17:00:00.000Z');
  await page.route('**/api/live/games**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: [unrelatedLiveGame], cache: { ageMs: 120 } }),
  }));
  await page.route('**/api/live/player-stats**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, games: { [unrelatedLiveGame.id]: [] } }),
  }));

  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.getByText('Live · Week 7', { exact: true })).toBeVisible();
  await expect(page.locator('.fl-live-dot')).toHaveCount(0);
  await expect(page.getByText(/No matchup games live/)).toBeVisible();

  await page.getByRole('button', { name: 'Live scoring options' }).click();
  await expect(page.getByText('Matchup games live', { exact: true })).toBeVisible();
  await expect(page.locator('.companion-live-details dd').filter({ hasText: /^0$/ })).toHaveCount(1);
});

test('desktop Live keeps the feed and chart side by side with synchronized replay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.locator('.fl-live-dot')).toHaveCount(1);
  await expect(page.getByText(/4 matchup games live/)).toBeVisible();
  await expect.poll(() => page.locator('.fl-play').count()).toBeGreaterThan(8);
  await expect.poll(() => page.locator('.fl-chart__mark').count()).toBeGreaterThan(2);
  await expect(page.locator('.fl-desk__rail')).toHaveCount(0);
  await expect(page.locator('.fl-lead__head')).toHaveCount(0);

  const chartGeometry = await page.locator('.fl-chart svg').evaluate((element) => {
    const plot = element.getBoundingClientRect();
    const chart = element.closest('.fl-chart');
    const viewport = element.closest('.fl-chart__viewport');
    const analysis = element.closest('.fl-analysis-stage');
    const content = document.querySelector('.content-area')?.getBoundingClientRect();
    const board = document.querySelector('.fl-live-board')?.getBoundingClientRect();
    const feed = document.querySelector('.fl-feed-scroll')?.getBoundingClientRect();
    const controls = document.querySelector('.fl-controls')?.getBoundingClientRect();
    const future = element.querySelector('.fl-chart__future');
    return {
      width: plot.width,
      height: plot.height,
      heightAttribute: Number(element.getAttribute('height') ?? 0),
      contentWidth: content?.width ?? 0,
      boardWidth: board?.width ?? 0,
      chart: chart ? (() => {
        const bounds = chart.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, overflow: getComputedStyle(chart).overflow };
      })() : null,
      viewportOverflowX: viewport ? getComputedStyle(viewport).overflowX : '',
      viewportHeight: viewport?.getBoundingClientRect().height ?? 0,
      analysisHeight: analysis?.getBoundingClientRect().height ?? 0,
      plot: { top: plot.top, bottom: plot.bottom, overflow: getComputedStyle(element).overflow },
      feed: feed ? { top: feed.top, right: feed.right, height: feed.height } : null,
      controls: controls ? { top: controls.top, left: controls.left, height: controls.height } : null,
      futureWidth: Number(future?.getAttribute('width') ?? 0),
    };
  });
  expect(chartGeometry.width).toBeGreaterThan(600);
  expect(chartGeometry.boardWidth / chartGeometry.contentWidth).toBeGreaterThan(0.9);
  expect(chartGeometry.height).toBeGreaterThan(0);
  expect(Math.abs(chartGeometry.height - chartGeometry.viewportHeight)).toBeLessThanOrEqual(1);
  expect(chartGeometry.height).toBeLessThan(chartGeometry.analysisHeight);
  expect(Math.abs(chartGeometry.height - chartGeometry.heightAttribute)).toBeLessThanOrEqual(1);
  expect(chartGeometry.chart?.overflow).toBe('hidden');
  expect(chartGeometry.viewportOverflowX).toBe('auto');
  expect(chartGeometry.plot.overflow).toBe('hidden');
  expect(chartGeometry.plot.top).toBeGreaterThanOrEqual((chartGeometry.chart?.top ?? 0) - 1);
  expect(chartGeometry.plot.bottom).toBeLessThanOrEqual((chartGeometry.chart?.bottom ?? 0) + 1);
  expect(chartGeometry.futureWidth).toBeGreaterThan(0);
  expect(Math.abs(chartGeometry.feed.top - chartGeometry.controls.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(chartGeometry.feed.right - chartGeometry.controls.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(chartGeometry.feed.height - chartGeometry.controls.height)).toBeLessThanOrEqual(1);

  const feed = page.locator('.fl-feed-scroll');
  const feedGeometry = await feed.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(feedGeometry.overflowY).toBe('auto');
  expect(feedGeometry.scrollHeight).toBeGreaterThan(feedGeometry.clientHeight);

  const readability = await page.locator('.fl-live-board').evaluate((board) => {
    const railAvatar = board.querySelector('.fl-rail__av');
    const railName = board.querySelector('.fl-rail__nm');
    const railPoints = board.querySelector('.fl-rail__pv');
    const play = board.querySelector('.fl-play');
    const playAvatar = board.querySelector('.fl-play__av');
    const playName = board.querySelector('.fl-play__nm');
    const playDescription = board.querySelector('.fl-play__desc');
    const playMeta = board.querySelector('.fl-play__l3');
    return {
      railAvatar: railAvatar?.getBoundingClientRect().width ?? 0,
      railNameSize: Number.parseFloat(getComputedStyle(railName).fontSize),
      railPointsSize: Number.parseFloat(getComputedStyle(railPoints).fontSize),
      railOpacity: Number.parseFloat(getComputedStyle(railName.closest('.fl-rail__pf')).opacity),
      playHeight: play?.getBoundingClientRect().height ?? 0,
      playAvatar: playAvatar?.getBoundingClientRect().width ?? 0,
      playNameSize: Number.parseFloat(getComputedStyle(playName).fontSize),
      playDescriptionSize: Number.parseFloat(getComputedStyle(playDescription).fontSize),
      playMetaSize: Number.parseFloat(getComputedStyle(playMeta).fontSize),
    };
  });
  expect(readability.railAvatar).toBeGreaterThanOrEqual(52);
  expect(readability.railNameSize).toBeGreaterThanOrEqual(13);
  expect(readability.railPointsSize).toBeGreaterThanOrEqual(15);
  expect(readability.railOpacity).toBe(1);
  expect(readability.playHeight).toBeGreaterThanOrEqual(80);
  expect(readability.playAvatar).toBeGreaterThanOrEqual(52);
  expect(readability.playNameSize).toBeGreaterThanOrEqual(16);
  expect(readability.playDescriptionSize).toBeGreaterThanOrEqual(14);
  expect(readability.playMetaSize).toBeGreaterThanOrEqual(12);

  const contentArea = page.locator('.content-area');
  const pageScrollBeforeFeed = await contentArea.evaluate((element) => element.scrollTop);
  await feed.evaluate((element) => {
    element.scrollTop = Math.min(180, element.scrollHeight - element.clientHeight);
  });
  expect(await feed.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await contentArea.evaluate((element) => element.scrollTop)).toBe(pageScrollBeforeFeed);

  const liveScores = await page.locator('.fl-hero__score').allTextContents();
  const pageScrollBefore = await contentArea.evaluate((element) => element.scrollTop);
  const dismissUpdate = page.getByRole('button', { name: 'Dismiss update notice' });
  if (await dismissUpdate.isVisible()) await dismissUpdate.click();
  const markCount = await page.locator('.fl-chart__mark').count();
  const selectedMark = page.locator('.fl-chart__mark').nth(Math.floor(markCount / 2));
  await selectedMark.click();

  await expect(page.getByRole('button', { name: 'Back to live' })).toBeVisible();
  await expect(page.locator('.fl-chart__mark.is-selected')).toHaveCount(1);
  await expect(page.locator('.fl-play.is-selected')).toHaveCount(1);
  const replayScores = await page.locator('.fl-hero__score').allTextContents();
  expect(replayScores).not.toEqual(liveScores);

  const pageScrollAfter = await contentArea.evaluate((element) => element.scrollTop);
  expect(Math.abs(pageScrollAfter - pageScrollBefore)).toBeLessThanOrEqual(6);

  await expect.poll(() => page.evaluate(() => {
    const scroller = document.querySelector('.fl-feed-scroll');
    const filter = scroller.querySelector('.fl-filter-wrap');
    const row = scroller.querySelector('.fl-play.is-selected');
    return Math.abs(row.getBoundingClientRect().top - filter.getBoundingClientRect().bottom);
  })).toBeLessThanOrEqual(2);

  const performerCount = await page.locator('.fl-rail__pf').count();
  await page.locator('.fl-rail__pf').nth(Math.min(1, performerCount - 1)).click();
  await expect(page.locator('.fl-analysis-stage .fl-sheet')).toBeVisible();
  await expect(page.locator('.fl-analysis-stage .fl-chart')).toHaveCount(0);
  await expect(page.locator('.fl-feed-column')).toBeVisible();
  await expect(page.locator('.fl-lead__head')).toHaveCount(0);

  const closeBreakdown = page.getByRole('button', { name: 'Close player breakdown' });
  const breakdownReadability = await page.locator('.fl-analysis-stage .fl-sheet').evaluate((sheet) => {
    const close = sheet.querySelector('.fl-phead__back');
    const scoringRow = sheet.querySelector('.fl-brow__l');
    return {
      closeHeight: close?.getBoundingClientRect().height ?? 0,
      closeColor: getComputedStyle(close).color,
      expectedCloseColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-label-secondary').trim(),
      closeFontSize: Number.parseFloat(getComputedStyle(close).fontSize),
      rowFontSize: scoringRow ? Number.parseFloat(getComputedStyle(scoringRow).fontSize) : 0,
      bodyWidth: sheet.querySelector('.fl-pbody')?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(breakdownReadability.closeHeight).toBeGreaterThanOrEqual(44);
  expect(breakdownReadability.closeColor).toBe(breakdownReadability.expectedCloseColor);
  expect(breakdownReadability.closeFontSize).toBeGreaterThanOrEqual(14);
  expect(breakdownReadability.rowFontSize).toBeGreaterThanOrEqual(14);
  expect(breakdownReadability.bodyWidth).toBeLessThanOrEqual(1201);

  await closeBreakdown.focus();
  await expect.poll(() => closeBreakdown.evaluate((button) => (
    Number.parseFloat(getComputedStyle(button).outlineWidth)
  ))).toBeGreaterThanOrEqual(2);

  await closeBreakdown.click();
  await expect(page.locator('.fl-analysis-stage .fl-chart')).toBeVisible();
  await page.getByRole('button', { name: 'Back to live' }).click();
  await expect(page.getByRole('button', { name: 'Back to live' })).toHaveCount(0);
  await expect(page.locator('.fl-chart__mark.is-selected')).toHaveCount(0);
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
});

test('desktop Live fits the route viewport without document scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.locator('.fl-chart svg')).toBeVisible();
  const geometry = await page.locator('.content-area').evaluate((content) => {
    const shell = content.querySelector('.companion-live-shell')?.getBoundingClientRect();
    const board = content.querySelector('.fl-live-board')?.getBoundingClientRect();
    const feed = content.querySelector('.fl-feed-scroll')?.getBoundingClientRect();
    const chartViewport = content.querySelector('.fl-chart__viewport')?.getBoundingClientRect();
    const bounds = content.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(content).overflowY,
      scrollDelta: content.scrollHeight - content.clientHeight,
      contentBottom: bounds.bottom,
      shellBottom: shell?.bottom ?? 0,
      boardHeight: board?.height ?? 0,
      feedHeight: feed?.height ?? 0,
      chartHeight: chartViewport?.height ?? 0,
    };
  });

  expect(geometry.overflowY).toBe('hidden');
  expect(geometry.scrollDelta).toBeLessThanOrEqual(1);
  expect(geometry.shellBottom).toBeLessThanOrEqual(geometry.contentBottom + 1);
  expect(geometry.boardHeight).toBeGreaterThan(0);
  expect(Math.abs(geometry.feedHeight - geometry.boardHeight)).toBeLessThanOrEqual(1);
  expect(geometry.chartHeight).toBeGreaterThan(0);
});

test('desktop Live preserves an interactive chart on an unusually short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.locator('.fl-chart svg')).toBeVisible();
  const geometry = await page.locator('.content-area').evaluate((content) => {
    const chart = content.querySelector('.fl-chart__viewport')?.getBoundingClientRect();
    const rail = content.querySelector('.fl-rail')?.getBoundingClientRect();
    const railAvatar = content.querySelector('.fl-rail__av');
    const railName = content.querySelector('.fl-rail__nm');
    const railPoints = content.querySelector('.fl-rail__pv');
    const railItem = content.querySelector('.fl-rail__pf');
    return {
      scrollDelta: content.scrollHeight - content.clientHeight,
      chartHeight: chart?.height ?? 0,
      railHeight: rail?.height ?? 0,
      railAvatar: railAvatar?.getBoundingClientRect().width ?? 0,
      railNameSize: Number.parseFloat(getComputedStyle(railName).fontSize),
      railPointsSize: Number.parseFloat(getComputedStyle(railPoints).fontSize),
      railOpacity: Number.parseFloat(getComputedStyle(railItem).opacity),
    };
  });

  expect(geometry.scrollDelta).toBeLessThanOrEqual(1);
  expect(geometry.chartHeight).toBeGreaterThanOrEqual(80);
  expect(geometry.railHeight).toBeLessThanOrEqual(64);
  expect(geometry.railAvatar).toBeGreaterThanOrEqual(44);
  expect(geometry.railNameSize).toBeGreaterThanOrEqual(13);
  expect(geometry.railPointsSize).toBeGreaterThanOrEqual(15);
  expect(geometry.railOpacity).toBe(1);
});

test('desktop Live expands across a wide monitor instead of stopping at the workbench cap', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect(page.locator('.fl-chart svg')).toBeVisible();
  const geometry = await page.locator('.content-area').evaluate((content) => {
    const styles = getComputedStyle(content);
    const shell = content.querySelector('.companion-live-shell');
    const board = content.querySelector('.fl-live-board');
    const railAvatar = content.querySelector('.fl-rail__av');
    const railName = content.querySelector('.fl-rail__nm');
    const railPoints = content.querySelector('.fl-rail__pv');
    const railItem = content.querySelector('.fl-rail__pf');
    const availableWidth = content.clientWidth
      - Number.parseFloat(styles.paddingLeft)
      - Number.parseFloat(styles.paddingRight);
    return {
      availableWidth,
      shellWidth: shell?.getBoundingClientRect().width ?? 0,
      boardWidth: board?.getBoundingClientRect().width ?? 0,
      shellMaxWidth: shell ? getComputedStyle(shell).maxWidth : '',
      railAvatar: railAvatar?.getBoundingClientRect().width ?? 0,
      railNameSize: Number.parseFloat(getComputedStyle(railName).fontSize),
      railPointsSize: Number.parseFloat(getComputedStyle(railPoints).fontSize),
      railOpacity: Number.parseFloat(getComputedStyle(railItem).opacity),
    };
  });

  expect(geometry.availableWidth).toBeGreaterThan(2200);
  expect(Math.abs(geometry.shellWidth - geometry.availableWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.boardWidth - geometry.shellWidth)).toBeLessThanOrEqual(2);
  expect(geometry.shellMaxWidth).toBe('none');
  expect(geometry.railAvatar).toBeGreaterThanOrEqual(64);
  expect(geometry.railNameSize).toBeGreaterThanOrEqual(14);
  expect(geometry.railPointsSize).toBeGreaterThanOrEqual(18);
  expect(geometry.railOpacity).toBe(1);
});

test('Fantasy Live sandbox can fill the completed demo week immediately', async ({ page }) => {
  await page.goto('/fantasy/live');

  const fullWeek = page.getByRole('button', { name: 'Fill replay with the full week' });
  const sandboxAvailable = await fullWeek.waitFor({ state: 'attached', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!sandboxAvailable, 'Requires a server built with VITE_LIVE_SANDBOX=true.');
  await expect(fullWeek).toBeVisible();
  await fullWeek.click();

  await expect(page.getByRole('slider', { name: 'Replay position' })).toHaveValue('1');
  await expect(page.locator('.live-sandbox-pct')).toHaveText('100%');
  await expect(fullWeek).toBeDisabled();
});

test('Fantasy Live pace chart zooms and scrolls without moving the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => page.locator('.fl-chart__mark').count()).toBeGreaterThan(2);
  const chartViewport = page.locator('.fl-chart__viewport');
  const pageScroller = page.locator('.content-area');
  const pageScrollBeforeZoom = await pageScroller.evaluate((element) => element.scrollTop);
  const pinchClientX = 720;
  const anchorBeforePinch = await chartViewport.evaluate((element, clientX) => {
    const rect = element.getBoundingClientRect();
    return (element.scrollLeft + clientX - rect.left) / element.scrollWidth;
  }, pinchClientX);

  await chartViewport.dispatchEvent('wheel', {
    ctrlKey: true,
    deltaY: -10,
    clientX: pinchClientX,
  });
  await expect.poll(() => chartViewport.evaluate((element) => {
    const svg = element.querySelector('svg');
    return svg ? svg.getBoundingClientRect().width / element.clientWidth : 1;
  })).toBeGreaterThan(1.05);
  const firstPinchRatio = await chartViewport.evaluate((element) => (
    element.querySelector('svg').getBoundingClientRect().width / element.clientWidth
  ));
  expect(firstPinchRatio).toBeLessThan(1.25);
  const anchorAfterPinch = await chartViewport.evaluate((element, clientX) => {
    const rect = element.getBoundingClientRect();
    return (element.scrollLeft + clientX - rect.left) / element.scrollWidth;
  }, pinchClientX);
  expect(Math.abs(anchorAfterPinch - anchorBeforePinch)).toBeLessThan(0.01);

  await chartViewport.dispatchEvent('wheel', {
    ctrlKey: true,
    deltaY: -10,
    clientX: pinchClientX,
  });
  await expect.poll(() => chartViewport.evaluate((element) => (
    element.querySelector('svg').getBoundingClientRect().width / element.clientWidth
  ))).toBeGreaterThan(firstPinchRatio + 0.05);
  await page.getByRole('button', { name: /Reset chart zoom from/ }).click();

  await page.getByRole('button', { name: 'Zoom chart in' }).click();
  await expect(page.getByRole('button', { name: 'Reset chart zoom from 1.5 times' })).toBeVisible();
  await expect.poll(() => chartViewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
  await chartViewport.evaluate((element) => {
    element.scrollLeft = Math.min(160, element.scrollWidth - element.clientWidth);
  });
  expect(await chartViewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await pageScroller.evaluate((element) => element.scrollTop)).toBe(pageScrollBeforeZoom);

  await page.getByRole('button', { name: 'Reset chart zoom from 1.5 times' }).click();
  await expect.poll(() => chartViewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => chartViewport.evaluate((element) => element.scrollLeft)).toBeLessThanOrEqual(1);
});

test('Fantasy Live tracker follows the pointer and only snaps near a score dot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => page.locator('.fl-chart__mark').count()).toBeGreaterThan(2);
  const chart = page.locator('.fl-chart svg');
  const geometry = await chart.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const mark = element.querySelector('.fl-chart__mark');
    const dot = mark?.querySelector('circle:last-of-type');
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      markX: Number(dot?.getAttribute('cx') ?? 0),
      markY: Number(dot?.getAttribute('cy') ?? 0),
    };
  });

  const freeX = Math.min(geometry.width - 80, Math.max(40, geometry.markX + 28));
  await page.mouse.move(geometry.left + freeX, geometry.top + 20);
  await expect.poll(() => chart.locator('.fl-chart__scrub').getAttribute('x1').then(Number))
    .toBeCloseTo(freeX, 0);

  await page.mouse.move(geometry.left + geometry.markX + 6, geometry.top + geometry.markY + 6);
  await expect.poll(() => chart.locator('.fl-chart__scrub').getAttribute('x1').then(Number))
    .toBeCloseTo(geometry.markX, 0);

  const verticallyDistantY = geometry.markY < geometry.height / 2
    ? geometry.markY + 30
    : geometry.markY - 30;
  await page.mouse.move(geometry.left + geometry.markX + 8, geometry.top + verticallyDistantY);
  await expect.poll(() => chart.locator('.fl-chart__scrub').getAttribute('x1').then(Number))
    .toBeCloseTo(geometry.markX + 8, 0);

  const detachedDots = await chart.evaluate((element) => {
    const paths = Object.fromEntries(Array.from(element.querySelectorAll('.fl-chart__line')).map((path) => {
      const coordinates = Array.from((path.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g))
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      return [path.dataset.side, coordinates];
    }));
    const distanceToSegment = (point, start, end) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const ratio = lengthSquared
        ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
        : 0;
      return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
    };

    return Array.from(element.querySelectorAll('.fl-chart__mark')).filter((mark) => {
      const dot = mark.querySelector('circle:last-of-type');
      const point = {
        x: Number(dot?.getAttribute('cx') ?? 0),
        y: Number(dot?.getAttribute('cy') ?? 0),
      };
      const coordinates = paths[mark.dataset.side] ?? [];
      const distance = coordinates.slice(1).reduce((closest, end, index) => (
        Math.min(closest, distanceToSegment(point, coordinates[index], end))
      ), Number.POSITIVE_INFINITY);
      return distance > 0.75;
    }).length;
  });
  expect(detachedDots).toBe(0);
});

test('desktop minimum width keeps the feed beside the chart when the pane permits', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => page.locator('.fl-play').count()).toBeGreaterThan(8);
  const geometry = await page.locator('.fl-live-board').evaluate((element) => {
    const feed = element.querySelector('.fl-feed-column')?.getBoundingClientRect();
    const controls = element.querySelector('.fl-controls')?.getBoundingClientRect();
    return {
      display: getComputedStyle(element).display,
      feedWidth: feed?.width ?? 0,
      feedRight: feed?.right ?? 0,
      controlsWidth: controls?.width ?? 0,
      controlsLeft: controls?.left ?? 0,
    };
  });

  expect(geometry.display).toBe('grid');
  expect(geometry.feedWidth).toBeGreaterThanOrEqual(280);
  expect(geometry.controlsWidth).toBeGreaterThanOrEqual(440);
  expect(Math.abs(geometry.feedRight - geometry.controlsLeft)).toBeLessThanOrEqual(1);
});

test('desktop pace chart stays inside its panel on a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => page.locator('.fl-chart__mark').count()).toBeGreaterThan(2);
  const geometry = await page.locator('.fl-chart svg').evaluate((element) => {
    const plot = element.getBoundingClientRect();
    const panelElement = element.closest('.fl-chart');
    const panel = panelElement?.getBoundingClientRect();
    const directLines = Array.from(element.querySelectorAll('.fl-chart__line')).map((line) => {
      const coordinates = Array.from((line.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g))
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      return coordinates.length > 2 && coordinates.slice(1).every((point, index) => {
        const previous = coordinates[index];
        const isLiveTail = index === coordinates.length - 2;
        return point.x !== previous.x && (point.y !== previous.y || isLiveTail);
      });
    });
    return {
      plot: { top: plot.top, bottom: plot.bottom, height: plot.height },
      panel: panel ? { top: panel.top, bottom: panel.bottom } : null,
      intrinsicHeight: Number(element.getAttribute('height') ?? 0),
      plotOverflow: getComputedStyle(element).overflow,
      panelOverflow: panelElement ? getComputedStyle(panelElement).overflow : '',
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      directLines,
    };
  });

  expect(geometry.plot.height).toBeLessThanOrEqual(geometry.viewportHeight * 0.42 + 1);
  expect(Math.abs(geometry.plot.height - geometry.intrinsicHeight)).toBeLessThanOrEqual(1);
  expect(geometry.plotOverflow).toBe('hidden');
  expect(geometry.panelOverflow).toBe('hidden');
  expect(geometry.directLines).toEqual([true, true]);
  expect(geometry.plot.top).toBeGreaterThanOrEqual((geometry.panel?.top ?? 0) - 1);
  expect(geometry.plot.bottom).toBeLessThanOrEqual((geometry.panel?.bottom ?? 0) + 1);
});

test('mobile Live replaces the graph with the selected player while keeping the feed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => page.locator('.fl-play').count()).toBeGreaterThan(8);
  await expect(page.locator('.fl-chart__head')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('.fl-chart__head-view.is-summary')).toBeHidden();
  await expect(page.locator('.fl-rail')).toBeVisible();
  const analysisOrder = await page.locator('.fl-controls').evaluate((controls) => ({
    rail: Array.from(controls.children).findIndex((child) => child.matches('.fl-rail')),
    stage: Array.from(controls.children).findIndex((child) => child.matches('.fl-analysis-stage')),
  }));
  expect(analysisOrder.rail).toBeLessThan(analysisOrder.stage);

  const performerCount = await page.locator('.fl-rail__pf').count();
  await page.locator('.fl-rail__pf').nth(Math.min(1, performerCount - 1)).click();
  await expect(page.locator('.fl-analysis-stage .fl-sheet')).toBeVisible();
  await expect(page.locator('.fl-analysis-stage .fl-chart')).toHaveCount(0);
  await expect(page.locator('.fl-feed-column')).toBeVisible();
  const closeBreakdown = page.getByRole('button', { name: 'Close player breakdown' });
  await expect(closeBreakdown).toBeVisible();
  expect((await closeBreakdown.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await closeBreakdown.click();
  await expect(page.locator('.fl-analysis-stage .fl-chart')).toBeVisible();
  await page.getByRole('button', { name: 'Zoom chart in' }).click();
  const mobileZoomGeometry = await page.locator('.fl-chart').evaluate((element) => {
    const viewport = element.querySelector('.fl-chart__viewport');
    const svg = element.querySelector('svg');
    const zoomButton = element.querySelector('[aria-label="Zoom chart out"]');
    return {
      overflowX: viewport ? getComputedStyle(viewport).overflowX : '',
      overflowWidth: viewport ? viewport.scrollWidth - viewport.clientWidth : 0,
      touchAction: svg ? getComputedStyle(svg).touchAction : '',
      zoomButtonHeight: zoomButton?.getBoundingClientRect().height ?? 0,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      controlHeight: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-height')),
    };
  });
  expect(mobileZoomGeometry.overflowX).toBe('auto');
  expect(mobileZoomGeometry.overflowWidth).toBeGreaterThan(100);
  expect(mobileZoomGeometry.touchAction).toContain('pan-x');
  expect(mobileZoomGeometry.zoomButtonHeight).toBeGreaterThanOrEqual(
    Math.max(mobileZoomGeometry.controlHeight, mobileZoomGeometry.coarsePointer ? 44 : 0),
  );
});

test('mobile Live shields the feed through the sticky filter inset', async ({ page }) => {
  await page.setViewportSize({ width: 835, height: 720 });
  await page.goto(FANTASY_LIVE_PRODUCTION_ROUTE);

  await expect.poll(() => page.locator('.fl-play').count()).toBeGreaterThan(8);
  const contentArea = page.locator('.content-area');
  await contentArea.evaluate((element) => {
    const filter = element.querySelector('.fl-filter-wrap');
    const firstPlay = element.querySelector('.fl-play');
    if (!filter || !firstPlay) return;
    const contentBounds = element.getBoundingClientRect();
    const paddingTop = Number.parseFloat(getComputedStyle(element).paddingTop) || 0;
    const filterTop = filter.getBoundingClientRect().top;
    const firstPlayBottom = firstPlay.getBoundingClientRect().bottom;
    // Put a prior row in the inset above the sticky filter, which is the
    // boundary that previously allowed the leak shown in the bug report.
    element.scrollTop += (
      filterTop - (contentBounds.top + paddingTop)
      + firstPlayBottom - (filterTop - 2)
    );
  });

  const geometry = await contentArea.evaluate((element) => {
    const filter = element.querySelector('.fl-filter-wrap');
    const firstPlay = element.querySelector('.fl-play');
    const content = element.getBoundingClientRect();
    const filterBounds = filter?.getBoundingClientRect();
    const firstPlayBounds = firstPlay?.getBoundingClientRect();
    return {
      contentTop: content.top,
      contentPaddingTop: Number.parseFloat(getComputedStyle(element).paddingTop),
      filterTop: filterBounds?.top ?? 0,
      firstPlayBottom: firstPlayBounds?.bottom ?? 0,
      shieldHeight: filter
        ? Number.parseFloat(getComputedStyle(filter, '::before').height)
        : 0,
    };
  });

  expect(Math.abs(geometry.filterTop - (geometry.contentTop + geometry.contentPaddingTop))).toBeLessThanOrEqual(1);
  expect(geometry.firstPlayBottom).toBeLessThanOrEqual(geometry.filterTop);
  expect(geometry.shieldHeight).toBeGreaterThanOrEqual(geometry.contentPaddingTop - 1);
});

function liveGame(id, visitorTeam, homeTeam, visitorScore, homeScore, date) {
  return {
    id,
    visitor_team: { abbreviation: visitorTeam },
    home_team: { abbreviation: homeTeam },
    visitor_team_score: visitorScore,
    home_team_score: homeScore,
    status: '3rd Quarter',
    period: 3,
    time: '06:42',
    date,
  };
}
