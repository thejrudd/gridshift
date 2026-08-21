// Production stand-in for the Fantasy Live sandbox.
//
// vite.config.js aliases the sandbox entry to this file for production builds,
// so the fixture league, the replay engine, and the dev panel never reach the
// shipped bundle. The exports mirror the real entry's shape and are inert.

export const LIVE_SANDBOX_ENABLED = false;
export const SANDBOX_MODES = [];
export const CHART_SCALES = [];
export function getChartScale() {
  return 'projection';
}
export function setChartScale() {}
export function useChartScale() {
  return 'projection';
}
export function getSandboxMode() {
  return 'replay';
}
export function isReplayMode() {
  return false;
}
export function isPreseasonMode() {
  return false;
}
export function setSandboxMode() {}
export function subscribeToMode() {
  return () => {};
}
export function useSandboxMode() {
  return 'replay';
}
export const sandboxLiveSource = {};
export function getReplayGameProgress() {
  return null;
}
export function spreadEventsAcrossInterval(events) {
  return events;
}
export function splitDeltaIntoPlays() {
  return [];
}
export function buildReplayDeltaEvents() {
  return [];
}
export function getPreseasonLiveGames() {
  return Promise.resolve({ data: [] });
}
export function getReplayInstantAt() {
  return null;
}
export function toSlateProgress() {
  return null;
}
export function subscribeToRewind() {
  return () => {};
}
export function useLiveSandbox() {
  return null;
}
export function LiveSandboxPanel() {
  return null;
}
