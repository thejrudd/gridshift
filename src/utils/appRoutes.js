// Draft window — Scout becomes the landing tab while the 2026 NFL Draft is live.
// Mirrors DRAFT_SESSION_WINDOWS_2026 in src/components/scout/ScoutTab.jsx; kept in
// sync deliberately so the routing module stays free of component-side imports.
const DRAFT_LANDING_START = Date.parse('2026-04-23T20:00:00-04:00');
const DRAFT_LANDING_END = Date.parse('2026-04-25T19:00:00-04:00');

function isDraftLandingWindow(now = Date.now()) {
  if (!Number.isFinite(DRAFT_LANDING_START) || !Number.isFinite(DRAFT_LANDING_END)) return false;
  return now >= DRAFT_LANDING_START && now <= DRAFT_LANDING_END;
}

function getDefaultActiveTab() {
  return isDraftLandingWindow() ? 'scout' : 'companion';
}

const PREDICTIONS_VIEWS = new Set(['predictions', 'standings', 'playoffs']);
const COMPANION_VIEWS = new Set(['roster', 'rankings', 'matchup', 'waiver', 'league', 'heatmap', 'defense', 'scoring']);
const TRADE_VIEWS = new Set(['agent', 'intelligence', 'upgrade']);
const STATISTICS_VIEWS = new Set(['browser', 'team', 'player', 'schedule', 'standings', 'game']);
const STATISTICS_MODES = new Set(['game', 'fantasy', 'visual']);
const STATISTICS_SCHEDULE_MODES = new Set(['week', 'team']);
const STATISTICS_SCHEDULE_FILTERS = new Set(['international', 'primetime', 'holiday']);
const SCOUT_VIEWS = new Set(['prospects', 'picks', 'results']);
const DRAFT_VIEWS = new Set(['war-room', 'draft-order', 'gauntlet', 'tiers-runs']);

function normalizeCompanionView(view) {
  return COMPANION_VIEWS.has(view) ? view : DEFAULT_ROUTE.companionView;
}

