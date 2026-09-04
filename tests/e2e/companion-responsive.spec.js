import { expect, test } from '@playwright/test';
import {
  TEST_LEAGUE_ID,
  TEST_SEASON,
  drafts,
  league,
  leagueUsers,
  leaguesBySeason,
  persistedSleeperState,
  players,
  rosters,
  tradedPicks,
  weeklyStatsForWeek,
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
  '/fantasy/rosters',
  '/fantasy/rankings',
  '/fantasy/matchups',
  '/fantasy/waivers',
  '/fantasy/rosters?sub=picks',
  '/league/standings',
  '/league/history',
  '/league/activity',
  '/fantasy/heatmap',
  '/fantasy/scoring',
];

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page, responsiveFixtureOverrides());
});

test('preseason Fantasy Rankings keeps shared ADP rows and team logos visible', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = new NativeDate('2026-08-23T12:00:00-05:00').getTime();
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    globalThis.Date = FixedDate;
  });
  await page.route('**/api/fantasy/adp*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        season: 2026,
        data: [{
          player: {
            first_name: 'Christopher',
            last_name: 'Pocket Commander-Supercalifragilistic',
            position_abbreviation: 'QB',
          },
          team: { abbreviation: 'BUF' },
          position: 'QB',
          average_draft_position: 42.5,
        }],
      }),
    });
  });
  await page.route('https://a.espncdn.com/i/teamlogos/nfl/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: globalThis.Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
  });

  await page.goto('/fantasy/rankings');

  await expect(page.getByText('Christopher Pocket Commander-Supercalifragilistic', { exact: true })).toBeVisible();
  await expect(page.getByText('No matched ADP rankings are available.', { exact: true })).toHaveCount(0);

  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();
  await page.getByRole('button', { name: /NFL Team All NFL Teams/ }).click();
  const teamMenu = page.getByRole('menu', { name: 'NFL team filter' });
  await expect(teamMenu.getByTestId('companion-menu-team-logo')).toHaveCount(1);
  await expect(teamMenu.getByTestId('companion-menu-team-logo')).toHaveAttribute('src', /teamlogos\/nfl\/500\/buf\.png$/);
});

test('preseason Trade shows a prior-production IDP estimate instead of zero', async ({ page }) => {
  const idpPlayerId = 'idp-401';
  const priorSeason = String(Number(TEST_SEASON) - 1);
  const preseasonLeague = {
    ...league,
    settings: { ...league.settings, last_scored_leg: 0 },
    scoring_settings: { ...league.scoring_settings, idp_tkl: 1.5, idp_sack: 4 },
    roster_positions: [...league.roster_positions, 'LB'],
  };
  const preseasonPlayers = {
    ...players,
    [idpPlayerId]: {
      ...players[101],
      player_id: idpPlayerId,
      full_name: 'Production Linebacker',
      first_name: 'Production',
      last_name: 'Linebacker',
      position: 'LB',
      fantasy_positions: ['LB'],
      mflid: '9401',
      espn_id: '9401',
    },
  };
  const preseasonRosters = rosters.map((roster) => roster.roster_id === 1
    ? { ...roster, players: [...roster.players, idpPlayerId] }
    : roster);
  const preseasonLeaguesBySeason = { ...leaguesBySeason, [TEST_SEASON]: [preseasonLeague] };
  const preseasonState = {
    ...persistedSleeperState(),
    leagues: [preseasonLeague],
    league: preseasonLeague,
    rosters: preseasonRosters,
    leaguesBySeason: preseasonLeaguesBySeason,
    scoringSettings: { ...persistedSleeperState().scoringSettings, ...preseasonLeague.scoring_settings },
  };

  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    league: preseasonLeague,
    leaguesBySeason: preseasonLeaguesBySeason,
    players: preseasonPlayers,
    rosters: preseasonRosters,
    persistedSleeperState: preseasonState,
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${priorSeason}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ [idpPlayerId]: { gp: 1, idp_tkl: 8, idp_sack: 0 } }),
    });
  });

  await page.goto('/trade/agent');

  const idpShelfCard = page.getByTestId(`trade-shelf-yours-player-${idpPlayerId}`).filter({ visible: true });
  await expect(idpShelfCard).toBeVisible();
  await expect(idpShelfCard).toContainText('Production Linebacker');
  await expect(idpShelfCard).toContainText('3,840');
});

