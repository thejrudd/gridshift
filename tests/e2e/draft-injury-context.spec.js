import { expect, test } from '@playwright/test';
import {
  TEST_LEAGUE_ID,
  TEST_SEASON,
  drafts,
  league,
  players,
  rosters,
} from '../fixtures/tradeFixtures.js';
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

const PHONE_VIEWPORTS = [
  { name: 'compact Android', width: 360, height: 800 },
  { name: 'standard iPhone', width: 390, height: 844 },
  { name: 'large iPhone', width: 430, height: 932 },
  { name: 'iPhone 16 Pro Max', width: 440, height: 956 },
];

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page, {
    installedVersion: '8.6.0',
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

test('mobile War Room keeps search prominent and rows readable with a visible add action', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Phone viewport coverage runs in the touch-enabled project.');

  for (const viewport of PHONE_VIEWPORTS) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/draft/war-room');

      const search = page.getByLabel('Search draft players').filter({ visible: true });
      const filters = page.getByRole('button', { name: 'Filters' });
      await expect(search).toBeVisible();
      await expect(filters).toBeVisible();
      await expect(filters.locator('.draft-filter-icon')).toBeVisible();
      const priorityControls = page.locator('.draft-big-board__mobile-controls .draft-mobile-control-menu__content');
      await expect(priorityControls).toBeHidden();

      await filters.click();
      await expect(priorityControls.getByText('Adjust ranking priorities', { exact: true })).toBeVisible();
      await priorityControls.getByRole('button', { name: 'All Players' }).click();

      const row = page.locator('.draft-player-row--big-board:visible').first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.scrollIntoViewIfNeeded();

      const addAction = row.getByRole('button', { name: /^Add .* to board$/ });
      await expect(addAction).toBeVisible();
      await expect(addAction.locator('.draft-player-row__add-glyph')).toHaveText('+');

      const geometry = await page.evaluate(() => {
        const header = document.querySelector('.draft-mobile-sort-header .draft-big-board-header__player--mobile');
        const rowElement = document.querySelector('.draft-player-row--big-board');
        const add = rowElement?.querySelector('.draft-player-row__add-action');
        const identityParts = [
          rowElement?.querySelector('.companion-player-row__avatar'),
          rowElement?.querySelector('.companion-player-row__position'),
          rowElement?.querySelector('.companion-player-row__body'),
        ].filter(Boolean).map((element) => element.getBoundingClientRect());
        const visibleHeaders = Array.from(document.querySelectorAll('.draft-mobile-sort-header .draft-big-board-header__metrics button'))
          .filter((element) => getComputedStyle(element).display !== 'none')
          .map((element) => element.getBoundingClientRect());
        const visibleValues = Array.from(rowElement?.querySelectorAll('.companion-player-row__columns > *') ?? [])
          .filter((element) => getComputedStyle(element).display !== 'none')
          .map((element) => element.getBoundingClientRect());
        const headerRect = header?.getBoundingClientRect();
        const addRect = add?.getBoundingClientRect();
        const identityLeft = Math.min(...identityParts.map((rect) => rect.left));
        const identityRight = Math.max(...identityParts.map((rect) => rect.right));
        return {
          viewportWidth: window.innerWidth,
          playerHeaderCenter: headerRect ? headerRect.left + (headerRect.width / 2) : null,
          identityCenter: (identityLeft + identityRight) / 2,
          addLeft: addRect?.left ?? null,
          addRight: addRect?.right ?? null,
          headerCount: visibleHeaders.length,
          valueCount: visibleValues.length,
          allHeadersInside: visibleHeaders.every((rect) => rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5),
          allValuesInside: visibleValues.every((rect) => rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5),
        };
      });

      expect(Math.abs(geometry.playerHeaderCenter - geometry.identityCenter)).toBeLessThanOrEqual(18);
      expect(geometry.addLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.addRight).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.headerCount).toBe(2);
      expect(geometry.valueCount).toBe(geometry.headerCount);
      expect(geometry.allHeadersInside).toBe(true);
      expect(geometry.allValuesInside).toBe(true);
    });
  }
});

