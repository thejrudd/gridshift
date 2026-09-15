// Pure replay slicing for the Fantasy Live sandbox.
//
// Takes a completed NFL week's real games and box scores and renders them as
// they looked at an arbitrary point during that week. Everything here is a
// pure function of (final data, progress) so the replay is deterministic and
// can be scrubbed backwards as well as forwards.
//
// Nothing in this module is shipped to production; see liveSandbox.js.

import {
  buildStatIndex,
  getStatKeyForSleeperPlayer,
  mapBdlStatsToGridShift,
} from '../../utils/liveScoringFeed.js';
import { calcPoints } from '../../utils/scoringEngine.js';
import {
  buildDemoTimeline,
  mapGameProgressToDemoTimeline,
} from '../../utils/liveDemoTimeline.js';
export { splitDeltaIntoPlays } from '../../utils/livePlaySplitting.js';

// A regulation game occupies roughly this much wall-clock time.
export const GAME_DURATION_MS = 3 * 60 * 60 * 1000 + 10 * 60 * 1000;
const QUARTER_MS = GAME_DURATION_MS / 4;
const QUARTER_CLOCK_SECONDS = 15 * 60;

// Derived/rate stats describe a whole performance and must never be scaled —
// only counting stats accumulate as a game plays out.
const UNSCALED_STAT_FIELDS = new Set([
  'yards_per_pass_attempt',
  'yards_per_rush_attempt',
  'yards_per_reception',
  'yards_per_kick_return',
  'yards_per_punt_return',
  'qbr',
  'qb_rating',
  'field_goal_pct',
  'gross_avg_punt_yards',
  'long_rushing',
  'long_reception',
  'long_field_goal_made',
  'long_kick_return',
  'long_punt_return',
  'long_punt',
]);

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getGameKickoffMs(game) {
  const parsed = Date.parse(game?.date ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

// The replay window spans the first kickoff of the week through the end of the
// last game, so a single 0..1 progress value staggers games exactly the way a
// real game day does: early games final while late games are still in Q2.
export function getReplayWindow(games = []) {
  const kickoffs = games.map(getGameKickoffMs).filter((value) => value != null);
  if (!kickoffs.length) return null;
  const start = Math.min(...kickoffs);
  const end = Math.max(...kickoffs) + GAME_DURATION_MS;
  return { start, end, durationMs: end - start };
}

// An NFL week is mostly dead air: Thursday night, then nothing until Sunday.
// Scrubbing across real wall-clock time would spend most of the slider on
// hours where no game is being played. Collapsing the gaps means every part of
// the slider lands on football, while order and overlap stay true to life.
export function getReplaySegments(games = []) {
  const intervals = games
    .map((game) => getGameKickoffMs(game))
    .filter((value) => value != null)
    .map((kickoff) => [kickoff, kickoff + GAME_DURATION_MS])
    .sort((a, b) => a[0] - b[0]);
  if (!intervals.length) return [];

  const merged = [intervals[0].slice()];
  intervals.slice(1).forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });

  let elapsed = 0;
  return merged.map(([start, end]) => {
    const segment = { start, end, offset: elapsed, durationMs: end - start };
    elapsed += segment.durationMs;
    return segment;
  });
}

export function getReplayActiveDuration(games = []) {
  return getReplaySegments(games).reduce((total, segment) => total + segment.durationMs, 0);
}

// Maps 0..1 onto the gap-free timeline and returns the real instant it lands on.
export function getReplayInstant(games, progress) {
  const segments = getReplaySegments(games);
  if (!segments.length) return null;
  const total = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
  const target = total * clamp01(progress);
  const segment = segments.find((entry) => target <= entry.offset + entry.durationMs)
    ?? segments[segments.length - 1];
  return segment.start + Math.min(segment.durationMs, target - segment.offset);
}

// How far through its own 60 minutes a single game is at the replay instant.
export function getGameProgress(game, instantMs) {
  const kickoff = getGameKickoffMs(game);
  if (kickoff == null || instantMs == null) return 0;
  return clamp01((instantMs - kickoff) / GAME_DURATION_MS);
}

function getQuarterScores(game, side) {
  const prefix = side === 'home' ? 'home_team' : 'visitor_team';
  return [1, 2, 3, 4].map((quarter) => Number(game?.[`${prefix}_q${quarter}`] ?? 0) || 0);
}

