import { expect, test } from '@playwright/test';
import { installTradeFixtures } from './tradeTestHarness.js';
import { league, leagueUsers, persistedSleeperState, players, rosters } from '../fixtures/tradeFixtures.js';

const draftPicks = [
  pick(1, 1, 1, '101'),
  pick(2, 1, 2, '201'),
  pick(3, 1, 3, '301'),
  pick(4, 2, 1, '102'),
  pick(5, 2, 2, '203'),
  pick(6, 2, 3, '303'),
];

test.beforeEach(async ({ page }) => {
  await installTradeFixtures(page, {
    installedVersion: '8.2.2',
    draftPicks,
    transactionsByRound: {
      0: [
        {
          transaction_id: 'offseason-free-agent-test',
          type: 'free_agent',
          status: 'complete',
          status_updated: Date.UTC(2026, 5, 15, 12),
          leg: 1,
          adds: { 106: 1 },
        },
      ],
      3: [
        {
          transaction_id: 'trade-many-test',
          type: 'trade',
          status: 'complete',
          status_updated: Date.UTC(2026, 8, 21),
          leg: 3,
          roster_ids: [1, 2],
          adds: { 101: 2, 102: 2, 103: 2, 201: 1, 202: 1 },
          drops: { 101: 1, 102: 1, 103: 1, 201: 2, 202: 2 },
        },
        {
          transaction_id: 'waiver-test',
          type: 'waiver',
          status: 'complete',
          status_updated: Date.UTC(2026, 8, 20),
          leg: 3,
          adds: { 106: 1 },
          drops: { 105: 1 },
        },
        {
          transaction_id: 'commissioner-test',
          type: 'commissioner',
          status: 'complete',
          status_updated: Date.UTC(2026, 8, 19),
          leg: 3,
          roster_ids: [1],
        },
      ],
    },
  });
});

