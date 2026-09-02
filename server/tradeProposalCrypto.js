import crypto from 'node:crypto';

export const TRADE_PROPOSAL_TOKEN_BYTES = 32;
export const TRADE_PROPOSAL_ID_BYTES = 18;

function getKey(secret) {
  const value = String(secret ?? '').trim();
  if (!value) throw new Error('GRIDSHIFT_SESSION_SECRET is required for Trade proposals.');
  return crypto.createHash('sha256').update(value).digest();
}

export function generateTradeProposalId(randomBytes = crypto.randomBytes) {
  return randomBytes(TRADE_PROPOSAL_ID_BYTES).toString('base64url');
}

export function generateTradeProposalToken(randomBytes = crypto.randomBytes) {
  return randomBytes(TRADE_PROPOSAL_TOKEN_BYTES).toString('base64url');
}

export function hashTradeProposalToken(token, secret) {
  return crypto.createHmac('sha256', getKey(secret)).update(String(token ?? '')).digest('hex');
}

export function buildTradeProposalFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
