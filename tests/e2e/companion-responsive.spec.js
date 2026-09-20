import { expect, test } from '@playwright/test';
import {
  TEST_LEAGUE_ID,
  TEST_SEASON,
  drafts,
  league,
  leagueUsers,
  leaguesBySeason,
  matchupsForWeek,
  persistedSleeperState,
  players,
  rosters,
  tradedPicks,
  weeklyStatsForWeek,
} from '../fixtures/tradeFixtures.js';
import { installTradeFixtures } from './tradeTestHarness.js';
import { baselineScope, MATCHUP_PROJECTION_BASELINE_STORAGE_KEY, scoringFingerprint } from '../../src/utils/matchupProjectionBaseline.js';

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

test('Fantasy Matchups cold load follows the live Sleeper leg instead of last_scored_leg', async ({ page }) => {
  const weekOneLeagueSnapshot = {
    ...league,
    settings: { ...league.settings, last_scored_leg: 1 },
  };
  const weekTwoState = {
    season: TEST_SEASON,
    season_type: 'regular',
    week: 2,
    leg: 2,
    display_week: 1,
    league_season: TEST_SEASON,
  };
  const matchupWeeksRequested = [];
  const nflStateRequests = [];

  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    league: weekOneLeagueSnapshot,
    leaguesBySeason: { ...leaguesBySeason, [TEST_SEASON]: [weekOneLeagueSnapshot] },
    nflState: weekTwoState,
  });
  await page.route('**/v1/state/nfl*', async (route) => {
    nflStateRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(weekTwoState),
    });
  });
  page.on('request', (request) => {
    const match = new URL(request.url()).pathname.match(/\/matchups\/(\d+)$/);
    if (match) matchupWeeksRequested.push(Number(match[1]));
  });

  await page.goto('/fantasy/matchups');

  await expect.poll(() => nflStateRequests.length).toBe(1);
  await expect.poll(() => matchupWeeksRequested).toContain(2);
  expect(matchupWeeksRequested).not.toContain(1);
  await expect(page.getByRole('button', { name: 'Choose matchup week. Week 2 selected.' })).toBeVisible();
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
  await page.getByRole('button', { name: /open rankings filters/i }).click();
  await page.getByRole('button', { name: /NFL Team All NFL Teams/ }).click();
  const teamMenu = page.getByRole('menu', { name: 'NFL team filter' });
  await expect(teamMenu.getByTestId('companion-menu-team-logo')).toHaveCount(1);
  await expect(teamMenu.getByTestId('companion-menu-team-logo')).toHaveAttribute('src', /teamlogos\/nfl\/500\/buf\.png$/);
});

test('Fantasy Rankings keeps filters and search behind the Filters chip', async ({ page }) => {
  await page.goto('/fantasy/rankings');

  const filterToggle = page.getByRole('button', { name: /rankings filters/i });
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByPlaceholder('Search players...')).toHaveCount(0);

  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
  const search = page.getByPlaceholder('Search players...');
  await expect(search).toBeVisible();
  await search.fill('Pocket');

  await filterToggle.click();
  await expect(search).toHaveCount(0);
  await filterToggle.click();
  await expect(page.getByPlaceholder('Search players...')).toHaveValue('Pocket');
});

