const PREDICTIONS_VIEWS = new Set(['predictions', 'standings', 'playoffs']);
const COMPANION_VIEWS = new Set(['roster', 'rankings', 'matchup', 'waiver', 'league', 'defense', 'scoring']);
const TRADE_VIEWS = new Set(['agent', 'intelligence', 'upgrade', 'compare']);
const STATISTICS_VIEWS = new Set(['browser', 'team', 'player']);

function normalizeCompanionView(view) {
  if (view === 'heatmap') return 'defense';
  return COMPANION_VIEWS.has(view) ? view : DEFAULT_ROUTE.companionView;
}

const DEFAULT_ROUTE = {
  activeTab: 'predictions',
  seasonView: 'predictions',
  predictionsTeamId: null,
  statisticsView: 'browser',
  statisticsTeamId: null,
  statisticsPlayerId: null,
  statisticsPlayerSlug: null,
  companionView: 'roster',
  rankingsPosition: null,
  waiverPosition: null,
  matchupWeek: null,
  matchupPlayerId: null,
  leagueSubview: null,
  leagueRosterId: null,
  heatmapViewMode: null,
  heatmapPosition: null,
  heatmapDefensePosition: null,
  heatmapStatMode: null,
  heatmapDefenseStatMode: null,
  heatmapScope: null,
  heatmapLocation: null,
  heatmapSortKey: null,
  heatmapSortDir: null,
  heatmapTeamSort: null,
  heatmapUseTeamColors: null,
  heatmapVegasView: null,
  tradeView: 'agent',
  tradePlayerId: null,
  tradeSide: null,
  tradePartnerRosterId: null,
  tradeOtherPlayerId: null,
};

function normalizeTeamId(teamId) {
  if (typeof teamId !== 'string') return null;
  const value = teamId.trim();
  return value ? value.toUpperCase() : null;
}

function normalizePlayerId(playerId) {
  if (playerId == null) return null;
  const value = String(playerId).trim();
  return value || null;
}

function normalizePosition(position) {
  if (typeof position !== 'string') return null;
  const value = position.trim().toUpperCase();
  return value || null;
}

function normalizeLowerToken(value, allowedValues, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function normalizeBooleanFlag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return '1';
  if (value === false || value === 'false' || value === '0' || value === 0) return '0';
  return null;
}

function normalizeHeatmapSortKey(value) {
  const keyword = normalizeLowerToken(value, new Set(['avg', 'team']));
  if (keyword) return keyword;
  return normalizeWeek(value);
}

