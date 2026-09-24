import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATABASE_FILENAME = 'player-data.sqlite';
// Reads refresh last_read_at at most this often, so serving a hot row does not
// turn into a write per request.
const READ_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
// When the size cap is exceeded, evict down to this share of it.
const EVICTION_TARGET_RATIO = 0.9;

/**
 * SQLite-backed store of ESPN player payloads. Bodies are stored gzip-compressed
 * (ESPN stat JSON compresses roughly 8:1). `final` rows belong to completed
 * seasons and never expire; the caller decides freshness for the rest.
 *
 * Pass `databasePath: ':memory:'` for tests.
 */
export function createPlayerDataStore({
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
  const maxBytes = config?.maxBytes ?? Number.MAX_SAFE_INTEGER;

  const db = new Database(resolvedPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS espn_cache (
      key TEXT PRIMARY KEY,
      body BLOB NOT NULL,
      fetched_at INTEGER NOT NULL,
      last_read_at INTEGER NOT NULL,
      size INTEGER NOT NULL,
      final INTEGER NOT NULL DEFAULT 0,
      missing INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS espn_cache_last_read_idx ON espn_cache (last_read_at);
  `);
  // CREATE TABLE IF NOT EXISTS never upgrades an existing table, so columns
  // added after a database was first created are applied here.
  const columns = new Set(db.prepare('PRAGMA table_info(espn_cache)').all().map((column) => column.name));
  if (!columns.has('missing')) {
    db.exec('ALTER TABLE espn_cache ADD COLUMN missing INTEGER NOT NULL DEFAULT 0');
  }

  const selectRow = db.prepare('SELECT key, body, fetched_at, last_read_at, final, missing FROM espn_cache WHERE key = ?');
  const touchRow = db.prepare('UPDATE espn_cache SET last_read_at = ? WHERE key = ?');
  const upsertRow = db.prepare(`
    INSERT INTO espn_cache (key, body, fetched_at, last_read_at, size, final, missing)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      last_read_at = excluded.last_read_at,
      size = excluded.size,
      final = excluded.final,
      missing = excluded.missing
  `);
  const selectTotals = db.prepare('SELECT COUNT(*) AS rows, COALESCE(SUM(size), 0) AS bytes FROM espn_cache');
  const selectLeastRecent = db.prepare('SELECT key, size FROM espn_cache WHERE key != ? ORDER BY last_read_at ASC');
  const deleteRow = db.prepare('DELETE FROM espn_cache WHERE key = ?');

  function totals() {
    const row = selectTotals.get();
    return { rows: Number(row.rows), bytes: Number(row.bytes) };
  }

  // Evict least recently read rows (never the one just written) until the store
  // fits under the cap. Evicted rows are simply refetched on their next request.
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
    /** Returns { key, body: Buffer (gzip), fetchedAt, final, missing } or null. */
    get(key) {
      const row = selectRow.get(key);
      if (!row) return null;
      const t = now();
      if (t - Number(row.last_read_at) > READ_TOUCH_INTERVAL_MS) touchRow.run(t, key);
      return {
        key: row.key,
        body: Buffer.from(row.body),
        fetchedAt: Number(row.fetched_at),
        final: Number(row.final) === 1,
        missing: Number(row.missing) === 1,
      };
    },

    /**
     * Stores a gzip-compressed body; returns the number of rows evicted to stay
     * under the cap. `missing` rows record that ESPN has no data (empty body).
     */
    put(key, gzipBody, { final = false, missing = false } = {}) {
      const t = now();
      upsertRow.run(key, gzipBody, t, t, gzipBody.length, final ? 1 : 0, missing ? 1 : 0);
      return enforceCap(key);
    },

    delete(key) {
      deleteRow.run(key);
    },

    getStats() {
      return { ...totals(), maxBytes };
    },

    close() {
      db.close();
    },
  };
}
