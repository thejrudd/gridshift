import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFantasyLeague } from './SleeperContext.jsx';
import DraftSyncContext from './DraftSyncContext.js';
import {
  claimDraftSyncPairing,
  getDraftSyncDevice,
  getDraftSyncPairingStatus,
  getDraftSyncState,
  getDraftSyncStatus,
  putDraftSyncState,
  revokeDraftSyncDevice,
  startDraftSyncPairing,
} from '../api/draftSyncApi.js';

const DEVICE_TOKEN_STORAGE_KEY = 'gridshift_draft_sync_device_tokens_v1';
const SYNC_META_PREFIX = 'gridshift_draft_sync_meta_v1';
const POLL_INTERVAL_MS = 2_000;
const WRITE_DEBOUNCE_MS = 500;
const MAX_RETRY_MS = 30_000;
const DRAFT_SYNC_SCHEMA_VERSION = 1;
const DEVICE_ROLE_AUTHORITATIVE = 'authoritative';
const DEVICE_ROLE_NON_AUTHORITATIVE = 'non-authoritative';

function normalizeUserId(value) {
  const id = String(value ?? '').trim();
  return id || null;
}

function normalizeDeviceRole(value) {
  return value === DEVICE_ROLE_AUTHORITATIVE || value === DEVICE_ROLE_NON_AUTHORITATIVE ? value : null;
}

function getScopeKey(scope) {
  return [scope?.sleeperUserId, scope?.leagueId, scope?.season, scope?.draftId]
    .map((value) => String(value ?? ''))
    .join(':');
}

function readTokenMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readToken(userId) {
  if (!userId) return '';
  return String(readTokenMap()[userId] ?? '');
}

function writeToken(userId, token) {
  if (!userId) return;
  try {
    const tokens = readTokenMap();
    if (token) tokens[userId] = token;
    else delete tokens[userId];
    localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Device credentials are best-effort local state. A cleared browser can re-pair.
  }
}

