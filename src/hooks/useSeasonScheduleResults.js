import { useEffect, useMemo, useState } from 'react';
import { getStatisticsScoresEspnWeek } from '../api/statisticsScoresApi';
import {
  getStartedScheduleWeeks,
  getUnsettledScheduleWeeks,
  mergeSeasonScheduleResults,
} from '../utils/seasonScheduleResults';

// Live weeks are polled often enough to track a game in progress; settled weeks
// are never refetched, so a finished season makes no repeat requests.
const LIVE_POLL_MS = 60_000;

const EMPTY_RESULTS = new Map();

export default function useSeasonScheduleResults(schedule) {
  // Results are stored beside the season they belong to, so a season change
  // discards the previous payloads during render rather than in an effect.
  const [results, setResults] = useState(() => ({ season: null, byWeek: EMPTY_RESULTS }));
  const season = schedule?.season ?? null;
  const resultsByWeek = results.season === season ? results.byWeek : EMPTY_RESULTS;

  const hydrated = useMemo(
    () => mergeSeasonScheduleResults(schedule, resultsByWeek),
    [schedule, resultsByWeek],
  );

  const startedWeeks = useMemo(() => getStartedScheduleWeeks(schedule), [schedule]);
  const startedWeeksKey = startedWeeks.join(',');
  const hasUnsettledWeeks = useMemo(
    () => getUnsettledScheduleWeeks(hydrated).length > 0,
    [hydrated],
  );

  useEffect(() => {
    if (!season || !startedWeeksKey) return undefined;

    const weeks = startedWeeksKey.split(',').map(Number).filter(Number.isFinite);
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      const settled = await Promise.all(weeks.map(async (week) => {
        try {
          const payload = await getStatisticsScoresEspnWeek({
            season,
            phase: 'regular',
            week,
            signal: controller.signal,
          });
          return payload?.scoreboard ? [week, payload.scoreboard] : null;
        } catch {
          // A week that fails to load simply keeps its previous results.
          return null;
        }
      }));

      if (cancelled) return;
      const loaded = settled.filter(Boolean);
      if (!loaded.length) return;

      setResults((current) => {
        const next = new Map(current.season === season ? current.byWeek : EMPTY_RESULTS);
        for (const [week, scoreboard] of loaded) next.set(week, scoreboard);
        return { season, byWeek: next };
      });
    };

    load();
    const timer = hasUnsettledWeeks ? setInterval(load, LIVE_POLL_MS) : null;

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [season, startedWeeksKey, hasUnsettledWeeks]);

  return hydrated;
}
