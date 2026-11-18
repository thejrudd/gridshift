import { useEffect, useState } from 'react';
import { getTeamSeason } from '../api/teamSeasonApi.js';
import { isNflSeasonCompleted } from '../utils/nflSeason.js';
import { createRequestCache } from '../utils/requestCache.js';

const IDLE = { status: 'idle', data: null, error: null };
// A current season is refetched in the background once its cached copy is
// older than this (the server's browser max-age for it), and so is a
// completed season the server marked incomplete; a complete, completed season
// is never refetched while the tab is open.
const REVALIDATE_AFTER_MS = 60_000;

export const teamSeasonDashboardCache = createRequestCache({ maxEntries: 50 });

// One team-season for the team dashboard, keyed by request so a new team or
// season reads as loading without a synchronous reset. A cached team-season
// renders ready on its first render, with no loading state, while a current
// season revalidates in the background.
export function useTeamSeasonDashboard({ season, team, enabled = true }) {
  const key = enabled && season && team ? `${season}:${team}` : null;
  const [result, setResult] = useState({ key: null, ...IDLE });

  useEffect(() => {
    if (!key) return undefined;
    const cached = teamSeasonDashboardCache.peek(key);
    // A completed season is settled unless the server marked it incomplete.
    const settled = cached && isNflSeasonCompleted(season) && cached.value?.complete !== false;
    if (cached && (settled || Date.now() - cached.at < REVALIDATE_AFTER_MS)) return undefined;
    let cancelled = false;
    teamSeasonDashboardCache.load(key, () => getTeamSeason({ season, team }), { force: Boolean(cached) })
      .then((data) => { if (!cancelled) setResult({ key, status: 'ready', data, error: null }); })
      .catch((error) => {
        // A failed background refresh keeps showing the cached team-season.
        if (!cancelled && !cached) setResult({ key, status: 'error', data: null, error: error?.message ?? 'Unavailable' });
      });
    return () => { cancelled = true; };
  }, [key, season, team]);

  if (!key) return IDLE;
  if (result.key === key) return result;
  const cached = teamSeasonDashboardCache.peek(key);
  if (cached) return { key, status: 'ready', data: cached.value, error: null };
  return { ...IDLE, status: 'loading' };
}
