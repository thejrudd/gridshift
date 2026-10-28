import { createContext, useContext } from 'react';
import { LEAGUE_PROVIDER_IDS } from '../utils/leagueProviderContract.js';

// Context object and reader for LeagueSourceProvider (LeagueSourceContext.jsx).
const LeagueSourceContext = createContext(null);

const SLEEPER_ONLY = Object.freeze({
  platformConfigured: false,
  provider: LEAGUE_PROVIDER_IDS.SLEEPER,
  gridshiftLeague: null,
  selectGridShiftLeague: () => {},
  clearGridShiftLeague: () => {},
});

/** Outside the provider (isolated renders, tests) this reports the Sleeper path. */
export function useLeagueSource() {
  return useContext(LeagueSourceContext) ?? SLEEPER_ONLY;
}

export default LeagueSourceContext;
