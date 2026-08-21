// Fantasy scoring for an animated play recap.
//
// DrivePlayback draws the play; what it cannot know is what the play was worth
// to a fantasy roster. Points come from scoring the stat line *as it stands*
// partway through, rather than from interpolating the play's final total — that
// is what makes each unit land whole instead of bleeding in.

// Which beat has to have fired before a stat counts. Yardage is not listed: it
// accrues with the ball rather than landing on a moment.
const STAT_UNLOCKED_BY = {
  rec: 'catch',
  pass_cmp: 'catch',
  rec_td: 'score',
  rush_td: 'score',
  pass_td: 'score',
  ret_td: 'score',
  kr_td: 'score',
  pr_td: 'score',
  fgm: 'score',
  xpm: 'score',
  pass_int: 'turnover',
  fum_lost: 'turnover',
};
const YARDAGE_STATS = new Set([
  'pass_yd', 'rush_yd', 'rec_yd', 'kr_yd', 'pr_yd',
]);

/**
 * The stat line as it stands partway through a play.
 *
 * Scoring the *stats* rather than interpolating the *points* is what makes each
 * unit land whole: in a league paying 0.1 a yard and 1 a reception, the yards
 * tick up a tenth at a time as the ball advances, and the reception arrives as
 * a single point the moment the catch is made — not as ten tenths spread across
 * the catch.
 *
 * `fired` is the set of beat kinds already reached.
 */
export function buildPartialPlayStats(stats, { yardsSoFar = 0, totalYards = 0, fired = new Set() } = {}) {
  if (!stats) return {};
  const partial = {};
  const ratio = totalYards === 0 ? 1 : yardsSoFar / totalYards;

  Object.entries(stats).forEach(([key, raw]) => {
    const value = Number(raw) || 0;
    if (!value) return;
    if (YARDAGE_STATS.has(key)) {
      // Whole yards only — a fractional yard is not a thing that happens.
      partial[key] = Math.trunc(value * ratio);
      return;
    }
    const unlock = STAT_UNLOCKED_BY[key];
    // A stat with no moment of its own settles once anything has resolved.
    if (!unlock || fired.has(unlock)) partial[key] = value;
  });

  return partial;
}

/**
 * How much of the play's yardage the ball has covered, 0..1.
 *
 * Taken from where the ball is rather than from the clock, so the count stops
 * the moment the ball does instead of drifting on through the beats that follow
 * the whistle.
 */
export function getYardageProgress(geometry, ballYard) {
  const start = Number(geometry?.start);
  const end = Number(geometry?.end);
  const at = Number(ballYard);
  if (![start, end, at].every(Number.isFinite)) return 0;
  const span = end - start;
  if (span === 0) return 1;
  return Math.min(1, Math.max(0, (at - start) / span));
}
