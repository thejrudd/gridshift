import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_DATA_DIR = '/data';
const DEFAULT_LOCAL_DATA_DIR = path.join(os.tmpdir(), 'gridshift-player-data');
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MIN_SEASON = 2000;
const DEFAULT_UPSTREAM_CONCURRENCY = 2;
const MAX_UPSTREAM_CONCURRENCY = 4;
const DEFAULT_UPSTREAM_SPACING_MS = 150;
const HOUR_MS = 60 * 60 * 1000;

function parsePositiveInteger(value, fallback, { max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export function getPlayerDataConfig({ env = process.env } = {}) {
  const production = String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const configuredDataDir = String(env.GRIDSHIFT_PLAYER_DATA_DIR ?? '').trim();

  return Object.freeze({
    enabled: String(env.GRIDSHIFT_PLAYER_DATA_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
    // Docker Compose mounts /data. Direct-host development needs a writable
    // default so the cache does not require root access.
    dataDir: configuredDataDir || (production ? DEFAULT_DATA_DIR : DEFAULT_LOCAL_DATA_DIR),
    maxBytes: parsePositiveInteger(env.GRIDSHIFT_PLAYER_DATA_MAX_BYTES, DEFAULT_MAX_BYTES),
    // Seasons before this fall through to the browser's direct ESPN path.
    minSeason: parsePositiveInteger(env.GRIDSHIFT_PLAYER_DATA_MIN_SEASON, DEFAULT_MIN_SEASON),
    liveTtlMs: HOUR_MS,
    careerTtlMs: 24 * HOUR_MS,
    emptyTtlMs: 5 * 60 * 1000,
    // ESPN answers 404 for a completed season the player has no stats in. That
    // answer is remembered long enough that the career repair's per-season
    // fan-out does not re-ask ESPN about every empty year on each refresh.
    missingTtlMs: 30 * 24 * HOUR_MS,
    failureTtlMs: 60 * 1000,
    upstream: Object.freeze({
      concurrency: parsePositiveInteger(
        env.GRIDSHIFT_PLAYER_DATA_UPSTREAM_CONCURRENCY,
        DEFAULT_UPSTREAM_CONCURRENCY,
        { max: MAX_UPSTREAM_CONCURRENCY },
      ),
      spacingMs: parsePositiveInteger(
        env.GRIDSHIFT_PLAYER_DATA_UPSTREAM_SPACING_MS,
        DEFAULT_UPSTREAM_SPACING_MS,
        { max: 10_000 },
      ),
      timeoutMs: 15_000,
      breakerFailureThreshold: 5,
      breakerBaseCooldownMs: 60 * 1000,
      breakerMaxCooldownMs: 15 * 60 * 1000,
    }),
  });
}

export const PLAYER_DATA_DEFAULTS = Object.freeze({
  dataDir: DEFAULT_DATA_DIR,
  maxBytes: DEFAULT_MAX_BYTES,
  minSeason: DEFAULT_MIN_SEASON,
  upstreamConcurrency: DEFAULT_UPSTREAM_CONCURRENCY,
  upstreamSpacingMs: DEFAULT_UPSTREAM_SPACING_MS,
});
