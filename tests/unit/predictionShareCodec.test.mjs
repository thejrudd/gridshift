import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PREDICTION_SHARE_MAX_TOKEN_LENGTH,
  PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS,
  PREDICTION_SHARE_TEAM_IDS,
  PredictionShareCodecError,
  createPredictionShareToken,
  createPredictionShareUrl,
  decodePredictionShareToken,
  decodePredictionShareUrl,
  getCreatablePredictionShareSeasons,
  getCurrentPredictionShareOrigin,
  getCurrentPredictionShareSeason,
} from '../../src/utils/predictionShareCodec.js';

function buildRecords() {
  return Object.fromEntries(PREDICTION_SHARE_TEAM_IDS.map((teamId, index) => {
    const wins = 6 + (index % 7);
    return [teamId, {
      wins,
      losses: 17 - wins,
      ties: 0,
      divisionWins: Math.min(4, wins),
    }];
  }));
}

function buildPlayoffPicks() {
  const winners = [
    'BUF', 'BAL', 'HOU', 'KC', 'BUF', 'KC',
    'PHI', 'DET', 'TB', 'SF', 'PHI', 'SF', 'SF',
  ];
  return Object.fromEntries(PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS.map((matchupId, index) => [
    matchupId,
    winners[index],
  ]));
}

function buildGamePicks() {
  return Object.fromEntries(Array.from({ length: 272 }, (_, index) => [
    `2026-W${String(Math.floor(index / 16) + 1).padStart(2, '0')}-G${String(index + 1).padStart(3, '0')}`,
    index % 41 === 0 ? 'T' : PREDICTION_SHARE_TEAM_IDS[index % PREDICTION_SHARE_TEAM_IDS.length],
  ]));
}

function buildSnapshot(overrides = {}) {
  const mode = overrides.mode ?? 'record';
  return {
    schema: 'gridshift.prediction-snapshot',
    version: 1,
    season: 2026,
    pickWeek: 7,
    createdAt: '2026-10-20T14:30:00.000Z',
    mode,
    scheduleFingerprint: '2026.sha256-a1b2c3d4',
    manager: {
      userId: '123456789012345678',
      username: 'gridshift_manager',
      displayName: 'GridShift Manager',
    },
    records: buildRecords(),
    gamePicks: mode === 'advanced' ? buildGamePicks() : {},
    playoffPicks: buildPlayoffPicks(),
    ...overrides,
  };
}

function expectCodecError(error, code) {
  assert.ok(error instanceof PredictionShareCodecError);
  assert.equal(error.code, code);
  return true;
}

describe('prediction share season policy', () => {
  it('uses the March NFL league-year boundary', () => {
    assert.equal(getCurrentPredictionShareSeason(new Date('2026-02-28T12:00:00Z')), 2025);
    assert.equal(getCurrentPredictionShareSeason(new Date('2026-03-01T12:00:00Z')), 2026);
    assert.deepEqual(
      getCreatablePredictionShareSeasons({ currentSeason: 2026 }),
      [2026, 2027],
    );
  });

  it('allows current/upcoming creation and rejects past or more distant seasons', async () => {
    await createPredictionShareToken(buildSnapshot(), { currentSeason: 2026 });
    await createPredictionShareToken(buildSnapshot({ season: 2027 }), { currentSeason: 2026 });

    await assert.rejects(
      createPredictionShareToken(buildSnapshot({ season: 2025 }), { currentSeason: 2026 }),
      (error) => expectCodecError(error, 'season_not_creatable'),
    );
    await assert.rejects(
      createPredictionShareToken(buildSnapshot({ season: 2028 }), { currentSeason: 2026 }),
      (error) => expectCodecError(error, 'season_not_creatable'),
    );
  });
});

