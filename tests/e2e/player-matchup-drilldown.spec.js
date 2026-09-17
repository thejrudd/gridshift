import { expect, test } from '@playwright/test';
import {
  TEST_LEAGUE_ID,
  TEST_SEASON,
  matchupsForWeek,
  players,
  weeklyStatsForWeek,
} from '../fixtures/tradeFixtures.js';
import { installTradeFixtures } from './tradeTestHarness.js';

const OPPONENT_BY_TEAM = {
  BUF: 'CLE', LAC: 'BAL', PHI: 'PIT',
  KC: 'DEN', MIA: 'NE', CHI: 'GB', GB: 'MIN', ATL: 'CAR', ARI: 'SEA',
  DET: 'TB', DAL: 'NYG', SF: 'LAR', CIN: 'JAX', BAL: 'HOU', NYJ: 'IND', MIN: 'NO', PIT: 'TEN',
};
const NFL_FIXTURE_PAIRS = [
  ['BUF', 'CLE'], ['LAC', 'BAL'], ['PHI', 'PIT'], ['KC', 'DEN'],
  ['MIA', 'NE'], ['CHI', 'GB'], ['ATL', 'CAR'], ['ARI', 'SEA'],
  ['DET', 'TB'], ['DAL', 'NYG'], ['SF', 'LAR'], ['CIN', 'JAX'],
  ['HOU', 'IND'], ['NYJ', 'MIN'], ['NO', 'TEN'], ['LV', 'WAS'],
];

const FUTURE_KICKOFF = '2099-10-22T17:00:00Z';

function scoreboardForWeek(week, { currentCompleted = false, currentKickoff = FUTURE_KICKOFF, completedOverride = null } = {}) {
  const completed = completedOverride ?? (week < 6 || currentCompleted);
  return { events: week >= 1 && week <= 6 ? NFL_FIXTURE_PAIRS.map(([away, home], index) => ({
    id: `${away.toLowerCase()}-${home.toLowerCase()}-week-${week}`,
    date: week < 6 ? `2026-09-${String(week + 1).padStart(2, '0')}T17:00:00Z` : currentKickoff,
    competitions: [{
      status: { type: { completed, state: completed ? 'post' : 'pre' } },
      competitors: [
        { homeAway: 'home', team: { abbreviation: home, id: String(index * 2 + 1) } },
        { homeAway: 'away', team: { abbreviation: away, id: String(index * 2 + 2) } },
      ],
    }],
  })) : [] };
}

function scoreboardForAppHydration(week, options = {}) {
  const scoreboard = scoreboardForWeek(week, options);
  return {
    ...scoreboard,
    events: scoreboard.events.map((event) => ({
      ...event,
      status: event.competitions?.[0]?.status ?? null,
    })),
  };
}

async function openPlayer(page, name = 'Pocket Commander', week = 6) {
  await page.goto(`/fantasy/matchups?week=${week}`);
  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();
  await expect(page.locator('.companion-matchup-player-metric--projection').first()).toBeVisible();
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Player matchup breakdown' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function captureDrilldown(page, testInfo, suffix = '') {
  const directory = globalThis.process?.env?.GRIDSHIFT_DRILLDOWN_SCREENSHOT_DIR;
  if (directory) await page.screenshot({ path: `${directory}/player-drilldown-${testInfo.project.name}${suffix}.png`, animations: 'disabled' });
}

