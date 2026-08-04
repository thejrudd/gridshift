import express from 'express';
import { createLiveRouter, getLiveConfigStatus } from './liveHandlers.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.GRIDSHIFT_API_PORT ?? 3001);
const host = process.env.HOST ?? process.env.GRIDSHIFT_API_HOST ?? '0.0.0.0';

app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true, live: getLiveConfigStatus() });
});

app.use('/api/live', createLiveRouter());

app.listen(port, host, () => {
  console.log(`GridShift API listening on ${host}:${port}`);
});
