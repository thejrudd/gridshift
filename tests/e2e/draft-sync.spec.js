import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';
import { TEST_USER_ID } from '../fixtures/tradeFixtures.js';

async function dismissWhatsNewIfPresent(page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  try {
    await dismiss.waitFor({ state: 'visible', timeout: 5_000 });
    await dismiss.click();
  } catch {
    // The upgrade modal is not shown for every fixture/browser profile.
  }
}

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page);

  await page.route('**/api/draft-sync/pairing/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        pairingCode: 'ABCD-EFGH',
        pairingId: 'pairing-123',
        deviceToken: 'starter-device-token',
        deviceRole: 'authoritative',
      }),
    });
  });
  await page.route('**/api/draft-sync/pairing/status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, pairingId: 'pairing-123', status: 'pending' }),
    });
  });
  await page.route('**/api/draft-sync/pairing/claim', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, deviceToken: 'claimed-device-token', deviceRole: 'non-authoritative' }),
    });
  });
  await page.route('**/api/draft-sync/revoke-device', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, revoked: true }),
    });
  });
});

test('Draft Sync offers generate, cancel, and pair flows from one dialog', async ({ page }) => {
  await page.goto('/draft/results');

  await dismissWhatsNewIfPresent(page);

  await page.getByRole('button', { name: 'Draft Sync', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Device Sync' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Generate pairing code' })).toBeVisible();
  const pairingInput = dialog.getByLabel('Draft Sync pairing code');
  await expect(pairingInput).toBeVisible();
  expect(await pairingInput.evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);

  await dialog.getByRole('button', { name: 'Generate pairing code' }).click();
  await expect(dialog.getByText('ABCD-EFGH', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel setup' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel setup' }).click();
  await expect(dialog.getByRole('button', { name: 'Generate pairing code' })).toBeVisible();
  await expect(dialog.getByText('Not connected', { exact: true })).toBeVisible();

  await dialog.getByLabel('Draft Sync pairing code').fill('ABCD-EFGH');
  await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Pair another device' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove this device from sync' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Revoke device' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Disconnect sync on this device' })).toHaveCount(0);
  await expect(dialog.getByText('Non-authoritative device', { exact: true })).toBeVisible();
});

test('Draft Sync replaces the pairing code with Paired when the other device claims it', async ({ page }) => {
  await page.unroute('**/api/draft-sync/pairing/status**');
  await page.route('**/api/draft-sync/pairing/status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, pairingId: 'pairing-123', status: 'claimed' }),
    });
  });
  await page.goto('/draft/results');

  await dismissWhatsNewIfPresent(page);

  await page.getByRole('button', { name: 'Draft Sync', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Device Sync' });
  await dialog.getByRole('button', { name: 'Generate pairing code' }).click();
  await expect(dialog.getByText('Paired', { exact: true }).last()).toBeVisible();
  await expect(dialog.getByText('Authoritative device', { exact: true }).last()).toBeVisible();
  await expect(dialog.getByText('ABCD-EFGH', { exact: true })).toHaveCount(0);
});

test('Predictions Sync seeds from the authoritative device and hydrates the joining device', async ({ page, browser }) => {
  let revision = 0;
  let sharedPredictionState = null;

  const installSyncTransport = async (targetPage, deviceRole, { failFirstRead = false } = {}) => {
    let stateReadAttempts = 0;
    await targetPage.route('**/api/draft-sync/device', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, deviceRole }),
      });
    });
    await targetPage.route('**/api/predictions-sync/state**', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        revision += 1;
        sharedPredictionState = body.state;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ETag: `"${revision}"` },
          body: JSON.stringify({ ok: true, revision, state: sharedPredictionState, deviceRole }),
        });
        return;
      }
      stateReadAttempts += 1;
      if (failFirstRead && stateReadAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Predictions Sync storage is temporarily unavailable.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"${revision}"` },
        body: JSON.stringify({
          ok: true,
          revision,
          state: sharedPredictionState,
          deviceRole,
        }),
      });
    });
  };

  const sourcePredictionStore = {
    version: 2,
    activeSeason: 2026,
    seasons: {
      2026: {
        predictions: {
          BUF: {
            wins: 12,
            losses: 5,
            ties: 0,
            divisionWins: 4,
            gameResults: {},
            recordSource: 'manual',
            manualOverride: true,
          },
        },
        playoffPicks: {},
      },
    },
  };

  await page.addInitScript(({ userId, predictionStore }) => {
    localStorage.setItem('gridshift_draft_sync_device_tokens_v1', JSON.stringify({ [userId]: 'authoritative-token' }));
    localStorage.setItem('gridshift-predictions-v2', JSON.stringify(predictionStore));
  }, { userId: TEST_USER_ID, predictionStore: sourcePredictionStore });
  await installSyncTransport(page, 'authoritative', { failFirstRead: true });
  await page.goto('/predictions');

  await expect.poll(() => sharedPredictionState?.predictions?.BUF?.wins, { timeout: 8_000 }).toBe(12);

  const joiningContext = await browser.newContext();
  const joiningPage = await joiningContext.newPage();
  try {
    await installTradeFixtures(joiningPage);
    await joiningPage.addInitScript((userId) => {
      localStorage.setItem('gridshift_draft_sync_device_tokens_v1', JSON.stringify({ [userId]: 'joining-token' }));
      localStorage.removeItem('gridshift-predictions-v2');
    }, TEST_USER_ID);
    await installSyncTransport(joiningPage, 'non-authoritative');
    await joiningPage.goto('/predictions');

    await expect.poll(async () => joiningPage.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('gridshift-predictions-v2') || '{}');
      return store?.seasons?.['2026']?.predictions?.BUF?.wins ?? null;
    }), { timeout: 8_000 }).toBe(12);
  } finally {
    await joiningContext.close();
  }
});

test('Predictions Sync code generator replaces the initial shared state without a choice prompt', async ({ page }) => {
  let revision = 1;
  let sharedPredictionState = {
    schemaVersion: 1,
    season: '2026',
    scheduleFingerprint: 'season-2026',
    predictions: { KC: { wins: 10, losses: 7, ties: 0, divisionWins: 4 } },
    playoffPicks: {},
  };

  await page.addInitScript((predictionStore) => {
    localStorage.removeItem('gridshift_draft_sync_device_tokens_v1');
    localStorage.setItem('gridshift-predictions-v2', JSON.stringify(predictionStore));
  }, {
    version: 2,
    activeSeason: 2026,
    seasons: {
      2026: {
        predictions: { BUF: { wins: 12, losses: 5, ties: 0, divisionWins: 4 } },
        playoffPicks: {},
      },
    },
  });

  await page.route('**/api/draft-sync/device', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, deviceRole: 'authoritative' }),
    });
  });
  await page.route('**/api/predictions-sync/state**', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      revision += 1;
      sharedPredictionState = body.state;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"${revision}"` },
        body: JSON.stringify({ ok: true, revision, state: sharedPredictionState, deviceRole: 'authoritative' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: `"${revision}"` },
      body: JSON.stringify({ ok: true, revision, state: sharedPredictionState, deviceRole: 'authoritative' }),
    });
  });

  await page.goto('/predictions');
  await dismissWhatsNewIfPresent(page);
  await page.getByRole('button', { name: 'Device Sync', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Device Sync' });
  await dialog.getByRole('button', { name: 'Generate pairing code' }).click();

  await expect.poll(() => sharedPredictionState?.predictions?.BUF?.wins, { timeout: 8_000 }).toBe(12);
  expect(sharedPredictionState?.predictions?.KC).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Use other device' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Keep this device' })).toHaveCount(0);
});