test.beforeEach(async ({ page }, testInfo) => {
  await installTradeFixtures(page, {
    installedVersion: '8.9.5',
    players: {
      ...players,
      101: { ...players[101], injury_status: 'Questionable' },
    },
  });
  await page.addInitScript(({ dark, size }) => {
    window.localStorage.setItem('nfl-predictor-dark-mode', String(dark));
    window.localStorage.setItem('gridshift-display-size', size);
  }, { dark: testInfo.project.metadata.darkMode ?? false, size: testInfo.project.metadata.displaySize ?? 'comfortable' });

  await page.route('**/api/live/status*', async route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ live: { enabled: false, leagueAllowed: false }, session: { enabled: false } }),
  }));

  await page.route('**/api/fantasy/projections*', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });
  await page.route(`https://api.sleeper.app/v1/league/${TEST_LEAGUE_ID}/matchups/6`, async (route) => {
    const pregame = matchupsForWeek(6).map((matchup) => ({
      ...matchup,
      players_points: Object.fromEntries(Object.keys(matchup.players_points ?? {}).map((id) => [id, 0])),
      points: 0,
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pregame) });
  });
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/*`, async (route) => {
    const week = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    const stats = week >= 1 && week <= 5
      ? Object.fromEntries(Object.entries(weeklyStatsForWeek(week)).map(([playerId, values]) => {
          const team = players[playerId]?.team ?? null;
          return [playerId, { ...values, team, opp: OPPONENT_BY_TEAM[team] ?? null, home: week % 2 }];
        }))
      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stats) });
  });
  await page.route('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard*', async (route) => {
    const week = Number(new URL(route.request().url()).searchParams.get('week'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(scoreboardForWeek(week)),
    });
  });
  await page.route('https://archive-api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hourly: {
          time: ['2099-10-22T13:00'],
          temperature_2m: [2],
          precipitation: [4],
          wind_speed_10m: [31],
        },
      }),
    });
  });
});

test('bench comparison opens only the higher projected eligible bench player', async ({ page }, testInfo) => {
  test.skip(!['desktop', 'mobile', 'chromium-desktop', 'chromium-mobile'].includes(testInfo.project.name), 'Interaction covered at desktop and phone widths.');
  await page.route(`https://api.sleeper.app/v1/stats/nfl/regular/${TEST_SEASON}/*`, async route => {
    const week = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    const stats = week >= 1 && week <= 5 ? weeklyStatsForWeek(week) : {};
    if (stats[106]) stats[106] = { ...stats[106], rush_yd: 220, rush_td: 2 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.fromEntries(Object.entries(stats).map(([id, values]) => [id, { ...values, team: players[id]?.team, opp: OPPONENT_BY_TEAM[players[id]?.team], home: week % 2 }]))) });
  });
  const dialog = await openPlayer(page, 'Volume Runner');
  const suggestion = dialog.locator('.matchup-bench-option');
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText('Bench Runner');
  await captureDrilldown(page, testInfo, '-bench');
  await suggestion.getByRole('button', { name: 'View Bench Runner bench comparison' }).click();
  await expect(dialog.locator('.matchup-header-identity-line')).toContainText('Bench Runner');
  await expect(dialog.locator('.matchup-bench-option')).toHaveCount(0);
});

test('own kickoff switches to Actual and preserves the recorded pregame comparison', async ({ page }, testInfo) => {
  test.skip(!['desktop', 'mobile', 'chromium-desktop', 'chromium-mobile'].includes(testInfo.project.name), 'Interaction covered at desktop and phone widths.');
  let timelineDataRequests = 0;
  page.on('request', request => { if (/\/api\/live\/(?:games|game\/)/.test(request.url())) timelineDataRequests += 1; });
  await page.clock.install({ time: new Date(Date.parse(FUTURE_KICKOFF) - 60000) });
  const dialog = await openPlayer(page);
  await expect(dialog.locator('[data-performance-view="projected"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('gridshift-matchup-projection-baselines-v2:')))).toBe(true);
  await page.clock.fastForward(61000);
  await expect(dialog.locator('[data-performance-view="actual"]')).toBeVisible();
  await expect(dialog.getByText('The play timeline is unavailable for this league. Fantasy Live access is required.')).toBeVisible();
  expect(timelineDataRequests).toBe(0);
  await expect(dialog.getByRole('button', { name: 'Compare', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(dialog.locator('[data-performance-view="compare"]')).toBeVisible();
  await page.clock.fastForward(2000);
  await expect(dialog.locator('[data-performance-view="compare"]')).toBeVisible();
  await captureDrilldown(page, testInfo, '-compare');
});

test('final timeline retains signed estimates without changing the official zero score', async ({ page }, testInfo) => {
  test.skip(!['desktop', 'mobile', 'chromium-desktop', 'chromium-mobile'].includes(testInfo.project.name), 'Interaction covered at desktop and phone widths.');
  await page.route('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard*', async route => {
    const week = Number(new URL(route.request().url()).searchParams.get('week'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(scoreboardForWeek(week, { currentCompleted: true, currentKickoff: '2026-09-10T17:00:00Z' })) });
  });
  await page.route('**/api/live/status*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ live: { enabled: true, leagueAllowed: true, accessCodeRequired: false, capabilities: { plays: true } }, session: { enabled: true } }) }));
  await page.route('**/api/live/games?*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 42, season: 2026, week: 6, season_type: 2, home_team: { abbreviation: 'CLE' }, visitor_team: { abbreviation: 'BUF' } }] }) }));
  await page.route('**/api/live/game/42/plays*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [
    { id: 'gain', period: 2, clock_display: '8:10', type_slug: 'rush', team: { abbreviation: 'BUF' }, text: 'P.Commander up the middle to CLE 20 for 10 yards.', short_text: 'Pocket Commander 10 Yd Rush', stat_yardage: 10 },
    { id: 'loss', period: 1, clock_display: '2:00', type_slug: 'rush', team: { abbreviation: 'BUF' }, text: 'P.Commander up the middle to BUF 20 for -3 yards.', short_text: 'Pocket Commander -3 Yd Rush', stat_yardage: -3 },
  ] }) }));
  const dialog = await openPlayer(page);
  await expect(dialog.getByText('Final fantasy points', { exact: true })).toBeVisible();
  await expect(dialog.locator('.matchup-performance-primary')).toContainText('0.00');
  await expect(dialog.getByText('What earned the points', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('Estimated play contributions');
  await expect(dialog).toContainText('-0.3');
  await expect(dialog).toContainText('+1.0');
  await expect(dialog.getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0);
  await captureDrilldown(page, testInfo, '-final');
});

