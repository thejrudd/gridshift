// Live data source indirection.
//
// Fantasy Live reads through this module so the dev sandbox can serve a
// time-sliced replay of a completed week, or scope a request to the preseason,
// without the view knowing. In production, and whenever the sandbox flag is
// off, these are the real liveApi functions unchanged.
//
// The sandbox mode is switchable at runtime, so each call resolves its own
// source rather than binding one at module load.

import * as realLiveApi from './liveApi';
import { LIVE_SANDBOX_ENABLED, isPreseasonMode, isReplayMode, sandboxLiveSource } from '../dev/liveSandbox';

export const getLiveGames = (...args) => {
  if (!LIVE_SANDBOX_ENABLED) return realLiveApi.getLiveGames(...args);
  // Replay serves a slice of a completed week; preseason reads the real routes
  // but must be scoped, since preseason and regular-season weeks share numbers.
  if (isReplayMode()) return sandboxLiveSource.getLiveGames(...args);
  if (isPreseasonMode()) return sandboxLiveSource.getPreseasonLiveGames(...args);
  return realLiveApi.getLiveGames(...args);
};

export const getLivePlayerStatsForGames = (...args) => (
  isReplayMode()
    ? sandboxLiveSource.getLivePlayerStatsForGames(...args)
    : realLiveApi.getLivePlayerStatsForGames(...args)
);

export const getLiveGamePlays = (...args) => (
  isReplayMode()
    ? sandboxLiveSource.getLiveGamePlays(...args)
    : realLiveApi.getLiveGamePlays(...args)
);

// Session and status always go to the real server.
export const getLiveStatus = (...args) => realLiveApi.getLiveStatus(...args);
export const startLiveSession = (...args) => realLiveApi.startLiveSession(...args);
export const clearLiveSession = (...args) => realLiveApi.clearLiveSession(...args);