describe('prediction share token codec', () => {
  it('round-trips a complete record snapshot and optional presentation choices', async () => {
    const snapshot = buildSnapshot();
    const presentation = {
      titleId: 'whole-board',
      themeId: 'broadcast-dark',
      cardId: 'full-board',
      format: 'square',
    };
    const token = await createPredictionShareToken(
      { snapshot, presentation },
      { currentSeason: 2026 },
    );
    const decoded = await decodePredictionShareToken(token);

    assert.match(token, /^gs1\.[dn]\.[A-Za-z0-9_-]+\.[a-f0-9]{8}$/);
    assert.ok(token.length < 600, `expected a compact record token, received ${token.length} characters`);
    assert.deepEqual(decoded, { snapshot, presentation });
  });

  it('round-trips all 272 Advanced Mode game picks within the URL token budget', async () => {
    const snapshot = buildSnapshot({ mode: 'advanced' });
    const scheduleGameIds = Object.keys(snapshot.gamePicks);
    const scheduleContext = {
      scheduleGameIds,
      scheduleFingerprint: snapshot.scheduleFingerprint,
    };
    const token = await createPredictionShareToken(snapshot, {
      currentSeason: 2026,
      ...scheduleContext,
    });
    const decoded = await decodePredictionShareToken(token, scheduleContext);

    assert.ok(token.length < 600, `expected a compact Advanced token, received ${token.length} characters`);
    assert.equal(Object.keys(decoded.snapshot.gamePicks).length, 272);
    assert.deepEqual(decoded.snapshot, snapshot);

    await assert.rejects(
      decodePredictionShareToken(token),
      (error) => expectCodecError(error, 'schedule_required'),
    );
    await assert.rejects(
      decodePredictionShareToken(token, {
        scheduleGameIds,
        scheduleFingerprint: '2026.another-schedule',
      }),
      (error) => expectCodecError(error, 'schedule_mismatch'),
    );
  });

  it('supports a dependency-free uncompressed fallback token', async () => {
    const snapshot = buildSnapshot();
    const token = await createPredictionShareToken(snapshot, {
      currentSeason: 2026,
      compression: 'none',
    });
    assert.match(token, /^gs1\.n\./);
    assert.deepEqual((await decodePredictionShareToken(token)).snapshot, snapshot);
  });

  it('detects a changed checksum before parsing the payload', async () => {
    const token = await createPredictionShareToken(buildSnapshot(), { currentSeason: 2026 });
    const damaged = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    await assert.rejects(
      decodePredictionShareToken(damaged),
      (error) => expectCodecError(error, 'checksum_mismatch'),
    );
  });

  it('rejects unsupported codec versions and oversized tokens', async () => {
    const token = await createPredictionShareToken(buildSnapshot(), { currentSeason: 2026 });
    await assert.rejects(
      decodePredictionShareToken(token.replace(/^gs1\./, 'gs2.')),
      (error) => expectCodecError(error, 'unsupported_codec_version'),
    );
    await assert.rejects(
      decodePredictionShareToken(`gs1.n.${'a'.repeat(PREDICTION_SHARE_MAX_TOKEN_LENGTH)}.00000000`),
      (error) => expectCodecError(error, 'token_too_large'),
    );
  });

  it('rejects incomplete records, game picks, playoffs, and unknown fields', async () => {
    const missingRecord = buildSnapshot();
    delete missingRecord.records.BUF;
    await assert.rejects(
      createPredictionShareToken(missingRecord, { currentSeason: 2026 }),
      (error) => expectCodecError(error, 'incomplete_snapshot'),
    );

    const incompleteAdvanced = buildSnapshot({ mode: 'advanced', gamePicks: { game1: 'BUF' } });
    await assert.rejects(
      createPredictionShareToken(incompleteAdvanced, { currentSeason: 2026 }),
      (error) => expectCodecError(error, 'incomplete_snapshot'),
    );

    const missingPlayoff = buildSnapshot();
    delete missingPlayoff.playoffPicks['super-bowl'];
    await assert.rejects(
      createPredictionShareToken(missingPlayoff, { currentSeason: 2026 }),
      (error) => expectCodecError(error, 'incomplete_snapshot'),
    );

    await assert.rejects(
      createPredictionShareToken({ ...buildSnapshot(), unexpected: true }, { currentSeason: 2026 }),
      (error) => expectCodecError(error, 'invalid_schema'),
    );
  });

  it('allows a once-current token to decode after its season becomes historical', async () => {
    const snapshot = buildSnapshot({ season: 2026 });
    const token = await createPredictionShareToken(snapshot, { currentSeason: 2026 });

    // Decoding intentionally has no current-season argument or creation gate.
    assert.deepEqual((await decodePredictionShareToken(token)).snapshot, snapshot);
  });
});

describe('prediction share URLs', () => {
  it('uses the current/self-hosted origin and keeps the payload in a fragment', async () => {
    const url = await createPredictionShareUrl(buildSnapshot(), {
      currentSeason: 2026,
      origin: 'https://self-hosted.example',
    });
    const parsed = new URL(url);

    assert.equal(parsed.origin, 'https://self-hosted.example');
    assert.equal(parsed.pathname, '/predictions');
    assert.equal(parsed.search, '');
    assert.match(parsed.hash, /^#gs1\./);
    assert.deepEqual((await decodePredictionShareUrl(url)).snapshot, buildSnapshot());
  });

  it('normalizes valid origins and rejects origins that include another path', () => {
    assert.equal(getCurrentPredictionShareOrigin({ origin: 'http://localhost:5173' }), 'http://localhost:5173');
    assert.throws(
      () => getCurrentPredictionShareOrigin('https://example.com/predictions'),
      (error) => expectCodecError(error, 'invalid_origin'),
    );
  });
});
