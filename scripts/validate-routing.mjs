import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAppPath, parseAppRoute, normalizeAppRoute } from '../src/utils/appRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const root = resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectRoundTrip(route, expectedPath = null) {
  const normalized = normalizeAppRoute(route);
  const path = buildAppPath(normalized);
  if (expectedPath) assert(path === expectedPath, `Expected ${expectedPath}, got ${path}`);
  const url = new URL(path, 'https://nflpredictor.local');
  const parsed = parseAppRoute(url.pathname, url.search);
  const reparsed = normalizeAppRoute(parsed);
  assert(JSON.stringify(reparsed) === JSON.stringify(normalized), `Round-trip mismatch for ${path}`);
  return path;
}

const nginxConf = readFileSync(resolve(root, 'nginx.conf'), 'utf8');
assert(nginxConf.includes('try_files $uri $uri/ /index.html;'), 'nginx.conf is missing SPA try_files fallback');

const viteConfig = readFileSync(resolve(root, 'vite.config.js'), 'utf8');
assert(viteConfig.includes("navigateFallback: '/index.html'"), 'vite.config.js is missing Workbox navigateFallback');

const distFiles = ['dist/index.html', 'dist/sw.js', 'dist/manifest.webmanifest'];
for (const rel of distFiles) {
  assert(existsSync(resolve(root, rel)), `Missing build artifact: ${rel}. Run npm run build first.`);
}

const validatedPaths = [
  expectRoundTrip({ activeTab: 'predictions', seasonView: 'predictions' }, '/predictions'),
  expectRoundTrip({ activeTab: 'predictions', seasonView: 'predictions', predictionsTeamId: 'BUF' }, '/predictions/team/buf'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'browser' }, '/statistics'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'team', statisticsTeamId: 'KC' }, '/statistics/team/kc'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'player', statisticsPlayerId: '3139477', statisticsPlayerSlug: 'josh-allen' }, '/statistics/player/3139477/josh-allen'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'roster' }, '/companion/roster'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'rankings', rankingsPosition: 'QB' }, '/companion/rankings?pos=QB'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'heatmap' }, '/companion/heatmap'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'heatmap', heatmapViewMode: 'defense', heatmapDefensePosition: 'LB', heatmapDefenseStatMode: 'idp_sack', heatmapScope: 'week', heatmapLocation: 'home', heatmapSortKey: 7, heatmapSortDir: 'asc', heatmapTeamSort: 'division', heatmapUseTeamColors: '1', heatmapVegasView: 'ou' }, '/companion/heatmap?mode=defense&defPos=LB&defStat=idp_sack&scope=week&loc=home&sort=7&dir=asc&teams=division&colors=1&odds=ou'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'defense' }, '/companion/defense'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'defense', defensePosition: 'RB', defenseStat: 'rush_att' }, '/companion/defense?pos=RB'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'defense', defenseMode: 'fantasy', defensePosition: 'QB', defenseStat: 'pass_yd', defenseSort: 'team', defenseDir: 'asc', defenseQuery: 'KC' }, '/companion/defense?mode=fantasy&sort=team&dir=asc&q=KC'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'defense', defenseSort: 'avg', defenseDir: 'asc' }, '/companion/defense?sort=avg&dir=asc'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'waiver', waiverPosition: 'RB' }, '/companion/waiver?position=RB'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'matchup', matchupWeek: 7, matchupPlayerId: '4034' }, '/companion/matchup?week=7&player=4034'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'league', leagueSubview: 'roster', leagueRosterId: '5' }, '/companion/league?team=5'),
  expectRoundTrip({ activeTab: 'companion', companionView: 'league', leagueSubview: 'picks' }, '/companion/league?sub=picks'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'agent' }, '/trade/agent'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'intelligence', tradePartnerRosterId: '5' }, '/trade/intelligence?partner=5'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'agent', tradePlayerId: '4034', tradeSide: 'give', tradePartnerRosterId: '7', tradeOtherPlayerId: '111' }, '/trade/agent?player=4034&side=give&partner=7&other=111'),
  expectRoundTrip({ activeTab: 'scout', scoutView: 'prospects' }, '/scout'),
  expectRoundTrip({ activeTab: 'scout', scoutView: 'picks' }, '/scout/picks'),
  expectRoundTrip({ activeTab: 'scout', scoutView: 'results' }, '/scout/results'),
];

const legacyDefenseSackPath = buildAppPath(parseAppRoute('/companion/defense', '?stat=pass_sack'));
assert(legacyDefenseSackPath === '/companion/defense', `Expected legacy QB sack defense stat to normalize away, got ${legacyDefenseSackPath}`);

console.log('Routing validation passed.');
for (const path of validatedPaths) console.log(`- ${path}`);
console.log('Confirmed nginx SPA fallback, Workbox navigateFallback, and required build artifacts.');
