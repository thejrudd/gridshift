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
  def_td: 'score',
  def_int_td: 'score',
  idp_def_td: 'score',
  idp_int_td: 'score',
  idp_fr_td: 'score',
  bonus_def_int_td_50p: 'score',
  bonus_def_fum_td_50p: 'score',
  fgm: 'score',
  xpm: 'score',
  xpmiss: 'score',
  pass_int: 'turnover',
  int: 'turnover',
  idp_int: 'turnover',
  fum_lost: 'turnover',
};
const YARDAGE_STATS = new Set([
  'pass_yd', 'rush_yd', 'rec_yd', 'kr_yd', 'pr_yd',
  'int_ret_yd', 'idp_int_ret_yd', 'idp_fr_yd',
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
 * Fantasy Live's feed value is authoritative for the selected player's event.
 * The replay still scores the partial stat line so yards, catches and scores
 * arrive at the right moments, then scales that running value to finish at the
 * same player-only total the feed reports. This prevents another scorer on the
 * NFL play from leaking into the animated ticker.
 */
export function reconcileFantasyTickerPoints(
  partialPoints,
  finalCalculatedPoints,
  authoritativeTotal,
  { settled = false } = {},
) {
  const partial = Number(partialPoints);
  const fallback = Number.isFinite(partial) ? partial : 0;
  if (authoritativeTotal == null) return fallback;

  const authoritative = Number(authoritativeTotal);
  if (!Number.isFinite(authoritative)) return fallback;

  const calculated = Number(finalCalculatedPoints);
  if (Number.isFinite(calculated) && Math.abs(calculated) > Number.EPSILON) {
    return fallback * (authoritative / calculated);
  }
  return settled ? authoritative : fallback;
}

/** Only the viewer's roster earns points in the Fantasy Live replay. */
export function selectViewerFantasyReplay(event, isViewerTeam, positionOf = () => null) {
  if (!isViewerTeam) return [];
  const contributors = event?.contributors?.length
    ? event.contributors
    : event?.stats
      ? [event]
      : [];
  return contributors
    .filter((contributor) => contributor?.stats)
    .map((contributor) => ({
      stats: contributor.stats,
      // Estimated play totals are already calculated from this exact stat
      // line. Leaving this unset keeps the animation from scaling a complete
      // touchdown down to a fractional snapshot share.
      points: contributor.estimated ? null : contributor.pts ?? null,
      position: contributor.position ?? positionOf(contributor.playerId),
    }));
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
