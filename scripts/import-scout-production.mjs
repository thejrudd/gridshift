import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const root = resolve(__dirname, '..');
const outputPath = resolve(root, 'src/data/rookieProduction.generated.js');
const rookiesPath = resolve(root, 'src/data/rookies.js');

const CFBD_BASE_URL = 'https://api.collegefootballdata.com';
const CFBD_SOURCE_URL = 'https://api.collegefootballdata.com/stats/player/season';
const DEFAULT_YEAR = 2025;
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

const PROSPECT_NAME_ALIASES = {
  'bobby jamison travis': ['Quientrail Jamison-Travis', 'Quientrail Bobby Jamison-Travis'],
  'chip trayanum': ['DeaMonte Trayanum', 'DeaMonte Chip Trayanum', 'DeaMonte Larue Trayanum'],
  'dj rogers': ["D'Andre Rogers", 'D.J. Rogers'],
  'jam miller': ['Jamarion Miller'],
  'jaydn ott': ['Jadyn Ott'],
  'jordon simmons': ['Jordan Simmons'],
  'kc concepcion': ['Kevin Concepcion', 'K.C. Concepcion'],
  'lt overton': ['Lebbeus Overton', 'Lebbeus Thomas Overton', 'L.T. Overton'],
  'mike washington jr': ['Michael Washington Jr.', 'Michael Washington', 'Mike Washington'],
  'red murdock': ['Khalil Murdock', 'Khalil Elijah Murdock'],
  'erick hunter': ['Eric Hunter'],
  'reggie virgil': ['Reginald Virgil'],
  'shad banks jr': ['Shadrach Banks Jr.', 'Shadrach Banks', 'Shad Banks'],
};

const LIKELY_EXTERNAL_PRODUCTION_COLLEGES = new Set([
  'Culver-Stockton',
  'John Carroll',
  'Minnesota St. Moorhead',
  'Upper Iowa',
]);