test('Trade remains available but shows a current-season hint for previous linked league seasons', async ({ page }) => {
  const priorSeason = String(Number(TEST_SEASON) - 1);
  const priorLeague = {
    ...league,
    season: priorSeason,
    previous_league_id: null,
  };
  const currentLeague = {
    ...league,
    league_id: 'league-current-2026',
    previous_league_id: TEST_LEAGUE_ID,
  };
  const linkedLeaguesBySeason = {
    [priorSeason]: [priorLeague],
    [TEST_SEASON]: [currentLeague],
  };
  const priorSeasonState = {
    ...persistedSleeperState(),
    league: priorLeague,
    leagues: [priorLeague],
    season: priorSeason,
    availableSeasons: [TEST_SEASON, priorSeason],
    leaguesBySeason: linkedLeaguesBySeason,
  };

  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    league: priorLeague,
    leaguesBySeason: linkedLeaguesBySeason,
    persistedSleeperState: priorSeasonState,
  });

  await page.goto('/trade/agent');

  await expect(page).toHaveURL(/\/trade\/agent$/);
  await expect(page.getByText("Trade is only available for the current 2026 league season. You're viewing 2025.", { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to 2026', exact: true })).toBeVisible();
  const tradeTab = page.getByRole('button', { name: 'Trade', exact: true }).filter({ visible: true });
  await expect(tradeTab).toBeEnabled();
});

test('Trade selected asset cards keep metadata readable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/trade/agent?player=103&side=give&other=201');

  const playerRows = page.locator('[data-testid^="trade-side-asset-player-"]:visible');
  await expect(playerRows).toHaveCount(2);
  await expect(playerRows.first()).toBeVisible();

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 600 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await playerRows.evaluateAll((rows) => rows.map((row) => {
      const rowRect = row.getBoundingClientRect();
      const meta = row.querySelector('.trade-selection-row__meta');
      const metaRect = meta?.getBoundingClientRect();
      const items = [...(meta?.querySelectorAll('.trade-selection-row__meta-item') ?? [])];
      return {
        rowWidth: row.clientWidth,
        rowScrollWidth: row.scrollWidth,
        metaVisible: Boolean(metaRect && metaRect.width > 0 && metaRect.height > 0),
        metaBottomWithinRow: metaRect ? metaRect.bottom <= rowRect.bottom + 1 : true,
        metaLineHeight: meta ? Number.parseFloat(getComputedStyle(meta).lineHeight) : 0,
        metaHeight: metaRect?.height ?? 0,
        items: items.map((item) => {
          const style = getComputedStyle(item);
          return {
            text: item.textContent?.trim(),
            textOverflow: style.textOverflow,
            scrollWidth: item.scrollWidth,
            clientWidth: item.clientWidth,
          };
        }),
      };
    }));

    expect(geometry.length, `${viewport.width}×${viewport.height}`).toBe(2);
    for (const row of geometry) {
      expect(row.rowScrollWidth, `${viewport.width}×${viewport.height} row overflow`).toBeLessThanOrEqual(row.rowWidth + 1);
      if (!row.metaVisible) continue;
      expect(row.metaBottomWithinRow, `${viewport.width}×${viewport.height} metadata is clipped vertically`).toBe(true);
      expect(row.metaHeight, `${viewport.width}×${viewport.height} metadata wraps to a third line`).toBeLessThanOrEqual((row.metaLineHeight * 2) + 3);
      for (const item of row.items) {
        expect(item.textOverflow, `${viewport.width}×${viewport.height}: ${item.text}`).not.toBe('ellipsis');
        expect(item.scrollWidth, `${viewport.width}×${viewport.height}: ${item.text}`).toBeLessThanOrEqual(item.clientWidth + 1);
      }
    }
  }
});

test('Trade Agent draft survives navigating to full player stats and returning', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/trade/agent?player=103&side=give&other=201');

  const selectedPlayers = page.locator('[data-testid^="trade-side-asset-player-"]:visible');
  await expect(selectedPlayers).toHaveCount(2);

  await page.goto('/statistics/player/1003/flex-receiver');
  await expect(page).toHaveURL(/\/statistics\/player\/1003\/flex-receiver/);

  await page.getByRole('button', { name: 'Trade', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/trade\/agent$/);
  await expect(page.getByTestId('trade-side-asset-player-103').first()).toBeVisible();
  await expect(page.getByTestId('trade-side-asset-player-201').first()).toBeVisible();
});

