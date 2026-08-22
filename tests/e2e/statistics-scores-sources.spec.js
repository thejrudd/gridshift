import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gridshift.statisticsNflPhase')) {
      localStorage.setItem('gridshift.statisticsNflPhase', 'regular');
    }
  });
});

test('Statistics Scores switches among local fixture, ESPN, and BALLDONTLIE sources', async ({ page }) => {
  let scoresApiRequests = 0;
  let espnProxyRequests = 0;
  let espnRequests = 0;

  await page.route('**/api/statistics/scores/**', async (route) => {
    scoresApiRequests += 1;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/espn-week')) {
      espnProxyRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'espn',
          season: Number(url.searchParams.get('season')),
          phase: url.searchParams.get('phase'),
          week: Number(url.searchParams.get('week')),
          scoreboard: { events: [], leagues: [{ calendar: [] }] },
          cache: { hit: false, fetchedAt: new Date().toISOString() },
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'balldontlie',
          providerLabel: 'BALLDONTLIE',
          apiKeyReady: false,
          available: false,
          overrideAllowed: true,
          overrideApplied: true,
          requestedSource: 'balldontlie',
          selectionReason: 'developer-override-missing-key',
          message: 'The BALLDONTLIE API developer source requires a server-side API key.',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        provider: 'balldontlie',
        error: 'Statistics Scores is not configured with a server-side BALLDONTLIE API key.',
      }),
    });
  });

  await page.route('https://site.api.espn.com/**', async (route) => {
    espnRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], leagues: [{ calendar: [] }] }),
    });
  });

  await page.goto('/statistics/scores');

  const sourceControl = page.getByRole('group', { name: 'Data source' });
  await expect(sourceControl).toBeVisible();
  await expect(sourceControl.getByRole('button', { name: 'Fixture' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Deterministic local data · no provider requests')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Live', exact: true })).toHaveCount(1);
  expect(scoresApiRequests).toBe(0);
  expect(espnRequests).toBe(0);

  await sourceControl.getByRole('button', { name: 'ESPN live' }).click();
  await expect.poll(() => espnRequests).toBeGreaterThan(0);
  await expect.poll(() => espnProxyRequests).toBeGreaterThan(0);
  await expect(sourceControl.getByRole('button', { name: 'ESPN live' })).toHaveAttribute('aria-pressed', 'true');
  expect(scoresApiRequests).toBe(espnProxyRequests);

  const espnCountBeforeBdl = espnRequests;
  await sourceControl.getByRole('button', { name: 'BALLDONTLIE API' }).click();
  await expect.poll(() => scoresApiRequests).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Statistics Scores is not configured with a server-side BALLDONTLIE API key.')).toBeVisible();
  await expect(sourceControl.getByRole('button', { name: 'BALLDONTLIE API' })).toHaveAttribute('aria-pressed', 'true');
  expect(espnRequests).toBe(espnCountBeforeBdl);
});