function normalizeWeek(week) {
  if (week == null || week === '') return null;
  const parsed = Number.parseInt(String(week), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeSlug(slug) {
  if (typeof slug !== 'string') return null;
  const value = slug.trim().toLowerCase();
  return value || null;
}

function decodeSegment(segment) {
  if (typeof segment !== 'string') return '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseQueryValue(searchParams, key) {
  const value = searchParams.get(key);
  return value == null || value === '' ? null : value;
}

function buildQueryString(entries) {
  const searchParams = new URLSearchParams();
  entries.forEach(([key, value]) => {
    if (value == null || value === '') return;
    searchParams.set(key, String(value));
  });
  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : '';
}

export function slugifyRouteSegment(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’'\.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDefaultRouteForTab(tab) {
  switch (tab) {
    case 'statistics':
      return { ...DEFAULT_ROUTE, activeTab: 'statistics', statisticsView: 'browser' };
    case 'companion':
      return { ...DEFAULT_ROUTE, activeTab: 'companion', companionView: 'roster' };
    case 'trade':
      return { ...DEFAULT_ROUTE, activeTab: 'trade', tradeView: 'agent' };
    case 'predictions':
    default:
      return { ...DEFAULT_ROUTE, activeTab: 'predictions', seasonView: 'predictions' };
  }
}

export function normalizeAppRoute(route = {}) {
  const activeTab = route.activeTab ?? DEFAULT_ROUTE.activeTab;

  if (activeTab === 'statistics') {
    const statisticsView = STATISTICS_VIEWS.has(route.statisticsView)
      ? route.statisticsView
      : DEFAULT_ROUTE.statisticsView;
    const statisticsTeamId = normalizeTeamId(route.statisticsTeamId);
    const statisticsPlayerId = normalizePlayerId(route.statisticsPlayerId);
    const statisticsPlayerSlug = sanitizeSlug(route.statisticsPlayerSlug);

    if (statisticsView === 'player' && statisticsPlayerId) {
      return {
        ...DEFAULT_ROUTE,
        activeTab: 'statistics',
        statisticsView: 'player',
        statisticsPlayerId,
        statisticsPlayerSlug,
      };
    }

    if (statisticsView === 'team' && statisticsTeamId) {
      return {
        ...DEFAULT_ROUTE,
        activeTab: 'statistics',
        statisticsView: 'team',
        statisticsTeamId,
      };
    }

    return { ...DEFAULT_ROUTE, activeTab: 'statistics', statisticsView: 'browser' };
  }

  if (activeTab === 'companion') {
    const companionView = normalizeCompanionView(route.companionView);
    const normalized = {
      ...DEFAULT_ROUTE,
      activeTab: 'companion',
      companionView,
    };

    if (companionView === 'rankings') {
      normalized.rankingsPosition = normalizePosition(route.rankingsPosition);
    }

    if (companionView === 'waiver') {
      normalized.waiverPosition = normalizePosition(route.waiverPosition);
    }

    if (companionView === 'matchup') {
      normalized.matchupWeek = normalizeWeek(route.matchupWeek);
      normalized.matchupPlayerId = normalizePlayerId(route.matchupPlayerId);
    }

    if (companionView === 'league') {
      normalized.leagueSubview = normalizeLowerToken(route.leagueSubview, new Set(['roster', 'picks']), 'roster');
      normalized.leagueRosterId = normalizePlayerId(route.leagueRosterId);
    }

    if (companionView === 'defense') {
      normalized.heatmapViewMode = normalizeLowerToken(route.heatmapViewMode, new Set(['offense', 'defense']), 'offense');
      normalized.heatmapPosition = normalizePosition(route.heatmapPosition);
      normalized.heatmapDefensePosition = normalizePosition(route.heatmapDefensePosition);
      normalized.heatmapStatMode = normalizeLowerToken(route.heatmapStatMode, new Set(['pts', 'rec_yd', 'rush_yd', 'game_score', 'vegas_odds']), 'pts');
      normalized.heatmapDefenseStatMode = normalizeLowerToken(route.heatmapDefenseStatMode, new Set(['pts', 'idp_sack', 'idp_int', 'idp_ff', 'idp_tkl_loss', 'idp_pd', 'idp_qbhit', 'idp_def_td']), 'pts');
      normalized.heatmapScope = normalizeLowerToken(route.heatmapScope, new Set(['overall', 'week', 'team']), 'overall');
      normalized.heatmapLocation = normalizeLowerToken(route.heatmapLocation, new Set(['all', 'home', 'away']), 'all');
      normalized.heatmapSortKey = normalizeHeatmapSortKey(route.heatmapSortKey) ?? 'avg';
      normalized.heatmapSortDir = normalizeLowerToken(route.heatmapSortDir, new Set(['asc', 'desc']), 'desc');
      normalized.heatmapTeamSort = normalizeLowerToken(route.heatmapTeamSort, new Set(['alpha', 'conf', 'division']), 'alpha');
      normalized.heatmapUseTeamColors = normalizeBooleanFlag(route.heatmapUseTeamColors) ?? '0';
      normalized.heatmapVegasView = normalizeLowerToken(route.heatmapVegasView, new Set(['spread', 'ou']), 'spread');
    }

    return normalized;
  }

  if (activeTab === 'trade') {
    const tradeView = TRADE_VIEWS.has(route.tradeView)
      ? route.tradeView
      : DEFAULT_ROUTE.tradeView;
    return {
      ...DEFAULT_ROUTE,
      activeTab: 'trade',
      tradeView,
      tradePlayerId: normalizePlayerId(route.tradePlayerId),
      tradeSide: route.tradeSide === 'get' ? 'get' : route.tradeSide === 'give' ? 'give' : null,
      tradePartnerRosterId: normalizePlayerId(route.tradePartnerRosterId),
      tradeOtherPlayerId: normalizePlayerId(route.tradeOtherPlayerId),
    };
  }

  const seasonView = PREDICTIONS_VIEWS.has(route.seasonView)
    ? route.seasonView
    : DEFAULT_ROUTE.seasonView;
  const predictionsTeamId = normalizeTeamId(route.predictionsTeamId);
  return { ...DEFAULT_ROUTE, activeTab: 'predictions', seasonView, predictionsTeamId };
}

export function parseAppRoute(pathname = '/', search = '') {
  const segments = pathname.split('/').filter(Boolean).map(decodeSegment);
  const [section, subview] = segments;
  const searchParams = new URLSearchParams(search || '');

  switch (section) {
    case 'statistics': {
      const [, statisticsSubview, statisticsParam, statisticsSlug] = segments;
      if (statisticsSubview === 'team') {
        return normalizeAppRoute({
          activeTab: 'statistics',
          statisticsView: 'team',
          statisticsTeamId: statisticsParam,
        });
      }
      if (statisticsSubview === 'player') {
        return normalizeAppRoute({
          activeTab: 'statistics',
          statisticsView: 'player',
          statisticsPlayerId: statisticsParam,
          statisticsPlayerSlug: statisticsSlug,
        });
      }
      return normalizeAppRoute({ activeTab: 'statistics', statisticsView: 'browser' });
    }
    case 'companion':
      return normalizeAppRoute({
        activeTab: 'companion',
        companionView: subview,
        rankingsPosition: parseQueryValue(searchParams, 'pos'),
        waiverPosition: parseQueryValue(searchParams, 'position'),
        matchupWeek: parseQueryValue(searchParams, 'week'),
        matchupPlayerId: parseQueryValue(searchParams, 'player'),
        leagueSubview: parseQueryValue(searchParams, 'sub'),
        leagueRosterId: parseQueryValue(searchParams, 'team'),
        heatmapViewMode: parseQueryValue(searchParams, 'mode'),
        heatmapPosition: parseQueryValue(searchParams, 'pos'),
        heatmapDefensePosition: parseQueryValue(searchParams, 'defPos'),
        heatmapStatMode: parseQueryValue(searchParams, 'stat'),
        heatmapDefenseStatMode: parseQueryValue(searchParams, 'defStat'),
        heatmapScope: parseQueryValue(searchParams, 'scope'),
        heatmapLocation: parseQueryValue(searchParams, 'loc'),
        heatmapSortKey: parseQueryValue(searchParams, 'sort'),
        heatmapSortDir: parseQueryValue(searchParams, 'dir'),
        heatmapTeamSort: parseQueryValue(searchParams, 'teams'),
        heatmapUseTeamColors: parseQueryValue(searchParams, 'colors'),
        heatmapVegasView: parseQueryValue(searchParams, 'odds'),
      });
    case 'trade':
      return normalizeAppRoute({
        activeTab: 'trade',
        tradeView: subview,
        tradePlayerId: parseQueryValue(searchParams, 'player'),
        tradeSide: parseQueryValue(searchParams, 'side'),
        tradePartnerRosterId: parseQueryValue(searchParams, 'partner'),
        tradeOtherPlayerId: parseQueryValue(searchParams, 'other'),
      });
    case 'predictions': {
      const [, predictionsSubview, predictionsParam] = segments;
      if (predictionsSubview === 'team') {
        return normalizeAppRoute({
          activeTab: 'predictions',
          seasonView: 'predictions',
          predictionsTeamId: predictionsParam,
        });
      }
      return normalizeAppRoute({ activeTab: 'predictions', seasonView: predictionsSubview ?? 'predictions' });
    }
    default:
      return normalizeAppRoute(DEFAULT_ROUTE);
  }
}

export function buildAppPath(route) {
  const normalized = normalizeAppRoute(route);

  switch (normalized.activeTab) {
    case 'statistics':
      if (normalized.statisticsView === 'team' && normalized.statisticsTeamId) {
        return `/statistics/team/${encodeURIComponent(normalized.statisticsTeamId.toLowerCase())}`;
      }
      if (normalized.statisticsView === 'player' && normalized.statisticsPlayerId) {
        const slug = normalized.statisticsPlayerSlug || 'player';
        return `/statistics/player/${encodeURIComponent(normalized.statisticsPlayerId)}/${encodeURIComponent(slug)}`;
      }
      return '/statistics';
    case 'companion': {
      const basePath = `/companion/${normalized.companionView === 'defense' ? 'heatmap' : normalized.companionView}`;
      if (normalized.companionView === 'rankings') {
        return `${basePath}${buildQueryString([
          ['pos', normalized.rankingsPosition],
        ])}`;
      }
      if (normalized.companionView === 'waiver') {
        return `${basePath}${buildQueryString([
          ['position', normalized.waiverPosition],
        ])}`;
      }
      if (normalized.companionView === 'matchup') {
        return `${basePath}${buildQueryString([
          ['week', normalized.matchupWeek],
          ['player', normalized.matchupPlayerId],
        ])}`;
      }
      if (normalized.companionView === 'league') {
        return `${basePath}${buildQueryString([
          ['sub', normalized.leagueSubview !== 'roster' ? normalized.leagueSubview : null],
          ['team', normalized.leagueRosterId],
        ])}`;
      }
      if (normalized.companionView === 'defense') {
        return `${basePath}${buildQueryString([
          ['mode', normalized.heatmapViewMode !== 'offense' ? normalized.heatmapViewMode : null],
          ['pos', normalized.heatmapPosition],
          ['defPos', normalized.heatmapDefensePosition],
          ['stat', normalized.heatmapStatMode !== 'pts' ? normalized.heatmapStatMode : null],
          ['defStat', normalized.heatmapDefenseStatMode !== 'pts' ? normalized.heatmapDefenseStatMode : null],
          ['scope', normalized.heatmapScope !== 'overall' ? normalized.heatmapScope : null],
          ['loc', normalized.heatmapLocation !== 'all' ? normalized.heatmapLocation : null],
          ['sort', normalized.heatmapSortKey !== 'avg' ? normalized.heatmapSortKey : null],
          ['dir', normalized.heatmapSortDir !== 'desc' ? normalized.heatmapSortDir : null],
          ['teams', normalized.heatmapTeamSort !== 'alpha' ? normalized.heatmapTeamSort : null],
          ['colors', normalized.heatmapUseTeamColors !== '0' ? normalized.heatmapUseTeamColors : null],
          ['odds', normalized.heatmapVegasView !== 'spread' ? normalized.heatmapVegasView : null],
        ])}`;
      }
      return basePath;
    }
    case 'trade':
      return `/trade/${normalized.tradeView}${buildQueryString([
        ['player', normalized.tradePlayerId],
        ['side', normalized.tradeSide],
        ['partner', normalized.tradePartnerRosterId],
        ['other', normalized.tradeOtherPlayerId],
      ])}`;
    case 'predictions':
    default:
      if (normalized.predictionsTeamId) {
        return `/predictions/team/${encodeURIComponent(normalized.predictionsTeamId.toLowerCase())}`;
      }
      return normalized.seasonView === 'predictions'
        ? '/predictions'
        : `/predictions/${normalized.seasonView}`;
  }
}

export function isSameAppRoute(a, b) {
  const left = normalizeAppRoute(a);
  const right = normalizeAppRoute(b);

  return left.activeTab === right.activeTab
    && left.seasonView === right.seasonView
    && left.statisticsView === right.statisticsView
    && left.statisticsTeamId === right.statisticsTeamId
    && left.statisticsPlayerId === right.statisticsPlayerId
    && left.statisticsPlayerSlug === right.statisticsPlayerSlug
    && left.companionView === right.companionView
    && left.rankingsPosition === right.rankingsPosition
    && left.waiverPosition === right.waiverPosition
    && left.matchupWeek === right.matchupWeek
    && left.matchupPlayerId === right.matchupPlayerId
    && left.leagueSubview === right.leagueSubview
    && left.leagueRosterId === right.leagueRosterId
    && left.heatmapViewMode === right.heatmapViewMode
    && left.heatmapPosition === right.heatmapPosition
    && left.heatmapDefensePosition === right.heatmapDefensePosition
    && left.heatmapStatMode === right.heatmapStatMode
    && left.heatmapDefenseStatMode === right.heatmapDefenseStatMode
    && left.heatmapScope === right.heatmapScope
    && left.heatmapLocation === right.heatmapLocation
    && left.heatmapSortKey === right.heatmapSortKey
    && left.heatmapSortDir === right.heatmapSortDir
    && left.heatmapTeamSort === right.heatmapTeamSort
    && left.heatmapUseTeamColors === right.heatmapUseTeamColors
    && left.heatmapVegasView === right.heatmapVegasView
    && left.tradeView === right.tradeView
    && left.tradePlayerId === right.tradePlayerId
    && left.tradeSide === right.tradeSide
    && left.tradePartnerRosterId === right.tradePartnerRosterId
    && left.tradeOtherPlayerId === right.tradeOtherPlayerId
    && left.predictionsTeamId === right.predictionsTeamId;
}
