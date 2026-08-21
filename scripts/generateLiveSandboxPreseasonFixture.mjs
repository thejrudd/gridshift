// Dev-only generator for the Fantasy Live preseason sandbox fixture.
//
// The regular-season fixture is built from a completed week's box scores, which
// guarantees every player has real production to replay. A preseason week has
// not been played yet, so this builds instead from who is *likely to see the
// field*: rookies and low-experience players, with each team's established
// starters deliberately excluded, since they barely play in August.
//
// Usage: node scripts/generateLiveSandboxPreseasonFixture.mjs [season] [week]
// Reads GRIDSHIFT_BDL_API_KEY from .env. Dev use only.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SEASON = Number(process.argv[2] ?? 2026);
const WEEK = Number(process.argv[3] ?? 3);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/data/liveSandboxPreseasonFixture.js');
const BDL = 'https://api.balldontlie.io/nfl/v1';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// Positions Fantasy Live scores, mapped from ESPN's abbreviations.
const POSITIONS = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', PK: 'K', K: 'K' };
// Established starters sit in preseason. Sleeper's search_rank tracks fantasy
// relevance, so the best-ranked player at a position is the one to skip.
const STARTER_RANK_CUTOFF = 200;

function readApiKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const match = env.match(/^GRIDSHIFT_BDL_API_KEY=(.+)$/m);
  if (!match) throw new Error('GRIDSHIFT_BDL_API_KEY is missing from .env');
  return match[1].trim();
}

