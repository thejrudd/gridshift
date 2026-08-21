// Dev-only generator for the Fantasy Live sandbox fixture.
//
// Builds a synthetic two-roster fantasy league out of a real, completed NFL
// week so Fantasy Live can be exercised outside the regular season. Every
// fixture player is taken from that week's actual BALLDONTLIE box scores,
// which guarantees each one has a real game and stat line to replay.
//
// The live feed joins stats on `normalizedName|teamAbbr`, so fixture players
// must carry the team they played for during the replayed week, not their
// current team. That is why rosters are derived from the week's data instead
// of from today's Sleeper player list.
//
// Usage: node scripts/generateLiveSandboxFixture.mjs [season] [week]
// Reads GRIDSHIFT_BDL_API_KEY from .env. Never run against production data.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SEASON = Number(process.argv[2] ?? 2025);
const WEEK = Number(process.argv[3] ?? 12);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/data/liveSandboxFixture.js');
const BDL = 'https://api.balldontlie.io/nfl/v1';

function readApiKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const match = env.match(/^GRIDSHIFT_BDL_API_KEY=(.+)$/m);
  if (!match) throw new Error('GRIDSHIFT_BDL_API_KEY is missing from .env');
  return match[1].trim();
}

const KEY = readApiKey();

async function bdl(pathname, params) {
  const url = new URL(BDL + pathname);
  Object.entries(params).forEach(([key, value]) => {
    (Array.isArray(value) ? value : [value]).forEach((entry) => url.searchParams.append(key, entry));
  });
  const response = await fetch(url, { headers: { Authorization: KEY } });
  if (!response.ok) throw new Error(`${pathname} -> ${response.status} ${await response.text()}`);
  return response.json();
}

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const POSITION_MAP = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', PK: 'K', K: 'K' };

// Mirrors the fixture league's own PPR scoring settings below. Used only to
// rank candidates when picking a roster, never to score the live view.
function fantasyPoints(row) {
  const n = (value) => Number(value ?? 0) || 0;
  return n(row.passing_yards) * 0.04
    + n(row.passing_touchdowns) * 4
    + n(row.passing_interceptions) * -2
    + n(row.rushing_yards) * 0.1
    + n(row.rushing_touchdowns) * 6
    + n(row.receiving_yards) * 0.1
    + n(row.receiving_touchdowns) * 6
    + n(row.receptions) * 1
    + n(row.fumbles_lost) * -2
    + n(row.field_goals_made) * 3
    + n(row.extra_points_made) * 1;
}

async function fetchAllStats(gameIds) {
  const rows = [];
  // The stats endpoint pages; pull every page so no box score is truncated.
  for (const gameId of gameIds) {
    let cursor = null;
    do {
      const params = { 'game_ids[]': String(gameId), per_page: '100' };
      if (cursor) params.cursor = String(cursor);
      const payload = await bdl('/stats', params);
      rows.push(...(payload.data ?? []));
      cursor = payload.meta?.next_cursor ?? null;
    } while (cursor);
  }
  return rows;
}

