import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const DATABASE_FILENAME = 'bdl-plays.sqlite';
const DEFAULT_DATA_DIR = '/data';
const DEFAULT_LOCAL_DATA_DIR = path.join(os.tmpdir(), 'gridshift-live-data');
// A season of play-by-play is about 4 MB gzipped (~14 KB per game), so this cap
// holds well over a decade of seasons before anything is evicted.
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const READ_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const EVICTION_TARGET_RATIO = 0.9;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLivePlaysArchiveConfig({ env = process.env } = {}) {
  const production = String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const configuredDataDir = String(env.GRIDSHIFT_LIVE_DATA_DIR ?? '').trim();
  return Object.freeze({
    enabled: String(env.GRIDSHIFT_LIVE_PLAYS_ARCHIVE_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
    // Docker Compose mounts /data; direct-host development needs a writable default.
    dataDir: configuredDataDir || (production ? DEFAULT_DATA_DIR : DEFAULT_LOCAL_DATA_DIR),
    maxBytes: parsePositiveInteger(env.GRIDSHIFT_LIVE_PLAYS_ARCHIVE_MAX_BYTES, DEFAULT_MAX_BYTES),
  });
}

/**
 * SQLite archive of finished games' BALLDONTLIE play-by-play, one gzip row per
 * game (and season type). Plays belong to an NFL game, not a league, so one row
 * serves every matchup, league, and Statistics Scores view that game touches.
 *
 * Rows store the provider payload as returned; normalization stays at read time
 * so parser fixes reach archived games. A row is `verified` once it was fetched
 * at least the correction window after the game ended (see liveGameSnapshots.js)
 * and is then served without asking the provider again.
 *
 * Pass `databasePath: ':memory:'` for tests. BALLDONTLIE's Terms of Service
 * (Section 6, as of 2026-10-20) permit caching, storing and archiving lawfully
 * obtained Data with no retention deadline; serving it only to our own pages
 * keeps clear of the "substitute data feed" restriction.
 */
export function createLivePlaysArchive({
  config,
  now = () => Date.now(),
  Database = DatabaseSync,
  databasePath = null,
} = {}) {
  let resolvedPath = databasePath;
  if (!resolvedPath) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    resolvedPath = path.join(config.dataDir, DATABASE_FILENAME);
  }
  const maxBytes = config?.maxBytes ?? DEFAULT_MAX_BYTES;

  const db = new Database(resolvedPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS bdl_game_plays (
      key TEXT PRIMARY KEY,
      body BLOB NOT NULL,
      fetched_at INTEGER NOT NULL,
      game_ended_at INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      last_read_at INTEGER NOT NULL,
      size INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bdl_game_plays_last_read_idx ON bdl_game_plays (last_read_at);
  `);

  const selectRow = db.prepare('SELECT key, body, fetched_at, game_ended_at, verified, last_read_at FROM bdl_game_plays WHERE key = ?');
  const touchRow = db.prepare('UPDATE bdl_game_plays SET last_read_at = ? WHERE key = ?');
  const upsertRow = db.prepare(`
    INSERT INTO bdl_game_plays (key, body, fetched_at, game_ended_at, verified, last_read_at, size)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      game_ended_at = excluded.game_ended_at,
      verified = excluded.verified,
      last_read_at = excluded.last_read_at,
      size = excluded.size
  `);
  const selectTotals = db.prepare('SELECT COUNT(*) AS rows, COALESCE(SUM(size), 0) AS bytes FROM bdl_game_plays');
  const selectLeastRecent = db.prepare('SELECT key, size FROM bdl_game_plays WHERE key != ? ORDER BY last_read_at ASC');
  const deleteRow = db.prepare('DELETE FROM bdl_game_plays WHERE key = ?');

  function totals() {
    const row = selectTotals.get();
    return { rows: Number(row.rows), bytes: Number(row.bytes) };
  }

  // Least recently read rows go first; an evicted game is simply refetched.
  function enforceCap(protectedKey) {
    let { bytes } = totals();
    if (bytes <= maxBytes) return 0;
    const target = Math.floor(maxBytes * EVICTION_TARGET_RATIO);
    let evicted = 0;
    for (const row of selectLeastRecent.all(protectedKey)) {
      if (bytes <= target) break;
      deleteRow.run(row.key);
      bytes -= Number(row.size);
      evicted += 1;
    }
    return evicted;
  }

  return {
    /** Returns { key, payload, fetchedAt, gameEndedAt, verified } or null. */
    get(key) {
      const row = selectRow.get(key);
      if (!row) return null;
      let payload;
      try {
        payload = JSON.parse(gunzipSync(Buffer.from(row.body)).toString('utf8'));
      } catch {
        // A corrupt row is dropped and refetched rather than served.
        deleteRow.run(key);
        return null;
      }
      const t = now();
      if (t - Number(row.last_read_at) > READ_TOUCH_INTERVAL_MS) touchRow.run(t, key);
      return {
        key: row.key,
        payload,
        fetchedAt: Number(row.fetched_at),
        gameEndedAt: Number(row.game_ended_at),
        verified: Number(row.verified) === 1,
      };
    },

    /** Stores a provider payload; returns the number of rows evicted to stay under the cap. */
    put(key, payload, { gameEndedAt, verified = false } = {}) {
      const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
      const t = now();
      upsertRow.run(key, body, t, Number(gameEndedAt) || t, verified ? 1 : 0, t, body.length);
      return enforceCap(key);
    },

    getStats() {
      return { ...totals(), maxBytes };
    },

    close() {
      db.close();
    },
  };
}
