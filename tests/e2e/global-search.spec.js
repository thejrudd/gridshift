import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';
import { players, rosters } from '../fixtures/tradeFixtures.js';

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

  test('does not announce a correction the results did not use', async ({ page }) => {
    await openWithShortcut(page);
    // "target" corrects to the stat "targets", but Target Magnet matched it as typed.
    await searchInput(page).fill('target magnet vs flex receiver');
    await expect(palette(page).getByRole('heading', { name: 'Target Magnet vs Flex Receiver' })).toBeVisible();
    await expect(palette(page).getByText('Showing results for')).toBeHidden();
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

// Monday night of week 9 in the bundled 2026 schedule: Buffalo at Minnesota is
// in progress, the Sunday games are final.
const LIVE_NOW = new Date('2026-11-10T02:30:00Z');

const LIVE_GAMES = [
  {
    id: 9001, week: 9, date: '2026-11-10T01:15:00.000Z', status: '4:12 - 3rd',
    visitor_team: { abbreviation: 'BUF', full_name: 'Buffalo Bills' },
    home_team: { abbreviation: 'MIN', full_name: 'Minnesota Vikings' },
    visitor_team_score: 17, home_team_score: 20,
    visitor_team_q1: 7, visitor_team_q2: 3, visitor_team_q3: 7,
    home_team_q1: 0, home_team_q2: 13, home_team_q3: 7,
  },
  {
    id: 9002, week: 9, date: '2026-11-09T01:20:00.000Z', status: 'Final',
    visitor_team: { abbreviation: 'TB', full_name: 'Tampa Bay Buccaneers' },
    home_team: { abbreviation: 'CHI', full_name: 'Chicago Bears' },
    visitor_team_score: 24, home_team_score: 27,
  },
];

const LIVE_DETAIL = {
  ok: true,
  teamStats: [
    { team: { abbreviation: 'BUF' }, total_yards: 288, net_passing_yards: 201, rushing_yards: 87, turnovers: 2, third_down_conversions: 4, third_down_attempts: 9, possession_time: '19:02' },
    { team: { abbreviation: 'MIN' }, total_yards: 301, net_passing_yards: 236, rushing_yards: 65, turnovers: 0, third_down_conversions: 5, third_down_attempts: 10, possession_time: '18:46' },
  ],
  playerStats: [
    { team: { abbreviation: 'BUF' }, defensive_sacks: 2 },
    { team: { abbreviation: 'MIN' }, defensive_sacks: 3 },
  ],
};

async function installLiveServer(page, { enabled = true, gamesStatus = 200 } = {}) {
  const requests = [];
  await page.route('**/api/statistics/scores/game/*/detail*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${url.pathname}${url.search}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE_DETAIL) });
  });
  await page.route('**/api/live/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/live/status') {
      return json({
        ok: true,
        live: { enabled, leagueAllowed: enabled, accessCodeRequired: false },
        session: { enabled },
      });
    }
    if (url.pathname === '/api/live/games') {
      return gamesStatus === 200
        ? json({ ok: true, data: LIVE_GAMES })
        : json({ ok: false, error: 'upstream' }, gamesStatus);
    }
    return json({ ok: true, data: [] });
  });
  return requests;
}

