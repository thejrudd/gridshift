import express from 'express';
import process from 'node:process';
import { createBalldontlieGateway } from './balldontlieGateway.js';
import { createLiveRouter, getLiveConfigStatus } from './liveHandlers.js';
import { createStatisticsScoresRouter } from './statisticsScoresHandlers.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.GRIDSHIFT_API_PORT ?? 3001);
const host = process.env.HOST ?? process.env.GRIDSHIFT_API_HOST ?? '0.0.0.0';
const trustProxyHops = Math.max(0, Number.parseInt(process.env.GRIDSHIFT_TRUST_PROXY_HOPS ?? '0', 10) || 0);
const balldontlieGateway = createBalldontlieGateway();

app.set('trust proxy', trustProxyHops);
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    ok: true,
    live: getLiveConfigStatus(),
    balldontlie: balldontlieGateway.getStatus(),
  });
});

app.use('/api/live', createLiveRouter({ gateway: balldontlieGateway }));
app.use('/api/statistics/scores', createStatisticsScoresRouter({ gateway: balldontlieGateway }));

app.listen(port, host, () => {
  console.log(`GridShift API listening on ${host}:${port}`);
});