test('Trade pick asset cards match player card dimensions without duplicate metadata', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/trade/agent?player=103&side=give&other=201');

  const picksFilter = page.getByTestId('trade-shelf-filter-picks').filter({ visible: true });
  await expect(picksFilter).toBeVisible();
  await picksFilter.click();

  const shelfPick = page.locator('[data-testid^="trade-shelf-yours-pick-"]:visible').first();
  await expect(shelfPick).toBeVisible();
  await shelfPick.click();

  const playerRow = page.locator('[data-testid^="trade-side-asset-player-"]:visible').first();
  const pickRow = page.locator('[data-testid^="trade-side-asset-pick-"]:visible').first();
  await expect(playerRow).toBeVisible();
  await expect(pickRow).toBeVisible();

  const state = await pickRow.evaluate((row) => {
    const meta = row.querySelector('.trade-selection-row__meta');
    const metaText = meta?.textContent?.trim() ?? '';
    const identityText = row.querySelector('.trade-selection-row__identity')?.textContent?.trim() ?? '';
    return {
      height: row.getBoundingClientRect().height,
      metaText,
      identityText,
      projectedLabelCount: (metaText.match(/PROJECTED|EARLY|MID|LATE/gi) ?? []).length,
    };
  });
  const playerHeight = await playerRow.evaluate((row) => row.getBoundingClientRect().height);

  expect(Math.abs(state.height - playerHeight)).toBeLessThanOrEqual(1);
  expect(state.metaText).not.toContain('DRAFT PICK');
  expect(state.metaText).not.toContain('2027');
  expect(state.identityText).toMatch(/^\d{4} \d+(st|nd|rd|th)$/);
  expect(state.projectedLabelCount).toBe(0);
});

test('Trade shelf keeps add actions and pick values visible', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/trade/agent');

    const picksFilter = page.getByTestId('trade-shelf-filter-picks').filter({ visible: true });
    await expect(picksFilter).toBeVisible();
    await picksFilter.click();

    const pickRows = page.locator('[data-testid^="trade-shelf-yours-pick-"]:visible');
    await expect(pickRows.first()).toBeVisible();
    await expect(pickRows.first().getByText('ADD', { exact: true })).toBeVisible();

    const pickRowState = await pickRows.first().evaluate((row) => {
      const value = [...row.querySelectorAll('span')]
        .find((span) => /\d/.test(span.textContent ?? '') && getComputedStyle(span).fontVariantNumeric.includes('tabular'));
      return {
        text: row.textContent ?? '',
        valueText: value?.textContent?.trim() ?? '',
      };
    });
    expect(pickRowState.valueText, `${viewport.width}×${viewport.height}`).toMatch(/\d/);
    expect(pickRowState.text, `${viewport.width}×${viewport.height}`).toContain('ADD');
  }
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
      if (route === '/fantasy/matchups') {
        await expectNoMatchupRowCrowding(page, route);
      }
    }
  });
}

test('Fantasy horizontal affordances appear when rails overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/fantasy/rosters');

  await expect(page.locator('.season-subnav [data-scroll-cue="right"]').first()).toBeVisible();
  await expectRightCueCoversScrollableEdge(page, '.season-subnav .season-tabs', '.season-subnav [data-scroll-cue="right"]');

  await page.goto('/fantasy/rosters');
  await expect(page.locator('[data-scroll-cue="right"]').first()).toBeVisible();

  await page.goto('/fantasy/rosters?sub=picks');
  await expect(page.locator('[data-scroll-cue="right"]').first()).toBeVisible();
});

