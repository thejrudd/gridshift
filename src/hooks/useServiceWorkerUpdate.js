import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Module-level singleton so StrictMode double-mounts (and any future second
// consumer) don't register the service worker twice.
let updateSWRef = null;
let registered = false;
const refreshListeners = new Set();
const DEV_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_UPDATE_BANNER_PREVIEW === 'true';

function ensureRegistered() {
  if (registered || !import.meta.env.PROD) return;
  registered = true;
  updateSWRef = registerSW({
    immediate: true,
    onNeedRefresh() {
      refreshListeners.forEach((listener) => listener(true));
    },
  });
}

// Prompt-mode PWA updates: `needRefresh` flips true when a new build is waiting;
// `applyUpdate()` activates it (skipWaiting) and reloads into the new version.
export default function useServiceWorkerUpdate() {
  const [needRefresh, setNeedRefresh] = useState(DEV_PREVIEW);

  useEffect(() => {
    refreshListeners.add(setNeedRefresh);
    ensureRegistered();
    return () => refreshListeners.delete(setNeedRefresh);
  }, []);

  const applyUpdate = () => {
    // Local-only preview: let the tester dismiss the banner's install state
    // without trying to activate a real service worker update.
    if (DEV_PREVIEW) {
      setNeedRefresh(false);
      return;
    }
    if (updateSWRef) updateSWRef(true);
  };

  return { needRefresh, applyUpdate };
}
