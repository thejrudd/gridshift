// liveReconciliation.js — reconciles the BALLDONTLIE play feed against Sleeper.
//
// BDL plays arrive within a second of the snap but are scored from a parsed
// stat delta, so they are estimates. Sleeper is authoritative but lags: points
// by up to one poll, stat lines by up to 30s. Showing either alone is wrong —
// Sleeper alone lags the feed, the plays alone drift from the league's own
// number. This engine keeps both: every play stays `pending` until Sleeper's
// own numbers account for it, and the displayed total is Sleeper's last word
// plus the plays it has not caught up to yet.
//
// Pure and deterministic: no clock reads, no I/O. `now` comes from the caller.

import { calcPoints } from './scoringEngine.js';
import { describeDelta, getEventClassification } from './liveScoringFeed.js';
import { PLAY_MATCH_STATS } from './livePlaysFeed.js';

/** Sleeper stat lines are trusted for confirmation for this long after a fetch. */
export const STAT_LINE_FRESH_MS = 90000;
/** A stat-line surplus must survive this long across two fetches before a row. */
export const FALLBACK_GRACE_MS = 30000;
/** Sleeper rounds yardage differently per source; counting stats must be exact. */
export const YARDAGE_TOLERANCE = 3;
/** Slack on the points-provisional walk, covering per-play rounding. */
export const POINTS_TOLERANCE = 0.5;
/**
 * How long a play may sit pending against a fresh stat line that does not
 * contain it before the engine stops counting it (spec rule 12). A play the
 * parser invented — a fumble Sleeper never charged, a snap attributed to the
 * wrong player — otherwise moves the displayed total for the rest of the week.
 */