test('Fantasy Rosters labels submitted Sleeper keepers', async ({ page }) => {
  await page.goto('/fantasy/rosters?team=1');

  const firstKeeper = page.getByRole('button', { name: 'Open Christopher Pocket Commander-Supercalifragilistic' });
  const secondKeeper = page.getByRole('button', { name: 'Open Amon-Ra Saint Brown Extended Test' });
  const nonKeeper = page.getByRole('button', { name: 'Open Jonathan Volume Runner The Third' });

  await expect(firstKeeper.getByText('Keeper', { exact: true })).toBeVisible();
  await expect(secondKeeper.getByText('Keeper', { exact: true })).toBeVisible();
  await expect(nonKeeper.getByText('Keeper', { exact: true })).toHaveCount(0);

  for (const keeperRow of [firstKeeper, secondKeeper]) {
    const keeperLabel = keeperRow.locator('.companion-player-row__meta-item', { hasText: /^Keeper$/ });
    await expect(keeperLabel).toBeVisible();
    await expect(keeperRow.locator('.companion-player-row__identity-accessory')).toHaveCount(0);
    await expect(keeperLabel).toHaveCSS('font-family', /Barlow Condensed/);

    const geometry = await keeperLabel.evaluate((label) => {
      const meta = label.closest('.companion-player-row__meta');
      const labelRect = label.getBoundingClientRect();
      const metaRect = meta?.getBoundingClientRect();
      return metaRect ? {
        labelHeight: labelRect.height,
        metaHeight: metaRect.height,
      } : null;
    });
    expect(geometry).not.toBeNull();
    expect(geometry.labelHeight).toBeLessThanOrEqual(geometry.metaHeight + 1);
  }
});

test('Fantasy Rosters desktop keeps identity and metadata readable with aligned team logos', async ({ page }) => {
  await page.goto('/fantasy/rosters?team=1');

  const rows = page.locator('.companion-roster-player-row');
  await expect(rows.first()).toBeVisible();

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 600 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    for (const displaySize of ['compact', 'comfortable', 'large']) {
      await page.evaluate((size) => {
        localStorage.setItem('gridshift-display-size', size);
      }, displaySize);
      await page.reload();
      await expect(rows.first()).toBeVisible();

      const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
        const label = row.querySelector('.companion-player-row__identity-label');
        const logoSlot = row.querySelector('.companion-player-row__columns > .companion-player-row__column');
        if (!label || !logoSlot) return null;

        const labelStyle = getComputedStyle(label);
        const labelRect = label.getBoundingClientRect();
        const logoRect = logoSlot.getBoundingClientRect();
        const meta = row.querySelector('.companion-player-row__meta');
        return {
          name: label.textContent?.trim(),
          whiteSpace: labelStyle.whiteSpace,
          labelHeight: labelRect.height,
          lineHeight: Number.parseFloat(labelStyle.lineHeight),
          labelClientWidth: label.clientWidth,
          labelScrollWidth: label.scrollWidth,
          metadata: meta?.textContent?.trim(),
          metaClientWidth: meta?.clientWidth ?? 0,
          metaScrollWidth: meta?.scrollWidth ?? 0,
          logoLeft: logoRect.left,
        };
      }).filter(Boolean));

      expect(geometry.length, `${viewport.width}×${viewport.height} ${displaySize}`).toBeGreaterThan(0);
      for (const item of geometry) {
        expect(item.whiteSpace, `${viewport.width}×${viewport.height} ${displaySize}: ${item.name}`).toBe('nowrap');
        expect(item.labelHeight, item.name).toBeLessThanOrEqual(item.lineHeight + 1);
        expect(item.labelScrollWidth, item.name).toBeLessThanOrEqual(item.labelClientWidth + 1);
        expect(item.metaScrollWidth, `${viewport.width}×${viewport.height} ${displaySize}: ${item.metadata}`).toBeLessThanOrEqual(item.metaClientWidth + 1);
      }

      const logoLefts = geometry.map((item) => item.logoLeft);
      expect(Math.max(...logoLefts) - Math.min(...logoLefts)).toBeLessThanOrEqual(1);
    }
  }
});

test('Fantasy desktop overflow arrows and tab keyboard navigation are interactive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop pointer controls are intentionally hidden for coarse-pointer contexts.');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/fantasy/rosters');

  const rail = page.locator('.season-subnav .season-tabs');
  const rightCue = page.getByRole('button', { name: 'Scroll Fantasy views right' });
  await expect(rightCue).toBeVisible();
  const before = await rail.evaluate((element) => element.scrollLeft);
  await rightCue.click();
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);

  const after = await rail.evaluate((element) => element.scrollLeft);
  const leftCue = page.getByRole('button', { name: 'Scroll Fantasy views left' });
  await leftCue.press('Enter');
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeLessThan(after);

  const rostersTab = page.getByRole('tab', { name: 'Rosters' });
  await rostersTab.focus();
  await rostersTab.press('ArrowRight');
  await expect(page).toHaveURL(/\/fantasy\/rankings/);
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