test('mobile positional map exposes discrete interactive dots and chart-owned two-finger gestures', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Touch behavior runs in the mobile project.');
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto('/draft/war-room');
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.locator('.draft-big-board__mobile-controls .draft-mobile-control-menu__content')
    .getByRole('button', { name: 'All Players' })
    .click();

  const firstRow = page.locator('.draft-player-row--big-board:visible').first();
  await expect(firstRow).toBeVisible({ timeout: 20_000 });
  await firstRow.click({ position: { x: 120, y: 30 } });

  const chart = page.getByRole('group', { name: /scatter plot$/ });
  await expect(chart).toBeVisible();
  await expect(chart).toHaveCSS('touch-action', 'pan-y');

  const selected = chart.locator('[data-chart-point="dot"][data-point-state="selected"]');
  const peers = chart.locator('[data-chart-point="dot"][data-point-state="peer"]');
  await expect(selected).toHaveCount(1);
  expect(await peers.count()).toBeGreaterThan(0);

  const peerTouchBox = await peers.first().boundingBox();
  const peerMarkBox = await peers.first().locator('.draft-analytics-scatter__dot-mark').boundingBox();
  expect(peerTouchBox).not.toBeNull();
  expect(peerMarkBox).not.toBeNull();
  expect(peerTouchBox.width).toBeGreaterThanOrEqual(44);
  expect(peerTouchBox.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(peerMarkBox.width - peerMarkBox.height)).toBeLessThanOrEqual(1);
  expect(peerMarkBox.width).toBeLessThanOrEqual(16);

  const gestureResult = await chart.evaluate((element) => {
    const touch = (identifier, clientX, clientY) => new Touch({
      identifier,
      target: element,
      clientX,
      clientY,
      pageX: clientX,
      pageY: clientY,
      screenX: clientX,
      screenY: clientY,
    });
    const startTouches = [touch(1, 120, 260), touch(2, 200, 260)];
    element.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: startTouches,
      targetTouches: startTouches,
      changedTouches: startTouches,
    }));
    const movedTouches = [touch(1, 100, 240), touch(2, 240, 260)];
    const twoFingerMove = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: movedTouches,
      targetTouches: movedTouches,
      changedTouches: movedTouches,
    });
    element.dispatchEvent(twoFingerMove);
    element.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: movedTouches,
    }));

    const oneTouch = [touch(3, 150, 260)];
    element.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: oneTouch,
      targetTouches: oneTouch,
      changedTouches: oneTouch,
    }));
    const oneFingerMove = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: [touch(3, 150, 220)],
      targetTouches: [touch(3, 150, 220)],
      changedTouches: [touch(3, 150, 220)],
    });
    element.dispatchEvent(oneFingerMove);
    return {
      twoFingerPrevented: twoFingerMove.defaultPrevented,
      oneFingerPrevented: oneFingerMove.defaultPrevented,
    };
  });

  await expect.poll(async () => Number(await chart.getAttribute('data-chart-scale'))).toBeGreaterThan(1);
  expect(gestureResult.twoFingerPrevented).toBe(true);
  expect(gestureResult.oneFingerPrevented).toBe(false);

  await peers.first().focus();
  await peers.first().press('Enter');
  await expect(chart.locator('[data-point-state="selected"]')).toHaveCount(1);
});

const BOARD_KEY = `draft_assistant_position_board_v2:${TEST_LEAGUE_ID}:${TEST_SEASON}:draft-2026`;

