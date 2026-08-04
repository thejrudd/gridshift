import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';

const LIVE_GAMES = [
  liveGame('game-buf-kc', 'BUF', 'KC', 17, 14, '2026-10-18T17:00:00.000Z'),
  liveGame('game-det-dal', 'DET', 'DAL', 21, 20, '2026-10-18T20:25:00.000Z'),
  liveGame('game-mia-lac', 'MIA', 'LAC', 10, 13, '2026-10-19T00:20:00.000Z'),
  liveGame('game-cin-sf', 'CIN', 'SF', 14, 17, '2026-10-20T00:15:00.000Z'),
];

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
        accessCodeRequired: false,
      },
      session: { enabled: true },
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

  await page.goto('/fantasy/live');

  await expect(page.locator('.fl-top__l')).toHaveCount(0);
  await expect(page.getByText('No active matchup', { exact: true })).toBeVisible();
  await expect(page.getByText('There is no fantasy matchup this week. Fantasy Live begins with the NFL regular season.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Live · Week/)).toHaveCount(0);
  await expect(page.getByText('Matchup', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Live scoring options' }).click();
  await expect(page.getByText('Live scoring needs an allowed Sleeper league ID.', { exact: true })).toBeVisible();
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

  await page.goto('/fantasy/live');

  await expect(page.getByText('Live · Week 7', { exact: true })).toBeVisible();
  await expect(page.locator('.fl-live-dot')).toHaveCount(0);
  await expect(page.getByText(/No matchup games live/)).toBeVisible();

  await page.getByRole('button', { name: 'Live scoring options' }).click();
  await expect(page.getByText('Matchup games live', { exact: true })).toBeVisible();
  await expect(page.locator('.companion-live-details dd').filter({ hasText: /^0$/ })).toHaveCount(1);
});

test('desktop Live keeps the feed and chart side by side with synchronized replay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/fantasy/live');

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
      plot: { top: plot.top, bottom: plot.bottom, overflow: getComputedStyle(element).overflow },
      feed: feed ? { top: feed.top, right: feed.right, height: feed.height } : null,
      controls: controls ? { top: controls.top, left: controls.left, height: controls.height } : null,
      futureWidth: Number(future?.getAttribute('width') ?? 0),
    };
  });
  expect(chartGeometry.width).toBeGreaterThan(600);
  expect(chartGeometry.boardWidth / chartGeometry.contentWidth).toBeGreaterThan(0.9);
  expect(chartGeometry.height).toBeGreaterThanOrEqual(240);
  expect(chartGeometry.height / chartGeometry.width).toBeCloseTo(0.34, 1);
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

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.fl-analysis-stage .fl-chart')).toBeVisible();
  await page.getByRole('button', { name: 'Back to live' }).click();
  await expect(page.getByRole('button', { name: 'Back to live' })).toHaveCount(0);
  await expect(page.locator('.fl-chart__mark.is-selected')).toHaveCount(0);
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
});

test('Fantasy Live pace chart zooms and scrolls without moving the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/fantasy/live');

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
  await page.goto('/fantasy/live');

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
  await page.goto('/fantasy/live');

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
  await page.goto('/fantasy/live');

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
  await page.goto('/fantasy/live');

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
  await page.getByRole('button', { name: 'Close' }).click();
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