export const PENDING_TTL_MS = 120000;

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function num(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Inputs may arrive as Maps (live) or plain objects (fixtures, replay). */
function lookup(source, key) {
  if (!source) return undefined;
  if (typeof source.get === 'function') return source.get(key);
  return source[key];
}

const PLAY_MATCH_STAT_ALIASES = Object.freeze({
  idp_fr: ['idp_fum_rec'],
  idp_fr_yd: ['idp_fum_ret_yd'],
  idp_pd: ['idp_pass_def'],
  idp_qbhit: ['idp_qb_hit'],
  idp_safety: ['idp_safe'],
});

// Tackles are one family: a play carries generic `idp_tkl`, while a Sleeper
// line may report `idp_tkl`, `idp_tkl_solo` + `idp_tkl_ast`, or all three.
const TACKLE_KEYS = ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast'];

function tackleTotal(source) {
  const generic = num(lookup(source, 'idp_tkl'));
  const split = num(lookup(source, 'idp_tkl_solo')) + num(lookup(source, 'idp_tkl_ast'));
  return Math.max(generic, split);
}

function lookupMatchStat(source, key) {
  if (key === 'idp_tkl') return tackleTotal(source);
  const values = [key, ...(PLAY_MATCH_STAT_ALIASES[key] ?? [])]
    .map((candidate) => lookup(source, candidate))
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(num);
  return values.length ? Math.max(...values) : 0;
}

function toleranceFor(key) {
  return String(key).endsWith('_yd') ? YARDAGE_TOLERANCE : 0;
}

function positiveMatchKeys(stats) {
  return Object.keys(stats ?? {}).filter((key) => (
    PLAY_MATCH_STATS.has(key) && num(stats[key]) > 0
  ));
}

function addStats(target, stats) {
  Object.entries(stats ?? {}).forEach(([key, value]) => {
    target[key] = num(target[key]) + num(value);
  });
  return target;
}

/** Oldest first. `order` is the canonical timeline key; id breaks ties. */
function byPlayOrder(left, right) {
  return (num(left.order) - num(right.order))
    || String(left.id).localeCompare(String(right.id));
}

export function createReconciliationState() {
  return {
    plays: new Map(),
    firstSeen: new Map(),
    status: new Map(),
    adjustments: new Map(),
    fallbacks: new Map(),
    fallbackSeq: new Map(),
    surplusWatch: new Map(),
    players: new Map(),
    feedEvents: [],
  };
}

/**
 * Can this play's stat line still fit under the player's Sleeper stat line,
 * given everything already confirmed?
 */
export function playFitsStatLine(play, sleeperStats, confirmedCumulative) {
  const keys = positiveMatchKeys(play?.stats);
  // A play whose whole delta sits outside PLAY_MATCH_STATS (IDP lines, team
  // defense) has nothing to check against, so it is left to the points step
  // rather than confirmed on a vacuously true condition.
  if (!keys.length) return false;
  return keys.every((key) => (
    lookupMatchStat(sleeperStats, key) + toleranceFor(key)
      >= num(confirmedCumulative[key]) + num(play.stats[key])
  ));
}

/**
 * Stat-line confirmation (spec rule 8). Walks pending plays oldest first;
 * a play that cannot be satisfied is skipped rather than blocking the newer
 * ones behind it, which is how out-of-order confirmation happens.
 */
function confirmByStatLine(pending, sleeperStats, confirmedCumulative, markConfirmed) {
  const stillPending = [];
  pending.forEach((play) => {
    if (playFitsStatLine(play, sleeperStats, confirmedCumulative)) {
      addStats(confirmedCumulative, play.stats);
      markConfirmed(play, 'stats');
      return;
    }
    stillPending.push(play);
  });
  return stillPending;
}

/**
 * Points-provisional confirmation (spec rule 8). This is what stops the
 * displayed total from double counting while stat lines are behind: points
 * Sleeper has already credited stop being added a second time as pending.
 *
 * The walk takes the longest oldest-first prefix whose net points Sleeper's
 * uncovered change accounts for, rather than stopping at the first play that
 * does not fit. A turnover is worth negative points, so a prefix can overshoot
 * and the next one land exactly (a touchdown and the interception after it net
 * +4); stopping early would leave the interception pending and keep showing
 * points Sleeper has already taken away.
 */
function confirmByPoints(pending, uncovered, markConfirmed) {
  let running = 0;
  let best = 0;
  pending.forEach((play, index) => {
    running = round2(running + num(play.pts));
    // A prefix qualifies when Sleeper has at least as much unexplained
    // movement as the prefix is worth, and — for a prefix that is net
    // negative — when that movement is a drop of about the same size rather
    // than an unrelated gain.
    const explained = uncovered >= running - POINTS_TOLERANCE
      && (running >= 0 || uncovered <= running + POINTS_TOLERANCE);
    if (explained) best = index + 1;
  });

  const stillPending = [];
  pending.forEach((play, index) => {
    if (index < best) markConfirmed(play, 'points');
    else stillPending.push(play);
  });
  return stillPending;
}

/**
 * Stats in Sleeper's line that no play and no existing fallback row explains.
 * Yardage keys carry the same tolerance as confirmation so a rounding gap
 * cannot manufacture a "stat update" row.
 */
export function computeStatSurplus(sleeperStats, coveredStats) {
  const surplus = {};
  PLAY_MATCH_STATS.forEach((key) => {
    if (TACKLE_KEYS.includes(key)) return;
    const gap = lookupMatchStat(sleeperStats, key) - num(coveredStats[key]);
    if (gap > toleranceFor(key)) surplus[key] = gap;
  });
  // Tackles are compared as a count, since a play only knows a tackle
  // happened. The uncovered count mirrors whichever keys Sleeper reported, so
  // the row prices it exactly as Sleeper's own line would: the generic total,
  // and the solo / assisted split in Sleeper's proportion. The residual
  // settles any rounding.
  const covered = tackleTotal(coveredStats);
  const genericGap = num(lookup(sleeperStats, 'idp_tkl')) - covered;
  if (genericGap > 0) surplus.idp_tkl = genericGap;
  const solo = num(lookup(sleeperStats, 'idp_tkl_solo'));
  const assisted = num(lookup(sleeperStats, 'idp_tkl_ast'));
  const splitGap = solo + assisted - covered;
  if (splitGap > 0) {
    const soloShare = Math.min(splitGap, Math.round((splitGap * solo) / (solo + assisted)));
    if (soloShare > 0) surplus.idp_tkl_solo = soloShare;
    if (splitGap - soloShare > 0) surplus.idp_tkl_ast = splitGap - soloShare;
  }
  return surplus;
}

// Stats a correction can be traced through. Tackles stay out: a play prices
// its generic tackle as solo or assisted, so a tackle gap cannot be read off
// Sleeper's line one key at a time.
const ATTRIBUTABLE_STATS = [...PLAY_MATCH_STATS].filter((key) => !TACKLE_KEYS.includes(key));

/**
 * Splits a player's residual by stat (spec rule 16). Sleeper reports totals,
 * never per-play numbers, so each stat's gap goes on the most recent confirmed
 * play carrying that stat: stat lines are polled every 30-90s, so a change is
 * almost always the newest play of that kind, and with nothing better to go on
 * it is still the best guess.
 *
 * A gap is measured against `confirmedStats` (confirmed plays and stat-update
 * rows). Sleeper lags the feed, so a pending play is not a correction: when
 * Sleeper is ahead of the confirmed plays, `pendingStats` explains that much
 * first, and a pending play Sleeper has not counted yet is never read as an
 * overcount. Returns `{ partsById, remainder }`:
 * per-play `[{ key, gap, pts }]`, and whatever no stat explains (rounding,
 * tackles, stats no play carries), which the caller places as before.
 */
export function attributeAdjustmentByStat({
  adjustment, confirmedPlays, confirmedStats, pendingStats = {}, sleeperStats, scoringSettings, position,
}) {
  const partsById = new Map();
  let remainder = round2(adjustment);
  if (!sleeperStats || !confirmedPlays.length) return { partsById, remainder };
  const latestFirst = [...confirmedPlays].reverse();
  const shifted = new Map();

  ATTRIBUTABLE_STATS.forEach((key) => {
    let gap = round2(lookupMatchStat(sleeperStats, key) - num(confirmedStats[key]));
    if (gap > 0) gap = round2(Math.max(0, gap - num(pendingStats[key])));
    if (!gap) return;
    const target = latestFirst.find((play) => num(play.stats?.[key]) !== 0);
    if (!target) return;
    let pts = round2(calcPoints({ [key]: gap }, scoringSettings, position));
    // A correction never flips a play below zero; the rest stays in the
    // remainder, which the caller spreads (rule 15) or places on the latest play.
    if (pts < 0 && num(target.pts) > 0) {
      const floor = -(num(target.pts) + num(shifted.get(target.id)));
      if (pts < floor) pts = round2(Math.min(0, floor));
    }
    if (!pts) return;
    shifted.set(target.id, round2(num(shifted.get(target.id)) + pts));
    partsById.set(target.id, [...(partsById.get(target.id) ?? []), { key, gap, pts }]);
    remainder = round2(remainder - pts);
  });
  return { partsById, remainder };
}

function buildFallbackEvent({
  playerId, position, stats, pts, seq, now, gameId,
}) {
  const classification = getEventClassification(stats, position);
  return {
    id: `stat-update-${playerId}-${seq}`,
    playerId,
    position,
    ...classification,
    desc: describeDelta(stats) || 'Stat update',
    stats,
    pts,
    at: now,
    timelineAt: null,
    progress: null,
    order: now,
    gameId: gameId ?? null,
    source: 'stat-update',
    estimated: false,
    status: 'confirmed',
    confirmedBy: 'stats',
    adjustment: 0,
    displayPts: pts,
  };
}

/**
 * Advances the surplus watch for one player and returns the fallback row to
 * emit, if the grace period has now elapsed. The surplus must be seen at two
 * distinct stat-line fetches at least FALLBACK_GRACE_MS apart: a single fetch
 * where Sleeper is simply ahead of the play feed is the normal case, not a
 * coverage gap.
 */
function advanceSurplusWatch(watch, surplus, fetchedAt) {
  if (!Object.keys(surplus).length) return { watch: null, emit: false };
  if (!watch) return { watch: { stats: surplus, firstFetchedAt: fetchedAt, lastFetchedAt: fetchedAt }, emit: false };
  const distinctFetch = fetchedAt !== watch.lastFetchedAt;
  const graceElapsed = fetchedAt - watch.firstFetchedAt >= FALLBACK_GRACE_MS;
  if (distinctFetch && graceElapsed) return { watch: null, emit: true };
  return {
    watch: {
      stats: surplus,
      firstFetchedAt: watch.firstFetchedAt,
      lastFetchedAt: distinctFetch ? fetchedAt : watch.lastFetchedAt,
    },
    emit: false,
  };
}

/**
 * Draws a newly arrived play's stats out of the fallback rows that were
 * standing in for them, oldest row first, and drops a row once nothing
 * meaningful is left in it.
 *
 * One row covers a batch of stats, and the plays that explain it can arrive
 * one at a time — an exact whole-row match is the lucky case, not the rule.
 * Without the subtraction a partly explained row would keep claiming points
 * the plays now also claim, and the player's displayed total would stay
 * permanently double counted.
 */
export function retireCoveredFallbacks(rows, playStats, scoringSettings, position) {
  const remaining = {};
  Object.entries(playStats ?? {}).forEach(([key, value]) => {
    if (PLAY_MATCH_STATS.has(key) && num(value) > 0) remaining[key] = num(value);
  });
  if (!Object.keys(remaining).length) return rows;

  // A play's tackles draw from a row's tackle family, whichever keys it holds.
  let tacklesLeft = TACKLE_KEYS.reduce((total, key) => total + num(remaining[key]), 0);
  TACKLE_KEYS.forEach((key) => { delete remaining[key]; });

  const kept = [];
  rows.forEach((row) => {
    const stats = { ...row.stats };
    if (tacklesLeft > 0) {
      const take = Math.min(tacklesLeft, tackleTotal(stats));
      if (take > 0) {
        tacklesLeft -= take;
        if (num(stats.idp_tkl) > 0) stats.idp_tkl = Math.max(0, num(stats.idp_tkl) - take);
        let split = take;
        ['idp_tkl_solo', 'idp_tkl_ast'].forEach((key) => {
          const used = Math.min(split, num(stats[key]));
          if (used > 0) {
            stats[key] = num(stats[key]) - used;
            split -= used;
          }
        });
      }
    }
    Object.keys(remaining).forEach((key) => {
      const take = Math.min(remaining[key], num(stats[key]));
      if (take <= 0) return;
      stats[key] = round2(num(stats[key]) - take);
      remaining[key] = round2(remaining[key] - take);
    });
    const spent = Object.keys(stats).every((key) => num(stats[key]) <= toleranceFor(key));
    if (spent) return;
    kept.push({
      ...row,
      stats,
      pts: round2(calcPoints(stats, scoringSettings, position)),
      // The row now claims less than it did, so its sentence has to follow.
      desc: describeDelta(stats) || row.desc,
    });
  });
  return kept;
}

/**
 * @param {object} previousState from createReconciliationState() or a prior call.
 * @param {object} inputs { playEvents, sleeperPointsById, sleeperStatsById,
 *   sleeperStatsFetchedAt, scoringSettings, positionsById, finalGameIds, now }
 * @returns {object} new state: { players: Map, feedEvents, ...bookkeeping }
 */
export function reconcileLivePlays(previousState, inputs = {}) {
  const previous = previousState ?? createReconciliationState();
  const {
    playEvents = [],
    sleeperPointsById = null,
    sleeperStatsById = null,
    sleeperStatsFetchedAt = null,
    scoringSettings = null,
    positionsById = null,
    finalGameIds = null,
    // Starters whose game is officially over. No more plays will arrive for
    // them, so a stat-line surplus needs no grace period, and Sleeper points
    // that nothing explains still get a row to land on (rule 13).
    settledPlayerIds = null,
    now = 0,
  } = inputs;

  const finalGames = new Set([...(finalGameIds ?? [])].map((id) => String(id)));
  const settledPlayers = new Set([...(settledPlayerIds ?? [])].map((id) => String(id)));

  const plays = new Map(previous.plays);
  const firstSeen = new Map(previous.firstSeen);
  const status = new Map(previous.status);
  const fallbacks = new Map([...previous.fallbacks].map(([id, rows]) => [id, [...rows]]));
  const fallbackSeq = new Map(previous.fallbackSeq);
  const surplusWatch = new Map(previous.surplusWatch);
  const adjustments = new Map();
  // Last step's residuals, minus any whose row a newly arrived play retires
  // below: a residual that no longer sits on a row must not keep blocking the
  // play that replaces it from confirming.
  const carriedAdjustments = new Map(previous.adjustments);

  // Ingest. A play id already seen keeps its first-seen record, so replaying
  // the same poll twice changes nothing.
  playEvents.forEach((event) => {
    if (!event?.id || plays.has(event.id)) return;
    plays.set(event.id, event);
    // When the play entered the feed, not when it happened: the TTL measures
    // how long Sleeper has had this play in front of it, and a backfilled play
    // can carry a kickoff-era timestamp.
    firstSeen.set(event.id, now);
    // Plays that finally arrive for a stat line already explained by a
    // fallback row retire it (spec rule 6).
    let rows = fallbacks.get(event.playerId);
    if (!rows?.length) return;
    // A points-only row (rule 13) stood in for plays that had not arrived; the
    // first real play retires it and its residual.
    if (rows.some((row) => row.pointsOnly)) {
      rows = rows.filter((row) => !row.pointsOnly);
      carriedAdjustments.delete(event.playerId);
      if (!rows.length) {
        fallbacks.delete(event.playerId);
        return;
      }
    }
    const position = lookup(positionsById, event.playerId) ?? event.position ?? 'FLEX';
    const kept = retireCoveredFallbacks(rows, event.stats, scoringSettings, position);
    if (kept.length) fallbacks.set(event.playerId, kept);
    else fallbacks.delete(event.playerId);
  });

  const playsByPlayer = new Map();
  plays.forEach((event) => {
    const bucket = playsByPlayer.get(event.playerId);
    if (bucket) bucket.push(event);
    else playsByPlayer.set(event.playerId, [event]);
  });

  const statsFresh = Boolean(sleeperStatsById)
    && (!Number.isFinite(Number(sleeperStatsFetchedAt))
      || now - Number(sleeperStatsFetchedAt) <= STAT_LINE_FRESH_MS);
  const fetchIdentity = Number.isFinite(Number(sleeperStatsFetchedAt))
    ? Number(sleeperStatsFetchedAt)
    : now;

  const playerIds = new Set([...playsByPlayer.keys(), ...fallbacks.keys()]);
  if (sleeperPointsById) {
    const keys = typeof sleeperPointsById.keys === 'function'
      ? [...sleeperPointsById.keys()]
      : Object.keys(sleeperPointsById);
    keys.forEach((id) => playerIds.add(id));
  }

  const players = new Map();
  const feedEvents = [];

  [...playerIds].forEach((playerId) => {
    const ownPlays = (playsByPlayer.get(playerId) ?? []).slice().sort(byPlayOrder);
    const position = lookup(positionsById, playerId) ?? ownPlays[0]?.position ?? 'FLEX';
    const rawPoints = lookup(sleeperPointsById, playerId);
    const hasSleeperPoints = Number.isFinite(Number(rawPoints));
    const sleeperPoints = hasSleeperPoints ? round2(rawPoints) : null;
    const sleeperStats = lookup(sleeperStatsById, playerId) ?? null;
    let rows = fallbacks.get(playerId) ?? [];

    const confirmedIds = new Set();
    const confirmedBy = new Map();
    ownPlays.forEach((play) => {
      const prior = status.get(play.id);
      // Confirmation is sticky: a play Sleeper once accounted for does not
      // flip back to pending when a later poll shifts points around, which
      // would make the UI's pending marker flicker for no user-visible reason.
      if (prior?.status === 'confirmed') {
        confirmedIds.add(play.id);
        confirmedBy.set(play.id, prior.confirmedBy ?? 'points');
      }
    });

    const markConfirmed = (play, by) => {
      confirmedIds.add(play.id);
      confirmedBy.set(play.id, by);
    };

    const confirmedCumulative = {};
    ownPlays.forEach((play) => {
      if (confirmedIds.has(play.id)) addStats(confirmedCumulative, play.stats);
    });
    rows.forEach((row) => addStats(confirmedCumulative, row.stats));

    let pending = ownPlays.filter((play) => !confirmedIds.has(play.id));
    const unconfirmedIds = new Set();
    const settled = settledPlayers.has(String(playerId));
    // A settled starter's stat line is final: it never goes stale, however
    // long ago it was fetched (a finished week fetches it once).
    const lineFresh = Boolean(sleeperStatsById) && (statsFresh || settled);

    // Before Sleeper says anything about a player every play stays pending.
    if (hasSleeperPoints) {
      if (lineFresh && sleeperStats) {
        pending = confirmByStatLine(pending, sleeperStats, confirmedCumulative, markConfirmed);
        // Rule 12. Whatever is still pending against a stat line that has had
        // a fair chance to contain it is not Sleeper's and never will be, so
        // it stops moving the displayed total. Judged on stat lines only —
        // points lag too much to condemn a play on their own — and recomputed
        // every step, so a Sleeper correction reinstates the play.
        pending.forEach((play) => {
          const expired = now - num(firstSeen.get(play.id)) >= PENDING_TTL_MS;
          const gameOver = settled || (play.gameId != null && finalGames.has(String(play.gameId)));
          if (expired || gameOver) unconfirmedIds.add(play.id);
        });
        pending = pending.filter((play) => !unconfirmedIds.has(play.id));
      }
      const confirmedPoints = round2(
        ownPlays.reduce((total, play) => (
          confirmedIds.has(play.id) ? total + num(play.pts) : total
        ), 0)
        + rows.reduce((total, row) => total + num(row.pts), 0),
      );
      // The previous step's residual is already-explained Sleeper points; only
      // what neither a confirmed play nor that residual covers is available to
      // confirm pending plays against.
      const uncovered = round2(sleeperPoints - confirmedPoints - num(carriedAdjustments.get(playerId)));
      confirmByPoints(pending, uncovered, markConfirmed);
      // Rule 14. A settled starter's numbers will not move again, so nothing
      // stays pending (pending counts on top of Sleeper, which in a finished
      // game only overshoots the official total). Whatever survived the stat
      // line and the points walk is confirmed; the residual on the latest
      // confirmed play then makes the player's rows total Sleeper exactly.
      if (settled) {
        pending.forEach((play) => {
          if (!confirmedIds.has(play.id)) markConfirmed(play, 'final');
        });
      }
    }

    // Fallback rows (spec rule 6). Only ever from a fresh stat line, and only
    // for stats no play — pending or confirmed — accounts for.
    if (lineFresh && sleeperStats) {
      const covered = {};
      // An unconfirmed play never happened as far as this player's line is
      // concerned, so it cannot explain away a real Sleeper surplus.
      ownPlays.forEach((play) => {
        if (!unconfirmedIds.has(play.id)) addStats(covered, play.stats);
      });
      rows.forEach((row) => addStats(covered, row.stats));
      const surplus = computeStatSurplus(sleeperStats, covered);
      const advanced = settledPlayers.has(String(playerId))
        ? { watch: null, emit: Object.keys(surplus).length > 0 }
        : advanceSurplusWatch(surplusWatch.get(playerId) ?? null, surplus, fetchIdentity);
      if (advanced.watch) surplusWatch.set(playerId, advanced.watch);
      else surplusWatch.delete(playerId);
      if (advanced.emit) {
        const seq = (fallbackSeq.get(playerId) ?? 0) + 1;
        fallbackSeq.set(playerId, seq);
        const row = buildFallbackEvent({
          playerId,
          position,
          stats: surplus,
          pts: round2(calcPoints(surplus, scoringSettings, position)),
          seq,
          now,
          gameId: ownPlays[0]?.gameId ?? null,
        });
        rows = [...rows, row];
        fallbacks.set(playerId, rows);
      }
    }

    // Rule 13. A settled starter with Sleeper points but no confirmed play and
    // no row (no stat line, every play unmatched or unconfirmed) would leave
    // those points off every feed row, so the chart and the replay would only
    // reach them at the final close. A points-only row carries the residual
    // instead, placed at the end of that player's game.
    if (
      settledPlayers.has(String(playerId))
      && hasSleeperPoints
      && sleeperPoints !== 0
      && !rows.length
      && !ownPlays.some((play) => confirmedIds.has(play.id))
    ) {
      const seq = (fallbackSeq.get(playerId) ?? 0) + 1;
      fallbackSeq.set(playerId, seq);
      rows = [{
        ...buildFallbackEvent({
          playerId,
          position,
          stats: {},
          pts: 0,
          seq,
          now,
          gameId: ownPlays[0]?.gameId ?? null,
        }),
        pointsOnly: true,
      }];
      fallbacks.set(playerId, rows);
    }

    const confirmedPlays = ownPlays.filter((play) => confirmedIds.has(play.id));
    const pendingPlays = ownPlays.filter((play) => (
      !confirmedIds.has(play.id) && !unconfirmedIds.has(play.id)
    ));
    const pendingPoints = round2(pendingPlays.reduce((total, play) => total + num(play.pts), 0));
    const confirmedPoints = round2(
      confirmedPlays.reduce((total, play) => total + num(play.pts), 0)
        + rows.reduce((total, row) => total + num(row.pts), 0),
    );
    // Residual is recomputed from scratch every step; what no stat explains
    // (rule 16) is pinned to the latest confirmed play. A play's own pts is
    // never rewritten.
    const adjustment = hasSleeperPoints ? round2(sleeperPoints - confirmedPoints) : 0;
    // Normally the latest confirmed play. A player the play feed never covered
    // has only stat-update rows to hang it on, and those rows are never
    // revised downward, so without this a stat correction would have nowhere
    // to land and the row total would outrun Sleeper.
    const residualPlayId = confirmedPlays.length
      ? confirmedPlays[confirmedPlays.length - 1].id
      : null;
    const residualRowId = residualPlayId || (rows.length ? rows[rows.length - 1].id : null);
    adjustments.set(playerId, adjustment);

    // Rule 16. The part of the residual a stat explains sits on the play that
    // stat most likely came from; only the remainder is placed below.
    const confirmedStats = {};
    confirmedPlays.forEach((play) => addStats(confirmedStats, play.stats));
    rows.forEach((row) => addStats(confirmedStats, row.stats));
    const pendingStats = {};
    pendingPlays.forEach((play) => addStats(pendingStats, play.stats));
    const { partsById, remainder } = attributeAdjustmentByStat({
      adjustment,
      confirmedPlays,
      confirmedStats,
      pendingStats,
      sleeperStats: lineFresh ? sleeperStats : null,
      scoringSettings,
      position,
    });

    // Rule 15. A settled starter whose estimated plays overshoot Sleeper (a
    // negative remainder) has the correction spread across their positive
    // confirmed plays in proportion to each play's points, instead of landing
    // on the last one, where it would zero or flip that play and leave the
    // line too high for the whole game. Rows stay positive and the running
    // total tracks the official one throughout. A positive remainder still
    // lands on the latest confirmed play.
    const spreadById = new Map();
    const positivePlays = confirmedPlays.filter((play) => num(play.pts) > 0);
    const positiveSum = positivePlays.reduce((total, play) => total + num(play.pts), 0);
    if (settled && remainder < 0 && positiveSum > 0 && positiveSum + remainder >= 0) {
      let assigned = 0;
      positivePlays.forEach((play, index) => {
        const share = index === positivePlays.length - 1
          ? round2(remainder - assigned)
          : round2((remainder * num(play.pts)) / positiveSum);
        assigned = round2(assigned + share);
        spreadById.set(play.id, share);
      });
    }

    const outPlays = ownPlays.map((play) => {
      const isConfirmed = confirmedIds.has(play.id);
      const isUnconfirmed = unconfirmedIds.has(play.id);
      const parts = isConfirmed ? partsById.get(play.id) ?? [] : [];
      const statShare = round2(parts.reduce((total, part) => total + part.pts, 0));
      const remainderShare = spreadById.size
        ? (isConfirmed ? spreadById.get(play.id) ?? 0 : 0)
        : isConfirmed && play.id === residualPlayId ? remainder : 0;
      const own = round2(statShare + remainderShare);
      let playStatus = 'pending';
      if (isConfirmed) playStatus = 'confirmed';
      else if (isUnconfirmed) playStatus = 'unconfirmed';
      // Only confirmation is remembered. Unconfirmed is re-decided from the
      // live stat line every step so a correction can reinstate the play.
      status.set(play.id, {
        status: playStatus,
        confirmedBy: isConfirmed ? (confirmedBy.get(play.id) ?? 'points') : null,
      });
      return {
        ...play,
        status: playStatus,
        confirmedBy: isConfirmed ? (confirmedBy.get(play.id) ?? 'points') : null,
        adjustment: own,
        // The stat-traced pieces of `adjustment`; the rest is unexplained.
        adjustmentParts: parts,
        displayPts: isUnconfirmed ? 0 : round2(num(play.pts) + own),
      };
    });

    const displayedPoints = hasSleeperPoints
      ? round2(sleeperPoints + pendingPoints)
      : round2(pendingPoints);

    const outRows = rows.map((row) => {
      // A row only takes the remainder: stat-traced parts land on plays, and
      // with no confirmed play there are no parts.
      const own = !spreadById.size && row.id === residualRowId ? remainder : 0;
      return { ...row, adjustment: own, displayPts: round2(num(row.pts) + own) };
    });

    const visibleEvents = [...outPlays, ...outRows].filter((event) => (
      event.status !== 'unconfirmed' && num(event.displayPts) !== 0
    ));
    const displayedEventPoints = round2(visibleEvents.reduce((total, event) => (
      total + num(event.displayPts)
    ), 0));
    // A newly observed authoritative total may precede both provider plays and
    // the bounded stat-update fallback. Keep that temporary amount explicit;
    // once a play or fallback exists this returns to zero, proving that the
    // rendered event values exactly account for the displayed player total.
    const unattributedPoints = round2(displayedPoints - displayedEventPoints);

    players.set(playerId, {
      playerId,
      position,
      sleeperPoints,
      pendingPoints,
      displayedPoints,
      displayedEventPoints,
      unattributedPoints,
      adjustment,
      plays: outPlays,
      fallbackEvents: outRows,
    });

    feedEvents.push(...visibleEvents);
  });

  feedEvents.sort((left, right) => (
    (num(right.at) - num(left.at)) || (num(right.order) - num(left.order))
      || String(right.id).localeCompare(String(left.id))
  ));

  return {
    plays,
    firstSeen,
    status,
    adjustments,
    fallbacks,
    fallbackSeq,
    surplusWatch,
    players,
    feedEvents,
  };
}

/** Side total = Σ displayed player totals (spec rule 3). */
export function sumDisplayedPoints(state, playerIds) {
  const ids = playerIds ?? [...(state?.players?.keys() ?? [])];
  return round2(ids.reduce((total, id) => (
    total + num(state?.players?.get(id)?.displayedPoints)
  ), 0));
}
