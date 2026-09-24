import express from 'express';
import process from 'node:process';
import { createBalldontlieGateway } from './balldontlieGateway.js';
import { createFantasyAdpRouter } from './fantasyAdpHandlers.js';
import { createFantasyProjectionsRouter } from './fantasyProjectionHandlers.js';
import { createPlayerDesignationsRouter } from './playerDesignationHandlers.js';
import { getPlayerDataConfig } from './playerDataConfig.js';
import { createPlayerDataRouter, createPlayerDataService } from './playerDataHandlers.js';
import { createPlayerDataStore } from './playerDataStore.js';
import { createUpstreamClient } from './playerDataUpstream.js';
import { createLiveGameSnapshotStore } from './liveGameSnapshots.js';
import { createLiveRouter, getLiveConfigStatus } from './liveHandlers.js';
import { createStatisticsScoresRouter } from './statisticsScoresHandlers.js';
import { createNflTeamStatsRouter } from './nflTeamStatsHandlers.js';
import { createStoryStatsRouter, createStoryStatsService } from './storyStatsHandlers.js';
import { createStoryStatsScheduler } from './storyStatsScheduler.js';
import { createDraftSyncRouter } from './draftSyncHandlers.js';
import { createPredictionsSyncRouter } from './predictionsSyncHandlers.js';
import { createTradeProposalRouter, createTradeShareApiRouter, createTradeShareRouter } from './tradeProposalHandlers.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.GRIDSHIFT_API_PORT ?? 3001);
const host = process.env.HOST ?? process.env.GRIDSHIFT_API_HOST ?? '0.0.0.0';
const trustProxyHops = Math.max(0, Number.parseInt(process.env.GRIDSHIFT_TRUST_PROXY_HOPS ?? '0', 10) || 0);
const balldontlieGateway = createBalldontlieGateway();
const liveGameSnapshotStore = createLiveGameSnapshotStore({ gateway: balldontlieGateway });
const storyStatsService = createStoryStatsService({
  storyStatsGateway: balldontlieGateway,
  dailyLimit: Number(process.env.GRIDSHIFT_STORY_STATS_DAILY_LIMIT ?? 10),
});
const storyStatsScheduler = createStoryStatsScheduler({
  gateway: balldontlieGateway,
  service: storyStatsService,
});

// ESPN player payload cache. A store that cannot open (unwritable volume) must
// not take the API down; the browser falls back to ESPN directly without it.
const playerDataConfig = getPlayerDataConfig();
let playerDataService = null;
if (playerDataConfig.enabled) {
  try {
    playerDataService = createPlayerDataService({
      config: playerDataConfig,
      store: createPlayerDataStore({ config: playerDataConfig }),
      upstream: createUpstreamClient(playerDataConfig.upstream),
    });
  } catch (error) {
    console.error('Player data cache disabled:', error?.message ?? error);
  }
}

app.set('trust proxy', trustProxyHops);
// Draft Sync owns its parser so its configured payload limit produces a
// consistent 413 response. It is mounted before the app-wide parser below.
app.use('/api/draft-sync', createDraftSyncRouter());
app.use('/api/predictions-sync', createPredictionsSyncRouter());
app.use('/api/trade-proposals', createTradeProposalRouter());
app.use('/api/trade-proposals/share', createTradeShareApiRouter());
app.use('/trade/share', createTradeShareRouter());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    ok: true,
    live: getLiveConfigStatus(),
    balldontlie: balldontlieGateway.getStatus(),
    storyStatsAutomation: storyStatsScheduler.getStatus(),
    playerData: playerDataService ? playerDataService.getStatus() : { enabled: false },
  });
});

app.use('/api/live', createLiveRouter({
  gateway: balldontlieGateway,
  snapshotStore: liveGameSnapshotStore,
}));
// Mounted before the Scores router so `/team-stats` never reaches its handlers.
app.use('/api/statistics/scores/team-stats', createNflTeamStatsRouter());
app.use('/api/statistics/scores', createStatisticsScoresRouter({
  gateway: balldontlieGateway,
  snapshotStore: liveGameSnapshotStore,
}));
app.use('/api/statistics/scores', createStoryStatsRouter({
  storyStatsGateway: balldontlieGateway,
  service: storyStatsService,
  allowUpstream: String(process.env.NODE_ENV ?? '').trim().toLowerCase() !== 'production',
}));
app.use('/api/fantasy', createFantasyAdpRouter({ gateway: balldontlieGateway }));
app.use('/api/fantasy', createFantasyProjectionsRouter({ gateway: balldontlieGateway }));
app.use('/api/fantasy', createPlayerDesignationsRouter({ gateway: balldontlieGateway }));
if (playerDataService) {
  app.use('/api/players', createPlayerDataRouter({ service: playerDataService, config: playerDataConfig }));
}

app.listen(port, host, () => {
  console.log(`GridShift API listening on ${host}:${port}`);
  storyStatsScheduler.start();
});
