import crypto from 'node:crypto';

// Excludes 0, 1, I, O, and lower-case variants so a code can be read aloud
// or copied from a phone without avoidable ambiguity.
export const DRAFT_SYNC_PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DRAFT_SYNC_DEVICE_TOKEN_BYTES = 32;
export const DRAFT_SYNC_PAIRING_ID_BYTES = 18;
export const DRAFT_SYNC_PAIRING_CODE_LENGTH = 8;

function getKey(secret) {
  const value = String(secret ?? '').trim();
  if (!value) throw new Error('GRIDSHIFT_SESSION_SECRET is required for Draft Sync.');
  return crypto.createHash('sha256').update(value).digest();
}

export function generateDeviceToken(randomBytes = crypto.randomBytes) {
  return randomBytes(DRAFT_SYNC_DEVICE_TOKEN_BYTES).toString('base64url');
}

export function generatePairingId(randomBytes = crypto.randomBytes) {
  return randomBytes(DRAFT_SYNC_PAIRING_ID_BYTES).toString('base64url');
}

export function hashDraftSyncToken(token, secret) {
  return crypto.createHmac('sha256', getKey(secret)).update(String(token ?? '')).digest('hex');
}

export function generatePairingCode(randomInt = crypto.randomInt) {
  let code = '';
  for (let index = 0; index < DRAFT_SYNC_PAIRING_CODE_LENGTH; index += 1) {
    code += DRAFT_SYNC_PAIRING_ALPHABET[randomInt(DRAFT_SYNC_PAIRING_ALPHABET.length)];
  }
  return code;
}

export function normalizePairingCode(value) {
  const code = String(value ?? '').replace(/[-\s]/g, '').toUpperCase();
  if (code.length !== DRAFT_SYNC_PAIRING_CODE_LENGTH || [...code].some((character) => !DRAFT_SYNC_PAIRING_ALPHABET.includes(character))) {
    return null;
  }
  return code;
}

export function formatPairingCode(code) {
  const normalized = normalizePairingCode(code);
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : null;
}

export function hashPairingCode(code, secret) {
  const normalized = normalizePairingCode(code);
  if (!normalized) return null;
  return hashDraftSyncToken(normalized, secret);
}

export function buildDraftSyncEtag(revision) {
  return `"${String(Number(revision) || 0)}"`;
}

export function parseDraftSyncRevision(value) {
  const match = String(value ?? '').trim().match(/^W?\s*"?(\d+)"?$/i);
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}
