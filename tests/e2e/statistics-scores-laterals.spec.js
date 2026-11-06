import { expect, test } from '@playwright/test';
import { lateralPlayRaw } from '../fixtures/nflLateralPlay.js';

test('Scores replays a completion, lateral, fumble recovery and return', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const game = {
    id: 1499000, season: 2026, week: 7, postseason: false,
    date: '2026-10-25T17:00:00.000Z', status: 'Final',
    visitor_team: { abbreviation: 'CAR', full_name: 'Carolina Panthers' },
    home_team: { abbreviation: 'GB', full_name: 'Green Bay Packers' },
    visitor_team_score: 10, home_team_score: 14,
  };
  const status = { provider: 'balldontlie', available: true, apiKeyReady: true, overrideAllowed: true, overrideApplied: true };
  await page.addInitScript(() => {
    localStorage.setItem('gridshift.statisticsNflPhase', 'regular');
    localStorage.setItem('gridshift:installedVersion', '9.3.7');
  });
  await page.route('**/api/statistics/scores/**', async (route) => {
    const url = new URL(route.request().url());
    const common = { ok: true, ...status, season: 2026, phase: 'regular' };
    let payload;
    if (url.pathname.endsWith('/status')) payload = common;
    else if (url.pathname.includes('/detail')) payload = {
      ...common, gameId: game.id, game, plays: [lateralPlayRaw], teamStats: [], playerStats: [], scoringPlays: [],
      coverage: { game: true, plays: true, teamStats: true, playerStats: true, scoring: true }, meta: {},
    };
    else if (url.pathname.endsWith('/espn-week')) payload = {
      ...common, provider: 'espn', week: 7, scoreboard: { events: [], leagues: [{ calendar: [] }] },
    };
    else payload = { ...common, games: [game], week: 7 };
    await route.fulfill({ json: payload });
  });
  await page.route('https://**/*', (route) => route.fulfill({ json: {} }));
  await page.goto('/statistics/scores?season=2026&phase=regular&week=7');
  await page.getByRole('group', { name: 'Data source' }).getByRole('button', { name: 'BALLDONTLIE API' }).click();
  await page.getByRole('button', { name: 'Open Carolina Panthers at Green Bay Packers game details' }).click();
  await expect(page.locator('.df-dirhint')).toHaveText('CAR attacking GB');
  await expect(page.locator('.df-head')).toContainText('9 yds');
  await page.locator('.df-playtoggle').click();
  const playback = page.getByRole('region', { name: 'Drive playback' });
  await playback.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '2×' }).click();
  await expect(playback.locator('.dpb-log [data-kind="catch"]')).toContainText('T.McMillan', { timeout: 15000 });
  await expect(playback.locator('.dpb-log [data-kind="lateral"]')).toContainText('laterals to J.Coker');
  await expect(playback.locator('.dpb-log')).toContainText('J.Coker fumbled, forced by J.Bullard.');
  await expect(playback.locator('.dpb-log')).toContainText('Recovered by B.Cox at the CAR 25.');
  await expect(playback.locator('.dpb-log [data-kind="stop"]')).toContainText('Tackled by B.Young at the CAR 22 — 3 yards.', { timeout: 15000 });
  await expect(playback.getByRole('button', { name: 'Play drive' })).toBeVisible();
  const ballLeft = await playback.locator('.dpb-ball').evaluate((ball) => parseFloat(ball.style.left));
  // Fourth-quarter orientation is mirrored; CAR 22 is (110 - 22) / 120.
  expect(ballLeft).toBeCloseTo(73.333, 1);
  expect(pageErrors).toEqual([]);
  const dismissUpdate = page.getByRole('button', { name: 'Dismiss update notice' });
  if (await dismissUpdate.isVisible()) await dismissUpdate.click();
  await playback.screenshot({ path: testInfo.outputPath('lateral-replay.png') });
  await page.locator('.df-playtoggle').click();
  await expect(page.locator('.df-lane .df-ret')).toBeVisible();
});
