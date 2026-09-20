import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';

// The fixture league runs a 14-week regular season (playoff_week_start 15) with
// last_scored_leg 6, so week 7 is current. Roster 1 ("You") meets roster 2
// ("Trade Partner") every week and roster 3 sits unpaired.

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page);
});

test('Schedule opens on the connected manager season and lists the remaining weeks', async ({ page }) => {
  await page.goto('/fantasy/schedule');

  await expect(page.getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');

  const table = page.getByRole('table', { name: 'Season schedule by week' });
  await expect(table).toBeVisible();

  // Weeks 1-6 are scored, so the default "remaining" view starts at week 7 and
  // runs to the last regular-season week.
  const rows = table.locator('.companion-schedule-row:not(.companion-schedule-row--head)');
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toContainText('Partner Team');
  await expect(rows.first()).toContainText('Now');

  // Playoff weeks are stated, never seeded.
  await expect(page.getByText(/Week 15 · Playoffs/)).toBeVisible();
});

test('Season view shows played weeks with their real result once completed weeks are included', async ({ page }) => {
  await page.goto('/fantasy/schedule');

  await page.getByRole('button', { name: /^Remaining/ }).click();

  const table = page.getByRole('table', { name: 'Season schedule by week' });
  const rows = table.locator('.companion-schedule-row:not(.companion-schedule-row--head)');
  await expect(rows).toHaveCount(14);

  // Week 1 is scored: the fixture's roster 1 outscores roster 2.
  await expect(rows.first().locator('.companion-schedule-result')).toHaveText('W');
});

test('All Teams groups every pairing by week and marks the connected manager', async ({ page }) => {
  await page.goto('/fantasy/schedule');

  await page.getByRole('button', { name: 'All Teams' }).click();

  await expect(page).toHaveURL(/\/fantasy\/schedule\?mode=league/);

  const weekSeven = page.locator('.companion-schedule-group').filter({ hasText: 'Week 7' }).first();
  await expect(weekSeven).toBeVisible();
  await expect(weekSeven.locator('.companion-schedule-pair--mine')).toHaveCount(1);
  await expect(weekSeven.locator('.companion-schedule-pair--mine')).toContainText('You');

  // Roster 3 is unpaired in the fixture and reads as a bye, not a missing row.
  await expect(weekSeven.locator('.companion-schedule-pair')).toHaveCount(2);
  await expect(weekSeven).toContainText('Bye');
});

test('Only my matchups narrows every week to the connected manager', async ({ page }) => {
  await page.goto('/fantasy/schedule?mode=league');

  await page.getByRole('button', { name: 'Only my matchups' }).click();

  const pairs = page.locator('.companion-schedule-pair');
  await expect(pairs).toHaveCount(14);
  await expect(page.locator('.companion-schedule-pair:not(.companion-schedule-pair--mine)')).toHaveCount(0);
});

test('A schedule row opens that week in Matchups', async ({ page }) => {
  await page.goto('/fantasy/schedule');

  const table = page.getByRole('table', { name: 'Season schedule by week' });
  await table.locator('.companion-schedule-row--interactive').first().click();

  await expect(page).toHaveURL(/\/fantasy\/matchups\?week=7/);
});
