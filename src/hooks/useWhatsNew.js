import { useCallback, useEffect, useMemo, useState } from 'react';
import { WHATS_NEW } from '../data/whatsNew';
import { collectWhatsNew, compareVersions, parseVersion } from '../utils/versionUtils';

const STORAGE_KEY = 'gridshift:installedVersion';
const DEV_REPLAY = import.meta.env.DEV && import.meta.env.VITE_WHATS_NEW_REPLAY === 'true';

function readInstalledVersion() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function writeInstalledVersion(version) {
  try { localStorage.setItem(STORAGE_KEY, version); } catch { /* ignore */ }
}

// Tracks which app version this browser last ran. Exposes the What's New
// entries the user crossed since then (feature versions only — patch releases
// have no WHATS_NEW entry, so nothing is shown for them).
export default function useWhatsNew({ enabled = true } = {}) {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    // Do not consume the tour before the user has opened a league. The
    // league is required by the tour's Companion routes and anchors.
    if (!enabled) return;

    const current = __APP_VERSION__;

    // Local-only test harness: keep the tour available across reloads so it
    // can be replayed on a phone without changing the installed-version key.
    if (DEV_REPLAY) {
      setPending(WHATS_NEW);
      return;
    }

    const lastSeen = readInstalledVersion();

    // The tour was introduced in 8.1, so an absent key can mean either a
    // first-time user or an upgrade from a historical install. Treat both as
    // pre-tour installs so historical users do not miss the current catalog.
    const baseline = parseVersion(lastSeen) ? lastSeen : '0.0.0';

    if (compareVersions(baseline, current) >= 0) return;

    const entries = collectWhatsNew(WHATS_NEW, baseline, current);
    if (entries.length === 0) {
      // Patch-only jump — silently mark as seen.
      writeInstalledVersion(current);
      return;
    }

    // Feature versions crossed: leave the stored version untouched until the
    // user dismisses or finishes the tour, so a mid-tour reload re-offers it.
    setPending(entries);
  }, [enabled]);

  const markSeen = useCallback(() => {
    if (!enabled) return;
    writeInstalledVersion(__APP_VERSION__);
    setPending([]);
  }, [enabled]);

  return useMemo(() => ({ pending, markSeen }), [pending, markSeen]);
}
