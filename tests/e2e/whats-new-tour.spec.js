import { expect, test } from '@playwright/test';
import { WHATS_NEW } from '../../src/data/whatsNew.js';
import { buildAppPath } from '../../src/utils/appRoutes.js';
import { collapseSupersededFeatures } from '../../src/utils/versionUtils.js';
import { installTradeFixtures } from './tradeTestHarness.js';
import {
  TEST_LEAGUE_ID,
  TEST_SEASON,
  drafts,
  league,
  persistedSleeperState,
} from '../fixtures/tradeFixtures.js';

const effectiveEntries = collapseSupersededFeatures(WHATS_NEW);
const steps = effectiveEntries.flatMap((entry) => entry.features.flatMap((feature) => feature.steps.map((step) => ({
  ...step,
  featureName: feature.name,
  version: entry.version,
}))));

const HISTORICAL_TOUR_TEST = 'historical league year tour names the selected and current seasons';
const HISTORICAL_WAR_ROOM_TEST = 'historical War Room remains selected and revisitable';

function historicalTourOverrides() {
  const historicalSeason = '2025';
  const historicalLeague = { ...league, season: historicalSeason };
  const currentLeague = {
    ...league,
    league_id: 'league-current-2026',
    previous_league_id: TEST_LEAGUE_ID,
  };
  const historicalLeaguesBySeason = {
    [historicalSeason]: [historicalLeague],
    [TEST_SEASON]: [currentLeague],
  };
  return {
    league: historicalLeague,
    leaguesBySeason: historicalLeaguesBySeason,
    drafts: drafts.map((draft) => ({ ...draft, season: historicalSeason, status: 'complete' })),
    persistedSleeperState: {
      ...persistedSleeperState(),
      leagues: [historicalLeague],
      selectedLeagueId: TEST_LEAGUE_ID,
      league: historicalLeague,
      season: historicalSeason,
      availableSeasons: [historicalSeason, TEST_SEASON],
      leaguesBySeason: historicalLeaguesBySeason,
    },
  };
}

function materializeExpectedCopy(copy, replacements) {
  const render = (value) => String(value).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (token, key) => replacements[key] ?? token);
  return { title: render(copy.title), body: render(copy.body) };
}

test.beforeEach(async ({ page }, testInfo) => {
  await installTradeFixtures(
    page,
    [HISTORICAL_TOUR_TEST, HISTORICAL_WAR_ROOM_TEST].some((title) => testInfo.title.includes(title)) ? historicalTourOverrides() : {},
  );
});

test('full upgrade history replays every tour step', async ({ page, isMobile }) => {
  await page.goto('/companion/roster');

  const whatsNew = page.getByRole('dialog', { name: "What's new in GridShift" });
  await expect(whatsNew).toBeVisible();
  for (const entry of effectiveEntries) {
    await expect(whatsNew).toContainText(`v${entry.version}`);
  }
  await expect(whatsNew).not.toContainText('Draft outcome insights');
  await expect(whatsNew).toContainText('Draft Picks and Results');
  await whatsNew.getByRole('button', { name: 'Show me' }).click();

  const tour = page.getByRole('dialog', { name: 'Feature tour' });
  await expect(tour).toBeVisible();

  for (const [index, step] of steps.entries()) {
    const selector = isMobile && step.anchorMobile ? step.anchorMobile : step.anchor;
    await expect(tour).toContainText(`${step.featureName} · Step ${index + 1} of ${steps.length}`);
    if (step.route) await expect(page).toHaveURL(new RegExp(`${buildAppPath(step.route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.locator(`${selector}:visible`).first()).toBeVisible();

    const copyOptions = (step.contextKey ? Object.values(step.copyByContext) : [step])
      .map((copy) => materializeExpectedCopy(copy, {
        selectedLeagueSeason: TEST_SEASON,
        currentLeagueSeason: TEST_SEASON,
      }));
    const tooltipText = await tour.textContent();
    expect(copyOptions.some((copy) => tooltipText.includes(copy.title) && tooltipText.includes(copy.body))).toBeTruthy();

    const advance = tour.getByRole('button', { name: index === steps.length - 1 ? 'Finish' : 'Next' });
    await expect(advance).toBeVisible();
    await advance.click();
  }

  await expect(tour).toHaveCount(0);
});

test(HISTORICAL_TOUR_TEST, async ({ page }) => {
  await page.goto('/companion/roster');

  const whatsNew = page.getByRole('dialog', { name: "What's new in GridShift" });
  await whatsNew.getByRole('button', { name: 'Show me' }).click();

  const tour = page.getByRole('dialog', { name: 'Feature tour' });
  for (let index = 0; index < 3; index += 1) {
    await tour.getByRole('button', { name: 'Next' }).click();
  }

  await expect(tour).toContainText('2025 Historical Draft Results');
  await expect(tour).toContainText('You are viewing 2025 league history, not the current 2026 league year.');
  await expect(tour).toContainText('Results shows the selections recorded for this past season.');
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour).toContainText('Review 2025 Draft History');
  await expect(tour).toContainText('Switch to 2026 at the top of the page to return to your current league year.');
});

test(HISTORICAL_WAR_ROOM_TEST, async ({ page }) => {
  await page.goto('/draft/war-room');

  const whatsNew = page.getByRole('dialog', { name: "What's new in GridShift" });
  await whatsNew.getByRole('button', { name: 'Dismiss' }).click();

  const warRoomTab = page.getByRole('tab', { name: 'War Room' });
  await expect(warRoomTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/draft$/);
  await expect(page.getByText('War Room is unavailable for the 2025 league year.')).toBeVisible();
  await expect(page.getByText('The 2025 draft has already started or finished.')).toBeVisible();

  await page.getByRole('tab', { name: 'Results' }).click();
  await expect(page).toHaveURL(/\/draft\/results$/);
  await page.getByRole('tab', { name: 'War Room' }).click();

  await expect(page).toHaveURL(/\/draft$/);
  await expect(warRoomTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('War Room is unavailable for the 2025 league year.')).toBeVisible();
});
