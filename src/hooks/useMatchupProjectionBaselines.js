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
      // Bail out when nothing changed: callers can pass a fresh `players` array
      // every render, which re-runs this effect, and an unconditional new state
      // object would then re-render forever.
      if (!cancelled) {
        setState((prev) => (prev.scopeKey === scopeKey
          && JSON.stringify(prev.baselines) === JSON.stringify(baselines)
          ? prev
          : { scopeKey, baselines }));
      }
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
