import { expect, test } from '@playwright/test';
import { WHATS_NEW } from '../../src/data/whatsNew.js';
import { buildAppPath } from '../../src/utils/appRoutes.js';
import { collapseSupersededFeatures } from '../../src/utils/versionUtils.js';
import { installTradeFixtures } from './tradeTestHarness.js';

const effectiveEntries = collapseSupersededFeatures(WHATS_NEW);
const steps = effectiveEntries.flatMap((entry) => entry.features.flatMap((feature) => feature.steps.map((step) => ({
  ...step,
  featureName: feature.name,
  version: entry.version,
}))));

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page);
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

    const copyOptions = step.contextKey ? Object.values(step.copyByContext) : [step];
    const tooltipText = await tour.textContent();
    expect(copyOptions.some((copy) => tooltipText.includes(copy.title) && tooltipText.includes(copy.body))).toBeTruthy();

    const advance = tour.getByRole('button', { name: index === steps.length - 1 ? 'Finish' : 'Next' });
    await expect(advance).toBeVisible();
    await advance.click();
  }

  await expect(tour).toHaveCount(0);
});