async function installBoardState(page, {
  boardByPosition,
  overall,
  leagueOverride = league,
  draftPicks = [],
  darkMode = false,
  draftOverride = preDraft,
} = {}) {
  await installTradeFixtures(page, {
    installedVersion: '8.6.0',
    league: leagueOverride,
    leaguesBySeason: { [TEST_SEASON]: [leagueOverride] },
    persistedSleeperState: {
      sleeperUser: { user_id: 'user-me', username: 'gridshift_tester', display_name: 'GridShift Tester' },
      leagues: [leagueOverride],
      selectedLeagueId: TEST_LEAGUE_ID,
      league: leagueOverride,
      rosters,
      leagueUsers: [
        { user_id: 'user-me', display_name: 'You', username: 'you', metadata: { team_name: 'Your Team' } },
        { user_id: 'user-partner', display_name: 'Trade Partner', username: 'partner', metadata: { team_name: 'Partner Team' } },
      ],
      season: TEST_SEASON,
      availableSeasons: [TEST_SEASON],
      leaguesBySeason: { [TEST_SEASON]: [leagueOverride] },
      scoringSettings: leagueOverride.scoring_settings,
    },
    players,
    drafts: draftOverride,
    draftPicks,
  });
  await page.addInitScript(({ key, byPosition, overallIds, useDarkMode }) => {
    window.localStorage.setItem(key, JSON.stringify({ byPosition, overall: overallIds }));
    window.localStorage.setItem('nfl-predictor-dark-mode', String(useDarkMode));
  }, {
    key: BOARD_KEY,
    byPosition: boardByPosition,
    overallIds: overall,
    useDarkMode: darkMode,
  });
}

async function openBoardControls(page, mobile) {
  // Board view, card labels, and bye-conflict controls are always visible on
  // mobile. Retain the helper so each behavior test reads the same on both
  // surfaces without reintroducing a redundant submenu.
  void page;
  void mobile;
}

async function closeBoardControls(page, mobile) {
  void page;
  void mobile;
}

async function setBoardCardMetric(page, mobile, metricId, buttonLabel) {
  if (mobile) {
    await page.getByLabel('Board card labels').selectOption(metricId);
    return;
  }
  await page.getByRole('button', { name: buttonLabel, exact: true }).click();
}

function visibleBoardCard(page, playerId) {
  return page.locator(`.draft-board-main .draft-board-card-shell[data-player-id="${playerId}"]:visible`).first();
}

