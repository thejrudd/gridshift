// Optional GridShift fantasy platform API client.
//
// Enabled only when VITE_GRIDSHIFT_PLATFORM_URL is set at build/dev time; with
// it unset nothing here is ever called and the app behaves as before. The
// browser always calls same-origin paths (/api/auth, /api/me, /api/leagues):
// the Vite dev server proxies them to the configured URL, and a production host
// must do the same. Same-origin keeps the platform's HttpOnly session cookie
// first-party and lets the platform's Origin rule (APP_ORIGINS) list this app's
// origin like any other client. No platform credential is ever held in the
// browser; the session cookie is managed by the browser alone.
//
// Contract and setup: docs/League Provider Contract.md.

const PLATFORM_URL = String(import.meta.env?.VITE_GRIDSHIFT_PLATFORM_URL ?? '').trim();

export function isGridShiftPlatformConfigured() {
  return PLATFORM_URL.length > 0;
}

export class GridShiftPlatformError extends Error {
  constructor(message, { status = 0, code = 'unavailable' } = {}) {
    super(message);
    this.name = 'GridShiftPlatformError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  if (!isGridShiftPlatformConfigured()) {
    throw new GridShiftPlatformError('GridShift leagues are not enabled on this server.', { code: 'not_configured' });
  }
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new GridShiftPlatformError('The league server could not be reached.');
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload?.error?.message || 'The league server could not complete the request.';
    throw new GridShiftPlatformError(message, { status: response.status, code: payload?.error?.code ?? 'request_failed' });
  }
  return payload;
}

const leaguePath = (leagueId, suffix = '') => `/api/leagues/${encodeURIComponent(leagueId)}${suffix}`;

/** The signed-in platform session, or null. */
export async function getGridShiftSession() {
  const session = await request('/api/auth/get-session');
  return session?.user ? session : null;
}

/** Emails a sign-in link (the platform's email-link flow). In development the API prints it. */
export function requestGridShiftSignInLink(email, callbackURL) {
  return request('/api/auth/sign-in/magic-link', { method: 'POST', body: { email, callbackURL } });
}

export function signOutGridShift() {
  return request('/api/auth/sign-out', { method: 'POST', body: {} });
}

export async function listGridShiftLeagues() {
  return (await request('/api/leagues'))?.leagues ?? [];
}

export async function listGridShiftInvites() {
  return (await request('/api/me/invites'))?.invites ?? [];
}

export const getGridShiftLeague = (leagueId) => request(leaguePath(leagueId));
export const getGridShiftTeams = (leagueId) => request(leaguePath(leagueId, '/teams'));
export const getGridShiftStandings = (leagueId) => request(leaguePath(leagueId, '/standings'));
export const getGridShiftWeeks = (leagueId) => request(leaguePath(leagueId, '/weeks'));
export const getGridShiftMatchups = (leagueId) => request(leaguePath(leagueId, '/matchups'));
