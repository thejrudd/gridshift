import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import {
  getUserByUsername,
  getLeaguesForUser,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getAllPlayers,
  getAllWeeklyStats,
  aggregateSeasonStats,
  getMatchups,
  getTradedPicks,
  getLeagueDrafts,
} from '../api/sleeperApi';
import { clearEspnSession, getEspnLeague, getEspnLeagues, setEspnSession } from '../api/espnFantasyApi';
import { fetchSeasonSchedule, fetchPlayerGameTeamMap, fetchRoster, fetchEventScoringPlays, fetchTeamDefenseGameLog } from '../utils/playerApi';
import { DEFAULT_SCORING, getEspnDstScoringIndexAudit, getEspnScoringImportAudit, importLeagueScoring, normalizeScoringProfile } from '../utils/scoringEngine';
import { normalizeEspnLeaguePayload } from '../utils/espnFantasyAdapter';
import {
  applyEspnBigPlayBonusesToWeeklyStats,
  getEspnScoringPlayBigPlayBonuses,
  hasEspnBigPlayTouchdownScoring,
} from '../utils/espnBigPlayBonuses';
import { buildEspnDstResidualDebugRows, reconcileFantasyScore } from '../utils/fantasyScoreDiagnostics';
import { clearPlayerCache, checkAndBustCacheIfNeeded } from '../utils/playerCache';

// Run once when this module first loads — wipes stale player cache if app version changed.
checkAndBustCacheIfNeeded();

const ESPN_SCORE_HELPER_VERSION = 'espn-score-debug-2026-05-20-v9';

const SleeperLeagueContext = createContext(null);
const SleeperStatsContext = createContext(null);
const SleeperStatsProgressContext = createContext(0);
const SleeperStatsEnhancingContext = createContext(false);

const STORAGE_KEY = 'sleeper_state_v1';
const LEAGUE_YEAR_START_MONTH = 2; // March, zero-based
const MIN_SLEEPER_SEASON = 2017;
const MIN_ESPN_SEASON = 2018;
const ESPN_HISTORY_SEASON_LIMIT = 6;
const ESPN_WEEKLY_STATS_MAX_WEEK = 18;

function getCurrentLeagueYear(date = new Date()) {
  return date.getMonth() >= LEAGUE_YEAR_START_MONTH ? date.getFullYear() : date.getFullYear() - 1;
}

function getSeasonRange() {
  const currentLeagueYear = getCurrentLeagueYear();
  return Array.from(
    { length: Math.max(1, currentLeagueYear - MIN_SLEEPER_SEASON + 1) },
    (_, index) => String(currentLeagueYear - index),
  );
}

export const AVAILABLE_SLEEPER_SEASONS = getSeasonRange();
const DEFAULT_SEASON = AVAILABLE_SLEEPER_SEASONS[0];

function getEspnSeasonOptions(anchorSeason = DEFAULT_SEASON) {
  const anchorYear = Number(anchorSeason);
  const latestYear = Math.max(
    getCurrentLeagueYear(),
    Number.isFinite(anchorYear) ? anchorYear : 0,
  );
  const earliestYear = Math.max(MIN_ESPN_SEASON, latestYear - ESPN_HISTORY_SEASON_LIMIT + 1);
  return Array.from(
    { length: latestYear - earliestYear + 1 },
    (_, index) => String(latestYear - index),
  );
}

function mergeSeasonOptions(...seasonGroups) {
  return [...new Set(seasonGroups.flat().map(String).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      // Reset season if the persisted value falls outside the supported Sleeper season window.
      if (state.season == null || AVAILABLE_SLEEPER_SEASONS.includes(String(state.season)) === false) state.season = DEFAULT_SEASON;
      if (!Array.isArray(state.availableSeasons)) state.availableSeasons = [];
      if (!state.leaguesBySeason || typeof state.leaguesBySeason !== 'object') state.leaguesBySeason = {};
      return state;
    }
  } catch { /* ignore */ }
  return null;
}

function savePersistedState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota */ }
}

function normalizeLeagueId(id) {
  return id == null ? null : String(id);
}

function getAllSeasonLeagues(leaguesBySeason) {
  return Object.values(leaguesBySeason ?? {}).flatMap((seasonLeagues) => seasonLeagues ?? []);
}

function buildLeagueLineageIds(startLeague, leaguesBySeason) {
  const ids = new Set();
  const queue = [];
  const addId = (id) => {
    const normalized = normalizeLeagueId(id);
    if (!normalized || ids.has(normalized)) return;
    ids.add(normalized);
    queue.push(normalized);
  };

  addId(startLeague?.league_id);
  addId(startLeague?.previous_league_id);

  const allLeagues = getAllSeasonLeagues(leaguesBySeason);
  while (queue.length > 0) {
    queue.shift();
    for (const item of allLeagues) {
      const leagueId = normalizeLeagueId(item?.league_id);
      const previousLeagueId = normalizeLeagueId(item?.previous_league_id);
      if (leagueId && ids.has(leagueId)) addId(previousLeagueId);
      if (previousLeagueId && ids.has(previousLeagueId)) addId(leagueId);
    }
  }

  return ids;
}

function isLeagueInLineage(candidateLeague, lineageIds) {
  const leagueId = normalizeLeagueId(candidateLeague?.league_id);
  const previousLeagueId = normalizeLeagueId(candidateLeague?.previous_league_id);
  return (leagueId && lineageIds.has(leagueId)) || (previousLeagueId && lineageIds.has(previousLeagueId));
}

function findLinkedLeagueForSeason(currentLeague, targetLeagues, leaguesBySeason) {
  if (!currentLeague || !targetLeagues?.length) return null;
  const lineageIds = buildLeagueLineageIds(currentLeague, leaguesBySeason);
  return targetLeagues.find((item) => isLeagueInLineage(item, lineageIds)) ?? null;
}

function mergeWeeklyStatsMaps(target = {}, source = {}) {
  const next = { ...(target ?? {}) };
  for (const [playerId, rows] of Object.entries(source ?? {})) {
    const byWeek = new Map(
      (next[playerId] ?? [])
        .filter((row) => Number.isFinite(Number(row?.week)))
        .map((row) => [Number(row.week), row]),
    );

    for (const row of rows ?? []) {
      const week = Number(row?.week);
      if (!Number.isFinite(week)) continue;
      byWeek.set(week, { ...(byWeek.get(week) ?? {}), ...row });
    }

    next[playerId] = [...byWeek.values()].sort((left, right) => Number(left.week) - Number(right.week));
  }
  return next;
}

function buildEspnPlayerPoolFilter(offset = 0) {
  return {
    players: {
      filterStatus: {
        value: ['FREEAGENT', 'WAIVERS'],
      },
      limit: 1000,
      offset,
      sortPercOwned: {
        sortAsc: false,
        sortPriority: 1,
      },
    },
  };
}
	