test('Fantasy Waivers keeps position and search behind the Filters rail', async ({ page }) => {
  const waiverPlayerId = '401';
  const responsiveFixtures = responsiveFixtureOverrides();
  const idpLeague = {
    ...responsiveFixtures.league,
    scoring_settings: {
      ...responsiveFixtures.league.scoring_settings,
      idp_tkl_solo: 2,
      idp_sack: 4,
    },
  };
  const idpFixtureState = {
    ...responsiveFixtures.persistedSleeperState,
    league: idpLeague,
    leagues: [idpLeague],
    leaguesBySeason: { ...responsiveFixtures.leaguesBySeason, [TEST_SEASON]: [idpLeague] },
  };
  const fixturePlayers = {
    ...responsiveFixtures.players,
    [waiverPlayerId]: {
      ...responsiveFixtures.players[101],
      player_id: waiverPlayerId,
      full_name: 'Pocket Free Agent',
      first_name: 'Pocket',
      last_name: 'Free Agent',
      position: 'DE',
      fantasy_positions: ['DE'],
    },
  };
  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    ...responsiveFixtures,
    league: idpLeague,
    leaguesBySeason: idpFixtureState.leaguesBySeason,
    persistedSleeperState: idpFixtureState,
    players: fixturePlayers,
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/**`, async (route) => {
    const week = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    const stats = weeklyStatsForWeek(week);
    stats[waiverPlayerId] = { week, gp: 1, idp_tkl_solo: 5, idp_sack: 1 };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stats),
    });
  });
  await page.goto('/fantasy/waivers');
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 3000 }).catch(() => {});

  const waiverRow = page.locator('.companion-player-row').filter({ hasText: 'Pocket Free Agent' });
  await expect(waiverRow).toBeVisible();
  await expect(waiverRow.locator('.companion-player-row__metric-value').first()).not.toHaveText('-');

  const filterToggle = page.getByRole('button', { name: /waiver filters/i });
  const filterPanel = page.getByTestId('fantasy-waiver-filter-panel');
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(filterPanel).toBeHidden();
  await expect(page.getByPlaceholder('Search players...')).toBeHidden();

  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(filterPanel).toBeVisible();
  await expect(filterPanel.getByRole('button', { name: 'QB', exact: true })).toBeVisible();

  const search = filterPanel.getByPlaceholder('Search players...');
  await search.fill('Pocket');
  await filterToggle.click();
  await expect(filterPanel).toBeHidden();
  await expect(filterToggle).toContainText('Search: Pocket');

  await filterToggle.click();
  await expect(search).toHaveValue('Pocket');
});

test('Fantasy player rows keep their hover glow when the accent rail is hidden', async ({ page }) => {
  await page.goto('/fantasy/rankings');

  const row = page.locator('.companion-player-row.is-interactive').first();
  await expect(row).toBeVisible();
  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();
  await expect.poll(() => row.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe('0px');

  await row.hover({ position: { x: 12, y: 12 } });
  await expect.poll(() => row.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
});

test('Trade falls back to prior-production IDP after an insufficient current season', async ({ page }) => {
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
    const week = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(week === 1 ? { [idpPlayerId]: { gp: 1, idp_tkl: 8, idp_sack: 0 } } : {}),
    });
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${priorSeason}/**`, async (route) => {
    const week = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Three qualifying weekly rows aggregate to the MIN_GAMES threshold,
      // while the current season above remains intentionally one game short.
      body: JSON.stringify(week <= 3 ? { [idpPlayerId]: { gp: 1, idp_tkl: 8, idp_sack: 0 } } : {}),
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
        await expectNoContentAreaHorizontalOverflow(page, route);
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

test('Fantasy Rosters staggers position headings and player rows individually', async ({ page }) => {
  await page.goto('/fantasy/rosters?team=1');

  const reveal = page.locator('.gs-loadswap__content');
  await expect(reveal).toBeVisible();
  const items = reveal.locator(':scope > *');
  await expect(items).toHaveCount(10);
  await expect(items.nth(0)).toContainText('QB');
  await expect(items.nth(1).locator('.companion-roster-player-row')).toHaveCount(1);

  const delays = await items.evaluateAll((elements) => (
    elements.slice(0, 4).map((element) => getComputedStyle(element).animationDelay)
  ));
  expect(delays).toEqual(['0s', '0.02s', '0.04s', '0.06s']);
});

test('Fantasy Rosters shows seasonal positional rank beside season points', async ({ page }) => {
  await page.goto('/fantasy/rosters?team=1');

  const row = page.getByRole('button', { name: 'Open Christopher Pocket Commander-Supercalifragilistic' });
  const metrics = row.locator('.companion-player-row__metric');
  const rankMetric = metrics.nth(0);
  const seasonMetric = metrics.nth(1);

  await expect(rankMetric.locator('.companion-player-row__metric-value')).toHaveText(/^QB\d+$/);
  await expect(rankMetric).toHaveAttribute('title', /QB\d+ seasonal fantasy rank/);
  await expect(seasonMetric.locator('.companion-player-row__metric-value')).toHaveText(/^\d+\.\d$/);
  await expect(seasonMetric.locator('.companion-player-row__metric-label')).toHaveText(/^\d+\.\d PPG$/);
  await expect(row.locator('.companion-player-row__meta')).not.toContainText(/QB\d+/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const narrowMetrics = row.locator('.companion-player-row__metric');
  await expect(narrowMetrics.nth(0).locator('.companion-player-row__metric-value')).toHaveText(/^QB\d+$/);
  await expect(narrowMetrics.nth(1).locator('.companion-player-row__metric-value')).toHaveText(/^\d+\.\d$/);
  await expect(narrowMetrics.nth(1).locator('.companion-player-row__metric-label')).toHaveText(/^\d+\.\d PPG$/);
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
  await expect(page.getByPlaceholder('Search team')).toHaveCount(0);
  await defenseFilters.click();
  await expect(defenseFilters).toHaveAttribute('aria-expanded', 'true');
  const defenseFilterStack = page.locator('#companion-defense-filter-stack');
  await expect(defenseFilterStack).toBeVisible();
  await expect(defenseFilterStack.getByRole('button', { name: 'Game Stats', exact: true })).toHaveClass(/is-active/);
  await expect(defenseFilterStack.getByRole('button', { name: 'All', exact: true })).toHaveClass(/is-active/);
  await expect(defenseFilterStack.getByRole('button', { name: 'Total Yds', exact: true })).toHaveClass(/is-active/);

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

test('Fantasy Defenses keeps filters and search behind the Filters chip at desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fantasy/defenses');

  const filterToggle = page.getByRole('button', { name: 'Filters' });
  const filterStack = page.locator('#companion-defense-filter-stack');
  await expect(filterToggle).toBeVisible();
  await expect(filterStack).toBeHidden();
  await expect(page.getByPlaceholder('Search team')).toHaveCount(0);

  await filterToggle.click();
  await expect(filterStack).toBeVisible();
  await expect(page.getByPlaceholder('Search team')).toBeVisible();

  await filterToggle.click();
  await expect(filterStack).toBeHidden();
  await expect(page.getByPlaceholder('Search team')).toHaveCount(0);
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
  await dismissWhatsNew(page);

  await expect(page.getByRole('button', { name: 'Show Filters' })).toBeVisible();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
  await expect(page.locator('.companion-heatmap-scroll-frame [data-scroll-cue]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await expect(page.locator('#companion-heatmap-filter-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Hide Filters' }).click();
  await expect(page.locator('#companion-heatmap-filter-panel')).toHaveCount(0);
});

test('Heatmap filter summary keeps one chip per filter after changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/heatmap');
  await dismissWhatsNew(page);

  const summaryChips = page.locator('.companion-heatmap-filter-summary__chip');
  await expect(summaryChips).toHaveCount(5);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await page.getByRole('button', { name: 'By Week', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Filters' }).click();
  await expect(summaryChips).toHaveCount(5);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await page.getByRole('button', { name: 'Overall', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Filters' }).click();
  await expect(summaryChips).toHaveCount(5);
});

test('Heatmap desktop keeps filters collapsed and groups controls in one row', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/fantasy/heatmap');
  await dismissWhatsNew(page);

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

test('Heatmap keeps empty weeks visible across viewport sizes', async ({ page }) => {
  const expectedDesktopWeekCount = Number(league.settings.playoff_week_start);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/fantasy/heatmap');
    await dismissWhatsNew(page);

    const emptyCell = page.locator('td[data-heatmap-empty]').first();
    await expect(emptyCell, `${viewport.width}×${viewport.height}`).toBeVisible();
    await expect(emptyCell).toHaveText('—');

    if (viewport.width >= 1024) {
      const weekHeaders = page.locator('th[data-heatmap-header-week]');
      await expect(weekHeaders, `${viewport.width}×${viewport.height}`).toHaveCount(expectedDesktopWeekCount);
      await expect(weekHeaders.last().locator('div').first()).toHaveText(`Wk ${expectedDesktopWeekCount}`);
    }
  }
});

test('Heatmap exposes raw QB sack and interception filters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/heatmap?pos=RB');
  await dismissWhatsNew(page);
  await page.getByRole('button', { name: 'Show Filters' }).click();
  await expect(page.getByRole('button', { name: 'Sacks Taken', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'INTs Thrown', exact: true })).toHaveCount(0);

  await page.goto('/fantasy/heatmap?pos=QB');
  await dismissWhatsNew(page);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await expect(page.getByRole('button', { name: 'Sacks Taken', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'INTs Thrown', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sacks Taken', exact: true }).click();
  await expect(page.locator('td[data-heatmap-week]').first()).toHaveText(/^\d+\.0$/);

  await page.getByRole('button', { name: 'INTs Thrown', exact: true }).click();
  await expect(page.locator('td[data-heatmap-week]').first()).toHaveText(/^\d+\.0$/);
});

test('Matchup team scoring breakdown opens as a mobile bottom sheet', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('/fantasy/matchups');

  await expect(page.locator('.companion-matchup-column-header')).toBeHidden();
  await expect(page.locator('.companion-matchup-side-headings')).toHaveCount(0);
  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();

  await page.getByRole('button', { name: /scoring breakdown, your team/i }).click();
  const sheet = page.locator('.modal-overlay--mobile-sheet .team-score-breakdown-sheet');
  await expect(sheet).toBeVisible();

  await expectMobileSheetFillsBottom(sheet, viewport);
  await expect(sheet.getByText('85.55', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'By player', exact: true }).click();
  const playerRows = sheet.locator('.team-score-breakdown-player-row');
  await expect(playerRows).toHaveCount(5);
  await expect(playerRows.first()).toContainText('Pocket Commander');
  await expect(playerRows.first()).toContainText('21.40');
  await expect(sheet.getByText('85.55', { exact: true })).toBeVisible();
});

test('Fantasy Matchups shows a Week 1 forecast from the optional BDL projection lane', async ({ page }) => {
  const fixturePlayers = responsiveFixtureOverrides().players;
  const projectionRows = Object.values(fixturePlayers).map((player, index) => ({
    id: index + 1,
    season: Number(TEST_SEASON),
    week: 1,
    player: {
      first_name: player.first_name,
      last_name: player.last_name,
      position_abbreviation: player.position,
    },
    team: { abbreviation: player.team },
    position: player.position,
    stats: player.position === 'QB'
      ? { passing_yards: 240, passing_touchdowns: 2 }
      : player.position === 'RB'
        ? { rushing_yards: 80, receptions: 3, receiving_yards: 20 }
        : { receptions: 5, receiving_yards: 60 },
  }));

  await page.route('**/api/fantasy/projections*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        season: Number(TEST_SEASON),
        week: 1,
        data: projectionRows,
        source: { provider: 'balldontlie', providerLabel: 'BALLDONTLIE', dataset: 'fantasy-projections' },
      }),
    });
  });
  const pregameMatchups = matchupsForWeek(1).map((matchup) => ({
    ...matchup,
    players_points: Object.fromEntries(Object.keys(matchup.players_points ?? {}).map((id) => [id, 0])),
    points: 0,
  }));
  await page.route(`https://api.sleeper.app/v1/league/${TEST_LEAGUE_ID}/matchups/1`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pregameMatchups),
    });
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/1`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/fantasy/matchups?week=1');

  await expect(page.getByTestId('matchup-forecast-mine')).toBeVisible();
  await expect(page.getByTestId('matchup-forecast-opponent')).toBeVisible();
  await expect(page.getByTestId('matchup-win-probability')).toBeVisible();
  await expect(page.locator('.companion-matchup-masthead__outcome')).toHaveCount(0);
  await expect(page.locator('.companion-matchup-masthead__team-name')).toHaveCount(2);
  const mastheadIdentity = page.locator('.companion-matchup-masthead__identity');
  await expect(mastheadIdentity).toHaveCount(2);
  await expect(mastheadIdentity.nth(0)).toHaveText('1st seed');
  await expect(mastheadIdentity.nth(1)).toHaveText('3rd seed');
  await expect(page.locator('.companion-matchup-masthead__identity-avatar')).toHaveCount(2);
  await expect(page.locator('.companion-matchup-masthead__probability-side span')).toHaveCount(0);
  const projectedMetricColors = await page.locator('.companion-matchup-player-metric--projection .companion-player-row__metric-value').evaluateAll((nodes) => {
    const toRgb = (value) => {
      const match = value.trim().match(/^#([0-9a-f]{6})$/i);
      if (!match) return value.trim();
      const hex = match[1];
      return `rgb(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)})`;
    };
    return nodes.map((node) => {
      const row = node.closest('.companion-player-row');
      const expected = getComputedStyle(row).getPropertyValue('--companion-player-value-fg').trim();
      return { actual: getComputedStyle(node).color, expected: toRgb(expected) };
    });
  });
  expect(projectedMetricColors.length).toBeGreaterThan(0);
  expect(projectedMetricColors.every(({ actual, expected }) => actual === expected)).toBe(true);
  await expect(page.getByTestId('matchup-win-probability')).toContainText(/win/i);
  await expect(page.getByTestId('matchup-win-probability')).toContainText('BALLDONTLIE');
  await expect(page.locator('.companion-matchup-masthead__meta')).toHaveCount(0);
  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();
  await page.getByTestId('matchup-forecast-details').getByText('Forecast details').click();
  await expect(page.getByTestId('matchup-forecast-details')).toContainText('Projected final');
  await expect(page.getByTestId('matchup-forecast-details')).toContainText('Expected edge');
  await expect(page.getByTestId('matchup-forecast-details').locator('.companion-matchup-masthead__details-meta')).toBeVisible();
  await expect(page.locator('.companion-matchup-player-metric--projection').first()).toBeVisible();
  await expect(page.locator('.companion-matchup-player-row .companion-player-row__metric-label').filter({ hasText: /pts/i })).toHaveCount(0);
  await expect(page.locator('.companion-matchup-player-row .companion-player-row__metric-label').filter({ hasText: /proj/i })).toHaveCount(0);
  await expect(page.locator('.companion-matchup-player-metric--actual .companion-player-row__metric-value').first()).toHaveText('—');
  await expect(page.getByText('0.00', { exact: true })).toHaveCount(0);
  await expect(page.getByText('League Team', { exact: true })).toHaveCount(0);

  const alignedEdges = await page.evaluate(() => {
    const actual = [...document.querySelectorAll('.companion-matchup-scorecard')].slice(0, 2);
    const forecast = [
      document.querySelector('[data-testid="matchup-forecast-mine"]'),
      document.querySelector('[data-testid="matchup-forecast-opponent"]'),
    ];
    return actual.length === 2 && forecast.every(Boolean)
      ? actual.flatMap((card, index) => {
        const cardRect = card.getBoundingClientRect();
        const forecastRect = forecast[index].getBoundingClientRect();
        return [Math.abs(cardRect.left - forecastRect.left), Math.abs(cardRect.right - forecastRect.right)];
      })
      : [Infinity];
  });
  expect(Math.max(...alignedEdges)).toBeLessThanOrEqual(1);

  // The masthead's VS control opens the week preview.
  await page.locator('.companion-matchup-masthead__axis').click();
  const preview = page.locator('.matchup-preview-modal');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.matchup-preview__chip')).toContainText('Week 1 preview');
  await expect(preview.locator('.matchup-preview__side')).toHaveCount(2);
  await expect(preview.locator('.matchup-preview__seam')).toBeVisible();

  // Keys are generated, never templated: each one belongs to a distinct family
  // and carries plain text rather than markup.
  const keys = preview.locator('.matchup-preview__key');
  const keyCount = await keys.count();
  expect(keyCount).toBeGreaterThan(0);
  expect(keyCount).toBeLessThanOrEqual(3);
  const keyTags = await preview.locator('.matchup-preview__key-tag').allTextContents();
  expect(new Set(keyTags).size).toBe(keyTags.length);
  for (const text of await preview.locator('.matchup-preview__key-text').allTextContents()) {
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toContain('<em>');
  }

  // The broadcast reveal is bound, and the panel never scrolls sideways.
  const motion = await preview.evaluate((node) => ({
    section: getComputedStyle(node.querySelector('.matchup-preview__odds')).animationName,
    hero: getComputedStyle(node.querySelector('.matchup-preview__side.is-a')).animationName,
    overflow: node.querySelector('.matchup-preview__body').scrollWidth
      - node.querySelector('.matchup-preview__body').clientWidth,
  }));
  expect(motion.section).toBe('gridshift-reveal-in');
  expect(motion.hero).toBe('gridshift-reveal-wipe-left');
  expect(motion.overflow).toBeLessThanOrEqual(1);

  // The rivalry history lives inside the preview; there is no second dialog.
  await expect(preview.getByText('The rivalry')).toBeVisible();
  await expect(preview.getByRole('button', { name: /rivalry history|Open all/i })).toHaveCount(0);
  await expect(page.locator('.matchup-rivalry-modal')).toHaveCount(0);
  await expect(preview).toBeVisible();
});

test('Fantasy Matchups locks a historical matchup after stale schedule metadata is reconciled', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = new NativeDate('2026-09-08T12:00:00.000Z').getTime();
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

  const historicalGames = [
    ['BUF', 'MIA'],
    ['KC', 'LAC'],
    ['DET', 'CHI'],
    ['DAL', 'CIN'],
    ['SF', 'BAL'],
  ].map(([away, home], index) => ({
    id: `historical-final-${index}`,
    date: '2026-09-07T10:00:00.000Z',
    week: { number: 1 },
    competitions: [{
      status: { type: { completed: false } },
      competitors: [
        { homeAway: 'away', team: { abbreviation: away, id: `${index * 2 + 1}` }, score: '24' },
        { homeAway: 'home', team: { abbreviation: home, id: `${index * 2 + 2}` }, score: '17' },
      ],
    }],
  }));
  await page.route('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard*', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: url.searchParams.get('week') === '1' ? historicalGames : [] }),
    });
  });

  const reconciliationUrls = [];
  await page.route(`https://api.sleeper.app/v1/league/${TEST_LEAGUE_ID}/matchups/1*`, async (route) => {
    reconciliationUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(matchupsForWeek(1)),
    });
  });

  const baselineEntries = matchupsForWeek(1)
    .filter((row) => row.matchup_id === 1)
    .flatMap((row) => row.starters)
    .map((playerId, index) => {
      const snapshot = {
        leagueId: TEST_LEAGUE_ID,
        season: TEST_SEASON,
        week: '1',
        playerId,
        scoringFingerprint: scoringFingerprint(persistedSleeperState().scoringSettings),
        capturedAt: Date.parse('2026-09-06T12:00:00.000Z'),
        kickoff: '2026-09-07T10:00:00.000Z',
        projection: { projected: 10 + index, factors: { source: 'balldontlie' } },
      };
      return [
        `${MATCHUP_PROJECTION_BASELINE_STORAGE_KEY}${encodeURIComponent(baselineScope(snapshot))}:${snapshot.capturedAt}`,
        snapshot,
      ];
    });
  await page.addInitScript((entries) => {
    entries.forEach(([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)));
  }, baselineEntries);

  await page.goto('/fantasy/matchups?week=1');

  await expect(page.getByTestId('matchup-win-probability')).toContainText('100%');
  await expect(page.getByTestId('matchup-win-probability')).toContainText('Final score locked');
  await expect(page.getByTestId('matchup-win-probability')).not.toContainText('Final result');
  await expect(page.locator('.companion-matchup-masthead__axis-mode')).toHaveCount(0);
  await expect(page.locator('.companion-matchup-masthead__team-name')).toHaveCount(2);
  await expect(page.locator('.companion-matchup-masthead__probability-center')).toHaveCount(0);
  await expect(page.locator('.companion-matchup-masthead__probability-side span')).toHaveCount(0);
  await expect.poll(() => reconciliationUrls.some((url) => url.includes('_gridshift='))).toBe(true);
  await expect(page.locator('.companion-matchup-masthead__projected-final')).toHaveCount(2);
  await expect(page.locator('.companion-matchup-masthead__projection-delta')).toHaveCount(2);
  await expect(page.locator('.companion-matchup-masthead__projection-delta').first()).toHaveText('+19.9');
  await expect(page.locator('.companion-matchup-masthead__bench-points')).toHaveCount(2);
  await expect(page.locator('.companion-matchup-masthead__bench-points').first()).toHaveText('POINTS LEFT ON BENCH 5.7');
  await expect(page.locator('.companion-matchup-masthead__bench-points').nth(1)).toHaveText('POINTS LEFT ON BENCH 6.2');

  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();
  await page.getByTestId('matchup-forecast-details').locator('summary').click();
  await expect(page.getByTestId('matchup-forecast-details')).toContainText('Final score');
  await expect(page.getByTestId('matchup-forecast-details')).toContainText('no points remaining');
});

