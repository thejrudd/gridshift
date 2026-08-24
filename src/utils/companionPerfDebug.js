const STORAGE_KEY = 'companionDebug';
const QUERY_KEY = 'debugCompanion';
const PREFIX = '[Companion Debug]';

function readQueryOverride() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(QUERY_KEY);
  if (value == null) return null;
  return value === '1' || value === 'true' || value === 'on';
}

export function isCompanionDebugEnabled() {
  if (typeof window === 'undefined') return false;

  const queryOverride = readQueryOverride();
  if (queryOverride != null) {
    try {
      window.localStorage.setItem(STORAGE_KEY, queryOverride ? '1' : '0');
    } catch {
      return queryOverride;
    }
    return queryOverride;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function debugCompanionLog(label, payload = null) {
  if (!isCompanionDebugEnabled()) return;
  if (payload == null) {
    console.info(PREFIX, label);
    return;
  }
  console.info(PREFIX, label, payload);
}

export function debugCompanionMeasure(label, fn, payload = null) {
  if (!isCompanionDebugEnabled()) return fn();
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  if (payload == null) {
    console.info(PREFIX, `${label}: ${duration.toFixed(1)}ms`);
  } else {
    console.info(PREFIX, `${label}: ${duration.toFixed(1)}ms`, payload);
  }
  return result;
}

export async function debugCompanionTimeAsync(label, fn, payload = null) {
  if (!isCompanionDebugEnabled()) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    if (payload == null) {
      console.info(PREFIX, `${label}: ${duration.toFixed(1)}ms`);
    } else {
      console.info(PREFIX, `${label}: ${duration.toFixed(1)}ms`, payload);
    }
  }
}

if (typeof window !== 'undefined') {
  window.companionDebug = {
    enable() {
      window.localStorage.setItem(STORAGE_KEY, '1');
      console.info(PREFIX, 'Enabled. Refresh or navigate to Companion to capture load timings.');
    },
    disable() {
      window.localStorage.setItem(STORAGE_KEY, '0');
      console.info(PREFIX, 'Disabled.');
    },
    status() {
      const enabled = isCompanionDebugEnabled();
      console.info(PREFIX, `Debug is ${enabled ? 'enabled' : 'disabled'}.`);
      return enabled;
    },
  };
}
