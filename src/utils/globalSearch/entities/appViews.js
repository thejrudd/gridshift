// ── App destination records ────────────────────────────────────────────────
// Every view a user can name directly, so the palette doubles as a way to jump
// between sections without hunting through tabs.
//
// This list is curated rather than generated from appRoutes.js: the route
// vocabulary holds slugs, and a search result needs a readable label and the
// words people would actually type for it.

import { KIND_APP_VIEW, makeRecord, nameTokens } from './record.js';

const VIEWS = [
  // ── Fantasy ───────────────────────────────────────────────────────────────
  { id: 'fantasy.rosters', label: 'Rosters', section: 'Fantasy', aliases: ['roster', 'my team', 'lineup'], route: { activeTab: 'fantasy', companionView: 'rosters' } },
  { id: 'fantasy.matchups', label: 'Matchups', section: 'Fantasy', aliases: ['matchup', 'my matchup', 'head to head'], route: { activeTab: 'fantasy', companionView: 'matchups' } },
  { id: 'fantasy.live', label: 'Live', section: 'Fantasy', aliases: ['live scoring', 'scoreboard'], route: { activeTab: 'fantasy', companionView: 'live' } },
  { id: 'fantasy.rankings', label: 'Rankings', section: 'Fantasy', aliases: ['ranks', 'player rankings'], route: { activeTab: 'fantasy', companionView: 'rankings' } },
  { id: 'fantasy.waivers', label: 'Waivers', section: 'Fantasy', aliases: ['waiver wire', 'free agents', 'pickups'], route: { activeTab: 'fantasy', companionView: 'waivers' } },
  { id: 'fantasy.injuries', label: 'Injuries', section: 'Fantasy', aliases: ['injury report', 'hurt'], route: { activeTab: 'fantasy', companionView: 'injuries' } },
  { id: 'fantasy.schedule', label: 'Fantasy schedule', section: 'Fantasy', aliases: ['league schedule'], route: { activeTab: 'fantasy', companionView: 'schedule' } },
  { id: 'fantasy.heatmap', label: 'Heatmap', section: 'Fantasy', aliases: ['defense heatmap', 'coverage colors'], route: { activeTab: 'fantasy', companionView: 'heatmap' } },
  { id: 'fantasy.defenses', label: 'Defenses', section: 'Fantasy', aliases: ['defense rankings', 'points against', 'streaming defense'], route: { activeTab: 'fantasy', companionView: 'defenses' } },
  { id: 'fantasy.scoring', label: 'Scoring settings', section: 'Fantasy', aliases: ['league scoring', 'scoring rules'], route: { activeTab: 'fantasy', companionView: 'scoring' } },

  // ── Statistics ────────────────────────────────────────────────────────────
  { id: 'statistics.browser', label: 'Player browser', section: 'Statistics', aliases: ['players', 'browse players', 'find a player'], route: { activeTab: 'statistics', statisticsView: 'browser' } },
  { id: 'statistics.schedule', label: 'NFL schedule', section: 'Statistics', aliases: ['schedule', 'games', 'fixtures'], route: { activeTab: 'statistics', statisticsView: 'schedule' } },
  { id: 'statistics.scores', label: 'Scores', section: 'Statistics', aliases: ['box scores', 'results', 'game results'], route: { activeTab: 'statistics', statisticsView: 'scores' } },
  { id: 'statistics.standings', label: 'NFL standings', section: 'Statistics', aliases: ['standings', 'division standings', 'playoff picture'], route: { activeTab: 'statistics', statisticsView: 'standings' } },

  // ── League ────────────────────────────────────────────────────────────────
  { id: 'league.standings', label: 'League standings', section: 'League', aliases: ['my standings', 'league table'], route: { activeTab: 'league', leagueView: 'standings' } },
  { id: 'league.history', label: 'League history', section: 'League', aliases: ['past seasons', 'champions', 'record book'], route: { activeTab: 'league', leagueView: 'history' } },
  { id: 'league.activity', label: 'League activity', section: 'League', aliases: ['transactions', 'recent moves', 'adds and drops'], route: { activeTab: 'league', leagueView: 'activity' } },

  // ── Trade ─────────────────────────────────────────────────────────────────
  { id: 'trade.agent', label: 'Trade agent', section: 'Trade', aliases: ['trade', 'make a trade', 'trade finder'], route: { activeTab: 'trade', tradeView: 'agent' } },
  { id: 'trade.intelligence', label: 'Trade intelligence', section: 'Trade', aliases: ['trade values', 'market'], route: { activeTab: 'trade', tradeView: 'intelligence' } },
  { id: 'trade.upgrade', label: 'Trade upgrades', section: 'Trade', aliases: ['upgrade my team'], route: { activeTab: 'trade', tradeView: 'upgrade' } },
  { id: 'trade.history', label: 'Trade history', section: 'Trade', aliases: ['past trades', 'my trades'], route: { activeTab: 'trade', tradeView: 'history' } },
  { id: 'trade.inbox', label: 'Trade inbox', section: 'Trade', aliases: ['trade offers', 'proposals'], route: { activeTab: 'trade', tradeView: 'inbox' } },

  // ── Draft and scout ───────────────────────────────────────────────────────
  { id: 'draft.warRoom', label: 'Draft war room', section: 'Draft', aliases: ['draft', 'war room', 'live draft'], route: { activeTab: 'draft', draftView: 'war-room' } },
  { id: 'draft.myBoard', label: 'My draft board', section: 'Draft', aliases: ['my board', 'draft board', 'rankings board'], route: { activeTab: 'draft', draftView: 'my-board' } },
  { id: 'draft.results', label: 'Draft results', section: 'Draft', aliases: ['draft recap', 'draft order'], route: { activeTab: 'draft', draftView: 'results' } },
  { id: 'scout.prospects', label: 'Scout prospects', section: 'Scout', aliases: ['scout', 'rookies', 'prospects', 'college'], route: { activeTab: 'scout', scoutView: 'prospects' } },
  { id: 'scout.picks', label: 'Scout picks', section: 'Scout', aliases: ['mock draft', 'my picks'], route: { activeTab: 'scout', scoutView: 'picks' } },
  { id: 'scout.results', label: 'Scout results', section: 'Scout', aliases: ['scout recap'], route: { activeTab: 'scout', scoutView: 'results' } },

  // ── Predictions ───────────────────────────────────────────────────────────
  { id: 'predictions.predictions', label: 'Predictions', section: 'Predictions', aliases: ['predict', 'my picks', 'season predictions'], route: { activeTab: 'predictions', seasonView: 'predictions' } },
  { id: 'predictions.playoffs', label: 'Playoff predictions', section: 'Predictions', aliases: ['playoffs', 'bracket', 'playoff bracket'], route: { activeTab: 'predictions', seasonView: 'playoffs' } },
];

/**
 * App destinations carry a low weight so they sit below real entities: a query
 * for a player named Scout should not be outranked by the Scout tab.
 */
export function buildAppViewRecords() {
  return VIEWS.map((view) => makeRecord({
    kind: KIND_APP_VIEW,
    id: view.id,
    label: view.label,
    sublabel: view.section,
    tokens: [
      ...nameTokens(view.label),
      ...view.aliases.flatMap((alias) => nameTokens(alias)),
    ],
    route: view.route,
    weight: 0.15,
    meta: { section: view.section },
  }));
}
