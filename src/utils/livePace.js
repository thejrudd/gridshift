// livePace.js — the pace model behind the Fantasy Live hero, verdict line and
// pace chart.
//
// "Pace" is where a starter *should* be right now if they hit their projection
// evenly across their game: projection × the fraction of their game already
// played. The gap between live points and pace is the whole story of the tab —
// it drives the hero's "+4.2 vs pace" line, the featured-player labels, the
// chart's ghost pace ray, and the verdict sentence.
//
// Starter outlooks come from getStarterOutlook() so pace and win probability
// share the same pregame target, ahead/behind input, and remaining projection.

import { getStarterOutlook } from './liveWinProbability.js';

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

/**
 * Pace figures for a single starter.
 * `remainingFraction` is the share of their NFL game still to play (0 = done).
 */
export function getStarterPace({
  current = 0,
  position,
  projection,
  fallbackAvg,
  remainingFraction,
  model,
}) {
  const outlook = getStarterOutlook({
    current,
    position,
    projection,
    fallbackAvg,
    fraction: remainingFraction,
    model,
  });
  const progress = 1 - outlook.fraction;
  return {
    points: round1(outlook.current),
    projected: round1(outlook.projected),
    projectionSource: outlook.source,
    progress,
    pace: round1(outlook.expectedAtNow),
    // What they finish on after the calibrated remaining-performance update.
    liveProjected: round1(outlook.current + outlook.remainingProj),
    vsPace: round1(outlook.paceDelta),
    started: progress > 0.02,
  };
}

/** Aggregates starter pace figures into one side's totals. */
export function buildSidePace(paces = []) {
  const total = paces.reduce((sum, entry) => sum + entry.points, 0);
  const pace = paces.reduce((sum, entry) => sum + entry.pace, 0);
  const liveProjected = paces.reduce((sum, entry) => sum + entry.liveProjected, 0);
  const projected = paces.reduce((sum, entry) => sum + entry.projected, 0);
  const progress = paces.length
    ? paces.reduce((sum, entry) => sum + entry.progress, 0) / paces.length
    : 0;
  return {
    total: round1(total),
    pace: round1(pace),
    liveProjected: round1(liveProjected),
    // What the side's starters project to score over their whole games.
    projected: round1(projected),
    vsPace: round1(total - pace),
    progress,
    yetToPlay: paces.filter((entry) => !entry.started).length,
  };
}

/**
 * The one sentence at the top of the section: who is ahead, who the pace says
 * wins, and whether those two disagree (the "flip" — the most interesting
 * state a live matchup can be in).
 */
export function buildVerdict(left, right) {
  if (!left || !right) return null;
  const lead = left.total - right.total;
  const projectedLead = left.liveProjected - right.liveProjected;
  const leaderKey = lead >= 0 ? 'a' : 'b';
  const projectedWinnerKey = projectedLead >= 0 ? 'a' : 'b';
  return {
    leaderKey,
    projectedWinnerKey,
    // A flip is only worth calling out when there is a real lead to overturn.
    flip: leaderKey !== projectedWinnerKey && Math.abs(lead) > 0.05,
    lead: round1(Math.abs(lead)),
    projectedLead: round1(Math.abs(projectedLead)),
    tied: Math.abs(lead) < 0.05,
  };
}

/**
 * The starter each side puts on the hero, and the label saying why they are
 * there. Modes: `top` (most points), `swing` (furthest above pace),
 * `recent` (most recent scoring play).
 */
export function pickFeaturedStarter(entries = [], mode = 'top', latestEvent = null) {
  const scored = entries.filter((entry) => entry.pace);
  if (!scored.length) return null;

  if (mode === 'swing') {
    const best = [...scored].sort((left, right) => right.pace.vsPace - left.pace.vsPace)[0];
    const swing = best.pace.vsPace;
    return {
      entry: best,
      eyebrow: 'Biggest swing',
      note: `${swing >= 0 ? '+' : '−'}${Math.abs(swing).toFixed(1)} vs pace`,
    };
  }

  if (mode === 'recent' && latestEvent) {
    const match = scored.find((entry) => entry.id === latestEvent.playerId);
    if (match) {
      return {
        entry: match,
        eyebrow: 'Latest score',
        note: `+${Math.abs(Number(latestEvent.pts) || 0).toFixed(1)} · ${latestEvent.glance?.clock || 'just now'}`,
      };
    }
  }

  const best = [...scored].sort((left, right) => right.pace.points - left.pace.points)[0];
  const sideTotal = scored.reduce((sum, entry) => sum + entry.pace.points, 0);
  return {
    entry: best,
    eyebrow: 'Top scorer',
    note: sideTotal > 0
      ? `${best.pace.points.toFixed(1)} of ${round1(sideTotal).toFixed(1)} team pts`
      : 'Yet to score',
  };
}

