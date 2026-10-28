import { useCallback, useEffect, useState } from 'react';
import {
  getGridShiftLeague,
  getGridShiftMatchups,
  getGridShiftStandings,
  getGridShiftTeams,
  getGridShiftWeeks,
} from '../api/gridshiftPlatformApi.js';
import { buildGridShiftStandingsModel } from '../utils/gridshiftLeagueAdapter.js';
import { LEAGUE_PROVIDER_IDS } from '../utils/leagueProviderContract.js';

function stateModel(status, { season = '', error = '', retry }) {
  return {
    provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
    status,
    season,
    error,
    retry,
    historical: false,
    standings: null,
    brackets: null,
    finalPlacements: null,
    postseason: null,
  };
}

/** Standings for one GridShift league, as a contract StandingsModel. */
export default function useGridShiftStandings(leagueId, season = '') {
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  const [model, setModel] = useState(() => stateModel('loading', { season, retry }));

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setModel(stateModel('loading', { season, retry }));
      try {
        const [league, teams, standings, weeks, matchups] = await Promise.all([
          getGridShiftLeague(leagueId),
          getGridShiftTeams(leagueId),
          getGridShiftStandings(leagueId),
          getGridShiftWeeks(leagueId),
          getGridShiftMatchups(leagueId),
        ]);
        if (!cancelled) setModel(buildGridShiftStandingsModel({ league, teams, standings, weeks, matchups }, { retry }));
      } catch (error) {
        if (cancelled) return;
        const status = error?.status === 401 ? 'signed-out' : 'error';
        setModel(stateModel(status, { season, error: error?.message ?? 'Standings could not be loaded.', retry }));
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [leagueId, retry, retryToken, season]);

  return model;
}
