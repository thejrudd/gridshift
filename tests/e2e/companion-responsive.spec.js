import { expect, test } from '@playwright/test';
import {
  TEST_SEASON,
  league,
  leagueUsers,
  leaguesBySeason,
  persistedSleeperState,
  players,
  rosters,
  tradedPicks,
} from '../fixtures/tradeFixtures.js';
import { installTradeFixtures } from './tradeTestHarness.js';

const MOBILE_VIEWPORTS = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'common-phone', width: 390, height: 844 },
  { name: 'large-phone', width: 430, height: 932 },
  { name: 'phone-landscape', width: 568, height: 320 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
];

const RESPONSIVE_ROUTES = [
  '/companion/roster',
  '/companion/rankings',
  '/companion/matchup',
  '/companion/waiver',
  '/companion/league',
  '/companion/league?sub=picks',
  '/companion/heatmap',
  '/companion/scoring',
];

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page, responsiveFixtureOverrides());
});

for (const viewport of MOBILE_VIEWPORTS) {
  test(`Companion views adapt without priority text clipping at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of RESPONSIVE_ROUTES) {
      await page.goto(route);
      await page.locator('#root').waitFor({ state: 'visible' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await expectNoDocumentOverflow(page, route);
      await expectNoCompanionIdentityEllipsis(page, route);
      if (route === '/companion/matchup') {
        await expectNoMatchupRowCrowding(page, route);
      }
    }
  });
}

test('Companion horizontal affordances appear when rails overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/companion/roster');

  await expect(page.locator('.season-subnav [data-scroll-cue="right"]').first()).toBeVisible();
  await expectRightCueCoversScrollableEdge(page, '.season-subnav .season-tabs', '.season-subnav [data-scroll-cue="right"]');

  await page.goto('/companion/league');
  await expect(page.locator('[data-scroll-cue="right"]').first()).toBeVisible();

  await page.goto('/companion/league?sub=picks');
  await expect(page.locator('[data-scroll-cue="right"]').first()).toBeVisible();
});

test('Statistics schedule week rail keeps mobile overflow contained', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/statistics/schedule?mode=week&week=1');

  await expect.poll(async () => page.locator('.statistics-schedule-week-chip').count()).toBeGreaterThan(8);
  await expectNoDocumentOverflow(page, '/statistics/schedule');
  await expectNoContentAreaHorizontalOverflow(page, '/statistics/schedule');
  await expect(page.locator('.statistics-schedule-week-shell [data-scroll-cue="right"]')).toBeVisible();
  await expectRightCueCoversScrollableEdge(
    page,
    '.statistics-schedule-week-shell .statistics-schedule-week-scrubber',
    '.statistics-schedule-week-shell [data-scroll-cue="right"]',
  );
});

test('Companion scoring preview Hold keeps Rankings scroll position fixed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/companion/scoring');

  await page.getByRole('button', { name: /browse leagues/i }).click();
  await page.getByRole('button', { name: new RegExp(`${TEST_SEASON} Season`, 'i') }).click();
  await page.getByRole('button', { name: /Half PPR Preview League/i }).click();
  await expect(page.getByText('Active')).toBeVisible();

  await page.goto('/companion/rankings');
  const rows = page.locator('.companion-player-row');
  await expect.poll(async () => rows.count()).toBeGreaterThan(10);

  const contentArea = page.locator('.content-area');
  const beforeScrollTop = await contentArea.evaluate((element) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.min(480, maxScrollTop);
    return element.scrollTop;
  });
  expect(beforeScrollTop).toBeGreaterThan(80);

  const holdButton = page.getByRole('button', { name: "Hold to preview your league's scoring" });
  const box = await holdButton.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expectContentScrollNear(contentArea, beforeScrollTop);
  await page.mouse.up();
  await expectContentScrollNear(contentArea, beforeScrollTop);
});

test('Heatmap mobile keeps filters collapsed above the grid', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/companion/heatmap');

  await expect(page.getByRole('button', { name: 'Show Filters' })).toBeVisible();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
  await expect(page.locator('.companion-heatmap-scroll-frame [data-scroll-cue]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await expect(page.locator('#companion-heatmap-filter-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Hide Filters' }).click();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
});

test('Matchup team scoring breakdown opens as a mobile bottom sheet', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('/companion/matchup');

  await expect(page.locator('.companion-matchup-column-header')).toBeHidden();
  await expect(page.locator('.companion-matchup-side-headings')).toHaveCount(0);

  await page.getByRole('button', { name: /Your Side/i }).click();
  const sheet = page.locator('.modal-overlay--mobile-sheet .team-score-breakdown-sheet');
  await expect(sheet).toBeVisible();

  await expectMobileSheetFillsBottom(sheet, viewport);
});

test('Matchup week picker opens as a shared mobile selection sheet', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('/companion/matchup');

  await page.locator('.companion-matchup-week-trigger').click();
  const sheet = page.locator('.modal-overlay--mobile-sheet .matchup-week-picker-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.matchup-week-picker-option.is-active')).toHaveCount(1);
  await expect(sheet.getByRole('button', { name: /Week 6/i })).toBeVisible();

  await expectMobileSheetFillsBottom(sheet, viewport);
});

async function expectMobileSheetFillsBottom(sheet, viewport) {
  const geometry = await sheet.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
    };
  });

  expect(geometry.left, 'mobile sheet should start at the viewport left edge').toBeLessThanOrEqual(1);
  expect(geometry.right, 'mobile sheet should reach the viewport right edge').toBeGreaterThanOrEqual(viewport.width - 1);
  expect(geometry.bottom, 'mobile sheet should sit on the viewport bottom edge').toBeGreaterThanOrEqual(viewport.height - 1);
  expect(geometry.width, 'mobile sheet should use the available mobile width').toBeGreaterThanOrEqual(viewport.width - 1);
}

async function expectNoDocumentOverflow(page, route) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow, `${route} has document-level horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectNoContentAreaHorizontalOverflow(page, route) {
  const overflow = await page.evaluate(() => {
    const contentArea = document.querySelector('.content-area');
    return contentArea ? contentArea.scrollWidth - contentArea.clientWidth : 0;
  });
  expect(overflow, `${route} has main content horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectNoCompanionIdentityEllipsis(page, route) {
  const offenders = await page.evaluate(() => (
    [...document.querySelectorAll('.companion-player-row__identity-label')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const row = element.closest('.companion-player-row');
        const rowRect = row?.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent?.trim(),
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          clippedByRow: rowRect
            ? rect.left < rowRect.left - 1 || rect.right > rowRect.right + 1
            : false,
        };
      })
      .filter((item) => (
        item.text
        && (item.textOverflow === 'ellipsis' || item.whiteSpace === 'nowrap' || item.clippedByRow)
      ))
  ));

  expect(offenders, `${route} has clipped or ellipsized Companion identity text`).toEqual([]);
}

async function expectNoMatchupRowCrowding(page, route) {
  const offenders = await page.evaluate(() => (
    [...document.querySelectorAll('.companion-matchup-player-row')]
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((row) => {
        const rowRect = row.getBoundingClientRect();
        const body = row.querySelector('.companion-player-row__body');
        const columns = row.querySelector('.companion-player-row__columns');
        const identity = row.querySelector('.companion-player-row__identity');
        const score = row.querySelector('.companion-player-row__metric-value');
        const bodyRect = body?.getBoundingClientRect();
        const columnsRect = columns?.getBoundingClientRect();
        const identityFont = identity ? Number.parseFloat(getComputedStyle(identity).fontSize) : null;
        const scoreFont = score ? Number.parseFloat(getComputedStyle(score).fontSize) : null;

        return {
          text: identity?.textContent?.trim(),
          bodyOverlapsScore: bodyRect && columnsRect ? bodyRect.right > columnsRect.left + 1 : false,
          scoreExitsRow: columnsRect ? columnsRect.right > rowRect.right + 1 : false,
          scoreTooDominant: Number.isFinite(identityFont) && Number.isFinite(scoreFont)
            ? scoreFont > identityFont + 3
            : false,
        };
      })
      .filter((item) => item.bodyOverlapsScore || item.scoreExitsRow || item.scoreTooDominant)
  ));

  expect(offenders, `${route} has Matchup rows where the score crowds or dominates identity`).toEqual([]);
}

async function expectRightCueCoversScrollableEdge(page, railSelector, cueSelector) {
  const geometry = await page.evaluate(({ railSelector: rail, cueSelector: cue }) => {
    const railElement = document.querySelector(rail);
    const cueElement = document.querySelector(cue);
    const railRect = railElement?.getBoundingClientRect();
    const cueRect = cueElement?.getBoundingClientRect();
    return railRect && cueRect
      ? { railRight: railRect.right, cueRight: cueRect.right, cueWidth: cueRect.width }
      : null;
  }, { railSelector, cueSelector });

  expect(geometry, 'scroll cue geometry should be measurable').not.toBeNull();
  expect(geometry.cueRight, 'right cue should cover the rail bleed edge').toBeGreaterThanOrEqual(geometry.railRight - 1);
  expect(geometry.cueWidth, 'right cue should be wide enough to mask tab text behind it').toBeGreaterThanOrEqual(54);
}

async function expectContentScrollNear(contentArea, expectedScrollTop) {
  await expect.poll(
    async () => contentArea.evaluate((element) => element.scrollTop),
    { message: 'Companion content scroll position should stay fixed while toggling scoring preview' },
  ).toBeGreaterThanOrEqual(expectedScrollTop - 2);
  await expect.poll(
    async () => contentArea.evaluate((element) => element.scrollTop),
    { message: 'Companion content scroll position should stay fixed while toggling scoring preview' },
  ).toBeLessThanOrEqual(expectedScrollTop + 2);
}

function responsiveFixtureOverrides() {
  const responsiveLeague = {
    ...league,
    name: 'GridShift Extremely Long Responsive Test League',
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'IDP_FLEX', 'K', 'BN', 'BN', 'BN'],
    settings: {
      ...league.settings,
      draft_rounds: 8,
      last_scored_leg: 6,
    },
  };
  const previewLeague = {
    ...responsiveLeague,
    league_id: 'league-half-ppr-preview',
    name: 'GridShift Half PPR Preview League',
    scoring_settings: {
      ...responsiveLeague.scoring_settings,
      rec: 0.5,
      pass_td: 6,
    },
  };
  const responsiveUsers = [
    ...leagueUsers,
    ...Array.from({ length: 7 }, (_, index) => ({
      user_id: `responsive-user-${index + 1}`,
      display_name: `Manager With A Very Long Team Name ${index + 1}`,
      username: `responsive_${index + 1}`,
      metadata: { team_name: `Long Form Franchise Name ${index + 1}` },
      avatar: null,
    })),
  ];
  const responsiveRosters = [
    ...rosters,
    ...responsiveUsers.slice(3).map((user, index) => ({
      roster_id: index + 4,
      owner_id: user.user_id,
      players: [],
      reserve: [],
      settings: { wins: 1, losses: 5, ties: 0, fpts: 500 + index * 12, fpts_decimal: 0 },
    })),
  ];
  const responsivePlayers = {
    ...players,
    101: renamePlayer(players[101], 'Christopher Pocket Commander-Supercalifragilistic'),
    102: renamePlayer(players[102], 'Jonathan Volume Runner The Third'),
    103: renamePlayer(players[103], 'Amon-Ra Saint Brown Extended Test'),
    104: renamePlayer(players[104], 'Target Magnet With A Long Surname'),
    201: renamePlayer(players[201], 'Saquon Ultra Compact Row Stressor'),
    203: renamePlayer(players[203], 'Partner Receiver Double-Barrel Name'),
    301: renamePlayer(players[301], 'Third Runner Long Identity Label'),
  };
  const responsiveLeaguesBySeason = {
    ...leaguesBySeason,
    [TEST_SEASON]: [responsiveLeague, previewLeague],
  };
  const responsiveState = {
    ...persistedSleeperState(),
    league: responsiveLeague,
    leagues: [responsiveLeague, previewLeague],
    rosters: responsiveRosters,
    leagueUsers: responsiveUsers,
    leaguesBySeason: responsiveLeaguesBySeason,
  };
  const responsiveTradedPicks = [
    ...tradedPicks,
    ...responsiveRosters.flatMap((roster) => (
      [1, 2, 3, 4, 5, 6, 7, 8].map((round) => ({
        season: String(Number(TEST_SEASON) + 1 + (round % 3)),
        round,
        roster_id: roster.roster_id,
        owner_id: ((roster.roster_id + round) % responsiveRosters.length) + 1,
      }))
    )),
  ];

  return {
    league: responsiveLeague,
    leagueUsers: responsiveUsers,
    leaguesBySeason: responsiveLeaguesBySeason,
    persistedSleeperState: responsiveState,
    players: responsivePlayers,
    rosters: responsiveRosters,
    tradedPicks: responsiveTradedPicks,
  };
}

function renamePlayer(player, fullName) {
  const [first_name, ...lastParts] = fullName.split(' ');
  return {
    ...player,
    first_name,
    last_name: lastParts.join(' '),
    full_name: fullName,
  };
}