test.describe('live answers', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Behaviour is shared across layouts.');
    await page.clock.setFixedTime(LIVE_NOW);
    await installTradeFixtures(page);
  });

  async function start(page) {
    await page.goto(START_ROUTE);
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();
    await expect(page).toHaveURL(SETTLED_ROUTE);
    await openWithShortcut(page);
  }

  test('a team score query answers with its game in progress, which opens Scores', async ({ page }) => {
    const requests = await installLiveServer(page);
    await start(page);
    await searchInput(page).fill('bills score');
    const card = palette(page).getByRole('region', { name: 'Search answer' });
    await expect(card.getByRole('heading', { name: 'Buffalo Bills at Minnesota Vikings' })).toBeVisible();
    await expect(card).toContainText('Q3 · 4:12');
    await expect(card.locator('.matchup-live-dot')).toHaveCount(1);

    // The box score: points by quarter, then the headline team stats.
    const lineScore = card.getByRole('table', { name: 'Score by quarter' });
    await expect(lineScore.getByRole('row', { name: /MIN/ })).toContainText('13');
    const highlights = card.getByRole('table', { name: 'Game highlights' });
    await expect(highlights.getByRole('row', { name: /Total yards/ })).toContainText('301');
    await expect(highlights.getByRole('row', { name: /Turnovers/ })).toContainText('(better)');
    expect(requests.find((path) => path.includes('/detail'))).toContain('plays=0');

    await card.getByRole('button', { name: /BUF/ }).click();
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/statistics\/scores/);
  });

  test('live scores lead with the games in progress', async ({ page }) => {
    const requests = await installLiveServer(page);
    await start(page);
    await searchInput(page).fill('live scores');
    const card = palette(page).getByRole('region', { name: 'Search answer' });
    await expect(card.getByRole('heading', { name: 'Live now' })).toBeVisible();
    await expect(card.getByRole('listitem').first()).toContainText('BUF');
    await expect(card.getByRole('listitem').nth(1)).toContainText('Final');
    // The slate stays a compact list: no box scores, and none fetched.
    await expect(card.getByRole('table', { name: 'Game highlights' })).toHaveCount(0);
    expect(requests.filter((path) => path.includes('/detail'))).toEqual([]);
  });

  test('with live data off on the server there is no live card and no live request', async ({ page }) => {
    const requests = await installLiveServer(page, { enabled: false });
    await start(page);
    await searchInput(page).fill('bills score');
    await expect(palette(page).getByRole('option').first()).toContainText('Buffalo Bills');
    await expect(palette(page).getByRole('option', { name: /Scores/ })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(palette(page).getByRole('region', { name: 'Search answer' })).toBeHidden();
    await expect(palette(page).getByText('Live scores aren’t available right now.')).toBeHidden();
    expect(requests.filter((path) => path !== '/api/live/status')).toEqual([]);
  });

  test('a failing live server says so and keeps the results', async ({ page }) => {
    await installLiveServer(page, { gamesStatus: 502 });
    await start(page);
    await searchInput(page).fill('bills score');
    await expect(palette(page).getByText('Live scores aren’t available right now.')).toBeVisible();
    await expect(palette(page).getByRole('option').first()).toContainText('Buffalo Bills');
  });
});

test.describe('result actions', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Keyboard paths; tap is covered on mobile.');
    await installTradeFixtures(page);
    await page.goto(START_ROUTE);
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();
    await expect(page).toHaveURL(SETTLED_ROUTE);
  });

  test('→ walks into a player\'s actions and Enter trades for him from his owner', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('partner receiver');
    const detail = palette(page).locator('.global-search-detail');
    await expect(detail.getByRole('button', { name: 'Trade for' })).toBeVisible();
    await expect(palette(page).getByText('for actions')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(detail.getByRole('button', { name: 'Trade for' })).toHaveClass(/is-focused/);
    await expect(searchInput(page)).toHaveAttribute('aria-activedescendant', 'global-search-action-0');
    await page.keyboard.press('Tab');
    await expect(detail.getByRole('button', { name: 'Roster' })).toHaveClass(/is-focused/);
    await page.keyboard.press('ArrowLeft');
    await expect(detail.getByRole('button', { name: 'Trade for' })).toHaveClass(/is-focused/);

    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/trade\/agent\?player=203&side=get&partner=2$/);
  });

  test('← back out of the actions returns Enter to the result itself', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('seahawks');
    const detail = palette(page).locator('.global-search-detail');
    await expect(detail.getByRole('button', { name: 'Schedule' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(detail.getByRole('button', { name: 'Schedule' })).not.toHaveClass(/is-focused/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/statistics\/team\/sea$/);
  });

  test('your own player is offered to trade away', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('target magnet');
    await palette(page).getByRole('button', { name: 'Trade away' }).click();
    await expect(page).toHaveURL(/\/trade\/agent\?player=104&side=give$/);
  });
});

