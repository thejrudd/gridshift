import { expect, test } from '@playwright/test';
import { drafts, players } from '../fixtures/tradeFixtures.js';
import { installTradeFixtures } from './tradeTestHarness.js';

const injuryPlayers = {
  ...players,
  101: {
    ...players[101],
    injury_status: 'Questionable',
    injury_body_part: 'Knee - ACL',
    injury_notes: 'Surgery',
  },
  102: {
    ...players[102],
    status: 'PUP',
    injury_body_part: 'Hamstring',
  },
  103: {
    ...players[103],
    injury_status: 'IR',
    injury_body_part: 'Shoulder',
  },
};

const playersWithUnsupportedIdp = {
  ...injuryPlayers,
  401: {
    player_id: '401',
    full_name: 'Hidden Linebacker',
    first_name: 'Hidden',
    last_name: 'Linebacker',
    position: 'LB',
    fantasy_positions: ['LB'],
    team: 'CHI',
    search_rank: 1,
    active: true,
  },
};

const preDraft = [{
  ...drafts[0],
  status: 'pre_draft',
  type: 'snake',
}];

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page, {
    installedVersion: '8.4.1',
    players: injuryPlayers,
    drafts: preDraft,
  });
});

test('Roster and War Room show Sleeper injury context and filter by designation', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile';

  if (!mobile) await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/fantasy/rosters');
  const rosterBadge = page.locator(`.player-status-badge[title="${mobile ? 'Questionable' : 'Questionable · Knee - ACL · Surgery'}"]`);
  await expect(rosterBadge).toBeVisible();
  await expect(rosterBadge).toContainText(mobile ? 'Q' : 'Questionable');
  if (mobile) await expect(rosterBadge.locator('.player-status-badge__detail')).toBeHidden();
  else await expect(rosterBadge).toContainText('Knee - ACL · Surgery');

  await page.goto('/draft/war-room');
  if (mobile) await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('button', { name: 'All Players' }).click();
  const availability = page.getByLabel('Filter by player availability').filter({ visible: true });
  await expect(availability).toContainText('Questionable');
  await expect(availability).toContainText('IR');
  await expect(availability).toContainText('PUP');
  await availability.selectOption('Questionable');

  const questionableRow = page.getByRole('button', { name: 'Open Pocket Commander' });
  await expect(questionableRow).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Volume Runner' })).toBeHidden();
  await expect(questionableRow.locator('.draft-player-availability-badge')).toContainText(mobile ? 'Q' : 'Questionable');
  if (mobile) await expect(questionableRow.locator('.player-status-badge__detail')).toBeHidden();
  else {
    await expect(questionableRow).toContainText('Knee - ACL · Surgery');
    const clippedMetadata = await questionableRow.locator('.companion-player-row__meta').evaluate((meta) => {
      const bounds = meta.getBoundingClientRect();
      return Array.from(meta.querySelectorAll('.companion-player-row__meta-item, .player-status-badge__detail'))
        .filter((element) => {
          const style = getComputedStyle(element);
          const range = document.createRange();
          range.selectNodeContents(element);
          const textOutsideBounds = Array.from(range.getClientRects()).some((rect) => (
            rect.left < bounds.left - 1 || rect.right > bounds.right + 1
          ));
          return style.overflowX === 'hidden'
            || style.textOverflow === 'ellipsis'
            || textOutsideBounds;
        })
        .map((element) => element.textContent.trim());
    });
    expect(clippedMetadata).toEqual([]);
  }
});

test('Board availability pool filters Sleeper designations', async ({ page }, testInfo) => {
  await page.goto('/draft/my-board');

  if (testInfo.project.name === 'chromium-mobile') {
    await page.getByRole('button', { name: 'Available Players' }).click();
  }

  await page.getByRole('button', { name: 'All Players' }).filter({ visible: true }).click();
  const availability = page.getByLabel('Filter by player availability').filter({ visible: true });
  await availability.selectOption('PUP');

  const pupCard = page.getByRole('button', { name: 'Open Volume Runner' }).filter({ visible: true });
  await expect(pupCard).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Pocket Commander' }).filter({ visible: true })).toHaveCount(0);
  await expect(pupCard.locator('.draft-player-availability-badge')).toContainText('PUP');
});

test('War Room and Board hide positions the league cannot roster', async ({ page }, testInfo) => {
  await installTradeFixtures(page, {
    installedVersion: '8.4.1',
    players: playersWithUnsupportedIdp,
    drafts: preDraft,
  });

  await page.goto('/draft/war-room');
  if (testInfo.project.name === 'chromium-mobile') {
    await page.getByRole('button', { name: 'Filters' }).click();
  }
  await page.getByRole('button', { name: 'All Players' }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Open Hidden Linebacker' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'LB', exact: true })).toHaveCount(0);

  await page.goto('/draft/my-board');
  if (testInfo.project.name === 'chromium-mobile') {
    await page.getByRole('button', { name: 'Available Players' }).click();
  }
  await page.getByRole('button', { name: 'All Players' }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Open Hidden Linebacker' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'LB', exact: true })).toHaveCount(0);
});