/**
 * The pace chart's series and its selectable milestones, built from the
 * matchup's own scoring plays.
 *
 * Each side's curve is the running total of its starters' scoring plays, laid
 * out on the shared 0..1 "how far through the game" axis (see
 * `getPlayProgress`). Every play is a step, so the line has the shape of the
 * afternoon rather than the straight line a sparse odds history produces.
 *
 * Two things keep it honest:
 *
 *  - Per-play fantasy points are estimates, so historical play steps stay
 *    estimated. They are never stretched with a later endpoint total. Only
 *    the separate live closing point uses the authoritative current score.
 *  - Odds at each step are supplied by the canonical win-probability engine
 *    through `snapshotAt`, unless a complete persisted snapshot existed at or
 *    before that play. The live endpoint receives `liveSnapshot` directly, so
 *    the chart, hero, verdict, and explainer always share one result.
 *
 * `marks` include every scoring change so the visible dots and scrub history
 * always agree. Touchdowns and larger swings are flagged as emphasized, but
 * small gains and negative scores remain visible and selectable.
 *
 * Local demo plays are intentionally illustrative rather than authoritative.
 * `reconcileToTotals` proportionally fits those estimates to the matchup's
 * real score so the fabricated history cannot tower over its live endpoint.
 * Production play-by-play keeps the unscaled estimates described above.
 */
export function buildPaceSeries({
  events = [],
  sideKeyOf,
  totals = { a: 0, b: 0 },
  slateProgress = 0,
  snapshotAt = null,
  historicalSnapshots = [],
  liveSnapshot = null,
  milestonePoints = 5,
  reconcileToTotals = false,
} = {}) {
  const span = Math.min(1, Math.max(0.02, Number(slateProgress) || 0));
  const finalA = round1(Number(totals.a) || 0);
  const finalB = round1(Number(totals.b) || 0);
  const scored = events
    // `Number(null)` is 0, which would pile every clockless play onto kickoff.
    .map((event) => ({
      event,
      side: sideKeyOf?.(event) ?? null,
      x: event.progress == null ? Number.NaN : Number(event.progress),
    }))
    .filter((item) => item.side && Number.isFinite(item.x) && Number(item.event.pts))
    .sort((left, right) => left.x - right.x);

  if (!scored.length) return { points: [], marks: [] };

  const estimatedTotals = scored.reduce((result, item) => {
    result[item.side] += Number(item.event.pts) || 0;
    return result;
  }, { a: 0, b: 0 });
  const estimateScale = {
    a: reconcileToTotals && estimatedTotals.a > 0 ? finalA / estimatedTotals.a : 1,
    b: reconcileToTotals && estimatedTotals.b > 0 ? finalB / estimatedTotals.b : 1,
  };

  const fullSnapshots = (Array.isArray(historicalSnapshots) ? historicalSnapshots : [])
    .filter(isCompleteReplaySnapshot)
    .sort((left, right) => left.t - right.t);
  const persistedAt = (at) => {
    const moment = Number(at);
    if (!Number.isFinite(moment)) return null;
    for (let index = fullSnapshots.length - 1; index >= 0; index -= 1) {
      if (fullSnapshots[index].t <= moment) return fullSnapshots[index];
    }
    return null;
  };
  const withSnapshot = (point, snapshot = null, context = null) => {
    const resolved = snapshot ?? persistedAt(point.at) ?? snapshotAt?.(point, context) ?? {};
    return {
      ...point,
      ...resolved,
      // Demo probability reconstruction may calculate its own current totals.
      // Keep the calibrated chart coordinates as the visual source of truth.
      ...(reconcileToTotals ? { a: point.a, b: point.b } : {}),
    };
  };

  const points = [withSnapshot({
    x: 0,
    a: 0,
    b: 0,
    progress: 0,
    eventId: null,
    at: null,
  }, null, {
    event: null,
    currentByPlayer: new Map(),
  })];
  const marks = [];

  scored.forEach((item, itemIndex) => {
    const momentAt = getReplayEventTime(item.event);
    const eventsAtMoment = reconcileToTotals
      ? scored.slice(0, itemIndex + 1)
      : Number.isFinite(momentAt)
      ? scored.filter((candidate) => {
          const candidateAt = getReplayEventTime(candidate.event);
          return Number.isFinite(candidateAt) && candidateAt <= momentAt;
        })
      : scored.slice(0, itemIndex + 1);
    const currentByPlayer = new Map();
    const running = eventsAtMoment.reduce((totalsAtMoment, candidate) => {
      const pointsForPlay = (Number(candidate.event.pts) || 0) * estimateScale[candidate.side];
      totalsAtMoment[candidate.side] += pointsForPlay;
      const playerId = candidate.event.playerId;
      if (playerId != null) {
        currentByPlayer.set(
          playerId,
          (currentByPlayer.get(playerId) ?? 0) + pointsForPlay,
        );
      }
      return totalsAtMoment;
    }, { a: 0, b: 0 });
    const x = Math.min(span, item.x);
    const a = round1(reconcileToTotals
      ? Math.min(finalA, Math.max(0, running.a))
      : running.a);
    const b = round1(reconcileToTotals
      ? Math.min(finalB, Math.max(0, running.b))
      : running.b);
    const replayPoint = withSnapshot({
      x,
      a,
      b,
      side: item.side,
      progress: item.x,
      eventId: item.event.id,
      at: momentAt,
    }, null, {
      event: item.event,
      currentByPlayer,
    });
    points.push(replayPoint);
    marks.push({
      x,
      y: replayPoint[item.side],
      side: item.side,
      event: item.event,
      playerId: item.event.playerId,
      negative: Number(item.event.pts) < 0,
      emphasized: item.event.kind === 'td'
        || Math.abs(Number(item.event.pts) || 0) >= milestonePoints,
    });
  });

  // Close on the authoritative totals at NOW, so the end cap and the hero agree.
  points.push(withSnapshot({
    x: span,
    a: finalA,
    b: finalB,
    progress: span,
    eventId: null,
    at: null,
  }, liveSnapshot));

  return { points, marks };
}

