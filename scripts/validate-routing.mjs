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
assert(
  nginxConf.includes('location /api/fantasy/ {')
    && nginxConf.includes('proxy_pass http://gridshift-api:3001/api/fantasy/;'),
  'nginx.conf is missing the Fantasy API sidecar proxy',
);

const serverDockerfile = readFileSync(resolve(root, 'Dockerfile.server'), 'utf8');
assert(
  serverDockerfile.includes('COPY src/utils ./src/utils'),
  'Dockerfile.server is missing the server-side provider utility modules',
);

const viteConfig = readFileSync(resolve(root, 'vite.config.js'), 'utf8');
assert(viteConfig.includes("navigateFallback: '/index.html'"), 'vite.config.js is missing Workbox navigateFallback');
assert(
  viteConfig.includes('navigateFallbackDenylist: [/^\\/api(?:\\/|$)/]'),
  'vite.config.js must exclude API URLs from the Workbox navigation fallback',
);

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
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule' }, '/statistics/schedule'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'week', statisticsScheduleWeek: 1 }, '/statistics/schedule?mode=week&week=1'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'week', statisticsScheduleWeek: 'pre-2' }, '/statistics/schedule?mode=week&week=pre-2'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'team', statisticsScheduleTeamId: 'KC' }, '/statistics/schedule?mode=team&team=KC'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'week', statisticsScheduleFilter: 'international' }, '/statistics/schedule?mode=week&filter=international'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'week', statisticsScheduleFilter: 'primetime' }, '/statistics/schedule?mode=week&filter=primetime'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'team', statisticsScheduleTeamId: 'KC', statisticsScheduleFilter: 'holiday' }, '/statistics/schedule?mode=team&team=KC&filter=holiday'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'scores' }, '/statistics/scores'),
  expectRoundTrip({ activeTab: 'statistics', statisticsView: 'game', statisticsGameId: '401872656' }, '/statistics/game/401872656'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'rosters' }, '/fantasy/rosters'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'rankings', rankingsPosition: 'QB' }, '/fantasy/rankings?pos=QB'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'heatmap' }, '/fantasy/heatmap'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'heatmap', heatmapViewMode: 'defense', heatmapDefensePosition: 'LB', heatmapDefenseStatMode: 'idp_sack', heatmapScope: 'week', heatmapLocation: 'home', heatmapSortKey: 7, heatmapSortDir: 'asc', heatmapTeamSort: 'division', heatmapUseTeamColors: '1', heatmapVegasView: 'ou' }, '/fantasy/heatmap?mode=defense&defPos=LB&defStat=idp_sack&scope=week&loc=home&sort=7&dir=asc&teams=division&colors=1&odds=ou'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'defenses' }, '/fantasy/defenses'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'defenses', defensePosition: 'RB', defenseStat: 'rush_att' }, '/fantasy/defenses?pos=RB'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'defenses', defenseMode: 'fantasy', defensePosition: 'QB', defenseStat: 'pass_yd', defenseSort: 'team', defenseDir: 'asc', defenseQuery: 'KC' }, '/fantasy/defenses?mode=fantasy&sort=team&dir=asc&q=KC'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'defenses', defenseSort: 'avg', defenseDir: 'asc' }, '/fantasy/defenses?sort=avg&dir=asc'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'waivers', waiverPosition: 'RB' }, '/fantasy/waivers?position=RB'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'matchups', matchupWeek: 7, matchupPlayerId: '4034', matchupRosterId: '5' }, '/fantasy/matchups?week=7&player=4034&team=5'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'rosters', leagueSubview: 'roster', leagueRosterId: '5' }, '/fantasy/rosters?team=5'),
  expectRoundTrip({ activeTab: 'fantasy', companionView: 'rosters', leagueSubview: 'picks' }, '/fantasy/rosters?sub=picks'),
  expectRoundTrip({ activeTab: 'league', leagueView: 'standings' }, '/league/standings'),
  expectRoundTrip({ activeTab: 'league', leagueView: 'history' }, '/league/history'),
  expectRoundTrip({ activeTab: 'league', leagueView: 'activity' }, '/league/activity'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'agent' }, '/trade/agent'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'history' }, '/trade/history'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'intelligence', tradePartnerRosterId: '5' }, '/trade/intelligence?partner=5'),
  expectRoundTrip({ activeTab: 'trade', tradeView: 'agent', tradePlayerId: '4034', tradeSide: 'give', tradePartnerRosterId: '7', tradeOtherPlayerId: '111' }, '/trade/agent?player=4034&side=give&partner=7&other=111'),
  expectRoundTrip({ activeTab: 'scout', scoutView: 'prospects' }, '/scout'),
  expectRoundTrip({ activeTab: 'scout', scoutView: 'picks' }, '/scout/picks'),
  expectRoundTrip({ activeTab: 'scout', scoutView: 'results' }, '/scout/results'),
];

const legacyDefenseSackPath = buildAppPath(parseAppRoute('/companion/defense', '?stat=pass_sack'));
assert(legacyDefenseSackPath === '/fantasy/defenses', `Expected legacy QB sack defense stat to normalize away, got ${legacyDefenseSackPath}`);

const legacyRostersPath = buildAppPath(parseAppRoute('/companion/league', '?sub=picks&team=5'));
assert(legacyRostersPath === '/fantasy/rosters?sub=picks&team=5', `Expected legacy League route to retain roster state, got ${legacyRostersPath}`);

const legacyLeagueHistoryPath = buildAppPath(parseAppRoute('/companion/history'));
assert(legacyLeagueHistoryPath === '/league/history', `Expected legacy Companion history route to move to League, got ${legacyLeagueHistoryPath}`);

const legacyScheduleSpecialPath = buildAppPath(parseAppRoute('/statistics/schedule', '?mode=holiday'));
assert(
  legacyScheduleSpecialPath === '/statistics/schedule?mode=week&filter=holiday',
  `Expected legacy schedule special mode to become a filter, got ${legacyScheduleSpecialPath}`,
);

const scheduleFilterOnlyPath = buildAppPath(parseAppRoute('/statistics/schedule', '?filter=primetime'));
assert(
  scheduleFilterOnlyPath === '/statistics/schedule?mode=week&filter=primetime',
  `Expected filter-only schedule route to default to week view, got ${scheduleFilterOnlyPath}`,
);

console.log('Routing validation passed.');
for (const path of validatedPaths) console.log(`- ${path}`);
console.log('Confirmed nginx SPA fallback, Workbox navigateFallback, and required build artifacts.');
