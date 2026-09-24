// ── Global search lifecycle ────────────────────────────────────────────────
// Owns the palette's open state, the Cmd/Ctrl+K shortcut, and the search index.
//
// Index loading is deliberately lazy and non-committal: it starts when the
// palette is first opened, reads whatever is already available, and never
// triggers a large fetch on the user's behalf. Opening search should cost
// nothing the app was not going to pay anyway.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildLeagueRecords,
  buildStaticRecords,
  composeIndex,
} from '../utils/globalSearch/buildIndex.js';
import {
  buildPlayerRecords,
  unpackPlayerRecords,
} from '../utils/globalSearch/entities/players.js';
import {
  SLICE_PLAYERS,
  SLICE_STATIC,
  isSliceStale,
  readSlice,
  writeSlice,
} from '../utils/globalSearch/persist.js';

const INDEX_URL = '/search-index.v1.json';

// Typing into a field must never be hijacked by the shortcut.
function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Load the static and player slices, preferring persisted copies and falling
 * back to the precached artifact.
 *
 * Both paths work offline: the artifact is precached by the service worker, and
 * the persisted copy survives a cold start with no network at all.
 */
async function loadBaseSlices() {
  const [persistedStatic, persistedPlayers] = await Promise.all([
    readSlice(SLICE_STATIC),
    readSlice(SLICE_PLAYERS),
  ]);

  if (persistedStatic?.records?.length && persistedPlayers?.records?.length) {
    return {
      staticRecords: persistedStatic.records,
      playerRecords: persistedPlayers.records,
      playersStale: isSliceStale(persistedPlayers),
    };
  }

  const response = await fetch(INDEX_URL);
  if (!response.ok) throw new Error(`search index HTTP ${response.status}`);
  const artifact = await response.json();

  const staticRecords = persistedStatic?.records?.length
    ? persistedStatic.records
    : (artifact.staticRecords ?? []);
  const playerRecords = unpackPlayerRecords(artifact.packedPlayers ?? []);

  // Persist so the next cold start skips the fetch entirely.
  writeSlice(SLICE_STATIC, staticRecords);
  writeSlice(SLICE_PLAYERS, playerRecords);

  return { staticRecords, playerRecords, playersStale: true };
}

export default function useGlobalSearch({
  league = null,
  sleeperPlayers = null,
  espnIdOverrides = null,
} = {}) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const loadStartedRef = useRef(false);

  // Loading is kicked off from the open handler rather than an effect: it is a
  // response to a user action, not a synchronization with an external system.
  const ensureLoaded = useCallback(() => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setStatus('loading');
    loadBaseSlices()
      .then((loaded) => {
        setBase(loaded);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  const openSearch = useCallback(() => {
    ensureLoaded();
    setOpen(true);
  }, [ensureLoaded]);

  const closeSearch = useCallback(() => setOpen(false), []);

  const toggleSearch = useCallback(() => {
    ensureLoaded();
    setOpen((previous) => !previous);
  }, [ensureLoaded]);

  // ── Cmd/Ctrl+K ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'k' && event.key !== 'K') return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggleSearch();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  // ── Live player slice ─────────────────────────────────────────────────────
  // Derived, not stored: when the app already holds the player directory for its
  // own reasons, it supersedes the static slice. Search never fetches it —
  // that payload is multiple megabytes, and a slightly stale name index is a far
  // better trade than a palette that stalls.
  const livePlayerRecords = useMemo(() => {
    if (!base?.playersStale) return null;
    if (!sleeperPlayers || !Object.keys(sleeperPlayers).length) return null;
    const records = buildPlayerRecords(sleeperPlayers, { espnIdOverrides: espnIdOverrides ?? {} });
    return records.length ? records : null;
  }, [base?.playersStale, sleeperPlayers, espnIdOverrides]);

  // Persisting is an external side effect, so it belongs in an effect.
  useEffect(() => {
    if (!livePlayerRecords) return;
    writeSlice(SLICE_PLAYERS, livePlayerRecords);
  }, [livePlayerRecords]);

  // League records are small and already in memory, so they rebuild with the
  // league rather than being cached.
  const leagueRecords = useMemo(() => (league ? buildLeagueRecords(league) : []), [league]);

  const index = useMemo(() => {
    if (!base) return null;
    return composeIndex({
      staticRecords: base.staticRecords,
      playerRecords: livePlayerRecords ?? base.playerRecords,
      leagueRecords,
    });
  }, [base, livePlayerRecords, leagueRecords]);

  return { open, openSearch, closeSearch, toggleSearch, index, status };
}

// Re-exported for callers that need the static slice without the network.
export { buildStaticRecords };
