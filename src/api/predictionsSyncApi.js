const BASE_PATH = '/api/predictions-sync';

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Predictions Sync request failed: ${response.status}`);
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

export async function getPredictionsSyncState({ token, sleeperUserId, season, etag = null } = {}) {
  const params = new URLSearchParams({
    sleeperUserId: String(sleeperUserId ?? ''),
    season: String(season ?? ''),
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
  return { ...payload, missing: payload?.state == null, etag: response.headers.get('ETag') || payload?.etag || null };
}

export async function putPredictionsSyncState({ token, sleeperUserId, season, state, expectedRevision = 0 } = {}) {
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
    body: JSON.stringify({ sleeperUserId, season: String(season ?? ''), expectedRevision, state }),
  });
  const payload = await readResponse(response);
  return { ...payload, etag: response.headers.get('ETag') || payload?.etag || null };
}