const HISTORY_TRANSACTIONS = {
  3: [
    {
      transaction_id: 'search-trade', type: 'trade', status: 'complete', status_updated: Date.UTC(2026, 8, 21), leg: 3,
      roster_ids: [1, 2], adds: { 106: 2, 203: 1 }, drops: { 106: 1, 203: 2 },
    },
    {
      transaction_id: 'search-waiver', type: 'waiver', status: 'complete', status_updated: Date.UTC(2026, 8, 23), leg: 3,
      adds: { 305: 1 }, drops: { 105: 1 },
    },
  ],
};

test.describe('league history answers', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Behaviour is shared across layouts.');
    await installTradeFixtures(page, { transactionsByRound: HISTORY_TRANSACTIONS });
  });

  test('before League History has been opened, history questions only offer its pages', async ({ page }) => {
    await page.goto(START_ROUTE);
    await expect(page).toHaveURL(SETTLED_ROUTE);
    await openWithShortcut(page);
    await searchInput(page).fill('recent transactions');
    await expect(palette(page).getByRole('option', { name: /League activity/ })).toBeVisible();
    await expect(palette(page).getByRole('region', { name: 'Search answer' })).toBeHidden();
  });

  test('once League History has loaded, search answers from it without fetching', async ({ page }) => {
    await page.goto('/league/history');
    await expect(page.getByRole('heading', { name: 'Lifetime leaderboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();

    const historyRequests = [];
    page.on('request', (request) => {
      if (/\/v1\/league\/.+\/(transactions|matchups|winners_bracket)/.test(request.url())) historyRequests.push(request.url());
    });

    await openWithShortcut(page);
    const card = palette(page).getByRole('region', { name: 'Search answer' });

    await searchInput(page).fill('recent transactions');
    await expect(card.getByRole('heading', { name: 'Recent transactions' })).toBeVisible();
    await expect(card.getByRole('listitem').first()).toContainText('adds Third Bench Runner');

    await searchInput(page).fill('head to head partner team');
    await expect(card.getByRole('heading', { name: 'You vs Partner Team' })).toBeVisible();

    await searchInput(page).fill('bench runner trades');
    await expect(card.getByRole('heading', { name: 'Bench Runner trades' })).toBeVisible();
    await expect(card).toContainText('Partner Team gets Bench Runner');

    await card.getByRole('button', { name: 'Open trade history' }).click();
    await expect(page).toHaveURL(/\/trade\/history/);
    expect(historyRequests).toEqual([]);
  });
});

test.describe('players with no team', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Behaviour is shared across layouts.');
    // As Sleeper lists him: a free agent with neither a team nor an ESPN id.
    await installTradeFixtures(page, {
      players: {
        ...players,
        7528: { player_id: '7528', full_name: 'Najee Harris', first_name: 'Najee', last_name: 'Harris', position: 'RB', team: null, espn_id: null, active: true, search_rank: 170, fantasy_positions: ['RB'] },
      },
    });
    await page.route('https://site.web.api.espn.com/apis/common/v3/search**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: '4241457', displayName: 'Najee Harris', type: 'player' }] }),
    }));
    await page.goto(START_ROUTE);
    await expect(page.getByRole('button', { name: 'Search GridShift' })).toBeVisible();
    await expect(page).toHaveURL(SETTLED_ROUTE);
  });

  test('a free agent with no ESPN id opens his stats page, found by name', async ({ page }) => {
    await openWithShortcut(page);
    await searchInput(page).fill('najee harris');
    await expect(palette(page).getByRole('option').first()).toContainText('Najee Harris');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/statistics\/player\/4241457/);
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

  test('a team\'s schedule action opens from a tap', async ({ page }) => {
    await page.getByRole('button', { name: 'Search GridShift' }).click();
    await searchInput(page).fill('seahawks');
    await palette(page).getByRole('button', { name: 'Schedule' }).click();
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/statistics\/schedule/);
    await expect(page).toHaveURL(/sea/i);
  });
});
