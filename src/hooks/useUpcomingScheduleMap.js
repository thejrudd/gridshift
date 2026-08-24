import { useEffect, useState } from 'react';
import { loadSeasonSchedule } from '../utils/seasonSchedule.js';
import { buildUpcomingScheduleMap } from '../utils/draftAssistant/scheduleStrength.js';
import { buildByeWeekScheduleBundle } from '../utils/draftAssistant/byeWeeks.js';

// public/season-schedule.json is a static build asset, so one fetch per session is enough
// no matter how many War Room surfaces mount.
let cachedSchedulePromise = null;

function loadUpcomingSchedule() {
  if (!cachedSchedulePromise) {
    cachedSchedulePromise = loadSeasonSchedule().catch(() => null);
  }
  return cachedSchedulePromise;
}

function loadUpcomingScheduleBundle(expectedSeason = null) {
  return loadUpcomingSchedule().then((schedule) => {
    if (!schedule) return buildByeWeekScheduleBundle(null, { expectedSeason });
    const rawMap = buildUpcomingScheduleMap(schedule);
    const scheduleMap = Object.keys(rawMap).length ? rawMap : null;
    return buildByeWeekScheduleBundle(schedule, { expectedSeason, scheduleMap });
  });
}

/**
 * Upcoming-season opponents keyed `{ [week]: { [team]: { opp, home, kickoff, completed } } }`,
 * shared by Statistics › Schedule and War Room schedule strength.
 */
export function useUpcomingScheduleMap() {
  const [scheduleMap, setScheduleMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadUpcomingScheduleBundle().then((bundle) => {
      if (!cancelled) setScheduleMap(bundle?.scheduleMap ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  return scheduleMap;
}

/**
 * Season-aware companion to useUpcomingScheduleMap. Consumers that infer a bye
 * from a missing team must use this validated bundle rather than the raw map.
 */
export function useUpcomingScheduleBundle(expectedSeason = null) {
  const [bundle, setBundle] = useState(null);
  const seasonKey = expectedSeason == null ? null : String(expectedSeason);

  useEffect(() => {
    let cancelled = false;
    loadUpcomingScheduleBundle(seasonKey).then((nextBundle) => {
      if (!cancelled) setBundle(nextBundle);
    });
    return () => { cancelled = true; };
  }, [seasonKey]);

  return bundle;
}
