// Runtime mode for the Fantasy Live sandbox.
//
// Both modes exist only in development, so which one is active is a UI choice
// rather than a build-time one — switching must not require restarting Vite.
// The choice persists across reloads so a testing session survives an edit.
//
//   replay    — scrub a completed regular-season week
//   preseason — a roster of likely snap-takers against real preseason games
//
// Changing mode swaps the fixture league, the reported NFL week, and the data
// source, so consumers must treat it as a hard reset rather than a filter.

import { useEffect, useState } from 'react';
import { LIVE_SANDBOX_ENABLED, LIVE_SANDBOX_DEFAULT_MODE } from './liveSandboxFlag';
import { resetClock } from './liveSandboxClock';
import { resetSandboxCache } from './liveSandboxSource';

export const SANDBOX_MODES = Object.freeze([
  { id: 'replay', label: 'Replay' },
  { id: 'preseason', label: 'Preseason' },
]);

const STORAGE_KEY = 'gridshift-live-sandbox-mode';

function readStoredMode() {
  if (!LIVE_SANDBOX_ENABLED) return LIVE_SANDBOX_DEFAULT_MODE;
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return SANDBOX_MODES.some((mode) => mode.id === stored) ? stored : LIVE_SANDBOX_DEFAULT_MODE;
  } catch {
    // Private browsing and storage-blocked contexts fall back to the default.
    return LIVE_SANDBOX_DEFAULT_MODE;
  }
}

const listeners = new Set();
let currentMode = readStoredMode();

export function getSandboxMode() {
  return currentMode;
}

export function isReplayMode() {
  return LIVE_SANDBOX_ENABLED && currentMode === 'replay';
}

export function isPreseasonMode() {
  return LIVE_SANDBOX_ENABLED && currentMode === 'preseason';
}

export function subscribeToMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSandboxMode(mode) {
  if (!SANDBOX_MODES.some((entry) => entry.id === mode) || mode === currentMode) return;
  currentMode = mode;
  try {
    window.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    // Persisting is a convenience, not a requirement.
  }
  // The modes cover different seasons, so nothing cached carries over: drop the
  // fetched slate and rewind the clock, which also tells the view to clear the
  // feed and play state it accumulated under the previous mode.
  resetSandboxCache();
  resetClock();
  listeners.forEach((listener) => listener(currentMode));
}

export function useSandboxMode() {
  const [mode, setMode] = useState(getSandboxMode);
  useEffect(() => subscribeToMode(setMode), []);
  return mode;
}
