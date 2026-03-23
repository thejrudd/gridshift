// ── Trade Engine ──────────────────────────────────────────────────────────────
// Value balancing, package suggestions, and draft pick ownership for the
// Companion Trade Agent.

import { findKtcPlayerFromSleeper, findKtcDraftPick, getKtcValue } from './ktcApi';

// ── Draft pick ownership ──────────────────────────────────────────────────────

/**
 * Build the full draft pick ownership map for all rosters.
 * Extracted from CompanionLeague — used by both League Picks view and Trade Agent.
 *
 * @param {Array}  tradedPicks - From getTradedPicks(leagueId)
 * @param {Array}  rosters     - From useSleeper().rosters
 * @param {object} league      - From useSleeper().league
 * @param {string} season      - Current season string (e.g. "2025")
 * @param {number} draftRounds - Max rounds from getLeagueDrafts (null = use fallback)
 * @returns {{ slots, years, rosterPicks }}
 *   rosterPicks[rosterId][slotKey] = { ownStatus: 'own'|'traded_away', acquired: number[] }
 */
export function buildRosterPicks(tradedPicks, rosters, league, season, draftRounds) {
  if (!tradedPicks || !rosters || !league) return { slots: [], years: [], rosterPicks: {} };

  const MAX_ROUNDS = 5;
  const maxRoundsFromData = tradedPicks.reduce((max, p) => Math.max(max, p.round), 0);
  const maxRounds = Math.min(
    Math.max(draftRounds ?? 0, maxRoundsFromData, league.settings?.draft_rounds ?? 3, 3),
    MAX_ROUNDS,
  );
  const baseYear = parseInt(season);

  const yearSet = new Set([
    String(baseYear + 1),
    String(baseYear + 2),
    String(baseYear + 3),
  ]);
  for (const p of tradedPicks) yearSet.add(p.season);
  if (tradedPicks.some(p => p.season === season)) yearSet.add(season);
  const years = [...yearSet].sort();

  const slots = [];
  for (const year of years) {
    for (let r = 1; r <= maxRounds; r++) {
      slots.push({ key: `${year}|${r}`, year, round: r });
    }
  }

  const tradedMap = new Map();
  for (const pick of tradedPicks) {
    if (pick.round > maxRounds) continue;
    tradedMap.set(`${pick.season}|${pick.round}|${pick.roster_id}`, pick.owner_id);
  }

  const rosterPicks = {};
  for (const roster of rosters) {
    const rid = roster.roster_id;
    rosterPicks[rid] = {};

    for (const { key, year, round } of slots) {
      const ownKey = `${year}|${round}|${rid}`;
      const ownCurrentOwner = tradedMap.get(ownKey);
      const ownStatus = (ownCurrentOwner === undefined || ownCurrentOwner === rid) ? 'own' : 'traded_away';

      const acquired = [];
      for (const [pickKey, currentOwner] of tradedMap) {
        if (currentOwner !== rid) continue;
        const [pYear, pRound, pRosterId] = pickKey.split('|');
        if (pYear !== year || Number(pRound) !== round || Number(pRosterId) === rid) continue;
        acquired.push(Number(pRosterId));
      }

      rosterPicks[rid][key] = { ownStatus, acquired };
    }
  }

  return { slots, years, rosterPicks };
}

/**
 * Get all picks a specific roster currently owns as a flat array.
 * Each entry: { year, round, fromRosterId, isOwn, key }
 */
export function getPicksForRoster(rosterId, rosterPicks, slots) {
  const picks = [];
  if (!rosterPicks?.[rosterId]) return picks;

  for (const { key, year, round } of slots) {
    const info = rosterPicks[rosterId][key];
    if (!info) continue;

    // Own pick still held
    if (info.ownStatus === 'own') {
      picks.push({ year, round, fromRosterId: rosterId, isOwn: true, key });
    }

    // Acquired picks from other rosters
    for (const fromRid of info.acquired) {
      picks.push({ year, round, fromRosterId: fromRid, isOwn: false, key: `${key}|from${fromRid}` });
    }
  }

  return picks;
}

// ── Pick quality from standings ───────────────────────────────────────────────

/**
 * Determine pick quality (Early/Mid/Late) based on a roster's current season
 * standing within the league. Only meaningful for current/next-season picks.
 *
 * @param {number} rosterId - The original owner of the pick
 * @param {Array}  rosters  - All league rosters (each has .settings.wins, .settings.losses)
 * @returns 'Early' | 'Mid' | 'Late'
 */
