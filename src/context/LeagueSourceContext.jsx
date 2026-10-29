import { useCallback, useMemo, useState } from 'react';
import { isGridShiftPlatformConfigured } from '../api/gridshiftPlatformApi.js';
import { LEAGUE_PROVIDER_IDS } from '../utils/leagueProviderContract.js';
import LeagueSourceContext from './LeagueSourceContext.js';

// Which provider League views read from. The default is the Sleeper path in
// SleeperContext, untouched. A GridShift league can be chosen only when the
// platform is configured (VITE_GRIDSHIFT_PLATFORM_URL) and the signed-in
// account lists it; the choice is remembered per browser. Since Stage 5.2 it is
// the one active league for every tab (see docs/League Provider Contract.md).

const STORAGE_KEY = 'gridshift.leagueSource.v1';

function readStoredGridShiftLeague() {
  if (!isGridShiftPlatformConfigured()) return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored?.provider !== LEAGUE_PROVIDER_IDS.GRIDSHIFT || typeof stored.leagueId !== 'string' || !stored.leagueId) return null;
    return {
      provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
      leagueId: stored.leagueId,
      name: typeof stored.name === 'string' ? stored.name : 'League',
      season: typeof stored.season === 'string' ? stored.season : '',
    };
  } catch {
    return null;
  }
}

function writeStoredGridShiftLeague(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

export function LeagueSourceProvider({ children }) {
  const [gridshiftLeague, setGridShiftLeague] = useState(readStoredGridShiftLeague);

  const selectGridShiftLeague = useCallback((summary) => {
    if (!isGridShiftPlatformConfigured() || !summary?.leagueId) return;
    const next = {
      provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
      leagueId: String(summary.leagueId),
      name: String(summary.name ?? 'League'),
      season: String(summary.season ?? ''),
    };
    writeStoredGridShiftLeague(next);
    setGridShiftLeague(next);
  }, []);

  const clearGridShiftLeague = useCallback(() => {
    writeStoredGridShiftLeague(null);
    setGridShiftLeague(null);
  }, []);

  const value = useMemo(() => ({
    platformConfigured: isGridShiftPlatformConfigured(),
    provider: gridshiftLeague ? LEAGUE_PROVIDER_IDS.GRIDSHIFT : LEAGUE_PROVIDER_IDS.SLEEPER,
    gridshiftLeague,
    selectGridShiftLeague,
    clearGridShiftLeague,
  }), [clearGridShiftLeague, gridshiftLeague, selectGridShiftLeague]);

  return <LeagueSourceContext.Provider value={value}>{children}</LeagueSourceContext.Provider>;
}