test('Bye metric and conflict highlighting stay independent across Board surfaces', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile';
  await installBoardState(page, {
    boardByPosition: { QB: ['101', '202'], WR: ['103'], RB: ['205'] },
    overall: ['101', '202', '103', '205'],
    darkMode: mobile,
  });
  await page.goto('/draft/my-board');

  if (mobile) await expect(page.locator('html')).toHaveClass(/dark/);
  else await expect(page.locator('html')).not.toHaveClass(/dark/);

  await openBoardControls(page, mobile);
  const toggle = page.getByRole('switch', { name: 'Highlight bye week conflicts' }).filter({ visible: true });
  await expect(toggle).toBeEnabled({ timeout: 20_000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.draft-bye-conflict-marker:visible')).toHaveCount(0);

  await setBoardCardMetric(page, mobile, 'bye', 'Bye');
  await closeBoardControls(page, mobile);

  const buffaloCard = visibleBoardCard(page, '101');
  await expect(buffaloCard).toBeVisible();
  await expect(buffaloCard.locator('.draft-board-metric-value__label')).toHaveText('Bye');
  await expect(buffaloCard.locator('.draft-board-metric-value__number')).toHaveText('7');

  await openBoardControls(page, mobile);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await closeBoardControls(page, mobile);

  await expect(buffaloCard).toHaveClass(/is-positional-bye-conflict/);
  await expect(buffaloCard.locator('.draft-bye-conflict-marker')).toHaveText('Bye 7');
  await expect(buffaloCard.locator('.draft-bye-conflict-marker')).toHaveAttribute('aria-label', 'QB positional conflict, bye 7');
  await expect(buffaloCard.getByRole('button', { name: /Open Pocket Commander.*Partner Quarterback/ })).toBeVisible();

  if (mobile) {
    await expect(page.getByRole('button', { name: 'View Available Players' })).toBeVisible();
    await page.locator('.draft-board-mobile-available__summary').click();
    await expect(page.getByRole('button', { name: 'Hide Available Players' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'All Players', exact: true }).filter({ visible: true }).click();
  const philadelphiaAvailableCard = page.locator('.draft-board-available-list:visible .draft-board-card-shell[data-player-id="302"]').first();
  await expect(philadelphiaAvailableCard).toHaveClass(/is-bye-conflict/);
  await expect(philadelphiaAvailableCard).not.toHaveClass(/is-positional-bye-conflict/);
  await expect(philadelphiaAvailableCard.locator('.draft-bye-conflict-marker')).toHaveText('Bye 10');
  if (mobile) await page.locator('.draft-board-mobile-available__summary').click();

  await openBoardControls(page, mobile);
  await setBoardCardMetric(page, mobile, 'sleeper', 'Rank');
  await page.getByRole('button', { name: 'Overall', exact: true }).filter({ visible: true }).click();
  await closeBoardControls(page, mobile);

  const overallBuffaloCard = visibleBoardCard(page, '101');
  await expect(overallBuffaloCard.locator('.draft-board-metric-value__label')).toHaveText('Sleeper');
  await expect(overallBuffaloCard.locator('.draft-bye-conflict-marker')).toContainText('Bye 7');
  await overallBuffaloCard.getByRole('button', { name: /Open Pocket Commander/ }).focus();
  await expect(overallBuffaloCard.getByRole('button', { name: /Open Pocket Commander/ })).toBeFocused();

  const clipping = await page.evaluate(() => {
    const controls = document.querySelector('.draft-board-page-controls:not(.draft-board-page-mobile-controls *)');
    const visibleCards = Array.from(document.querySelectorAll('.draft-board-card-shell'))
      .filter((card) => card.getClientRects().length > 0);
    const elements = [controls, ...visibleCards].filter(Boolean);
    return elements.map((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
  });
  expect(clipping.every(({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth + 2)).toBe(true);

  if (!mobile) {
    const qbPeer = visibleBoardCard(page, '202');
    await overallBuffaloCard.dragTo(qbPeer);
    await expect(page.locator('.draft-board-main .draft-board-card-shell[data-player-id="101"]')).toHaveCount(1);
    await expect(visibleBoardCard(page, '101').locator('.draft-bye-conflict-marker')).toContainText('Bye 7');
  }
});

for (const format of [
  { name: 'redraft saved targets', type: 0, board: { QB: ['101', '202'] }, overall: ['101', '202'], picks: [], playerId: '101' },
  { name: 'keeper saved targets', type: 1, board: { QB: ['101', '202'] }, overall: ['101', '202'], picks: [], playerId: '101' },
  { name: 'dynasty saved targets', type: 2, board: { QB: ['101', '202'] }, overall: ['101', '202'], picks: [], playerId: '101' },
]) {
  test(`${format.name} supplies the expected comparison set`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Format matrix runs once in the desktop project.');
    const formatLeague = { ...league, settings: { ...league.settings, type: format.type } };
    await installBoardState(page, {
      boardByPosition: format.board,
      overall: format.overall,
      leagueOverride: formatLeague,
      draftPicks: format.picks,
    });
    await page.goto('/draft/my-board');

    const toggle = page.getByRole('switch', { name: 'Highlight bye week conflicts' });
    await expect(toggle).toBeEnabled({ timeout: 20_000 });
    await toggle.click();
    const card = visibleBoardCard(page, format.playerId);
    await expect(card).toHaveClass(/is-positional-bye-conflict/);
    await expect(card.locator('.draft-bye-conflict-marker')).toHaveText('Bye 7');
    await expect(card.locator('.draft-bye-conflict-marker')).toHaveAttribute('aria-label', 'QB positional conflict, bye 7');
  });
}

test('a target drafted by another manager clears the redraft conflict on refresh', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Live-pick refresh runs once in the desktop project.');
  const livePicks = [];
  const liveDraft = [{ ...preDraft[0], status: 'drafting' }];
  await installBoardState(page, {
    boardByPosition: { QB: ['101', '202'] },
    overall: ['101', '202'],
    draftPicks: livePicks,
    draftOverride: liveDraft,
  });
  await page.goto('/draft/my-board');

  const toggle = page.getByRole('switch', { name: 'Highlight bye week conflicts' });
  await expect(toggle).toBeEnabled({ timeout: 20_000 });
  await toggle.click();
  await expect(visibleBoardCard(page, '101')).toHaveClass(/is-positional-bye-conflict/);

  livePicks.push({ roster_id: 2, player_id: '202', round: 1, pick_no: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(visibleBoardCard(page, '101')).not.toHaveClass(/is-bye-conflict/, { timeout: 10_000 });
  const draftedCard = visibleBoardCard(page, '202');
  await expect(draftedCard).toHaveClass(/is-drafted-by-other/);
  await expect(draftedCard.getByText('Drafted by Partner Team', { exact: true })).toBeVisible();

  const cardLayout = await page.locator('.draft-board-main .draft-board-card-shell:visible').evaluateAll((cards) => cards.map((card) => {
    const cardRect = card.getBoundingClientRect();
    const rowRect = card.querySelector('.draft-player-row--board-card')?.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      rowHeight: rowRect?.height ?? 0,
      rowBottom: rowRect?.bottom ?? 0,
      cardBottom: cardRect.bottom,
    };
  }));
  expect(cardLayout).toHaveLength(2);
  expect(new Set(cardLayout.map(({ cardHeight }) => cardHeight)).size).toBe(1);
  expect(cardLayout.every(({ cardHeight, rowHeight, rowBottom, cardBottom }) => (
    rowHeight === cardHeight && rowBottom <= cardBottom + 1
  ))).toBe(true);
});

test('desktop Board keeps card controls and drafting status inside one fixed card contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop width sweep runs once in the desktop project.');
  await installBoardState(page, {
    boardByPosition: { QB: ['101', '202'] },
    overall: ['101', '202'],
    draftPicks: [{ roster_id: 2, player_id: '202', round: 1, pick_no: 1 }],
    draftOverride: [{ ...preDraft[0], status: 'drafting' }],
  });
  await page.goto('/draft/my-board');
  await expect(visibleBoardCard(page, '202').getByText('Drafted by Partner Team', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bye', exact: true }).click();

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 600 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await visibleBoardCard(page, '202').evaluate((card) => {
      const row = card.querySelector('.draft-player-row--board-card');
      const status = card.querySelector('.companion-player-row__status-slot');
      const actions = card.querySelector('.companion-player-row__actions');
      const cardRect = card.getBoundingClientRect();
      const rowRect = row?.getBoundingClientRect();
      const statusRect = status?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      return {
        cardHeight: cardRect.height,
        rowHeight: rowRect?.height ?? 0,
        cardWidth: cardRect.width,
        rowScrollWidth: row?.scrollWidth ?? 0,
        rowClientWidth: row?.clientWidth ?? 0,
        statusInsideCard: Boolean(statusRect && statusRect.left >= cardRect.left - 1 && statusRect.right <= cardRect.right + 1),
        statusBelowActions: Boolean(statusRect && actionsRect && statusRect.top >= actionsRect.bottom - 1),
      };
    });

    expect(layout.cardWidth).toBeGreaterThan(300);
    expect(layout.cardHeight).toBe(94);
    expect(layout.rowHeight).toBe(94);
    expect(layout.rowScrollWidth).toBeLessThanOrEqual(layout.rowClientWidth + 2);
    expect(layout.statusInsideCard).toBe(true);
    expect(layout.statusBelowActions).toBe(true);
  }
});
