import { useEffect, useMemo, useRef, useState } from 'react';
import { getStatisticsScoresEspnWeek } from '../api/statisticsScoresApi';
import { cachedPlayerData } from '../utils/playerDataCache.js';
import {
  getStartedScheduleWeeks,
  getUnsettledScheduleWeeks,
  mergeSeasonScheduleResults,
} from '../utils/seasonScheduleResults';
import {
  getScheduleResultsRefreshMs,
  getScheduleScoreboardFingerprint,
  isSettledScheduleScoreboard,
  SCHEDULE_LIVE_REFRESH_MS,
} from '../utils/scheduleResultsPolling.js';
import { createVisiblePoller } from '../utils/visiblePolling.js';

// A settled week (every game final) is fetched once and kept on this device
// (IndexedDB, as a permanent playerDataCache entry), so later visits read it
// without a request. Only started weeks that still hold an unfinished game are
// polled: every 60s around a game's kickoff window, a slow keep-alive
// otherwise, and a timer to the next week's first kickoff when every started
// week is settled. Nothing is requested while the tab is hidden or offline;
// returning refreshes once (visiblePolling.js). Rules: scheduleResultsPolling.js.

const EMPTY_RESULTS = new Map();

function weekGameCount(schedule, week) {
  return (schedule?.weeks ?? []).find((entry) => entry.week === week)?.games?.length ?? 0;
}

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

  // The poller reads the latest schedule and results when it ticks, so a
  // landing result only re-times the next tick and never restarts the load.
  const latestRef = useRef({ schedule, hydrated, resultsByWeek });
  const pollerRef = useRef(null);
  useEffect(() => {
    latestRef.current = { schedule, hydrated, resultsByWeek };
  });
  // Only new results change the decision; keying on the delay itself (a
  // countdown) would pull the next tick earlier on every render.
  useEffect(() => {
    pollerRef.current?.reschedule();
  }, [hydrated]);

  useEffect(() => {
    if (!season) return undefined;

    const fingerprints = new Map();
    let cancelled = false;

    const load = async (weeks) => {
      if (!weeks.length) return;
      const settled = await Promise.all(weeks.map(async (week) => {
        const expectedGames = weekGameCount(latestRef.current.schedule, week);
        try {
          const scoreboard = await cachedPlayerData(
            `schedule-results:v1:${season}:regular:${week}`,
            async () => {
              const payload = await getStatisticsScoresEspnWeek({
                season,
                phase: 'regular',
                week,
              });
              return { data: payload?.scoreboard ?? null, incomplete: !payload?.scoreboard };
            },
            { ttl: 0, final: true, shouldCache: (data) => isSettledScheduleScoreboard(data, expectedGames) },
          );
          return scoreboard ? [week, scoreboard] : null;
        } catch {
          // A week that fails to load simply keeps its previous results.
          return null;
        }
      }));

      if (cancelled) return;
      // Only weeks whose results actually moved replace their entry, so an
      // unchanged poll keeps the hydrated schedule's identity app-wide.
      const changed = settled.filter(Boolean).filter(([week, scoreboard]) => {
        const fingerprint = getScheduleScoreboardFingerprint(scoreboard);
        if (fingerprints.get(week) === fingerprint) return false;
        fingerprints.set(week, fingerprint);
        return true;
      });
      if (!changed.length) return;

      setResults((current) => {
        const next = new Map(current.season === season ? current.byWeek : EMPTY_RESULTS);
        for (const [week, scoreboard] of changed) next.set(week, scoreboard);
        return { season, byWeek: next };
      });
    };

    const weeks = startedWeeksKey ? startedWeeksKey.split(',').map(Number).filter(Number.isFinite) : [];
    void load(weeks);

    const poller = createVisiblePoller({
      // Re-evaluated at each tick, so a week that kicks off while the app is
      // open is picked up without reloading the schedule.
      run: () => load(getUnsettledScheduleWeeks(latestRef.current.hydrated, Date.now())),
      getDelay: () => {
        const { hydrated: latest, resultsByWeek: loaded } = latestRef.current;
        const now = Date.now();
        // A started week with no result yet (its first request failed) keeps
        // the one-minute retry rather than waiting for a kickoff window.
        const missing = getStartedScheduleWeeks(latest, now).some((week) => !loaded.has(week));
        const delay = getScheduleResultsRefreshMs(latest, now);
        return missing ? Math.min(delay ?? SCHEDULE_LIVE_REFRESH_MS, SCHEDULE_LIVE_REFRESH_MS) : delay;
      },
      // The delay counts down to a kickoff window, so a re-time measures from now.
      rescheduleFrom: 'now',
    });
    pollerRef.current = poller;
    poller.start();

    return () => {
      // The shared cache request is not aborted (another mount may be
      // awaiting it); this instance just ignores its answer.
      cancelled = true;
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [season, startedWeeksKey]);

  return hydrated;
}