function readMeta(scopeKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${SYNC_META_PREFIX}:${scopeKey}`) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMeta(scopeKey, next) {
  try {
    localStorage.setItem(`${SYNC_META_PREFIX}:${scopeKey}`, JSON.stringify({
      ...readMeta(scopeKey),
      ...next,
    }));
  } catch {
    // Sync metadata is not allowed to block local Draft work.
  }
}

function hasDraftState(state) {
  return Boolean(
    (state?.board?.overall?.length ?? 0)
      || Object.values(state?.board?.byPosition ?? {}).some((ids) => ids?.length),
  );
}

function isSupportedDraftState(state) {
  const schemaVersion = Number(state?.schemaVersion ?? DRAFT_SYNC_SCHEMA_VERSION);
  return Number.isFinite(schemaVersion) && schemaVersion <= DRAFT_SYNC_SCHEMA_VERSION;
}

function getErrorStatus(error) {
  if (error?.status === 401 || error?.status === 403) return 'auth-required';
  if (error?.status === 409) return 'conflict';
  if (error?.status === 413) return 'server-error';
  return 'offline';
}

export function DraftSyncProvider({ children }) {
  const { platform, sleeperUser } = useFantasyLeague();
  const sleeperUserId = normalizeUserId(sleeperUser?.user_id);
  const [serverStatus, setServerStatus] = useState({ loading: true, enabled: false, error: null });
  const [deviceToken, setDeviceToken] = useState(() => readToken(sleeperUserId));
  const [pairingCode, setPairingCode] = useState('');
  const [pairingId, setPairingId] = useState('');
  const [pairingStatus, setPairingStatus] = useState('');
  const [deviceRole, setDeviceRole] = useState(null);
  const [syncStatus, setSyncStatus] = useState('local-only');
  const [conflict, setConflict] = useState(null);
  const [initialSyncSetup, setInitialSyncSetup] = useState(null);
  const [scope, setScope] = useState(null);
  const registrationRef = useRef(null);
  const scopeRef = useRef(null);
  const tokenRef = useRef(deviceToken);
  const deviceRoleRef = useRef(deviceRole);
  const revisionRef = useRef(0);
  const etagRef = useRef(null);
  const pendingStateRef = useRef(null);
  const writeTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryDelayRef = useRef(1_000);
  const syncInFlightRef = useRef(false);
  const pairingStatusRef = useRef('');
  const initialSyncSetupRef = useRef(null);
  const pendingAuthorityAtRef = useRef(null);
  const authorityPublishPendingRef = useRef(false);

  useEffect(() => {
    tokenRef.current = deviceToken;
    deviceRoleRef.current = deviceRole;
    writeToken(sleeperUserId, deviceToken);
  }, [deviceRole, deviceToken, sleeperUserId]);

  useEffect(() => {
    if (!serverStatus.enabled || !deviceToken) return undefined;
    let active = true;
    getDraftSyncDevice({ token: deviceToken })
      .then((result) => {
        if (!active) return;
        const nextRole = normalizeDeviceRole(result?.deviceRole);
        if (nextRole) {
          deviceRoleRef.current = nextRole;
          setDeviceRole(nextRole);
        }
      })
      .catch(() => {
        // The state and pairing responses also carry the role; this is only a refresh fallback.
      });
    return () => { active = false; };
  }, [deviceToken, serverStatus.enabled]);

  useEffect(() => {
    setDeviceToken(readToken(sleeperUserId));
    setPairingCode('');
    setPairingId('');
    setPairingStatus('');
    deviceRoleRef.current = null;
    setDeviceRole(null);
    pairingStatusRef.current = '';
    setConflict(null);
    setInitialSyncSetup(null);
    initialSyncSetupRef.current = null;
    pendingAuthorityAtRef.current = null;
    authorityPublishPendingRef.current = false;
    setScope(null);
    registrationRef.current = null;
  }, [sleeperUserId]);

  const refreshStatus = useCallback(async () => {
    try {
      const payload = await getDraftSyncStatus();
      const capability = payload?.draftSync ?? payload ?? {};
      setServerStatus({
        loading: false,
        ...capability,
        enabled: capability.enabled === true && capability.ready !== false,
        error: null,
      });
      return payload;
    } catch (error) {
      setServerStatus({ loading: false, enabled: false, error });
      return null;
    }
  }, []);

  useEffect(() => {
    if (platform !== 'sleeper' || !sleeperUserId) {
      setServerStatus({ loading: false, enabled: false, error: null });
      return undefined;
    }
    void refreshStatus();
    return undefined;
  }, [platform, sleeperUserId, refreshStatus]);

  const clearTimers = useCallback(() => {
    if (writeTimerRef.current) window.clearTimeout(writeTimerRef.current);
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    writeTimerRef.current = null;
    retryTimerRef.current = null;
  }, []);

  const applyRemoteState = useCallback((remoteState, remoteRevision, remoteEtag) => {
    const registration = registrationRef.current;
    if (!registration?.onRemoteState) return;
    revisionRef.current = Number(remoteRevision ?? 0);
    etagRef.current = remoteEtag ?? null;
    pendingStateRef.current = null;
    authorityPublishPendingRef.current = false;
    setConflict(null);
    initialSyncSetupRef.current = null;
    setInitialSyncSetup(null);
    writeMeta(getScopeKey(scopeRef.current), {
      revision: revisionRef.current,
      dirty: false,
    });
    registration.onRemoteState(remoteState);
    setSyncStatus('synced');
  }, []);

  const waitForAuthoritativeState = useCallback((overrides = {}) => {
    const localState = registrationRef.current?.getLocalState?.();
    const nextSetup = {
      status: 'waiting',
      role: DEVICE_ROLE_NON_AUTHORITATIVE,
      hasLocalState: hasDraftState(localState),
      ...overrides,
    };
    initialSyncSetupRef.current = nextSetup;
    setInitialSyncSetup(nextSetup);
    setSyncStatus('waiting-for-primary');
  }, []);

  const fetchRemoteState = useCallback(async () => {
    const activeScope = scopeRef.current;
    const token = tokenRef.current;
    const registration = registrationRef.current;
    if (!serverStatus.enabled || !activeScope || !token || !registration || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const result = await getDraftSyncState({ token, scope: activeScope, etag: etagRef.current });
      const resultRole = normalizeDeviceRole(result.deviceRole);
      if (resultRole && resultRole !== deviceRoleRef.current) {
        deviceRoleRef.current = resultRole;
        setDeviceRole(resultRole);
      }
      if (result.notModified) {
        setSyncStatus((current) => initialSyncSetupRef.current?.status === 'waiting'
          ? 'waiting-for-primary'
          : current === 'syncing' ? 'synced' : current);
        return;
      }
      if (result.missing) {
        revisionRef.current = 0;
        etagRef.current = null;
        if (deviceRoleRef.current === DEVICE_ROLE_NON_AUTHORITATIVE) {
          waitForAuthoritativeState();
        } else if (deviceRoleRef.current === DEVICE_ROLE_AUTHORITATIVE) {
          authorityPublishPendingRef.current = true;
          setInitialSyncSetup(null);
          initialSyncSetupRef.current = null;
          setSyncStatus('syncing');
        } else {
          setSyncStatus('waiting-for-primary');
        }
        return;
      }

      const remoteState = result.state ?? result.data ?? null;
      const remoteRevision = Number(result.revision ?? result.version ?? 0);
      const remoteEtag = result.etag ?? null;
      if (!isSupportedDraftState(remoteState)) {
        setSyncStatus('update-required');
        return;
      }
      if (pendingAuthorityAtRef.current != null) return;
      if (authorityPublishPendingRef.current) return;
      if (initialSyncSetupRef.current?.status === 'waiting') {
        applyRemoteState(remoteState, remoteRevision, remoteEtag);
        return;
      }
      const localState = registration.getLocalState?.();
      const meta = readMeta(getScopeKey(activeScope));
      if (meta.dirty) {
        setConflict({ localState, remoteState, remoteRevision, remoteEtag });
        revisionRef.current = remoteRevision;
        etagRef.current = remoteEtag;
        setSyncStatus('conflict');
        return;
      }
      applyRemoteState(remoteState, remoteRevision, remoteEtag);
    } catch (error) {
      setSyncStatus(getErrorStatus(error));
    } finally {
      syncInFlightRef.current = false;
    }
  }, [applyRemoteState, serverStatus.enabled, waitForAuthoritativeState]);

  const flushPendingState = useCallback(async () => {
    const activeScope = scopeRef.current;
    const token = tokenRef.current;
    const state = pendingStateRef.current;
    if (!serverStatus.enabled || !activeScope || !token || !state) return;
    if (syncInFlightRef.current) {
      if (authorityPublishPendingRef.current && !writeTimerRef.current) {
        writeTimerRef.current = window.setTimeout(() => {
          writeTimerRef.current = null;
          void flushPendingState();
        }, WRITE_DEBOUNCE_MS);
      }
      return;
    }
    syncInFlightRef.current = true;
    setSyncStatus('syncing');
    try {
      const result = await putDraftSyncState({
        token,
        scope: activeScope,
        state,
        expectedRevision: revisionRef.current,
        initialChoiceAt: pendingAuthorityAtRef.current,
      });
      revisionRef.current = Number(result.revision ?? result.version ?? revisionRef.current + 1);
      etagRef.current = result.etag ?? etagRef.current;
      pendingStateRef.current = null;
      retryDelayRef.current = 1_000;
      const authorityAt = pendingAuthorityAtRef.current;
      writeMeta(getScopeKey(activeScope), {
        revision: revisionRef.current,
        dirty: false,
      });
      setConflict(null);
      if (authorityAt != null) {
        pendingAuthorityAtRef.current = null;
        applyRemoteState(result.state ?? state, result.revision, result.etag ?? etagRef.current);
      } else {
        setSyncStatus('synced');
      }
    } catch (error) {
      if (error?.status === 409) {
        const remoteRevision = Number(error.payload?.revision ?? revisionRef.current);
        const remoteEtag = error.etag ?? `"${remoteRevision}"`;
        setConflict({
          localState: state,
          remoteState: error.payload?.state ?? null,
          remoteRevision,
          remoteEtag,
        });
        revisionRef.current = remoteRevision;
        etagRef.current = remoteEtag;
        if (pendingAuthorityAtRef.current != null && error.payload?.state) {
          pendingAuthorityAtRef.current = null;
          applyRemoteState(error.payload.state, remoteRevision, remoteEtag);
          return;
        }
        setSyncStatus('conflict');
      } else {
        setSyncStatus(getErrorStatus(error));
        if (!retryTimerRef.current) {
          const delay = retryDelayRef.current;
          retryDelayRef.current = Math.min(MAX_RETRY_MS, delay * 2);
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            void flushPendingState();
          }, delay);
        }
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, [applyRemoteState, serverStatus.enabled]);

  const publishDraftState = useCallback((nextState) => {
    if (!scopeRef.current || !serverStatus.enabled) return;
    if (initialSyncSetupRef.current?.status === 'waiting') {
      pendingStateRef.current = nextState;
      setSyncStatus('waiting-for-primary');
      return;
    }
    pendingStateRef.current = nextState;
    writeMeta(getScopeKey(scopeRef.current), { revision: revisionRef.current, dirty: true });
    if (!tokenRef.current) {
      setSyncStatus('local-only');
      return;
    }
    setSyncStatus('syncing');
    if (writeTimerRef.current) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      writeTimerRef.current = null;
      void flushPendingState();
    }, WRITE_DEBOUNCE_MS);
  }, [flushPendingState, serverStatus.enabled]);

  const registerDraftScope = useCallback((registration) => {
    const nextScope = {
      sleeperUserId,
      leagueId: String(registration?.leagueId ?? ''),
      season: String(registration?.season ?? ''),
      draftId: String(registration?.draftId ?? ''),
    };
    registrationRef.current = registration;
    scopeRef.current = nextScope;
    setScope(nextScope);
    const localMeta = readMeta(getScopeKey(nextScope));
    revisionRef.current = Number(localMeta.revision ?? 0);
    etagRef.current = null;
    setConflict(null);
    initialSyncSetupRef.current = null;
    setInitialSyncSetup(null);
    if (deviceRoleRef.current === DEVICE_ROLE_NON_AUTHORITATIVE) waitForAuthoritativeState();
    return () => {
      if (registrationRef.current === registration) {
        registrationRef.current = null;
        scopeRef.current = null;
        setScope(null);
        clearTimers();
      }
    };
  }, [clearTimers, sleeperUserId, waitForAuthoritativeState]);

  const queueAuthoritativeState = useCallback(() => {
    const activeScope = scopeRef.current;
    const registration = registrationRef.current;
    const localState = registration?.getLocalState?.();
    authorityPublishPendingRef.current = true;
    if (!activeScope || !registration || !localState || !tokenRef.current) return;
    pendingAuthorityAtRef.current = Date.now();
    initialSyncSetupRef.current = null;
    setInitialSyncSetup(null);
    revisionRef.current = Number(revisionRef.current ?? 0);
    pendingStateRef.current = localState;
    writeMeta(getScopeKey(activeScope), { revision: revisionRef.current, dirty: true });
    setSyncStatus('syncing');
    if (writeTimerRef.current) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      writeTimerRef.current = null;
      void flushPendingState();
    }, WRITE_DEBOUNCE_MS);
  }, [flushPendingState]);

  useEffect(() => {
    if (deviceRole !== DEVICE_ROLE_AUTHORITATIVE || !authorityPublishPendingRef.current || !scope || !registrationRef.current) return;
    queueAuthoritativeState();
  }, [deviceRole, queueAuthoritativeState, scope, syncStatus]);

  useEffect(() => {
    if (!scope || !serverStatus.enabled || !deviceToken || !registrationRef.current) return undefined;
    clearTimers();
    void fetchRemoteState();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchRemoteState();
    };
    const onOnline = () => {
      retryDelayRef.current = 1_000;
      void fetchRemoteState();
      void flushPendingState();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchRemoteState();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearTimers();
    };
  }, [clearTimers, deviceToken, fetchRemoteState, flushPendingState, scope, serverStatus.enabled]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!pairingId || pairingStatus !== 'pending' || !deviceToken || !serverStatus.enabled) return undefined;
    let active = true;
    const checkPairing = async () => {
      try {
        const result = await getDraftSyncPairingStatus({ token: tokenRef.current, pairingId });
        if (!active) return;
        const nextStatus = result?.status ?? 'pending';
        if (nextStatus === 'claimed') {
          pairingStatusRef.current = 'claimed';
          setPairingStatus('claimed');
          setPairingCode('');
          if (deviceRoleRef.current === DEVICE_ROLE_AUTHORITATIVE && authorityPublishPendingRef.current) queueAuthoritativeState();
        } else if (nextStatus === 'expired') {
          pairingStatusRef.current = 'expired';
          setPairingStatus('expired');
          setPairingCode('');
          setSyncStatus('local-only');
        }
      } catch (error) {
        if (active && error?.status === 404) {
          pairingStatusRef.current = 'expired';
          setPairingStatus('expired');
          setPairingCode('');
          setSyncStatus('local-only');
        }
      }
    };
    void checkPairing();
    const intervalId = window.setInterval(checkPairing, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [deviceToken, pairingId, pairingStatus, queueAuthoritativeState, serverStatus.enabled]);

  const startPairing = useCallback(async () => {
    if (!sleeperUserId) throw new Error('Connect a Sleeper account before setting up Draft Sync.');
    const result = await startDraftSyncPairing({ sleeperUserId });
    const nextToken = result?.deviceToken ?? '';
    const nextRole = normalizeDeviceRole(result?.deviceRole) ?? DEVICE_ROLE_AUTHORITATIVE;
    if (nextToken) {
      tokenRef.current = nextToken;
      setDeviceToken(nextToken);
    }
    deviceRoleRef.current = nextRole;
    setDeviceRole(nextRole);
    authorityPublishPendingRef.current = true;
    setPairingCode(result?.pairingCode ?? '');
    setPairingId(result?.pairingId ?? '');
    pairingStatusRef.current = 'pending';
    setPairingStatus('pending');
    setSyncStatus('syncing');
    queueAuthoritativeState();
    return result;
  }, [queueAuthoritativeState, sleeperUserId]);

  const claimPairing = useCallback(async (code) => {
    if (!sleeperUserId) throw new Error('Connect a Sleeper account before pairing this device.');
    const result = await claimDraftSyncPairing({ sleeperUserId, pairingCode: code });
    const nextToken = result?.deviceToken ?? '';
    const nextRole = normalizeDeviceRole(result?.deviceRole) ?? DEVICE_ROLE_NON_AUTHORITATIVE;
    if (nextToken) {
      tokenRef.current = nextToken;
      setDeviceToken(nextToken);
    }
    deviceRoleRef.current = nextRole;
    setDeviceRole(nextRole);
    authorityPublishPendingRef.current = false;
    setPairingCode('');
    setPairingId('');
    pairingStatusRef.current = '';
    setPairingStatus('');
    waitForAuthoritativeState();
    return result;
  }, [sleeperUserId, waitForAuthoritativeState]);

  const revokeDevice = useCallback(async () => {
    const token = tokenRef.current;
    let revokeError = null;
    try {
      if (token) await revokeDraftSyncDevice({ token });
    } catch (error) {
      revokeError = error;
    } finally {
      clearTimers();
      setDeviceToken('');
      setPairingCode('');
      setPairingId('');
      pairingStatusRef.current = '';
      setPairingStatus('');
      deviceRoleRef.current = null;
      setDeviceRole(null);
      setConflict(null);
      initialSyncSetupRef.current = null;
      setInitialSyncSetup(null);
      pendingAuthorityAtRef.current = null;
      pendingStateRef.current = null;
      authorityPublishPendingRef.current = false;
      setSyncStatus('local-only');
    }
    if (revokeError) throw revokeError;
  }, [clearTimers]);

  const resolveConflict = useCallback(async (choice) => {
    const current = conflict;
    if (!current) return;
    if (choice === 'server') {
      applyRemoteState(current.remoteState, current.remoteRevision, current.remoteEtag);
      return;
    }
    revisionRef.current = current.remoteRevision;
    etagRef.current = current.remoteEtag;
    pendingStateRef.current = current.localState;
    setConflict(null);
    writeMeta(getScopeKey(scopeRef.current), { revision: revisionRef.current, dirty: true });
    await flushPendingState();
  }, [applyRemoteState, conflict, flushPendingState]);

  const statusLabel = useMemo(() => {
    if (serverStatus.loading) return 'Sync available';
    if (!serverStatus.enabled) return serverStatus.error ? 'Sync unavailable' : 'Local only';
    if (pairingCode) return 'Code ready';
    if (pairingStatus === 'claimed') return 'Paired';
    if (!deviceToken) return 'Not connected';
    if (syncStatus === 'waiting-for-primary') return 'Waiting for primary';
    if (syncStatus === 'offline') return 'Offline — saved locally';
    if (syncStatus === 'auth-required') return 'Pairing required';
    if (syncStatus === 'update-required') return 'Update required';
    if (syncStatus === 'conflict') return 'Conflict needs review';
    if (syncStatus === 'server-error') return 'Sync unavailable';
    if (syncStatus === 'syncing') return 'Syncing';
    return 'Synced';
  }, [deviceToken, pairingCode, pairingStatus, serverStatus, syncStatus]);

  const value = useMemo(() => ({
    serverStatus,
    enabled: serverStatus.enabled === true,
    deviceToken,
    pairingCode,
    pairingId,
    pairingStatus,
    deviceRole,
    syncStatus,
    statusLabel,
    scope,
    conflict,
    initialSyncSetup,
    refreshStatus,
    startPairing,
    claimPairing,
    revokeDevice,
    registerDraftScope,
    publishDraftState,
    resolveConflict,
  }), [
    claimPairing,
    conflict,
    deviceToken,
    deviceRole,
    pairingCode,
    pairingId,
    pairingStatus,
    publishDraftState,
    refreshStatus,
    registerDraftScope,
    resolveConflict,
    revokeDevice,
    scope,
    serverStatus,
    startPairing,
    statusLabel,
    syncStatus,
    initialSyncSetup,
  ]);

  return <DraftSyncContext.Provider value={value}>{children}</DraftSyncContext.Provider>;
}
