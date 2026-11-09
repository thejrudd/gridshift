import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';
import { rosters } from '../fixtures/tradeFixtures.js';

// Browser coverage for the global search palette: opening it from every shell
// entry point, keyboard selection, typo correction, routing, commands, and the
// sheet-history contract that lets browser back close the palette.

const START_ROUTE = '/fantasy/rosters';
// Rosters settles by writing the selected team into the URL. Acting before that
// lands lets the late write replace the route a search result just opened.
const SETTLED_ROUTE = /\/fantasy\/rosters\?team=1$/;

function palette(page) {
  return page.getByRole('dialog', { name: 'Search GridShift' });
}

function searchInput(page) {
  return palette(page).getByRole('combobox', { name: 'Search GridShift' });
}

async function openWithShortcut(page) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(searchInput(page)).toBeFocused();
}

test.describe('desktop', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop shell entry points.');
    await installTradeFixtures(page);
    await page.goto(START_ROUTE);
    // The shortcut listener mounts with the shell; pressing earlier is lost.
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();
    await expect(page).toHaveURL(SETTLED_ROUTE);
  });

  test('opens from the shortcut and the sidebar, and shows the guide when empty', async ({ page }) => {
    await openWithShortcut(page);
    await expect(palette(page).getByRole('button', { name: 'seahwaks' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();

    await page.getByRole('button', { name: 'Search GridShift' }).click();
    await expect(palette(page)).toBeVisible();
  });

  test('corrects a typo and opens the selected team', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('seahwaks');
    await expect(palette(page).getByText('Showing results for')).toBeVisible();
    const first = palette(page).getByRole('option').first();
    await expect(first).toContainText('Seattle Seahawks');

    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/statistics\/team\/sea$/);
  });

  test('arrow keys move the selection across results', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('seattle');
    const options = palette(page).getByRole('option');
    await expect(options.nth(1)).toBeVisible();
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('runs a command', async ({ page }) => {
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await openWithShortcut(page);
    await searchInput(page).fill('dark mode');
    await expect(palette(page).getByRole('option').first()).toContainText('Toggle dark mode');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('compares two teams side by side and opens either one', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('seahawks vs bills');
    const card = palette(page).getByRole('region', { name: 'Search answer' });
    await expect(card.getByRole('heading', { name: 'Seattle Seahawks vs Buffalo Bills' })).toBeVisible();
    // Only the two teams' own games are listed, never either team's whole season.
    const games = palette(page).getByRole('option').filter({ hasText: / at / });
    for (const label of await games.allInnerTexts()) {
      expect(label).toMatch(/Seattle Seahawks/);
      expect(label).toMatch(/Buffalo Bills/);
    }

    await card.getByRole('button', { name: /Buffalo Bills/ }).click();
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/statistics\/team\/buf$/);
  });

  test('reports a query with no matches', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('zzqxv');
    await expect(palette(page).getByText('No matches for “zzqxv”.')).toBeVisible();
  });

  test('browser back closes the palette without leaving the page', async ({ page }) => {
    await openWithShortcut(page);
    await page.goBack();
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(SETTLED_ROUTE);
  });
});

test.describe('recents and suggestions', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Behaviour is shared across layouts.');
    await installTradeFixtures(page, {
      rosters: rosters.map((roster) => (
        roster.roster_id === 1 ? { ...roster, starters: ['104', '101'] } : roster
      )),
    });
    await page.goto(START_ROUTE);
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();
    await expect(page).toHaveURL(SETTLED_ROUTE);
  });

  test('suggests your starters before anything is typed', async ({ page }) => {
    await openWithShortcut(page);
    const options = palette(page).getByRole('option');
    await expect(palette(page).getByText('Your starters', { exact: true })).toBeVisible();
    await expect(options.first()).toContainText('Target Magnet');
    await expect(options.nth(1)).toContainText('Pocket Commander');
  });

  test('remembers what was searched and opened, survives a reload, and clears', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('seahawks');
    await expect(palette(page).getByRole('option').first()).toContainText('Seattle Seahawks');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/statistics\/team\/sea$/);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();
    await openWithShortcut(page);
    await expect(palette(page).getByText('Recent searches')).toBeVisible();
    await expect(palette(page).getByRole('button', { name: 'seahawks', exact: true })).toBeVisible();
    await expect(palette(page).getByText('Recent', { exact: true })).toBeVisible();
    await expect(palette(page).getByRole('option').first()).toContainText('Seattle Seahawks');

    await palette(page).getByRole('button', { name: 'seahawks', exact: true }).click();
    await expect(searchInput(page)).toHaveValue('seahawks');
    await searchInput(page).fill('');

    await palette(page).getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(palette(page).getByText('Recent searches')).toBeHidden();
    await expect(palette(page).getByText('Recent', { exact: true })).toBeHidden();
  });
});

test.describe('mobile', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile shell entry point.');
    await installTradeFixtures(page);
    await page.goto(START_ROUTE);
    await expect(page).toHaveURL(SETTLED_ROUTE);
  });

  test('opens from the top bar and selects a result by tap', async ({ page }) => {
    await page.getByRole('button', { name: 'Search GridShift' }).click();
    await expect(palette(page)).toBeVisible();
    await searchInput(page).fill('seahawks');
    const first = palette(page).getByRole('option').first();
    await expect(first).toContainText('Seattle Seahawks');
    await first.click();
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/statistics\/team\/sea$/);
  });
});