test('Fantasy Matchups desktop controls fill the masthead and show the bench by default', async ({ page }) => {
  const desktopViewports = [
    { width: 1280, height: 720 },
    { width: 1440, height: 600 },
    { width: 1440, height: 800 },
    { width: 2560, height: 1440 },
  ];

  for (const viewport of desktopViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/fantasy/matchups?week=1');
    await dismissWhatsNew(page);

    const benchRows = page.locator('.companion-matchup-bench-list .companion-matchup-player-row');
    await expect(page.getByRole('button', { name: 'Select matchup' })).toBeVisible();
    await expect(page.locator('.companion-matchup-controls__rail')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hide bench players' })).toBeVisible();
    await expect(benchRows.first()).toBeVisible();

    const geometry = await page.evaluate(() => {
      const getRect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      };

      return {
        masthead: getRect('.companion-matchup-masthead'),
        week: getRect('.companion-matchup-week-trigger'),
        matchupTrigger: getRect('.companion-matchup-picker-trigger'),
        bench: getRect('button[aria-label="Hide bench players"]'),
      };
    });
    expect(geometry.masthead).not.toBeNull();
    expect(geometry.week).not.toBeNull();
    expect(geometry.matchupTrigger).not.toBeNull();
    expect(geometry.bench).not.toBeNull();
    expect(Math.abs(geometry.week.height - geometry.bench.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.week.height - geometry.matchupTrigger.height)).toBeLessThanOrEqual(1);
    expect(geometry.matchupTrigger.width).toBeGreaterThan(0);
    expect(Math.abs(geometry.bench.right - geometry.masthead.right)).toBeLessThanOrEqual(1);
  }

  const hideBench = page.getByRole('button', { name: 'Hide bench players' });
  await hideBench.click();
  await expect(page.getByRole('button', { name: 'Show bench players' })).toBeVisible();
  await expect(page.locator('.companion-matchup-bench-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show bench players' }).click();
  await expect(page.locator('.companion-matchup-bench-list .companion-matchup-player-row').first()).toBeVisible();
});

