import { useCallback, useEffect, useMemo, useState } from 'react';
import { WHATS_NEW } from '../data/whatsNew';
import { collapseSupersededFeatures, collectWhatsNew, compareVersions, parseVersion } from '../utils/versionUtils';

const STORAGE_KEY = 'gridshift:installedVersion';
const DEV_REPLAY = import.meta.env.DEV && import.meta.env.VITE_WHATS_NEW_REPLAY === 'true';
const DEV_BASELINE = import.meta.env.DEV ? import.meta.env.VITE_WHATS_NEW_BASELINE_OVERRIDE : null;

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
    const current = __APP_VERSION__;

    // Local-only upgrade simulator: calculate the exact feature-version
    // entries crossed by the requested baseline and keep them replayable.
    if (parseVersion(DEV_BASELINE)) {
      setPending(collectWhatsNew(WHATS_NEW, DEV_BASELINE, current));
      return;
    }

    // Local-only test harness: keep the tour available across reloads so it
    // can be replayed on a phone without changing the installed-version key.
    if (DEV_REPLAY) {
      setPending(collapseSupersededFeatures(WHATS_NEW));
      return;
    }

    const lastSeen = readInstalledVersion();

    // A missing key is a first run, not evidence that the user upgraded from
    // every historical version. Establish the current build as the baseline
    // without showing a tour for a fresh install.
    if (!parseVersion(lastSeen)) {
      writeInstalledVersion(current);
      return;
    }

    const baseline = lastSeen;

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
  }, []);

  const markSeen = useCallback(() => {
    if (!enabled) return;
    if (!parseVersion(DEV_BASELINE) && !DEV_REPLAY) {
      writeInstalledVersion(__APP_VERSION__);
    }
    setPending([]);
  }, [enabled]);

  return useMemo(() => ({ pending, markSeen }), [pending, markSeen]);
}
