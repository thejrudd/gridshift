/**
 * Automatically looks up ESPN player IDs for ESPN_TOP_499_BOARD entries
 * and writes results to src/data/espnBoardIds.js.
 *
 * Usage:
 *   node scripts/scout-espn-autolookup.mjs             # run all missing
 *   node scripts/scout-espn-autolookup.mjs --limit 20  # test with first 20
 *   node scripts/scout-espn-autolookup.mjs --dry-run   # print matches, no write
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const root = resolve(__dirname, '..');
const rookiesPath = resolve(root, 'src/data/rookies.js');
const boardIdsPath = resolve(root, 'src/data/espnBoardIds.js');

const SEARCH_URL = 'https://site.web.api.espn.com/apis/common/v3/search';
const DELAY_MS = 150;

function normalizeProspectName(name) {
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

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function parseBoardEntries(source) {
  const match = source.match(/const ESPN_TOP_499_BOARD = `\n([\s\S]*?)`\s*;/);
  if (!match) throw new Error('Could not locate ESPN_TOP_499_BOARD in rookies.js');
  return match[1].trim().split('\n').map((line) => {
    const [rank, name, position, college] = line.split('|');
    return {
      rank: Number(rank),
      name: name?.trim(),
      position: position?.trim(),
      college: college?.trim(),
    };
  });
}

function loadCurrentIds() {
  const source = readFileSync(boardIdsPath, 'utf8');
  const match = source.match(/export const ESPN_BOARD_IDS = (\{[\s\S]*?\});/);
  if (!match) throw new Error('Could not parse ESPN_BOARD_IDS from espnBoardIds.js');
  // Safe eval via JSON after stripping trailing commas
  const cleaned = match[1].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('ESPN_BOARD_IDS is not valid JSON — may need manual inspection');
  }
}

async function searchEspn(name) {
  const url = `${SEARCH_URL}?query=${encodeURIComponent(name)}&limit=5&mode=prefix&type=player`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[i + 1] ?? 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const source = readFileSync(rookiesPath, 'utf8');
  const entries = parseBoardEntries(source);
  const currentIds = loadCurrentIds();

  const missing = entries.filter((e) => e.name && !currentIds[e.name]);
  const batch = missing.slice(0, args.limit);

  console.log(`Board entries total: ${entries.length}`);
  console.log(`Already have IDs:    ${Object.keys(currentIds).length}`);
  console.log(`Missing IDs:         ${missing.length}`);
  console.log(`Processing:          ${batch.length}${args.limit < Infinity ? ` (--limit ${args.limit})` : ''}`);
  if (args.dryRun) console.log('Dry run — no files will be written.\n');
  else console.log('');

  const found = {};
  const notFound = [];
  const ambiguous = [];

  for (let i = 0; i < batch.length; i++) {
    const player = batch[i];
    if (i > 0) await sleep(DELAY_MS);

    const items = await searchEspn(player.name);
    const normTarget = normalizeProspectName(player.name);
    const matches = items.filter(
      (item) => normalizeProspectName(item.displayName) === normTarget,
    );

    if (matches.length === 1) {
      found[player.name] = matches[0].id;
      process.stdout.write(`  ✓ ${player.name} → ${matches[0].id}\n`);
    } else if (matches.length === 0) {
      notFound.push(player.name);
      process.stdout.write(`  ✗ ${player.name} (no match)\n`);
    } else {
      // Multiple exact name matches — pick the one whose sport is football if possible
      const footballMatch = matches.find(
        (m) => m.sport === 'football' || m.defaultLeagueSlug === 'nfl',
      );
      if (footballMatch) {
        found[player.name] = footballMatch.id;
        process.stdout.write(`  ✓ ${player.name} → ${footballMatch.id} (disambiguated)\n`);
      } else {
        ambiguous.push({ name: player.name, matches: matches.map((m) => `${m.displayName} (${m.id})`) });
        process.stdout.write(`  ? ${player.name} — ambiguous: ${matches.map((m) => m.id).join(', ')}\n`);
      }
    }
  }

  console.log(`\nFound: ${Object.keys(found).length}  Not found: ${notFound.length}  Ambiguous: ${ambiguous.length}`);

  if (ambiguous.length > 0) {
    console.log('\nAmbiguous — resolve manually with scout-espn-ids.mjs --set:');
    for (const { name, matches } of ambiguous) {
      console.log(`  ${name}: ${matches.join(' | ')}`);
    }
  }

  if (Object.keys(found).length === 0 || args.dryRun) return;

  const merged = { ...currentIds, ...found };
  const entries_sorted = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
  const body = entries_sorted.map(([name, id]) => `  ${JSON.stringify(name)}: ${JSON.stringify(id)},`).join('\n');
  const output = `// ESPN college football player IDs for ESPN_TOP_499_BOARD entries.\n// Populated by: node scripts/scout-espn-autolookup.mjs\n// Do not edit manually — re-run the script to refresh.\nexport const ESPN_BOARD_IDS = {\n${body}\n};\n`;

  writeFileSync(boardIdsPath, output);
  console.log(`\nWrote ${Object.keys(merged).length} total IDs to src/data/espnBoardIds.js`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
