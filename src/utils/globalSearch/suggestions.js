// ── Empty-palette suggestions ──────────────────────────────────────────────
// What the palette shows before anything is typed: what you opened last, your
// starters, and this week's games. Built from the index and data the app
// already holds. It never fetches, and a source that is unavailable simply
// contributes no group — never an empty one.
//
// The groups use the same `{ kind, label, results: [{ record }] }` shape as
// rankResults, so the palette renders, expands and keyboard-navigates them
// exactly like typed results.

import { KIND_GAME, KIND_PLAYER } from './entities/record.js';
import { resolveRecentPicks } from './recents.js';

const RECENT_PICK_LIMIT = 5;
const STARTER_LIMIT = 6;
const GAME_LIMIT = 6;

// A game counts as this week's until well after it ends, so Monday night still
// shows the week that is finishing rather than jumping ahead at kickoff.
const GAME_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function asEntries(records, groupKey) {
  return records.map((record) => ({ record, score: 0, groupKey }));
}

function kickoffMs(record) {
  const value = Date.parse(record?.meta?.kickoff ?? '');
  return Number.isFinite(value) ? value : null;
}

/**
 * The games of the earliest week that still has a game in it — the week in
 * progress, or the next one. Kickoff order. Empty once the season is over.
 */
export function selectThisWeeksGames(index, now = Date.now()) {
  const games = (index?.records ?? []).filter((record) => (
    record.kind === KIND_GAME && !record.meta?.isWeekIndex && kickoffMs(record) != null
  ));

  let week = null;
  for (const game of games) {
    if (kickoffMs(game) + GAME_STALE_AFTER_MS < now) continue;
    const gameWeek = game.meta?.week;
    if (gameWeek != null && (week == null || gameWeek < week)) week = gameWeek;
  }
  if (week == null) return [];

  return games
    .filter((game) => game.meta?.week === week)
    .sort((a, b) => kickoffMs(a) - kickoffMs(b) || a.label.localeCompare(b.label))
    .slice(0, GAME_LIMIT);
}

/**
 * The connected user's starting lineup, in lineup order. Empty slots and
 * players the index does not know are skipped.
 */
export function selectMyStarters(index, fantasyLeague) {
  const myRosterId = fantasyLeague?.myRosterId;
  if (myRosterId == null) return [];
  const roster = (fantasyLeague.rosters ?? []).find(
    (entry) => String(entry?.roster_id) === String(myRosterId),
  );
  const starters = (roster?.starters ?? []).map(String).filter((id) => id && id !== '0');
  if (!starters.length) return [];

  const byId = new Map();
  for (const record of index?.records ?? []) {
    if (record.kind === KIND_PLAYER) byId.set(record.id, record);
  }

  const seen = new Set();
  const records = [];
  for (const id of starters) {
    const record = byId.get(id);
    if (!record || seen.has(id)) continue;
    seen.add(id);
    records.push(record);
    if (records.length >= STARTER_LIMIT) break;
  }
  return records;
}

export function buildSuggestionGroups({ index, recents, fantasyLeague = null, now = Date.now() } = {}) {
  if (!index) return [];
  const groups = [];

  const recentRecords = resolveRecentPicks(recents, index).slice(0, RECENT_PICK_LIMIT);
  if (recentRecords.length) {
    groups.push({ kind: 'recent', label: 'Recent', results: asEntries(recentRecords, 'recent') });
  }

  // A record already listed under Recent is not repeated below it.
  const shown = new Set(recentRecords.map((record) => `${record.kind}:${record.id}`));
  const unseen = (records) => records.filter((record) => !shown.has(`${record.kind}:${record.id}`));

  const starters = unseen(selectMyStarters(index, fantasyLeague));
  if (starters.length) {
    groups.push({ kind: 'starters', label: 'Your starters', results: asEntries(starters, 'starters') });
  }

  const games = unseen(selectThisWeeksGames(index, now));
  if (games.length) {
    const week = games[0].meta?.week;
    groups.push({
      kind: 'thisWeek',
      label: week != null ? `Week ${week} games` : 'This week',
      results: asEntries(games, 'thisWeek'),
    });
  }

  return groups;
}
