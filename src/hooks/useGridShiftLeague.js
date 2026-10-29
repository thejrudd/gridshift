// Data hooks for the GridShift-league screens of Stage 5.2 (Rosters with
// lineup editing, Matchups, League Activity). Every request goes to the
// platform API through src/api/gridshiftPlatformApi.js; nothing here reads
// SleeperContext league data. The player catalog passed in is core's NFL
// player directory, used only to match portraits and player pages.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getGridShiftActivity,
  getGridShiftLeague,
  getGridShiftLineup,
  getGridShiftMatchups,
  getGridShiftOwnedPlayers,
  getGridShiftPoints,
  getGridShiftSession,
  getGridShiftStandings,
  getGridShiftTeams,
  getGridShiftWeeks,
  putGridShiftLineup,
} from '../api/gridshiftPlatformApi.js';
import { buildGridShiftActivityEntries, GRIDSHIFT_ACTIVITY_FILTERS } from '../utils/gridshiftActivity.js';
import { buildPlayerCatalogIndex, getGridShiftViewer, mapGridShiftPlayers } from '../utils/gridshiftLeagueAdapter.js';
import { describeLineupRejection, moveLineupPlayer } from '../utils/gridshiftLineup.js';
import { getLeagueProvider, LEAGUE_PROVIDER_IDS } from '../utils/leagueProviderContract.js';

const PROVIDER_LABEL = getLeagueProvider(LEAGUE_PROVIDER_IDS.GRIDSHIFT).label;

const statusOf = (error) => (error?.status === 401 ? 'signed-out' : 'error');

/** Runs `load` whenever `key` changes; `{ status, data, error, retry }`. */
function usePlatformQuery(key, load) {
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  const [state, setState] = useState({ status: key ? 'loading' : 'idle', data: null, error: '' });
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setState((previous) => ({ status: 'loading', data: previous.data, error: '' }));
      try {
        const data = await loadRef.current();
        if (!cancelled) setState({ status: 'ready', data, error: '' });
      } catch (error) {
        if (!cancelled) setState({ status: statusOf(error), data: null, error: error?.message ?? `${PROVIDER_LABEL} could not be reached.` });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [key, retryToken]);

  return { ...state, retry };
}

/**
 * League, teams, weeks, owned players, and the signed-in viewer: what Rosters
 * and Matchups both need.
 */
export function useGridShiftLeagueBase(leagueId, catalog) {
  const query = usePlatformQuery(leagueId ? `base:${leagueId}` : null, async () => {
    const [league, teams, weeks, directory, session] = await Promise.all([
      getGridShiftLeague(leagueId),
      getGridShiftTeams(leagueId),
      getGridShiftWeeks(leagueId),
      getGridShiftOwnedPlayers(leagueId),
      getGridShiftSession(),
    ]);
    return { league, teams, weeks, directory, session };
  });
  const catalogIndex = useMemo(() => (catalog ? buildPlayerCatalogIndex(catalog) : null), [catalog]);
  const players = useMemo(
    () => mapGridShiftPlayers(query.data?.directory, { catalogIndex }),
    [catalogIndex, query.data?.directory],
  );
  const viewer = useMemo(
    () => (query.data ? getGridShiftViewer(query.data) : null),
    [query.data],
  );
  return { ...query, players, viewer, catalogIndex };
}

/** League Activity for one GridShift league, as a contract ActivityModel. */
export function useGridShiftActivity(leagueId, season, catalog) {
  const query = usePlatformQuery(leagueId ? `activity:${leagueId}` : null, async () => {
    const [activity, teams, directory] = await Promise.all([
      getGridShiftActivity(leagueId),
      getGridShiftTeams(leagueId),
      getGridShiftOwnedPlayers(leagueId),
    ]);
    return { activity, teams, directory };
  });
  const catalogIndex = useMemo(() => (catalog ? buildPlayerCatalogIndex(catalog) : null), [catalog]);
  return useMemo(() => {
    const base = {
      provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
      season: String(season ?? ''),
      error: query.error,
      retry: query.retry,
      entries: [],
      filters: GRIDSHIFT_ACTIVITY_FILTERS,
      hideCommissionerByDefault: false,
    };
    if (query.status !== 'ready') return { ...base, status: query.status === 'idle' ? 'loading' : query.status };
    const players = mapGridShiftPlayers(query.data.directory, { catalogIndex });
    const entries = buildGridShiftActivityEntries({ ...query.data, players, catalogIndex, season: base.season });
    return { ...base, status: entries.length ? 'ready' : 'empty', entries };
  }, [catalogIndex, query.data, query.error, query.retry, query.status, season]);
}

