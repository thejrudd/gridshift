import { useEffect, useState } from 'react';
import { getTeamSeason } from '../api/teamSeasonApi.js';

const IDLE = { status: 'idle', data: null, error: null };

// One team-season for the team dashboard, keyed by request so a new team or
// season reads as loading without a synchronous reset.
export function useTeamSeasonDashboard({ season, team, enabled = true }) {
  const key = enabled && season && team ? `${season}:${team}` : null;
  const [result, setResult] = useState({ key: null, ...IDLE });

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    getTeamSeason({ season, team, signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ key, status: 'ready', data, error: null }); })
      .catch((error) => { if (!controller.signal.aborted) setResult({ key, status: 'error', data: null, error: error?.message ?? 'Unavailable' }); });
    return () => controller.abort();
  }, [key, season, team]);

  if (!key) return IDLE;
  if (result.key !== key) return { ...IDLE, status: 'loading' };
  return result;
}
