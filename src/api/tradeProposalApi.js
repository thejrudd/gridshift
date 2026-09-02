const BASE_PATH = '/api/trade-proposals';

function normalizeShareOrigin(payload) {
  if (!payload?.shareUrl || typeof window === 'undefined') return payload;
  try {
    const serverUrl = new URL(payload.shareUrl, window.location.origin);
    if (serverUrl.origin === window.location.origin) return payload;
    return {
      ...payload,
      shareUrl: `${window.location.origin}${serverUrl.pathname}${serverUrl.search}${serverUrl.hash}`,
    };
  } catch {
    return payload;
  }
}

async function request(path, { method = 'GET', token = null, body, signal } = {}) {
  const response = await fetch(`${BASE_PATH}${path}`, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* preserve the HTTP error below */ }
  if (!response.ok) {
    const error = new Error(payload?.error ?? `Trade proposal request failed (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return normalizeShareOrigin(payload);
}

export function createTradeSession(body, options) {
  return request('/session', { ...options, method: 'POST', body });
}

export function createTradeProposal(body, options) {
  return request('/proposals', { ...options, method: 'POST', body });
}

export function getTradeInbox(options) {
  return request('/inbox', options);
}

export function getTradeProposal(proposalId, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}`, options);
}

export function getSharedTradeProposal(shareToken, options) {
  return request(`/share/${encodeURIComponent(shareToken)}`, options);
}

export function claimSharedTradeProposal(shareToken, body, options) {
  return request(`/share/${encodeURIComponent(shareToken)}/claim`, { ...options, method: 'POST', body });
}

export function counterTradeProposal(proposalId, body, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}/counter`, { ...options, method: 'POST', body });
}

export function declineTradeProposal(proposalId, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}/decline`, { ...options, method: 'POST', body: {} });
}

export function withdrawTradeProposal(proposalId, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}/withdraw`, { ...options, method: 'POST', body: {} });
}

export function acceptTradeProposal(proposalId, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}/accept`, { ...options, method: 'POST', body: {} });
}

export function markTradeProposalDone(proposalId, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}/completion`, { ...options, method: 'POST', body: { outcome: 'completed' } });
}

export function reconcileTradeProposal(proposalId, options) {
  return request(`/proposals/${encodeURIComponent(proposalId)}/reconcile`, { ...options, method: 'POST', body: {} });
}

export function markTradeEventRead(eventId, options) {
  return request(`/events/${encodeURIComponent(eventId)}/read`, { ...options, method: 'POST', body: {} });
}