test('the developer fixture opens the fully populated comparison drilldown without provider requests', async ({ page }) => {
  let providerRequests = 0;

  await page.route('**/api/statistics/scores/**', async (route) => {
    providerRequests += 1;
    await route.fulfill({ status: 500, body: 'The local fixture must not request provider data.' });
  });
  await page.route('https://site.api.espn.com/**', async (route) => {
    providerRequests += 1;
    await route.fulfill({ status: 500, body: 'The local fixture must not request ESPN data.' });
  });

  await page.goto('/statistics/scores');

  const sourceControl = page.getByRole('group', { name: 'Data source' });
  await expect(sourceControl.getByRole('button', { name: 'Fixture' })).toHaveAttribute('aria-pressed', 'true');
  const scheduledScorebug = page.locator('.scores-scorebug[aria-disabled="true"]').first();
  await expect(scheduledScorebug).toBeVisible();
  await scheduledScorebug.click({ force: true });
  await expect(page.getByRole('button', { name: 'Back to Scores' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Lions at Vikings game details' }).click();

  await expect(page.getByRole('button', { name: 'Back to Scores' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Line Score' })).toBeVisible();
  await expect(page.getByText('J. Goff · 238 YDS, 2 TD')).toBeVisible();

  await page.getByRole('tab', { name: 'Team Stats' }).click();
  await expect(page.getByRole('heading', { name: 'Offense' })).toBeVisible();
  await expect(page.getByText('Total yards')).toBeVisible();

  await page.getByRole('tab', { name: 'Players' }).click();
  await expect(page.getByRole('heading', { name: 'Player Statistics' })).toBeVisible();
  await expect(page.locator('.scores-player-stats')).toContainText('Jared Goff');
  await page.getByRole('tab', { name: 'Rushing' }).click();
  await expect(page.locator('.scores-player-stats')).toContainText('Jahmyr Gibbs');

  await page.getByRole('tab', { name: 'Scoring' }).click();
  await expect(page.getByText('A. St. Brown 14-yard reception')).toBeVisible();

  await page.getByRole('tab', { name: 'Play-by-Play' }).click();
  await expect(page.getByRole('heading', { name: 'Play Feed' })).toBeVisible();
  await expect(page.locator('.scores-drive')).toHaveCount(5);
  const drives = page.locator('.scores-drive');
  await expect(drives.first()).toContainText('3rd');
  await expect(drives.last()).toContainText('1st');
  await drives.first().getByRole('button').click();
  const latestDrivePlays = drives.first().locator('.scores-drive-plays > div');
  await expect(latestDrivePlays.first()).toContainText('09:11');
  await expect(latestDrivePlays.last()).toContainText('10:02');

  expect(providerRequests).toBe(0);

  await page.getByRole('button', { name: 'Back to Scores' }).click();
  await expect(page.getByRole('tab', { name: 'W7 Now' })).toHaveAttribute('aria-selected', 'true');
  await expect(sourceControl.getByRole('button', { name: 'Fixture' })).toHaveAttribute('aria-pressed', 'true');
});

test('the local preseason fixture selects Preseason Week 1 on its first calendar day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-13T17:00:00.000Z') });
  await page.goto('/statistics/scores');
  await page.evaluate(() => {
    localStorage.setItem('gridshift.statisticsNflPhase', 'preseason');
  });
  await page.reload();

  const weekRail = page.getByRole('tablist', { name: 'NFL week' });
  await expect(weekRail.getByRole('tab', { name: 'P1 Now' })).toHaveAttribute('aria-selected', 'true');
  await expect(weekRail.getByRole('tab', { name: 'HOF Preseason' })).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('heading', { name: 'Thursday', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /This Week/i })).toHaveCount(0);
  await expect(page.locator('.scores-scorebug').first()).toHaveAttribute('aria-disabled', 'true');
});

test('a live ESPN week refreshes through the shared proxy after eight seconds', async ({ page }) => {
  const season = new Date().getFullYear();
  let espnProxyRequests = 0;
  let providerBaseTime = new Date(`${season}-08-13T23:30:00.000Z`);
  const calendar = [{
    value: '1',
    entries: [
      { label: 'Hall of Fame Weekend', alternateLabel: 'HOF' },
      { label: 'Preseason Week 1', alternateLabel: 'Pre Wk 1' },
      { label: 'Preseason Week 2', alternateLabel: 'Pre Wk 2' },
      { label: 'Preseason Week 3', alternateLabel: 'Pre Wk 3' },
    ],
  }];
  const makeLivePayload = (clock) => ({
    leagues: [{ calendar }],
    events: [{
      id: '401-live',
      date: `${season}-08-13T23:00:00.000Z`,
      status: {
        period: 1,
        displayClock: clock,
        type: {
          name: 'STATUS_IN_PROGRESS',
          state: 'in',
          completed: false,
          description: 'In Progress',
          shortDetail: `${clock} - 1st`,
        },
      },
      competitions: [{
        venue: { fullName: 'Paycor Stadium', address: { city: 'Cincinnati', state: 'OH', country: 'USA' } },
        broadcasts: [{ names: ['NFL Network'] }],
        competitors: [
          { homeAway: 'away', score: '3', possession: true, team: { abbreviation: 'DET', shortDisplayName: 'Lions' } },
          { homeAway: 'home', score: '0', team: { abbreviation: 'CIN', shortDisplayName: 'Bengals' } },
        ],
      }],
    }],
  });

  await page.clock.install({ time: new Date(`${season}-08-13T23:30:00.000Z`) });
  await page.route('https://site.api.espn.com/**', async (route) => {
    const url = new URL(route.request().url());
    const payload = url.searchParams.get('week') === '2'
      ? makeLivePayload('4:12')
      : { leagues: [{ calendar }], events: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.route('**/api/statistics/scores/espn-week**', async (route) => {
    espnProxyRequests += 1;
    const url = new URL(route.request().url());
    const clock = espnProxyRequests > 1 ? '4:04' : '4:12';
    const providerFetchedAt = new Date(
      providerBaseTime.getTime() + Math.max(0, espnProxyRequests - 1) * 8_000,
    ).toISOString();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        provider: 'espn',
        season,
        phase: url.searchParams.get('phase'),
        week: Number(url.searchParams.get('week')),
        scoreboard: makeLivePayload(clock),
        cache: { hit: false, fetchedAt: providerFetchedAt },
      }),
    });
  });

  await page.goto('/statistics/scores');
  await expect(page.getByRole('group', { name: 'Data source' })).toBeVisible();
  const loadedAt = await page.evaluate(() => Date.now() + 5_000);
  providerBaseTime = new Date(loadedAt);
  await page.clock.pauseAt(loadedAt);
  await page.getByRole('button', { name: 'Preseason', exact: true }).click();
  await page.getByRole('group', { name: 'Data source' })
    .getByRole('button', { name: 'ESPN live' })
    .click();

  await expect(page.locator('.scores-status.is-live')).toContainText('4:12');
  await expect.poll(() => espnProxyRequests).toBeGreaterThan(0);
  await page.clock.fastForward(1_000);
  await expect(page.locator('.scores-status.is-live')).toContainText('4:12');
  const espnScorebug = page.locator('.scores-scorebug').first();
  await expect(espnScorebug.locator('.scores-possession')).toHaveCount(1);
  await expect(espnScorebug.locator('.scores-possession')).toHaveAttribute('aria-label', 'Lions possession');
  await expect(espnScorebug).toHaveAttribute('aria-disabled', 'true');
  await expect(espnScorebug).toHaveAttribute('aria-label', 'Lions at Bengals');
  await espnScorebug.click({ force: true });
  await expect(page.getByRole('button', { name: 'Back to Scores' })).toHaveCount(0);
  const initialProxyRequests = espnProxyRequests;
  await page.clock.fastForward(7_000);
  await expect.poll(() => espnProxyRequests).toBeGreaterThan(initialProxyRequests);
  await expect(page.locator('.scores-status.is-live')).toContainText('4:04');
});

