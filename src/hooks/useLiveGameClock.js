import { useSyncExternalStore } from 'react';
import {
  formatLiveClockLabel,
  isTickingClockGame,
  liveClockTicker,
} from '../utils/liveClockTicker.js';

const noopSubscribe = () => () => {};
const idleSnapshot = () => 0;

function staticClock(game, fallbackLabel) {
  const period = game?.live?.period ?? null;
  const clock = game?.live?.clock ?? null;
  return {
    label: fallbackLabel ?? game?.statusLabel ?? formatLiveClockLabel(period, clock),
    clock,
    period: period == null ? null : String(period),
    frozen: true,
    stopReason: null,
    stale: false,
  };
}

/**
 * The shared live game clock for one game. Ticks only for a live,
 * BALLDONTLIE-sourced game with a provider clock anchor; every other game
 * returns its provider label and never subscribes.
 *
 * Presentation only: never feed the result into win probability, pace,
 * progress, replay, or charts.
 */
export default function useLiveGameClock(game, {
  enabled = true,
  fallbackLabel = null,
  sampleIntervalMs = null,
} = {}) {
  const eligible = enabled && isTickingClockGame(game);
  useSyncExternalStore(
    eligible ? liveClockTicker.subscribe : noopSubscribe,
    eligible ? liveClockTicker.getSnapshot : idleSnapshot,
    idleSnapshot,
  );
  if (!eligible) return staticClock(game, fallbackLabel);
  return liveClockTicker.resolveGame(game, { sampleIntervalMs }) ?? staticClock(game, fallbackLabel);
}
