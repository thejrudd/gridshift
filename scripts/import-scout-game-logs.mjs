import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const root = resolve(__dirname, '..');
const outputPath = resolve(root, 'src/data/rookieGameLogs.generated.js');
const rookiesPath = resolve(root, 'src/data/rookies.js');

const CFBD_BASE_URL = 'https://api.collegefootballdata.com';
const CFBD_PLAYER_GAME_STATS_URL = 'https://api.collegefootballdata.com/games/players';
const DEFAULT_YEARS = [2023, 2024, 2025];
const DEFAULT_SEASON_TYPE = 'both';
const DEFAULT_CATEGORIES = [
  'passing',
  'rushing',
  'receiving',
  'defensive',
  'interceptions',
  'fumbles',
  'kicking',
  'punting',
  'puntReturns',
  'kickReturns',
];
const DEFAULT_TIERS = ['Elite', 'Starter'];

const STAT_MAP = {
  passing: { completions: 'completions', att: 'attempts', attempts: 'attempts', yds: 'passYards', yards: 'passYards', td: 'passTDs', tds: 'passTDs', int: 'interceptions', interceptions: 'interceptions' },
  rushing: { car: 'carries', carries: 'carries', yds: 'rushYards', yards: 'rushYards', td: 'rushTDs', tds: 'rushTDs' },
  receiving: { rec: 'receptions', receptions: 'receptions', targets: 'recTargets', tgt: 'recTargets', yds: 'recYards', yards: 'recYards', td: 'recTDs', tds: 'recTDs' },
  defensive: { total: 'totalTackles', tot: 'totalTackles', tackles: 'totalTackles', solo: 'soloTackles', tfl: 'tacklesForLoss', sack: 'sacks', sacks: 'sacks', int: 'defInterceptions', pd: 'passesDefended', pbu: 'passesDefended', ff: 'forcedFumbles', fr: 'fumbleRecoveries', td: 'defTDs', tds: 'defTDs' },
  interceptions: { int: 'defInterceptions', interceptions: 'defInterceptions', yds: 'intReturnYards', yards: 'intReturnYards', td: 'intReturnTDs', tds: 'intReturnTDs' },
  fumbles: { fum: 'fumbles', fumbles: 'fumbles', lost: 'fumblesLost', ff: 'forcedFumbles', fr: 'fumbleRecoveries', td: 'fumbleReturnTDs', tds: 'fumbleReturnTDs' },
  kicking: { fgm: 'fieldGoalsMade', fga: 'fieldGoalsAttempted', xpm: 'extraPointsMade', xpa: 'extraPointsAttempted', pts: 'kickingPoints', points: 'kickingPoints', long: 'longFieldGoal' },
  punting: { no: 'punts', num: 'punts', punt: 'punts', punts: 'punts', yds: 'puntYards', yards: 'puntYards', avg: 'puntAverage', in20: 'puntsInside20', tb: 'puntTouchbacks', long: 'longPunt' },
  puntreturns: { ret: 'puntReturns', returns: 'puntReturns', no: 'puntReturns', yds: 'puntReturnYards', yards: 'puntReturnYards', avg: 'puntReturnAverage', td: 'puntReturnTDs', tds: 'puntReturnTDs', long: 'longPuntReturn' },
  kickreturns: { ret: 'kickReturns', returns: 'kickReturns', no: 'kickReturns', yds: 'kickReturnYards', yards: 'kickReturnYards', avg: 'kickReturnAverage', td: 'kickReturnTDs', tds: 'kickReturnTDs', long: 'longKickReturn' },
};

