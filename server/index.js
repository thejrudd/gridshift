import express from 'express';
import { createEspnRouter } from './espnHandlers.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.ESPN_API_PORT ?? 3001);
const host = process.env.HOST ?? process.env.ESPN_API_HOST ?? '0.0.0.0';

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/espn', createEspnRouter());

app.listen(port, host, () => {
  console.log(`GridShift ESPN API listening on ${host}:${port}`);
});
