import { useEffect, useState } from 'react';
import {
  captureMatchupProjectionBaselines, getMatchupProjectionBaselines,
  MATCHUP_PROJECTION_BASELINE_STORAGE_KEY, scoringFingerprint, selectMatchupProjectionBaselines,
} from '../utils/matchupProjectionBaseline.js';

const EMPTY_PLAYERS = [];
export default function useMatchupProjectionBaselines({ leagueId, season, week, scoringSettings, players = EMPTY_PLAYERS } = {}) {
  const scopeKey = JSON.stringify([leagueId, season, week, scoringFingerprint(scoringSettings)]);
  const [state, setState] = useState({ scopeKey: '', baselines: {} });
  useEffect(() => {
    let cancelled = false;
    const scope = { leagueId, season, week, scoringSettings };
    const refresh = () => {
      const baselines = selectMatchupProjectionBaselines(getMatchupProjectionBaselines(), scope);
      if (!cancelled) setState({ scopeKey, baselines });
    };
    captureMatchupProjectionBaselines({ ...scope, players });
    queueMicrotask(refresh);
    const onStorage = event => {
      if (event.key?.startsWith(MATCHUP_PROJECTION_BASELINE_STORAGE_KEY) || event.key === null) refresh();
    };
    globalThis.addEventListener?.('storage', onStorage);
    return () => {
      cancelled = true;
      globalThis.removeEventListener?.('storage', onStorage);
    };
  }, [leagueId, season, week, scoringSettings, players, scopeKey]);
  return state.scopeKey === scopeKey ? state.baselines : {};
}
