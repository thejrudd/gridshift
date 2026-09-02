import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperLeague } from '../context/SleeperContext';
import {
  claimSharedTradeProposal,
  acceptTradeProposal,
  counterTradeProposal,
  createTradeProposal,
  createTradeSession,
  declineTradeProposal,
  getTradeProposal,
  getTradeInbox,
  markTradeEventRead,
  reconcileTradeProposal,
  markTradeProposalDone,
  withdrawTradeProposal,
} from '../api/tradeProposalApi';

const SESSION_STORAGE_PREFIX = 'gridshift_trade_participant_session_v1';
const POLL_INTERVAL_MS = 30_000;

function getStorageKey({ leagueId, season, sleeperUserId }) {
  return `${SESSION_STORAGE_PREFIX}:${leagueId}:${season}:${sleeperUserId}`;
}

function readStoredToken(key) {
  if (!key || typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStoredToken(key, token) {
  if (!key || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, token); } catch { /* private browsing / quota */ }
}

export default function useTradeProposals({ enabled = true } = {}) {
  const {
    platform,
    sleeperUser,
    selectedLeagueId,
    season,
    myRoster,
  } = useSleeperLeague();
  const myRosterData = myRoster();
  const scope = useMemo(() => ({
    leagueId: selectedLeagueId == null ? null : String(selectedLeagueId),
    season: season == null ? null : String(season),
    sleeperUserId: sleeperUser?.user_id == null ? null : String(sleeperUser.user_id),
    rosterId: myRosterData?.roster_id == null ? null : String(myRosterData.roster_id),
  }), [myRosterData?.roster_id, season, selectedLeagueId, sleeperUser?.user_id]);
  const storageKey = useMemo(
    () => scope.leagueId && scope.season && scope.sleeperUserId ? getStorageKey(scope) : null,
    [scope],
  );
  const [sessionToken, setSessionToken] = useState(null);
  const [inbox, setInbox] = useState({ proposals: [], events: [], unreadCount: 0 });
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    setSessionToken(enabled ? readStoredToken(storageKey) : null);
    setInbox({ proposals: [], events: [], unreadCount: 0 });
    setError(null);
  }, [enabled, storageKey]);

  const establishSession = useCallback(async () => {
    if (!enabled || platform !== 'sleeper' || !scope.leagueId || !scope.season || !scope.sleeperUserId || !scope.rosterId) return null;
    setSessionLoading(true);
    try {
      const response = await createTradeSession(scope);
      const token = response?.sessionToken ?? null;
      if (!token) throw new Error('The GridShift trade participant session could not be established.');
      writeStoredToken(storageKey, token);
      setSessionToken(token);
      return token;
    } finally {
      setSessionLoading(false);
    }
  }, [enabled, platform, scope, storageKey]);

  const ensureSession = useCallback(async () => {
    if (sessionToken) return sessionToken;
    return establishSession();
  }, [establishSession, sessionToken]);

  useEffect(() => {
    if (!enabled || platform !== 'sleeper' || sessionToken || !storageKey) return undefined;
    let cancelled = false;
    establishSession().catch((requestError) => {
      if (!cancelled) setError(requestError);
    });
    return () => { cancelled = true; };
  }, [enabled, establishSession, platform, sessionToken, storageKey]);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const token = await ensureSession();
    if (!token) return null;
    const version = requestVersionRef.current + 1;
    requestVersionRef.current = version;
    setLoading(true);
    try {
      const response = await getTradeInbox({ token });
      if (requestVersionRef.current === version) {
        setInbox({ proposals: response?.proposals ?? [], events: response?.events ?? [], unreadCount: Number(response?.unreadCount ?? 0) });
        setError(null);
      }
      return response;
    } catch (requestError) {
      if (requestError?.status === 401) {
        setSessionToken(null);
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      }
      if (requestVersionRef.current === version) setError(requestError);
      return null;
    } finally {
      if (requestVersionRef.current === version) setLoading(false);
    }
  }, [enabled, ensureSession, storageKey]);

  const loadProposal = useCallback(async (proposalId) => {
    if (!enabled) throw new Error('Trade is only available for the current league season.');
    const token = await ensureSession();
    if (!token) throw new Error('Connect a Sleeper league before opening a trade proposal.');
    try {
      const response = await getTradeProposal(proposalId, { token });
      setError(null);
      return response?.proposal ?? null;
    } catch (requestError) {
      setError(requestError);
      throw requestError;
    }
  }, [enabled, ensureSession]);

  useEffect(() => {
    if (!enabled || platform !== 'sleeper' || !sessionToken) return undefined;
    let cancelled = false;
    const run = () => { if (!cancelled) void refresh(); };
    run();
    const interval = window.setInterval(run, POLL_INTERVAL_MS);
    const onFocus = () => run();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, platform, refresh, sessionToken]);

  const runWithSession = useCallback(async (operation) => {
    if (!enabled) throw new Error('Trade is only available for the current league season.');
    const token = await ensureSession();
    if (!token) throw new Error('Connect a Sleeper league before using GridShift trade proposals.');
    try {
      const response = await operation(token);
      setError(null);
      await refresh();
      return response;
    } catch (requestError) {
      setError(requestError);
      throw requestError;
    }
  }, [enabled, ensureSession, refresh]);

  const sendProposal = useCallback((snapshot, recipientUserId, recipientRosterId, expiryPreset = 'two_days') => runWithSession((token) => createTradeProposal({
    ...scope,
    senderRosterId: scope.rosterId,
    recipientUserId,
    recipientRosterId,
    snapshot,
    expiryPreset,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }, { token })), [runWithSession, scope]);

  const sendCounter = useCallback((proposalId, expectedRevision, snapshot, expiryPreset = 'two_days') => runWithSession((token) => counterTradeProposal(proposalId, {
    expectedRevision,
    snapshot,
    expiryPreset,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }, { token })), [runWithSession]);

  const decline = useCallback((proposalId) => runWithSession((token) => declineTradeProposal(proposalId, { token })), [runWithSession]);
  const withdraw = useCallback((proposalId) => runWithSession((token) => withdrawTradeProposal(proposalId, { token })), [runWithSession]);
  const accept = useCallback((proposalId) => runWithSession((token) => acceptTradeProposal(proposalId, { token })), [runWithSession]);
  const markDone = useCallback((proposalId) => runWithSession((token) => markTradeProposalDone(proposalId, { token })), [runWithSession]);
  const reconcile = useCallback((proposalId) => runWithSession((token) => reconcileTradeProposal(proposalId, { token })), [runWithSession]);
  const markRead = useCallback((eventId) => runWithSession((token) => markTradeEventRead(eventId, { token })), [runWithSession]);

  const claimShare = useCallback(async (shareToken) => {
    if (!enabled) throw new Error('Trade is only available for the current league season.');
    const response = await claimSharedTradeProposal(shareToken, {
      sleeperUserId: scope.sleeperUserId,
      rosterId: scope.rosterId,
    });
    if (response?.sessionToken) {
      writeStoredToken(storageKey, response.sessionToken);
      setSessionToken(response.sessionToken);
    }
    await refresh();
    return response;
  }, [enabled, refresh, scope.rosterId, scope.sleeperUserId, storageKey]);

  return useMemo(() => ({
    scope,
    sessionToken,
    sessionLoading,
    loading,
    error,
    inbox,
    unreadCount: inbox.unreadCount,
    refresh,
    loadProposal,
    establishSession,
    sendProposal,
    sendCounter,
    decline,
    withdraw,
    accept,
    markDone,
    reconcile,
    markRead,
    claimShare,
  }), [accept, claimShare, decline, error, establishSession, inbox, loadProposal, loading, markDone, markRead, reconcile, refresh, sendCounter, sendProposal, sessionLoading, sessionToken, scope, withdraw]);
}
