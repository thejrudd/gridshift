import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_DATA_DIR = '/data';
const DEFAULT_LOCAL_DATA_DIR = path.join(os.tmpdir(), 'gridshift-trade-proposals');
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
const MAX_TOMBSTONE_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_SESSION_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_EXPIRY_MS = 7 * 24 * 60 * 60 * 1_000;

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parsePositiveInteger(value, fallback, { max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export function getTradeProposalConfig({ env = process.env } = {}) {
  const enabled = String(env.GRIDSHIFT_TRADE_PROPOSALS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  const production = String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const sessionSecret = hasValue(env.GRIDSHIFT_SESSION_SECRET)
    ? String(env.GRIDSHIFT_SESSION_SECRET).trim()
    : (production ? null : 'gridshift-local-development-trade-proposal-secret');
  const configuredDataDir = String(env.GRIDSHIFT_TRADE_PROPOSALS_DATA_DIR ?? '').trim();

  return Object.freeze({
    enabled,
    ready: enabled && Boolean(sessionSecret),
    production,
    sessionSecret,
    // Docker Compose mounts /data. Direct-host development needs a writable
    // default so enabling Trade proposals does not require root access.
    dataDir: configuredDataDir || (production ? DEFAULT_DATA_DIR : DEFAULT_LOCAL_DATA_DIR),
    maxPayloadBytes: parsePositiveInteger(
      env.GRIDSHIFT_TRADE_PROPOSALS_MAX_PAYLOAD_BYTES,
      DEFAULT_MAX_PAYLOAD_BYTES,
      { max: MAX_PAYLOAD_BYTES },
    ),
    maxExpiryMs: MAX_EXPIRY_MS,
    tombstoneRetentionMs: parsePositiveInteger(
      env.GRIDSHIFT_TRADE_PROPOSALS_TOMBSTONE_RETENTION_MS,
      DEFAULT_TOMBSTONE_RETENTION_MS,
      { max: MAX_TOMBSTONE_RETENTION_MS },
    ),
    sessionRetentionMs: parsePositiveInteger(
      env.GRIDSHIFT_TRADE_PROPOSALS_SESSION_RETENTION_MS,
      DEFAULT_SESSION_RETENTION_MS,
      { max: MAX_SESSION_RETENTION_MS },
    ),
  });
}

export const TRADE_PROPOSAL_DEFAULTS = Object.freeze({
  dataDir: DEFAULT_DATA_DIR,
  maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
  maxExpiryMs: MAX_EXPIRY_MS,
  tombstoneRetentionMs: DEFAULT_TOMBSTONE_RETENTION_MS,
  sessionRetentionMs: DEFAULT_SESSION_RETENTION_MS,
});
