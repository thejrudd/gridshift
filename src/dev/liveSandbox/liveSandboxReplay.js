// Pure replay slicing for the Fantasy Live sandbox.
//
// Takes a completed NFL week's real games and box scores and renders them as
// they looked at an arbitrary point during that week. Everything here is a
// pure function of (final data, progress) so the replay is deterministic and
// can be scrubbed backwards as well as forwards.
//
// Nothing in this module is shipped to production; see liveSandbox.js.

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

// Converts a position inside one game onto the shared slate axis.
//
// The pace chart plots x from events and derives y from their ordering in time.
// Those only agree while every game runs in step with the wall clock. A replay
// staggers games across a compressed week, so both must be expressed against
// the same slate timeline or the curve doubles back on itself.
export function getSlateProgressForGameProgress(games, gameId, gameProgress) {
  const game = (games ?? []).find((entry) => String(entry.id) === String(gameId));
  const kickoff = getGameKickoffMs(game);
  if (kickoff == null || !Number.isFinite(Number(gameProgress))) return null;
  return getReplayProgressAtInstant(games, kickoff + clamp01(gameProgress) * GAME_DURATION_MS);
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

// ── Splitting a stat delta back into individual plays ─────────────────────
//
// A replay step covers a stretch of game time, so diffing two snapshots yields
// everything a player did across it — which reads as one impossible mega-play
// ("Passing TD, 2 rushing TDs, +289 pass yds"). Real football deals those out
// one snap at a time, and a player cannot score twice on the same play.
//
// Splitting happens per category because a carry, a catch and a completion are
// different plays. Two *different* players sharing one play — a quarterback's
// passing touchdown and his receiver's receiving touchdown — are already
// separate entries, since events are built per player.

const n = (value) => Number(value ?? 0) || 0;

// Stats that describe a discrete play, and the count field that says how many
// of those plays there were.
const PLAY_CATEGORIES = [
  { count: 'pass_cmp', yards: 'pass_yd', tds: 'pass_td' },
  { count: 'rush_att', yards: 'rush_yd', tds: 'rush_td' },
  { count: 'rec', yards: 'rec_yd', tds: 'rec_td' },
];
// One play each, no yardage to share out.
const SINGLETON_STATS = ['fgm', 'xpm', 'pass_int', 'fum_lost'];
const CATEGORY_KEYS = new Set([
  ...PLAY_CATEGORIES.flatMap(({ count, yards, tds }) => [count, yards, tds]),
  ...SINGLETON_STATS,
]);

// Spreads a yardage total over a number of plays, keeping the sum exact.
function shareYards(total, plays) {
  if (!plays) return [];
  const base = Math.trunc(total / plays);
  const shares = new Array(plays).fill(base);
  shares[plays - 1] += total - base * plays;
  return shares;
}

export function splitDeltaIntoPlays(delta) {
  if (!delta) return [];
  const plays = [];

  PLAY_CATEGORIES.forEach(({ count, yards, tds }) => {
    const scores = n(delta[tds]);
    const yardage = n(delta[yards]);
    // A recorded count is the truth; fall back to the touchdowns, or to a
    // single play when only yardage moved.
    const total = Math.max(n(delta[count]), scores, yardage !== 0 ? 1 : 0);
    if (!total) return;
    const shares = shareYards(yardage, total);
    for (let index = 0; index < total; index += 1) {
      const play = { [count]: 1, [yards]: shares[index] };
      // Touchdowns go on the closing plays, one apiece — never two together.
      if (index >= total - scores) play[tds] = 1;
      plays.push(play);
    }
  });

  SINGLETON_STATS.forEach((key) => {
    const total = Math.abs(n(delta[key]));
    for (let index = 0; index < total; index += 1) {
      plays.push({ [key]: Math.sign(n(delta[key])) });
    }
  });

  // Anything with no play structure of its own — defensive tallies, fumbles
  // recovered — rides along rather than being dropped.
  const leftovers = Object.entries(delta)
    .filter(([key, value]) => !CATEGORY_KEYS.has(key) && n(value) !== 0);
  if (leftovers.length) {
    const carrier = plays.length ? plays[0] : {};
    leftovers.forEach(([key, value]) => { carrier[key] = value; });
    if (!plays.length) plays.push(carrier);
  }

  return plays;
}
