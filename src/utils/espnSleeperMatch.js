// ── ESPN → Sleeper player ID matching ─────────────────────────────────────────
//
// Given an ESPN player object and the Sleeper players map, find the matching
// Sleeper player ID. Used by CompareTab so the Fantasy panel can pull Sleeper
// data for a player found via ESPN search.
//
// Strategy:
//   1. Match on `espn_id` field in the Sleeper player record (most reliable).
//   2. Fall back: normalized full_name + position + (optional) team.

function normalizeName(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.''-]/g, '')   // strip punctuation common in names
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the Sleeper player ID that corresponds to an ESPN player.
 *
 * @param {object} espnPlayer  - Player from ESPN roster fetch. Expected fields:
 *   id (string|number), displayName (string), position (string), teamId (string)
 * @param {object} sleeperPlayers - Sleeper players map: { [sleeperId]: playerObj }
 * @returns {string|null} Sleeper player ID, or null if no match found.
 */
export function matchEspnToSleeper(espnPlayer, sleeperPlayers) {
  if (!espnPlayer || !sleeperPlayers) return null;

  const espnId = String(espnPlayer.id);

  // Pass 1: espn_id exact match
  for (const [sid, sp] of Object.entries(sleeperPlayers)) {
    if (sp.espn_id != null && String(sp.espn_id) === espnId) return sid;
  }

  // Pass 2: normalized name + position
  const espnName = normalizeName(espnPlayer.displayName);
  const espnPos  = (espnPlayer.position ?? '').toUpperCase();

  for (const [sid, sp] of Object.entries(sleeperPlayers)) {
    const sleeperName = normalizeName(sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`);
    const sleeperPos  = (sp.position ?? '').toUpperCase();
    if (sleeperName === espnName && sleeperPos === espnPos) return sid;
  }

  return null;
}