function usage() {
  console.log(`Usage:
  CFBD_API_KEY=... node scripts/import-scout-game-logs.mjs [options]

Options:
  --year YEAR           Season year to import. Can be repeated or comma-separated. Default: ${DEFAULT_YEARS.join(',')}
  --season-type TYPE    regular, postseason, or both. Default: ${DEFAULT_SEASON_TYPE}
  --category NAME       CFBD category. Can be repeated. Default: ${DEFAULT_CATEGORIES.join(',')}
  --tier NAME           Prospect tier to include. Can be repeated or comma-separated. Default: ${DEFAULT_TIERS.join(',')}
  --week N              Limit to a single week (or comma-separated list). Skips week discovery.
  --team NAME           Limit to a single team (CFBD school name). Can be repeated.
  --conference ABBR     Limit to a conference (e.g. SEC, B1G). Can be repeated.
  --dry-run             Fetch and summarize without writing.
  --output PATH         Output path. Default: src/data/rookieGameLogs.generated.js
  --help                Show this help.

Note: CFBD requires at least one of week/team/conference on /games/players. When none are
provided, this script derives the week list from /games per year and iterates week-by-week.
`);
}

function parseList(value) {
  return String(value ?? '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    years: [], seasonType: DEFAULT_SEASON_TYPE, categories: [],
    tiers: [],
    weeks: [], teams: [], conferences: [],
    dryRun: false, output: outputPath,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--year' || arg === '--years') {
      args.years.push(...parseList(argv[++i]).map(Number));
    } else if (arg === '--season-type') {
      args.seasonType = argv[++i];
    } else if (arg === '--category' || arg === '--categories') {
      args.categories.push(...parseList(argv[++i]));
    } else if (arg === '--tier' || arg === '--tiers') {
      args.tiers.push(...parseList(argv[++i]));
    } else if (arg === '--week' || arg === '--weeks') {
      args.weeks.push(...parseList(argv[++i]).map(Number));
    } else if (arg === '--team' || arg === '--teams') {
      args.teams.push(...parseList(argv[++i]));
    } else if (arg === '--conference' || arg === '--conferences') {
      args.conferences.push(...parseList(argv[++i]));
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--output') {
      args.output = resolve(root, argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.years.length) args.years = DEFAULT_YEARS;
  if (!args.categories.length) args.categories = DEFAULT_CATEGORIES;
  if (!args.tiers.length) args.tiers = DEFAULT_TIERS;
  return args;
}

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCategory(category) {
  return String(category ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeTier(tier) {
  return String(tier ?? '').trim().toLowerCase();
}

function normalizeStatType(type) {
  return String(type ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function numericStat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function loadRookies() {
  const mod = await import(`${pathToFileURL(rookiesPath).href}?t=${Date.now()}`);
  return mod.ROOKIES_2026;
}

async function loadExistingLogs(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const mod = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
    return mod.ROOKIE_GAME_LOGS_2026 && typeof mod.ROOKIE_GAME_LOGS_2026 === 'object'
      ? mod.ROOKIE_GAME_LOGS_2026
      : {};
  } catch {
    return {};
  }
}

async function fetchCfbd(apiKey, path, params) {
  const url = new URL(path, CFBD_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`CFBD ${response.status} ${response.statusText}: ${(await response.text()).slice(0, 240)}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function teamResult(game, team) {
  if (!game || !team) return null;
  const home = game.homeTeam === team;
  const away = game.awayTeam === team;
  if (!home && !away) return null;
  const teamPoints = home ? game.homePoints : game.awayPoints;
  const oppPoints = home ? game.awayPoints : game.homePoints;
  if (teamPoints == null || oppPoints == null) return null;
  return `${teamPoints > oppPoints ? 'W' : teamPoints < oppPoints ? 'L' : 'T'} ${teamPoints}-${oppPoints}`;
}

function extractPlayerStatRows(gameRow, category) {
  const rows = [];
  const normalizedCategory = normalizeCategory(category);
  const teams = Array.isArray(gameRow.teams) ? gameRow.teams : [];
  for (const team of teams) {
    const categories = Array.isArray(team.categories) ? team.categories : [];
    const categoryNode = categories.find(item => normalizeCategory(item.name ?? item.category) === normalizedCategory);
    if (!categoryNode) continue;
    const types = Array.isArray(categoryNode.types) ? categoryNode.types : [];
    for (const type of types) {
      const statField = STAT_MAP[normalizedCategory]?.[normalizeStatType(type.name ?? type.statType)];
      if (!statField) continue;
      const athletes = Array.isArray(type.athletes) ? type.athletes : [];
      for (const athlete of athletes) {
        const statValue = numericStat(athlete.stat);
        if (statValue == null) continue;
        rows.push({
          player: athlete.name,
          team: team.school ?? team.team,
          statField,
          statValue,
          gameId: gameRow.id,
          year: gameRow.season,
          week: gameRow.week,
          seasonType: gameRow.seasonType,
        });
      }
    }
  }
  return rows;
}

function addStat(target, field, value) {
  target[field] = (target[field] ?? 0) + value;
}

function gameKey(game) {
  if (game?.gameId != null) return `${game.gameId}:${game?.team ?? ''}`;
  return `${game?.year ?? ''}:${game?.week ?? ''}:${game?.team ?? ''}:${game?.opponent ?? ''}`;
}

function sortPlayerData(playerData) {
  playerData.seasons.sort((a, b) => a.year - b.year || a.team.localeCompare(b.team));
  playerData.games.sort((a, b) => a.year - b.year || a.week - b.week || a.team.localeCompare(b.team));
  return playerData;
}

function resultOutcome(result) {
  if (typeof result !== 'string') return null;
  if (result.startsWith('W ')) return 'wins';
  if (result.startsWith('L ')) return 'losses';
  return null;
}

function rebuildSeasonsFromGames(games = []) {
  const seasons = new Map();

  for (const game of games) {
    const key = `${game.year ?? ''}:${game.team ?? ''}`;
    const season = seasons.get(key) ?? {
      year: game.year,
      team: game.team,
      record: { wins: 0, losses: 0 },
      stats: {},
    };
    const outcome = resultOutcome(game.result);
    if (outcome) season.record[outcome] += 1;
    for (const [field, value] of Object.entries(game.stats ?? {})) {
      if (value != null) addStat(season.stats, field, value);
    }
    seasons.set(key, season);
  }

  return [...seasons.values()];
}

function mergePlayerData(existingPlayerData, incomingPlayerData) {
  const games = new Map((existingPlayerData?.games ?? []).map((game) => [gameKey(game), game]));
  for (const game of incomingPlayerData?.games ?? []) games.set(gameKey(game), game);

  return sortPlayerData({
    games: [...games.values()],
    seasons: rebuildSeasonsFromGames([...games.values()]),
  });
}

function mergeLogs(existingLogs, incomingLogs) {
  const merged = { ...existingLogs };
  for (const [playerId, incomingPlayerData] of Object.entries(incomingLogs)) {
    merged[playerId] = mergePlayerData(existingLogs[playerId], incomingPlayerData);
  }
  return merged;
}

function serialize(data, meta) {
  return `// Generated by scripts/import-scout-game-logs.mjs.
// Source: CollegeFootballData.com ${CFBD_PLAYER_GAME_STATS_URL}
// Years: ${meta.years.join(', ')} | Season type: ${meta.seasonType} | Categories: ${meta.categories.join(', ')}
// Do not add API keys to this file.

export const ROOKIE_GAME_LOGS_2026 = ${JSON.stringify(data, null, 2)};
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.CFBD_API_KEY || process.env.COLLEGE_FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('Missing CFBD_API_KEY. Set it in the shell; do not commit it.');

  const requestedTiers = new Set(args.tiers.map(normalizeTier));
  const rookies = (await loadRookies()).filter((rookie) => requestedTiers.has(normalizeTier(rookie.tier)));
  const existingLogs = await loadExistingLogs(args.output);
  const rookieByName = new Map(rookies.map(rookie => [normalizeName(rookie.name), rookie]));
  const gamesByYear = new Map();
  const output = {};
  let matchedRows = 0;
  let unmatchedRows = 0;

  if (!rookies.length) {
    throw new Error(`No rookies matched requested tiers: ${args.tiers.join(', ')}`);
  }

  // Build the list of scope keys the player-stats endpoint will iterate over.
  // CFBD requires at least one of { week, team, conference }, so if the user didn't
  // supply one we derive the distinct (seasonType, week) pairs from /games per year.
  const explicitScope = args.weeks.length || args.teams.length || args.conferences.length;

  for (const year of args.years) {
    const games = await fetchCfbd(apiKey, '/games', { year, seasonType: args.seasonType });
    gamesByYear.set(year, new Map(games.map(game => [game.id, game])));

    let scopes;
    if (explicitScope) {
      scopes = [];
      const sType = args.seasonType === 'both' ? undefined : args.seasonType;
      if (args.weeks.length) {
        for (const week of args.weeks) scopes.push({ week, seasonType: sType });
      }
      for (const team of args.teams) scopes.push({ team, seasonType: sType });
      for (const conference of args.conferences) scopes.push({ conference, seasonType: sType });
    } else {
      const pairs = new Map();
      for (const game of games) {
        const week = game.week;
        const seasonType = game.seasonType ?? 'regular';
        if (week == null) continue;
        pairs.set(`${seasonType}:${week}`, { week, seasonType });
      }
      scopes = [...pairs.values()].sort(
        (a, b) => (a.seasonType === b.seasonType ? a.week - b.week : a.seasonType.localeCompare(b.seasonType)),
      );
    }

    console.log(`[${year}] fetching ${scopes.length} scope(s) × ${args.categories.length} categor${args.categories.length === 1 ? 'y' : 'ies'}`);

    for (const category of args.categories) {
      for (const scope of scopes) {
        const gameRows = await fetchCfbd(apiKey, '/games/players', { year, category, ...scope });
        for (const gameRow of gameRows) {
        for (const row of extractPlayerStatRows(gameRow, category)) {
          const rookie = rookieByName.get(normalizeName(row.player));
          if (!rookie) {
            unmatchedRows += 1;
            continue;
          }

          matchedRows += 1;
          const game = gamesByYear.get(year)?.get(row.gameId);
          const playerData = output[rookie.id] ?? { seasons: [], games: [] };
          const season = playerData.seasons.find(item => item.year === year && item.team === row.team)
            ?? { year, team: row.team, record: { wins: 0, losses: 0 }, stats: {}, _gameIds: [] };
          const gameLog = playerData.games.find(item => item.gameId === row.gameId && item.team === row.team)
            ?? {
              gameId: row.gameId,
              year,
              week: row.week ?? game?.week,
              seasonType: row.seasonType ?? game?.seasonType,
              team: row.team,
              opponent: game?.homeTeam === row.team ? game?.awayTeam : game?.homeTeam,
              result: teamResult(game, row.team),
              stats: {},
            };

          addStat(season.stats, row.statField, row.statValue);
          addStat(gameLog.stats, row.statField, row.statValue);
          if (!season._gameIds.includes(row.gameId)) {
            season._gameIds.push(row.gameId);
            if (gameLog.result?.startsWith('W ')) season.record.wins += 1;
            if (gameLog.result?.startsWith('L ')) season.record.losses += 1;
          }
          if (!playerData.seasons.includes(season)) playerData.seasons.push(season);
          if (!playerData.games.includes(gameLog)) playerData.games.push(gameLog);
          output[rookie.id] = playerData;
        }
      }
      }
    }
  }

  for (const playerData of Object.values(output)) {
    for (const season of playerData.seasons) delete season._gameIds;
    sortPlayerData(playerData);
  }

  const finalOutput = mergeLogs(existingLogs, output);

  if (!args.dryRun) writeFileSync(args.output, serialize(finalOutput, args));
  console.log(`Scout game-log import ${args.dryRun ? 'dry run' : 'complete'}`);
  console.log(`Matched stat rows: ${matchedRows}`);
  console.log(`Unmatched stat rows: ${unmatchedRows}`);
  console.log(`Players updated this run: ${Object.keys(output).length}`);
  console.log(`Players in merged output: ${Object.keys(finalOutput).length}`);
  console.log(`Included tiers: ${args.tiers.join(', ')}`);
  console.log(`Output path: ${args.output}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
