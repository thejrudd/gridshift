import { buildBdlLiveClockGames } from './balldontlieNflScoreboard.js';
import { isDeepEqual } from './liveRefreshCadence.js';

// Fantasy Matchups' samples for the shared live game clock
// (`liveClockTicker.js`), held by useMatchupLiveFeed apart from its game list.
// Rules: docs/Fantasy Live.md.

const NO_GAMES = Object.freeze([]);
const NO_PLAYS = Object.freeze({});
// Never mutated: the empty ticking-clock map.
export const NO_CLOCK_GAMES = new Map();
export const EMPTY_CLOCK_STATE = Object.freeze({
  key: null, rawGames: NO_GAMES, gamesSample: null, latestPlays: NO_PLAYS, clockGames: NO_CLOCK_GAMES,
});

// Timing of one live response for the shared game clock: this device's
// receipt and the server's sample age (receipt minus age is the fetch moment
// in this device's clock), with the provider fetch time and stale state.
export function getClockSampleTiming(payload, observedAt) {
  const rawAge = payload?.freshness?.ageMs ?? payload?.cache?.ageMs;
  const age = rawAge == null || rawAge === '' ? Number.NaN : Number(rawAge);
  return {
    observedAt,
    providerFetchedAt: payload?.freshness?.providerFetchedAt ?? payload?.cache?.fetchedAt ?? null,
    ageMs: Number.isFinite(age) && age >= 0 ? age : null,
    feedStale: payload?.freshness?.stale === true || payload?.cache?.stale === true,
  };
}

/**
 * The ticking-clock games for one feed: the week's provider game rows and the
 * latest play of each game, with the timing of the responses that carried
 * them, folded into `buildBdlLiveClockGames()` (the same anchor and latest-play
 * rules as Statistics Scores). Kept apart from `liveGames`, which never
 * changes for the clock. Returns `previous` when nothing the clock reads moved,
 * so an unchanged poll re-renders nothing.
 */
export function advanceLiveClockState(previous, feedKey, patch, { enabled = true } = {}) {
  const base = previous.key === feedKey ? previous : { ...EMPTY_CLOCK_STATE, key: feedKey };
  const next = { ...base, ...patch(base) };
  const rawGames = isDeepEqual(base.rawGames, next.rawGames) ? base.rawGames : next.rawGames;
  const clockGames = buildBdlLiveClockGames(base.clockGames, rawGames, {
    gamesSample: next.gamesSample,
    latestPlays: next.latestPlays,
    enabled,
  });
  if (previous.key === feedKey
    && clockGames === previous.clockGames
    && rawGames === previous.rawGames
    && next.latestPlays === previous.latestPlays) {
    return previous;
  }
  return { ...next, key: feedKey, rawGames, clockGames };
}
