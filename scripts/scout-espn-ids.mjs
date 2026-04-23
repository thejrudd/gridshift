import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const root = resolve(__dirname, '..');
const rookiesPath = resolve(root, 'src/data/rookies.js');

function usage() {
  console.log(`Usage:
  node scripts/scout-espn-ids.mjs --missing
  node scripts/scout-espn-ids.mjs --set "Player Name=4837248"
  node scripts/scout-espn-ids.mjs --set "Player Name=https://www.espn.com/college-football/player/_/id/4837248/player-name"
  node scripts/scout-espn-ids.mjs --map tmp/scout-espn-ids.json

Options:
  --missing       List rookies missing espnCollegeId/sleeperPlayerId.
  --set VALUE     Apply one verified mapping. Can be repeated. VALUE is name=id-or-ESPN-url.
  --map PATH      Apply mappings from JSON object: { "Player Name": "id-or-ESPN-url" }.
  --dry-run       Print intended updates without writing src/data/rookies.js.
`);
}

function parseArgs(argv) {
  const args = {
    missing: false,
    dryRun: false,
    sets: [],
    mapPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--missing') {
      args.missing = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--set') {
      const value = argv[i + 1];
      if (!value) throw new Error('--set requires "Player Name=id-or-url"');
      args.sets.push(value);
      i += 1;
    } else if (arg === '--map') {
      const value = argv[i + 1];
      if (!value) throw new Error('--map requires a JSON file path');
      args.mapPath = resolve(root, value);
      i += 1;
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
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function searchQuery(player) {
  return [
    'site:espn.com/college-football/player',
    player.name,
    player.college,
    'ESPN',
    'id',
  ].join(' ');
}

function extractEspnId(value) {
  const raw = String(value ?? '').trim();
  const idMatch = raw.match(/^\d+$/);
  if (idMatch) return raw;
  const pathMatch = raw.match(/\/id\/(\d+)(?:\/|$)/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = raw.match(/[?&]id=(\d+)(?:&|$)/);
  if (queryMatch) return queryMatch[1];
  throw new Error(`Could not extract ESPN athlete ID from: ${value}`);
}

function parseSetMapping(value) {
  const eq = value.indexOf('=');
  if (eq <= 0) throw new Error(`Invalid --set mapping: ${value}`);
  const name = value.slice(0, eq).trim();
  const espnCollegeId = extractEspnId(value.slice(eq + 1));
  if (!name) throw new Error(`Invalid --set mapping: ${value}`);
  return [name, espnCollegeId];
}

async function loadRookies() {
  const moduleUrl = `${pathToFileURL(rookiesPath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  return mod.ROOKIES_2026;
}

function findRookieCalls(source) {
  const calls = [];
  let index = 0;

  while (index < source.length) {
    const callStart = source.indexOf('rookie(', index);
    if (callStart === -1) break;

    const openParen = callStart + 'rookie'.length;
    let depth = 0;
    let closeParen = -1;
    let quote = null;
    let escaped = false;

    for (let i = openParen; i < source.length; i += 1) {
      const ch = source[i];

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quote) {
          quote = null;
        }
        continue;
      }

      if (ch === '\'' || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }

      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          closeParen = i;
          break;
        }
      }
    }

    if (closeParen === -1) throw new Error(`Could not find end of rookie() call at index ${callStart}`);
    calls.push({ callStart, openParen, closeParen });
    index = closeParen + 1;
  }

  return calls;
}

function topLevelArgs(content) {
  const args = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    if (ch === ')' || ch === '}' || ch === ']') depth -= 1;

    if (ch === ',' && depth === 0) {
      args.push({ start, end: i, value: content.slice(start, i).trim() });
      start = i + 1;
    }
  }

  args.push({ start, end: content.length, value: content.slice(start).trim() });
  return args;
}

function unquote(value) {
  if (value == null) return null;
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote !== '\'' && quote !== '"') || trimmed.at(-1) !== quote) return null;
  return trimmed.slice(1, -1).replaceAll(`\\${quote}`, quote);
}

function patchSource(source, mappings) {
  const calls = findRookieCalls(source);
  const updates = [];
  let patched = source;

  for (const call of calls) {
    const content = source.slice(call.openParen + 1, call.closeParen);
    const args = topLevelArgs(content);
    const name = unquote(args[1]?.value);
    if (!name) continue;

    const espnCollegeId = mappings.get(normalizeProspectName(name));
    if (!espnCollegeId) continue;

    const callText = source.slice(call.callStart, call.closeParen + 1);
    let nextCallText = callText;

    if (/espnCollegeId:\s*['"]\d+['"]/.test(nextCallText)) {
      nextCallText = nextCallText.replace(/espnCollegeId:\s*['"]\d+['"]/, `espnCollegeId: '${espnCollegeId}'`);
    } else if (args[5]?.value?.startsWith('{')) {
      const extraStartInContent = args[5].start + content.slice(args[5].start).indexOf('{');
      const insertAt = 'rookie('.length + extraStartInContent + 1;
      nextCallText = `${callText.slice(0, insertAt)}\n    espnCollegeId: '${espnCollegeId}',${callText.slice(insertAt)}`;
    } else {
      nextCallText = `${callText.slice(0, -1)}, {\n    espnCollegeId: '${espnCollegeId}',\n  })`;
    }

    if (nextCallText !== callText) {
      updates.push({ name, espnCollegeId });
      patched = `${patched.slice(0, call.callStart)}${nextCallText}${patched.slice(call.closeParen + 1)}`;
      const delta = nextCallText.length - callText.length;
      for (const other of calls) {
        if (other.callStart > call.callStart) {
          other.callStart += delta;
          other.openParen += delta;
          other.closeParen += delta;
        }
      }
    }
  }

  return { patched, updates };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.missing && args.sets.length === 0 && !args.mapPath) {
    usage();
    return;
  }

  const rookies = await loadRookies();

  if (args.missing) {
    const missing = rookies.filter(player => !player.espnCollegeId && !player.sleeperPlayerId);
    console.log(`${missing.length} rookies are missing photo IDs.`);
    for (const player of missing) {
      console.log(`${player.bigBoardRank}. ${player.name} (${player.position}, ${player.college})`);
      console.log(`   ${searchQuery(player)}`);
    }
  }

  const rawMappings = new Map();
  for (const value of args.sets) {
    rawMappings.set(...parseSetMapping(value));
  }

  if (args.mapPath) {
    const parsed = JSON.parse(readFileSync(args.mapPath, 'utf8'));
    for (const [name, value] of Object.entries(parsed)) {
      rawMappings.set(name, extractEspnId(value));
    }
  }

  if (rawMappings.size === 0) return;

  const mappings = new Map();
  for (const [name, value] of rawMappings) {
    mappings.set(normalizeProspectName(name), value);
  }

  const source = readFileSync(rookiesPath, 'utf8');
  const { patched, updates } = patchSource(source, mappings);
  const unmatched = [...rawMappings.keys()].filter(name => !updates.some(update => normalizeProspectName(update.name) === normalizeProspectName(name)));

  if (updates.length === 0) {
    console.log('No matching rookies were updated.');
  } else {
    for (const update of updates) {
      console.log(`${args.dryRun ? 'Would update' : 'Updated'} ${update.name}: espnCollegeId ${update.espnCollegeId}`);
    }
  }

  if (unmatched.length) {
    console.log(`Unmatched mappings: ${unmatched.join(', ')}`);
  }

  if (!args.dryRun && updates.length > 0) {
    writeFileSync(rookiesPath, patched);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
