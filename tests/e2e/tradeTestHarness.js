import {
  TEST_LEAGUE_ID,
  TEST_SEASON,
  drafts,
  ktcHtml,
  league,
  leagueUsers,
  leaguesBySeason,
  matchupsForWeek,
  persistedSleeperState,
  players,
  rosters,
  sleeperUser,
  tradedPicks,
  weeklyStatsForWeek,
} from '../fixtures/tradeFixtures.js';

export async function installTradeFixtures(page, overrides = {}) {
  const fixtureState = overrides.persistedSleeperState ?? persistedSleeperState();
  const fixturePlayers = overrides.players ?? players;
  const fixtureRosters = overrides.rosters ?? rosters;
  const fixtureLeagueUsers = overrides.leagueUsers ?? leagueUsers;
  const fixtureLeague = overrides.league ?? league;
  const fixtureLeaguesBySeason = overrides.leaguesBySeason ?? leaguesBySeason;
  const fixtureTradedPicks = overrides.tradedPicks ?? tradedPicks;
  const fixtureDrafts = overrides.drafts ?? drafts;
  const fixtureMatchupsForWeek = overrides.matchupsForWeek ?? matchupsForWeek;

  await page.addInitScript((state) => {
    window.localStorage.setItem('sleeper_state_v1', JSON.stringify(state));
    window.localStorage.setItem('nfl-predictor-dark-mode', 'false');
  }, fixtureState);

  await page.route('**/ktc-proxy/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: ktcHtml(),
    });
  });

  await page.route('https://api.sleeper.app/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/v1/players/nfl') return json(route, fixturePlayers);
    if (path === `/v1/user/${sleeperUser.username}`) return json(route, sleeperUser);
    if (path.startsWith(`/v1/user/${sleeperUser.user_id}/leagues/nfl/`)) {
      const season = path.split('/').at(-1);
      return json(route, fixtureLeaguesBySeason[season] ?? []);
    }
    if (path === `/v1/league/${TEST_LEAGUE_ID}`) return json(route, fixtureLeague);
    if (path === `/v1/league/${TEST_LEAGUE_ID}/rosters`) return json(route, fixtureRosters);
    if (path === `/v1/league/${TEST_LEAGUE_ID}/users`) return json(route, fixtureLeagueUsers);
    if (path === `/v1/league/${TEST_LEAGUE_ID}/traded_picks`) return json(route, fixtureTradedPicks);
    if (path === `/v1/league/${TEST_LEAGUE_ID}/drafts`) return json(route, fixtureDrafts);
    if (path.startsWith(`/v1/league/${TEST_LEAGUE_ID}/matchups/`)) {
      const week = Number(path.split('/').at(-1));
      return json(route, fixtureMatchupsForWeek(week));
    }
    if (path.startsWith(`/v1/stats/nfl/regular/${TEST_SEASON}/`)) {
      const week = Number(path.split('/').at(-1));
      return json(route, weeklyStatsForWeek(week));
    }

    return json(route, {});
  });

  await page.route('https://site.api.espn.com/**', async (route) => {
    const url = new URL(route.request().url());
    const teamId = url.pathname.match(/\/teams\/([^/]+)\/roster$/)?.[1]?.toUpperCase();
    if (teamId) return json(route, espnRosterFixture(teamId, fixturePlayers));
    return json(route, {});
  });
  await page.route('https://site.web.api.espn.com/**', async (route) => json(route, {}));
  await page.route('https://a.espncdn.com/**', async (route) => route.abort());
  await page.route('https://sleepercdn.com/**', async (route) => route.abort());
}

function espnRosterFixture(teamId, fixturePlayers = players) {
  const normalizedTeamId = normalizeEspnFixtureTeamId(teamId);
  const items = Object.values(fixturePlayers)
    .filter((player) => player.team === normalizedTeamId)
    .map((player) => ({
      id: player.espn_id,
      uid: `s:20~l:28~a:${player.espn_id}`,
      guid: player.espn_id,
      displayName: player.full_name,
      fullName: player.full_name,
      jersey: player.number,
      position: {
        abbreviation: player.position,
        displayName: positionName(player.position),
      },
      experience: { years: player.years_exp },
      status: { type: { description: 'Active' } },
    }));

  return { athletes: items.length ? [{ items }] : [] };
}

function normalizeEspnFixtureTeamId(teamId) {
  const key = String(teamId ?? '').toUpperCase();
  const aliases = {
    ARI: 'ARI',
    ATL: 'ATL',
    BAL: 'BAL',
    BUF: 'BUF',
    CAR: 'CAR',
    CHI: 'CHI',
    CIN: 'CIN',
    CLE: 'CLE',
    DAL: 'DAL',
    DEN: 'DEN',
    DET: 'DET',
    GB: 'GB',
    HOU: 'HOU',
    IND: 'IND',
    JAC: 'JAX',
    JAX: 'JAX',
    KC: 'KC',
    LV: 'LV',
    LAC: 'LAC',
    LAR: 'LAR',
    LA: 'LAR',
    MIA: 'MIA',
    MIN: 'MIN',
    NE: 'NE',
    NO: 'NO',
    NYG: 'NYG',
    NYJ: 'NYJ',
    PHI: 'PHI',
    PIT: 'PIT',
    SEA: 'SEA',
    SF: 'SF',
    TB: 'TB',
    TEN: 'TEN',
    WAS: 'WAS',
    WSH: 'WAS',
  };
  return aliases[key] ?? key;
}

function positionName(position) {
  switch (position) {
    case 'QB': return 'Quarterback';
    case 'RB': return 'Running Back';
    case 'WR': return 'Wide Receiver';
    case 'TE': return 'Tight End';
    default: return position;
  }
}

async function json(route, value) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(value),
  });
}
