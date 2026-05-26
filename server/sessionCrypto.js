import crypto from 'node:crypto';

export const ESPN_SESSION_COOKIE = 'gridshift_espn_session';
export const ESPN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const ESPN_S2_MIN_LENGTH = 40;
const GUID_RE = /^[{]?[0-9a-fA-F-]{32,36}[}]?$/;

export function parseCookies(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return cookies;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (key) cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function normalizeSwid(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('SWID is required.');
  const unquoted = raw.replace(/^"|"$/g, '');
  if (!GUID_RE.test(unquoted)) {
    throw new Error('SWID must look like an ESPN session GUID.');
  }
  const withoutBraces = unquoted.replace(/^\{|\}$/g, '');
  return `{${withoutBraces}}`;
}

export function validateEspnSessionInput(input = {}) {
  const swid = normalizeSwid(input.SWID ?? input.swid);
  const espnS2 = String(input.espn_s2 ?? input.espnS2 ?? '').trim();
  if (espnS2.length < ESPN_S2_MIN_LENGTH || /\s/.test(espnS2)) {
    throw new Error('espn_s2 must be the full ESPN session value.');
  }
  return { swid, espnS2 };
}

export function memberIdFromSwid(swid) {
  return normalizeSwid(swid).replace(/^\{|\}$/g, '').toUpperCase();
}

function getEncryptionKey(secret) {
  const material = String(secret ?? '').trim();
  if (!material) {
    throw new Error('GRIDSHIFT_SESSION_SECRET is required for ESPN sessions.');
  }
  return crypto.createHash('sha256').update(material).digest();
}

export function createEspnSessionPayload(input, now = Date.now()) {
  const { swid, espnS2 } = validateEspnSessionInput(input);
  return {
    swid,
    espnS2,
    memberId: memberIdFromSwid(swid),
    createdAt: new Date(now).toISOString(),
  };
}

export function encryptEspnSession(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    v: 1,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    data: encrypted.toString('base64url'),
  })).toString('base64url');
}

export function decryptEspnSession(cookieValue, secret, { now = Date.now(), maxAgeSeconds = ESPN_SESSION_TTL_SECONDS } = {}) {
  if (!cookieValue) return null;
  const packed = JSON.parse(Buffer.from(cookieValue, 'base64url').toString('utf8'));
  if (packed?.v !== 1 || !packed.iv || !packed.tag || !packed.data) {
    throw new Error('Invalid ESPN session cookie.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(secret),
    Buffer.from(packed.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(packed.tag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(packed.data, 'base64url')),
    decipher.final(),
  ]);
  const payload = JSON.parse(decrypted.toString('utf8'));

  const createdAt = Date.parse(payload.createdAt);
  if (!Number.isFinite(createdAt) || now - createdAt > maxAgeSeconds * 1000) {
    throw new Error('ESPN session expired.');
  }

  return payload;
}

export function getSessionFromRequest(req, secret) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  return decryptEspnSession(cookies[ESPN_SESSION_COOKIE], secret);
}

export function buildSetCookieHeader(value, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' && process.env.GRIDSHIFT_COOKIE_SECURE !== 'false';
  const maxAge = clear ? 0 : ESPN_SESSION_TTL_SECONDS;
  const encoded = clear ? '' : encodeURIComponent(value);
  return [
    `${ESPN_SESSION_COOKIE}=${encoded}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}