test('Statistics player positions stay on one horizontally scrollable mobile row', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/statistics');

  const rail = page.getByLabel('Player positions');
  await expect(rail).toBeVisible();
  const geometry = await rail.evaluate((element) => {
    const buttons = [...element.querySelectorAll('button')];
    const tops = buttons.map((button) => button.getBoundingClientRect().top);
    return {
      wraps: Math.max(...tops) - Math.min(...tops) > 1,
      scrollable: element.scrollWidth > element.clientWidth,
      touchTargets: buttons.every((button) => button.getBoundingClientRect().height >= 44),
    };
  });
  expect(geometry.wraps).toBe(false);
  expect(geometry.scrollable).toBe(true);
  expect(geometry.touchTargets).toBe(true);
});

test('Fantasy scoring preview Hold keeps Rankings scroll position fixed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/scoring');

  await page.getByRole('button', { name: /browse leagues/i }).click();
  await page.getByRole('button', { name: new RegExp(`${TEST_SEASON} Season`, 'i') }).click();
  await page.getByRole('button', { name: /Half PPR Preview League/i }).click();
  await expect(page.getByText('Active')).toBeVisible();

  await page.getByRole('tab', { name: 'Rankings', exact: true }).click();
  await expect(page).toHaveURL(/\/fantasy\/rankings/);
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

test('Fantasy scoring builds Position Strength from prior-season production', async ({ page }) => {
  const emptyHistoricalResponses = new Set();
  await page.route('**/stats/nfl/regular/2025/*', async (route) => {
    const url = route.request().url();
    if (!emptyHistoricalResponses.has(url)) {
      emptyHistoricalResponses.add(url);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fallback();
  });

  await page.goto('/fantasy/scoring');

  await expect(page.getByText('2025 results · 2026 rules', { exact: true })).toBeVisible();
  await expect.poll(async () => page.locator('.companion-scoring-position-strength__row').count()).toBeGreaterThan(0);
  await expect(page.locator('.companion-scoring-position-strength__empty')).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 568 });
  const columnGeometry = await page.locator('.companion-scoring-position-strength__header').evaluate((header) => {
    const cells = [...header.children].map((cell) => cell.getBoundingClientRect());
    return {
      tableScrollable: header.parentElement.scrollWidth > header.parentElement.clientWidth,
      cellsReadable: cells.every((rect, index) => index === cells.length - 1 || rect.right <= cells[index + 1].left + 0.5),
      minimumCellWidth: Math.min(...cells.map((rect) => rect.width)),
    };
  });
  expect(columnGeometry.tableScrollable).toBe(true);
  expect(columnGeometry.cellsReadable).toBe(true);
  expect(columnGeometry.minimumCellWidth).toBeGreaterThanOrEqual(30);
});

test('mobile Companion controls enforce prerequisites and keep compact interactions reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Phone interaction coverage runs in the touch-enabled project.');
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = new NativeDate('2026-10-04T12:00:00-05:00').getTime();
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    globalThis.Date = FixedDate;
  });
  await page.route('https://api.sleeper.app/v1/stats/nfl/regular/2026/*', async (route) => {
    const week = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    const stats = Object.fromEntries(Object.entries(weeklyStatsForWeek(week)).map(([playerId, values]) => (
      [playerId, { ...values, opp: 'DAL' }]
    )));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stats),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/trade/agent');
  await expect(page.getByTestId('trade-shelf-tab-theirs').filter({ visible: true })).toBeDisabled();
  await expect(page.getByTestId('trade-plate-theirs-add-player').filter({ visible: true })).toBeDisabled();

  await page.goto('/fantasy/defenses');
  const defenseFilters = page.getByRole('button', { name: 'Filters' });
  await expect(defenseFilters).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#companion-defense-filter-stack')).toBeHidden();
  await defenseFilters.click();
  await expect(defenseFilters).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#companion-defense-filter-stack')).toBeVisible();

  await page.goto('/fantasy/heatmap');
  const firstHeatmapValue = page.locator('td[data-heatmap-week]').first();
  await expect(firstHeatmapValue).toBeVisible();
  await firstHeatmapValue.click();
  const closeHeatmap = page.getByRole('button', { name: 'Close heatmap drilldown' });
  await expect(closeHeatmap).toBeVisible();
  const closeSize = await closeHeatmap.evaluate((button) => button.getBoundingClientRect().width);
  expect(closeSize).toBeGreaterThanOrEqual(44);
  await closeHeatmap.click();
  await expect(closeHeatmap).toHaveCount(0);
});

