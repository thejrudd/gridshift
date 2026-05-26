import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESPN_SESSION_COOKIE,
  buildSetCookieHeader,
  createEspnSessionPayload,
  decryptEspnSession,
  encryptEspnSession,
  parseCookies,
} from '../../server/sessionCrypto.js';

describe('ESPN session cookie crypto', () => {
  it('encrypts ESPN session values without exposing them in the cookie value', () => {
    const secret = 'test-secret-that-is-long-enough';
    const input = {
      SWID: '{12345678-1234-1234-1234-123456789ABC}',
      espn_s2: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    };
    const payload = createEspnSessionPayload(input, Date.UTC(2025, 0, 1));
    const encrypted = encryptEspnSession(payload, secret);

    assert.equal(encrypted.includes(input.SWID), false);
    assert.equal(encrypted.includes(input.espn_s2), false);
    assert.deepEqual(decryptEspnSession(encrypted, secret, { now: Date.UTC(2025, 0, 2) }), payload);
  });

  it('sets an HttpOnly cookie and supports clearing it', () => {
    const header = buildSetCookieHeader('encrypted-value');
    assert.match(header, new RegExp(`^${ESPN_SESSION_COOKIE}=`));
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);

    const cookies = parseCookies(`${ESPN_SESSION_COOKIE}=encrypted-value; theme=dark`);
    assert.equal(cookies[ESPN_SESSION_COOKIE], 'encrypted-value');

    const clearHeader = buildSetCookieHeader('', { clear: true });
    assert.match(clearHeader, /Max-Age=0/);
  });

  it('rejects expired encrypted sessions', () => {
    const secret = 'test-secret-that-is-long-enough';
    const payload = createEspnSessionPayload({
      SWID: '{12345678-1234-1234-1234-123456789ABC}',
      espn_s2: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    }, Date.UTC(2025, 0, 1));
    const encrypted = encryptEspnSession(payload, secret);

    assert.throws(() => decryptEspnSession(encrypted, secret, {
      now: Date.UTC(2025, 0, 10),
      maxAgeSeconds: 60,
    }), /expired/);
  });
});
