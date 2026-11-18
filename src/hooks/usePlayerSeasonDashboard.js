import { useEffect, useState } from 'react';
import { getPlayerSeason, getPlayerSeasonPools } from '../api/playerSeasonApi.js';
import { DASHBOARD_TAB_GROUPS } from '../utils/playerSeason/dashboardModel.js';
import { isNflSeasonCompleted } from '../utils/nflSeason.js';
import { createRequestCache } from '../utils/requestCache.js';

const IDLE = { status: 'idle', season: null, pools: null, error: null, poolsError: null };
// A current season is refetched in the background once its cached copy is
// older than this (the server's browser max-age for it), and so is a
// completed season the server marked incomplete; a complete, completed season
// is never refetched while the tab is open.
const REVALIDATE_AFTER_MS = 60_000;

// Player-seasons and league pools share one bounded cache. Pools are keyed by
// season and group alone, so every player in a position group reuses them.
export const playerSeasonDashboardCache = createRequestCache({ maxEntries: 50 });

const seasonKeyFor = (key) => `season:${key}`;
const poolsKeyFor = (season, group) => `pools:${season}:${group}`;

// Ranks use Sleeper's position group; when it differs from the page's
// (an edge rusher ESPN lists as LB), that group's pools are used instead.
function rankGroupFor(seasonPayload, group) {
  const rankGroup = seasonPayload?.rankGroup;
  return DASHBOARD_TAB_GROUPS.includes(rankGroup) ? rankGroup : group;
}

// A cached dashboard needs both its player-season and the pools it ranks against.
function readCached(key, season, group) {
  if (!key) return null;
  const seasonEntry = playerSeasonDashboardCache.peek(seasonKeyFor(key));
  if (!seasonEntry) return null;
  const poolsEntry = playerSeasonDashboardCache.peek(poolsKeyFor(season, rankGroupFor(seasonEntry.value, group)));
  if (!poolsEntry) return null;
  return {
    at: Math.min(seasonEntry.at, poolsEntry.at),
    result: { key, status: 'ready', season: seasonEntry.value, pools: poolsEntry.value, error: null, poolsError: null },
  };
}

// The player dashboard's two payloads for one player-season: his games and
// credited plays, and his position group's league pools. Either can fail on
// its own; the dashboard shows what loaded. State is keyed by the request so a
// new player or season reads as loading without a synchronous reset, and a
// cached player-season renders ready on its first render, with no loading
// state, while a current season revalidates in the background.
export function usePlayerSeasonDashboard({ season, team, name, position, group, sleeperId, enabled = true }) {
  const key = enabled && season && team && name && position && group
    ? JSON.stringify([season, team, name, position, group, sleeperId ?? null])
    : null;
  const [result, setResult] = useState({ key: null, ...IDLE });

  useEffect(() => {
    if (!key) return undefined;
    const cached = readCached(key, season, group);
    // A completed season is settled unless the server marked it incomplete.
    const settled = cached && isNflSeasonCompleted(season) && cached.result.season?.complete !== false;
    if (cached && (settled || Date.now() - cached.at < REVALIDATE_AFTER_MS)) return undefined;
    let cancelled = false;
    const force = Boolean(cached);
    const loadPools = (poolsGroup) => playerSeasonDashboardCache.load(
      poolsKeyFor(season, poolsGroup),
      () => getPlayerSeasonPools({ season, group: poolsGroup }),
      { force },
    );
    const seasonRequest = playerSeasonDashboardCache.load(
      seasonKeyFor(key),
      () => getPlayerSeason({ season, team, name, position, sleeperId }),
      { force },
    );
    const poolsRequest = loadPools(group);
    const rankedPools = Promise.allSettled([seasonRequest, poolsRequest]).then(async ([seasonResult, poolsResult]) => {
      const rankGroup = seasonResult.value?.rankGroup;
      if (seasonResult.status !== 'fulfilled' || !DASHBOARD_TAB_GROUPS.includes(rankGroup) || rankGroup === group) return [seasonResult, poolsResult];
      const [swapped] = await Promise.allSettled([loadPools(rankGroup)]);
      return [seasonResult, swapped];
    });
    rankedPools.then(([seasonResult, poolsResult]) => {
      if (cancelled) return;
      // A failed background refresh keeps showing the cached dashboard.
      if (cached && (seasonResult.status === 'rejected' || poolsResult.status === 'rejected')) return;
      setResult({
        key,
        status: seasonResult.status === 'fulfilled' ? 'ready' : 'error',
        season: seasonResult.status === 'fulfilled' ? seasonResult.value : null,
        pools: poolsResult.status === 'fulfilled' ? poolsResult.value : null,
        error: seasonResult.status === 'rejected' ? seasonResult.reason?.message ?? 'Unavailable' : null,
        poolsError: poolsResult.status === 'rejected' ? poolsResult.reason?.message ?? 'Unavailable' : null,
      });
    });
    return () => { cancelled = true; };
  }, [group, key, name, position, season, sleeperId, team]);

  if (!key) return IDLE;
  if (result.key === key) return result;
  const cached = readCached(key, season, group);
  if (cached) return cached.result;
  return { ...IDLE, status: 'loading' };
}
