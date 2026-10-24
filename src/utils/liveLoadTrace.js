// liveLoadTrace.js — a diagnostic trace of how Matchups' live layer loads:
// every /api/live request (timing, server time, where the data came from) and
// the page's own milestones up to the chart. Off unless Companion debug is on
// (`?debugCompanion=1` or `companionDebug.enable()`); then
// `companionDebug.liveReport()` prints it in the console.
//
// Times are milliseconds since the page started loading (performance.now()),
// so a request and a milestone can be read on one timeline.

import { isCompanionDebugEnabled } from './companionPerfDebug.js';

const MAX_ENTRIES = 400;
const entries = [];

function push(entry) {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

/** Where a live response's data came from, from the server's `cache` block. */
export function describeLiveSource(cache) {
  // Session and status answers come from the server itself.
  if (!cache) return 'server';
  if (cache.archived) return 'archive (disk)';
  if (Number(cache.providerRequests) > 0) return `provider (${cache.providerRequests} request${cache.providerRequests === 1 ? '' : 's'})`;
  if (cache.coalesced) return 'shared in-flight request';
  if (cache.stale) return 'server cache (stale)';
  if (cache.hit) return 'server cache';
  return 'provider';
}

function readServerMs(response) {
  const header = response?.headers?.get?.('server-timing') ?? '';
  const match = /dur=([\d.]+)/.exec(header);
  return match ? Number(match[1]) : null;
}

/** Records one finished /api/live request. Cheap no-op while debug is off. */
export function traceLiveRequest({ route, startedAt, response = null, payload = null, error = null }) {
  if (!isCompanionDebugEnabled()) return;
  const endedAt = performance.now();
  const rows = Array.isArray(payload?.data) ? payload.data.length : null;
  push({
    type: 'request',
    route,
    at: round(startedAt),
    ms: round(endedAt - startedAt),
    serverMs: round(readServerMs(response)),
    status: response?.status ?? (error ? 'failed' : null),
    source: error ? `error: ${error.message ?? error}` : describeLiveSource(payload?.cache),
    rows,
    dataAgeS: payload?.cache?.ageMs != null ? Math.round(payload.cache.ageMs / 1000) : null,
  });
}

/** Records a page milestone (`label`), with an optional duration or detail. */
export function traceLiveMilestone(label, { ms = null, detail = null } = {}) {
  if (!isCompanionDebugEnabled()) return;
  push({ type: 'milestone', label, at: round(performance.now()), ms: round(ms), detail });
}

/**
 * Times `fn` as a milestone; returns its result. Work under a millisecond is
 * not recorded, so recomputing an empty or unchanged feed does not bury the
 * trace. (In development React runs each memo twice, so real work appears in
 * pairs.)
 */
export function traceLiveWork(label, fn, detail = null) {
  if (!isCompanionDebugEnabled()) return fn();
  const startedAt = performance.now();
  const result = fn();
  const ms = performance.now() - startedAt;
  if (ms >= 1) traceLiveMilestone(label, { ms, detail });
  return result;
}

export function getLiveTrace() {
  return entries.slice();
}

export function clearLiveTrace() {
  entries.length = 0;
}

/** Prints the trace as two tables plus a short summary of the slow parts. */
export function printLiveTrace() {
  const requests = entries.filter((entry) => entry.type === 'request');
  const milestones = entries.filter((entry) => entry.type === 'milestone');
  if (!entries.length) {
    console.info(isCompanionDebugEnabled()
      ? 'Live trace is empty. Open Fantasy → Matchups (or reload it) to record a load.'
      : 'Live trace is off. Run companionDebug.enable(), reload Matchups, then companionDebug.liveReport().');
    return { requests, milestones };
  }
  console.groupCollapsed?.(`GridShift live load: ${requests.length} requests, ${milestones.length} milestones`);
  const withoutType = (entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'type'));
  console.table(requests.map((entry) => ({
    ...withoutType(entry),
    networkMs: entry.ms != null && entry.serverMs != null ? entry.ms - entry.serverMs : null,
  })));
  console.table(milestones.map(withoutType));
  console.groupEnd?.();

  const slowest = requests.slice().sort((left, right) => (right.ms ?? 0) - (left.ms ?? 0)).slice(0, 5);
  const provider = requests.filter((entry) => String(entry.source).startsWith('provider'));
  const failed = requests.filter((entry) => String(entry.source).startsWith('error'));
  const chart = milestones.find((entry) => entry.label === 'chart shown');
  const summary = {
    chartShownAtMs: chart?.at ?? null,
    requests: requests.length,
    fromProvider: provider.length,
    failed: failed.length,
    slowest: slowest.map((entry) => `${entry.route} ${entry.ms}ms (server ${entry.serverMs ?? '?'}ms, ${entry.source})`),
  };
  console.info('GridShift live load summary', summary);
  return { requests, milestones, summary };
}

if (typeof window !== 'undefined' && window.companionDebug) {
  window.companionDebug.liveReport = printLiveTrace;
  window.companionDebug.liveTrace = getLiveTrace;
  window.companionDebug.clearLiveTrace = clearLiveTrace;
}
