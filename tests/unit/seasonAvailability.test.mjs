import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('../../src/utils/seasonAvailability.js', import.meta.url), 'utf8');
const isolatedSource = source
  .replace("import { AVAILABLE_SLEEPER_SEASONS, useFantasyLeague } from '../context/SleeperContext';", 'const AVAILABLE_SLEEPER_SEASONS = [2026];')
  .replace(/export /g, '');
const {
  NFL_DRAFT_END_DATES,
  getFantasyRankingsDataMode,
  getSeasonHint,
  isAfterNflDraft,
  isTradeAvailableForSeason,
  isNflRegularSeasonStarted,
} = new Function(`${isolatedSource}\nreturn { NFL_DRAFT_END_DATES, getFantasyRankingsDataMode, getSeasonHint, isAfterNflDraft, isTradeAvailableForSeason, isNflRegularSeasonStarted };`)();

describe('season availability', () => {
  it('uses an explicit NFL Draft end date before preseason ADP becomes eligible', () => {
    assert.equal(NFL_DRAFT_END_DATES[2026], '2026-04-25T23:59:59.999-04:00');
    assert.equal(isAfterNflDraft(2026, new Date('2026-04-25T23:59:59.999-04:00')), false);
    assert.equal(isAfterNflDraft(2026, new Date('2026-04-26T00:00:00-04:00')), true);
    assert.equal(isAfterNflDraft(2027, new Date('2027-05-01T12:00:00-04:00')), false);
  });

  it('selects ADP only for the supported current-season preseason window', () => {
    assert.equal(getFantasyRankingsDataMode(2026, new Date('2026-04-25T23:59:59-04:00')), 'unavailable');
    assert.equal(getFantasyRankingsDataMode(2026, new Date('2026-04-26T12:00:00-04:00')), 'adp');
    assert.equal(getFantasyRankingsDataMode(2026, new Date('2026-09-09T12:00:00-04:00')), 'adp');
  });

  it('stays scoring-led at and after the regular-season start, regardless of stats readiness', () => {
    const regularSeasonStart = new Date('2026-09-10T00:00:00.000Z');
    assert.equal(isNflRegularSeasonStarted(2026, regularSeasonStart), true);
    assert.equal(getFantasyRankingsDataMode(2026, regularSeasonStart), 'scoring');
    assert.equal(getFantasyRankingsDataMode(2026, new Date('2026-09-14T12:00:00.000Z')), 'scoring');
  });

  it('keeps past seasons scoring-led and unsupported future seasons unavailable', () => {
    const currentPreseasonDate = new Date('2026-08-21T12:00:00-04:00');
    assert.equal(getFantasyRankingsDataMode(2025, currentPreseasonDate), 'scoring');
    assert.equal(getFantasyRankingsDataMode(2027, currentPreseasonDate), 'unavailable');
  });

  it('allows Trade only for the selected current league season', () => {
    assert.equal(isTradeAvailableForSeason('2026', '2026'), true);
    assert.equal(isTradeAvailableForSeason(2026, '2026'), true);
    assert.equal(isTradeAvailableForSeason('2025', '2026'), false);
    assert.equal(isTradeAvailableForSeason(null, '2026'), true);
  });

  it('resolves current-only hints against the linked league season', () => {
    assert.deepEqual(
      getSeasonHint({
        capability: 'current-only',
        feature: 'Trade',
        season: '2025',
        currentSeason: '2026',
        seasonOptions: ['2026', '2025'],
      }),
      {
        kind: 'current-only',
        targetSeason: '2026',
        message: "Trade is only available for the current 2026 league season. You're viewing 2025.",
      },
    );
  });
});