test('Fantasy Matchups mobile keeps only VS in the axis and contains the preview sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/matchups?week=1');
  await dismissWhatsNew(page);

  const masthead = page.locator('.companion-matchup-masthead');
  const axis = masthead.locator('.companion-matchup-masthead__axis');
  await expect(axis.locator('.companion-matchup-masthead__axis-label')).toHaveText('VS');
  await expect(axis.locator('.companion-matchup-masthead__axis-icon')).toBeHidden();
  await expect(axis.locator('.companion-matchup-masthead__axis-mode')).toBeHidden();

  await axis.click();
  const preview = page.locator('.matchup-preview-modal');
  await expect(preview).toBeVisible();

  const geometry = await preview.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const title = element.querySelector('.matchup-preview__title')?.getBoundingClientRect();
    const body = element.querySelector('.matchup-preview__body');
    return {
      panelRight: panel.right,
      titleLeft: title?.left ?? Infinity,
      titleRight: title?.right ?? -Infinity,
      bodyOverflow: body ? body.scrollWidth - body.clientWidth : Infinity,
    };
  });

  expect(geometry.panelRight).toBeLessThanOrEqual(390 + 1);
  expect(geometry.titleLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.titleRight).toBeLessThanOrEqual(390 + 1);
  expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
});

test('Fantasy Matchups picker selects a whole matchup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fantasy/matchups?week=1');

  const selectMatchup = page.getByRole('button', { name: 'Select matchup' });
  await selectMatchup.click();

  const thirdMatchup = page.getByRole('button', { name: /Select matchup: Third Team bye/ });
  await expect(thirdMatchup).toBeVisible();
  await thirdMatchup.evaluate((button) => button.click());

  await expect(page).toHaveURL(/\/fantasy\/matchups\?week=1&team=3$/);
  await expect(selectMatchup).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Week 1 Bye', { exact: true })).toBeVisible();
});

