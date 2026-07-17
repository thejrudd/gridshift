import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';

const RESPONSIVE_VIEWPORTS = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'common-phone', width: 390, height: 844 },
  { name: 'large-phone', width: 430, height: 932 },
  { name: 'zoomed-wide-monitor', width: 640, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop-boundary', width: 1024, height: 768 },
  { name: 'zoomed-1440p', width: 1280, height: 720 },
  { name: 'laptop', width: 1440, height: 960 },
  { name: '1080p', width: 1920, height: 1080 },
  { name: '1440p', width: 2560, height: 1440 },
];

const REPRESENTATIVE_ROUTES = [
  '/fantasy/rosters',
  '/fantasy/rankings',
  '/fantasy/matchups',
  '/fantasy/scoring',
  '/league/history',
  '/statistics/schedule',
  '/trade/agent',
  '/draft/war-room',
  '/scout/prospects',
  '/predictions',
];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'The file owns an explicit multi-viewport matrix.');
  await installTradeFixtures(page, { installedVersion: '8.3.0' });
});

test('display size defaults, applies live, and persists from the desktop sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/fantasy/rosters');

  await expect(page.locator('html')).toHaveAttribute('data-display-size', 'comfortable');
  await page.getByRole('button', { name: 'Display', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Display settings' });
  await expect(dialog).toBeVisible();
  const comfortable = dialog.getByRole('radio', { name: /Comfortable/ });
  await expect(comfortable).toHaveAttribute('aria-checked', 'true');
  await comfortable.focus();
  await page.keyboard.press('ArrowRight');
  const large = dialog.getByRole('radio', { name: /Large/ });
  await expect(large).toBeFocused();
  await expect(large).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-display-size', 'large');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gridshift-display-size'))).toBe('large');

  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-display-size', 'large');
});

test('display settings are available from the collapsed rail and mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/fantasy/rosters');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('button', { name: 'Display settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Display settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close display settings' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Display', exact: true }).click();
  const mobileDialog = page.getByRole('dialog', { name: 'Display settings' });
  await expect(mobileDialog).toBeVisible();
  await mobileDialog.getByRole('radio', { name: /Large/ }).click();
  await expect(mobileDialog.getByRole('button', { name: 'Done' })).toBeVisible();
  await expect.poll(() => mobileDialog.locator('.display-settings-options').evaluate((element) => (
    element.scrollHeight > element.clientHeight
  ))).toBe(true);
});

test('semantic display tiers increase monotonically and preserve input readability', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/rankings');

  const sizes = {};
  for (const preset of ['compact', 'comfortable', 'large']) {
    await page.evaluate((value) => {
      localStorage.setItem('gridshift-display-size', value);
      document.documentElement.setAttribute('data-display-size', value);
    }, preset);
    sizes[preset] = await page.evaluate(() => {
      const input = document.querySelector('input');
      const root = getComputedStyle(document.documentElement);
      const label = document.createElement('span');
      label.className = 'type-label';
      const metadata = document.createElement('span');
      metadata.className = 'type-meta';
      const micro = document.createElement('span');
      micro.className = 'type-micro';
      document.body.append(label, metadata, micro);
      const labelSize = Number.parseFloat(getComputedStyle(label).fontSize);
      const metadataSize = Number.parseFloat(getComputedStyle(metadata).fontSize);
      const microSize = Number.parseFloat(getComputedStyle(micro).fontSize);
      label.remove();
      metadata.remove();
      micro.remove();
      return {
        root: Number.parseFloat(root.fontSize),
        label: labelSize,
        metadata: metadataSize,
        micro: microSize,
        input: input ? Number.parseFloat(getComputedStyle(input).fontSize) : 16,
      };
    });
  }

  expect(sizes.compact.root).toBeLessThan(sizes.comfortable.root);
  expect(sizes.comfortable.root).toBeLessThan(sizes.large.root);
  expect(sizes.compact.label).toBeGreaterThanOrEqual(12);
  expect(sizes.compact.metadata).toBeGreaterThan(sizes.compact.micro);
  expect(sizes.compact.micro).toBeGreaterThanOrEqual(11);
  expect(sizes.compact.input).toBeGreaterThanOrEqual(16);
  expect(sizes.large.input).toBeGreaterThanOrEqual(16);
});

for (const viewport of RESPONSIVE_VIEWPORTS) {
  test(`representative routes reflow without document overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of REPRESENTATIVE_ROUTES) {
      await page.goto(route);
      await page.locator('#root').waitFor({ state: 'visible' });
      await page.waitForTimeout(100);
      for (const theme of ['light', 'dark']) {
        const overflow = await page.evaluate((isDark) => {
          document.documentElement.classList.toggle('dark', isDark);
          return Math.max(
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            document.body.scrollWidth - document.body.clientWidth,
          );
        }, theme === 'dark');
        expect(overflow, `${route} overflows at ${viewport.name} in ${theme} mode`).toBeLessThanOrEqual(1);
      }
    }
  });
}

for (const preset of ['compact', 'large']) {
  test(`${preset} remains functional at critical phone, desktop, and wide-monitor widths`, async ({ page }) => {
    const criticalViewports = [
      { width: 320, height: 568 },
      { width: 1024, height: 768 },
      { width: 2560, height: 1440 },
    ];

    for (const viewport of criticalViewports) {
      await page.setViewportSize(viewport);
      for (const route of ['/fantasy/rankings', '/fantasy/matchups', '/draft/war-room']) {
        await page.goto(route);
        await page.evaluate((value) => {
          localStorage.setItem('gridshift-display-size', value);
          document.documentElement.setAttribute('data-display-size', value);
        }, preset);
        await page.locator('#root').waitFor({ state: 'visible' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${route} overflows at ${viewport.width}px in ${preset}`).toBeLessThanOrEqual(1);
      }
    }
  });
}

test('wide routes honor readable, data, and workbench frames', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  const checks = [
    ['/fantasy/scoring', '.page-frame-readable', 1200],
    ['/fantasy/rosters', '.page-frame-data', 1600],
    ['/fantasy/matchups', '.page-frame-workbench', 1920],
    ['/draft/war-room', '.draft-page', 1920],
  ];

  for (const [route, selector, maximum] of checks) {
    await page.goto(route);
    const frame = page.locator(selector);
    await expect(frame).toBeVisible();
    const width = await frame.evaluate((element) => element.getBoundingClientRect().width);
    expect(width, `${route} exceeds its frame`).toBeLessThanOrEqual(maximum + 1);
  }
});
