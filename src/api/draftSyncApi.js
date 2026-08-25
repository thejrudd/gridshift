const BASE_PATH = '/api/draft-sync';

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Draft Sync request failed: ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    error.etag = response.headers.get('ETag') || null;
    throw error;
  }
  return payload;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getDraftSyncStatus() {
  const response = await fetch(`${BASE_PATH}/status`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return readResponse(response);
}

export async function startDraftSyncPairing({ sleeperUserId }) {
  const response = await fetch(`${BASE_PATH}/pairing/start`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sleeperUserId }),
  });
  return readResponse(response);
}

export async function claimDraftSyncPairing({ sleeperUserId, pairingCode }) {
  const response = await fetch(`${BASE_PATH}/pairing/claim`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sleeperUserId, pairingCode }),
  });
  return readResponse(response);
}

export async function getDraftSyncPairingStatus({ token, pairingId } = {}) {
  const params = new URLSearchParams({ pairingId: String(pairingId ?? '') });
  const response = await fetch(`${BASE_PATH}/pairing/status?${params.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...authHeaders(token) },
  });
  return readResponse(response);
}

export async function getDraftSyncDevice({ token } = {}) {
  const response = await fetch(`${BASE_PATH}/device`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...authHeaders(token) },
  });
  return readResponse(response);
}

export async function getDraftSyncState({ token, scope, etag = null } = {}) {
  const params = new URLSearchParams({
    sleeperUserId: String(scope?.sleeperUserId ?? ''),
    leagueId: String(scope?.leagueId ?? ''),
    season: String(scope?.season ?? ''),
    draftId: String(scope?.draftId ?? ''),
  });
  const headers = { Accept: 'application/json', ...authHeaders(token) };
  if (etag) headers['If-None-Match'] = etag;
  const response = await fetch(`${BASE_PATH}/state?${params.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
  });
  if (response.status === 304) return { notModified: true, etag };
  if (response.status === 404) return { missing: true };
  const payload = await readResponse(response);
  return {
    ...payload,
    missing: payload?.state == null,
    etag: response.headers.get('ETag') || payload?.etag || null,
  };
}

export async function putDraftSyncState({ token, scope, state, expectedRevision = 0, initialChoiceAt = null } = {}) {
  const response = await fetch(`${BASE_PATH}/state`, {
    method: 'PUT',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'If-Match': `"${Number(expectedRevision)}"`,
      ...authHeaders(token),
    },
    body: JSON.stringify({
      ...scope,
      expectedRevision,
      ...(initialChoiceAt == null ? {} : { initialChoiceAt }),
      state,
    }),
  });
  const payload = await readResponse(response);
  return {
    ...payload,
    etag: response.headers.get('ETag') || payload?.etag || null,
  };
}

export async function revokeDraftSyncDevice({ token } = {}) {
  const response = await fetch(`${BASE_PATH}/revoke-device`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...authHeaders(token) },
  });
  return readResponse(response);
}
