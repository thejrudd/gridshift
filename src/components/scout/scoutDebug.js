const SCOUT_DEBUG_FLAG = 'scoutDebug';

function readDebugFlag() {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage?.getItem(SCOUT_DEBUG_FLAG);
  if (stored === '0' || stored === 'false') return false;
  if (stored === '1' || stored === 'true') return true;
  return Boolean(import.meta.env.DEV);
}

export function isScoutDebugEnabled() {
  try {
    return readDebugFlag();
  } catch {
    return Boolean(import.meta.env.DEV);
  }
}

export function scoutDebug(label, payload) {
  if (!isScoutDebugEnabled()) return;
  console.groupCollapsed(`[Scout Debug] ${label}`);
  console.log(payload);
  console.groupEnd();
}

export function scoutDebugTable(label, rows) {
  if (!isScoutDebugEnabled()) return;
  console.groupCollapsed(`[Scout Debug] ${label}`);
  console.table(rows);
  console.groupEnd();
}

if (typeof window !== 'undefined') {
  window.__SCOUT_DEBUG__ = {
    enable() {
      window.localStorage?.setItem(SCOUT_DEBUG_FLAG, '1');
      console.info('[Scout Debug] enabled. Reload the page to replay startup logs.');
    },
    disable() {
      window.localStorage?.setItem(SCOUT_DEBUG_FLAG, '0');
      console.info('[Scout Debug] disabled.');
    },
    status() {
      console.info(`[Scout Debug] ${isScoutDebugEnabled() ? 'enabled' : 'disabled'}`);
    },
  };
}