test('the canonical BALLDONTLIE snapshot keeps the scorecard clock and latest play together', async ({ page }) => {
  const season = new Date().getFullYear();
  const now = new Date(`${season}-08-13T23:30:00.000Z`);
  let providerAnchorTime = now.toISOString();
  let liveWeekRequests = 0;
  let serveUpdatedPlay = false;
  let drilldownOpened = false;
  let updatedProviderAnchorTime = null;
  await page.clock.install({ time: now });
  const liveGame = {
    id: 1393553,
    visitor_team: { abbreviation: 'TEN', full_name: 'Tennessee Titans' },
    home_team: { abbreviation: 'SF', full_name: 'San Francisco 49ers' },
    venue: "Levi's Stadium",
    week: 2,
    date: `${season}-08-13T23:00:00.000Z`,
    season,
    season_type: 1,
    status_state: 'in_progress',
    status: '4:12 - 1st',
    visitor_team_score: 3,
    home_team_score: 7,
  };
  const capabilities = { games: true, stats: true, teamStats: true, plays: true, liveScores: true };
  const cadence = { scoresLiveEnabled: true, scoresLiveMs: 8000, scoresIdleMs: 30000, maxBackoffMs: 120000 };

  await page.route('**/api/statistics/scores/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'balldontlie',
          apiKeyReady: true,
          available: true,
          capabilities,
          cadence,
        }),
      });
      return;
    }
    const isLiveWeek = url.pathname.endsWith('/live-week');
    if (isLiveWeek) liveWeekRequests += 1;
    const playUpdated = isLiveWeek && serveUpdatedPlay;
    const providerFetchedAt = isLiveWeek && drilldownOpened
      ? updatedProviderAnchorTime ?? providerAnchorTime
      : providerAnchorTime;
    const currentGame = isLiveWeek && drilldownOpened
      ? { ...liveGame, status: '3:42 - 1st', visitor_team_score: 10 }
      : liveGame;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        provider: 'balldontlie',
        season,
        phase: url.searchParams.get('phase') ?? 'preseason',
        week: Number(url.searchParams.get('week') ?? 2),
        games: [playUpdated && !drilldownOpened
          ? { ...currentGame, status: '3:52 - 1st', visitor_team_score: 10 }
          : currentGame],
        liveGameSnapshots: isLiveWeek ? [{
          gameId: String(liveGame.id),
          latestPlay: {
            id: playUpdated ? 'latest-penalty' : 'latest-completion',
            text: playUpdated ? 'PENALTY on SF, Defensive Holding' : 'Pass complete to TEN 18 for 12 yards',
            short_text: playUpdated ? 'PENALTY on SF, Defensive Holding' : 'Pass complete to TEN 18 for 12 yards',
            type_slug: playUpdated ? 'penalty' : 'pass-complete',
            period: 1,
            clock_display: playUpdated ? '03:52' : '04:12',
            start_down: 1,
            start_distance: 10,
            start_yard_line: 42,
            end_yard_line: playUpdated ? 42 : 30,
            team: { abbreviation: 'TEN' },
            scoring_play: false,
            ...(playUpdated ? { away_score: 10, home_score: 7 } : {}),
          },
          freshness: {
            providerFetchedAt,
            receivedAt: providerFetchedAt,
            ageMs: 0,
            stale: false,
            refreshAfterMs: 8_000,
          },
          cache: { hit: false, coalesced: false, stale: false, ageMs: 0, fetchedAt: providerFetchedAt },
        }] : [],
        capabilities,
        cadence,
        freshness: {
          providerFetchedAt,
          receivedAt: providerFetchedAt,
          ageMs: 0,
          stale: false,
          refreshAfterMs: 8000,
          nextRefreshAt: new Date(Date.parse(providerFetchedAt) + 8000).toISOString(),
        },
        cache: { hit: false, coalesced: false, stale: false, ageMs: 0, fetchedAt: providerFetchedAt },
      }),
    });
  });

  await page.goto('/statistics/scores');
  await expect(page.getByRole('group', { name: 'Data source' })).toBeVisible();
  const loadedAt = await page.evaluate(() => Date.now() + 5_000);
  providerAnchorTime = new Date(loadedAt).toISOString();
  await page.clock.pauseAt(loadedAt);
  await page.getByRole('group', { name: 'Data source' })
    .getByRole('button', { name: 'BALLDONTLIE API' })
    .click();
  await page.getByRole('button', { name: 'Preseason', exact: true }).click();

  const status = page.locator('.scores-status.is-live');
  await expect(status).toContainText('4:12');
  await expect(page.locator('.scores-latest-play')).toContainText('Latest play');
  await expect(page.locator('.scores-latest-play')).toContainText('Pass complete');
  await expect(page.locator('.scores-possession')).toHaveCount(1);
  await expect(page.locator('.scores-possession')).toHaveAttribute('aria-label', 'Tennessee Titans possession');
  await expect(page.locator('.scores-scorebug-situation')).toContainText('1st & 10');
  const liveWeekRequestsBeforePlay = liveWeekRequests;
  serveUpdatedPlay = true;
  await page.clock.fastForward(8_000);
  await expect.poll(() => liveWeekRequests).toBeGreaterThan(liveWeekRequestsBeforePlay);
  await expect(page.locator('.scores-latest-play')).toContainText('Penalty');
  await expect(status).toContainText('3:52');
  await expect(page.locator('.scores-scorebug-team').nth(0).locator('b')).toHaveText('10');
  await expect(page.locator('.scores-scorebug-team').nth(1).locator('b')).toHaveText('7');
  await page.clock.fastForward(5_000);
  await expect(status).toContainText('3:52');
  await expect(status).not.toContainText('Clock held');

  drilldownOpened = true;
  updatedProviderAnchorTime = await page.evaluate(() => new Date(Date.now() + 30_000).toISOString());
  await page.getByRole('button', {
    name: 'Open Tennessee Titans at San Francisco 49ers game details',
  }).click();
  await expect(page.locator('.scores-detail-status > strong')).toContainText('3:52');
  await expect(page.locator('.scores-detail-team.is-away > em')).toHaveText('10');
  await expect(page.locator('.scores-detail-team.is-home > em')).toHaveText('7');

  const liveWeekRequestsBeforeUpdate = liveWeekRequests;
  await page.clock.fastForward(30_000);
  await expect.poll(() => liveWeekRequests).toBeGreaterThan(liveWeekRequestsBeforeUpdate);
  await expect(page.locator('.scores-detail-status > strong')).toContainText('3:42');
  await expect(page.locator('.scores-detail-team.is-away > em')).toHaveText('10');
  await expect(page.locator('.scores-detail-team.is-home > em')).toHaveText('7');
});

