import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const root = resolve(__dirname, '..');
const rookiesPath = resolve(root, 'src/data/rookies.js');
const draftResultsPath = resolve(root, 'src/data/draftResults.js');

const NFLVERSE_DRAFT_PICKS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv';
const DEFAULT_SEASON = 2026;
const DEFAULT_SOURCE_LABEL = 'nflverse draft_picks.csv';

const APP_TEAM_BY_NFLVERSE = {
  ARI: 'ari',
  ARZ: 'ari',
  ATL: 'atl',
  BAL: 'bal',
  BUF: 'buf',
  CAR: 'car',
  CHI: 'chi',
  CIN: 'cin',
  CLE: 'cle',
  DAL: 'dal',
  DEN: 'den',
  DET: 'det',
  GB: 'gb',
  GNB: 'gb',
  HOU: 'hou',
  HST: 'hou',
  IND: 'ind',
  JAC: 'jax',
  JAX: 'jax',
  KC: 'kc',
  KAN: 'kc',
  LA: 'la',
  LAR: 'la',
  RAM: 'la',
  STL: 'la',
  LAC: 'lac',
  SDG: 'lac',
  LV: 'lv',
  LVR: 'lv',
  RAI: 'lv',
  MIA: 'mia',
  MIN: 'min',
  NE: 'ne',
  NWE: 'ne',
  NO: 'no',
  NOR: 'no',
  NYG: 'nyg',
  NYJ: 'nyj',
  PHO: 'ari',
  PHI: 'phi',
  PIT: 'pit',
  SEA: 'sea',
  SF: 'sf',
  SFO: 'sf',
  TB: 'tb',
  TAM: 'tb',
  TEN: 'ten',
  WAS: 'wsh',
  WSH: 'wsh',
};

const TEAM_NAMES = {
  ari: 'Arizona Cardinals',
  atl: 'Atlanta Falcons',
  bal: 'Baltimore Ravens',
  buf: 'Buffalo Bills',
  car: 'Carolina Panthers',
  chi: 'Chicago Bears',
  cin: 'Cincinnati Bengals',
  cle: 'Cleveland Browns',
  dal: 'Dallas Cowboys',
  den: 'Denver Broncos',
  det: 'Detroit Lions',
  gb: 'Green Bay Packers',
  hou: 'Houston Texans',
  ind: 'Indianapolis Colts',
  jax: 'Jacksonville Jaguars',
  kc: 'Kansas City Chiefs',
  la: 'Los Angeles Rams',
  lac: 'Los Angeles Chargers',
  lv: 'Las Vegas Raiders',
  mia: 'Miami Dolphins',
  min: 'Minnesota Vikings',
  ne: 'New England Patriots',
  no: 'New Orleans Saints',
  nyg: 'New York Giants',
  nyj: 'New York Jets',
  phi: 'Philadelphia Eagles',
  pit: 'Pittsburgh Steelers',
  sea: 'Seattle Seahawks',
  sf: 'San Francisco 49ers',
  tb: 'Tampa Bay Buccaneers',
  ten: 'Tennessee Titans',
  wsh: 'Washington Commanders',
};

function usage() {
  console.log(`Usage:
  node scripts/scout-nflverse-update.mjs
  node scripts/scout-nflverse-update.mjs --write
  node scripts/scout-nflverse-update.mjs --season 2026 --output tmp/draftResults.nflverse.js
  node scripts/scout-nflverse-update.mjs --input tmp/draft_picks.csv --write

Options:
  --season YEAR    Draft season to import. Default: ${DEFAULT_SEASON}.
  --input PATH     Read an already-downloaded nflverse draft_picks.csv.
  --output PATH    Write generated JS to this path. Default: src/data/draftResults.js.
  --write          Write the generated draft results file. Omitted means dry-run only.
  --allow-partial  Allow writing when some drafted rows did not match Scout players.
`);
}

