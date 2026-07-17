import { useCallback, useEffect, useMemo, useState } from 'react';
import { AVAILABLE_SLEEPER_SEASONS, useFantasyLeague } from '../context/SleeperContext.jsx';
import { getLeagueHistorySnapshot } from '../utils/leagueHistory.js';

const LOAD_CONCURRENCY = 2;

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export default function useLeagueHistoryData() {
  const { platform, season, linkedLeagueHistory } = useFantasyLeague();
  const [snapshots, setSnapshots] = useState(null);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  const eligibleLeagueHistory = useMemo(() => (
    (linkedLeagueHistory ?? [])
      .filter((entry) => Number(entry.season) <= Number(season))
      .sort((left, right) => Number(right.season) - Number(left.season))
  ), [linkedLeagueHistory, season]);

  useEffect(() => {
    let cancelled = false;
    if (platform !== 'sleeper') {
      queueMicrotask(() => {
        if (cancelled) return;
        setSnapshots([]);
        setError('');
      });
      return () => { cancelled = true; };
    }

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setSnapshots(null);
      setError('');
      if (eligibleLeagueHistory.length === 0) {
        setSnapshots([]);
        return;
      }
      try {
        const nextSnapshots = await mapWithConcurrency(
          eligibleLeagueHistory,
          LOAD_CONCURRENCY,
          (entry) => getLeagueHistorySnapshot({
            league: entry.league,
            season: entry.season,
            completed: Number(entry.season) < Number(AVAILABLE_SLEEPER_SEASONS[0]),
          }),
        );
        if (!cancelled) setSnapshots(nextSnapshots);
      } catch (loadError) {
        if (!cancelled) {
          setSnapshots([]);
          setError(loadError?.message ?? 'League history could not be loaded.');
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [eligibleLeagueHistory, platform, retryToken]);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  return {
    platform,
    season: String(season ?? ''),
    eligibleLeagueHistory,
    snapshots,
    loading: snapshots == null,
    error,
    retry,
  };
}