export function getPickQuality(rosterId, rosters) {
  if (!rosters?.length) return 'Mid';

  // Sort rosters by record: worst first (most losses, fewest wins → early pick)
  const sorted = [...rosters].sort((a, b) => {
    const winsA = a.settings?.wins ?? 0;
    const winsB = b.settings?.wins ?? 0;
    const lossA = a.settings?.losses ?? 0;
    const lossB = b.settings?.losses ?? 0;
    if (winsA !== winsB) return winsA - winsB; // fewer wins = earlier pick
    return lossB - lossA; // more losses = earlier pick
  });

  const idx = sorted.findIndex(r => r.roster_id === rosterId);
  if (idx === -1) return 'Mid';

  const total = sorted.length;
  const third = Math.ceil(total / 3);

  if (idx < third) return 'Early';
  if (idx < third * 2) return 'Mid';
  return 'Late';
}

// ── Trade valuation ───────────────────────────────────────────────────────────

/**
 * Compute the total KTC value for a set of players + picks on one side of a trade.
 *
 * @param {string[]} playerIds      - Sleeper player IDs on this side
 * @param {Array}    pickItems      - Pick objects: { year, round, fromRosterId }
 * @param {object}   sleeperPlayers - Full Sleeper players map
 * @param {Array}    ktcPlayers     - KTC dataset
 * @param {string}   leagueType     - '1qb' | 'sf'
 * @param {Array}    rosters        - For pick quality estimation
 * @returns {{ total: number, items: Array<{ id, label, val, type }> }}
 */
export function valueSide(playerIds, pickItems, sleeperPlayers, ktcPlayers, leagueType, rosters) {
  const items = [];

  for (const pid of playerIds) {
    const sp = sleeperPlayers?.[pid];
    const ktc = findKtcPlayerFromSleeper(pid, sleeperPlayers, ktcPlayers);
    const val = getKtcValue(ktc, leagueType);
    items.push({
      id: pid,
      label: sp?.full_name ?? (`${sp?.first_name ?? ''} ${sp?.last_name ?? ''}`.trim() || pid),
      position: sp?.position ?? '',
      team: sp?.team ?? '',
      val,
      type: 'player',
      ktcEntry: ktc,
    });
  }

  for (const pick of pickItems) {
    const quality = getPickQuality(pick.fromRosterId, rosters);
    const ktc = findKtcDraftPick(pick.year, pick.round, quality, ktcPlayers);
    const val = getKtcValue(ktc, leagueType);
    const ord = { 1: '1st', 2: '2nd', 3: '3rd' }[pick.round] ?? `${pick.round}th`;
    items.push({
      id: pick.key,
      label: `${pick.year} ${quality} ${ord}`,
      val,
      type: 'pick',
      ktcEntry: ktc,
    });
  }

  const total = items.reduce((sum, it) => sum + (it.val ?? 0), 0);
  return { total, items };
}

// ── Trade verdict ─────────────────────────────────────────────────────────────

/**
 * Evaluate a trade's fairness.
 * @returns {{ verdict: 'fair'|'favors_you'|'favors_them', gap: number, pct: number }}
 */
export function evaluateTrade(yourTotal, theirTotal) {
  const gap = Math.abs(yourTotal - theirTotal);
  const maxVal = Math.max(yourTotal, theirTotal);
  const pct = maxVal > 0 ? Math.round((gap / maxVal) * 100) : 0;

  if (pct <= 5) return { verdict: 'fair', gap, pct };
  // "Favors you" = you're RECEIVING more value (their side is higher)
  if (theirTotal > yourTotal) return { verdict: 'favors_you', gap, pct };
  return { verdict: 'favors_them', gap, pct };
}

// ── Package suggestion ────────────────────────────────────────────────────────

/**
 * Suggest trade packages to close a value gap.
 *
 * @param {number}  gap        - Positive value gap to close
 * @param {Array}   candidates - Array of { id, val, type, label } (available assets on deficit side)
 * @returns Array of up to 3 package options, each: { items: [...], total: number, delta: number }
 */