const KEY = readApiKey();

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  console.log(`Building preseason sandbox fixture for ${SEASON} preseason week ${WEEK}…`);

  const gamesUrl = `${BDL}/games?seasons[]=${SEASON}&weeks[]=${WEEK}&season_type[]=1&per_page=100`;
  const gamesPayload = await (await fetch(gamesUrl, { headers: { Authorization: KEY } })).json();
  const games = gamesPayload.data ?? [];
  if (!games.length) throw new Error(`No preseason games found for ${SEASON} week ${WEEK}`);
  console.log(`  ${games.length} games`);

  const teamAbbrs = new Set();
  games.forEach((game) => {
    if (game.home_team?.abbreviation) teamAbbrs.add(game.home_team.abbreviation);
    if (game.visitor_team?.abbreviation) teamAbbrs.add(game.visitor_team.abbreviation);
  });

  console.log('  Fetching Sleeper player index…');
  const sleeperPlayers = await (await fetch('https://api.sleeper.app/v1/players/nfl')).json();
  const sleeperByName = new Map();
  Object.values(sleeperPlayers).forEach((player) => {
    const name = player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ');
    const key = `${normalizeName(name)}|${player.position}`;
    if (name && !sleeperByName.has(key)) sleeperByName.set(key, player);
  });

  console.log('  Fetching ESPN rosters…');
  const teamsPayload = await (await fetch(`${ESPN}/teams`)).json();
  const espnTeams = (teamsPayload?.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((entry) => entry.team)
    .filter((team) => team?.id && teamAbbrs.has(team.abbreviation));

  const candidates = [];
  for (const team of espnTeams) {
    const gameForTeam = games.find((game) => (
      game.home_team?.abbreviation === team.abbreviation
      || game.visitor_team?.abbreviation === team.abbreviation
    ));
    try {
      const roster = await (await fetch(`${ESPN}/teams/${team.id}/roster`)).json();
      (roster?.athletes ?? []).forEach((group) => {
        // Skip players who will not dress: injured reserve, suspended.
        if (['injuredReserveOrOut', 'suspended'].includes(group?.position)) return;
        (group?.items ?? []).forEach((athlete) => {
          const position = POSITIONS[String(athlete?.position?.abbreviation ?? '').toUpperCase()];
          if (!position || athlete?.status?.type !== 'active') return;
          const name = athlete.displayName ?? athlete.fullName;
          if (!name) return;
          const sleeper = sleeperByName.get(`${normalizeName(name)}|${position}`);
          candidates.push({
            name,
            firstName: athlete.firstName ?? name.split(' ')[0],
            lastName: athlete.lastName ?? name.split(' ').slice(1).join(' '),
            position,
            team: team.abbreviation,
            espnId: String(athlete.id),
            sleeperId: sleeper?.player_id ?? null,
            experience: Number(athlete?.experience?.years ?? 99),
            // Absent from Sleeper's rankings means fantasy-irrelevant, which in
            // preseason is exactly the profile that plays.
            searchRank: Number.isFinite(Number(sleeper?.search_rank))
              ? Number(sleeper.search_rank)
              : 99999,
            gameId: String(gameForTeam?.id ?? ''),
          });
        });
      });
    } catch {
      // A missing roster only costs that team's candidates.
    }
  }
  console.log(`  ${candidates.length} active skill players across ${espnTeams.length} teams`);

  // Drop each team's clear starters — they take a series at most, if that.
  const starters = new Set();
  ['QB', 'RB', 'WR', 'TE'].forEach((position) => {
    teamAbbrs.forEach((abbr) => {
      candidates
        .filter((entry) => entry.team === abbr && entry.position === position)
        .sort((a, b) => a.searchRank - b.searchRank)
        .slice(0, position === 'WR' ? 2 : 1)
        .filter((entry) => entry.searchRank < STARTER_RANK_CUTOFF)
        .forEach((entry) => starters.add(entry.espnId));
    });
  });

  const pool = candidates
    .filter((entry) => !starters.has(entry.espnId))
    // Rookies first, then second-year players; among equals prefer the ones
    // with some fantasy profile so the names are recognisable.
    .sort((a, b) => (a.experience - b.experience) || (a.searchRank - b.searchRank));

  const usedGames = new Map();
  const usedNames = new Set();
  function take(position, count) {
    const picked = [];
    for (const entry of pool) {
      if (picked.length >= count) break;
      if (entry.position !== position || usedNames.has(entry.name)) continue;
      if ((usedGames.get(entry.gameId) ?? 0) >= 2) continue;
      usedNames.add(entry.name);
      usedGames.set(entry.gameId, (usedGames.get(entry.gameId) ?? 0) + 1);
      picked.push(entry);
    }
    return picked;
  }

  const pools = {
    QB: take('QB', 2),
    RB: take('RB', 6),
    WR: take('WR', 4),
    TE: take('TE', 2),
    K: take('K', 2),
  };
  const bench = [...take('WR', 4), ...take('RB', 2), ...take('QB', 2)];

  const sides = [0, 1].map((index) => ({
    starters: [
      pools.QB[index], pools.RB[index * 2], pools.RB[index * 2 + 1],
      pools.WR[index * 2], pools.WR[index * 2 + 1], pools.TE[index],
      pools.RB[4 + index], pools.K[index],
    ].filter(Boolean),
    bench: bench.filter((_, i) => i % 2 === index),
  }));

  const players = {};
  let syntheticId = 950000;
  function registerPlayer(entry) {
    const id = entry.sleeperId ?? String(syntheticId++);
    players[id] = {
      player_id: id,
      espn_id: entry.espnId,
      full_name: entry.name,
      first_name: entry.firstName,
      last_name: entry.lastName,
      position: entry.position,
      team: entry.team,
      fantasy_positions: [entry.position],
      status: 'Active',
      active: true,
      injury_status: null,
    };
    return id;
  }

  const rosters = sides.map((side, index) => {
    const starterIds = side.starters.map(registerPlayer);
    const benchIds = side.bench.map(registerPlayer);
    return {
      roster_id: index + 1,
      owner_id: `sandbox-user-${index + 1}`,
      starters: starterIds,
      players: [...starterIds, ...benchIds],
      settings: { wins: 0, losses: 0, ties: 0, fpts: 0, fpts_decimal: 0 },
    };
  });

  const matchups = rosters.map((roster) => ({
    roster_id: roster.roster_id,
    matchup_id: 1,
    starters: roster.starters,
    players: roster.players,
    starters_points: roster.starters.map(() => 0),
    players_points: Object.fromEntries(roster.players.map((id) => [id, 0])),
    points: 0,
  }));

  const fixture = {
    season: String(SEASON),
    week: WEEK,
    seasonType: 'preseason',
    generatedAt: new Date().toISOString(),
    league: {
      league_id: 'gridshift-live-sandbox',
      name: 'GridShift Preseason Sandbox',
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
      { user_id: 'sandbox-user-1', display_name: 'Preseason Home', metadata: { team_name: 'Preseason Home' } },
      { user_id: 'sandbox-user-2', display_name: 'Preseason Away', metadata: { team_name: 'Preseason Away' } },
    ],
    rosters,
    matchups,
    players,
  };

  const header = `// GENERATED FILE — do not edit by hand.\n`
    + `// Source: scripts/generateLiveSandboxPreseasonFixture.mjs (${SEASON} preseason week ${WEEK})\n`
    + `// Regenerate: node scripts/generateLiveSandboxPreseasonFixture.mjs ${SEASON} ${WEEK}\n`
    + `// Dev-only roster of players likely to see preseason snaps.\n\n`;
  fs.writeFileSync(OUT, `${header}export const LIVE_SANDBOX_PRESEASON_FIXTURE = ${JSON.stringify(fixture, null, 2)};\n\nexport default LIVE_SANDBOX_PRESEASON_FIXTURE;\n`);

  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  sides.forEach((side, index) => {
    console.log(`\n  Roster ${index + 1} starters:`);
    side.starters.forEach((entry) => {
      const exp = entry.experience === 0 ? 'rookie' : `${entry.experience}y`;
      console.log(`    ${entry.position.padEnd(3)} ${entry.name.padEnd(24)} ${entry.team.padEnd(4)} ${exp}`);
    });
  });
  console.log(`\n  Distinct games covered by starters: ${usedGames.size}/${games.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