const CATEGORY_STAT_MAP = {
  passing: {
    completions: 'completions',
    att: 'attempts',
    attempts: 'attempts',
    yds: 'passYards',
    yards: 'passYards',
    td: 'passTDs',
    tds: 'passTDs',
    int: 'interceptions',
    ints: 'interceptions',
    interceptions: 'interceptions',
  },
  rushing: {
    car: 'carries',
    carries: 'carries',
    rushes: 'carries',
    yds: 'rushYards',
    yards: 'rushYards',
    td: 'rushTDs',
    tds: 'rushTDs',
  },
  receiving: {
    targets: 'recTargets',
    tgt: 'recTargets',
    rec: 'receptions',
    receptions: 'receptions',
    catches: 'receptions',
    yds: 'recYards',
    yards: 'recYards',
    td: 'recTDs',
    tds: 'recTDs',
  },
  defensive: {
    ast: 'assistedTackles',
    assisted: 'assistedTackles',
    assistedtackles: 'assistedTackles',
    ff: 'forcedFumbles',
    forcedfumbles: 'forcedFumbles',
    fr: 'fumbleRecoveries',
    fumblerecoveries: 'fumbleRecoveries',
    fumblerecovered: 'fumbleRecoveries',
    int: 'defInterceptions',
    ints: 'defInterceptions',
    interceptions: 'defInterceptions',
    pd: 'passesDefended',
    pbu: 'passesDefended',
    passbreakups: 'passesDefended',
    passesdefended: 'passesDefended',
    qbhur: 'qbHurries',
    qbhurry: 'qbHurries',
    qbhurries: 'qbHurries',
    sack: 'sacks',
    sacks: 'sacks',
    solo: 'soloTackles',
    solotackles: 'soloTackles',
    tfl: 'tacklesForLoss',
    tacklesforloss: 'tacklesForLoss',
    total: 'totalTackles',
    tot: 'totalTackles',
    totaltackles: 'totalTackles',
    tackles: 'totalTackles',
    td: 'defTDs',
    tds: 'defTDs',
  },
  interceptions: {
    int: 'defInterceptions',
    ints: 'defInterceptions',
    interceptions: 'defInterceptions',
    td: 'intReturnTDs',
    tds: 'intReturnTDs',
    yards: 'intReturnYards',
    yds: 'intReturnYards',
  },
  fumbles: {
    ff: 'forcedFumbles',
    forcedfumbles: 'forcedFumbles',
    fr: 'fumbleRecoveries',
    fum: 'fumbles',
    fumbles: 'fumbles',
    lost: 'fumblesLost',
    recovered: 'fumbleRecoveries',
    recoveries: 'fumbleRecoveries',
    td: 'fumbleReturnTDs',
    tds: 'fumbleReturnTDs',
  },
  kicking: {
    fga: 'fieldGoalsAttempted',
    fgm: 'fieldGoalsMade',
    fgattempts: 'fieldGoalsAttempted',
    fgmakes: 'fieldGoalsMade',
    fieldgoalsattempted: 'fieldGoalsAttempted',
    fieldgoalsmade: 'fieldGoalsMade',
    long: 'longFieldGoal',
    points: 'kickingPoints',
    pts: 'kickingPoints',
    xpa: 'extraPointsAttempted',
    xpm: 'extraPointsMade',
  },
  punting: {
    avg: 'puntAverage',
    average: 'puntAverage',
    in20: 'puntsInside20',
    inside20: 'puntsInside20',
    long: 'longPunt',
    no: 'punts',
    num: 'punts',
    punt: 'punts',
    punts: 'punts',
    tb: 'puntTouchbacks',
    touchbacks: 'puntTouchbacks',
    yards: 'puntYards',
    yds: 'puntYards',
  },
  puntreturns: {
    avg: 'puntReturnAverage',
    average: 'puntReturnAverage',
    long: 'longPuntReturn',
    ret: 'puntReturns',
    returns: 'puntReturns',
    no: 'puntReturns',
    num: 'puntReturns',
    td: 'puntReturnTDs',
    tds: 'puntReturnTDs',
    yards: 'puntReturnYards',
    yds: 'puntReturnYards',
  },
  kickreturns: {
    avg: 'kickReturnAverage',
    average: 'kickReturnAverage',
    long: 'longKickReturn',
    ret: 'kickReturns',
    returns: 'kickReturns',
    no: 'kickReturns',
    num: 'kickReturns',
    td: 'kickReturnTDs',
    tds: 'kickReturnTDs',
    yards: 'kickReturnYards',
    yds: 'kickReturnYards',
  },
};

const POSITION_GROUP_STAT_FIELDS = {
  QB: new Set([
    'attempts',
    'carries',
    'completions',
    'fumbles',
    'fumblesLost',
    'interceptions',
    'passTDs',
    'passYards',
    'rushTDs',
    'rushYards',
  ]),
  RB: new Set([
    'carries',
    'fumbles',
    'fumblesLost',
    'receptions',
    'recTargets',
    'recTDs',
    'recYards',
    'rushTDs',
    'rushYards',
  ]),
  WR: new Set([
    'attempts',
    'carries',
    'completions',
    'fumbles',
    'fumblesLost',
    'interceptions',
    'kickReturnAverage',
    'kickReturns',
    'kickReturnTDs',
    'kickReturnYards',
    'longKickReturn',
    'longPuntReturn',
    'passTDs',
    'passYards',
    'puntReturnAverage',
    'puntReturns',
    'puntReturnTDs',
    'puntReturnYards',
    'receptions',
    'recTargets',
    'recTDs',
    'recYards',
    'rushTDs',
    'rushYards',
  ]),
  TE: new Set([
    'carries',
    'fumbles',
    'fumblesLost',
    'receptions',
    'recTargets',
    'recTDs',
    'recYards',
    'rushTDs',
    'rushYards',
  ]),
  DL: new Set([
    'defInterceptions',
    'defTDs',
    'forcedFumbles',
    'fumbleRecoveries',
    'fumbleReturnTDs',
    'intReturnTDs',
    'intReturnYards',
    'passesDefended',
    'qbHurries',
    'sacks',
    'soloTackles',
    'tacklesForLoss',
    'totalTackles',
  ]),
  LB: new Set([
    'defInterceptions',
    'defTDs',
    'forcedFumbles',
    'fumbleRecoveries',
    'fumbleReturnTDs',
    'intReturnTDs',
    'intReturnYards',
    'passesDefended',
    'qbHurries',
    'sacks',
    'soloTackles',
    'tacklesForLoss',
    'totalTackles',
  ]),
  DB: new Set([
    'defInterceptions',
    'defTDs',
    'forcedFumbles',
    'fumbleRecoveries',
    'fumbleReturnTDs',
    'intReturnTDs',
    'intReturnYards',
    'kickReturnAverage',
    'kickReturns',
    'kickReturnTDs',
    'kickReturnYards',
    'longKickReturn',
    'longPuntReturn',
    'passesDefended',
    'puntReturnAverage',
    'puntReturns',
    'puntReturnTDs',
    'puntReturnYards',
    'qbHurries',
    'sacks',
    'soloTackles',
    'tacklesForLoss',
    'totalTackles',
  ]),
  ST: new Set([
    'extraPointsAttempted',
    'extraPointsMade',
    'fieldGoalsAttempted',
    'fieldGoalsMade',
    'kickReturnAverage',
    'kickReturns',
    'kickReturnTDs',
    'kickReturnYards',
    'kickingPoints',
    'longFieldGoal',
    'longKickReturn',
    'longPunt',
    'longPuntReturn',
    'puntAverage',
    'puntReturnAverage',
    'puntReturns',
    'puntReturnTDs',
    'puntReturnYards',
    'punts',
    'puntsInside20',
    'puntTouchbacks',
    'puntYards',
  ]),
};

