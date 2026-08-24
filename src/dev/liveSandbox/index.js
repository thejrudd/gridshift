// Fantasy Live sandbox — dev-only harness.
//
// Fantasy Live is gated to the NFL regular season and reads its roster from a
// connected fantasy league, so outside the season there is nothing to look at.
// The sandbox substitutes a synthetic two-roster league built from a real,
// completed week and replays that week forward on a scrubbable clock.
//
// Enable with VITE_LIVE_SANDBOX=true in .env.local. The flag is compiled out of
// production builds: import.meta.env.DEV is statically false there, so the
// fixture and replay code are dropped by the bundler.

import { useMemo } from 'react';
import { LIVE_SANDBOX_FIXTURE } from '../../data/liveSandboxFixture';
import { LIVE_SANDBOX_PRESEASON_FIXTURE } from '../../data/liveSandboxPreseasonFixture';
import { subscribeToRewind, useReplayClock } from './liveSandboxClock';
import { LIVE_SANDBOX_ENABLED } from './liveSandboxFlag';
import { isReplayMode, useSandboxMode } from './liveSandboxMode';
import * as sandboxLiveSource from './liveSandboxSource';

export { LIVE_SANDBOX_ENABLED, sandboxLiveSource, subscribeToRewind };
export {
  CHART_SCALES,
  getChartScale,
  setChartScale,
  useChartScale,
} from './liveSandboxChartScale';
export {
  SANDBOX_MODES,
  getSandboxMode,
  isPreseasonMode,
  isReplayMode,
  setSandboxMode,
  subscribeToMode,
  useSandboxMode,
} from './liveSandboxMode';
export { spreadEventsAcrossInterval, splitDeltaIntoPlays } from './liveSandboxReplay';
export { buildReplayDeltaEvents } from './liveSandboxPlays';
export { default as LiveSandboxPanel } from './LiveSandboxPanel.jsx';

const FIXTURES = {
  replay: LIVE_SANDBOX_FIXTURE,
  preseason: LIVE_SANDBOX_PRESEASON_FIXTURE,
};

// Both leagues share an id so a single server allowlist entry covers them.
export const LIVE_SANDBOX_LEAGUE_ID = LIVE_SANDBOX_FIXTURE.league.league_id;

// Sleeper's NFL state drives the regular-season gate and the active week.
// The sandbox reports the replayed week as the live one.
function buildSandboxNflState(fixture) {
  return {
    season: fixture.season,
    season_type: 'regular',
    week: fixture.week,
    leg: fixture.week,
    display_week: fixture.week,
  };
}

function buildDisplayNameLookup(fixture) {
  const byId = new Map(fixture.users.map((user) => [user.user_id, user.display_name]));
  return (userId) => byId.get(userId) ?? '';
}

// Replaces the connected-league half of useSleeperBase(). Only the fields
// Fantasy Live actually reads are provided; the caller merges this over the
// real context value, so anything omitted falls through to the real one.
function buildSandboxBase(fixture) {
  const { league, rosters, matchups, players, season } = fixture;
  const getUserDisplayName = buildDisplayNameLookup(fixture);
  return {
    platform: 'sleeper',
    selectedLeagueId: league.league_id,
    league,
    season,
    rosters,
    players,
    getUserDisplayName,
    activeScoringSettings: league.scoring_settings,
    // The sandbox league has a single matchup, and only in the replayed week.
    loadMatchups: async (_leagueId, week) => (
      Number(week) === Number(fixture.week) ? matchups : []
    ),
    loadPlayers: async () => players,
    // Prior-week history drives the real projection pipeline. Without it
    // buildProjectionContext() returns null and every starter loses its
    // projection, which makes the chart's pace rays drift.
    weeklyStats: fixture.weeklyStats ?? {},
    myRoster: () => rosters[0],
    espnIdOverrides: {},
  };
}

// Built once per mode. The fixture league does not change as the clock runs,
// and the view keys effects off these functions and objects — rebuilding them
// each tick would restart matchup loading on every frame of the replay.
const BUILT = Object.fromEntries(
  Object.entries(FIXTURES).map(([mode, fixture]) => [mode, LIVE_SANDBOX_ENABLED
    ? { base: buildSandboxBase(fixture), nflState: buildSandboxNflState(fixture), fixture }
    : null]),
);

export function useLiveSandbox() {
  // Hooks must run unconditionally; both stores are inert while disabled.
  const clock = useReplayClock();
  const mode = useSandboxMode();
  return useMemo(() => {
    // Automated production-path checks can opt out even when the developer's
    // local server has the replay harness enabled. This stays inside the
    // dev-only sandbox module and is absent from production bundles.
    const disabledForRoute = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('liveSandbox') === 'off';
    if (!LIVE_SANDBOX_ENABLED || disabledForRoute) return null;
    const built = BUILT[mode] ?? BUILT.replay;
    return {
      mode,
      base: built.base,
      nflState: built.nflState,
      // Included in the live-fetch cache key so scrubbing re-slices immediately
      // instead of waiting for the next auto-refresh tick.
      clockVersion: clock.version,
      progress: clock.progress,
      getGameProgress: sandboxLiveSource.getReplayGameProgress,
      // Shared slate axis: feed events and the pace chart must agree on both
      // where an event sits and when it happened.
      toSlateProgress: sandboxLiveSource.toSlateProgress,
      instantAt: sandboxLiveSource.getReplayInstantAt,
      fixture: built.fixture,
      replay: isReplayMode(),
    };
  }, [clock.progress, clock.version, mode]);
}
