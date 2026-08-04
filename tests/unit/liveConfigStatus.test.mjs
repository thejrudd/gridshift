import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getLiveConfigStatus } from '../../server/liveHandlers.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalMockPlays = process.env.GRIDSHIFT_LIVE_MOCK_PLAYS;

afterEach(() => {
  if (originalNodeEnv == null) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalMockPlays == null) delete process.env.GRIDSHIFT_LIVE_MOCK_PLAYS;
  else process.env.GRIDSHIFT_LIVE_MOCK_PLAYS = originalMockPlays;
});

describe('Fantasy Live placeholder-data boundary', () => {
  it('allows mock plays in a local test environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.GRIDSHIFT_LIVE_MOCK_PLAYS = 'true';
    assert.equal(getLiveConfigStatus().mockPlaysEnabled, true);
  });

  it('never enables mock plays in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.GRIDSHIFT_LIVE_MOCK_PLAYS = 'true';
    assert.equal(getLiveConfigStatus().mockPlaysEnabled, false);
  });
});