function parseArgs(argv) {
  const args = {
    season: DEFAULT_SEASON,
    inputPath: null,
    outputPath: draftResultsPath,
    write: false,
    allowPartial: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--season') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value)) throw new Error('--season requires a numeric year');
      args.season = value;
      i += 1;
    } else if (arg === '--input') {
      const value = argv[i + 1];
      if (!value) throw new Error('--input requires a CSV path');
      args.inputPath = resolve(root, value);
      i += 1;
    } else if (arg === '--output') {
      const value = argv[i + 1];
      if (!value) throw new Error('--output requires a JS output path');
      args.outputPath = resolve(root, value);
      i += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--allow-partial') {
      args.allowPartial = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
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

function compactName(name) {
  return normalizeProspectName(name).replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, '');
}

function positionGroup(position, fallbackCategory = null) {
  const normalized = String(position ?? fallbackCategory ?? '').toUpperCase();
  if (['QB', 'RB', 'FB', 'WR', 'TE'].includes(normalized)) return normalized === 'FB' ? 'RB' : normalized;
  if (normalized.includes('EDGE') || ['DE', 'DT', 'NT'].includes(normalized)) return 'DL';
  if (['LB', 'OLB', 'ILB'].includes(normalized) || normalized.includes('LB')) return 'LB';
  if (['CB', 'DB', 'S', 'SAF', 'SS', 'FS'].includes(normalized)) return 'DB';
  if (['OT', 'OG', 'G', 'C', 'IOL', 'OL'].includes(normalized)) return 'OL';
  if (['K', 'P', 'LS'].includes(normalized)) return 'ST';
  return normalized || null;
}

function parseCsv(text) {
  const normalizedText = String(text)
    .trim()
    .replace(/ (?=\d{4},[A-Z0-9]+,\d+,)/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < normalizedText.length; i += 1) {
    const ch = normalizedText[i];
    const next = normalizedText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  row.push(field);
  if (row.some(value => value !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map(header => header.trim());
  return rows.slice(1)
    .filter(values => values.some(value => value.trim() !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function loadRookies() {
  const moduleUrl = `${pathToFileURL(rookiesPath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  return mod.ROOKIES_2026;
}

async function loadCsv(args) {
  if (args.inputPath) {
    return {
      text: readFileSync(args.inputPath, 'utf8'),
      source: args.inputPath,
    };
  }

  const response = await fetch(NFLVERSE_DRAFT_PICKS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch nflverse draft picks: ${response.status} ${response.statusText}`);
  }
  return {
    text: await response.text(),
    source: NFLVERSE_DRAFT_PICKS_URL,
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDraftRow(row, pickInRoundByOverall) {
  const season = toNumber(row.season);
  const round = toNumber(row.round);
  const overall = toNumber(row.pick);
  const rawTeam = String(row.team ?? '').trim().toUpperCase();
  const team = APP_TEAM_BY_NFLVERSE[rawTeam] ?? rawTeam.toLowerCase() ?? null;
  const playerName = String(row.pfr_player_name || row.pfr_name || row.player_name || row.name || '').trim();
  if (!season || !round || !overall || !team || !playerName) return null;

  return {
    season,
    round,
    pick: pickInRoundByOverall.get(overall) ?? overall,
    overall,
    team,
    teamName: TEAM_NAMES[team] ?? rawTeam,
    playerName,
    position: String(row.position || '').trim().toUpperCase() || null,
    category: String(row.category || '').trim().toUpperCase() || null,
    college: String(row.college || '').trim() || null,
  };
}

function buildPickInRoundMap(rows) {
  const ordered = [...rows]
    .map(row => ({
      round: toNumber(row.round),
      overall: toNumber(row.pick),
    }))
    .filter(row => row.round != null && row.overall != null)
    .sort((a, b) => a.round - b.round || a.overall - b.overall);

  const byRound = new Map();
  const byOverall = new Map();
  for (const row of ordered) {
    const nextPick = (byRound.get(row.round) ?? 0) + 1;
    byRound.set(row.round, nextPick);
    byOverall.set(row.overall, nextPick);
  }
  return byOverall;
}

function buildRookieIndex(rookies) {
  const byName = new Map();
  const byCompactName = new Map();
  for (const player of rookies) {
    const keys = [
      [byName, normalizeProspectName(player.name)],
      [byCompactName, compactName(player.name)],
    ];
    for (const [map, key] of keys) {
      const existing = map.get(key) ?? [];
      existing.push(player);
      map.set(key, existing);
    }
  }
  return { byName, byCompactName };
}

function choosePositionMatch(candidates, result) {
  if (candidates.length <= 1) return candidates[0] ?? null;
  const resultGroup = positionGroup(result.position, result.category);
  if (!resultGroup) return null;
  const positionMatches = candidates.filter(player => {
    const playerGroup = positionGroup(player.position, player.positionGroup);
    return player.position === result.position || playerGroup === resultGroup;
  });
  return positionMatches.length === 1 ? positionMatches[0] : null;
}

function findRookieForResult(result, index) {
  const exact = index.byName.get(normalizeProspectName(result.playerName)) ?? [];
  const exactMatch = choosePositionMatch(exact, result);
  if (exactMatch) return { player: exactMatch, method: 'name+position' };
  if (exact.length === 1) return { player: exact[0], method: 'name' };
  if (exact.length > 1) return { player: null, ambiguous: exact };

  const compact = index.byCompactName.get(compactName(result.playerName)) ?? [];
  const compactMatch = choosePositionMatch(compact, result);
  if (compactMatch) return { player: compactMatch, method: 'compact-name+position' };
  if (compact.length === 1) return { player: compact[0], method: 'compact-name' };
  if (compact.length > 1) return { player: null, ambiguous: compact };

  return { player: null, ambiguous: [] };
}

function buildDraftResults({ rows, rookies, season }) {
  const seasonRows = rows.filter(row => toNumber(row.season) === season);
  const pickInRoundByOverall = buildPickInRoundMap(seasonRows);
  const normalizedResults = seasonRows
    .map(row => normalizeDraftRow(row, pickInRoundByOverall))
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
  const rookieIndex = buildRookieIndex(rookies);
  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const usedPlayerIds = new Set();

  for (const result of normalizedResults) {
    const match = findRookieForResult(result, rookieIndex);
    if (!match.player) {
      const bucket = match.ambiguous?.length ? ambiguous : unmatched;
      bucket.push({ result, candidates: match.ambiguous ?? [] });
      continue;
    }
    if (usedPlayerIds.has(match.player.id)) {
      ambiguous.push({ result, candidates: [match.player] });
      continue;
    }
    usedPlayerIds.add(match.player.id);
    matched.push({
      round: result.round,
      pick: result.pick,
      overall: result.overall,
      team: result.team,
      teamName: result.teamName,
      playerId: match.player.id,
      playerName: match.player.name,
      position: match.player.position,
      college: match.player.college,
      source: DEFAULT_SOURCE_LABEL,
      matchMethod: match.method,
    });
  }

  return { matched, unmatched, ambiguous, totalDrafted: normalizedResults.length };
}

function serializeDraftResults(results, sourceUrl) {
  const publicRows = results.map(({ matchMethod, ...row }) => row);
  return `const NFLVERSE_DRAFT_RESULTS_URL = '${sourceUrl}';\n\nexport const DRAFT_RESULTS_2026 = ${JSON.stringify(publicRows, null, 2)};\n\nexport const DRAFT_RESULTS_SOURCE_2026 = NFLVERSE_DRAFT_RESULTS_URL;\n`;
}

function printResultList(label, rows, limit = 20) {
  if (!rows.length) return;
  console.log(`\n${label} (${rows.length}):`);
  for (const item of rows.slice(0, limit)) {
    const result = item.result ?? item;
    const candidateText = item.candidates?.length
      ? ` candidates: ${item.candidates.map(player => `${player.name} (${player.position}, ${player.college})`).join('; ')}`
      : '';
    console.log(`  #${result.overall} ${result.playerName} (${result.position ?? result.category ?? '?'}) ${result.teamName}${candidateText}`);
  }
  if (rows.length > limit) console.log(`  ...${rows.length - limit} more`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [rookies, csv] = await Promise.all([loadRookies(), loadCsv(args)]);
  const rows = parseCsv(csv.text);
  const { matched, unmatched, ambiguous, totalDrafted } = buildDraftResults({
    rows,
    rookies,
    season: args.season,
  });

  console.log(`nflverse source: ${csv.source}`);
  console.log(`Season: ${args.season}`);
  console.log(`Drafted rows: ${totalDrafted}`);
  console.log(`Matched Scout players: ${matched.length}`);
  console.log(`Unmatched rows: ${unmatched.length}`);
  console.log(`Ambiguous rows: ${ambiguous.length}`);

  printResultList('Unmatched', unmatched);
  printResultList('Ambiguous', ambiguous);

  if (matched.length) {
    console.log('\nSample matches:');
    for (const row of matched.slice(0, 10)) {
      console.log(`  #${row.overall} ${row.playerName} -> ${row.teamName} (${row.matchMethod})`);
    }
  }

  const hasGaps = unmatched.length > 0 || ambiguous.length > 0;
  if (args.write && hasGaps && !args.allowPartial) {
    throw new Error('Refusing to write with unmatched or ambiguous draft rows. Re-run with --allow-partial after review if this is expected.');
  }

  if (!args.write) {
    console.log('\nDry run only. Re-run with --write to update the draft results file.');
    return;
  }

  const output = serializeDraftResults(matched, NFLVERSE_DRAFT_PICKS_URL);
  writeFileSync(args.outputPath, output);
  console.log(`\nWrote ${matched.length} draft results to ${args.outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