const DEFAULT_ROUTE = {
  // First-load tab is dynamic: Scout while the 2026 NFL Draft is live, Companion otherwise.
  // All other sections still resolve normally via their own paths.
  get activeTab() { return getDefaultActiveTab(); },
  seasonView: 'predictions',
  predictionsTeamId: null,
  statisticsView: 'browser',
  statisticsTeamId: null,
  statisticsPlayerId: null,
  statisticsPlayerSlug: null,
  statisticsMode: 'game',
  statisticsGameId: null,
  statisticsScheduleMode: null,
  statisticsScheduleWeek: null,
  statisticsScheduleTeamId: null,
  statisticsScheduleFilter: null,
  companionView: 'roster',
  rankingsPosition: null,
  rankingsRosterId: null,
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
  defenseMode: null,
  defensePosition: null,
  defenseStat: null,
  defenseSort: null,
  defenseDir: null,
  defenseQuery: null,
  tradeView: 'agent',
  tradePlayerId: null,
  tradeSide: null,
  tradePartnerRosterId: null,
  tradeOtherPlayerId: null,
  scoutView: 'prospects',
  draftView: 'war-room',
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

function normalizeStatisticsMode(mode) {
  if (typeof mode === 'string' && mode.trim().toLowerCase() === 'hybrid') return 'fantasy';
  const value = normalizeLowerToken(mode, STATISTICS_MODES, 'game');
  return value ?? 'game';
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
    .replace(/[’'.]/g, '')
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
    case 'scout':
      return { ...DEFAULT_ROUTE, activeTab: 'scout' };
    case 'draft':
      return { ...DEFAULT_ROUTE, activeTab: 'draft', draftView: 'war-room' };
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
    const statisticsMode = normalizeStatisticsMode(route.statisticsMode);
    const statisticsGameId = normalizePlayerId(route.statisticsGameId);
    const legacyScheduleFilter = normalizeLowerToken(route.statisticsScheduleMode, STATISTICS_SCHEDULE_FILTERS);
    const explicitScheduleFilter = normalizeLowerToken(route.statisticsScheduleFilter, STATISTICS_SCHEDULE_FILTERS);
    const statisticsScheduleMode = normalizeLowerToken(route.statisticsScheduleMode, STATISTICS_SCHEDULE_MODES)
      ?? (legacyScheduleFilter || explicitScheduleFilter ? 'week' : null);
    const statisticsScheduleWeek = normalizeWeek(route.statisticsScheduleWeek);
    const statisticsScheduleTeamId = normalizeTeamId(route.statisticsScheduleTeamId);
    const statisticsScheduleFilter = explicitScheduleFilter ?? legacyScheduleFilter;

    if (statisticsView === 'schedule') {
      return {
        ...DEFAULT_ROUTE,
        activeTab: 'statistics',
        statisticsView: 'schedule',
        statisticsScheduleMode,
        statisticsScheduleWeek,
        statisticsScheduleTeamId,
        statisticsScheduleFilter,
      };
    }

    if (statisticsView === 'standings') {
      return {
        ...DEFAULT_ROUTE,
        activeTab: 'statistics',
        statisticsView: 'standings',
      };
    }

    if (statisticsView === 'game' && statisticsGameId) {
      return {
        ...DEFAULT_ROUTE,
        activeTab: 'statistics',
        statisticsView: 'game',
        statisticsGameId,
      };
    }

    if (statisticsView === 'player' && statisticsPlayerId) {
      return {
        ...DEFAULT_ROUTE,
        activeTab: 'statistics',
        statisticsView: 'player',
        statisticsPlayerId,
        statisticsPlayerSlug,
        statisticsMode,
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
      normalized.rankingsRosterId = normalizePlayerId(route.rankingsRosterId);
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

    if (companionView === 'heatmap') {
      normalized.heatmapViewMode = normalizeLowerToken(route.heatmapViewMode, new Set(['offense', 'defense']), 'offense');
      normalized.heatmapPosition = normalizePosition(route.heatmapPosition);
      normalized.heatmapDefensePosition = normalizePosition(route.heatmapDefensePosition);
      normalized.heatmapStatMode = normalizeLowerToken(route.heatmapStatMode, new Set(['pts', 'rec_yd', 'rush_yd', 'game_score', 'vegas_odds']), 'pts');
      normalized.heatmapDefenseStatMode = normalizeLowerToken(route.heatmapDefenseStatMode, new Set(['pts', 'sack', 'int', 'def_td', 'safe', 'tkl_loss', 'qb_hit', 'idp_sack', 'idp_int', 'idp_ff', 'idp_tkl_loss', 'idp_pd', 'idp_qbhit', 'idp_def_td']), 'pts');
      normalized.heatmapScope = normalizeLowerToken(route.heatmapScope, new Set(['overall', 'week', 'team']), 'overall');
      normalized.heatmapLocation = normalizeLowerToken(route.heatmapLocation, new Set(['all', 'home', 'away']), 'all');
      normalized.heatmapSortKey = normalizeHeatmapSortKey(route.heatmapSortKey) ?? 'avg';
      normalized.heatmapSortDir = normalizeLowerToken(route.heatmapSortDir, new Set(['asc', 'desc']), 'desc');
      normalized.heatmapTeamSort = normalizeLowerToken(route.heatmapTeamSort, new Set(['alpha', 'conf', 'division']), 'alpha');
      normalized.heatmapUseTeamColors = normalizeBooleanFlag(route.heatmapUseTeamColors) ?? '0';
      normalized.heatmapVegasView = normalizeLowerToken(route.heatmapVegasView, new Set(['spread', 'ou']), 'spread');
    }

    if (companionView === 'defense') {
      const defensePosition = normalizePosition(route.defensePosition) ?? 'QB';
      const defenseStatsByPosition = {
        QB: new Set(['pass_yd', 'pass_td', 'rush_yd', 'rush_td']),
        RB: new Set(['rush_att', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td']),
        WR: new Set(['rec', 'rec_yd', 'rec_td', 'rush_yd', 'rush_td']),
        TE: new Set(['rec', 'rec_yd', 'rec_td', 'rush_yd', 'rush_td']),
      };
      const normalizedDefensePosition = ['QB', 'RB', 'WR', 'TE'].includes(defensePosition) ? defensePosition : 'QB';
      const defaultDefenseStatByPosition = {
        QB: 'pass_yd',
        RB: 'rush_att',
        WR: 'rec',
        TE: 'rec',
      };
      const defaultDefenseStat = defaultDefenseStatByPosition[normalizedDefensePosition] ?? 'pass_yd';
      normalized.defenseMode = normalizeLowerToken(route.defenseMode, new Set(['stats', 'fantasy']), 'stats');
      normalized.defensePosition = normalizedDefensePosition;
      normalized.defenseStat = normalizeLowerToken(route.defenseStat, defenseStatsByPosition[normalizedDefensePosition], defaultDefenseStat);
      normalized.defenseSort = normalizeLowerToken(route.defenseSort, new Set(['total', 'avg', 'team']), 'total');
      normalized.defenseDir = normalizeLowerToken(route.defenseDir, new Set(['asc', 'desc']), 'desc');
      normalized.defenseQuery = typeof route.defenseQuery === 'string' ? route.defenseQuery.trim() || null : null;
    }

    return normalized;
  }

  if (activeTab === 'scout') {
    return {
      ...DEFAULT_ROUTE,
      activeTab: 'scout',
      scoutView: normalizeLowerToken(route.scoutView, SCOUT_VIEWS, DEFAULT_ROUTE.scoutView),
    };
  }

  if (activeTab === 'draft') {
    return {
      ...DEFAULT_ROUTE,
      activeTab: 'draft',
      draftView: normalizeLowerToken(route.draftView, DRAFT_VIEWS, DEFAULT_ROUTE.draftView),
    };
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
          statisticsMode: parseQueryValue(searchParams, 'mode'),
        });
      }
      if (statisticsSubview === 'schedule') {
        return normalizeAppRoute({
          activeTab: 'statistics',
          statisticsView: 'schedule',
          statisticsScheduleMode: parseQueryValue(searchParams, 'mode'),
          statisticsScheduleWeek: parseQueryValue(searchParams, 'week'),
          statisticsScheduleTeamId: parseQueryValue(searchParams, 'team'),
          statisticsScheduleFilter: parseQueryValue(searchParams, 'filter'),
        });
      }
      if (statisticsSubview === 'standings') {
        return normalizeAppRoute({
          activeTab: 'statistics',
          statisticsView: 'standings',
        });
      }
      if (statisticsSubview === 'game') {
        return normalizeAppRoute({
          activeTab: 'statistics',
          statisticsView: 'game',
          statisticsGameId: statisticsParam,
        });
      }
      return normalizeAppRoute({ activeTab: 'statistics', statisticsView: 'browser' });
    }
    case 'companion':
      if (subview === 'draft') {
        return normalizeAppRoute({ activeTab: 'draft', draftView: 'war-room' });
      }
      return normalizeAppRoute({
        activeTab: 'companion',
        companionView: subview,
        rankingsPosition: parseQueryValue(searchParams, 'pos'),
        rankingsRosterId: parseQueryValue(searchParams, 'team'),
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
        defenseMode: parseQueryValue(searchParams, 'mode'),
        defensePosition: parseQueryValue(searchParams, 'pos'),
        defenseStat: parseQueryValue(searchParams, 'stat'),
        defenseSort: parseQueryValue(searchParams, 'sort'),
        defenseDir: parseQueryValue(searchParams, 'dir'),
        defenseQuery: parseQueryValue(searchParams, 'q'),
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
    case 'scout':
      return normalizeAppRoute({ activeTab: 'scout', scoutView: subview });
    case 'draft':
      return normalizeAppRoute({ activeTab: 'draft', draftView: subview });
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
      if (normalized.statisticsView === 'schedule') {
        return `/statistics/schedule${buildQueryString([
          ['mode', normalized.statisticsScheduleMode],
          ['week', normalized.statisticsScheduleMode === 'week' ? normalized.statisticsScheduleWeek : null],
          ['team', normalized.statisticsScheduleMode === 'team' ? normalized.statisticsScheduleTeamId : null],
          ['filter', normalized.statisticsScheduleFilter],
        ])}`;
      }
      if (normalized.statisticsView === 'standings') {
        return '/statistics/standings';
      }
      if (normalized.statisticsView === 'game' && normalized.statisticsGameId) {
        return `/statistics/game/${encodeURIComponent(normalized.statisticsGameId)}`;
      }
      if (normalized.statisticsView === 'team' && normalized.statisticsTeamId) {
        return `/statistics/team/${encodeURIComponent(normalized.statisticsTeamId.toLowerCase())}`;
      }
      if (normalized.statisticsView === 'player' && normalized.statisticsPlayerId) {
        const slug = normalized.statisticsPlayerSlug || 'player';
        return `/statistics/player/${encodeURIComponent(normalized.statisticsPlayerId)}/${encodeURIComponent(slug)}${buildQueryString([
          ['mode', normalized.statisticsMode !== 'game' ? normalized.statisticsMode : null],
        ])}`;
      }
      return '/statistics';
    case 'companion': {
      const basePath = `/companion/${normalized.companionView}`;
      if (normalized.companionView === 'rankings') {
        return `${basePath}${buildQueryString([
          ['pos', normalized.rankingsPosition],
          ['team', normalized.rankingsRosterId],
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
      if (normalized.companionView === 'heatmap') {
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
      if (normalized.companionView === 'defense') {
        const defaultDefenseStatByPosition = {
          QB: 'pass_yd',
          RB: 'rush_att',
          WR: 'rec',
          TE: 'rec',
        };
        const defaultDefenseStat = defaultDefenseStatByPosition[normalized.defensePosition] ?? 'pass_yd';
        return `${basePath}${buildQueryString([
          ['mode', normalized.defenseMode !== 'stats' ? normalized.defenseMode : null],
          ['pos', normalized.defensePosition !== 'QB' ? normalized.defensePosition : null],
          ['stat', normalized.defenseStat !== defaultDefenseStat ? normalized.defenseStat : null],
          ['sort', normalized.defenseSort !== 'total' ? normalized.defenseSort : null],
          ['dir', normalized.defenseDir !== 'desc' ? normalized.defenseDir : null],
          ['q', normalized.defenseQuery],
        ])}`;
      }
      return basePath;
    }
    case 'scout':
      return normalized.scoutView === 'prospects'
        ? '/scout'
        : `/scout/${normalized.scoutView}`;
    case 'draft':
      return normalized.draftView === 'war-room'
        ? '/draft'
        : `/draft/${normalized.draftView}`;
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
    && left.statisticsMode === right.statisticsMode
    && left.statisticsGameId === right.statisticsGameId
    && left.statisticsScheduleMode === right.statisticsScheduleMode
    && left.statisticsScheduleWeek === right.statisticsScheduleWeek
    && left.statisticsScheduleTeamId === right.statisticsScheduleTeamId
    && left.statisticsScheduleFilter === right.statisticsScheduleFilter
    && left.companionView === right.companionView
    && left.rankingsPosition === right.rankingsPosition
    && left.rankingsRosterId === right.rankingsRosterId
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
    && left.defenseMode === right.defenseMode
    && left.defensePosition === right.defensePosition
    && left.defenseStat === right.defenseStat
    && left.defenseSort === right.defenseSort
    && left.defenseDir === right.defenseDir
    && left.defenseQuery === right.defenseQuery
    && left.tradeView === right.tradeView
    && left.tradePlayerId === right.tradePlayerId
    && left.tradeSide === right.tradeSide
    && left.tradePartnerRosterId === right.tradePartnerRosterId
    && left.tradeOtherPlayerId === right.tradeOtherPlayerId
    && left.scoutView === right.scoutView
    && left.draftView === right.draftView
    && left.predictionsTeamId === right.predictionsTeamId;
}