async function main() {
  console.log(`Building Fantasy Live sandbox fixture from ${SEASON} week ${WEEK}…`);

  const gamesPayload = await bdl('/games', {
    'seasons[]': String(SEASON),
    'weeks[]': String(WEEK),
    'season_type[]': '2',
    per_page: '100',
  });
  const games = gamesPayload.data ?? [];
  if (!games.length) throw new Error(`No games found for ${SEASON} week ${WEEK}`);
  console.log(`  ${games.length} games`);

  const statRows = await fetchAllStats(games.map((game) => game.id));
  console.log(`  ${statRows.length} stat rows`);

  const candidates = statRows
    .map((row) => {
      const position = POSITION_MAP[String(row.player?.position_abbreviation ?? '').toUpperCase()];
      if (!position) return null;
      const team = row.team?.abbreviation;
      const name = [row.player?.first_name, row.player?.last_name].filter(Boolean).join(' ');
      if (!team || !name) return null;
      return {
        name,
        firstName: row.player?.first_name ?? '',
        lastName: row.player?.last_name ?? '',
        team,
        position,
        bdlPlayerId: row.player?.id ?? null,
        gameId: String(row.game?.id ?? ''),
        points: Number(fantasyPoints(row).toFixed(2)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points);

  // ESPN athlete ids drive player headshots. Sleeper leaves espn_id null for
  // most startable skill players, and the app normally backfills them from a
  // roster cross-reference the sandbox has no access to, so resolve them here
  // against ESPN's own team rosters and bake them into the fixture.
  console.log('  Fetching ESPN rosters for headshot ids…');
  const espnIdByName = new Map();
  const espnTeams = await (await fetch(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
  )).json();
  const teamIds = (espnTeams?.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((entry) => entry?.team?.id)
    .filter(Boolean);
  for (const teamId of teamIds) {
    try {
      const roster = await (await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`,
      )).json();
      (roster?.athletes ?? []).forEach((group) => {
        (group?.items ?? []).forEach((athlete) => {
          const key = normalizeName(athlete?.displayName ?? athlete?.fullName);
          if (key && athlete?.id && !espnIdByName.has(key)) espnIdByName.set(key, String(athlete.id));
        });
      });
    } catch {
      // A missing roster only costs headshots for that team's players.
    }
  }
  console.log(`  ${espnIdByName.size} ESPN athletes indexed`);

  // Sleeper IDs keep player drill-in navigation working in the sandbox.
  console.log('  Fetching Sleeper player index…');
  const sleeperPlayers = await (await fetch('https://api.sleeper.app/v1/players/nfl')).json();
  const sleeperByName = new Map();
  Object.values(sleeperPlayers).forEach((player) => {
    const name = player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ');
    const key = `${normalizeName(name)}|${player.position}`;
    if (name && !sleeperByName.has(key)) sleeperByName.set(key, player);
  });

  // Spread starters across as many distinct games as possible so the feed,
  // pace chart, and play-by-play all have several games in flight.
  const usedGames = new Map();
  const usedNames = new Set();
  function take(position, count, { spread = true } = {}) {
    const picked = [];
    for (const candidate of candidates) {
      if (picked.length >= count) break;
      if (candidate.position !== position) continue;
      if (usedNames.has(candidate.name)) continue;
      if (spread && (usedGames.get(candidate.gameId) ?? 0) >= 3) continue;
      usedNames.add(candidate.name);
      usedGames.set(candidate.gameId, (usedGames.get(candidate.gameId) ?? 0) + 1);
      picked.push(candidate);
    }
    return picked;
  }

  // Two eight-slot lineups (QB/RB/RB/WR/WR/TE/FLEX/K) plus a short bench.
  const lineupPlan = [
    ['QB', 2], ['RB', 4], ['WR', 4], ['TE', 2], ['K', 2],
    ['RB', 2], // FLEX for each side
  ];
  const pools = {};
  lineupPlan.forEach(([position, count]) => {
    pools[position] = (pools[position] ?? []).concat(take(position, count));
  });
  const bench = [...take('WR', 4), ...take('RB', 2), ...take('QB', 2)];

  const sides = [0, 1].map((index) => {
    const starters = [
      pools.QB[index],
      pools.RB[index * 2],
      pools.RB[index * 2 + 1],
      pools.WR[index * 2],
      pools.WR[index * 2 + 1],
      pools.TE[index],
      pools.RB[4 + index],
      pools.K[index],
    ].filter(Boolean);
    const reserves = bench.filter((_, i) => i % 2 === index);
    return { starters, bench: reserves };
  });

  // Prior-week history, so the real projection pipeline has something to work
  // from. buildProjectionContext() returns null without weeklyStats, which
  // leaves every starter with no projection: the pace rays then collapse to
  // roughly "current plus a little" and drift on every tick, dragging the
  // chart's y-scale with them.
  const BDL_TO_GRIDSHIFT = {
    pass_yd: 'passing_yards', pass_td: 'passing_touchdowns', pass_int: 'passing_interceptions',
    pass_cmp: 'passing_completions', pass_att: 'passing_attempts', pass_sack: 'sacks',
    rush_att: 'rushing_attempts', rush_yd: 'rushing_yards', rush_td: 'rushing_touchdowns',
    rec: 'receptions', rec_yd: 'receiving_yards', rec_td: 'receiving_touchdowns',
    fum: 'fumbles', fum_lost: 'fumbles_lost', fum_rec: 'fumbles_recovered',
    kr_yd: 'kick_return_yards', pr_yd: 'punt_return_yards',
    kr_td: 'kick_return_touchdowns', pr_td: 'punt_return_touchdowns',
    fgm: 'field_goals_made', xpm: 'extra_points_made',
  };

  async function fetchPriorWeeks(bdlPlayerId) {
    const payload = await bdl('/stats', {
      'seasons[]': String(SEASON),
      'player_ids[]': String(bdlPlayerId),
      per_page: '100',
    });
    return (payload.data ?? [])
      .filter((row) => Number(row.game?.week) < WEEK && row.game?.postseason === false)
      .map((row) => {
        const entry = { week: Number(row.game.week) };
        Object.entries(BDL_TO_GRIDSHIFT).forEach(([key, source]) => {
          entry[key] = Number(row[source] ?? 0) || 0;
        });
        return entry;
      })
      .sort((a, b) => a.week - b.week);
  }

  const players = {};
  const weeklyStats = {};
  let syntheticId = 900000;
  function registerPlayer(entry) {
    const sleeper = sleeperByName.get(`${normalizeName(entry.name)}|${entry.position}`);
    const id = sleeper?.player_id ?? String(syntheticId++);
    const espnId = sleeper?.espn_id ?? espnIdByName.get(normalizeName(entry.name)) ?? null;
    players[id] = {
      espn_id: espnId ? String(espnId) : null,
      player_id: id,
      full_name: entry.name,
      first_name: entry.firstName,
      last_name: entry.lastName,
      position: entry.position,
      // The replayed week's team — required for the stat join to resolve.
      team: entry.team,
      fantasy_positions: [entry.position],
      status: 'Active',
      active: true,
      injury_status: null,
    };
    return id;
  }

  const registered = [];
  function registerAndTrack(entry) {
    const id = registerPlayer(entry);
    registered.push({ id, entry });
    return id;
  }

  const rosters = sides.map((side, index) => {
    const starterIds = side.starters.map(registerAndTrack);
    const benchIds = side.bench.map(registerAndTrack);
    return {
      roster_id: index + 1,
      owner_id: `sandbox-user-${index + 1}`,
      starters: starterIds,
      players: [...starterIds, ...benchIds],
      settings: { wins: 7 - index, losses: 4 + index, ties: 0, fpts: 1180 - index * 60, fpts_decimal: 0 },
    };
  });

  console.log(`  Fetching prior-week history for ${registered.length} players…`);
  for (const { id, entry } of registered) {
    if (!entry.bdlPlayerId) continue;
    try {
      weeklyStats[id] = await fetchPriorWeeks(entry.bdlPlayerId);
    } catch {
      // A player with no history simply falls back to no projection.
    }
  }

  // The week's official results. Live scoring is derived from the stat feed as
  // the replay runs, but once every starter has settled the view reconciles to
  // these numbers — so leaving them at zero collapses each side's score and
  // projection to nothing the moment the last game ends.
  const finalPointsById = new Map(registered.map(({ id, entry }) => [id, entry.points]));
  const matchups = rosters.map((roster) => {
    const startersPoints = roster.starters.map((id) => finalPointsById.get(id) ?? 0);
    return {
      roster_id: roster.roster_id,
      matchup_id: 1,
      starters: roster.starters,
      players: roster.players,
      starters_points: startersPoints,
      players_points: Object.fromEntries(
        roster.players.map((id) => [id, finalPointsById.get(id) ?? 0]),
      ),
      points: Number(startersPoints.reduce((sum, value) => sum + value, 0).toFixed(2)),
    };
  });

  const fixture = {
    season: String(SEASON),
    week: WEEK,
    generatedAt: new Date().toISOString(),
    league: {
      league_id: 'gridshift-live-sandbox',
      name: 'GridShift Live Sandbox',
      season: String(SEASON),
      season_type: 'regular',
      total_rosters: 2,
      status: 'in_season',
      sport: 'nfl',
      roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'BN', 'BN', 'BN', 'BN'],
      scoring_settings: {
        pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2,
        rush_yd: 0.1, rush_td: 6, rush_2pt: 2,
        rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2,
        fum_lost: -2, fgm: 3, xpm: 1,
      },
    },
    users: [
      { user_id: 'sandbox-user-1', display_name: 'Sandbox Home', metadata: { team_name: 'Sandbox Home' } },
      { user_id: 'sandbox-user-2', display_name: 'Sandbox Away', metadata: { team_name: 'Sandbox Away' } },
    ],
    rosters,
    matchups,
    players,
    weeklyStats,
  };

  const header = `// GENERATED FILE — do not edit by hand.\n`
    + `// Source: scripts/generateLiveSandboxFixture.mjs (${SEASON} week ${WEEK})\n`
    + `// Regenerate: node scripts/generateLiveSandboxFixture.mjs ${SEASON} ${WEEK}\n`
    + `// Dev-only fantasy league used by the Fantasy Live sandbox.\n\n`;
  fs.writeFileSync(OUT, `${header}export const LIVE_SANDBOX_FIXTURE = ${JSON.stringify(fixture, null, 2)};\n\nexport default LIVE_SANDBOX_FIXTURE;\n`);

  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  sides.forEach((side, index) => {
    console.log(`\n  Roster ${index + 1} starters:`);
    side.starters.forEach((entry) => {
      console.log(`    ${entry.position.padEnd(3)} ${entry.name.padEnd(24)} ${entry.team.padEnd(4)} ${entry.points} pts`);
    });
  });
  console.log(`\n  Distinct games covered by starters: ${usedGames.size}/${games.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