/** One week's points for the league (`GET …/points?week=`). */
export function useGridShiftWeekPoints(leagueId, week) {
  return usePlatformQuery(leagueId && week ? `points:${leagueId}:${week}` : null, () => getGridShiftPoints(leagueId, week));
}

/** Matchups and final standings (records) for the Matchups screen. */
export function useGridShiftMatchupData(leagueId) {
  return usePlatformQuery(leagueId ? `matchups:${leagueId}` : null, async () => {
    const [matchups, standings] = await Promise.all([getGridShiftMatchups(leagueId), getGridShiftStandings(leagueId)]);
    return { matchups, standings };
  });
}

/** Two teams' lineups for one week (read only), for a head-to-head view. */
export function useGridShiftMatchupLineups(leagueId, week, teamIds) {
  const key = leagueId && week && teamIds.length ? `lineups:${leagueId}:${week}:${teamIds.join(',')}` : null;
  return usePlatformQuery(key, async () => {
    const views = await Promise.all(teamIds.map((teamId) => getGridShiftLineup(leagueId, teamId, week)));
    return Object.fromEntries(teamIds.map((teamId, index) => [teamId, views[index]]));
  });
}

/**
 * One team's lineup for a week, with real-time editing: a move shows at once
 * (optimistic), is saved immediately with the whole lineup, and rolls back to
 * the last lineup the platform confirmed if the platform refuses it. Moves made
 * while a save is in flight are saved in order; a refusal drops the moves
 * queued behind it (they were built on the refused one).
 */
export function useGridShiftLineupEditor({ leagueId, teamId, week }) {
  const query = usePlatformQuery(
    leagueId && teamId && week ? `lineup:${leagueId}:${teamId}:${week}` : null,
    () => getGridShiftLineup(leagueId, teamId, week),
  );
  const [confirmed, setConfirmed] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [pending, setPending] = useState(0);
  const [rejection, setRejection] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const chainRef = useRef(Promise.resolve());
  const epochRef = useRef(0);
  const assignmentRef = useRef(null);
  const confirmedRef = useRef(null);

  useEffect(() => {
    epochRef.current += 1;
    const view = query.status === 'ready' ? query.data : null;
    confirmedRef.current = view;
    assignmentRef.current = view?.assignment ?? null;
    queueMicrotask(() => {
      setConfirmed(view);
      setAssignment(view?.assignment ?? null);
      setRejection(null);
      setWarnings([]);
    });
  }, [query.data, query.status]);

  const move = useCallback((from, to) => {
    const current = assignmentRef.current;
    if (!current) return;
    const next = moveLineupPlayer(current, from, to);
    assignmentRef.current = next;
    setAssignment(next);
    setRejection(null);
    setPending((count) => count + 1);
    const epoch = epochRef.current;
    chainRef.current = chainRef.current.then(async () => {
      if (epoch !== epochRef.current) return;
      try {
        const result = await putGridShiftLineup(leagueId, teamId, week, next);
        if (epoch !== epochRef.current) return;
        confirmedRef.current = result?.lineup ?? confirmedRef.current;
        setConfirmed(confirmedRef.current);
        setWarnings(Array.isArray(result?.warnings) ? result.warnings : []);
        // Only adopt the server's arrangement when nothing newer is on screen.
        if (assignmentRef.current === next && result?.lineup?.assignment) {
          assignmentRef.current = result.lineup.assignment;
          setAssignment(result.lineup.assignment);
        }
      } catch (error) {
        if (epoch !== epochRef.current) return;
        epochRef.current += 1;
        const rollback = confirmedRef.current?.assignment ?? null;
        assignmentRef.current = rollback;
        setAssignment(rollback);
        setRejection(describeLineupRejection(error, PROVIDER_LABEL));
      } finally {
        setPending((count) => Math.max(0, count - 1));
      }
    });
  }, [leagueId, teamId, week]);

  const view = useMemo(() => (confirmed ? { ...confirmed, assignment: assignment ?? confirmed.assignment } : null), [assignment, confirmed]);
  return {
    status: query.status,
    error: query.error,
    retry: query.retry,
    lineup: view,
    saving: pending > 0,
    rejection,
    clearRejection: () => setRejection(null),
    warnings,
    move,
  };
}