function getReplayEventTime(event) {
  const raw = event?.timelineAt ?? event?.at;
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isCompleteReplaySnapshot(snapshot) {
  const hasFinite = (value) => value != null && Number.isFinite(Number(value));
  return Boolean(
    snapshot
    && hasFinite(snapshot.t)
    && hasFinite(snapshot.p)
    && hasFinite(snapshot.a)
    && hasFinite(snapshot.b)
    && hasFinite(snapshot.expectedA)
    && hasFinite(snapshot.expectedB)
    && hasFinite(snapshot.sigma)
    && snapshot.explain?.a
    && snapshot.explain?.b,
  );
}

/** Builds sparse, timestamped progress samples for each NFL game. */
export function buildGameProgressTimelines(events = []) {
  const timelines = new Map();
  events.forEach((event) => {
    const gameId = event?.gameId == null ? null : String(event.gameId);
    const at = getReplayEventTime(event);
    const rawProgress = event?.gameProgress ?? event?.progress;
    const progress = rawProgress == null ? Number.NaN : Number(rawProgress);
    if (!gameId || !Number.isFinite(at) || !Number.isFinite(progress)) return;
    const samples = timelines.get(gameId) ?? [];
    samples.push({
      at,
      progress: Math.min(1, Math.max(0, progress)),
    });
    timelines.set(gameId, samples);
  });
  timelines.forEach((samples, gameId) => {
    const ordered = samples
      .sort((left, right) => left.at - right.at || left.progress - right.progress)
      .filter((sample, index, all) => (
        index === 0
        || sample.at !== all[index - 1].at
        || sample.progress !== all[index - 1].progress
      ));
    timelines.set(gameId, ordered);
  });
  return timelines;
}

function interpolateProgress(samples, at, kickoffAt) {
  const points = Number.isFinite(kickoffAt)
    ? [{ at: kickoffAt, progress: 0 }, ...samples.filter((sample) => sample.at > kickoffAt)]
    : samples;
  if (!points.length) return null;
  if (at <= points[0].at) return points[0].progress;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];
    if (at > right.at) continue;
    const duration = right.at - left.at;
    if (duration <= 0) return Math.max(left.progress, right.progress);
    const ratio = (at - left.at) / duration;
    return left.progress + ((right.progress - left.progress) * ratio);
  }
  // Do not borrow the current/final endpoint to guess an earlier game state.
  // With no later timestamped sample, the last observed progress is safest.
  return points[points.length - 1].progress;
}

/**
 * Remaining fraction for one starter at a replay event. An exact progress
 * reading from that starter's game wins; otherwise use only timestamped
 * samples from that game and its kickoff. Missing evidence remains unplayed.
 */
export function getStarterReplayRemainingFraction(
  starter,
  moment,
  gameTimelines = new Map(),
) {
  if (starter?.state === 'confirmedBye') return 0;
  const starterGameId = starter?.gameId == null ? null : String(starter.gameId);
  const eventGameId = moment?.gameId == null ? null : String(moment.gameId);
  const eventProgress = moment?.gameProgress == null ? Number.NaN : Number(moment.gameProgress);
  if (
    starterGameId
    && starterGameId === eventGameId
    && Number.isFinite(eventProgress)
  ) {
    return 1 - Math.min(1, Math.max(0, eventProgress));
  }

  const at = moment?.at == null ? Number.NaN : Number(moment.at);
  const kickoffAt = starter?.kickoffAt == null ? Number.NaN : Number(starter.kickoffAt);
  if (Number.isFinite(at) && Number.isFinite(kickoffAt) && at < kickoffAt) return 1;
  if (!starterGameId || !Number.isFinite(at)) return 1;

  const progress = interpolateProgress(
    gameTimelines.get(starterGameId) ?? [],
    at,
    Number.isFinite(kickoffAt) ? kickoffAt : null,
  );
  return progress == null ? 1 : 1 - Math.min(1, Math.max(0, progress));
}

/** Both rosters merged and ranked by live points — the rail and leaderboard. */
export function buildTopPerformers(sides = [], limit = 12) {
  return sides
    .flatMap((side) => (side?.entries ?? []).map((entry) => ({ entry, side })))
    .sort((left, right) => (right.entry.pace?.points ?? 0) - (left.entry.pace?.points ?? 0))
    .slice(0, limit);
}
