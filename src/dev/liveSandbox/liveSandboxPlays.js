// Builds one feed event per football play for the replay.
//
// The live view diffs two stat snapshots and emits a single event per player.
// At live cadence that is one play; across a replay step it is everything the
// player did in that stretch, which shows up as a single impossible entry with
// two touchdowns on it. This rebuilds the individual plays first, then emits an
// event for each, so the feed reads the way a real one does.

import { describeDelta, getEventClassification } from '../../utils/liveScoringFeed.js';
import { calcPoints } from '../../utils/scoringEngine.js';
import { splitDeltaIntoPlays } from './liveSandboxReplay.js';

function diffStats(previous, next) {
  const delta = {};
  let changed = false;
  Object.keys(next ?? {}).forEach((key) => {
    const difference = (Number(next[key]) || 0) - (Number(previous?.[key]) || 0);
    if (difference !== 0) {
      delta[key] = difference;
      changed = true;
    }
  });
  return changed ? delta : null;
}

const roundPoint = (value) => Math.round((Number(value) || 0) * 10) / 10;

// A snapshot can contain several kinds of play for one player. The synthetic
// splitter groups those by stat category, while provider plays are chronological,
// so their array indexes are not a valid correspondence. Remove the synthetic
// row that most resembles each real play and leave only genuinely missing rows
// for the fallback feed.
function unmatchedReconstructedPlays(reconstructed, realPlays) {
  const remaining = [...reconstructed];
  realPlays.forEach((realPlay) => {
    if (!remaining.length) return;
    const realStats = realPlay?.stats ?? {};
    let bestIndex = -1;
    let bestScore = 0;
    remaining.forEach((candidate, index) => {
      const score = Object.entries(candidate).reduce((sum, [key, value]) => {
        if (!(Number(value) || 0) || !(Number(realStats[key]) || 0)) return sum;
        return sum + (key.endsWith('_td') || key.endsWith('_att') || key === 'rec' || key === 'fgm' || key === 'xpm' ? 4 : 1);
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    // Provider rows captured before play stats were added still count as one
    // known row. Consume the next reconstruction rather than duplicating it.
    remaining.splice(bestIndex >= 0 ? bestIndex : 0, 1);
  });
  return remaining;
}

function settleEventPoints(events, scoringSettings, position, authoritativeTotal, { playerId, now } = {}) {
  if (!events.length) return events;
  const settled = events.map((event) => ({
    ...event,
    pts: roundPoint(calcPoints(event.stats ?? {}, scoringSettings, position)),
  }));
  if (!Number.isFinite(authoritativeTotal)) return settled;

  // Provider-backed values must always agree with their displayed stat line.
  // A snapshot can cover a different interval than the available provider
  // slice, so its residual belongs to an explicit non-shared reconciliation
  // event, never to a real player's shared NFL play.
  const calculatedTotal = settled.reduce((sum, event) => sum + event.pts, 0);
  const residual = roundPoint(authoritativeTotal - calculatedTotal);
  if (residual) {
    const fallbackIndex = settled.findLastIndex((event) => event.source !== 'replay-play');
    if (fallbackIndex >= 0) {
      settled[fallbackIndex] = {
        ...settled[fallbackIndex],
        pts: roundPoint(settled[fallbackIndex].pts + residual),
      };
    } else {
      settled.push({
        id: `${playerId}-${now}-reconciliation`,
        playerId,
        kind: 'pass',
        desc: 'Snapshot scoring reconciliation',
        pts: residual,
        at: now,
        source: 'replay-reconciliation',
        hiddenFromFeed: true,
        hiddenFromMilestones: true,
      });
    }
  }
  return settled;
}

/**
 * Same contract as buildDeltaEvents(), but one event per play rather than one
 * per player per snapshot.
 *
 * Where the player's game has play-by-play loaded, the events are their actual
 * plays — real yardage, the official description, and the provider row the
 * field visual draws from. Only when no plays are available does it fall back
 * to reconstructing plausible ones from the delta.
 *
 * `playCursor` tracks how far into each player's plays the replay has read.
 * The clock only moves forward between rewinds, so a cursor is enough to hand
 * out each play once, in order.
 */
export function buildReplayDeltaEvents(
  previousSnapshot,
  nextSnapshot,
  playerMeta,
  {
    scoringSettings = null,
    now = Date.now(),
    playsByPlayer = null,
    playCursor = null,
    throughProgress = null,
  } = {},
) {
  const pending = [];
  nextSnapshot.forEach(({ stats, points }, playerId) => {
    const previous = previousSnapshot.get(playerId);
    if (!previous || !stats) return;
    const delta = diffStats(previous.stats, stats);
    if (!delta) return;
    const reconstructed = splitDeltaIntoPlays(delta);
    if (!reconstructed.length) return;

    const available = playsByPlayer?.get(playerId) ?? [];
    const storedCursor = playCursor?.get(playerId);
    const consumedIds = storedCursor instanceof Set
      ? new Set(storedCursor)
      : new Set(available.slice(0, Number(storedCursor) || 0).map((play) => play.id));
    const realPlays = available.filter((play) => (
      !consumedIds.has(play.id)
      && (!Number.isFinite(Number(throughProgress))
        || !Number.isFinite(Number(play.slateProgress))
        || Number(play.slateProgress) <= Number(throughProgress))
    ));
    pending.push({ playerId, points, previous, delta, reconstructed, realPlays, consumedIds });
  });

  const events = [];
  pending.forEach(({ playerId, points, previous, reconstructed, realPlays, consumedIds }) => {
    const meta = playerMeta.get(playerId) ?? {};
    const totalPoints = Math.round((points - (Number(previous.points) || 0)) * 10) / 10;

    if (realPlays.length) {
      realPlays.forEach((play) => consumedIds.add(play.id));
      playCursor?.set(playerId, consumedIds);
      const knownEvents = realPlays.map((play) => ({
        ...play,
        // Provider-backed identity does not depend on refresh time, and the
        // same shared snap therefore keeps one id as contributors arrive.
        id: `replay-${play.id}`,
        at: now,
        source: 'replay-play',
      }));
      const fallbackEvents = unmatchedReconstructedPlays(reconstructed, realPlays)
        .map((fallbackPlay, index) => {
          const desc = describeDelta(fallbackPlay);
          if (!desc) return null;
          return {
            id: `${playerId}-${now}-fallback-${index}`,
            playerId,
            ...getEventClassification(fallbackPlay, meta.position),
            desc,
            stats: fallbackPlay,
            at: now,
          };
        }).filter(Boolean);
      events.push(...settleEventPoints(
        [...knownEvents, ...fallbackEvents],
        scoringSettings,
        meta.position,
        totalPoints,
        { playerId, now },
      ));
      return;
    }

    const fallbackEvents = reconstructed.map((play, index) => {
      const desc = describeDelta(play);
      if (!desc) return null;
      return {
        id: `${playerId}-${now}-${index}`,
        playerId,
        ...getEventClassification(play, meta.position),
        desc,
        stats: play,
        at: now,
      };
    }).filter(Boolean);
    events.push(...settleEventPoints(
      fallbackEvents,
      scoringSettings,
      meta.position,
      totalPoints,
      { playerId, now },
    ));
  });
  return events;
}
