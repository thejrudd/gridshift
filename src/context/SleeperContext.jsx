import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getUserByUsername,
  getLeaguesForUser,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getAllPlayers,
  getAllWeeklyStats,
  aggregateSeasonStats,
} from '../api/sleeperApi';
import { fetchSeasonSchedule, fetchPlayerGameTeamMap, fetchRoster } from '../utils/playerApi';
import { DEFAULT_SCORING, importLeagueScoring } from '../utils/scoringEngine';
import { clearPlayerCache, checkAndBustCacheIfNeeded } from '../utils/playerCache';

// Run once when this module first loads — wipes stale player cache if app version changed.
checkAndBustCacheIfNeeded();

const SleeperContext = createContext(null);

const STORAGE_KEY = 'sleeper_state_v1';
const DEFAULT_SEASON = '2025';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      // Reset season if persisted value has no data (e.g. '2026')
      if (!state.season || parseInt(state.season) > 2025) state.season = DEFAULT_SEASON;
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

export function SleeperProvider({ children }) {
  const persisted = loadPersistedState();

  // Connection state
  const [sleeperUser, setSleeperUser] = useState(persisted?.sleeperUser ?? null);
  const [leagues, setLeagues] = useState(persisted?.leagues ?? []);
  const [selectedLeagueId, setSelectedLeagueId] = useState(persisted?.selectedLeagueId ?? null);
  const [league, setLeague] = useState(persisted?.league ?? null);
  const [rosters, setRosters] = useState(persisted?.rosters ?? []);
  const [leagueUsers, setLeagueUsers] = useState(persisted?.leagueUsers ?? []);
  const [season, setSeason] = useState(persisted?.season ?? DEFAULT_SEASON);

  // Scoring
  const [scoringSettings, setScoringSettings] = useState(
    persisted?.scoringSettings ?? DEFAULT_SCORING
  );

  // Players DB
  const [players, setPlayers] = useState(null); // loaded on demand

  // Stats
  const [weeklyStats, setWeeklyStats] = useState(null); // { [playerId]: weekArray[] }
  const [seasonStats, setSeasonStats] = useState(null);  // { [playerId]: aggregated }
  const [scheduleMap, setScheduleMap] = useState(null);  // { [week]: { [teamAbbr]: { opp, home } } }
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsProgress, setStatsProgress] = useState(0);
  const [espnIdOverrides, setEspnIdOverrides] = useState({}); // sleeperId → espnId, for null-espn_id players resolved via Pass 2

  // UI state
  const [connectError, setConnectError] = useState(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const statsAbortRef = useRef(null);
  const qbOppSeasonRef = useRef(null); // tracks which season QB opp data has been merged

  // Persist key state to localStorage
  useEffect(() => {
    savePersistedState({
      sleeperUser,
      leagues,
      selectedLeagueId,
      league,
      rosters,
      leagueUsers,
      season,
      scoringSettings,
    });
  }, [sleeperUser, leagues, selectedLeagueId, league, rosters, leagueUsers, season, scoringSettings]);

  // ── Connection flow ─────────────────────────────────────────────────────────

  const connect = useCallback(async (username) => {
    setConnectError(null);
    setConnectLoading(true);
    try {
      const user = await getUserByUsername(username.trim().toLowerCase());
      if (!user?.user_id) throw new Error('User not found. Check your Sleeper username.');
      setSleeperUser(user);

      const userLeagues = await getLeaguesForUser(user.user_id, season);
      setLeagues(userLeagues ?? []);

      return user;
    } catch (err) {
      setConnectError(err.message);
      throw err;
    } finally {
      setConnectLoading(false);
    }
  }, [season]);

  const selectLeague = useCallback(async (leagueId) => {
    setConnectError(null);
    setConnectLoading(true);
    try {
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
        setScoringSettings(prev => ({ ...DEFAULT_SCORING, ...imported }));
      }
    } catch (err) {
      setConnectError(err.message);
      throw err;
    } finally {
      setConnectLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setSleeperUser(null);
    setLeagues([]);
    setSelectedLeagueId(null);
    setLeague(null);
    setRosters([]);
    setLeagueUsers([]);
    setScoringSettings(DEFAULT_SCORING);
    setPlayers(null);
    setWeeklyStats(null);
    setSeasonStats(null);
    setScheduleMap(null);
    statsAbortRef.current = false; // allow fresh load after reconnect
    qbOppSeasonRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    clearPlayerCache(); // clear per-player team/opp cache so next load fetches fresh
  }, []);

  const changeSeason = useCallback(async (newSeason) => {
    setSeason(newSeason);
    setWeeklyStats(null);
    setSeasonStats(null);
    statsAbortRef.current = false; // allow reload on season change
    qbOppSeasonRef.current = null;

    if (sleeperUser) {
      try {
        const userLeagues = await getLeaguesForUser(sleeperUser.user_id, newSeason);
        setLeagues(userLeagues ?? []);
        // Reset league selection if current league isn't in the new season
        const stillExists = userLeagues?.find(l => l.league_id === selectedLeagueId);
        if (!stillExists) {
          setSelectedLeagueId(null);
          setLeague(null);
          setRosters([]);
          setLeagueUsers([]);
        }
      } catch { /* ignore */ }
    }
  }, [sleeperUser, selectedLeagueId]);

  // ── Player DB ───────────────────────────────────────────────────────────────

  const loadPlayers = useCallback(async () => {
    if (players) return players;
    const data = await getAllPlayers();
    setPlayers(data);
    return data;
  }, [players]);

  // ── Stats loading ───────────────────────────────────────────────────────────

  const loadSeasonStats = useCallback(async () => {
    if (statsAbortRef.current) return; // guard against concurrent calls
    statsAbortRef.current = true;
    qbOppSeasonRef.current = null; // allow player team enhancement to re-run
    setStatsLoading(true);
    setStatsProgress(0);

    try {
      const [weekly, schedule] = await Promise.all([
        getAllWeeklyStats(season, 18, (week, total) => {
          setStatsProgress(Math.round((week / total) * 100));
        }),
        fetchSeasonSchedule(season).catch(() => null),
      ]);
      setWeeklyStats(weekly);
      setSeasonStats(aggregateSeasonStats(weekly));
      setScheduleMap(schedule);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      statsAbortRef.current = false;
      setStatsLoading(false);
    }
  }, [season]); // removed statsLoading — guarded by ref instead

  /**
   * After bulk weekly stats + players DB + scheduleMap are all loaded, enrich
   * each player's weekly stat entries with their confirmed game-time team and
   * opponent. Three-pass enhancement:
   *
   *   Pass 1 — ESPN eventlog for players with espn_id in Sleeper's DB.
   *   Pass 2 — ESPN roster name-match for players with espn_id: null, then
   *            the same eventlog pipeline.
   *   Pass 3 — Schedule-based verification for remaining unresolved players.
   *            Uses player.team + scheduleMap to confirm the team played that
   *            week. Marked _teamSource = 'schedule'.
   *
   * Root problem: Sleeper's bulk stats endpoint has no team/opponent metadata.
   * player.team (current roster) is wrong for any traded/signed player.
   *
   * Covers all offensive (QB, RB, WR, TE, K) and IDP (DL, LB, DB, etc.)
   * positions. Entries marked _teamSource = 'espn' or 'schedule' are
   * considered verified; unmarked entries fall back to player.team.
   */
  useEffect(() => {
    if (statsLoading || !weeklyStats || !players || !scheduleMap || qbOppSeasonRef.current === season) return;

    let cancelled = false;
    const capturedSeason = season;

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
      for (const [week, weekData] of Object.entries(scheduleMap)) {
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
        if (cancelled) return;

        const pass1Data = resolveEventMaps(candidates, eventMaps);
        Object.assign(allEnhancements, pass1Data);
      }

      // ── Pass 2: ESPN roster cross-reference for null-espn_id players ───────
      // Some players have espn_id: null in Sleeper's players DB, excluding them
      // from Pass 1. Fix: look up their ESPN athlete ID by fetching their
      // current team's ESPN roster and matching by name, then run the same
      // eventlog pipeline.
      const noEspnCandidates = noEspnId.filter(id => players[id]?.team);

      if (noEspnCandidates.length > 0 && !cancelled) {
        const teamsNeeded = [...new Set(noEspnCandidates.map(id => players[id].team.toUpperCase()))];
        const rosterResults = await Promise.all(
          teamsNeeded.map(t => fetchRoster(t).catch(() => []))
        );
        if (cancelled) return;

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
        if (resolvedIds.length > 0) setEspnIdOverrides(prev => ({ ...prev, ...resolvedEspnIds }));

        if (resolvedIds.length > 0 && !cancelled) {
          const eventMaps2 = await Promise.all(
            resolvedIds.map(id =>
              fetchPlayerGameTeamMap(String(resolvedEspnIds[id]), capturedSeason)
                .catch(() => null)
            )
          );
          if (cancelled) return;

          const pass2Data = resolveEventMaps(resolvedIds, eventMaps2);
          Object.assign(allEnhancements, pass2Data);
        }
      }

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
      if (enhancedPlayerIds.length > 0) {
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
      }

      qbOppSeasonRef.current = capturedSeason;
    };

    run();
    return () => { cancelled = true; };
  }, [statsLoading, weeklyStats, players, scheduleMap, season]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived helpers ─────────────────────────────────────────────────────────

  // Find this user's roster in the league
  const myRoster = useCallback(() => {
    if (!sleeperUser || !rosters.length || !leagueUsers.length) return null;
    const myUser = leagueUsers.find(u => u.user_id === sleeperUser.user_id);
    if (!myUser) return null;
    return rosters.find(r => r.owner_id === myUser.user_id) ?? null;
  }, [sleeperUser, rosters, leagueUsers]);

  // Map user_id → display name from leagueUsers
  const getUserDisplayName = useCallback((userId) => {
    const u = leagueUsers.find(u => u.user_id === userId);
    if (!u) return 'Unknown';
    return u.metadata?.team_name || u.display_name || u.username || 'Unknown';
  }, [leagueUsers]);

  const isConnected = !!sleeperUser;
  const hasLeague = !!selectedLeagueId && !!league;

  return (
    <SleeperContext.Provider value={{
      // State
      sleeperUser,
      leagues,
      selectedLeagueId,
      league,
      rosters,
      leagueUsers,
      season,
      scoringSettings,
      players,
      weeklyStats,
      seasonStats,
      scheduleMap,
      statsLoading,
      statsProgress,
      espnIdOverrides,
      connectError,
      connectLoading,
      isConnected,
      hasLeague,

      // Actions
      connect,
      selectLeague,
      disconnect,
      changeSeason,
      loadPlayers,
      loadSeasonStats,
      setScoringSettings,
      setConnectError,

      // Helpers
      myRoster,
      getUserDisplayName,
    }}>
      {children}
    </SleeperContext.Provider>
  );
}

export function useSleeper() {
  const ctx = useContext(SleeperContext);
  if (!ctx) throw new Error('useSleeper must be used inside <SleeperProvider>');
  return ctx;
}