export function suggestPackage(gap, candidates) {
  if (gap <= 0 || !candidates?.length) return [];

  // Only consider candidates with known values
  const pool = candidates.filter(c => c.val != null && c.val > 0).sort((a, b) => b.val - a.val);
  if (!pool.length) return [];

  const results = [];

  // Strategy A: Closest single asset
  let bestSingle = null;
  let bestSingleDelta = Infinity;
  for (const c of pool) {
    const delta = Math.abs(c.val - gap);
    if (delta < bestSingleDelta && c.val >= gap * 0.80) {
      bestSingle = c;
      bestSingleDelta = delta;
    }
  }
  if (bestSingle) {
    results.push({
      items: [bestSingle],
      total: bestSingle.val,
      delta: bestSingle.val - gap,
    });
  }

  // Strategy B: Greedy best fit (combine multiple assets)
  const greedyItems = [];
  let greedyTotal = 0;
  for (const c of pool) {
    if (greedyTotal >= gap * 1.15) break;
    if (greedyTotal + c.val <= gap * 1.15) {
      greedyItems.push(c);
      greedyTotal += c.val;
    }
  }
  if (greedyItems.length > 1 || (greedyItems.length === 1 && greedyTotal >= gap * 0.80)) {
    const key = greedyItems.map(i => i.id).sort().join(',');
    const singleKey = results[0]?.items.map(i => i.id).sort().join(',');
    if (key !== singleKey) {
      results.push({ items: greedyItems, total: greedyTotal, delta: greedyTotal - gap });
    }
  }

  // Strategy C: Pick-heavy (prefer draft picks over players)
  const pickFirst = [...pool].sort((a, b) => {
    if (a.type === 'pick' && b.type !== 'pick') return -1;
    if (a.type !== 'pick' && b.type === 'pick') return 1;
    return b.val - a.val;
  });
  const pickItems = [];
  let pickTotal = 0;
  for (const c of pickFirst) {
    if (pickTotal >= gap * 1.15) break;
    if (pickTotal + c.val <= gap * 1.15) {
      pickItems.push(c);
      pickTotal += c.val;
    }
  }
  if (pickItems.length > 0 && pickTotal >= gap * 0.80) {
    const key = pickItems.map(i => i.id).sort().join(',');
    const existing = results.map(r => r.items.map(i => i.id).sort().join(','));
    if (!existing.includes(key)) {
      results.push({ items: pickItems, total: pickTotal, delta: pickTotal - gap });
    }
  }

  // Sort by closeness to the gap, then fewest items
  results.sort((a, b) => {
    const aDelta = Math.abs(a.delta);
    const bDelta = Math.abs(b.delta);
    if (aDelta !== bDelta) return aDelta - bDelta;
    return a.items.length - b.items.length;
  });

  return results.slice(0, 3);
}

/**
 * Build the candidate pool for package suggestions from a roster.
 *
 * @param {number}   rosterId       - Roster to pull candidates from
 * @param {Array}    rosters        - All rosters
 * @param {string[]} excludeIds     - Player IDs already in the trade
 * @param {Array}    excludePickKeys - Pick keys already in the trade
 * @param {object}   sleeperPlayers - Sleeper players map
 * @param {Array}    ktcPlayers     - KTC dataset
 * @param {string}   leagueType     - '1qb' | 'sf'
 * @param {object}   rosterPicks    - From buildRosterPicks
 * @param {Array}    slots          - From buildRosterPicks
 */
export function buildCandidatePool(
  rosterId, rosters, excludeIds, excludePickKeys,
  sleeperPlayers, ktcPlayers, leagueType, rosterPicks, slots
) {
  const candidates = [];
  const roster = rosters.find(r => r.roster_id === rosterId);
  if (!roster) return candidates;

  // Player candidates
  const playerIds = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
  const excludeSet = new Set(excludeIds);
  for (const pid of playerIds) {
    if (excludeSet.has(pid)) continue;
    const ktc = findKtcPlayerFromSleeper(pid, sleeperPlayers, ktcPlayers);
    const val = getKtcValue(ktc, leagueType);
    const sp = sleeperPlayers?.[pid];
    candidates.push({
      id: pid,
      label: sp?.full_name ?? pid,
      position: sp?.position ?? '',
      team: sp?.team ?? '',
      val,
      type: 'player',
    });
  }

  // Pick candidates
  const ownedPicks = getPicksForRoster(rosterId, rosterPicks, slots);
  const excludePickSet = new Set(excludePickKeys);
  for (const pick of ownedPicks) {
    if (excludePickSet.has(pick.key)) continue;
    const quality = getPickQuality(pick.fromRosterId, rosters);
    const ktc = findKtcDraftPick(pick.year, pick.round, quality, ktcPlayers);
    const val = getKtcValue(ktc, leagueType);
    const ord = { 1: '1st', 2: '2nd', 3: '3rd' }[pick.round] ?? `${pick.round}th`;
    candidates.push({
      id: pick.key,
      label: `${pick.year} ${quality} ${ord}`,
      val,
      type: 'pick',
      pickData: pick,
    });
  }

  return candidates;
}
