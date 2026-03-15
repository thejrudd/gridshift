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
import { fetchSeasonSchedule } from '../utils/playerApi';
import { DEFAULT_SCORING, importLeagueScoring } from '../utils/scoringEngine';

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

  // UI state
  const [connectError, setConnectError] = useState(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const statsAbortRef = useRef(null);

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
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const changeSeason = useCallback(async (newSeason) => {
    setSeason(newSeason);
    setWeeklyStats(null);
    setSeasonStats(null);
    statsAbortRef.current = false; // allow reload on season change

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
