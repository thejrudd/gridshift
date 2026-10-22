// Pure "as of" derivations for the Matchups live layer.
//
// The replay bar, chart, scoring plays and player rows all read one moment on
// the kickoff-window axis (0..1, matchupSlateAxis.js). `null` means live. These
// helpers turn the live feed's series and events into what the page shows at
// that moment, oriented to the viewer's side ("mine") and the opponent's.

const EPSILON = 1e-6;

function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Each event's points split by rostered contributor. A grouped feed row (a QB
// touchdown pass to a receiver on the same roster) moves both players.
export function getEventContributions(event) {
  if (Array.isArray(event?.contributors) && event.contributors.length) {
    return event.contributors
      .filter((contributor) => contributor?.playerId != null)
      .map((contributor) => ({ playerId: String(contributor.playerId), pts: finite(contributor.pts) ?? 0 }));
  }
  return event?.playerId != null ? [{ playerId: String(event.playerId), pts: finite(event.pts) ?? 0 }] : [];
}

/**
 * The series point in force at `at` (the last one at or before it). The live
 * close sits at NOW, so `at = null` returns the last point.
 */
export function getSeriesPointAt(series = [], at = null) {
  if (!series.length) return null;
  if (at == null) return series[series.length - 1];
  let found = series[0];
  series.forEach((point) => {
    const x = finite(point?.x);
    if (x != null && x <= at + EPSILON) found = point;
  });
  return found;
}

/**
 * The matchup as of `at`, from "mine"'s perspective.
 *
 * @param {object} options
 * @param {Array} options.series  buildPaceSeries points: { x, a, b, p (0-100, side a), expectedA, expectedB }.
 * @param {Array} options.events  Feed events: { progress, pts, playerId, contributors? }.
 * @param {'a'|'b'} options.mineKey  Which series side is the viewer's.
 * @param {number|null} options.at  Axis position; null = live.
 */
export function buildReplayFrame({ series = [], events = [], mineKey = 'a', at = null } = {}) {
  const oppKey = mineKey === 'a' ? 'b' : 'a';
  const point = getSeriesPointAt(series, at);
  const pointsByPlayer = new Map();
  events.forEach((event) => {
    const x = finite(event?.progress);
    if (at != null && (x == null || x > at + EPSILON)) return;
    getEventContributions(event).forEach(({ playerId, pts }) => {
      pointsByPlayer.set(playerId, Math.round(((pointsByPlayer.get(playerId) ?? 0) + pts) * 100) / 100);
    });
  });
  const pA = finite(point?.p);
  const winMine = pA == null ? null : (mineKey === 'a' ? pA : 100 - pA);
  const expected = (key) => finite(key === 'a' ? point?.expectedA : point?.expectedB);
  return {
    at,
    mine: finite(point?.[mineKey]) ?? 0,
    opp: finite(point?.[oppKey]) ?? 0,
    winMine,
    expectedMine: expected(mineKey),
    expectedOpp: expected(oppKey),
    pointsByPlayer,
  };
}

/**
 * A starter's game state at `at` on the axis: 'pre' | 'live' | 'final', with
 * the game's progress (0..1) when live. `liveState` is the game's state now
 * and wins when `at` is null.
 */
export function getGameStateAt({ axis, gameId, at = null, liveState = null, liveProgress = null } = {}) {
  if (at == null) {
    if (liveState) return { state: liveState, progress: liveState === 'final' ? 1 : liveState === 'live' ? finite(liveProgress) ?? 0 : 0 };
    return { state: 'pre', progress: 0 };
  }
  const window = axis?.windowByGameId?.get(String(gameId ?? ''));
  if (!window) return { state: liveState === 'final' ? 'final' : 'pre', progress: liveState === 'final' ? 1 : 0 };
  if (at < window.p0 - EPSILON) return { state: 'pre', progress: 0 };
  const progress = Math.min(1, (at - window.p0) / Math.max(EPSILON, window.p1 - window.p0));
  if (progress >= 1 - EPSILON) return { state: 'final', progress: 1 };
  // A game that is live right now cannot be further along in a replay than it
  // is live, and one that has not kicked off yet is still "pre".
  if (liveState === 'pre' || liveState === 'scheduled') return { state: 'pre', progress: 0 };
  return { state: 'live', progress };
}

/** Both / Mine / Theirs / Big plays. `side` is the event's side: 'mine' | 'opp'. */
export function filterScoringPlays(events = [], { side = 'all', bigOnly = false, bigPlayThreshold = 6, sideOf = () => null } = {}) {
  return events.filter((event) => {
    const eventSide = sideOf(event);
    if (!eventSide) return false;
    if (side !== 'all' && eventSide !== side) return false;
    if (!bigOnly) return true;
    const pts = Math.abs(finite(event?.pts) ?? 0);
    return event?.kind === 'td' || pts >= bigPlayThreshold || (finite(event?.pts) ?? 0) < 0;
  });
}

// Stat keys (per play, from its stat delta) that make a play a score or a
// turnover even when the play's own `kind` does not say so: defensive and IDP
// takeaways, safeties and two-point conversions.
const SCORE_STAT_KEYS = ['safe', 'idp_safe', 'pass_2pt', 'rush_2pt', 'rec_2pt', 'def_2pt'];
const TURNOVER_STAT_KEYS = ['int', 'fum_rec', 'idp_int', 'idp_fum_rec', 'pass_int', 'fum_lost'];
const NOTABLE_PLAY_POINTS = 6;

/**
 * A chart-dot play: any score (touchdown, field goal, extra point, safety,
 * two-point conversion), any turnover (thrown, lost, or forced by a fantasy
 * defense), or any single play worth 6+ fantasy points either way. Every other
 * play still moves the line; it just has no dot.
 */
export function isNotablePlay(event) {
  // A stat-update row is points Sleeper credited that no play explains, often
  // a whole stat line at once: it moves the line but is not a single play.
  if (!event || event.source === 'stat-update') return false;
  if (['td', 'fg', 'xp', 'to'].includes(event.kind)) return true;
  // The play's own points (`rawPts` once reconciled), not the displayed total
  // that also carries the reconciliation residual.
  if (Math.abs(finite(event.rawPts ?? event.pts) ?? 0) >= NOTABLE_PLAY_POINTS) return true;
  const statSets = [event.stats, ...(event.contributors ?? []).map((contributor) => contributor.stats)].filter(Boolean);
  return statSets.some((stats) => (
    [...SCORE_STAT_KEYS, ...TURNOVER_STAT_KEYS].some((key) => (finite(stats[key]) ?? 0) > 0)
    || (event.contributors ?? []).some((contributor) => ['td', 'fg', 'xp', 'to'].includes(contributor.kind))
  ));
}

/** Which hover-card view a starter gets: season before kickoff, this game while live, a summary once final. */
export function getHoverCardMode(state) {
  if (state === 'live') return 'live';
  if (state === 'final') return 'final';
  return 'season';
}