export function FantasyProvider({ children }) {
  const persisted = loadPersistedState();

  // Connection state
  const [platform, setPlatform] = useState(persisted?.platform ?? persisted?.league?.platform ?? 'sleeper');
  const [sleeperUser, setSleeperUser] = useState(persisted?.sleeperUser ?? null);
  const [leagues, setLeagues] = useState(persisted?.leagues ?? []);
  const [selectedLeagueId, setSelectedLeagueId] = useState(persisted?.selectedLeagueId ?? null);
  const [league, setLeague] = useState(persisted?.league ?? null);
  const [rosters, setRosters] = useState(persisted?.rosters ?? []);
  const [leagueUsers, setLeagueUsers] = useState(persisted?.leagueUsers ?? []);
  const [season, setSeason] = useState(persisted?.season ?? DEFAULT_SEASON);
  const [availableSeasons, setAvailableSeasons] = useState(persisted?.availableSeasons ?? []);
  const [leaguesBySeason, setLeaguesBySeason] = useState(persisted?.leaguesBySeason ?? {});

  // Scoring — always re-derive from persisted league on startup so newly
  // supported scoring fields (bonus_rec_te, bonus_rec_rb, etc.) are picked
  // up without requiring the user to manually re-select their league.
  const [scoringSettings, setScoringSettings] = useState(() => {
    if (persisted?.league?.scoring_settings?.provider === 'espn') {
      return normalizeScoringProfile(persisted.league.scoring_settings, 'espn');
    }
    if (persisted?.scoringSettings?.provider === 'espn') {
      return normalizeScoringProfile(persisted.scoringSettings, 'espn');
    }
    if (persisted?.league?.scoring_settings) {
      const imported = importLeagueScoring(persisted.league.scoring_settings);
      return { ...DEFAULT_SCORING, ...imported };
    }
    return persisted?.scoringSettings ?? DEFAULT_SCORING;
  });
  // Temporary scoring override — not persisted, always null on load.
  // { settings, leagueName, leagueId, season }
  const [scoringOverride, setScoringOverride] = useState(null);
  const [scoringOverridePaused, setScoringOverridePaused] = useState(false);
  const clearScoringOverride = useCallback(() => setScoringOverride(null), []);
  const activeScoringSettings = (scoringOverride && !scoringOverridePaused) ? scoringOverride.settings : scoringSettings;

  // Players DB
  const [players, setPlayers] = useState(null); // loaded on demand

  // Stats
  const [weeklyStats, setWeeklyStats] = useState(null); // { [playerId]: weekArray[] }
  const [seasonStats, setSeasonStats] = useState(null);  // { [playerId]: aggregated }
  const [scheduleMap, setScheduleMap] = useState(null);  // { [week]: { [teamAbbr]: { opp, home } } }
  const [espnMatchupsByWeek, setEspnMatchupsByWeek] = useState(persisted?.espnMatchupsByWeek ?? {});
  const [statsBySeason, setStatsBySeason] = useState({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsEnhancing, setStatsEnhancing] = useState(false);
  const [statsProgress, setStatsProgress] = useState(0);
  const [espnIdOverrides, setEspnIdOverrides] = useState({}); // sleeperId → espnId, for null-espn_id players resolved via Pass 2

  // UI state
  const [connectError, setConnectError] = useState(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const statsAbortRef = useRef(null);
  const statsLoadBySeasonRef = useRef(new Map());
  const qbOppSeasonRef = useRef(null); // tracks which season QB opp data has been merged
  const espnStatsRefreshKeyRef = useRef(null);
  const enhancementRunRef = useRef({
    token: 0,
    season: null,
    weeklyStats: null,
    players: null,
    scheduleMap: null,
  });
  const espnBigPlayRunRef = useRef({ token: 0, key: null, runningKey: null });
  const leagueUserById = useMemo(
    () => new Map((leagueUsers ?? []).map((user) => [user.user_id, user])),
    [leagueUsers],
  );

  const resetFantasyState = useCallback((nextPlatform = 'sleeper') => {
    setPlatform(nextPlatform);
    setSleeperUser(null);
    setLeagues([]);
    setSelectedLeagueId(null);
    setLeague(null);
    setRosters([]);
    setLeagueUsers([]);
    setAvailableSeasons([]);
    setLeaguesBySeason({});
    setScoringSettings(DEFAULT_SCORING);
    setScoringOverride(null);
    setScoringOverridePaused(false);
    setPlayers(null);
    setWeeklyStats(null);
    setSeasonStats(null);
    setScheduleMap(null);
    setEspnMatchupsByWeek({});
    setStatsBySeason({});
    setStatsEnhancing(false);
    statsAbortRef.current = false;
    statsLoadBySeasonRef.current.clear();
    qbOppSeasonRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    clearPlayerCache();
  }, []);

  // Persist key state to localStorage
  useEffect(() => {
    savePersistedState({
      platform,
      sleeperUser,
      leagues,
      selectedLeagueId,
      league,
      rosters,
      leagueUsers,
      season,
      availableSeasons,
      leaguesBySeason,
      scoringSettings,
      espnMatchupsByWeek,
    });
  }, [platform, sleeperUser, leagues, selectedLeagueId, league, rosters, leagueUsers, season, availableSeasons, leaguesBySeason, scoringSettings, espnMatchupsByWeek]);

  // ── Connection flow ─────────────────────────────────────────────────────────

  const discoverUserLeagueSeasons = useCallback(async (userId, preferredSeason = null) => {
    const seasonEntries = await Promise.all(
      AVAILABLE_SLEEPER_SEASONS.map(async (seasonKey) => {
        try {
          const seasonLeagues = await getLeaguesForUser(userId, seasonKey);
          return [seasonKey, seasonLeagues ?? []];
        } catch {
          return [seasonKey, []];
        }
      }),
    );

    const nextLeaguesBySeason = Object.fromEntries(seasonEntries);
    const nextAvailableSeasons = AVAILABLE_SLEEPER_SEASONS.filter((seasonKey) => (nextLeaguesBySeason[seasonKey]?.length ?? 0) > 0);
    const nextSeason =
      (preferredSeason && nextAvailableSeasons.includes(preferredSeason) ? preferredSeason : null)
      ?? nextAvailableSeasons[0]
      ?? DEFAULT_SEASON;

    setAvailableSeasons(nextAvailableSeasons);
    setLeaguesBySeason(nextLeaguesBySeason);
    setSeason(nextSeason);
    setLeagues(nextLeaguesBySeason[nextSeason] ?? []);

    return {
      leaguesBySeason: nextLeaguesBySeason,
      availableSeasons: nextAvailableSeasons,
      season: nextSeason,
    };
  }, []);

  const connect = useCallback(async (username) => {
    setConnectError(null);
    setConnectLoading(true);
    try {
      if (platform !== 'sleeper') {
        await clearEspnSession().catch(() => {});
        resetFantasyState('sleeper');
      }
      const user = await getUserByUsername(username.trim().toLowerCase());
      if (!user?.user_id) throw new Error('User not found. Check your Sleeper username.');
      setPlatform('sleeper');
      setSleeperUser(user);
      await discoverUserLeagueSeasons(user.user_id, season);

      return user;
    } catch (err) {
      setConnectError(err.message);
      throw err;
    } finally {
      setConnectLoading(false);
    }
  }, [discoverUserLeagueSeasons, platform, resetFantasyState, season]);

  const loadLeagueSelection = useCallback(async (leagueId) => {
    const [leagueData, rostersData, usersData] = await Promise.all([
      getLeague(leagueId),
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
    ]);

    setLeague(leagueData);
    setRosters(rostersData ?? []);
    setLeagueUsers(usersData ?? []);
    setSelectedLeagueId(leagueId);

    // Auto-import league scoring settings
    if (leagueData?.scoring_settings) {
      const imported = importLeagueScoring(leagueData.scoring_settings);
      setScoringSettings({ ...DEFAULT_SCORING, ...imported });
    }
  }, []);

  const applyEspnLeague = useCallback((normalized) => {
    espnBigPlayRunRef.current = { token: espnBigPlayRunRef.current.token + 1, key: null, runningKey: null };
    const nextAvailableSeasons = mergeSeasonOptions(
      getEspnSeasonOptions(normalized.season),
      normalized.availableSeasons ?? [],
    );
    setPlatform('espn');
    setSleeperUser(normalized.fantasyUser);
    setLeagues(normalized.leagues);
    setSelectedLeagueId(normalized.selectedLeagueId);
    setLeague(normalized.league);
    setRosters(normalized.rosters);
    setLeagueUsers(normalized.leagueUsers);
    setSeason(normalized.season);
    setAvailableSeasons(nextAvailableSeasons);
    setLeaguesBySeason(normalized.leaguesBySeason);
    setScoringSettings(normalized.scoringSettings);
    setPlayers(normalized.players);
    setWeeklyStats(normalized.weeklyStats);
    setSeasonStats(normalized.seasonStats);
    setScheduleMap(normalized.scheduleMap);
    setEspnMatchupsByWeek(normalized.matchupsByWeek);
    setStatsEnhancing(false);
    statsAbortRef.current = false;
    qbOppSeasonRef.current = null;
  }, []);

  const loadEspnLeagueSelection = useCallback(async (leagueId, leagueSeason = season, teamId = null) => {
    const payload = await getEspnLeague(leagueSeason, leagueId);
    const normalized = normalizeEspnLeaguePayload(payload, { season: leagueSeason, leagueId, teamId });
    applyEspnLeague(normalized);
    return normalized;
  }, [applyEspnLeague, season]);

  const connectEspn = useCallback(async ({ swid, espnS2, season: targetSeason = season, leagueId = null, teamId = null }) => {
    setConnectError(null);
    setConnectLoading(true);
    try {
      if (platform !== 'espn') resetFantasyState('espn');
      await setEspnSession({ swid, espnS2 });
      setPlatform('espn');
      setSleeperUser({
        user_id: 'espn:me',
        display_name: 'ESPN Session',
        username: 'espn',
        avatar: null,
        platform: 'espn',
      });
      setSeason(String(targetSeason));
      const discovery = await getEspnLeagues(targetSeason).catch((err) => ({
        leagues: [],
        source: 'manual-fallback',
        message: err.message,
      }));
      const discoveredLeagues = discovery.leagues ?? [];
      setLeagues(discoveredLeagues);
      setAvailableSeasons(getEspnSeasonOptions(targetSeason));
      setLeaguesBySeason({ [String(targetSeason)]: discoveredLeagues });

      if (leagueId) {
        return await loadEspnLeagueSelection(leagueId, String(targetSeason), teamId);
      }
      return discovery;
    } catch (err) {
      setConnectError(err.message);
      throw err;
    } finally {
      setConnectLoading(false);
    }
  }, [loadEspnLeagueSelection, platform, resetFantasyState, season]);

  const selectLeague = useCallback(async (leagueId) => {
    setConnectError(null);
    setConnectLoading(true);
    try {
      if (platform === 'espn') {
        const targetLeague = leagues.find((item) => normalizeLeagueId(item.league_id) === normalizeLeagueId(leagueId));
        await loadEspnLeagueSelection(leagueId, String(targetLeague?.season ?? season));
      } else {
        await loadLeagueSelection(leagueId);
      }
    } catch (err) {
      setConnectError(err.message);
      throw err;
    } finally {
      setConnectLoading(false);
    }
  }, [leagues, loadEspnLeagueSelection, loadLeagueSelection, platform, season]);

  const disconnect = useCallback(() => {
    if (platform === 'espn') void clearEspnSession().catch(() => {});
    resetFantasyState('sleeper');
  }, [platform, resetFantasyState]);

  const changeSeason = useCallback(async (newSeason) => {
    const targetSeason = String(newSeason);
    if (targetSeason === String(season)) return;

    setConnectError(null);

    if (platform === 'espn' && sleeperUser) {
      const leagueId = selectedLeagueId ?? league?.league_id ?? null;
      try {
        setConnectLoading(true);
        if (leagueId) {
          await loadEspnLeagueSelection(leagueId, targetSeason);
          return;
        }
        const discovery = await getEspnLeagues(targetSeason).catch(() => ({ leagues: [], source: 'manual-fallback' }));
        const discoveredLeagues = discovery.leagues ?? [];
        setSeason(targetSeason);
        setLeagues(discoveredLeagues);
        setAvailableSeasons((prev) => mergeSeasonOptions(prev, getEspnSeasonOptions(targetSeason), [targetSeason]));
        setLeaguesBySeason((prev) => ({ ...prev, [targetSeason]: discoveredLeagues }));
        setSelectedLeagueId(null);
        setLeague(null);
        setRosters([]);
        setLeagueUsers([]);
        setPlayers(null);
        setWeeklyStats(null);
        setSeasonStats(null);
        setScheduleMap(null);
        setEspnMatchupsByWeek({});
      } catch (err) {
        setConnectError(err.message ?? `Could not load ESPN ${targetSeason}.`);
      }
      finally {
        setConnectLoading(false);
      }
      return;
    }

    setSeason(targetSeason);
    setWeeklyStats(null);
    setSeasonStats(null);
    setStatsEnhancing(false);
    statsAbortRef.current = false; // allow reload on season change
    qbOppSeasonRef.current = null;

    if (sleeperUser) {
      try {
        const cachedLeagues = leaguesBySeason[targetSeason];
        if (cachedLeagues == null) setConnectLoading(true);
        const userLeagues = cachedLeagues ?? await getLeaguesForUser(sleeperUser.user_id, targetSeason);
        const nextLeaguesBySeason = cachedLeagues == null
          ? { ...leaguesBySeason, [targetSeason]: userLeagues ?? [] }
          : leaguesBySeason;
        if (cachedLeagues == null) {
          setLeaguesBySeason(nextLeaguesBySeason);
          if ((userLeagues?.length ?? 0) > 0) {
            setAvailableSeasons((prev) => (prev.includes(targetSeason) ? prev : [...prev, targetSeason].sort((a, b) => Number(b) - Number(a))));
          }
        }
        setLeagues(userLeagues ?? []);
        const linkedLeague = findLinkedLeagueForSeason(league, userLeagues ?? [], nextLeaguesBySeason);
        const stillExists = userLeagues?.find(l => normalizeLeagueId(l.league_id) === normalizeLeagueId(selectedLeagueId));
        const targetLeague = linkedLeague ?? stillExists;
        if (targetLeague) {
          await loadLeagueSelection(targetLeague.league_id);
        }
        if (!targetLeague) {
          setSelectedLeagueId(null);
          setLeague(null);
          setRosters([]);
          setLeagueUsers([]);
        }
      } catch { /* ignore */ }
      finally {
        setConnectLoading(false);
      }
    }
  }, [platform, sleeperUser, selectedLeagueId, leaguesBySeason, season, league, loadEspnLeagueSelection, loadLeagueSelection]);

  useEffect(() => {
    if (platform !== 'sleeper') return;
    if (!sleeperUser?.user_id || connectLoading) return;
    if (Object.keys(leaguesBySeason).length === AVAILABLE_SLEEPER_SEASONS.length) return;

    let cancelled = false;
    void (async () => {
      try {
        const discovered = await discoverUserLeagueSeasons(sleeperUser.user_id, season);
        if (cancelled) return;

        if (selectedLeagueId) {
          const stillExists = (discovered.leaguesBySeason[discovered.season] ?? []).some((item) => item.league_id === selectedLeagueId);
          if (!stillExists) {
            setSelectedLeagueId(null);
            setLeague(null);
            setRosters([]);
            setLeagueUsers([]);
          }
        }
      } catch {
        // Ignore background refresh failures and keep persisted state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [platform, sleeperUser, connectLoading, leaguesBySeason, season, selectedLeagueId, discoverUserLeagueSeasons]);

  // ── Player DB ───────────────────────────────────────────────────────────────

  const loadPlayers = useCallback(async () => {
    if (players) return players;
    if (platform === 'espn') return {};
    const data = await getAllPlayers();
    setPlayers(data);
    return data;
  }, [platform, players]);

  // ── Stats loading ───────────────────────────────────────────────────────────

  const loadSeasonStats = useCallback(async () => {
    if (platform === 'espn') {
      if (!selectedLeagueId || statsAbortRef.current) return;

      const refreshKey = `${selectedLeagueId}:${season}:full-weekly:${ESPN_SCORE_HELPER_VERSION}`;
      if (espnStatsRefreshKeyRef.current === refreshKey && weeklyStats && seasonStats) return;

      statsAbortRef.current = true;
      espnStatsRefreshKeyRef.current = refreshKey;
      setStatsLoading(true);
      setStatsProgress(0);
      try {
        const baseNormalized = await loadEspnLeagueSelection(selectedLeagueId, season);

        const weeks = Array.from(
          { length: ESPN_WEEKLY_STATS_MAX_WEEK },
          (_, index) => index + 1,
        );
        let completedWeeks = 0;
        const markWeekComplete = () => {
          completedWeeks += 1;
          setStatsProgress(Math.round((completedWeeks / weeks.length) * 100));
        };
        const [weeklyPayloads, playerPoolPayloads, nflSchedule] = await Promise.all([
          Promise.all(weeks.map(async (week) => {
            try {
              const payload = await getEspnLeague(season, selectedLeagueId, undefined, {
                scoringPeriodId: week,
                matchupPeriodId: week,
              });
              return normalizeEspnLeaguePayload(payload, { season, leagueId: selectedLeagueId, scoringPeriodId: week });
            } catch {
              return null;
            } finally {
              markWeekComplete();
            }
          })),
          Promise.all([0, 1000].map(async (offset) => {
            try {
              const payload = await getEspnLeague(season, selectedLeagueId, ['kona_player_info'], {
                fantasyFilter: buildEspnPlayerPoolFilter(offset),
              });
              return normalizeEspnLeaguePayload(payload, { season, leagueId: selectedLeagueId });
            } catch {
              return null;
            }
          })),
          fetchSeasonSchedule(season).catch(() => null),
        ]);

        let mergedWeeklyStats = baseNormalized.weeklyStats ?? {};
        let mergedPlayers = baseNormalized.players ?? {};
        for (const normalized of weeklyPayloads) {
          if (!normalized) continue;
          mergedPlayers = { ...mergedPlayers, ...(normalized.players ?? {}) };
          mergedWeeklyStats = mergeWeeklyStatsMaps(mergedWeeklyStats, normalized.weeklyStats ?? {});
        }
        const playerPoolSeasonStats = {};

        for (const normalized of playerPoolPayloads) {
          if (!normalized) continue;
          mergedPlayers = { ...mergedPlayers, ...(normalized.players ?? {}) };
          mergedWeeklyStats = mergeWeeklyStatsMaps(mergedWeeklyStats, normalized.weeklyStats ?? {});
          for (const [playerId, stats] of Object.entries(normalized.seasonStats ?? {})) {
            if (playerPoolSeasonStats[playerId]) continue;
            playerPoolSeasonStats[playerId] = stats;
          }
        }
        const aggregatedWeeklyStats = aggregateSeasonStats(mergedWeeklyStats);
        const mergedSeasonStats = {
          ...(baseNormalized.seasonStats ?? {}),
          ...playerPoolSeasonStats,
          ...aggregatedWeeklyStats,
        };
        const detectedMaxWeek = Math.max(
          0,
          ...Object.values(mergedWeeklyStats)
            .flatMap((rows) => rows ?? [])
            .map((row) => Number(row?.week))
            .filter((week) => Number.isFinite(week) && week > 0),
        );
        const mergedLeague = detectedMaxWeek > 0
          ? {
              ...baseNormalized.league,
              settings: {
                ...(baseNormalized.league?.settings ?? {}),
                matchup_periods: detectedMaxWeek,
                max_fantasy_scoring_period: detectedMaxWeek,
              },
            }
          : baseNormalized.league;

        setPlayers(mergedPlayers);
        setWeeklyStats(mergedWeeklyStats);
        setSeasonStats(mergedSeasonStats);
        if (mergedLeague) setLeague(mergedLeague);
        if (nflSchedule) setScheduleMap(nflSchedule);
      } finally {
        statsAbortRef.current = false;
        setStatsLoading(false);
      }
      return;
    }
    if (statsAbortRef.current) return; // guard against concurrent calls
    statsAbortRef.current = true;
    qbOppSeasonRef.current = null; // allow player team enhancement to re-run
    setStatsLoading(true);
    setStatsEnhancing(true);
    setStatsProgress(0);

    try {
      const [weekly, schedule] = await Promise.all([
        getAllWeeklyStats(season, 18, (week, total) => {
          setStatsProgress(Math.round((week / total) * 100));
        }),
        fetchSeasonSchedule(season).catch(() => null),
      ]);
      const nextPackage = {
        season: String(season),
        weeklyStats: weekly,
        seasonStats: aggregateSeasonStats(weekly),
        scheduleMap: schedule,
      };
      setWeeklyStats(weekly);
      setSeasonStats(nextPackage.seasonStats);
      setScheduleMap(schedule);
      setStatsBySeason((current) => ({ ...current, [nextPackage.season]: nextPackage }));
    } catch (err) {
      console.error('Failed to load stats:', err);
      setStatsEnhancing(false);
    } finally {
      statsAbortRef.current = false;
      setStatsLoading(false);
    }
  }, [league, loadEspnLeagueSelection, platform, season, seasonStats, selectedLeagueId, weeklyStats]); // removed statsLoading — guarded by ref instead

  useEffect(() => {
    if (platform !== 'espn') return;
    if (!selectedLeagueId || statsLoading) return;
    const refreshKey = `${selectedLeagueId}:${season}:full-weekly:${ESPN_SCORE_HELPER_VERSION}`;
    if (espnStatsRefreshKeyRef.current === refreshKey && weeklyStats && seasonStats) return;
    void loadSeasonStats();
  }, [platform, selectedLeagueId, season, statsLoading, weeklyStats, seasonStats, loadSeasonStats]);

  const loadStatsForSeason = useCallback(async (targetSeason) => {
    const seasonKey = String(targetSeason ?? season ?? '').trim();
    if (!seasonKey) return null;

    if (seasonKey === String(season) && weeklyStats && seasonStats && scheduleMap) {
      return {
        season: seasonKey,
        weeklyStats,
        seasonStats,
        scheduleMap,
      };
    }

    const cached = statsBySeason[seasonKey];
    if (cached) return cached;

    const inFlight = statsLoadBySeasonRef.current.get(seasonKey);
    if (inFlight) return inFlight;

    const request = Promise.all([
      getAllWeeklyStats(seasonKey, 18),
      fetchSeasonSchedule(seasonKey).catch(() => null),
    ]).then(([weekly, schedule]) => {
      const nextPackage = {
        season: seasonKey,
        weeklyStats: weekly,
        seasonStats: aggregateSeasonStats(weekly),
        scheduleMap: schedule,
      };
      setStatsBySeason((current) => ({ ...current, [seasonKey]: nextPackage }));
      return nextPackage;
    }).finally(() => {
      statsLoadBySeasonRef.current.delete(seasonKey);
    });

    statsLoadBySeasonRef.current.set(seasonKey, request);
    return request;
  }, [season, weeklyStats, seasonStats, scheduleMap, statsBySeason]);

  // Three-pass stats enhancement — see docs/Architecture Map.md › SleeperContext
  useEffect(() => {
    if (platform !== 'sleeper') return;
    if (statsLoading || !weeklyStats || !players || !scheduleMap || qbOppSeasonRef.current === season) return;

    const capturedSeason = season;
    const sameRunInputs =
      enhancementRunRef.current.season === capturedSeason &&
      enhancementRunRef.current.weeklyStats === weeklyStats &&
      enhancementRunRef.current.players === players &&
      enhancementRunRef.current.scheduleMap === scheduleMap;
    if (sameRunInputs) return;

    const token = enhancementRunRef.current.token + 1;
    enhancementRunRef.current = {
      token,
      season: capturedSeason,
      weeklyStats,
      players,
      scheduleMap,
    };

    const run = async () => {
      // Build reverse-lookup maps from the scheduleMap so we can resolve
      // ESPN event IDs and competitor IDs without any additional API calls.
      const espnEventToWeek = {};      // { [espnEventId]: weekNumber }
      const espnCompToTeam  = {};      // { [espnCompetitorId]: sleeperTeamAbbrev }
      for (const [week, weekData] of Object.entries(scheduleMap)) {
        for (const gameData of Object.values(weekData)) {
          if (gameData.espnEventId)    espnEventToWeek[gameData.espnEventId]   = parseInt(week);
          if (gameData.espnCompetitorId && gameData.opp !== undefined) {
            // The competitor for this team entry is the team itself (not the opp).
            // We need to resolve competitorId → the team key for this entry.
            // We derive it from: find the teamAbbr whose entry has this competitorId.
          }
        }
      }
      // Build espnCompToTeam: iterate entries and match competitorId to team abbr.
      for (const weekData of Object.values(scheduleMap)) {
        for (const [teamAbbr, gameData] of Object.entries(weekData)) {
          if (gameData.espnCompetitorId) {
            espnCompToTeam[gameData.espnCompetitorId] = teamAbbr;
          }
        }
      }

      // All positions that need game-time team resolution (offense + IDP).
      const ENHANCE_POSITIONS = new Set([
        'QB', 'RB', 'WR', 'TE', 'K',
        'DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS',
      ]);

      // Split players by whether Sleeper has an ESPN ID for them
      const allEnhanceable = Object.keys(weeklyStats).filter(id => {
        const p = players[id];
        return p && ENHANCE_POSITIONS.has(p.position);
      });
      const withEspnId = allEnhanceable.filter(id => players[id]?.espn_id);
      const noEspnId = allEnhanceable.filter(id => !players[id]?.espn_id);

      const candidates = withEspnId;
      // Collect all enhancement results across passes, then apply in one setWeeklyStats call.
      // Each entry: { [sleeperId]: { [week]: { team, opp, source } } }
      const allEnhancements = {};

      // Helper: resolve eventlog maps into per-week team/opp data
      const resolveEventMaps = (playerIds, eventMapsArr) => {
        const result = {};
        playerIds.forEach((sleeperId, i) => {
          const eventMap = eventMapsArr[i];
          if (!eventMap) return;
          const weekMap = {};
          for (const [eventId, compId] of Object.entries(eventMap)) {
            const week = espnEventToWeek[eventId];
            const team = espnCompToTeam[compId];
            if (!week || !team) continue;
            const opp = scheduleMap[week]?.[team]?.opp ?? null;
            weekMap[week] = { team, opp };
          }
          if (Object.keys(weekMap).length > 0) result[sleeperId] = weekMap;
        });
        return result;
      };

      // ── Pass 1: ESPN eventlog for players with espn_id ─────────────────────
      if (candidates.length > 0) {
        const eventMaps = await Promise.all(
          candidates.map(sleeperId =>
            fetchPlayerGameTeamMap(String(players[sleeperId].espn_id), capturedSeason)
              .catch(() => null)
          )
        );
        if (enhancementRunRef.current.token !== token) return;

        const pass1Data = resolveEventMaps(candidates, eventMaps);
        Object.assign(allEnhancements, pass1Data);
      }

      // ── Pass 2: ESPN roster cross-reference for null-espn_id players ───────
      // Some players have espn_id: null in Sleeper's players DB, excluding them
      // from Pass 1. Fix: look up their ESPN athlete ID by fetching their
      // current team's ESPN roster and matching by name, then run the same
      // eventlog pipeline.
      const noEspnCandidates = noEspnId.filter(id => players[id]?.team);

      // ── Pass 3: Schedule-based verification for remaining players ──────────
      // Players not resolved by Passes 1/2 (e.g. defensive players whose ESPN
      // eventlog lacks statistics.$ref entries entirely) still need attribution.
      // For each unenhanced player, verify player.team against the scheduleMap:
      // if the team played that week, attribute the stats there and mark as
      // 'schedule' source (confirmed via NFL schedule, not ESPN eventlog).
      const stillUnresolved = allEnhanceable.filter(id => !allEnhancements[id]);
      for (const sleeperId of stillUnresolved) {
        const p = players[sleeperId];
        const team = p?.team?.toUpperCase();
        if (!team) continue;
        const playerWeeks = weeklyStats[sleeperId];
        if (!playerWeeks) continue;

        const weekMap = {};
        for (const wEntry of playerWeeks) {
          // Already has ESPN-confirmed data from a partial enhancement? Skip.
          if (wEntry._teamSource === 'espn') continue;
          const schedEntry = scheduleMap?.[wEntry.week]?.[team];
          if (schedEntry) {
            weekMap[wEntry.week] = { team, opp: schedEntry.opp?.toUpperCase() ?? null, source: 'schedule' };
          }
        }
        if (Object.keys(weekMap).length > 0) allEnhancements[sleeperId] = weekMap;
      }

      // ── Apply all enhancements in a single state update ────────────────────
      const enhancedPlayerIds = Object.keys(allEnhancements);
      const queueBackgroundPass2 = () => {
        if (!noEspnCandidates.length) return;
        const runBackgroundPass2 = async () => {
          const teamsNeeded = [...new Set(noEspnCandidates.map(id => players[id].team.toUpperCase()))];
          const rosterResults = await Promise.all(
            teamsNeeded.map(t => fetchRoster(t).catch(() => []))
          );
          if (enhancementRunRef.current.token !== token) return;

          const teamRosters = {};
          teamsNeeded.forEach((t, i) => { teamRosters[t] = rosterResults[i]; });

          const normalizeName = (name) =>
            (name ?? '').toLowerCase().replace(/\./g, '').replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '').trim();

          const resolvedEspnIds = {};
          for (const sleeperId of noEspnCandidates) {
            const p = players[sleeperId];
            const roster = teamRosters[p.team.toUpperCase()] ?? [];
            const normSleeper = normalizeName(p.full_name);
            const match = roster.find(r => r.displayName.toLowerCase() === p.full_name?.toLowerCase())
              ?? roster.find(r => normalizeName(r.displayName) === normSleeper);
            if (match) resolvedEspnIds[sleeperId] = match.id;
          }

          const resolvedIds = Object.keys(resolvedEspnIds);
          if (resolvedIds.length > 0) {
            startTransition(() => {
              setEspnIdOverrides(prev => ({ ...prev, ...resolvedEspnIds }));
            });
          }

          if (resolvedIds.length > 0) {
            const eventMaps2 = await Promise.all(
              resolvedIds.map(id =>
                fetchPlayerGameTeamMap(String(resolvedEspnIds[id]), capturedSeason)
                  .catch(() => null)
              )
            );
            if (enhancementRunRef.current.token !== token) return;

            const pass2Data = resolveEventMaps(resolvedIds, eventMaps2);
            const pass2PlayerIds = Object.keys(pass2Data);
            if (pass2PlayerIds.length > 0) {
              startTransition(() => {
                setWeeklyStats(prev => {
                  const next = { ...prev };
                  for (const sleeperId of pass2PlayerIds) {
                    if (!next[sleeperId]) continue;
                    const weekMap = pass2Data[sleeperId];
                    next[sleeperId] = next[sleeperId].map(wEntry => {
                      const data = weekMap[wEntry.week];
                      if (!data) return wEntry;
                      return { ...wEntry, team: data.team, opp: data.opp, _teamSource: 'espn' };
                    });
                  }
                  return next;
                });
              });
            }
          }
        };

        setTimeout(() => {
          void runBackgroundPass2();
        }, 0);
      };

      if (enhancedPlayerIds.length > 0) {
        startTransition(() => {
          setWeeklyStats(prev => {
            const next = { ...prev };
            for (const sleeperId of enhancedPlayerIds) {
              if (!next[sleeperId]) continue;
              const weekMap = allEnhancements[sleeperId];
              next[sleeperId] = next[sleeperId].map(wEntry => {
                const data = weekMap[wEntry.week];
                if (!data) return wEntry;
                const source = data.source ?? 'espn';
                return { ...wEntry, team: data.team, opp: data.opp, _teamSource: source };
              });
            }
            return next;
          });
          setStatsEnhancing(false);
        });
      } else {
        startTransition(() => {
          setStatsEnhancing(false);
        });
      }

      qbOppSeasonRef.current = capturedSeason;
      queueBackgroundPass2();
    };

    run();
  }, [platform, statsLoading, weeklyStats, players, scheduleMap, season]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (platform !== 'espn') return;
    if (!selectedLeagueId || !weeklyStats || !players || !hasEspnBigPlayTouchdownScoring(scoringSettings)) return;

    const runKey = `${selectedLeagueId}:${season}:espn-scoring-play-v3`;
    if (espnBigPlayRunRef.current.key === runKey) return;
    if (espnBigPlayRunRef.current.runningKey === runKey) return;

    const token = espnBigPlayRunRef.current.token + 1;
    espnBigPlayRunRef.current = { ...espnBigPlayRunRef.current, token, runningKey: runKey };

    const run = async () => {
      setStatsEnhancing(true);
      try {
        const nflSchedule = scheduleMap ?? await fetchSeasonSchedule(season).catch(() => null);
        if (espnBigPlayRunRef.current.token !== token) return;
        if (!nflSchedule) return;
        if (!scheduleMap) setScheduleMap(nflSchedule);

        const events = new Map();
        for (const [playerId, rows] of Object.entries(weeklyStats ?? {})) {
          const player = players?.[playerId];
          const defaultTeam = player?.team?.toUpperCase?.();
          for (const row of rows ?? []) {
            const week = Number(row?.week);
            if (!Number.isFinite(week)) continue;
            const team = row?.team?.toUpperCase?.() ?? defaultTeam;
            const eventId = team ? nflSchedule?.[week]?.[team]?.espnEventId : null;
            if (!eventId || events.has(String(eventId))) continue;
            events.set(String(eventId), week);
          }
        }

        if (!events.size) return;

        let enrichedWeeklyStats = weeklyStats;
        const eventResults = await Promise.all([...events.entries()].map(async ([eventId, week]) => ({
          eventId,
          week,
          scoringPlays: await fetchEventScoringPlays(eventId),
        })));
        if (espnBigPlayRunRef.current.token !== token) return;

        for (const { week, scoringPlays } of eventResults) {
          const bonuses = getEspnScoringPlayBigPlayBonuses(scoringPlays, players);
          enrichedWeeklyStats = applyEspnBigPlayBonusesToWeeklyStats(enrichedWeeklyStats, week, bonuses);
        }

        espnBigPlayRunRef.current = { ...espnBigPlayRunRef.current, key: runKey };
        if (enrichedWeeklyStats !== weeklyStats) {
          startTransition(() => {
            setWeeklyStats(enrichedWeeklyStats);
            setSeasonStats(prev => ({ ...(prev ?? {}), ...aggregateSeasonStats(enrichedWeeklyStats) }));
          });
        }
      } finally {
        if (espnBigPlayRunRef.current.token === token) {
          espnBigPlayRunRef.current = { ...espnBigPlayRunRef.current, runningKey: null };
          setStatsEnhancing(false);
        }
      }
    };

    void run();
  }, [platform, selectedLeagueId, season, weeklyStats, players, scoringSettings, scheduleMap]);

  // ── Derived helpers ─────────────────────────────────────────────────────────

  // Find this user's roster in the league
  const myRoster = useCallback(() => {
    if (!sleeperUser || !rosters.length) return null;
    return rosters.find(r => r.owner_id === sleeperUser.user_id) ?? null;
  }, [sleeperUser, rosters]);

  // Map user_id → display name from leagueUsers
  const getUserDisplayName = useCallback((userId) => {
    const u = leagueUserById.get(userId);
    if (!u) return 'Unknown';
    return u.metadata?.team_name || u.display_name || u.username || 'Unknown';
  }, [leagueUserById]);

  const isConnected = !!sleeperUser;
  const hasLeague = !!selectedLeagueId && !!league;
  const linkedLeagueSeasonOptions = useMemo(() => {
    if (platform === 'espn') {
      return mergeSeasonOptions(
        getEspnSeasonOptions(season),
        availableSeasons.length ? availableSeasons : [String(season)],
      );
    }
    if (!league) return [];
    const combinedLeaguesBySeason = {
      ...leaguesBySeason,
      [season]: leaguesBySeason[season] ?? leagues,
    };
    const lineageIds = buildLeagueLineageIds(league, combinedLeaguesBySeason);
    const linkedSeasons = Object.entries(combinedLeaguesBySeason)
      .filter(([, seasonLeagues]) => (seasonLeagues ?? []).some((item) => isLeagueInLineage(item, lineageIds)))
      .map(([seasonKey]) => String(seasonKey));

    const currentSeason = String(league.season ?? season);
    if (!linkedSeasons.includes(currentSeason)) linkedSeasons.push(currentSeason);
    return linkedSeasons.sort((a, b) => Number(b) - Number(a));
  }, [availableSeasons, league, leaguesBySeason, leagues, platform, season]);

  const loadMatchups = useCallback(async (leagueId, week) => {
    if (platform === 'espn') return espnMatchupsByWeek?.[week] ?? [];
    return getMatchups(leagueId, week);
  }, [espnMatchupsByWeek, platform]);

  const getTradedPicksForLeague = useCallback(async (leagueId) => {
    if (platform === 'espn') return [];
    return getTradedPicks(leagueId);
  }, [platform]);

  const getLeagueDraftsForLeague = useCallback(async (leagueId) => {
    if (platform === 'espn') return [];
    return getLeagueDrafts(leagueId);
  }, [platform]);

  const leagueValue = useMemo(() => ({
    platform,
    fantasyUser: sleeperUser,
    sleeperUser,
    leagues,
    selectedLeagueId,
    league,
    rosters,
    leagueUsers,
    season,
    availableSeasons,
    leaguesBySeason,
    linkedLeagueSeasonOptions,
    scoringSettings,
    scoringOverride,
    scoringOverridePaused,
    activeScoringSettings,
    connectError,
    connectLoading,
    isConnected,
    hasLeague,
    connect,
    connectSleeper: connect,
    connectEspn,
    selectLeague,
    disconnect,
    changeSeason,
    loadEspnLeagueSelection,
    loadMatchups,
    getTradedPicksForLeague,
    getLeagueDraftsForLeague,
    setScoringSettings,
    setScoringOverride,
    clearScoringOverride,
    setScoringOverridePaused,
    setConnectError,
    myRoster,
    getUserDisplayName,
  }), [
    platform,
    sleeperUser,
    leagues,
    selectedLeagueId,
    league,
    rosters,
    leagueUsers,
    season,
    availableSeasons,
    leaguesBySeason,
    linkedLeagueSeasonOptions,
    scoringSettings,
    scoringOverride,
    scoringOverridePaused,
    activeScoringSettings,
    connectError,
    connectLoading,
    isConnected,
    hasLeague,
    connect,
    connectEspn,
    selectLeague,
    disconnect,
    changeSeason,
    loadEspnLeagueSelection,
    loadMatchups,
    getTradedPicksForLeague,
    getLeagueDraftsForLeague,
    clearScoringOverride,
    myRoster,
    getUserDisplayName,
  ]);
  const statsValue = useMemo(() => ({
    players,
    weeklyStats,
    seasonStats,
    scheduleMap,
    statsBySeason,
    statsLoading,
    espnIdOverrides,
    loadPlayers,
    loadSeasonStats,
    loadStatsForSeason,
  }), [
    players,
    weeklyStats,
    seasonStats,
    scheduleMap,
    statsBySeason,
    statsLoading,
    espnIdOverrides,
    loadPlayers,
    loadSeasonStats,
    loadStatsForSeason,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    window.__GRIDSHIFT_ESPN_HELPER_VERSION__ = ESPN_SCORE_HELPER_VERSION;

    window.__GRIDSHIFT_ESPN_SCORING_AUDIT__ = () => {
      if (platform !== 'espn') {
        return { provider: platform, rows: [], unmappedRows: [], error: 'No ESPN league is currently loaded.' };
      }
      return getEspnScoringImportAudit(activeScoringSettings ?? scoringSettings);
    };

    window.__GRIDSHIFT_ESPN_DST_SCORING_INDEX__ = () => {
      if (platform !== 'espn') {
        return { provider: platform, rows: [], problemRows: [], error: 'No ESPN league is currently loaded.' };
      }
      return getEspnDstScoringIndexAudit(activeScoringSettings ?? scoringSettings);
    };

    const reconcileSeason = (query = {}) => {
      if (platform !== 'espn') {
        return {
          ok: false,
          error: 'No ESPN league is currently loaded. Import or reconnect the ESPN league first.',
          platform,
        };
      }

      const expectedByWeek = query.expectedByWeek ?? query.expected ?? {};
      const rows = Object.entries(expectedByWeek)
        .map(([week, expected]) => reconcileFantasyScore({
          players: players ?? {},
          weeklyStats: weeklyStats ?? {},
          scoringSettings: activeScoringSettings ?? scoringSettings,
          ...query,
          expectedByWeek: undefined,
          week: Number(week),
          expected,
        }))
        .map((result) => ({
          ok: result.ok,
          week: result.week,
          expected: result.expected,
          gridshift: result.gridshiftTotal,
          delta: result.delta,
          status: result.status,
          error: result.error,
          missingCandidates: result.missingCandidates,
          rawStats: result.rawStats,
        }));

      return {
        ok: rows.every((row) => row.status === 'match'),
        rows,
      };
    };

    window.__GRIDSHIFT_ESPN_SCORE_RECONCILE__ = (query = {}) => {
      if (query?.expectedByWeek) return reconcileSeason(query);
      if (platform !== 'espn') {
        return {
          ok: false,
          error: 'No ESPN league is currently loaded. Import or reconnect the ESPN league first.',
          platform,
        };
      }
      return reconcileFantasyScore({
        players: players ?? {},
        weeklyStats: weeklyStats ?? {},
        scoringSettings: activeScoringSettings ?? scoringSettings,
        ...query,
      });
    };

    window.__GRIDSHIFT_ESPN_SCORE_RECONCILE_SEASON__ = reconcileSeason;

    window.__GRIDSHIFT_ESPN_DST_RESIDUALS__ = async (query = {}) => {
      if (platform !== 'espn') {
        return {
          ok: false,
          error: 'No ESPN league is currently loaded. Import or reconnect the ESPN league first.',
          platform,
          rows: [],
          residualRows: [],
        };
      }

      const targetSeason = String(query.season ?? season ?? DEFAULT_SEASON);
      const targetLeagueId = query.leagueId ?? selectedLeagueId ?? league?.league_id ?? null;
      let auditPlayers = { ...(players ?? {}) };
      let auditWeeklyStats = { ...(weeklyStats ?? {}) };
      const sourceErrors = [];
      const maxWeek = Number(query.maxWeek ?? league?.settings?.matchup_periods ?? 18);
      const weeks = Array.isArray(query.weeks)
        ? query.weeks.map(Number).filter(Number.isFinite)
        : Array.from({ length: Math.max(1, Number.isFinite(maxWeek) ? maxWeek : 18) }, (_, index) => index + 1);

      if (query.refreshLeagueRows !== false && targetLeagueId) {
        const weeklyPayloads = await Promise.all(weeks.map(async (week) => {
          try {
            const payload = await getEspnLeague(targetSeason, targetLeagueId, undefined, {
              scoringPeriodId: week,
              matchupPeriodId: week,
            });
            return { week, normalized: normalizeEspnLeaguePayload(payload, { season: targetSeason, leagueId: targetLeagueId, scoringPeriodId: week }) };
          } catch (err) {
            return { week, error: err?.message ?? String(err) };
          }
        }));

        for (const item of weeklyPayloads) {
          if (item.error) {
            sourceErrors.push({ week: item.week, error: item.error });
            continue;
          }
          auditPlayers = { ...auditPlayers, ...(item.normalized?.players ?? {}) };
          auditWeeklyStats = mergeWeeklyStatsMaps(auditWeeklyStats, item.normalized?.weeklyStats ?? {});
        }
      }

      const result = await buildEspnDstResidualDebugRows({
        players: auditPlayers,
        weeklyStats: auditWeeklyStats,
        scoringSettings: activeScoringSettings ?? scoringSettings,
        season: targetSeason,
        includeClean: query.includeClean === true,
        team: query.team,
        fetchTeamDefenseGameLog,
      });

      return {
        ...result,
        provider: 'espn',
        leagueId: targetLeagueId,
        helperVersion: ESPN_SCORE_HELPER_VERSION,
        refreshedWeeks: query.refreshLeagueRows === false ? [] : weeks,
        sourceErrors,
      };
    };

    window.__GRIDSHIFT_ESPN_DEBUG_STATE__ = (playerId = 'espn:3052587') => {
      const normalizedPlayerId = String(playerId ?? '').trim();
      const matchingPlayers = Object.entries(players ?? {})
        .filter(([, player]) => {
          const name = [
            player?.full_name,
            player?.displayName,
            player?.name,
            `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim(),
          ].filter(Boolean).join(' ').toLowerCase();
          return name.includes('baker') || name.includes('mayfield');
        })
        .slice(0, 10)
        .map(([id, player]) => ({
          id,
          name: player?.full_name ?? player?.displayName ?? player?.name,
          position: player?.position,
        }));

      return {
        helperVersion: ESPN_SCORE_HELPER_VERSION,
        platform,
        selectedLeagueId,
        season,
        playerCount: Object.keys(players ?? {}).length,
        weeklyStatsPlayerCount: Object.keys(weeklyStats ?? {}).length,
        requestedPlayerId: normalizedPlayerId,
        hasRequestedPlayer: !!players?.[normalizedPlayerId],
        hasRequestedWeeklyStats: !!weeklyStats?.[normalizedPlayerId],
        requestedWeeks: (weeklyStats?.[normalizedPlayerId] ?? []).map((row) => row.week),
        matchingPlayers,
      };
    };

    return () => {
      if (window.__GRIDSHIFT_ESPN_HELPER_VERSION__) delete window.__GRIDSHIFT_ESPN_HELPER_VERSION__;
      if (window.__GRIDSHIFT_ESPN_SCORING_AUDIT__) delete window.__GRIDSHIFT_ESPN_SCORING_AUDIT__;
      if (window.__GRIDSHIFT_ESPN_DST_SCORING_INDEX__) delete window.__GRIDSHIFT_ESPN_DST_SCORING_INDEX__;
      if (window.__GRIDSHIFT_ESPN_SCORE_RECONCILE__) delete window.__GRIDSHIFT_ESPN_SCORE_RECONCILE__;
      if (window.__GRIDSHIFT_ESPN_SCORE_RECONCILE_SEASON__) delete window.__GRIDSHIFT_ESPN_SCORE_RECONCILE_SEASON__;
      if (window.__GRIDSHIFT_ESPN_DST_RESIDUALS__) delete window.__GRIDSHIFT_ESPN_DST_RESIDUALS__;
      if (window.__GRIDSHIFT_ESPN_DEBUG_STATE__) delete window.__GRIDSHIFT_ESPN_DEBUG_STATE__;
    };
  }, [activeScoringSettings, league, platform, players, scoringSettings, season, selectedLeagueId, weeklyStats]);

  return (
    <SleeperLeagueContext.Provider value={leagueValue}>
      <SleeperStatsContext.Provider value={statsValue}>
        <SleeperStatsEnhancingContext.Provider value={statsEnhancing}>
          <SleeperStatsProgressContext.Provider value={statsProgress}>
            {children}
          </SleeperStatsProgressContext.Provider>
        </SleeperStatsEnhancingContext.Provider>
      </SleeperStatsContext.Provider>
    </SleeperLeagueContext.Provider>
  );
}

export const SleeperProvider = FantasyProvider;

export function useFantasyLeague() {
  const ctx = useContext(SleeperLeagueContext);
  if (!ctx) throw new Error('useFantasyLeague must be used inside <FantasyProvider>');
  return ctx;
}

export function useFantasyStats() {
  const ctx = useContext(SleeperStatsContext);
  if (!ctx) throw new Error('useFantasyStats must be used inside <FantasyProvider>');
  return ctx;
}

export function useFantasyBase() {
  return { ...useFantasyLeague(), ...useFantasyStats() };
}

export function useFantasyStatsProgress() {
  return useContext(SleeperStatsProgressContext);
}

export function useFantasyStatsEnhancing() {
  return useContext(SleeperStatsEnhancingContext);
}

export function useFantasy() {
  const ctx = useFantasyBase();
  const statsProgress = useFantasyStatsProgress();
  const statsEnhancing = useFantasyStatsEnhancing();
  return { ...ctx, statsProgress, statsEnhancing };
}

export function useSleeperLeague() {
  return useFantasyLeague();
}

export function useSleeperStats() {
  return useFantasyStats();
}

export function useSleeperBase() {
  return useFantasyBase();
}

export function useSleeperStatsProgress() {
  return useFantasyStatsProgress();
}

export function useSleeperStatsEnhancing() {
  return useFantasyStatsEnhancing();
}

export function useSleeper() {
  return useFantasy();
}
