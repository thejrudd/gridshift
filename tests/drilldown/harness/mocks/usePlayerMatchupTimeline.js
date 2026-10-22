import { usePlayerMatchupTimeline as useLiveTimeline } from '../../../../src/hooks/usePlayerMatchupTimeline.js';

// Fixture play timeline: the events the live provider would have returned up
// to the harness's game clock. With ?bdl=0 there is no BALLDONTLIE play feed,
// so the real hook and loader run against /api/live/status, which the spec
// answers the way a server without an API key does (or fails outright).
export function usePlayerMatchupTimeline(options) {
  const { bdl, timeline } = globalThis.__drilldownHarness;
  const live = useLiveTimeline({ ...options, enabled: options.enabled && !bdl });
  if (!bdl) return live;
  if (options.phase === 'pregame') return { status: 'idle', events: [], message: null, stale: false };
  const { events, elapsed } = timeline;
  return { status: 'ready', events: events.filter(event => options.phase === 'final' || event.progress <= elapsed), message: null, stale: false };
}
