// Replay clock for the Fantasy Live sandbox.
//
// Holds a single 0..1 progress value across the replayed week and lets the dev
// panel play, pause, scrub, and change speed. State lives at module scope so
// the data source and the panel always read the same instant.

import { useEffect, useState } from 'react';

const TICK_MS = 500;
export const REPLAY_SPEEDS = [
  { id: 'slow', label: '0.5×', windowMs: 20 * 60 * 1000 },
  { id: 'normal', label: '1×', windowMs: 10 * 60 * 1000 },
  { id: 'fast', label: '4×', windowMs: 2.5 * 60 * 1000 },
  { id: 'sprint', label: '20×', windowMs: 30 * 1000 },
];

const listeners = new Set();
// Rewinding invalidates everything observed after the new instant, so the view
// needs a signal distinct from an ordinary tick.
const rewindListeners = new Set();
let timer = null;

const state = {
  progress: 0,
  playing: false,
  // Real time it takes to play the whole slate start to finish.
  windowMs: REPLAY_SPEEDS[1].windowMs,
  speedId: REPLAY_SPEEDS[1].id,
  // Bumped on every change so consumers can key data fetches off it.
  version: 0,
};

function emit() {
  state.version += 1;
  listeners.forEach((listener) => listener(getClockState()));
}

export function getClockState() {
  return { ...state };
}

export function subscribeToClock(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Fires when the clock moves backwards. Consumers use this to drop accumulated
// feed and play state that belongs to a part of the week no longer reached.
export function subscribeToRewind(listener) {
  rewindListeners.add(listener);
  return () => rewindListeners.delete(listener);
}

function emitRewind() {
  rewindListeners.forEach((listener) => listener());
}

function stopTimer() {
  if (timer == null) return;
  window.clearInterval(timer);
  timer = null;
}

function startTimer() {
  stopTimer();
  timer = window.setInterval(() => {
    const step = TICK_MS / state.windowMs;
    const next = state.progress + step;
    if (next >= 1) {
      state.progress = 1;
      state.playing = false;
      stopTimer();
    } else {
      state.progress = next;
    }
    emit();
  }, TICK_MS);
}

export function setProgress(value) {
  const next = Math.min(1, Math.max(0, Number(value) || 0));
  if (next === state.progress) return;
  const rewound = next < state.progress;
  state.progress = next;
  emit();
  if (rewound) emitRewind();
}

export function play() {
  if (state.playing) return;
  // Restarting from the end replays the slate from kickoff.
  const restarting = state.progress >= 1;
  if (restarting) state.progress = 0;
  state.playing = true;
  startTimer();
  emit();
  if (restarting) emitRewind();
}

export function pause() {
  if (!state.playing) return;
  state.playing = false;
  stopTimer();
  emit();
}

export function togglePlay() {
  if (state.playing) pause();
  else play();
}

export function setSpeed(speedId) {
  const speed = REPLAY_SPEEDS.find((entry) => entry.id === speedId);
  if (!speed) return;
  state.speedId = speed.id;
  state.windowMs = speed.windowMs;
  if (state.playing) startTimer();
  emit();
}

export function resetClock() {
  pause();
  state.progress = 0;
  emit();
  emitRewind();
}

export function useReplayClock() {
  const [clock, setClock] = useState(getClockState);
  useEffect(() => subscribeToClock(setClock), []);
  return clock;
}
