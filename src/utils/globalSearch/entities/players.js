// ── Player records ─────────────────────────────────────────────────────────
// Built from the Sleeper player directory, either at build time (scripts/
// build-search-index.mjs) or at runtime from data the app already holds.
//
// Tokens are names only. Team, position, and jersey number are slot filters
// applied in rank.js against `meta`, not search tokens: "sea" is a constraint on
// the result set, not a word to fuzzy-match against.

import { KIND_PLAYER, makeRecord, nameTokens } from './record.js';

// Positions worth indexing for a player who is not on a roster. A free agent
// kicker is a plausible waiver search; a free agent guard is not.
const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

// Sleeper's search_rank is a popularity ordering with unranked players parked at
// a very large value. Anything past this is noise for an unrostered player.
const FREE_AGENT_RANK_LIMIT = 400;

function displayNameOf(player) {
  return player.full_name
    || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
}

/**
 * Popularity prior, 0..1, from Sleeper's search_rank. Used only to break ties
 * between equally good text matches, so its exact shape matters little — what
 * matters is that a household name outranks a practice-squad player with a
 * similar surname.
 */
function weightFromRank(searchRank) {
  const rank = Number(searchRank);
  if (!Number.isFinite(rank) || rank <= 0) return 0.05;
  if (rank >= 1000) return 0.05;
  return Math.max(0.05, 1 - (rank / 1000));
}

function isIndexable(player) {
  if (!player || player.active === false) return false;
  if (!displayNameOf(player)) return false;

  const position = String(player.position ?? '').toUpperCase();
  if (!position) return false;

  // Rostered players are always indexable: jersey and team searches ("sea 11",
  // "raiders 17") have to reach linemen and defenders too, not just skill
  // positions.
  if (player.team) return true;

  if (!FANTASY_POSITIONS.has(position)) return false;
  const rank = Number(player.search_rank);
  return Number.isFinite(rank) && rank > 0 && rank <= FREE_AGENT_RANK_LIMIT;
}

/**
 * Turn a Sleeper player map into search records.
 *
 * `espnId` is carried through when Sleeper knows it, so the common case routes
 * to a player page synchronously. When it is missing, resolveRoute.js falls back
 * to the roster lookup in playerDrilldown.js.
 */
export function buildPlayerRecords(playersById = {}, { espnIdOverrides = {} } = {}) {
  const records = [];

  for (const [sleeperId, player] of Object.entries(playersById ?? {})) {
    if (!isIndexable(player)) continue;

    const name = displayNameOf(player);
    const team = player.team ? String(player.team).toUpperCase() : null;
    const position = String(player.position ?? '').toUpperCase();
    const jersey = player.number != null ? String(player.number) : '';
    const espnId = player.espn_id ?? espnIdOverrides?.[sleeperId] ?? null;

    records.push(makeRecord({
      kind: KIND_PLAYER,
      id: String(sleeperId),
      label: name,
      sublabel: [position, team].filter(Boolean).join(' · '),
      tokens: nameTokens(name),
      weight: weightFromRank(player.search_rank),
      meta: {
        sleeperId: String(sleeperId),
        espnId: espnId != null ? String(espnId) : null,
        team,
        position,
        jersey,
        injuryStatus: player.injury_status ?? null,
      },
    }));
  }

  return records;
}

/**
 * Merge ESPN roster entries into existing player records.
 *
 * ESPN is the source the player pages are keyed on, so a roster pass fills in
 * espnId and corrects jersey numbers for players Sleeper has stale data for.
 * Players ESPN knows and Sleeper does not are added.
 */
export function mergeEspnRoster(records, roster = [], teamId) {
  const team = String(teamId ?? '').toUpperCase();
  const byName = new Map();
  records.forEach((record, index) => {
    if (record.kind !== KIND_PLAYER) return;
    if (record.meta?.team && record.meta.team !== team) return;
    byName.set(record.tokens[record.tokens.length - 1] ?? record.label.toLowerCase(), index);
  });

  const merged = [...records];

  for (const entry of roster) {
    if (!entry?.displayName) continue;
    const tokens = nameTokens(entry.displayName);
    const key = tokens[tokens.length - 1] ?? entry.displayName.toLowerCase();
    const existingIndex = byName.get(key);

    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        meta: {
          ...existing.meta,
          espnId: entry.id != null ? String(entry.id) : existing.meta?.espnId ?? null,
          jersey: entry.jersey ? String(entry.jersey) : existing.meta?.jersey ?? '',
          team,
        },
      };
      continue;
    }

    merged.push(makeRecord({
      kind: KIND_PLAYER,
      id: `espn:${entry.id}`,
      label: entry.displayName,
      sublabel: [String(entry.position ?? '').toUpperCase(), team].filter(Boolean).join(' · '),
      tokens,
      weight: 0.05,
      meta: {
        sleeperId: null,
        espnId: entry.id != null ? String(entry.id) : null,
        team,
        position: String(entry.position ?? '').toUpperCase(),
        jersey: entry.jersey ? String(entry.jersey) : '',
        injuryStatus: entry.status ?? null,
      },
    }));
  }

  return merged;
}

// ── Compact wire format ────────────────────────────────────────────────────
// Players are ~90% of the index by count, and a full record's JSON is mostly
// repeated keys and tokens that are derivable from the name. The static artifact
// ships a tuple per player instead and rebuilds the rest at load, which is far
// cheaper than shipping what we can compute.

const PACKED_FIELDS = ['id', 'name', 'team', 'position', 'jersey', 'espnId', 'weight'];

export function packPlayerRecords(records) {
  return records
    .filter((record) => record.kind === KIND_PLAYER)
    .map((record) => [
      record.id,
      record.label,
      record.meta?.team ?? '',
      record.meta?.position ?? '',
      record.meta?.jersey ?? '',
      record.meta?.espnId ?? '',
      Math.round((record.weight ?? 0) * 1000) / 1000,
    ]);
}

export function unpackPlayerRecords(packed = []) {
  return packed.map((tuple) => {
    const [id, name, team, position, jersey, espnId, weight] = tuple;
    return makeRecord({
      kind: KIND_PLAYER,
      id,
      label: name,
      sublabel: [position, team].filter(Boolean).join(' · '),
      tokens: nameTokens(name),
      weight: weight ?? 0,
      meta: {
        sleeperId: String(id).startsWith('espn:') ? null : String(id),
        espnId: espnId || null,
        team: team || null,
        position: position || '',
        jersey: jersey || '',
        injuryStatus: null,
      },
    });
  });
}

export { PACKED_FIELDS as PACKED_PLAYER_FIELDS };
