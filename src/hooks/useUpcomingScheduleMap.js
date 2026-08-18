import { useEffect, useState } from 'react';
import { loadSeasonSchedule } from '../utils/seasonSchedule.js';
import { buildUpcomingScheduleMap } from '../utils/draftAssistant/scheduleStrength.js';

// public/season-schedule.json is a static build asset, so one fetch per session is enough
// no matter how many War Room surfaces mount.
let cachedPromise = null;

function loadUpcomingScheduleMap() {
  if (!cachedPromise) {
    cachedPromise = loadSeasonSchedule()
      .then((schedule) => {
        const map = buildUpcomingScheduleMap(schedule);
        return Object.keys(map).length ? map : null;
      })
      .catch(() => null);
  }
  return cachedPromise;
}

/**
 * Upcoming-season opponents keyed `{ [week]: { [team]: { opp, home, kickoff, completed } } }`,
 * shared by Statistics › Schedule and War Room schedule strength.
 */
export function useUpcomingScheduleMap() {
  const [scheduleMap, setScheduleMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadUpcomingScheduleMap().then((map) => {
      if (!cancelled) setScheduleMap(map);
    });
    return () => { cancelled = true; };
  }, []);

  return scheduleMap;
}
