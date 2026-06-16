import express from 'express';
import { createEspnRouter } from './espnHandlers.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.GRIDSHIFT_API_PORT ?? process.env.ESPN_API_PORT ?? 3001);
const host = process.env.HOST ?? process.env.GRIDSHIFT_API_HOST ?? process.env.ESPN_API_HOST ?? '0.0.0.0';

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

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true, live: getLiveConfigStatus() });
});

app.get('/api/live/status', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true, live: getLiveConfigStatus() });
});

app.use('/api/espn', createEspnRouter());

app.listen(port, host, () => {
  console.log(`GridShift API listening on ${host}:${port}`);
});