test('Fantasy Matchups keeps D/ST projections in the row metric track', async ({ page }) => {
  const base = responsiveFixtureOverrides();
  const dstLeague = {
    ...base.league,
    roster_positions: [
      ...base.league.roster_positions.slice(0, -3),
      'DEF',
      'BN',
      'BN',
      'BN',
    ],
  };
  const dstPlayers = {
    ...base.players,
    'dst-mine': {
      ...base.players[101],
      player_id: 'dst-mine',
      first_name: 'Washington',
      last_name: 'Commanders',
      full_name: 'Washington Commanders',
      position: 'DEF',
      fantasy_positions: ['DEF'],
      team: 'WAS',
    },
    'dst-opponent': {
      ...base.players[202],
      player_id: 'dst-opponent',
      first_name: 'Cincinnati',
      last_name: 'Bengals',
      full_name: 'Cincinnati Bengals',
      position: 'DEF',
      fantasy_positions: ['DEF'],
      team: 'CIN',
    },
  };
  const dstRosters = base.rosters.map((roster) => {
    if (roster.roster_id === 1) return { ...roster, players: [...roster.players, 'dst-mine'] };
    if (roster.roster_id === 2) return { ...roster, players: [...roster.players, 'dst-opponent'] };
    return roster;
  });
  const dstMatchupsForWeek = (week) => matchupsForWeek(week).map((matchup) => {
    if (matchup.roster_id === 1) {
      return {
        ...matchup,
        starters: [...matchup.starters, 'dst-mine'],
        players: [...matchup.players, 'dst-mine'],
        players_points: { ...matchup.players_points, 'dst-mine': 0 },
      };
    }
    if (matchup.roster_id === 2) {
      return {
        ...matchup,
        starters: [...matchup.starters, 'dst-opponent'],
        players: [...matchup.players, 'dst-opponent'],
        players_points: { ...matchup.players_points, 'dst-opponent': 0 },
      };
    }
    return matchup;
  });
  const dstState = {
    ...base.persistedSleeperState,
    league: dstLeague,
    leagues: [dstLeague],
    rosters: dstRosters,
    scoringSettings: { ...base.persistedSleeperState.scoringSettings, ...dstLeague.scoring_settings },
  };

  await page.unroute('https://api.sleeper.app/v1/**');
  await installTradeFixtures(page, {
    ...base,
    league: dstLeague,
    players: dstPlayers,
    rosters: dstRosters,
    persistedSleeperState: dstState,
    matchupsForWeek: dstMatchupsForWeek,
  });
  await page.route('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard*', async (route) => {
    const url = new URL(route.request().url());
    const week = Number(url.searchParams.get('week'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: week === 1 ? [
          {
            id: 'dst-was-phi',
            date: '2099-09-10T17:00:00Z',
            competitions: [{
              status: { type: { completed: false } },
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'PHI', id: '21' } },
                { homeAway: 'away', team: { abbreviation: 'WAS', id: '28' } },
              ],
            }],
          },
          {
            id: 'dst-tb-cin',
            date: '2099-09-11T17:00:00Z',
            competitions: [{
              status: { type: { completed: false } },
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'CIN', id: '4' } },
                { homeAway: 'away', team: { abbreviation: 'TB', id: '27' } },
              ],
            }],
          },
        ] : [],
      }),
    });
  });
  await page.route('**/api/fantasy/projections*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        season: Number(TEST_SEASON),
        week: 1,
        data: [
          { id: 1, team: { abbreviation: 'WAS' }, position: 'DST', stats: { defensive_sacks: 2, points_allowed: 17, yards_allowed: 300 } },
          { id: 2, team: { abbreviation: 'CIN' }, position: 'DST', stats: { defensive_sacks: 3, points_allowed: 14, yards_allowed: 280 } },
        ],
        source: { provider: 'balldontlie', providerLabel: 'BALLDONTLIE', dataset: 'fantasy-projections' },
      }),
    });
  });
  await page.route(`https://api.sleeper.app/v1/league/${TEST_LEAGUE_ID}/matchups/1`, async (route) => {
    const pregameMatchups = dstMatchupsForWeek(1).map((matchup) => ({
      ...matchup,
      players_points: Object.fromEntries(Object.keys(matchup.players_points ?? {}).map((id) => [id, 0])),
      points: 0,
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pregameMatchups) });
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/1`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fantasy/matchups?week=1');

  const dstRows = page.locator('.companion-matchup-player-row.is-team-defense');
  await expect(dstRows).toHaveCount(2);
  await expect(dstRows.locator('.companion-matchup-player-metric--projection')).toHaveCount(2);
  await expect(dstRows.nth(0).locator('.companion-player-row__identity-label')).toHaveText('Washington Commanders');
  await expect(dstRows.nth(0).locator('.companion-player-row__meta')).toContainText('DEF WAS @ PHI');
  await expect(dstRows.nth(1).locator('.companion-player-row__identity-label')).toHaveText('Cincinnati Bengals');
  await expect(dstRows.nth(1).locator('.companion-player-row__meta')).toContainText('DEF CIN v. TB');

  const geometry = await dstRows.evaluateAll((rows) => rows.map((row) => {
    const rowRect = row.getBoundingClientRect();
    const bodyRect = row.querySelector('.companion-player-row__body')?.getBoundingClientRect();
    const identityRect = row.querySelector('.companion-player-row__identity')?.getBoundingClientRect();
    const metaRect = row.querySelector('.companion-player-row__meta')?.getBoundingClientRect();
    const columnsRect = row.querySelector('.companion-player-row__columns')?.getBoundingClientRect();
    return {
      height: rowRect.height,
      renderedTeamLogoCount: row.querySelectorAll('.companion-player-row__team-logo').length,
      avatarCount: row.querySelectorAll('.companion-player-row__avatar').length,
      metricStartsAfterIdentity: Boolean(bodyRect && columnsRect && columnsRect.left >= bodyRect.right - 1),
      metricWithinRow: Boolean(columnsRect && columnsRect.top >= rowRect.top - 1 && columnsRect.bottom <= rowRect.bottom + 1),
      identityAboveMeta: Boolean(identityRect && metaRect && identityRect.bottom <= metaRect.top + 1),
    };
  }));

  expect(geometry).toEqual([
    {
      height: expect.any(Number),
      renderedTeamLogoCount: 0,
      avatarCount: 1,
      metricStartsAfterIdentity: true,
      metricWithinRow: true,
      identityAboveMeta: true,
    },
    {
      height: expect.any(Number),
      renderedTeamLogoCount: 0,
      avatarCount: 1,
      metricStartsAfterIdentity: true,
      metricWithinRow: true,
      identityAboveMeta: true,
    },
  ]);
  geometry.forEach((row) => expect(row.height).toBeLessThanOrEqual(72));
});

test('Fantasy Matchups shows a started player actual score above the projection', async ({ page }) => {
  const fixturePlayers = responsiveFixtureOverrides().players;
  const player = fixturePlayers[101];
  await page.route('**/api/fantasy/projections*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        season: Number(TEST_SEASON),
        week: 1,
        data: [{
          id: 1,
          season: Number(TEST_SEASON),
          week: 1,
          player: {
            first_name: player.first_name,
            last_name: player.last_name,
            position_abbreviation: player.position,
          },
          team: { abbreviation: player.team },
          position: player.position,
          stats: { passing_yards: 200, passing_touchdowns: 1 },
        }],
        source: { provider: 'balldontlie', providerLabel: 'BALLDONTLIE', dataset: 'fantasy-projections' },
      }),
    });
  });
  const startedMatchups = matchupsForWeek(1).map((matchup) => ({
    ...matchup,
    players_points: Object.fromEntries(Object.keys(matchup.players_points ?? {}).map((id) => [
      id,
      id === '101' ? 8 : id === '102' ? 1 : 0,
    ])),
    points: matchup.roster_id === 1 ? 9 : 0,
  }));
  await page.route(`https://api.sleeper.app/v1/league/${TEST_LEAGUE_ID}/matchups/1`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(startedMatchups),
    });
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/1`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Object.fromEntries(
        Object.keys(fixturePlayers).map((id) => [id, { week: 1, gp: 1 }]),
      )),
    });
  });

  await page.goto('/fantasy/matchups?week=1');

  const firstRow = page.locator('.companion-matchup-player-row').first();
  await expect(firstRow.locator('.companion-player-row__metric-label').filter({ hasText: /pts|proj/i })).toHaveCount(0);
  await expect(firstRow.locator('.companion-matchup-player-metric--actual')).toHaveCount(1);
  await expect(firstRow.locator('.companion-matchup-player-metric--projection')).toHaveCount(1);
  await expect(firstRow.locator('.companion-matchup-player-metric--actual .companion-player-row__metric-value')).toHaveText('8.00');
  await expect(firstRow.locator('.companion-player-row__metric.is-positive')).toBeVisible();
  await expect(firstRow.locator('.companion-matchup-player-performance-delta')).toHaveCount(0);
  await expect(firstRow.locator('.companion-matchup-player-metrics .companion-player-row__metric').nth(0)).toHaveClass(/companion-matchup-player-metric--actual/);
  await expect(firstRow.locator('.companion-matchup-player-metrics .companion-player-row__metric').nth(1)).toHaveClass(/companion-matchup-player-metric--projection/);
  const metricGeometry = await firstRow.evaluate((row) => {
    const metrics = [...row.querySelectorAll('.companion-matchup-player-metrics .companion-player-row__metric')];
    const rowRect = row.getBoundingClientRect();
    return {
      actualBottom: metrics[0]?.getBoundingClientRect().bottom ?? Infinity,
      projectionTop: metrics[1]?.getBoundingClientRect().top ?? -Infinity,
      projectionBottom: metrics[1]?.getBoundingClientRect().bottom ?? Infinity,
      actualFontSize: Number.parseFloat(getComputedStyle(metrics[0]?.querySelector('.companion-player-row__metric-value')).fontSize),
      projectionFontSize: Number.parseFloat(getComputedStyle(metrics[1]?.querySelector('.companion-player-row__metric-value')).fontSize),
      rowBottom: rowRect.bottom,
    };
  });
  expect(metricGeometry.actualBottom).toBeLessThanOrEqual(metricGeometry.projectionTop + 1);
  expect(metricGeometry.projectionBottom).toBeLessThanOrEqual(metricGeometry.rowBottom + 1);
  expect(metricGeometry.actualFontSize - metricGeometry.projectionFontSize).toBeGreaterThanOrEqual(3);
});

test('Fantasy Matchups keeps a finished player score neutral without a differential', async ({ page }) => {
  const fixturePlayers = responsiveFixtureOverrides().players;
  const player = fixturePlayers[101];
  await page.route('**/api/fantasy/projections*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        season: Number(TEST_SEASON),
        week: 1,
        data: [{
          id: 1,
          season: Number(TEST_SEASON),
          week: 1,
          player: {
            first_name: player.first_name,
            last_name: player.last_name,
            position_abbreviation: player.position,
          },
          team: { abbreviation: player.team },
          position: player.position,
          stats: { passing_yards: 200, passing_touchdowns: 1 },
        }],
        source: { provider: 'balldontlie', providerLabel: 'BALLDONTLIE', dataset: 'fantasy-projections' },
      }),
    });
  });
  await page.route('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard*', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: url.searchParams.get('week') === '1' ? [{
          id: 'finished-buf-mia',
          date: '2026-09-07T10:00:00.000Z',
          competitions: [{
            status: { type: { completed: true, state: 'post', name: 'STATUS_FINAL' } },
            competitors: [
              { homeAway: 'away', team: { abbreviation: 'BUF', id: '2' }, score: '24' },
              { homeAway: 'home', team: { abbreviation: 'MIA', id: '20' }, score: '17' },
            ],
          }],
        }] : [],
      }),
    });
  });

  await page.goto('/fantasy/matchups?week=1');

  const firstRow = page.locator('.companion-matchup-player-row').first();
  await expect(firstRow.locator('.companion-matchup-player-metric--actual .companion-player-row__metric-value')).toHaveText('21.40');
  await expect(firstRow.locator('.companion-matchup-player-metric--projection')).toHaveCount(1);
  await expect(firstRow.locator('.companion-matchup-player-performance-delta')).toHaveCount(0);
  await expect.poll(
    () => firstRow.locator('.companion-matchup-player-metric--actual.is-positive, .companion-matchup-player-metric--actual.is-negative').count(),
  ).toBe(0);

  const metricGeometry = await firstRow.evaluate((row) => {
    const metrics = [...row.querySelectorAll('.companion-matchup-player-metrics .companion-player-row__metric')];
    return {
      actualFontSize: Number.parseFloat(getComputedStyle(metrics[0]?.querySelector('.companion-player-row__metric-value')).fontSize),
      projectionFontSize: Number.parseFloat(getComputedStyle(metrics[1]?.querySelector('.companion-player-row__metric-value')).fontSize),
    };
  });
  expect(metricGeometry.actualFontSize - metricGeometry.projectionFontSize).toBeGreaterThanOrEqual(3);
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

test('player statistics back button returns to the originating Fantasy view', async ({ page }) => {
  await page.goto('/fantasy/rosters');
  await dismissWhatsNew(page);

  await page.getByRole('button', { name: 'Open Christopher Pocket Commander-Supercalifragilistic', exact: true }).click();
  await expect(page).toHaveURL(/\/statistics\/player\/1001\/christopher-pocket-commander-supercalifragilistic/);

  const backButton = page.getByRole('button', { name: 'Rosters', exact: true });
  await expect(backButton).toBeVisible();
  await backButton.click();

  await expect(page).toHaveURL(/\/fantasy\/rosters/);
  await expect(page.getByRole('button', { name: 'Open Christopher Pocket Commander-Supercalifragilistic', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a league', exact: true })).toHaveCount(0);
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

async function dismissWhatsNew(page) {
  const dismissButton = page.getByRole('button', { name: 'Dismiss' });
  const visible = await dismissButton.waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;
  await dismissButton.click();
  await expect(dismissButton).toHaveCount(0);
}

function responsiveFixtureOverrides() {
  const responsiveLeague = {
    ...league,
    name: 'GridShift Extremely Long Responsive Test League',
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'IDP_FLEX', 'K', 'BN', 'BN', 'BN'],
    settings: {
      ...league.settings,
      draft_rounds: 8,
      // Current-season progress must not limit the picker to completed weeks.
      last_scored_leg: 1,
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
