import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getLiveConfigurationMessage,
  resolveFantasyLiveAvailability,
} from '../../src/utils/fantasyLiveAvailability.js';

describe('Fantasy Live availability', () => {
  it('uses Sleeper NFL state for the active regular-season week', () => {
    assert.deepEqual(resolveFantasyLiveAvailability({
      nflState: { season: '2026', season_type: 'regular', week: 8, leg: 7 },
      leagueSeason: '2026',
    }), {
      active: true,
      week: 7,
      reason: null,
      message: null,
    });
  });

  it('does not carry a stale league week into the preseason', () => {
    const availability = resolveFantasyLiveAvailability({
      nflState: { season: '2026', season_type: 'pre', week: 1, leg: 0 },
      leagueSeason: '2026',
    });

    assert.equal(availability.active, false);
    assert.equal(availability.week, null);
    assert.equal(availability.reason, 'preseason');
    assert.match(availability.message, /There is no fantasy matchup this week/);
  });

  it('does not present a historical league as the active fantasy matchup', () => {
    const availability = resolveFantasyLiveAvailability({
      nflState: { season: '2026', season_type: 'regular', week: 4, leg: 4 },
      leagueSeason: '2025',
    });

    assert.equal(availability.active, false);
    assert.equal(availability.reason, 'season-mismatch');
    assert.match(availability.message, /2025 league/);
    assert.match(availability.message, /active 2026 season/);
  });

  it('names a missing league allowlist without claiming the API key is absent', () => {
    assert.equal(getLiveConfigurationMessage({
      enabled: false,
      apiKeyReady: true,
      leagueScopeEnabled: false,
      cookieSigningReady: true,
    }), 'Live scoring needs an allowed Sleeper league ID.');
  });
});
