import { useEffect, useState } from 'react';
import { loadPlayerMatchupTimeline } from '../utils/playerMatchupTimeline.js';

const IDLE = { status: 'idle', events: [], message: null, stale: false };

export function usePlayerMatchupTimeline({ enabled, phase, leagueId, platform, season, week, playerId, players, team, opponent, scoringSettings }) {
  const key = `${leagueId}|${platform}|${season}|${week}|${playerId}|${team}|${opponent}`;
  const [state, setState] = useState({ key: '', value: IDLE });
  useEffect(() => {
    if (!enabled || phase === 'pregame') return undefined;
    const controller = new AbortController();
    let timer;
    let inFlight = false;
    let previous = null;
    const refresh = async () => {
      if (controller.signal.aborted || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const value = await loadPlayerMatchupTimeline({ leagueId, platform, season, week, playerId, players, team, opponent, scoringSettings, signal: controller.signal });
        if (!controller.signal.aborted) {
          previous = value;
          setState({ key, scoringSettings, value });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ key, scoringSettings, value: previous?.events?.length
            ? { ...previous, stale: true, message: 'The timeline could not refresh. Showing the last available plays.' }
            : { status: 'error', events: [], stale: false, message: error?.message || 'The play timeline could not be loaded.' } });
        }
      } finally {
        inFlight = false;
      }
    };
    refresh();
    if (phase === 'live') timer = setInterval(refresh, 30000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, phase, leagueId, platform, season, week, playerId, players, team, opponent, scoringSettings, key]);
  if (!enabled || phase === 'pregame') return IDLE;
  return state.key === key && state.scoringSettings === scoringSettings ? state.value : { ...IDLE, status: 'loading' };
}
