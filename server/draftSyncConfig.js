import process from 'node:process';

const DEFAULT_DATA_DIR = '/data';
const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1_024;
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parsePositiveInteger(value, fallback, { max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export function getDraftSyncConfig({ env = process.env } = {}) {
  const enabled = String(env.GRIDSHIFT_DRAFT_SYNC_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  const production = String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const sessionSecret = hasValue(env.GRIDSHIFT_SESSION_SECRET)
    ? String(env.GRIDSHIFT_SESSION_SECRET).trim()
    : (production ? null : 'gridshift-local-development-draft-sync-secret');

  return Object.freeze({
    enabled,
    ready: enabled && Boolean(sessionSecret),
    production,
    sessionSecret,
    dataDir: String(env.GRIDSHIFT_DRAFT_SYNC_DATA_DIR ?? DEFAULT_DATA_DIR).trim() || DEFAULT_DATA_DIR,
    pairingTtlMs: parsePositiveInteger(
      env.GRIDSHIFT_DRAFT_SYNC_PAIRING_TTL_MS,
      DEFAULT_PAIRING_TTL_MS,
      { max: 7 * 24 * 60 * 60 * 1_000 },
    ),
    maxPayloadBytes: parsePositiveInteger(
      env.GRIDSHIFT_DRAFT_SYNC_MAX_PAYLOAD_BYTES,
      DEFAULT_MAX_PAYLOAD_BYTES,
      { max: MAX_PAYLOAD_BYTES },
    ),
  });
}

export const DRAFT_SYNC_DEFAULTS = Object.freeze({
  dataDir: DEFAULT_DATA_DIR,
  pairingTtlMs: DEFAULT_PAIRING_TTL_MS,
  maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
});