test('forced local BALLDONTLIE loads preseason rows and refreshes the narrow live-week route', async ({ page }) => {
  const season = new Date().getFullYear();
  let espnRequests = 0;
  let espnProxyRequests = 0;
  let liveWeekRequests = 0;
  let requestedDetailGameId = null;
  let requestedDetailPhase = null;
  const scoresPhases = [];

  await page.route('**/api/statistics/scores/**', async (route) => {
    const url = new URL(route.request().url());
    const status = {
      provider: 'balldontlie',
      providerLabel: 'BALLDONTLIE',
      apiKeyReady: true,
      available: true,
      overrideAllowed: true,
      overrideApplied: true,
      requestedSource: 'balldontlie',
      selectionReason: 'developer-override',
      message: 'Statistics Scores is using the BALLDONTLIE API developer source.',
    };
    if (url.pathname.endsWith('/status')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...status }) });
      return;
    }
    if (url.pathname.endsWith('/espn-week')) {
      espnProxyRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'espn',
          season,
          phase: url.searchParams.get('phase'),
          week: Number(url.searchParams.get('week')),
          scoreboard: {
            events: [{
              id: 'espn-det-cin',
              date: `${season}-08-13T23:00:00.000Z`,
              status: {
                type: {
                  name: 'STATUS_FINAL',
                  state: 'post',
                  completed: true,
                  shortDetail: 'Final',
                },
              },
              competitions: [{
                broadcasts: [{ names: ['NFL Network'] }],
                competitors: [
                  { homeAway: 'away', score: '17', team: { abbreviation: 'DET', shortDisplayName: 'Lions' } },
                  { homeAway: 'home', score: '24', team: { abbreviation: 'CIN', shortDisplayName: 'Bengals' } },
                ],
              }],
            }],
            leagues: [{ calendar: [] }],
          },
          cache: { hit: false, fetchedAt: new Date().toISOString() },
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/live-week')) {
      liveWeekRequests += 1;
      const providerFetchedAt = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'balldontlie',
          season,
          phase: url.searchParams.get('phase'),
          week: Number(url.searchParams.get('week')),
          games: [{
            id: 1393548,
            visitor_team: { abbreviation: 'DET', full_name: 'Detroit Lions' },
            home_team: { abbreviation: 'CIN', full_name: 'Cincinnati Bengals' },
            venue: 'Paycor Stadium',
            week: 2,
            date: `${season}-08-13T23:00:00.000Z`,
            season,
            season_type: 1,
            status_state: 'completed',
            status: 'Final',
            visitor_team_score: 17,
            home_team_score: 24,
          }],
          capabilities: { games: true, stats: true, teamStats: true, plays: true, liveScores: true },
          cadence: { scoresLiveEnabled: true, scoresLiveMs: 1000, scoresIdleMs: 30000, maxBackoffMs: 120000 },
          freshness: {
            providerFetchedAt,
            receivedAt: providerFetchedAt,
            ageMs: 0,
            stale: false,
            refreshAfterMs: 30000,
            nextRefreshAt: new Date(Date.now() + 30000).toISOString(),
          },
          cache: { hit: false, coalesced: false, stale: false, ageMs: 0, fetchedAt: providerFetchedAt },
        }),
      });
      return;
    }
    scoresPhases.push(url.searchParams.get('phase'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ...status,
        season,
        phase: url.searchParams.get('phase') ?? 'regular',
        games: [{
          id: 1393547,
          visitor_team: { abbreviation: 'CAR', full_name: 'Carolina Panthers' },
          home_team: { abbreviation: 'ARI', full_name: 'Arizona Cardinals' },
          venue: 'Tom Benson Hall of Fame Stadium',
          week: 1,
          date: `${season}-08-07T00:00:00.000Z`,
          season,
          postseason: false,
          status: 'Final',
        }, {
          id: 1393548,
          visitor_team: { abbreviation: 'DET', full_name: 'Detroit Lions' },
          home_team: { abbreviation: 'CIN', full_name: 'Cincinnati Bengals' },
          venue: 'Paycor Stadium',
          week: 2,
          date: `${season}-08-13T23:00:00.000Z`,
          season,
          postseason: false,
          status: 'Final',
          visitor_team_score: 17,
          home_team_score: 24,
        }],
      }),
    });
  });
  await page.route('https://site.api.espn.com/**', async (route) => {
    espnRequests += 1;
    await route.fulfill({ status: 500, body: 'ESPN should not be requested in forced BALLDONTLIE mode.' });
  });
  await page.route('**/api/statistics/scores/game/*/detail*', async (route) => {
    const url = new URL(route.request().url());
    requestedDetailGameId = url.pathname.split('/').at(-2);
    requestedDetailPhase = url.searchParams.get('phase');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        provider: 'balldontlie',
        gameId: 1393548,
        phase: 'preseason',
        seasonType: 1,
        game: {
          id: 1393548,
          visitor_team: { abbreviation: 'DET', full_name: 'Detroit Lions' },
          home_team: { abbreviation: 'CIN', full_name: 'Cincinnati Bengals' },
          venue: 'Paycor Stadium',
          status: 'Final',
          visitor_team_score: 17,
          home_team_score: 24,
        },
        teamStats: [
          { team: { abbreviation: 'DET' }, total_yards: 80, net_passing_yards: 69, rushing_yards: 11 },
          { team: { abbreviation: 'CIN' }, total_yards: 94, net_passing_yards: 69, rushing_yards: 25 },
        ],
        playerStats: [
          {
            player: { first_name: 'Luke', last_name: 'Altmyer' }, team: { abbreviation: 'DET' },
            passing_completions: 6, passing_attempts: 10, passing_yards: 69, passing_interceptions: 1,
          },
          {
            player: { first_name: 'Joe', last_name: 'Flacco' }, team: { abbreviation: 'CIN' },
            passing_completions: 5, passing_attempts: 8, passing_yards: 51, passing_touchdowns: 1,
          },
        ],
        plays: [{
          id: 'p1', text: 'Touchdown pass.', type_text: 'Passing Touchdown', period: 1,
          clock_display: '9:35', team: { abbreviation: 'CIN' }, scoring_play: true,
          start_down: 2, start_distance: 4, start_yards_to_endzone: 4, away_score: 0, home_score: 6,
        },
        { id: 'q1', text: 'END QUARTER 1', period: 1, clock_display: '0:00' },
        { id: 'half', type_text: 'End of Half', period: 2, clock_display: '0:00' },
        { id: 'q3', text: 'END OF QUARTER 3', period: 3, clock_display: '0:00' },
        {
          id: 'warning', text: 'Two-Minute Warning', type_slug: 'two-minute-warning', period: 4,
          clock_display: '2:00', wallclock: `${season}-08-14T02:26:29.000Z`, team: { abbreviation: 'DET' },
        },
        {
          id: 'game-end', text: 'END GAME', type_slug: 'end-of-game', period: 4,
          clock_display: '0:00', wallclock: `${season}-08-14T02:26:29.000Z`,
        }],
        scoringPlays: [],
        coverage: { game: true, teamStats: true, playerStats: true, plays: true, scoring: true },
        meta: {},
      }),
    });
  });

  await page.goto('/statistics/scores');
  await page.getByRole('group', { name: 'Data source' })
    .getByRole('button', { name: 'BALLDONTLIE API' })
    .click();
  await page.getByRole('button', { name: 'Preseason', exact: true }).click();

  const weekRail = page.getByRole('tablist', { name: 'NFL week' });
  await expect(weekRail).toBeVisible();
  await expect(weekRail.getByRole('tab', { name: /Pre Wk 1/ })).toBeVisible();
  const completedBdlGame = page.getByRole('button', {
    name: 'Open Detroit Lions at Cincinnati Bengals game details',
  });
  await expect(completedBdlGame).toBeVisible();
  expect(scoresPhases).toContain('preseason');
  await expect.poll(() => liveWeekRequests).toBeGreaterThan(0);
  await expect(completedBdlGame).toContainText('NFL Network');
  await expect(completedBdlGame).not.toContainText('TV TBD');
  expect(espnProxyRequests).toBeGreaterThan(0);
  expect(espnRequests).toBe(0);

  await completedBdlGame.click();
  await expect(page.getByRole('button', { name: 'Back to Scores' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.scores-detail-hero > footer')).toContainText('NFL Network');
  await expect(page.locator('.scores-detail-hero > footer')).not.toContainText('TV TBD');
  await expect.poll(() => requestedDetailGameId).toBe('1393548');
  expect(requestedDetailPhase).toBe('preseason');
  await expect(page.getByText('L. Altmyer · 69 YDS')).toBeVisible();
  await page.getByRole('tab', { name: 'Team Stats' }).click();
  await expect(page.getByText('Total yards')).toBeVisible();
  await page.getByRole('tab', { name: 'Play-by-Play' }).click();
  await expect(page.getByText('END QUARTER 1')).toHaveCount(0);
  await expect(page.locator('.scores-drive-header')).not.toContainText('provider sequence');
  await expect(page.locator('.scores-drive-header').first()).toContainText('1 play');
  await expect(page.getByRole('status', { name: 'End of game' })).toContainText('End of game');
  await expect(page.getByRole('status', { name: 'End of game' })).toContainText('Game ended with 2:00 remaining');

  await page.getByRole('button', { name: 'Back to Scores' }).click();
  await expect(weekRail.getByRole('tab', { name: /Pre Wk 1/ })).toHaveAttribute('aria-selected', 'true');
  await expect(completedBdlGame).toBeVisible();
});

test('the developer source control remains contained on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/statistics/scores');

  const control = page.locator('.scores-developer-source');
  await expect(control).toBeVisible();
  const geometry = await control.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
});
