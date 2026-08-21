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

// Points per play come from the league's own scoring, but the plays together
// have to add up to the change the snapshot actually recorded — the pace chart
// plots the running total of these events and must land on the real score.
function apportionPoints(plays, scoringSettings, position, totalPoints) {
  const raw = plays.map((play) => calcPoints(play, scoringSettings, position));
  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  if (!plays.length) return [];
  if (!Number.isFinite(totalPoints) || rawTotal === 0) {
    return raw.map((value) => Math.round(value * 10) / 10);
  }
  const scale = totalPoints / rawTotal;
  const scaled = raw.map((value) => Math.round(value * scale * 10) / 10);
  // Rounding drift lands on the last play so the sum stays exact.
  const drift = Math.round((totalPoints - scaled.reduce((sum, v) => sum + v, 0)) * 10) / 10;
  if (drift) scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + drift) * 10) / 10;
  return scaled;
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
  } = {},
) {
  const events = [];
  nextSnapshot.forEach(({ stats, points }, playerId) => {
    const previous = previousSnapshot.get(playerId);
    if (!previous || !stats) return;
    const delta = diffStats(previous.stats, stats);
    if (!delta) return;

    const meta = playerMeta.get(playerId) ?? {};
    const reconstructed = splitDeltaIntoPlays(delta);
    if (!reconstructed.length) return;

    const totalPoints = Math.round((points - (Number(previous.points) || 0)) * 10) / 10;

    // The reconstruction says how many plays this delta represents; take that
    // many real ones if they exist.
    const available = playsByPlayer?.get(playerId) ?? [];
    const cursor = playCursor?.get(playerId) ?? 0;
    const realPlays = available.slice(cursor, cursor + reconstructed.length);

    if (realPlays.length) {
      playCursor?.set(playerId, cursor + realPlays.length);
      // Points are apportioned from the snapshot's own change rather than from
      // each play's computed value: play scoring is approximate, and the pace
      // chart's running total has to land on the real score.
      const weights = realPlays.map((play) => Math.abs(Number(play.pts) || 0) || 1);
      const weightTotal = weights.reduce((sum, value) => sum + value, 0);
      let assigned = 0;
      realPlays.forEach((play, index) => {
        const isLast = index === realPlays.length - 1;
        const share = isLast
          ? Math.round((totalPoints - assigned) * 10) / 10
          : Math.round((totalPoints * (weights[index] / weightTotal)) * 10) / 10;
        assigned = Math.round((assigned + share) * 10) / 10;
        events.push({
          ...play,
          id: `${playerId}-${now}-real-${index}`,
          pts: share,
          at: now,
          source: 'replay-play',
        });
      });
      return;
    }

    const pointsPerPlay = apportionPoints(reconstructed, scoringSettings, meta.position, totalPoints);
    reconstructed.forEach((play, index) => {
      const desc = describeDelta(play);
      if (!desc) return;
      events.push({
        id: `${playerId}-${now}-${index}`,
        playerId,
        ...getEventClassification(play, meta.position),
        desc,
        stats: play,
        pts: pointsPerPlay[index] ?? 0,
        at: now,
      });
    });
  });
  return events;
}
