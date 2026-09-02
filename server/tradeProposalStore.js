import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashTradeProposalToken } from './tradeProposalCrypto.js';

const DATABASE_FILENAME = 'trade-proposals.sqlite';
const DEFAULT_SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

function nowMs(now) {
  return Number(now());
}

function changesFrom(result) {
  return Number(result?.changes ?? 0);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapSession(row, tokenHash = null) {
  if (!row) return null;
  return {
    tokenHash,
    sleeperUserId: String(row.sleeper_user_id),
    leagueId: String(row.league_id),
    season: String(row.season),
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}

function mapProposal(row, revision = null) {
  if (!row) return null;
  return {
    id: String(row.proposal_id),
    leagueId: String(row.league_id),
    season: String(row.season),
    senderUserId: String(row.sender_user_id),
    senderRosterId: String(row.sender_roster_id),
    recipientUserId: String(row.recipient_user_id),
    recipientRosterId: String(row.recipient_roster_id),
    status: String(row.status),
    currentRevision: Number(row.current_revision),
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    acceptedByUserId: row.accepted_by_user_id == null ? null : String(row.accepted_by_user_id),
    acceptedAt: row.accepted_at == null ? null : Number(row.accepted_at),
    sleeperOutcome: String(row.sleeper_outcome ?? 'unknown'),
    sleeperTransactionId: row.sleeper_transaction_id == null ? null : String(row.sleeper_transaction_id),
    sleeperCheckedAt: row.sleeper_checked_at == null ? null : Number(row.sleeper_checked_at),
    sleeperMatch: parseJson(row.sleeper_match_json),
    shareTokenHash: row.share_token_hash == null ? null : String(row.share_token_hash),
    revision: revision ? {
      number: Number(revision.revision),
      authorUserId: String(revision.author_user_id),
      createdAt: Number(revision.created_at),
      expiresAt: Number(revision.expires_at),
      senderTimeZone: String(revision.sender_time_zone ?? 'UTC'),
      snapshot: parseJson(revision.snapshot_json, {}),
    } : null,
  };
}

export function createTradeProposalStore({ config, now = () => Date.now(), Database = DatabaseSync } = {}) {
  if (!config?.enabled) throw new Error('Trade proposal store cannot be created while the feature is disabled.');
  if (!config.sessionSecret) throw new Error('GRIDSHIFT_SESSION_SECRET is required for Trade proposals.');
  const sessionRetentionMs = Number.isSafeInteger(Number(config.sessionRetentionMs)) && Number(config.sessionRetentionMs) > 0
    ? Number(config.sessionRetentionMs)
    : DEFAULT_SESSION_RETENTION_MS;

  fs.mkdirSync(config.dataDir, { recursive: true });
  const databasePath = path.join(config.dataDir, DATABASE_FILENAME);
  const db = new Database(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS participant_sessions (
      token_hash TEXT PRIMARY KEY,
      sleeper_user_id TEXT NOT NULL,
      league_id TEXT NOT NULL,
      season TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trade_proposals (
      proposal_id TEXT PRIMARY KEY,
      share_token_hash TEXT NOT NULL UNIQUE,
      league_id TEXT NOT NULL,
      season TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      sender_roster_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      recipient_roster_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_revision INTEGER NOT NULL DEFAULT 1,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      accepted_by_user_id TEXT,
      accepted_at INTEGER,
      sleeper_outcome TEXT NOT NULL DEFAULT 'unknown',
      sleeper_transaction_id TEXT,
      sleeper_checked_at INTEGER,
      sleeper_match_json TEXT,
      fingerprint_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS trade_proposal_revisions (
      proposal_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      author_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      sender_time_zone TEXT NOT NULL DEFAULT 'UTC',
      snapshot_json TEXT NOT NULL,
      PRIMARY KEY (proposal_id, revision),
      FOREIGN KEY (proposal_id) REFERENCES trade_proposals(proposal_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS trade_proposal_events (
      event_id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      revision INTEGER,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      payload_json TEXT,
      FOREIGN KEY (proposal_id) REFERENCES trade_proposals(proposal_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS trade_proposal_tombstones (
      proposal_id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      season TEXT NOT NULL,
      sender_roster_id TEXT NOT NULL,
      recipient_roster_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      fingerprint_json TEXT NOT NULL DEFAULT '{}',
      expired_at INTEGER NOT NULL,
      purge_at INTEGER NOT NULL,
      sleeper_outcome TEXT NOT NULL DEFAULT 'unknown',
      sleeper_transaction_id TEXT,
      sleeper_checked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS trade_proposals_expiry_idx ON trade_proposals (expires_at);
    CREATE INDEX IF NOT EXISTS trade_proposals_participant_idx ON trade_proposals (league_id, season, sender_user_id, recipient_user_id);
    CREATE INDEX IF NOT EXISTS trade_events_recipient_idx ON trade_proposal_events (recipient_user_id, read_at, created_at);
    CREATE INDEX IF NOT EXISTS trade_tombstones_purge_idx ON trade_proposal_tombstones (purge_at);
  `);

  // Keep an existing persistent /data volume upgradeable as the development
  // schema gains fields. These migrations are additive and never discard
  // proposal data.
  const ensureColumn = (table, column, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((entry) => entry.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('trade_proposals', 'fingerprint_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('trade_proposals', 'accepted_by_user_id', 'TEXT');
  ensureColumn('trade_proposals', 'accepted_at', 'INTEGER');
  ensureColumn('trade_proposal_tombstones', 'fingerprint_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('trade_proposal_revisions', 'sender_time_zone', "TEXT NOT NULL DEFAULT 'UTC'");

  const statements = {
    sessionByToken: db.prepare('SELECT token_hash, sleeper_user_id, league_id, season, created_at, last_seen_at FROM participant_sessions WHERE token_hash = ?'),
    insertSession: db.prepare('INSERT INTO participant_sessions (token_hash, sleeper_user_id, league_id, season, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at'),
    touchSession: db.prepare('UPDATE participant_sessions SET last_seen_at = ? WHERE token_hash = ?'),
    proposalById: db.prepare('SELECT * FROM trade_proposals WHERE proposal_id = ?'),
    proposalByShareToken: db.prepare('SELECT * FROM trade_proposals WHERE share_token_hash = ?'),
    currentRevision: db.prepare('SELECT * FROM trade_proposal_revisions WHERE proposal_id = ? AND revision = ?'),
    insertProposal: db.prepare(`INSERT INTO trade_proposals (
      proposal_id, share_token_hash, league_id, season, sender_user_id, sender_roster_id,
      recipient_user_id, recipient_roster_id, status, current_revision, expires_at,
      created_at, updated_at, sleeper_outcome, fingerprint_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, 'unknown', ?)`),
    insertRevision: db.prepare('INSERT INTO trade_proposal_revisions (proposal_id, revision, author_user_id, created_at, expires_at, sender_time_zone, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    insertEvent: db.prepare('INSERT INTO trade_proposal_events (event_id, proposal_id, recipient_user_id, event_type, revision, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    updateProposalRevision: db.prepare('UPDATE trade_proposals SET status = ?, current_revision = ?, expires_at = ?, updated_at = ? WHERE proposal_id = ? AND current_revision = ?'),
    updateStatus: db.prepare('UPDATE trade_proposals SET status = ?, updated_at = ? WHERE proposal_id = ? AND status IN (\'pending\', \'countered\')'),
    acceptProposal: db.prepare('UPDATE trade_proposals SET status = \'accepted\', accepted_by_user_id = ?, accepted_at = ?, updated_at = ? WHERE proposal_id = ? AND current_revision = ? AND status IN (\'pending\', \'countered\') AND expires_at > ?'),
    updateOutcome: db.prepare('UPDATE trade_proposals SET sleeper_outcome = ?, sleeper_transaction_id = ?, sleeper_checked_at = ?, sleeper_match_json = ?, updated_at = ? WHERE proposal_id = ?'),
    proposalsForParticipant: db.prepare(`SELECT p.*, r.revision, r.author_user_id, r.created_at AS revision_created_at,
      r.expires_at AS revision_expires_at, r.sender_time_zone AS revision_sender_time_zone, r.snapshot_json
      FROM trade_proposals p
      JOIN trade_proposal_revisions r ON r.proposal_id = p.proposal_id AND r.revision = p.current_revision
      WHERE p.league_id = ? AND p.season = ? AND (p.sender_user_id = ? OR p.recipient_user_id = ?) AND (p.status = 'accepted' OR p.expires_at > ?)
      ORDER BY p.updated_at DESC`),
    eventsForParticipant: db.prepare(`SELECT e.event_id, e.proposal_id, e.event_type, e.revision, e.created_at, e.read_at, e.payload_json
      FROM trade_proposal_events e
      JOIN trade_proposals p ON p.proposal_id = e.proposal_id
      WHERE e.recipient_user_id = ? AND p.league_id = ? AND p.season = ? AND e.read_at IS NULL
      ORDER BY e.created_at DESC`),
    eventById: db.prepare('SELECT e.* FROM trade_proposal_events e JOIN trade_proposals p ON p.proposal_id = e.proposal_id WHERE e.event_id = ? AND e.recipient_user_id = ? AND p.league_id = ? AND p.season = ?'),
    markEventRead: db.prepare('UPDATE trade_proposal_events SET read_at = ? WHERE event_id = ? AND recipient_user_id = ? AND read_at IS NULL AND proposal_id IN (SELECT proposal_id FROM trade_proposals WHERE league_id = ? AND season = ?)'),
    expiredSessions: db.prepare('SELECT token_hash FROM participant_sessions WHERE last_seen_at <= ?'),
    deleteSession: db.prepare('DELETE FROM participant_sessions WHERE token_hash = ?'),
    expiredProposals: db.prepare("SELECT p.proposal_id, p.league_id, p.season, p.sender_roster_id, p.recipient_roster_id, p.expires_at, p.sleeper_outcome, p.sleeper_transaction_id, p.sleeper_checked_at, p.fingerprint_json, r.snapshot_json FROM trade_proposals p JOIN trade_proposal_revisions r ON r.proposal_id = p.proposal_id AND r.revision = p.current_revision WHERE p.status IN ('pending', 'countered') AND p.expires_at <= ?"),
    insertTombstone: db.prepare('INSERT OR REPLACE INTO trade_proposal_tombstones (proposal_id, league_id, season, sender_roster_id, recipient_roster_id, fingerprint, fingerprint_json, expired_at, purge_at, sleeper_outcome, sleeper_transaction_id, sleeper_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    deleteEvents: db.prepare('DELETE FROM trade_proposal_events WHERE proposal_id = ?'),
    deleteRevisions: db.prepare('DELETE FROM trade_proposal_revisions WHERE proposal_id = ?'),
    deleteProposal: db.prepare('DELETE FROM trade_proposals WHERE proposal_id = ?'),
    expiredTombstones: db.prepare('SELECT proposal_id FROM trade_proposal_tombstones WHERE purge_at <= ?'),
    deleteTombstone: db.prepare('DELETE FROM trade_proposal_tombstones WHERE proposal_id = ?'),
    tombstoneById: db.prepare('SELECT * FROM trade_proposal_tombstones WHERE proposal_id = ?'),
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

  function getSession(token) {
    const tokenHash = hashTradeProposalToken(token, config.sessionSecret);
    const row = statements.sessionByToken.get(tokenHash);
    if (!row) return null;
    return mapSession(row, tokenHash);
  }

  function createSession({ tokenHash, sleeperUserId, leagueId, season, createdAt = nowMs(now) }) {
    statements.insertSession.run(tokenHash, String(sleeperUserId), String(leagueId), String(season), createdAt, createdAt);
    return { sleeperUserId: String(sleeperUserId), leagueId: String(leagueId), season: String(season), createdAt };
  }

  function touchSession(tokenHash, touchedAt = nowMs(now)) {
    statements.touchSession.run(touchedAt, tokenHash);
  }

  function getRevision(row) {
    if (!row) return null;
    return {
      // mapProposal reads the database-shaped revision fields below. Keep
      // this helper aligned with that contract; listInbox rows already carry
      // the current revision snapshot from its joined query.
      revision: row.revision,
      author_user_id: row.author_user_id,
      created_at: row.revision_created_at ?? row.created_at,
      expires_at: row.revision_expires_at ?? row.expires_at,
      sender_time_zone: row.revision_sender_time_zone ?? row.sender_time_zone ?? 'UTC',
      snapshot_json: row.snapshot_json,
    };
  }

  function getProposal(proposalId, { includeRevision = true } = {}) {
    const row = statements.proposalById.get(String(proposalId));
    if (!row) return null;
    const revision = includeRevision
      ? statements.currentRevision.get(row.proposal_id, row.current_revision)
      : null;
    return mapProposal(row, revision);
  }

  function getProposalByShareToken(token) {
    const tokenHash = hashTradeProposalToken(token, config.sessionSecret);
    const row = statements.proposalByShareToken.get(tokenHash);
    if (!row) return null;
    const revision = statements.currentRevision.get(row.proposal_id, row.current_revision);
    return mapProposal(row, revision);
  }

  function createProposal({ proposalId, shareTokenHash, leagueId, season, senderUserId, senderRosterId, recipientUserId, recipientRosterId, snapshot, expiresAt, senderTimeZone = 'UTC', createdAt = nowMs(now), fingerprint, fingerprintData = {}, eventId }) {
    return transaction(() => {
      statements.insertProposal.run(
        String(proposalId), String(shareTokenHash), String(leagueId), String(season),
        String(senderUserId), String(senderRosterId), String(recipientUserId), String(recipientRosterId),
        expiresAt, createdAt, createdAt, JSON.stringify(fingerprintData),
      );
      statements.insertRevision.run(String(proposalId), 1, String(senderUserId), createdAt, expiresAt, String(senderTimeZone || 'UTC'), JSON.stringify(snapshot));
      statements.insertEvent.run(
        String(eventId), String(proposalId), String(recipientUserId), 'proposal_received', 1, createdAt,
        JSON.stringify({ fingerprint }),
      );
      return getProposal(proposalId);
    });
  }

  function addCounter({ proposalId, expectedRevision, authorUserId, snapshot, expiresAt, senderTimeZone = 'UTC', eventId, createdAt = nowMs(now) }) {
    return transaction(() => {
      const row = statements.proposalById.get(String(proposalId));
      if (!row) return { conflict: false, proposal: null };
      if (Number(row.current_revision) !== Number(expectedRevision)) {
        return { conflict: true, proposal: getProposal(proposalId) };
      }
      if (!['pending', 'countered'].includes(row.status) || Number(row.expires_at) <= createdAt) {
        return { conflict: false, proposal: getProposal(proposalId) };
      }

      const nextRevision = Number(row.current_revision) + 1;
      const recipientUserId = String(authorUserId) === String(row.sender_user_id)
        ? String(row.recipient_user_id)
        : String(row.sender_user_id);
      statements.insertRevision.run(String(proposalId), nextRevision, String(authorUserId), createdAt, expiresAt, String(senderTimeZone || 'UTC'), JSON.stringify(snapshot));
      const updated = statements.updateProposalRevision.run('countered', nextRevision, expiresAt, createdAt, String(proposalId), Number(expectedRevision));
      if (changesFrom(updated) !== 1) return { conflict: true, proposal: getProposal(proposalId) };
      statements.insertEvent.run(
        String(eventId), String(proposalId), recipientUserId, 'counter_received', nextRevision, createdAt,
        JSON.stringify({}),
      );
      return { conflict: false, proposal: getProposal(proposalId) };
    });
  }

  function updateStatus({ proposalId, status, actorUserId, eventId, createdAt = nowMs(now) }) {
    return transaction(() => {
      const row = statements.proposalById.get(String(proposalId));
      if (!row) return null;
      const updated = statements.updateStatus.run(String(status), createdAt, String(proposalId));
      if (changesFrom(updated) !== 1) return getProposal(proposalId);
      const recipientUserId = String(actorUserId) === String(row.sender_user_id)
        ? String(row.recipient_user_id)
        : String(row.sender_user_id);
      statements.insertEvent.run(
        String(eventId), String(proposalId), recipientUserId, `trade_${status}`, Number(row.current_revision), createdAt,
        JSON.stringify({ actorUserId: String(actorUserId) }),
      );
      return getProposal(proposalId);
    });
  }

  function acceptProposal({ proposalId, expectedRevision, actorUserId, eventId, createdAt = nowMs(now) }) {
    return transaction(() => {
      const row = statements.proposalById.get(String(proposalId));
      if (!row) return { conflict: false, forbidden: false, proposal: null };
      const actor = String(actorUserId);
      const isParticipant = actor === String(row.sender_user_id) || actor === String(row.recipient_user_id);
      if (!isParticipant) return { conflict: false, forbidden: true, reason: 'participant', proposal: getProposal(proposalId) };
      const revision = statements.currentRevision.get(row.proposal_id, row.current_revision);
      if (String(revision?.author_user_id ?? '') === actor) {
        return { conflict: false, forbidden: true, reason: 'author', proposal: getProposal(proposalId) };
      }
      if (Number(row.current_revision) !== Number(expectedRevision)) {
        return { conflict: true, forbidden: false, reason: 'revision', proposal: getProposal(proposalId) };
      }
      if (!['pending', 'countered'].includes(row.status) || Number(row.expires_at) <= createdAt) {
        return { conflict: true, forbidden: false, reason: 'closed', proposal: getProposal(proposalId) };
      }
      const updated = statements.acceptProposal.run(actor, createdAt, createdAt, String(proposalId), Number(expectedRevision), createdAt);
      if (changesFrom(updated) !== 1) return { conflict: true, forbidden: false, reason: 'changed', proposal: getProposal(proposalId) };
      const recipientUserId = actor === String(row.sender_user_id)
        ? String(row.recipient_user_id)
        : String(row.sender_user_id);
      statements.insertEvent.run(
        String(eventId), String(proposalId), recipientUserId, 'trade_accepted', Number(row.current_revision), createdAt,
        JSON.stringify({ actorUserId: actor, acceptedRevision: Number(row.current_revision) }),
      );
      return { conflict: false, forbidden: false, proposal: getProposal(proposalId) };
    });
  }

  function updateSleeperOutcome({ proposalId, outcome, transactionId = null, match = null, checkedAt = nowMs(now), eventId = null, eventRecipients = [], eventType = null, actorUserId = null }) {
    return transaction(() => {
      const row = statements.proposalById.get(String(proposalId));
      if (!row) return null;
      statements.updateOutcome.run(String(outcome), transactionId == null ? null : String(transactionId), checkedAt, match == null ? null : JSON.stringify(match), checkedAt, String(proposalId));
      if (eventId) {
        const recipients = eventRecipients.length > 0
          ? eventRecipients.map(String)
          : [String(row.sender_user_id)];
        recipients.filter((recipient, index) => recipients.indexOf(recipient) === index).forEach((recipientUserId, index) => {
          const currentEventId = index === 0 ? String(eventId) : `${String(eventId)}-${index}`;
          statements.insertEvent.run(
            currentEventId,
            String(proposalId),
            recipientUserId,
            String(eventType ?? (outcome === 'possible_match' ? 'sleeper_match_possible' : 'trade_outcome_updated')),
            Number(row.current_revision),
            checkedAt,
            JSON.stringify({ transactionId, actorUserId }),
          );
        });
      }
      return getProposal(proposalId);
    });
  }

  function listInbox({ sleeperUserId, leagueId, season, currentTime = nowMs(now) }) {
    const rows = statements.proposalsForParticipant.all(String(leagueId), String(season), String(sleeperUserId), String(sleeperUserId), currentTime);
    const events = statements.eventsForParticipant.all(String(sleeperUserId), String(leagueId), String(season)).map((row) => ({
      id: String(row.event_id),
      proposalId: String(row.proposal_id),
      type: String(row.event_type),
      revision: row.revision == null ? null : Number(row.revision),
      createdAt: Number(row.created_at),
      readAt: row.read_at == null ? null : Number(row.read_at),
      payload: parseJson(row.payload_json, {}),
    }));
    return {
      proposals: rows.map((row) => mapProposal(row, getRevision(row))),
      events,
      unreadCount: events.length,
    };
  }

  function markEventRead({ eventId, sleeperUserId, leagueId, season, readAt = nowMs(now) }) {
    return changesFrom(statements.markEventRead.run(readAt, String(eventId), String(sleeperUserId), String(leagueId), String(season))) === 1;
  }

  function pruneExpired(currentTime = nowMs(now)) {
    return transaction(() => {
      const expiredSessions = statements.expiredSessions.all(currentTime - sessionRetentionMs);
      for (const row of expiredSessions) statements.deleteSession.run(String(row.token_hash));

      const expiredRows = statements.expiredProposals.all(currentTime);
      for (const row of expiredRows) {
        const snapshot = parseJson(row.snapshot_json, {});
        statements.insertTombstone.run(
          String(row.proposal_id), String(row.league_id), String(row.season),
          String(row.sender_roster_id), String(row.recipient_roster_id), String(snapshot.fingerprint ?? ''),
          String(row.fingerprint_json ?? '{}'), Number(row.expires_at), currentTime + config.tombstoneRetentionMs,
          String(row.sleeper_outcome ?? 'unknown'), row.sleeper_transaction_id == null ? null : String(row.sleeper_transaction_id),
          row.sleeper_checked_at == null ? null : Number(row.sleeper_checked_at),
        );
        statements.deleteEvents.run(String(row.proposal_id));
        statements.deleteRevisions.run(String(row.proposal_id));
        statements.deleteProposal.run(String(row.proposal_id));
      }

      const tombstones = statements.expiredTombstones.all(currentTime);
      for (const row of tombstones) statements.deleteTombstone.run(String(row.proposal_id));
      return { expired: expiredRows.length, purged: tombstones.length, sessionsPurged: expiredSessions.length };
    });
  }

  function getTombstone(proposalId) {
    const row = statements.tombstoneById.get(String(proposalId));
    if (!row) return null;
    return {
      proposalId: String(row.proposal_id),
      leagueId: String(row.league_id),
      season: String(row.season),
      senderRosterId: String(row.sender_roster_id),
      recipientRosterId: String(row.recipient_roster_id),
      fingerprint: String(row.fingerprint),
      matchData: parseJson(row.fingerprint_json, {}),
      expiredAt: Number(row.expired_at),
      purgeAt: Number(row.purge_at),
      sleeperOutcome: String(row.sleeper_outcome),
      sleeperTransactionId: row.sleeper_transaction_id == null ? null : String(row.sleeper_transaction_id),
      sleeperCheckedAt: row.sleeper_checked_at == null ? null : Number(row.sleeper_checked_at),
    };
  }

  return Object.freeze({
    databasePath,
    getSession,
    createSession,
    touchSession,
    getProposal,
    getProposalByShareToken,
    createProposal,
    addCounter,
    updateStatus,
    acceptProposal,
    updateSleeperOutcome,
    listInbox,
    markEventRead,
    pruneExpired,
    getTombstone,
    close() { db.close(); },
  });
}