test('roster draft-pick rows follow the league draft slots from top to bottom', async ({ page }) => {
  await page.goto('/fantasy/rosters?sub=picks');
  await expect.poll(async () => page.locator('.companion-league-picks-row').count()).toBeGreaterThanOrEqual(3);
  const firstRosterIds = await page.locator('.companion-league-picks-row').evaluateAll((rows) => (
    rows.slice(0, 3).map((row) => row.dataset.rosterId)
  ));
  expect(firstRosterIds).toEqual(['3', '1', '2']);
});

test('player preview keeps one maximum-height body while switching statistic modes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/rosters?team=1');
  await page.getByRole('button', { name: 'Open Christopher Pocket Commander-Supercalifragilistic' }).click();

  const body = page.locator('.companion-player-preview-body');
  await expect(body).toBeVisible();
  const gameHeight = await body.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole('button', { name: 'Fantasy Values', exact: true }).click();
  const fantasyHeight = await body.evaluate((element) => element.getBoundingClientRect().height);
  expect(Math.abs(gameHeight - fantasyHeight)).toBeLessThanOrEqual(1);
});

test('Heatmap mobile keeps filters collapsed above the grid', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/fantasy/heatmap');

  await expect(page.getByRole('button', { name: 'Show Filters' })).toBeVisible();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
  await expect(page.locator('.companion-heatmap-scroll-frame [data-scroll-cue]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await expect(page.locator('#companion-heatmap-filter-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Hide Filters' }).click();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
});

test('Heatmap desktop keeps filters collapsed and groups controls in one row', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/fantasy/heatmap');

  const filterToggle = page.getByRole('button', { name: 'Show Filters' });
  await expect(filterToggle).toBeVisible();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
  await expect(page.locator('td[data-heatmap-week]').first()).toBeVisible();

  await filterToggle.click();
  const filterGroups = page.locator('#companion-heatmap-filter-panel .companion-heatmap-filter-group');
  await expect(filterGroups).toHaveCount(6);

  const groupTops = await filterGroups.evaluateAll((groups) => (
    groups.map((group) => Math.round(group.getBoundingClientRect().top))
  ));
  expect(Math.max(...groupTops) - Math.min(...groupTops)).toBeLessThanOrEqual(1);

  const resultRect = await filterGroups.filter({ hasText: 'Result' }).boundingBox();
  const firstGroupRect = await filterGroups.first().boundingBox();
  expect(resultRect?.y).toBe(firstGroupRect?.y);
  expect(resultRect?.x).toBeGreaterThan(firstGroupRect?.x ?? 0);
});

test('Matchup team scoring breakdown opens as a mobile bottom sheet', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('/fantasy/matchups');

  await expect(page.locator('.companion-matchup-column-header')).toBeHidden();
  await expect(page.locator('.companion-matchup-side-headings')).toHaveCount(0);

  await page.getByRole('button', { name: /scoring breakdown, your team/i }).click();
  const sheet = page.locator('.modal-overlay--mobile-sheet .team-score-breakdown-sheet');
  await expect(sheet).toBeVisible();

  await expectMobileSheetFillsBottom(sheet, viewport);
});

test('Matchup week picker opens as a shared mobile selection sheet', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('/fantasy/matchups');

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
    ...rosters.map((roster) => (
      roster.roster_id === 1
        ? { ...roster, keepers: [101, '103'] }
        : roster
    )),
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
  const responsiveDrafts = drafts.map((draft) => ({
    ...draft,
    draft_order: {
      'user-third': 1,
      'user-me': 2,
      'user-partner': 3,
      ...Object.fromEntries(responsiveUsers.slice(3).map((user, index) => [user.user_id, index + 4])),
    },
  }));

  return {
    drafts: responsiveDrafts,
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