test('player drilldown adopts the fresh final status when its cached matchup schedule is stale', async ({ page }) => {
  test.skip(!['desktop', 'mobile', 'chromium-desktop', 'chromium-mobile'].includes(test.info().project.name), 'Interaction covered at desktop and phone widths.');
  await page.route('**/api/statistics/scores/espn-week*', async (route) => {
    const week = Number(new URL(route.request().url()).searchParams.get('week'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        phase: 'regular',
        scoreboard: scoreboardForAppHydration(week, { completedOverride: true, currentKickoff: '2026-09-10T17:00:00Z' }),
      }),
    });
  });
  await page.route('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard*', async (route) => {
    const week = Number(new URL(route.request().url()).searchParams.get('week'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(scoreboardForWeek(week, { completedOverride: false, currentKickoff: '2026-09-10T17:00:00Z' })),
    });
  });

  const dialog = await openPlayer(page, 'Target Magnet', 1);
  await expect(dialog.getByText('Final fantasy points', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-game-phase="final"]')).toBeVisible();
});

test('player drilldown presents a responsive pregame start-sit briefing', async ({ page }, testInfo) => {
  const dialog = await openPlayer(page);
  await expect(dialog.getByText('Projected fantasy points')).toBeVisible();
  await expect(dialog.locator('.matchup-range__legend')).toContainText('Expected range');
  await expect(dialog.getByText('Season average', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Season points rank', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Questionable', { exact: true })).toBeVisible();
  await expect(dialog.locator('.matchup-decision-evidence > div').last()).toContainText(/Wind|Weather|31/);
  await expect(dialog.getByText('Projection vs allowance', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('.matchup-recent-form__row').first()).toContainText('Wk 5');

  const geometry = await dialog.evaluate((element) => {
    const body = element.querySelector('.matchup-performance-body');
    const close = element.querySelector('[aria-label="Close player matchup breakdown"]');
    const bodyRect = body?.getBoundingClientRect();
    const heroRect = element.querySelector('.matchup-score-hero')?.getBoundingClientRect();
    const outlookRect = element.querySelector('.matchup-outlook')?.getBoundingClientRect();
    const rankRect = element.querySelector('.matchup-season-rank')?.getBoundingClientRect();
    const narrow = element.clientWidth < 1000;
    const closeRect = close?.getBoundingClientRect();
    return {
      dialogWithinViewport: element.getBoundingClientRect().width <= window.innerWidth,
      referenceOrder: narrow
        ? Boolean(heroRect && outlookRect && rankRect && heroRect.bottom <= outlookRect.top + 2 && outlookRect.bottom <= rankRect.top + 2)
        : Boolean(heroRect && rankRect && Math.abs(heroRect.top - rankRect.top) < 2 && heroRect.width > rankRect.width * 1.8),
      noHorizontalOverflow: Boolean(body && body.scrollWidth <= body.clientWidth + 1),
      bodyHasViewport: Boolean(bodyRect && bodyRect.height > 200),
      closeWidth: closeRect?.width ?? 0,
      closeHeight: closeRect?.height ?? 0,
    };
  });
  expect(geometry.dialogWithinViewport).toBe(true);
  expect(geometry.referenceOrder).toBe(true);
  expect(geometry.noHorizontalOverflow).toBe(true);
  expect(geometry.bodyHasViewport).toBe(true);
  expect(geometry.closeWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.closeHeight).toBeGreaterThanOrEqual(44);

  await captureDrilldown(page, testInfo);
  const details = dialog.locator('details').filter({ has: page.locator('summary', { hasText: 'Season performance' }) });
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await dialog.getByRole('button', { name: 'Close player matchup breakdown' }).click();
  await expect(dialog).toHaveCount(0);
});

test('player comparison aligns the game rail with the split hero without a center graphic', async ({ page }, testInfo) => {
  await page.goto('/fantasy/matchups?week=6');
  const dismissTour = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissTour.count()) await dismissTour.click();
  await expect(page.locator('.companion-matchup-player-metric--projection').first()).toBeVisible();

  const compareTrigger = page.getByRole('button', { name: /Open tale of the tape for/ }).first();
  await expect(compareTrigger).toBeVisible();
  await compareTrigger.click();

  const dialog = page.getByRole('dialog', { name: /Compare / });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const heroes = element.querySelector('.pmd-cmp-heroes');
    const games = element.querySelector('.pmd-cmp-games');
    const leftHero = heroes?.querySelector('.pmd-cmp-hero.is-left')?.getBoundingClientRect();
    const rightHero = heroes?.querySelector('.pmd-cmp-hero.is-right')?.getBoundingClientRect();
    const gameCells = games?.querySelectorAll('.pmd-cmp-game');
    const leftGame = gameCells?.[0]?.getBoundingClientRect();
    const rightGame = gameCells?.[1]?.getBoundingClientRect();
    const metricRow = element.querySelector('.pmd-cmp-row');
    const leftMetric = metricRow?.querySelector('.pmd-cmp-v.is-left');
    const rightMetric = metricRow?.querySelector('.pmd-cmp-v.is-right');
    const leadingValue = metricRow?.querySelector('.pmd-cmp-v.is-leading .pmd-cmp-n');
    const neutralValue = metricRow?.querySelector('.pmd-cmp-v:not(.is-leading) .pmd-cmp-n');
    const rankPlot = element.querySelector('.pmd-cmp-rank-plot');
    const rankRail = rankPlot?.querySelector('.pmd-rail');
    const rankPlayers = [...(rankPlot?.querySelectorAll('.pmd-cmp-rank-player') ?? [])];
    const rankAvatars = rankPlayers.map(player => player.querySelector('.pmd-cmp-rank-avatar')?.getBoundingClientRect());
    const rankNames = rankPlayers.map(player => player.querySelector('.pmd-cmp-rank-player__name')?.getBoundingClientRect());
    const rankLabels = rankPlayers.map(player => player.querySelector('.pmd-cmp-rank-player__rank')?.textContent.trim() ?? '');
    const rankLabelBounds = rankPlayers.map(player => player.querySelector('.pmd-cmp-rank-player__rank')?.getBoundingClientRect());
    const rankBoundaries = [...(rankPlot?.querySelectorAll('.pmd-cmp-rank-boundary') ?? [])];
    const rankBoundaryBounds = rankBoundaries.map(node => node.getBoundingClientRect());
    const rankMarkerCenters = rankPlayers.map(player => player.getBoundingClientRect().left);
    const rankAvatarRadii = rankPlayers.map(player => {
      const avatar = player.querySelector('.pmd-cmp-rank-avatar');
      return avatar ? getComputedStyle(avatar).borderRadius : '';
    });
    const rankAvatarCenterDeltas = rankPlayers.map((player, index) => {
      const avatar = rankAvatars[index];
      return avatar ? Math.abs(avatar.left + avatar.width / 2 - player.getBoundingClientRect().left) : Infinity;
    });
    const dialogRect = element.getBoundingClientRect();
    const rankNameBoundsInsideDialog = [...(rankPlot?.querySelectorAll('.pmd-cmp-rank-player__name') ?? [])]
      .map(node => node.getBoundingClientRect())
      .every(rect => rect.left >= dialogRect.left - 1 && rect.right <= dialogRect.right + 1);
    const rankLabelBoundsInsideDialog = [...(rankPlot?.querySelectorAll('.pmd-cmp-rank-player__rank') ?? [])]
      .map(node => node.getBoundingClientRect())
      .every(rect => rect.left >= dialogRect.left - 1 && rect.right <= dialogRect.right + 1);
    const signatureProbe = document.createElement('span');
    signatureProbe.style.color = 'var(--color-signature)';
    element.append(signatureProbe);
    const signatureColor = getComputedStyle(signatureProbe).color;
    signatureProbe.remove();
    const seasonFormEyebrow = [...element.querySelectorAll('.pmd-eyebrow')]
      .map(node => node.textContent.trim())
      .find(text => text.startsWith('Season form')) ?? '';
    return {
      heroColumns: heroes ? getComputedStyle(heroes).gridTemplateColumns.trim().split(/\s+/).length : 0,
      hasAxisColumn: Boolean(heroes?.querySelector('.pmd-cmp-axis')),
      hasCenterGraphic: Boolean(heroes?.querySelector('.pmd-cmp-heroes__versus')),
      heroLogoCount: heroes?.querySelectorAll('.pmd-cmp-hero-logo').length ?? 0,
      rankAvatarCount: element.querySelectorAll('.pmd-cmp-rank-avatar').length,
      rankPlayerCount: element.querySelectorAll('.pmd-cmp-rank-player').length,
      rankPlayerNames: [...element.querySelectorAll('.pmd-cmp-rank-player__name')].map(node => node.textContent.trim()),
      rankPlayerRanks: rankLabels,
      rankRowCount: element.querySelectorAll('.pmd-cmp-rank-row').length,
      rankBoundaryLabels: rankBoundaries.map(node => node.textContent.trim()),
      rankLabelsUnderNames: rankLabelBounds.every((rect, index) => rect && rankNames[index] && rect.top >= rankNames[index].bottom - 1),
      rankBoundariesAtRail: Boolean(rankRail && rankBoundaryBounds.length === 2 && rankBoundaryBounds.every(rect => Math.abs((rect.top + rect.height / 2) - (rankRail.getBoundingClientRect().top + rankRail.getBoundingClientRect().height / 2)) <= 4)),
      rankMarkersClearOfBoundaries: Boolean(rankBoundaryBounds.length === 2 && rankAvatars[0] && rankAvatars[1] && rankAvatars[0].left >= rankBoundaryBounds[0].right - 1 && rankAvatars[1].right <= rankBoundaryBounds[1].left + 1),
      rankMarkerCount: rankMarkerCenters.length,
      rankLineMarkerCount: rankPlot?.querySelectorAll('.pmd-rail__mark').length ?? 0,
      rankAvatarRadii,
      rankAvatarCenterDeltas,
      rankMarkersWithinRail: Boolean(rankRail && rankMarkerCenters.every(center => center >= rankRail.getBoundingClientRect().left - 1 && center <= rankRail.getBoundingClientRect().right + 1)),
      rankNameBoundsInsideDialog,
      rankLabelBoundsInsideDialog,
      leftEdgeDelta: leftHero && leftGame ? Math.abs(leftHero.left - leftGame.left) : Infinity,
      rightEdgeDelta: rightHero && rightGame ? Math.abs(rightHero.right - rightGame.right) : Infinity,
      leftWidthDelta: leftHero && leftGame ? Math.abs(leftHero.width - leftGame.width) : Infinity,
      rightWidthDelta: rightHero && rightGame ? Math.abs(rightHero.width - rightGame.width) : Infinity,
      metricLeaderCount: Number(Boolean(leftMetric?.classList.contains('is-leading'))) + Number(Boolean(rightMetric?.classList.contains('is-leading'))),
      leftBarWidth: parseFloat(getComputedStyle(leftMetric, '::after').width) || 0,
      rightBarWidth: parseFloat(getComputedStyle(rightMetric, '::after').width) || 0,
      leftBarColor: getComputedStyle(leftMetric, '::after').backgroundColor,
      rightBarColor: getComputedStyle(rightMetric, '::after').backgroundColor,
      comparisonSurfaceColor: getComputedStyle(element).backgroundColor,
      leadingValueColor: leadingValue ? getComputedStyle(leadingValue).color : '',
      neutralValueColor: neutralValue ? getComputedStyle(neutralValue).color : '',
      signatureColor,
      seasonFormEyebrow,
    };
  });

  expect(geometry.heroColumns).toBe(2);
  expect(geometry.hasAxisColumn).toBe(false);
  expect(geometry.hasCenterGraphic).toBe(false);
  expect(geometry.heroLogoCount).toBe(2);
  expect(geometry.rankAvatarCount).toBe(2);
  expect(geometry.rankPlayerCount).toBe(2);
  expect(geometry.rankPlayerNames).toHaveLength(2);
  expect(geometry.rankPlayerNames.every(Boolean)).toBe(true);
  expect(geometry.rankPlayerRanks).toHaveLength(2);
  expect(geometry.rankPlayerRanks.every(rank => /^QB\d+$/.test(rank))).toBe(true);
  expect(geometry.rankRowCount).toBe(0);
  expect(geometry.rankBoundaryLabels).toEqual(['Best', 'Worst']);
  expect(geometry.rankLabelsUnderNames).toBe(true);
  expect(geometry.rankBoundariesAtRail).toBe(true);
  expect(geometry.rankMarkersClearOfBoundaries).toBe(true);
  expect(geometry.rankMarkerCount).toBe(2);
  expect(geometry.rankLineMarkerCount).toBe(0);
  expect(geometry.rankAvatarRadii.every(radius => radius === '50%')).toBe(true);
  expect(geometry.rankAvatarCenterDeltas.every(delta => delta <= 1)).toBe(true);
  expect(geometry.rankMarkersWithinRail).toBe(true);
  expect(geometry.rankNameBoundsInsideDialog).toBe(true);
  expect(geometry.rankLabelBoundsInsideDialog).toBe(true);
  expect(geometry.leftEdgeDelta).toBeLessThanOrEqual(1);
  expect(geometry.rightEdgeDelta).toBeLessThanOrEqual(1);
  expect(geometry.leftWidthDelta).toBeLessThanOrEqual(1);
  expect(geometry.rightWidthDelta).toBeLessThanOrEqual(1);
  expect(geometry.metricLeaderCount).toBe(1);
  expect(geometry.leftBarWidth).toBeGreaterThan(0);
  expect(geometry.rightBarWidth).toBeGreaterThan(0);
  expect(geometry.leftBarColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(geometry.rightBarColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(geometry.leftBarColor).not.toBe(geometry.comparisonSurfaceColor);
  expect(geometry.rightBarColor).not.toBe(geometry.comparisonSurfaceColor);
  expect(geometry.leadingValueColor).toBe(geometry.signatureColor);
  expect(geometry.neutralValueColor).not.toBe(geometry.signatureColor);
  expect(geometry.seasonFormEyebrow).toContain('Season form · through');
  await captureDrilldown(page, testInfo, '-compare-layout');

  await dialog.getByRole('button', { name: 'View Pocket Commander statistics' }).click();
  await expect(page).toHaveURL(/\/statistics\/player\/1001\/pocket-commander/);
});
