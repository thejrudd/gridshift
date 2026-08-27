import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPairingCode, hashDraftSyncToken } from './draftSyncCrypto.js';

const DATABASE_FILENAME = 'draft-sync.sqlite';
export const DRAFT_SYNC_DEVICE_ROLES = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  NON_AUTHORITATIVE: 'non-authoritative',
});

function nowMs(now) {
  return Number(now());
}

function changesFrom(result) {
  return Number(result?.changes ?? 0);
}

function scopeKey(scope) {
  return JSON.stringify([scope.sleeperUserId, scope.leagueId, scope.season, scope.draftId]);
}

function predictionScopeKey(scope) {
  return JSON.stringify([scope.sleeperUserId, scope.season]);
}

function storeError(message, kind, details = {}) {
  const error = new Error(message);
  error.kind = kind;
  Object.assign(error, details);
  return error;
}

export function createDraftSyncStore({ config, now = () => Date.now(), Database = DatabaseSync } = {}) {
  if (!config?.enabled) throw new Error('Draft Sync store cannot be created while the feature is disabled.');
  if (!config.sessionSecret) throw new Error('GRIDSHIFT_SESSION_SECRET is required for Draft Sync.');

  fs.mkdirSync(config.dataDir, { recursive: true });
  const databasePath = path.join(config.dataDir, DATABASE_FILENAME);
  const db = new Database(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS devices (
      token_hash TEXT PRIMARY KEY,
      sleeper_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'non-authoritative',
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS pairings (
      pairing_id TEXT,
      code_hash TEXT PRIMARY KEY,
      sleeper_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      starter_token_hash TEXT NOT NULL,
      claimed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS draft_states (
      scope_key TEXT PRIMARY KEY,
      sleeper_user_id TEXT NOT NULL,
      league_id TEXT NOT NULL,
      season TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT,
      initial_choice_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prediction_states (
      scope_key TEXT PRIMARY KEY,
      sleeper_user_id TEXT NOT NULL,
      season TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pairings_expiry_idx ON pairings (expires_at);
  `);

  const pairingColumns = db.prepare('PRAGMA table_info(pairings)').all();
  if (!pairingColumns.some((column) => column.name === 'pairing_id')) {
    db.exec('ALTER TABLE pairings ADD COLUMN pairing_id TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS pairings_pairing_id_idx ON pairings (pairing_id)');
  const deviceColumns = db.prepare('PRAGMA table_info(devices)').all();
  if (!deviceColumns.some((column) => column.name === 'role')) {
    db.exec("ALTER TABLE devices ADD COLUMN role TEXT NOT NULL DEFAULT 'non-authoritative'");
  }
  db.exec(`
    UPDATE devices
    SET role = 'authoritative'
    WHERE token_hash IN (SELECT starter_token_hash FROM pairings)
  `);
  const draftStateColumns = db.prepare('PRAGMA table_info(draft_states)').all();
  if (!draftStateColumns.some((column) => column.name === 'initial_choice_at')) {
    db.exec('ALTER TABLE draft_states ADD COLUMN initial_choice_at INTEGER');
  }

  const statements = {
    deviceByToken: db.prepare('SELECT token_hash, sleeper_user_id, created_at, role, revoked_at FROM devices WHERE token_hash = ?'),
    insertDevice: db.prepare('INSERT INTO devices (token_hash, sleeper_user_id, created_at, role) VALUES (?, ?, ?, ?)'),
    insertPairing: db.prepare('INSERT INTO pairings (pairing_id, code_hash, sleeper_user_id, created_at, expires_at, starter_token_hash) VALUES (?, ?, ?, ?, ?, ?)'),
    pairingByCode: db.prepare('SELECT pairing_id, code_hash, sleeper_user_id, expires_at, claimed_at, starter_token_hash FROM pairings WHERE code_hash = ?'),
    pairingById: db.prepare('SELECT pairing_id, sleeper_user_id, expires_at, claimed_at, starter_token_hash FROM pairings WHERE pairing_id = ? AND starter_token_hash = ?'),
    claimPairing: db.prepare('UPDATE pairings SET claimed_at = ? WHERE code_hash = ? AND claimed_at IS NULL AND expires_at > ?'),
    deleteExpiredPairings: db.prepare('DELETE FROM pairings WHERE claimed_at IS NULL AND expires_at <= ?'),
    stateByScope: db.prepare('SELECT revision, payload_json, initial_choice_at, updated_at FROM draft_states WHERE scope_key = ?'),
    insertState: db.prepare('INSERT INTO draft_states (scope_key, sleeper_user_id, league_id, season, draft_id, revision, payload_json, initial_choice_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    updateState: db.prepare('UPDATE draft_states SET revision = ?, payload_json = ?, initial_choice_at = ?, updated_at = ? WHERE scope_key = ? AND revision = ?'),
    predictionStateByScope: db.prepare('SELECT revision, payload_json, updated_at FROM prediction_states WHERE scope_key = ?'),
    insertPredictionState: db.prepare('INSERT INTO prediction_states (scope_key, sleeper_user_id, season, revision, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    updatePredictionState: db.prepare('UPDATE prediction_states SET revision = ?, payload_json = ?, updated_at = ? WHERE scope_key = ? AND revision = ?'),
    revokeDevice: db.prepare('UPDATE devices SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL'),
  };

  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* preserve original failure */ }
      throw error;
    }
  }

  function getDevice(token) {
    const tokenHash = hashDraftSyncToken(token, config.sessionSecret);
    const row = statements.deviceByToken.get(tokenHash);
    if (!row) return null;
    return {
      tokenHash,
      sleeperUserId: row.sleeper_user_id,
      createdAt: Number(row.created_at),
      role: row.role === DRAFT_SYNC_DEVICE_ROLES.AUTHORITATIVE
        ? DRAFT_SYNC_DEVICE_ROLES.AUTHORITATIVE
        : DRAFT_SYNC_DEVICE_ROLES.NON_AUTHORITATIVE,
      revokedAt: row.revoked_at == null ? null : Number(row.revoked_at),
    };
  }

  function createPairing({ pairingId, sleeperUserId, starterTokenHash, code, createdAt, expiresAt }) {
    const codeHash = hashPairingCode(code, config.sessionSecret);
    const normalizedPairingId = String(pairingId ?? codeHash);
    return transaction(() => {
      statements.deleteExpiredPairings.run(createdAt);
      statements.insertDevice.run(starterTokenHash, sleeperUserId, createdAt, DRAFT_SYNC_DEVICE_ROLES.AUTHORITATIVE);
      statements.insertPairing.run(normalizedPairingId, codeHash, sleeperUserId, createdAt, expiresAt, starterTokenHash);
      return { codeHash, pairingId: normalizedPairingId };
    });
  }

  function getPairingStatus({ pairingId, starterTokenHash, currentTime }) {
    const row = statements.pairingById.get(pairingId, starterTokenHash);
    if (!row) return null;
    return {
      pairingId: row.pairing_id,
      status: row.claimed_at != null
        ? 'claimed'
        : row.expires_at <= currentTime ? 'expired' : 'pending',
      expiresAt: Number(row.expires_at),
      claimedAt: row.claimed_at == null ? null : Number(row.claimed_at),
    };
  }

  function claimPairing({ sleeperUserId, code, tokenHash, claimedAt }) {
    const codeHash = hashPairingCode(code, config.sessionSecret);
    return transaction(() => {
      statements.deleteExpiredPairings.run(claimedAt);
      const row = statements.pairingByCode.get(codeHash);
      if (!row) throw storeError('The pairing code is invalid or has expired.', 'pairing-unavailable');
      if (row.claimed_at != null) throw storeError('The pairing code has already been used.', 'pairing-used');
      if (row.expires_at <= claimedAt) throw storeError('The pairing code has expired.', 'pairing-expired');
      if (row.sleeper_user_id !== sleeperUserId) throw storeError('The pairing code belongs to a different Sleeper user.', 'pairing-user-mismatch');
      const updated = statements.claimPairing.run(claimedAt, codeHash, claimedAt);
      if (changesFrom(updated) !== 1) throw storeError('The pairing code has already been used.', 'pairing-used');
      statements.insertDevice.run(tokenHash, sleeperUserId, claimedAt, DRAFT_SYNC_DEVICE_ROLES.NON_AUTHORITATIVE);
      return { sleeperUserId, claimedAt };
    });
  }

  function getState(scope) {
    const row = statements.stateByScope.get(scopeKey(scope));
    return {
      revision: row ? Number(row.revision) : 0,
      state: row ? JSON.parse(row.payload_json) : null,
      initialChoiceAt: row?.initial_choice_at == null ? null : Number(row.initial_choice_at),
      updatedAt: row ? Number(row.updated_at) : null,
    };
  }

  function putState(scope, expectedRevision, state, updatedAt, initialChoiceAt = null, deviceRole = null) {
    const key = scopeKey(scope);
    const payloadJson = JSON.stringify(state);
    return transaction(() => {
      const current = statements.stateByScope.get(key);
      const currentRevision = current ? Number(current.revision) : 0;
      const currentInitialChoiceAt = current?.initial_choice_at == null ? null : Number(current.initial_choice_at);
      const hasInitialChoice = Number.isSafeInteger(initialChoiceAt) && initialChoiceAt >= 0;
      const authoritativeChoice = hasInitialChoice && deviceRole === DRAFT_SYNC_DEVICE_ROLES.AUTHORITATIVE;
      const initialChoiceLoses = hasInitialChoice
        && !authoritativeChoice
        && currentInitialChoiceAt != null
        && initialChoiceAt >= currentInitialChoiceAt;
      const initialChoiceWins = hasInitialChoice
        && (authoritativeChoice || currentInitialChoiceAt == null || initialChoiceAt < currentInitialChoiceAt);
      if (initialChoiceLoses) {
        return {
          conflict: true,
          ...getState(scope),
        };
      }
      if (currentRevision !== expectedRevision && !initialChoiceWins) {
        return {
          conflict: true,
          ...getState(scope),
        };
      }

      const nextRevision = currentRevision + 1;
      const nextInitialChoiceAt = initialChoiceWins ? initialChoiceAt : currentInitialChoiceAt;
      if (current) {
        const revisionGuard = initialChoiceWins ? currentRevision : expectedRevision;
        const updated = statements.updateState.run(nextRevision, payloadJson, nextInitialChoiceAt, updatedAt, key, revisionGuard);
        if (changesFrom(updated) !== 1) return { conflict: true, ...getState(scope) };
      } else {
        statements.insertState.run(key, scope.sleeperUserId, scope.leagueId, scope.season, scope.draftId, nextRevision, payloadJson, nextInitialChoiceAt, updatedAt);
      }
      return { conflict: false, revision: nextRevision, state, initialChoiceAt: nextInitialChoiceAt, updatedAt };
    });
  }

  function revokeDevice(token) {
    const tokenHash = hashDraftSyncToken(token, config.sessionSecret);
    return transaction(() => {
      const updated = statements.revokeDevice.run(nowMs(now), tokenHash);
      return changesFrom(updated) === 1;
    });
  }

  function getPredictionState(scope) {
    const row = statements.predictionStateByScope.get(predictionScopeKey(scope));
    return {
      revision: row ? Number(row.revision) : 0,
      state: row ? JSON.parse(row.payload_json) : null,
      updatedAt: row ? Number(row.updated_at) : null,
    };
  }

  function putPredictionState(scope, expectedRevision, state, updatedAt) {
    const key = predictionScopeKey(scope);
    const payloadJson = JSON.stringify(state);
    return transaction(() => {
      const current = statements.predictionStateByScope.get(key);
      const currentRevision = current ? Number(current.revision) : 0;
      if (currentRevision !== expectedRevision) return { conflict: true, ...getPredictionState(scope) };

      const nextRevision = currentRevision + 1;
      if (current) {
        const updated = statements.updatePredictionState.run(nextRevision, payloadJson, updatedAt, key, expectedRevision);
        if (changesFrom(updated) !== 1) return { conflict: true, ...getPredictionState(scope) };
      } else {
        statements.insertPredictionState.run(key, scope.sleeperUserId, scope.season, nextRevision, payloadJson, updatedAt);
      }
      return { conflict: false, revision: nextRevision, state, updatedAt };
    });
  }

  return Object.freeze({
    databasePath,
    getDevice,
    createPairing,
    claimPairing,
    getPairingStatus,
    getState,
    putState,
    getPredictionState,
    putPredictionState,
    revokeDevice,
    close() { db.close(); },
  });
}
