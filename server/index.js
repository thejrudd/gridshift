import http from 'node:http';

const port = Number(process.env.PORT ?? process.env.GRIDSHIFT_API_PORT ?? 3001);
const host = process.env.HOST ?? process.env.GRIDSHIFT_API_HOST ?? '0.0.0.0';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getLiveConfigStatus() {
  const hasApiKey = hasValue(process.env.GRIDSHIFT_BDL_API_KEY);
  const hasAllowedLeagues = hasValue(process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS);
  const hasAccessCode = hasValue(process.env.GRIDSHIFT_LIVE_ACCESS_CODE);
  const hasCookieSecret = hasValue(process.env.GRIDSHIFT_LIVE_COOKIE_SECRET)
    || hasValue(process.env.GRIDSHIFT_SESSION_SECRET);
  return {
    enabled: hasApiKey && hasAllowedLeagues && hasCookieSecret,
    provider: 'balldontlie',
    tier: process.env.GRIDSHIFT_BDL_TIER || null,
    leagueScopeEnabled: hasAllowedLeagues,
    accessCodeRequired: hasAccessCode,
    cookieSigningReady: hasCookieSecret,
  };
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { ok: false, error: 'Not found.' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, live: getLiveConfigStatus() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/live/status') {
    sendJson(res, 200, { ok: true, live: getLiveConfigStatus() });
    return;
  }

  notFound(res);
});

server.listen(port, host, () => {
  console.log(`GridShift API listening on ${host}:${port}`);
});
