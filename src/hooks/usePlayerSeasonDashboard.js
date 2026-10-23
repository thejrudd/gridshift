import { useEffect, useState } from 'react';
import { getPlayerSeason, getPlayerSeasonPools } from '../api/playerSeasonApi.js';
import { DASHBOARD_TAB_GROUPS } from '../utils/playerSeason/dashboardModel.js';

const IDLE = { status: 'idle', season: null, pools: null, error: null, poolsError: null };

// The player dashboard's two payloads for one player-season: his games and
// credited plays, and his position group's league pools. Either can fail on
// its own; the dashboard shows what loaded. State is keyed by the request so a
// new player or season reads as loading without a synchronous reset.
export function usePlayerSeasonDashboard({ season, team, name, position, group, sleeperId, enabled = true }) {
  const key = enabled && season && team && name && position && group
    ? JSON.stringify([season, team, name, position, group, sleeperId ?? null])
    : null;
  const [result, setResult] = useState({ key: null, ...IDLE });

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    const seasonRequest = getPlayerSeason({ season, team, name, position, sleeperId, signal: controller.signal });
    const poolsRequest = getPlayerSeasonPools({ season, group, signal: controller.signal });
    // Ranks use Sleeper's position group; when it differs from the page's
    // (an edge rusher ESPN lists as LB), swap in that group's pools.
    const rankedPools = Promise.allSettled([seasonRequest, poolsRequest]).then(async ([seasonResult, poolsResult]) => {
      const rankGroup = seasonResult.value?.rankGroup;
      if (seasonResult.status !== 'fulfilled' || !DASHBOARD_TAB_GROUPS.includes(rankGroup) || rankGroup === group) return [seasonResult, poolsResult];
      const [swapped] = await Promise.allSettled([getPlayerSeasonPools({ season, group: rankGroup, signal: controller.signal })]);
      return [seasonResult, swapped];
    });
    rankedPools.then(([seasonResult, poolsResult]) => {
      if (controller.signal.aborted) return;
      setResult({
        key,
        status: seasonResult.status === 'fulfilled' ? 'ready' : 'error',
        season: seasonResult.status === 'fulfilled' ? seasonResult.value : null,
        pools: poolsResult.status === 'fulfilled' ? poolsResult.value : null,
        error: seasonResult.status === 'rejected' ? seasonResult.reason?.message ?? 'Unavailable' : null,
        poolsError: poolsResult.status === 'rejected' ? poolsResult.reason?.message ?? 'Unavailable' : null,
      });
    });
    return () => controller.abort();
  }, [group, key, name, position, season, sleeperId, team]);

  if (!key) return IDLE;
  if (result.key !== key) return { ...IDLE, status: 'loading' };
  return result;
}