function usage() {
  console.log(`Usage:
  CFBD_API_KEY=... node scripts/import-scout-production.mjs [options]

Options:
  --year YEAR           Season year to import. Can be repeated or comma-separated. Default: ${DEFAULT_YEAR}
  --season-type TYPE    regular, postseason, or both. Default: ${DEFAULT_SEASON_TYPE}
  --category NAME       CFBD category. Can be repeated. Default: ${DEFAULT_CATEGORIES.join(',')}
  --dry-run             Fetch and summarize without writing the generated file.
  --output PATH         Output file path. Default: src/data/rookieProduction.generated.js
  --allow-stat-loss     Allow overwriting the generated file even if existing generated fields would be removed.
  --help                Show this help.
`);
}

function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    years: [],
    seasonType: DEFAULT_SEASON_TYPE,
    categories: [],
    dryRun: false,
    allowStatLoss: false,
    output: outputPath,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--year' || arg === '--years') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a year`);
      args.years.push(...parseList(value).map(Number));
      i += 1;
    } else if (arg === '--season-type') {
      const value = argv[i + 1];
      if (!value) throw new Error('--season-type requires regular, postseason, or both');
      args.seasonType = value;
      i += 1;
    } else if (arg === '--category' || arg === '--categories') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a category`);
      args.categories.push(...parseList(value));
      i += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--allow-stat-loss') {
      args.allowStatLoss = true;
    } else if (arg === '--output') {
      const value = argv[i + 1];
      if (!value) throw new Error('--output requires a file path');
      args.output = resolve(root, value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.years.length) args.years = [DEFAULT_YEAR];
  if (!args.categories.length) args.categories = DEFAULT_CATEGORIES;
  if (args.years.some((year) => !Number.isInteger(year) || year < 1900)) {
    throw new Error(`Invalid --year value. Received: ${args.years.join(',')}`);
  }
  if (!['regular', 'postseason', 'both'].includes(args.seasonType)) {
    throw new Error('--season-type must be regular, postseason, or both');
  }
  for (const category of args.categories) {
    if (!CATEGORY_STAT_MAP[normalizeCategory(category)]) {
      throw new Error(`Unsupported category "${category}". Add it to CATEGORY_STAT_MAP before importing.`);
    }
  }

  return args;
}

export function normalizeProspectName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeProspectNameWithoutSuffix(name) {
  return normalizeProspectName(name)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactProspectName(name) {
  return normalizeProspectNameWithoutSuffix(name).replace(/\s+/g, '');
}

function normalizeTeamName(team) {
  return String(team ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\b/g, 'state')
    .replace(/\bmiami fl\b/g, 'miami')
    .replace(/\bmiami \(fl\)\b/g, 'miami')
    .replace(/\btexas a m\b/g, 'texas am')
    .replace(/\but san antonio\b/g, 'utsa')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function productionKey(name, team) {
  return `${normalizeProspectName(name)}|${normalizeTeamName(team)}`;
}

function nameOnlyKey(name) {
  return normalizeProspectName(name);
}

function nameNoSuffixKey(name) {
  return normalizeProspectNameWithoutSuffix(name);
}

function nameCompactKey(name) {
  return compactProspectName(name);
}

function numericStat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeStatType(statType) {
  return String(statType ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeCategory(category) {
  return String(category ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function loadRookies() {
  const moduleUrl = `${pathToFileURL(rookiesPath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  return mod.ROOKIES_2026;
}

async function loadExistingProduction(output) {
  if (!existsSync(output)) return null;
  const moduleUrl = `${pathToFileURL(output).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  return mod.ROOKIE_PRODUCTION_2026 ?? null;
}

async function fetchPlayerSeasonStats({ apiKey, year, seasonType, category }) {
  const url = new URL('/stats/player/season', CFBD_BASE_URL);
  url.searchParams.set('year', String(year));
  url.searchParams.set('seasonType', seasonType);
  url.searchParams.set('category', category);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CFBD ${response.status} ${response.statusText} for ${category} ${year}: ${body.slice(0, 240)}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`CFBD returned non-array response for ${category} ${year}`);
  return rows;
}

function addRow(productionByKey, row) {
  const category = normalizeCategory(row.category);
  const statField = CATEGORY_STAT_MAP[category]?.[normalizeStatType(row.statType)];
  const statValue = numericStat(row.stat);
  const player = String(row.player ?? '').trim();
  const team = String(row.team ?? '').trim();

  if (!statField || statValue == null || !player) return;

  const key = productionKey(player, team);
  const existing = productionByKey.get(key) ?? {
    player,
    normalizedName: nameOnlyKey(player),
    normalizedNameNoSuffix: nameNoSuffixKey(player),
    compactName: nameCompactKey(player),
    team,
    normalizedTeam: normalizeTeamName(team),
    seasons: new Set(),
    playerIds: new Set(),
    collegeStats: {},
  };

  existing.collegeStats[statField] = (existing.collegeStats[statField] ?? 0) + statValue;
  if (row.season != null) existing.seasons.add(Number(row.season));
  if (row.playerId != null) existing.playerIds.add(String(row.playerId));
  productionByKey.set(key, existing);
}

function buildRookieIndexes(rookies) {
  const trackedRookies = rookies.filter((rookie) => rookie.positionGroup);
  const byNameTeam = new Map();
  const byName = new Map();
  const byNameNoSuffix = new Map();
  const byCompactName = new Map();

  function add(map, key, rookie) {
    if (!key) return;
    const matches = map.get(key) ?? [];
    if (!matches.some((match) => match.id === rookie.id)) matches.push(rookie);
    map.set(key, matches);
  }

  for (const rookie of trackedRookies) {
    add(byNameTeam, productionKey(rookie.name, rookie.college), rookie);
    add(byName, nameOnlyKey(rookie.name), rookie);
    add(byNameNoSuffix, nameNoSuffixKey(rookie.name), rookie);
    add(byCompactName, nameCompactKey(rookie.name), rookie);

    for (const alias of PROSPECT_NAME_ALIASES[nameOnlyKey(rookie.name)] ?? []) {
      add(byNameTeam, productionKey(alias, rookie.college), rookie);
      add(byName, nameOnlyKey(alias), rookie);
      add(byNameNoSuffix, nameNoSuffixKey(alias), rookie);
      add(byCompactName, nameCompactKey(alias), rookie);
    }
  }

  return { trackedRookies, byNameTeam, byName, byNameNoSuffix, byCompactName };
}

function onlyUniqueMatch(matches) {
  return matches.length === 1 ? matches[0] : null;
}

function findRookieMatch(entry, indexes) {
  const exact = indexes.byNameTeam.get(`${entry.normalizedName}|${entry.normalizedTeam}`) ?? [];
  if (exact.length === 1) return exact[0];

  const nameMatches = indexes.byName.get(entry.normalizedName) ?? [];
  const nameMatch = onlyUniqueMatch(nameMatches);
  if (nameMatch) return nameMatch;

  const noSuffixMatches = indexes.byNameNoSuffix.get(entry.normalizedNameNoSuffix) ?? [];
  const noSuffixMatch = onlyUniqueMatch(noSuffixMatches);
  if (noSuffixMatch) return noSuffixMatch;

  const compactMatches = indexes.byCompactName.get(entry.compactName) ?? [];
  const compactMatch = onlyUniqueMatch(compactMatches);
  if (compactMatch) return compactMatch;

  return null;
}

function sanitizeCollegeStatsForRookie(rookie, collegeStats) {
  const allowed = POSITION_GROUP_STAT_FIELDS[rookie.positionGroup];
  if (!allowed) return {};
  return Object.fromEntries(
    Object.entries(collegeStats)
      .filter(([field, value]) => allowed.has(field) && value != null)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function serializeProduction(data, meta) {
  const body = JSON.stringify(data, null, 2);

  return `// Generated by scripts/import-scout-production.mjs.
// Source: CollegeFootballData.com ${CFBD_SOURCE_URL}
// Years: ${meta.years.join(', ')} | Season type: ${meta.seasonType} | Categories: ${meta.categories.join(', ')}
// Do not add API keys to this file.

export const ROOKIE_PRODUCTION_2026 = ${body};
`;
}

function findGeneratedStatLoss(existingProduction, nextProduction) {
  if (!existingProduction) return [];

  const losses = [];
  for (const [playerId, existingEntry] of Object.entries(existingProduction)) {
    const existingStats = existingEntry?.collegeStats ?? {};
    const nextStats = nextProduction[playerId]?.collegeStats ?? {};

    for (const [field, value] of Object.entries(existingStats)) {
      if (value == null) continue;
      if (nextStats[field] == null) {
        losses.push({ playerId, field });
      }
    }
  }

  return losses;
}

function isLikelyNoStatMissing(item) {
  return (
    ['OL', 'ST'].includes(item.positionGroup)
    || String(item.college ?? '').includes('/IPP')
    || LIKELY_EXTERNAL_PRODUCTION_COLLEGES.has(item.college)
  );
}

function lastNameKey(name) {
  const parts = nameNoSuffixKey(name).split(' ').filter(Boolean);
  return parts.at(-1) ?? '';
}

function firstInitialKey(name) {
  return nameNoSuffixKey(name).charAt(0);
}

function findUnmatchedCandidates(item, unmatched) {
  const lastName = lastNameKey(item.name);
  const firstInitial = firstInitialKey(item.name);
  if (!lastName || !firstInitial) return [];

  return unmatched
    .filter((entry) => (
      lastNameKey(entry.player) === lastName
      && firstInitialKey(entry.player) === firstInitial
    ))
    .slice(0, 5);
}

function summarize({ matched, unmatched, missing, output, dryRun }) {
  const likelyNoStatMissing = missing.filter(isLikelyNoStatMissing);
  const actionableMissing = missing.filter((item) => !isLikelyNoStatMissing(item));

  console.log(`Scout production import ${dryRun ? 'dry run' : 'complete'}`);
  console.log(`Matched prospects: ${matched.length}`);
  console.log(`Unmatched production rows: ${unmatched.length}`);
  console.log(`Prospects missing production: ${missing.length}`);
  console.log(`Actionable missing production: ${actionableMissing.length}`);
  console.log(`Likely no-stat or external-source production missing: ${likelyNoStatMissing.length}`);
  console.log(`Output path: ${output}`);

  if (unmatched.length) {
    console.log('\nTop unmatched production rows:');
    for (const item of unmatched.slice(0, 20)) {
      console.log(`- ${item.player} (${item.team || 'unknown team'})`);
    }
  }

  if (actionableMissing.length) {
    console.log('\nActionable missing production:');
    for (const item of actionableMissing.slice(0, 40)) {
      console.log(`- ${item.name} (${item.position}, ${item.college})`);
    }

    const candidateGroups = actionableMissing
      .map((item) => ({
        item,
        candidates: findUnmatchedCandidates(item, unmatched),
      }))
      .filter((group) => group.candidates.length);

    if (candidateGroups.length) {
      console.log('\nPotential unmatched rows for actionable misses:');
      for (const group of candidateGroups) {
        console.log(`- ${group.item.name} (${group.item.college})`);
        for (const candidate of group.candidates) {
          console.log(`  - ${candidate.player} (${candidate.team || 'unknown team'})`);
        }
      }
    }
  }

  if (likelyNoStatMissing.length) {
    console.log('\nLikely no-stat or external-source production misses (OL/ST/IPP/small school):');
    for (const item of likelyNoStatMissing.slice(0, 20)) {
      console.log(`- ${item.name} (${item.position}, ${item.college})`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.CFBD_API_KEY || process.env.COLLEGE_FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('Missing CFBD_API_KEY. Set it in the shell; do not add it to Vite env files or client code.');
  }

  const [rookies, fetched] = await Promise.all([
    loadRookies(),
    Promise.all(args.years.flatMap((year) => (
      args.categories.map(async (category) => ({
        year,
        category,
        rows: await fetchPlayerSeasonStats({
          apiKey,
          year,
          seasonType: args.seasonType,
          category,
        }),
      }))
    ))),
  ]);

  const productionByKey = new Map();
  for (const result of fetched) {
    for (const row of result.rows) addRow(productionByKey, row);
  }

  const indexes = buildRookieIndexes(rookies);
  const matched = [];
  const matchedIds = new Set();
  const unmatched = [];
  const generated = {};

  for (const entry of productionByKey.values()) {
    const rookie = findRookieMatch(entry, indexes);
    if (!rookie) {
      unmatched.push(entry);
      continue;
    }

    const existing = generated[rookie.id] ?? {
      collegeStats: {},
      source: CFBD_SOURCE_URL,
      cfbd: {
        playerIds: [],
        seasons: [],
        teams: [],
      },
    };

    for (const [field, value] of Object.entries(entry.collegeStats)) {
      existing.collegeStats[field] = (existing.collegeStats[field] ?? 0) + value;
    }

    existing.cfbd.playerIds = [...new Set([
      ...existing.cfbd.playerIds,
      ...entry.playerIds,
    ])].sort();
    existing.cfbd.seasons = [...new Set([
      ...existing.cfbd.seasons,
      ...entry.seasons,
    ])].sort((a, b) => a - b);
    existing.cfbd.teams = [...new Set([
      ...existing.cfbd.teams,
      entry.team,
    ].filter(Boolean))].sort();

    const collegeStats = sanitizeCollegeStatsForRookie(rookie, existing.collegeStats);
    if (!Object.keys(collegeStats).length) continue;

    generated[rookie.id] = {
      collegeStats,
      source: existing.source,
      cfbd: existing.cfbd,
    };
    if (!matchedIds.has(rookie.id)) {
      matchedIds.add(rookie.id);
      matched.push(rookie);
    }
  }

  const missing = indexes.trackedRookies.filter((rookie) => !matchedIds.has(rookie.id));
  const output = serializeProduction(generated, {
    years: args.years,
    seasonType: args.seasonType,
    categories: args.categories,
  });

  if (!args.dryRun) {
    const existingProduction = await loadExistingProduction(args.output);
    const losses = findGeneratedStatLoss(existingProduction, generated);
    if (losses.length && !args.allowStatLoss) {
      const examples = losses
        .slice(0, 20)
        .map((loss) => `- ${loss.playerId}.${loss.field}`)
        .join('\n');
      throw new Error(
        `Refusing to write ${args.output} because ${losses.length} existing generated stat fields would be removed.\n`
        + `${examples}\n`
        + 'Rerun with the missing years/categories, or pass --allow-stat-loss if this removal is intentional.',
      );
    }

    writeFileSync(args.output, output);
  }

  summarize({
    matched,
    unmatched,
    missing,
    output: args.output,
    dryRun: args.dryRun,
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