test('League archive routes render focused Sleeper states and content', async ({ page }) => {
  await page.goto('/league/standings');
  await expect(page.getByRole('heading', { name: '2026 Standings' })).toBeVisible();
  await expect(page.getByText('Results through completed Week 6.')).toBeVisible();

  await page.goto('/league/history');
  await expect(page.getByRole('heading', { name: 'League History' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lifetime leaderboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team records' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Player records' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Activity records' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Highest score in a loss:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lowest score in a win:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lowest team score:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Highest combined score:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Highest starter score:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Highest bench score:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Most points left on bench:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Largest share of team score:/ })).toBeVisible();
  await expect(page.locator('.league-record-tile__link-indicator')).toHaveCount(11);
  const maxValueMisalignment = async (groupName) => page.locator('.league-record-group')
    .filter({ has: page.getByRole('heading', { name: groupName }) })
    .locator('.league-record-tile')
    .evaluateAll((tiles) => {
      const rows = new Map();
      tiles.forEach((tile) => {
        const rowTop = Math.round(tile.getBoundingClientRect().top);
        const valueTop = Math.round(tile.querySelector(':scope > strong').getBoundingClientRect().top);
        rows.set(rowTop, [...(rows.get(rowTop) ?? []), valueTop]);
      });
      return Math.max(...[...rows.values()].map((tops) => Math.max(...tops) - Math.min(...tops)));
    });
  expect(await maxValueMisalignment('Team records')).toBeLessThanOrEqual(1);
  expect(await maxValueMisalignment('Player records')).toBeLessThanOrEqual(1);
  const highestScoreRecord = page.getByRole('button', { name: /^Highest score:/ });
  const recordTopBeforeHover = (await highestScoreRecord.boundingBox()).y;
  await highestScoreRecord.hover();
  expect((await highestScoreRecord.boundingBox()).y).toBe(recordTopBeforeHover);
  await highestScoreRecord.click();
  await expect(page).toHaveURL(/\/fantasy\/matchups\?week=2&team=1$/);

  await page.goto('/league/activity');
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByText('Waiver claim processed')).toBeVisible();
  const waiverEntry = page.locator('.league-activity-entry').filter({ hasText: 'Waiver claim processed' });
  await expect(waiverEntry.getByText('Bench Runner', { exact: true })).toBeVisible();
  await expect(waiverEntry.getByText('Your Team', { exact: true })).toHaveCount(2);
  await expect(waiverEntry.locator('.league-activity-team-avatar')).toHaveCount(0);
  await expect(waiverEntry.locator('.league-activity-player__team-logo')).toHaveCount(2);
  await expect(waiverEntry.getByRole('button', { name: 'Open Bench Runner statistics' })).toBeVisible();
  const offseasonEntry = page.locator('.league-activity-entry').filter({ hasText: 'Free-agent move' });
  await expect(offseasonEntry.getByText('Jun 15', { exact: true })).toBeVisible();
  await expect(offseasonEntry.getByText('Week 1', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Commissioner · 1 hidden' })).toBeVisible();
  await expect(page.getByText('Commissioner action')).toHaveCount(0);

  const largeTrade = page.locator('.league-activity-entry').filter({ hasText: 'Trade completed' });
  await expect(largeTrade).toHaveCount(1);
  await expect(largeTrade.locator('.league-activity-move')).toHaveCount(3);
  await expect(largeTrade.getByRole('button', { name: 'Show 2 more moves' })).toBeVisible();
  await largeTrade.getByRole('button', { name: 'Show 2 more moves' }).click();
  await expect(largeTrade.locator('.league-activity-move')).toHaveCount(5);
  await expect(largeTrade.getByRole('button', { name: 'Show fewer moves' })).toBeVisible();

  await page.getByRole('button', { name: 'Trades' }).click();
  await expect(page.getByText('Trade completed')).toBeVisible();
  await page.getByRole('button', { name: 'Waivers' }).click();
  await expect(page.getByText('Waiver claim processed')).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Commissioner · 1 hidden' }).click();
  await expect(page.getByText('Commissioner action')).toBeVisible();

  await waiverEntry.getByRole('button', { name: 'Open Bench Runner statistics' }).click();
  await expect(page).toHaveURL(/\/statistics\/player\/1006\/bench-runner/);
});

test('historical Standings shows postseason-only final placement for the full league size', async ({ page }) => {
  const archivedLeague = {
    ...league,
    season: '2025',
    status: 'complete',
    total_rosters: 3,
    settings: { ...league.settings, last_scored_leg: 17, playoff_week_start: 15, playoff_teams: 3 },
  };
  const archivedState = {
    ...persistedSleeperState(),
    league: archivedLeague,
    leagues: [archivedLeague],
    season: '2025',
    availableSeasons: ['2025'],
    leaguesBySeason: { 2025: [archivedLeague] },
  };
  await installTradeFixtures(page, {
    persistedSleeperState: archivedState,
    league: archivedLeague,
    leaguesBySeason: { 2025: [archivedLeague] },
    winnersBracket: [
      { r: 1, m: 1, t1: 2, t2: 3, w: 2, l: 3 },
      { r: 2, m: 2, t1: 1, t2_from: { w: 1 }, w: 1, l: 2, p: 1 },
    ],
    losersBracket: [],
  });

  await page.goto('/league/standings');
  await expect(page.getByRole('heading', { name: 'Final placement' })).toBeVisible();
  await expect(page.getByText('3-team postseason finish')).toBeVisible();
  const placements = page.getByTestId('league-final-placements');
  await expect(placements.locator('.league-final-placement')).toHaveCount(3);
  await expect(placements.getByText('1st', { exact: true })).toBeVisible();
  await expect(placements.getByText('2nd', { exact: true })).toBeVisible();
  await expect(placements.getByText('3rd', { exact: true })).toBeVisible();
  await expect(placements.getByText('Your Team', { exact: true })).toBeVisible();
  await expect(placements.getByText('Third Team', { exact: true })).toBeVisible();
});

test('historical Standings uses named divisions and identifies a verified Toilet Bowl', async ({ page }) => {
  const archivedLeague = {
    ...league,
    season: '2025',
    status: 'complete',
    settings: { ...league.settings, last_scored_leg: 15, playoff_week_start: 14, playoff_teams: 2 },
    metadata: { division_1: 'North Division', division_2: 'South Division' },
  };
  const archivedRosters = [
    { ...rosters[0], settings: { ...rosters[0].settings, division: 1 } },
    { ...rosters[1], settings: { ...rosters[1].settings, division: 1 } },
    { ...rosters[2], settings: { ...rosters[2].settings, division: 2 } },
    { roster_id: 4, owner_id: 'user-fourth', settings: { division: 2 } },
  ];
  const archivedUsers = [...leagueUsers, { user_id: 'user-fourth', display_name: 'Fourth Manager', metadata: { team_name: 'Fourth Team' } }];
  const archivedState = {
    ...persistedSleeperState(),
    league: archivedLeague,
    leagues: [archivedLeague],
    rosters: archivedRosters,
    leagueUsers: archivedUsers,
    season: '2025',
    availableSeasons: ['2025'],
    leaguesBySeason: { 2025: [archivedLeague] },
  };
  await installTradeFixtures(page, {
    persistedSleeperState: archivedState,
    league: archivedLeague,
    rosters: archivedRosters,
    leagueUsers: archivedUsers,
    leaguesBySeason: { 2025: [archivedLeague] },
    winnersBracket: [
      { r: 1, m: 1, t1: 3, t2: 4, w: 3, l: 4 },
      { r: 2, m: 2, t1: 1, t2_from: { w: 1 }, w: 1, l: 3, p: 1 },
      { r: 2, m: 3, t1_from: { l: 1 }, t2: 2, w: 2, l: 4, p: 5 },
    ],
    losersBracket: [
      { r: 1, m: 1, t1: 3, t2: 4, w: 3, l: 4 },
      { r: 2, m: 2, t1_from: { l: 1 }, t2: 2, w: 2, l: 4, p: 7 },
    ],
    matchupsForWeek: historicalMatchups,
  });

  await page.goto('/league/standings');
  await expect(page.getByRole('heading', { name: 'North Division' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'South Division' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Toilet Bowl' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Placement bracket' })).toHaveCount(0);
  await expect(page.getByText('Sleeper placement games')).toHaveCount(0);
  await expect(page.getByText('Loser advances · verified Sleeper bracket')).toBeVisible();
  await expect(page.getByText('Toilet Bowl winner')).toBeVisible();
  await expect(page.locator('.league-bracket-viewport')).toHaveCount(2);
  const championship = page.locator('.league-bracket-section').filter({ has: page.getByRole('heading', { name: 'Championship playoff' }) });
  await expect(championship.getByText('BYE')).toBeVisible();
  await expect(championship.getByText('Fourth Team')).toHaveCount(1);
  if (page.viewportSize().width <= 760) {
    const championshipViewport = championship.locator('.league-bracket-viewport');
    await expect(championship.locator('[data-scroll-cue="right"]')).toBeVisible();
    await championshipViewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect(championship.locator('[data-scroll-cue="left"]')).toBeVisible();
    await expect(championship.locator('[data-scroll-cue="right"]')).toHaveCount(0);
  }
  const toiletBowl = page.locator('.league-bracket-section').filter({ has: page.getByRole('heading', { name: 'Toilet Bowl' }) });
  await expect(toiletBowl.locator('.league-bracket-matchup.is-bye')).toHaveCount(1);
  await expect(toiletBowl.getByText('Fourth Team')).toHaveCount(2);
  expect(await toiletBowl.getByText('TBD').count()).toBe(0);
  const tableOverflow = await page.locator('.league-standings-table-scroll').evaluateAll((tables) => (
    tables.map((table) => table.scrollWidth - table.clientWidth)
  ));
  expect(tableOverflow.every((overflow) => overflow <= 1)).toBe(true);
});

test('seven-team Toilet Bowl keeps its bye and placement games in one Sleeper-shaped tree', async ({ page }) => {
  const archivedLeague = {
    ...league,
    season: '2025',
    status: 'complete',
    total_rosters: 14,
    settings: { ...league.settings, last_scored_leg: 17, playoff_week_start: 15, playoff_teams: 7, playoff_type: 0 },
    metadata: { ...league.metadata },
  };
  const teamNames = new Map([
    [8, ['SlingingMeat', 'Whiskey Tango Foxtrot']],
    [9, ['jma277', 'Purdy Much a Lock']],
    [10, ['Nerevar', 'Nerevar']],
    [11, ['DamnGoodFood', "Phillip River's 11 Kids"]],
    [12, ['blazebeard', 'Globo Gym Purple Cobras']],
    [13, ['Shret', 'Shrektastic']],
    [14, ['AlloK', 'No Punt Intended']],
  ]);
  const archivedRosters = Array.from({ length: 14 }, (_, index) => ({
    roster_id: index + 1,
    owner_id: `bowl-user-${index + 1}`,
    settings: { wins: 14 - index, losses: index, ties: 0, fpts: 1800 - index * 40, fpts_decimal: 0 },
  }));
  const archivedUsers = archivedRosters.map((roster) => {
    const [displayName, teamName] = teamNames.get(roster.roster_id) ?? [`Manager ${roster.roster_id}`, `Playoff Team ${roster.roster_id}`];
    return { user_id: roster.owner_id, display_name: displayName, metadata: { team_name: teamName } };
  });
  const archivedState = {
    ...persistedSleeperState(),
    league: archivedLeague,
    leagues: [archivedLeague],
    rosters: archivedRosters,
    leagueUsers: archivedUsers,
    season: '2025',
    availableSeasons: ['2025'],
    leaguesBySeason: { 2025: [archivedLeague] },
  };
  await installTradeFixtures(page, {
    persistedSleeperState: archivedState,
    league: archivedLeague,
    rosters: archivedRosters,
    leagueUsers: archivedUsers,
    leaguesBySeason: { 2025: [archivedLeague] },
    winnersBracket: [],
    losersBracket: [
      { r: 1, m: 1, t1: 11, t2: 10, w: 10, l: 11 },
      { r: 1, m: 2, t1: 13, t2: 8, w: 8, l: 13 },
      { r: 1, m: 3, t1: 12, t2: 9, w: 9, l: 12 },
      { r: 2, m: 4, t1: 14, t2_from: { l: 1 }, w: 14, l: 11 },
      { r: 2, m: 5, t1_from: { l: 2 }, t2_from: { l: 3 }, w: 12, l: 13 },
      { r: 2, m: 6, t1_from: { w: 2 }, t2_from: { w: 3 }, w: 8, l: 9 },
      { r: 3, m: 7, t1_from: { l: 4 }, t2_from: { l: 5 }, w: 11, l: 13, p: 1 },
      { r: 3, m: 8, t1_from: { w: 4 }, t2_from: { w: 5 }, w: 12, l: 14, p: 3 },
      { r: 3, m: 9, t1_from: { w: 1 }, t2_from: { l: 6 }, w: 10, l: 9, p: 5 },
    ],
    matchupsForWeek: toiletBowlMatchups,
  });

  await page.goto('/league/standings');
  const toiletBowl = page.locator('.league-bracket-section').filter({ has: page.getByRole('heading', { name: 'Toilet Bowl' }) });
  await expect(toiletBowl).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consolation Bracket' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Placement bracket' })).toHaveCount(0);
  await expect(toiletBowl.locator('[data-bracket-round="1"]')).toHaveCount(4);
  await expect(toiletBowl.locator('[data-bracket-round="2"]')).toHaveCount(3);
  await expect(toiletBowl.locator('[data-bracket-round="3"]')).toHaveCount(3);
  await expect(toiletBowl.locator('[data-bracket-lane="main"][data-bracket-round="1"]')).toHaveCount(4);
  await expect(toiletBowl.locator('[data-bracket-lane="main"][data-bracket-round="2"]')).toHaveCount(2);
  await expect(toiletBowl.locator('[data-bracket-lane="main"][data-bracket-round="3"]')).toHaveCount(1);
  await expect(toiletBowl.locator('[data-bracket-lane="placement"][data-bracket-round="2"]')).toHaveCount(1);
  await expect(toiletBowl.locator('[data-bracket-lane="placement"][data-bracket-round="3"]')).toHaveCount(2);
  await expect(toiletBowl.locator('[data-bracket-lane="placement"] .league-bracket-matchup.is-bye')).toHaveCount(0);
  await expect(toiletBowl.locator('.league-bracket-layout:not(.is-placement-lane) .league-bracket-connector')).toHaveCount(3);
  await expect(toiletBowl.locator('.league-bracket-layout.is-placement-lane .league-bracket-connector')).toHaveCount(1);
  await expect(toiletBowl.locator('.league-bracket-cross-lane')).toHaveCount(0);
  await expect(toiletBowl.locator('[data-target-matchup="4"]')).toHaveAttribute('data-source-matchups', 'bye:4:team1,1');
  await expect(toiletBowl.locator('[data-target-matchup="5"]')).toHaveAttribute('data-source-matchups', '2,3');
  await expect(toiletBowl.locator('[data-target-matchup="7"]')).toHaveAttribute('data-source-matchups', '4,5');
  await expect(toiletBowl.locator('[data-target-matchup="9"]')).toHaveAttribute('data-source-matchups', '6');
  await expect(toiletBowl.locator('[data-target-matchup="9"]')).toHaveClass(/is-single-offset/);
  await expect(toiletBowl.locator('[data-target-matchup="9"]')).toHaveClass(/is-source-above/);
  await expect(toiletBowl.locator('[data-bracket-matchup="bye:4:team1"]')).toContainText('No Punt Intended');
  await expect(toiletBowl.locator('[data-bracket-matchup="bye:4:team1"]')).toContainText('BYE');
  await expect(toiletBowl.locator('[data-bracket-matchup="1"]')).toContainText("Phillip River's 11 Kids");
  await expect(toiletBowl.locator('[data-bracket-matchup="4"]')).toContainText("Phillip River's 11 Kids");
  await expect(toiletBowl.locator('[data-bracket-matchup="2"]')).toContainText('Shrektastic');
  await expect(toiletBowl.locator('[data-bracket-matchup="5"]')).toContainText('Shrektastic');
  await expect(toiletBowl.getByText('12th place · Week 17')).toBeVisible();
  await expect(toiletBowl.getByText('10th place · Week 17')).toBeVisible();
  await expect(toiletBowl.getByText('1st place · Week 17')).toHaveCount(0);
  await expect(toiletBowl.getByText('3rd place · Week 17')).toHaveCount(0);
  await expect(toiletBowl.getByText('Toilet Bowl winner')).toBeVisible();
  await expect(toiletBowl.getByText('Shrektastic')).toHaveCount(4);

  const [byeBox, firstRoundBox, firstAdvanceBox, secondAdvanceBox, finalBox, mainLaneBox, placementLaneBox] = await Promise.all([
    toiletBowl.locator('[data-bracket-matchup="bye:4:team1"]').boundingBox(),
    toiletBowl.locator('[data-bracket-matchup="1"]').boundingBox(),
    toiletBowl.locator('[data-bracket-matchup="4"]').boundingBox(),
    toiletBowl.locator('[data-bracket-matchup="5"]').boundingBox(),
    toiletBowl.locator('[data-bracket-matchup="7"]').boundingBox(),
    toiletBowl.locator('.league-bracket-layout:not(.is-placement-lane)').boundingBox(),
    toiletBowl.locator('.league-bracket-layout.is-placement-lane').boundingBox(),
  ]);
  const centerY = (box) => box.y + box.height / 2;
  expect(firstAdvanceBox.x).toBeGreaterThan(byeBox.x);
  expect(centerY(firstAdvanceBox)).toBeGreaterThan(centerY(byeBox));
  expect(centerY(firstAdvanceBox)).toBeLessThan(centerY(firstRoundBox));
  expect(finalBox.x).toBeGreaterThan(firstAdvanceBox.x);
  expect(centerY(finalBox)).toBeGreaterThan(centerY(firstAdvanceBox));
  expect(centerY(finalBox)).toBeLessThan(centerY(secondAdvanceBox));
  expect(placementLaneBox.y).toBeGreaterThan(mainLaneBox.y + mainLaneBox.height + 24);
});

test('Draft Results defaults to Blueprint and team selection hands off to Pick List', async ({ page }) => {
  await page.goto('/draft/results');
  await expect(page.getByRole('heading', { name: 'Draft Blueprint' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Partner Team picks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Your Team picks' }).locator('[title="QB: 1"]')).toBeVisible();

  await page.getByRole('button', { name: 'Open Partner Team picks' }).click();
  await expect(page.getByRole('heading', { name: 'Pick List' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Partner Team' })).toBeVisible();
  await expect(page.getByText('Upgrade Runner')).toBeVisible();
  await expect(page.getByText('Pocket Commander')).toHaveCount(0);
});

test('archive and Blueprint layouts stay contained on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/league/standings', '/league/history', '/league/activity', '/draft/results']) {
    await page.goto(route);
    await page.locator('#root').waitFor({ state: 'visible' });
    const overflow = await page.evaluate(() => Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth,
    ));
    expect(overflow, `${route} has document-level horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test('Activity sticky filters occlude the scrolling feed through the page inset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/league/activity');

  const heading = page.getByRole('heading', { name: 'Activity' });
  const filters = page.locator('.league-activity-filters');
  await expect(heading).toBeVisible();
  await expect(filters).toBeVisible();
  const initialLayers = await page.evaluate(() => ({
    heading: Number.parseInt(getComputedStyle(document.querySelector('.league-activity-page .league-history-heading')).zIndex, 10),
    filters: Number.parseInt(getComputedStyle(document.querySelector('.league-activity-filters')).zIndex, 10),
  }));
  expect(initialLayers.heading).toBeGreaterThan(initialLayers.filters);
  await page.locator('.league-activity-feed').evaluate((element) => { element.style.minHeight = '1600px'; });
  await filters.evaluate((element) => {
    const scrollport = element.closest('.content-area');
    scrollport.scrollTop = element.offsetTop + 24;
  });
  await page.waitForTimeout(50);

  const coverage = await filters.evaluate((element) => {
    const rail = element.getBoundingClientRect();
    const scrollport = element.closest('.content-area').getBoundingClientRect();
    const mask = getComputedStyle(element, '::before');
    return {
      railTop: rail.top,
      scrollportTop: scrollport.top,
      maskTop: Number.parseFloat(mask.top),
      maskLeft: Number.parseFloat(mask.left),
      maskRight: Number.parseFloat(mask.right),
      maskBackground: mask.backgroundColor,
      railBackground: getComputedStyle(element).backgroundColor,
    };
  });

  expect(coverage.railTop + coverage.maskTop).toBeLessThanOrEqual(coverage.scrollportTop);
  expect(coverage.maskTop).toBeLessThan(0);
  expect(coverage.maskLeft).toBeLessThan(0);
  expect(coverage.maskRight).toBeLessThan(0);
  expect(coverage.maskBackground).toBe(coverage.railBackground);
});

function pick(pickNo, round, rosterId, playerId) {
  const player = players[playerId];
  const draftManager = leagueUsers.find((user) => rosters.find((roster) => (
    roster.roster_id === rosterId && roster.owner_id === user.user_id
  )));
  return {
    draft_id: 'draft-2026',
    pick_no: pickNo,
    round,
    roster_id: rosterId,
    picked_by: draftManager?.user_id,
    player_id: playerId,
    metadata: {
      player_id: playerId,
      first_name: player.first_name,
      last_name: player.last_name,
      position: player.position,
      team: player.team,
    },
  };
}

function historicalMatchups(week) {
  const scores = week < 14 ? [128, 117, 111, 103] : [132, 112, 106, 98];
  return [
    { roster_id: 1, matchup_id: 1, points: scores[0] },
    { roster_id: 2, matchup_id: 1, points: scores[1] },
    { roster_id: 3, matchup_id: 2, points: scores[2] },
    { roster_id: 4, matchup_id: 2, points: scores[3] },
  ];
}

function toiletBowlMatchups(week) {
  if (week === 15) return matchupRows([
    [11, 10, 93.8, 139.8], [13, 8, 58.16, 144.7], [12, 9, 133.12, 171.35],
    [1, 2, 131, 121], [3, 4, 119, 109], [5, 6, 117, 107], [7, 14, 115, 105],
  ]);
  if (week === 16) return matchupRows([
    [14, 11, 107.3, 86.44], [13, 12, 110.49, 159.53], [8, 9, 203.85, 136.9],
    [1, 2, 132, 122], [3, 4, 120, 110], [5, 6, 118, 108], [7, 10, 116, 106],
  ]);
  if (week === 17) return matchupRows([
    [11, 13, 139.7, 112.61], [14, 12, 79.4, 88.71], [10, 9, 197.31, 118.37],
    [1, 2, 133, 123], [3, 4, 121, 111], [5, 6, 119, 109], [7, 8, 117, 107],
  ]);
  return matchupRows(Array.from({ length: 7 }, (_, index) => [
    index * 2 + 1,
    index * 2 + 2,
    140 - index * 3 + week,
    130 - index * 3 + week,
  ]));
}

function matchupRows(pairs) {
  return pairs.flatMap(([team1, team2, team1Score, team2Score], index) => [
    { roster_id: team1, matchup_id: index + 1, points: team1Score },
    { roster_id: team2, matchup_id: index + 1, points: team2Score },
  ]);
}