// Rebuild the scoreboard from the game's real quarter-by-quarter scoring so an
// in-progress score is a score that actually existed, not a linear guess.
export function getScoreAtProgress(game, side, progress) {
  const quarters = getQuarterScores(game, side);
  const finalScore = Number(game?.[side === 'home' ? 'home_team_score' : 'visitor_team_score'] ?? 0) || 0;
  if (progress >= 1) return finalScore;
  if (progress <= 0) return 0;

  const position = progress * 4;
  const completed = Math.floor(position);
  const withinQuarter = position - completed;
  let total = 0;
  for (let index = 0; index < completed && index < quarters.length; index += 1) total += quarters[index];
  // Points inside the live quarter arrive in whole scoring plays, so floor
  // rather than showing a fractional score.
  if (completed < quarters.length) total += Math.floor(quarters[completed] * withinQuarter);
  // Overtime and any scoring the quarter splits do not capture land at the end.
  return Math.min(finalScore, total);
}

function formatQuarterClock(progress) {
  const position = progress * 4;
  const withinQuarter = position - Math.floor(position);
  const remaining = Math.max(0, Math.round(QUARTER_CLOCK_SECONDS * (1 - withinQuarter)));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Present a real, finished game as scheduled / in progress / final depending on
// where the replay clock sits, matching the shape the live view expects.
export function projectGameAtProgress(game, progress) {
  if (!game) return game;
  if (progress <= 0) {
    return {
      ...game,
      status: 'Scheduled',
      status_state: 'pre',
      period: null,
      time: null,
      home_team_score: 0,
      visitor_team_score: 0,
    };
  }
  if (progress >= 1) return { ...game, status_state: 'final' };

  const period = Math.min(4, Math.floor(progress * 4) + 1);
  return {
    ...game,
    status: 'In Progress',
    status_state: 'in',
    period,
    time: formatQuarterClock(progress),
    home_team_score: getScoreAtProgress(game, 'home', progress),
    visitor_team_score: getScoreAtProgress(game, 'visitor', progress),
  };
}

// Yardage does not accrue continuously — it arrives on carries, catches and
// completions. Scaling it smoothly turns one 12-yard run into a dozen 1-yard
// dribbles in the feed, so each yardage stat advances only when the play that
// produces it lands, using the player's own count of those plays.
const YARDS_PER_PLAY_SOURCE = {
  passing_yards: 'passing_completions',
  rushing_yards: 'rushing_attempts',
  receiving_yards: 'receptions',
  kick_return_yards: 'kick_returns',
  punt_return_yards: 'punt_returns',
};

// Snaps progress to the fraction of a player's plays that have happened.
// Without a recorded play count there is nothing to snap to, so the stat falls
// back to scaling smoothly rather than being held at zero until the whistle.
function quantizeToPlays(progress, playCount) {
  const plays = Math.floor(Number(playCount) || 0);
  if (plays <= 0) return progress;
  return Math.floor(progress * plays) / plays;
}

// Counting stats accumulate roughly with game time. Flooring keeps touchdowns
// and receptions as whole events that tick up in steps, which is what the
// delta-driven feed needs in order to emit believable scoring plays.
export function projectStatRowAtProgress(row, progress) {
  if (!row) return row;
  const projected = { ...row };
  Object.entries(row).forEach(([field, value]) => {
    if (typeof value !== 'number' || UNSCALED_STAT_FIELDS.has(field)) return;
    if (progress >= 1) return;
    const playSource = YARDS_PER_PLAY_SOURCE[field];
    const effective = playSource
      ? quantizeToPlays(progress, row[playSource])
      : progress;
    const scaled = value * effective;
    // Yardage reads naturally at whole yards; every other counting stat is a
    // discrete event and must floor to avoid inventing partial touchdowns.
    projected[field] = value < 0 ? Math.ceil(scaled) : Math.floor(scaled);
  });
  if (row.game) projected.game = projectGameAtProgress(row.game, progress);
  return projected;
}

export function projectGamesAtProgress(games = [], progress) {
  const instant = getReplayInstant(games, progress);
  return games.map((game) => projectGameAtProgress(game, getGameProgress(game, instant)));
}

export function projectStatsAtProgress(statsByGame = {}, games = [], progress) {
  const instant = getReplayInstant(games, progress);
  const progressByGame = new Map(
    games.map((game) => [String(game.id), getGameProgress(game, instant)]),
  );
  return Object.fromEntries(
    Object.entries(statsByGame).map(([gameId, rows]) => [
      gameId,
      (rows ?? []).map((row) => projectStatRowAtProgress(row, progressByGame.get(String(gameId)) ?? 0)),
    ]),
  );
}

// Inverse of getReplayInstant: where a real moment sits on the 0..1 slate axis.
export function getReplayProgressAtInstant(games, instantMs) {
  const segments = getReplaySegments(games);
  if (!segments.length || instantMs == null) return null;
  const total = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
  if (total <= 0) return null;

  let elapsed = 0;
  for (const segment of segments) {
    if (instantMs < segment.start) break;
    elapsed = segment.offset + Math.min(segment.durationMs, instantMs - segment.start);
  }
  return clamp01(elapsed / total);
}

// Converts a position inside one game onto the chart's shared slate axis.
//
// Replay slicing still uses merged active intervals so its clock lands on live
// football. The chart cannot use that clock: concurrent Sunday games would all
// receive the same x range and collapse into a vertical wall. Give every
// scheduled game one consecutive segment in kickoff order instead, preserving
// game-day order while making busy days proportionally navigable.
export function getSlateProgressForGameProgress(games, gameId, gameProgress) {
  const game = (games ?? []).find((entry) => String(entry.id) === String(gameId));
  const kickoff = getGameKickoffMs(game);
  if (kickoff == null || !Number.isFinite(Number(gameProgress))) return null;
  const gameWindow = buildDemoTimeline(games).gameWindows.get(String(game.id));
  return mapGameProgressToDemoTimeline(gameProgress, gameWindow);
}

// The replay clock remains an active-football clock for slicing concurrent
// games. The chart's x-axis is a consecutive scheduled-game axis, so its NOW
// marker must follow the furthest game that has started rather than the active
// clock fraction. Otherwise later Sunday games would render beyond NOW and
// their points would stack against the marker until the whole slate finished.
export function getReplayChartProgress(games = [], progress = 0) {
  const fallback = clamp01(progress);
  const instant = getReplayInstant(games, fallback);
  if (instant == null) return fallback;
  const timeline = buildDemoTimeline(games);
  let latest = 0;
  let mapped = false;
  (games ?? []).forEach((game) => {
    const gameProgress = getGameProgress(game, instant);
    if (!(gameProgress > 0)) return;
    const window = timeline.gameWindows.get(String(game.id));
    const slate = mapGameProgressToDemoTimeline(gameProgress, window);
    if (!Number.isFinite(Number(slate))) return;
    mapped = true;
    latest = Math.max(latest, Number(slate));
  });
  return mapped ? latest : fallback;
}

// A readable label for the sandbox panel: where the slate sits overall.
export function describeReplayInstant(games, progress) {
  const instant = getReplayInstant(games, progress);
  if (instant == null) return '—';
  const live = games.filter((game) => {
    const value = getGameProgress(game, instant);
    return value > 0 && value < 1;
  }).length;
  const final = games.filter((game) => getGameProgress(game, instant) >= 1).length;
  const upcoming = games.length - live - final;
  return `${new Date(instant).toLocaleString([], {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  })} · ${live} live · ${final} final · ${upcoming} upcoming`;
}

// Distributes a batch of stat deltas across the slate time they cover.
//
// A replay step advances far more game time than a live poll does, so a whole
// batch would otherwise share one position and draw a vertical wall. Laying
// them out in order across the interval that just elapsed makes the feed read
// sequentially and keeps the pace curve rising.
// Writes `slateProgress`, deliberately leaving `gameProgress` alone: the two
// axes have to coexist. The chart plots x from the slate position, while the
// win-probability replay reads `gameProgress` to work out how much of a
// starter's own game is left. Overwriting one with the other corrupts every
// starter's remaining-game fraction.
export function spreadEventsAcrossInterval(events, startProgress, endProgress) {
  const start = Number.isFinite(Number(startProgress)) ? Number(startProgress) : 0;
  const end = Number.isFinite(Number(endProgress)) ? Number(endProgress) : start;
  if (!events.length) return events;
  const span = Math.max(0, end - start);
  return events.map((event, index) => ({
    ...event,
    slateProgress: start + span * ((index + 1) / events.length),
  }));
}

// ── Synthesized Sleeper stream (rule 10) ───────────────────────────────────
//
// The replay sandbox has no real Sleeper feed to poll — only the sliced BDL
// box scores it already serves for stats and plays. In connected live,
// Sleeper's own pipeline always trails the raw box score by however long it
// takes them to process and post a play, and the reconciliation engine is
// built to lean on that lag (pending plays, then confirmation once Sleeper
// catches up). Faking that here means re-slicing the same BDL stats at an
// earlier point in the slate (`progress - lag`) and running that earlier
// slice through the real scoring math, rather than reading the fixture's
// stored final totals directly — which is what makes the replay exercise
// pending→confirmed flips and residual pinning instead of every play
// confirming the instant it appears.

const DEFAULT_SLEEPER_STREAM_LAG_SECONDS = 20;
let sleeperStreamLagSeconds = DEFAULT_SLEEPER_STREAM_LAG_SECONDS;

export function setSleeperStreamLagSeconds(seconds) {
  const parsed = Number(seconds);
  sleeperStreamLagSeconds = Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_SLEEPER_STREAM_LAG_SECONDS;
}

export function getSleeperStreamLagSeconds() {
  return sleeperStreamLagSeconds;
}

// The lag is a real-world delay, but the replay clock runs on the compressed
// slate axis that has already had dead air between games removed. Expressing
// it in progress units means dividing by that same active (non-dead-air)
// duration — the figure getReplayActiveDuration/instantAt/toSlateProgress
// already use — not by the wall-clock span from first kickoff to last whistle.
export function getSleeperStreamLagProgress(games, lagSeconds = sleeperStreamLagSeconds) {
  const activeDurationMs = getReplayActiveDuration(games);
  if (!activeDurationMs) return 0;
  return clamp01(((Math.max(0, Number(lagSeconds)) || 0) * 1000) / activeDurationMs);
}

function roundToCents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Pure core of the synthesized Sleeper stream: given the replay's already-
 * loaded games and final BDL stats plus the sandbox fixture, produces the
 * `{ matchups, weeklyStats }` Sleeper would show at `progress`, as if Sleeper
 * were `lagProgress` behind the box score.
 *
 * `matchups` is the fixture's own matchup rows with `players_points` and
 * `points` replaced by the sliced/lagged/scored values — never the fixture's
 * stored ones — so the stream is internally consistent with itself at every
 * progress, including 1. `weeklyStats` is keyed by Sleeper player id.
 *
 * At progress >= 1 the lag is dropped rather than applied: a still-lagging
 * Sleeper snapshot at the literal end of the slate would never quite reach
 * the final BDL-derived totals (progress - lag < 1), and the reconciliation
 * engine's own contract is that Sleeper never permanently disagrees with the
 * box score once it has had a chance to catch up.
 */
export function projectSleeperReplaySlice({
  progress,
  lagProgress = 0,
  games = [],
  finalStatsByGame = {},
  fixture,
}) {
  const clamped = clamp01(progress);
  const effectiveProgress = clamped >= 1 ? 1 : Math.max(0, clamped - clamp01(lagProgress));
  const slicedStats = projectStatsAtProgress(finalStatsByGame, games, effectiveProgress);
  const statIndex = buildStatIndex(slicedStats);

  const weeklyStats = {};
  const pointsByPlayerId = {};
  Object.entries(fixture?.players ?? {}).forEach(([playerId, player]) => {
    const bdlRow = statIndex.get(getStatKeyForSleeperPlayer(player)) ?? null;
    const stats = mapBdlStatsToGridShift(bdlRow, player?.position);
    weeklyStats[playerId] = stats;
    pointsByPlayerId[playerId] = roundToCents(
      calcPoints(stats, fixture?.league?.scoring_settings, player?.position),
    );
  });

  const matchups = (fixture?.matchups ?? []).map((row) => {
    const playersPoints = Object.fromEntries(
      (row.players ?? []).map((id) => [id, pointsByPlayerId[id] ?? 0]),
    );
    // Sleeper's matchup `points` totals starters only — confirmed by the
    // fixture itself, whose stored `points` equals the sum of `starters_points`.
    const points = roundToCents(
      (row.starters ?? []).reduce((sum, id) => sum + (playersPoints[id] ?? 0), 0),
    );
    return { ...row, players_points: playersPoints, points };
  });

  return { matchups, weeklyStats };
}
