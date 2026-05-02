// ── Trade Engine ──────────────────────────────────────────────────────────────
// Value balancing, package suggestions, and draft pick ownership for the
// Companion Trade Agent.

import { findKtcPlayerFromSleeper, findKtcDraftPick, getKtcValue } from './ktcApi';
import { getDraftPickDisplayInfo, getProjectedPickQuality } from './draftPickDisplay';
import { DYNASTY_FALLBACK_MULT, computeTradePlayerValueDetail } from './tradeValue';

// ── Redraft pick valuation ────────────────────────────────────────────────────

/**
 * Compute draft pick values for a REDRAFT league by bucketing KTC player values
 * into draft rounds (leagueSize players per round), then splitting each round
 * into Early / Mid / Late thirds.
 *
 * Uncertainty discount scales with round depth: a 1st-round pick is
 * relatively predictable; a 15th-round pick is nearly a lottery ticket.
 * Discount = max(20%, 90% - (round-1) × 7%) — so round 1 ≈ 10% off,
 * round 5 ≈ 38% off, round 10 ≈ 73% off, round 13+ ≈ 80% off.
 *
 * @param {Array}  ktcPlayers - KTC player dataset (redraft-format values)
 * @param {number} leagueSize - Number of teams (picks per round)
 * @param {string} leagueType - '1qb' | 'sf'
 * @returns {{ [round: number]: { Early: number, Mid: number, Late: number } }}
 */
export function computeRedraftPickValues(ktcPlayers, leagueSize, leagueType) {
  if (!ktcPlayers?.length || !leagueSize) return {};

  // All non-RDP players sorted by value desc
  const ranked = ktcPlayers
    .filter(k => k.position !== 'RDP')
    .map(k => getKtcValue(k, leagueType) ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => b - a);

  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };

  const third = Math.max(1, Math.floor(leagueSize / 3));
  const map = {};

  for (let round = 1; round <= 25; round++) {
    const start  = (round - 1) * leagueSize;
    const bucket = ranked.slice(start, start + leagueSize);
    if (bucket.length === 0) break;

    // Uncertainty increases sharply for later rounds
    const discount = Math.max(0.20, 0.90 - (round - 1) * 0.07);

    map[round] = {
      Early: Math.round(median(bucket.slice(0, third))          * discount),
      Mid:   Math.round(median(bucket.slice(third, third * 2))  * discount),
      Late:  Math.round(median(bucket.slice(third * 2))         * discount),
    };
  }

  return map;
}

/**
 * Year-based discount for redraft pick values.
 * Picks usable sooner are worth more — 10% off per year into the future,
 * floored at 60% (picks 4+ years out).
 */
export function pickYearDiscount(year, currentSeason) {
  const yearsOut = Math.max(0, parseInt(year) - parseInt(currentSeason));
  return Math.max(0.60, 1.0 - yearsOut * 0.10);
}

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

  const maxRoundsFromData = tradedPicks.reduce((max, p) => Math.max(max, p.round), 0);
  const maxRounds = Math.max(draftRounds ?? 0, maxRoundsFromData, league.settings?.draft_rounds ?? 3, 3);
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
  return getProjectedPickQuality(rosterId, rosters);
}

export function valueDraftPick(
  pick,
  {
    rosters = [],
    ktcPlayers = [],
    leagueType = '1qb',
    pickValueMap = null,
    currentSeason = null,
    league = null,
    drafts = [],
  } = {},
) {
  const displayInfo = getDraftPickDisplayInfo(pick, { league, rosters, drafts, currentSeason });
  const quality = displayInfo.valueQuality ?? getPickQuality(pick?.fromRosterId, rosters);

  let val = null;
  let ktcEntry = null;
  if (pickValueMap?.[pick?.round] != null) {
    const tierVal = pickValueMap[pick.round][quality] ?? pickValueMap[pick.round].Mid ?? null;
    val = tierVal != null ? Math.round(tierVal * pickYearDiscount(pick.year, currentSeason)) : null;
  } else {
    ktcEntry = findKtcDraftPick(pick?.year, pick?.round, quality, ktcPlayers);
    val = getKtcValue(ktcEntry, leagueType);
  }

  return {
    val,
    value: val,
    ktcEntry,
    displayInfo,
    quality: displayInfo.quality ?? quality,
    valueQuality: quality,
  };
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
 * @param {string}   currentSeason  - e.g. "2025" — for year-based pick discount
 * @returns {{ total: number, items: Array<{ id, label, val, type }> }}
 */
export function valueSide(playerIds, pickItems, sleeperPlayers, ktcPlayers, leagueType, rosters, pickValueMap, currentSeason, dynastyFallbackPlayers = null, idpValueMap = null, playerTradeValueDetailsMap = null, league = null, drafts = []) {
  const items = [];

  for (const pid of playerIds) {
    const sp = sleeperPlayers?.[pid];
    const sharedTradeValue = playerTradeValueDetailsMap?.get(pid) ?? null;
    let ktc = null;
    let rawVal = sharedTradeValue?.value ?? null;
    let dynastyFallback = sharedTradeValue?.dynastyFallback ?? false;

    if (!sharedTradeValue) {
      ktc = findKtcPlayerFromSleeper(pid, sleeperPlayers, ktcPlayers);
      rawVal = getKtcValue(ktc, leagueType);

      // If no redraft value found, try dynasty rankings as a fallback and discount.
      if (rawVal == null && dynastyFallbackPlayers?.length) {
        const dynastyKtc = findKtcPlayerFromSleeper(pid, sleeperPlayers, dynastyFallbackPlayers);
        const dynastyVal = getKtcValue(dynastyKtc, leagueType);
        if (dynastyVal != null) {
          rawVal = Math.round(dynastyVal * DYNASTY_FALLBACK_MULT);
          dynastyFallback = true;
        }
      }
    }

    // IDP/DST fallback — production-computed value (already on same scale as KTC)
    let idpFallback = sharedTradeValue?.isEstimated ?? false;
    if (rawVal == null && idpValueMap?.has(pid)) {
      rawVal = idpValueMap.get(pid);
      idpFallback = true;
    }

    // Null = KTC not loaded yet (shows "—"). 0 = loaded but no value found.
    const val = rawVal ?? (ktcPlayers.length > 0 ? 0 : null);
    items.push({
      id: pid,
      label: sp?.full_name ?? (`${sp?.first_name ?? ''} ${sp?.last_name ?? ''}`.trim() || pid),
      position: sp?.position ?? '',
      team: sp?.team ?? '',
      val,
      dynastyFallback,
      idpFallback,
      type: 'player',
      ktcEntry: ktc,
    });
  }

  for (const pick of pickItems) {
    const { val, ktcEntry, displayInfo, quality, valueQuality } = valueDraftPick(pick, {
      rosters,
      ktcPlayers,
      leagueType,
      pickValueMap,
      currentSeason,
      league,
      drafts,
    });

    items.push({
      id: pick.key,
      label: displayInfo.label,
      val,
      type: 'pick',
      ktcEntry,
      pickData: pick,
      year: pick.year,
      round: pick.round,
      quality,
      valueQuality,
      displayMode: displayInfo.displayMode,
      lockedSlot: displayInfo.lockedSlot ?? null,
      pickNumberLabel: displayInfo.pickNumberLabel ?? null,
      pickRangeLabel: displayInfo.pickRangeLabel ?? null,
      cardHeadline: displayInfo.cardHeadline ?? null,
      cardMetaLabel: displayInfo.cardMetaLabel ?? null,
      sortSlot: displayInfo.sortSlot ?? null,
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
 * Suggest ways to balance a trade: add assets to the weaker side, remove
 * assets from the stronger side, or swap an asset on either side.
 *
 * @param {object} opts
 *   gap               - Absolute value gap (surplus total − deficit total)
 *   deficitSide       - 'yours' | 'theirs' (side that needs more value)
 *   deficitCandidates - Assets on the deficit roster NOT yet in the trade
 *   deficitItems      - Assets currently in the trade on the deficit side
 *   surplusItems      - Assets currently in the trade on the surplus side
 *   surplusCandidates - Assets on the surplus roster NOT yet in the trade
 *
 * Each returned option has:
 *   action  - 'add' | 'remove' | 'swap'
 *   side    - 'yours' | 'theirs'  (which side the action targets)
 *   items   - array of assets (for add/remove; for swap, the item being removed)
 *   remove  - (swap only) item to remove
 *   add     - (swap only) item to add
 *   newGap  - gap remaining after this action (negative = over-corrected)
 */
export function suggestPackage({ gap, deficitSide, deficitCandidates, deficitItems, surplusItems, surplusCandidates }) {
  if (gap <= 0) return [];

  const surplusSide = deficitSide === 'yours' ? 'theirs' : 'yours';
  const results = [];

  // Deduplicate: track suggestion fingerprints already added
  const seen = new Set();
  const dedup = (key, fn) => { if (!seen.has(key)) { seen.add(key); fn(); } };

  // ── ADD to deficit side ────────────────────────────────────────────────────
  const addPool = (deficitCandidates ?? [])
    .filter(c => c.val != null && c.val > 0)
    .sort((a, b) => b.val - a.val);

  // A: Closest single asset
  let bestSingle = null, bestSingleDist = Infinity;
  for (const c of addPool) {
    const dist = Math.abs(c.val - gap);
    if (dist < bestSingleDist && c.val >= gap * 0.75) {
      bestSingle = c;
      bestSingleDist = dist;
    }
  }
  if (bestSingle) {
    dedup(`add:${bestSingle.id}`, () => results.push({
      action: 'add', side: deficitSide,
      items: [bestSingle], newGap: gap - bestSingle.val,
    }));
  }

  // B: Greedy multi-asset (combine assets to fill 85–115% of gap)
  const greedyItems = [];
  let greedyTotal = 0;
  for (const c of addPool) {
    if (greedyTotal >= gap * 1.15) break;
    if (greedyTotal + c.val <= gap * 1.15) { greedyItems.push(c); greedyTotal += c.val; }
  }
  if (greedyItems.length > 1 && greedyTotal >= gap * 0.85) {
    const key = `add:${greedyItems.map(i => i.id).sort().join(',')}`;
    dedup(key, () => results.push({
      action: 'add', side: deficitSide,
      items: greedyItems, newGap: gap - greedyTotal,
    }));
  }

  // C: Pick-heavy add (prefer draft picks)
  const pickFirst = [...addPool].sort((a, b) => {
    if (a.type === 'pick' && b.type !== 'pick') return -1;
    if (a.type !== 'pick' && b.type === 'pick') return 1;
    return b.val - a.val;
  });
  const pickItems = []; let pickTotal = 0;
  for (const c of pickFirst) {
    if (pickTotal >= gap * 1.15) break;
    if (pickTotal + c.val <= gap * 1.15) { pickItems.push(c); pickTotal += c.val; }
  }
  if (pickItems.length > 0 && pickTotal >= gap * 0.85) {
    const key = `add:${pickItems.map(i => i.id).sort().join(',')}`;
    dedup(key, () => results.push({
      action: 'add', side: deficitSide,
      items: pickItems, newGap: gap - pickTotal,
    }));
  }

  // ── REMOVE from surplus side ───────────────────────────────────────────────
  // Find a surplus-side item whose removal brings the gap closest to 0
  const surplusPool = (surplusItems ?? [])
    .filter(it => it.val != null && it.val > 0)
    .sort((a, b) => Math.abs(a.val - gap) - Math.abs(b.val - gap));

  for (const item of surplusPool) {
    const newGap = gap - item.val;
    // Accept if it meaningfully closes gap and doesn't over-correct by more than 25%
    if (Math.abs(newGap) < gap && (newGap >= 0 || Math.abs(newGap) <= gap * 0.25)) {
      dedup(`remove:${item.id}`, () => results.push({
        action: 'remove', side: surplusSide,
        items: [item], newGap,
      }));
      break;
    }
  }

  // ── SWAP on surplus side (downgrade a surplus item) ────────────────────────
  const surplusItemsPool = (surplusItems ?? [])
    .filter(it => it.val != null && it.val > 0)
    .sort((a, b) => b.val - a.val);
  const surplusCandPool = (surplusCandidates ?? [])
    .filter(c => c.val != null && c.val > 0);

  let bestSurplusSwap = null, bestSurplusSwapDist = Infinity;
  for (const x of surplusItemsPool) {
    for (const z of surplusCandPool) {
      if (z.val >= x.val) continue;          // must be a downgrade
      if (z.type === x.type && z.type === 'pick') continue; // pick-for-pick swap rarely helpful
      const newGap = gap - x.val + z.val;
      const dist = Math.abs(newGap);
      if (dist < bestSurplusSwapDist && (newGap >= -gap * 0.25)) {
        bestSurplusSwapDist = dist;
        bestSurplusSwap = { remove: x, add: z, newGap };
      }
    }
  }
  if (bestSurplusSwap && bestSurplusSwapDist < gap * 0.9) {
    const key = `swap:${bestSurplusSwap.remove.id}:${bestSurplusSwap.add.id}`;
    dedup(key, () => results.push({
      action: 'swap', side: surplusSide,
      remove: bestSurplusSwap.remove, add: bestSurplusSwap.add,
      items: [bestSurplusSwap.remove], newGap: bestSurplusSwap.newGap,
    }));
  }

  // ── SWAP on deficit side (upgrade a deficit item) ──────────────────────────
  const deficitItemsPool = (deficitItems ?? [])
    .filter(it => it.val != null && it.val > 0)
    .sort((a, b) => a.val - b.val);
  const deficitCandPool = (deficitCandidates ?? [])
    .filter(c => c.val != null && c.val > 0);

  let bestDeficitSwap = null, bestDeficitSwapDist = Infinity;
  for (const x of deficitItemsPool) {
    for (const z of deficitCandPool) {
      if (z.val <= x.val) continue;          // must be an upgrade
      if (z.type === x.type && z.type === 'pick') continue;
      const newGap = gap - (z.val - x.val);
      const dist = Math.abs(newGap);
      if (dist < bestDeficitSwapDist && (newGap >= -gap * 0.25)) {
        bestDeficitSwapDist = dist;
        bestDeficitSwap = { remove: x, add: z, newGap };
      }
    }
  }
  if (bestDeficitSwap && bestDeficitSwapDist < gap * 0.9) {
    const key = `swap:${bestDeficitSwap.remove.id}:${bestDeficitSwap.add.id}`;
    dedup(key, () => results.push({
      action: 'swap', side: deficitSide,
      remove: bestDeficitSwap.remove, add: bestDeficitSwap.add,
      items: [bestDeficitSwap.remove], newGap: bestDeficitSwap.newGap,
    }));
  }

  // Sort: closest remaining gap first, then fewest assets touched
  results.sort((a, b) => {
    const da = Math.abs(a.newGap), db = Math.abs(b.newGap);
    if (da !== db) return da - db;
    return (a.action === 'add' ? (a.items?.length ?? 1) : 1) -
           (b.action === 'add' ? (b.items?.length ?? 1) : 1);
  });

  return results.slice(0, 4);
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
  sleeperPlayers, ktcPlayers, leagueType, rosterPicks, slots, pickValueMap, currentSeason,
  { dynastyKtcPlayers, seasonStats, scoringSettings, positionalValuePerPPG, positionalAvgPPG, rankMap, idpValueMap, playerTradeValueDetailsMap, league = null, drafts = [] } = {},
) {
  const candidates = [];
  const roster = rosters.find(r => String(r.roster_id) === String(rosterId));
  if (!roster) return candidates;

  // Player candidates
  const playerIds = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
  const excludeSet = new Set(excludeIds);
  for (const pid of playerIds) {
    if (excludeSet.has(pid)) continue;
    const sp = sleeperPlayers?.[pid];
    const sharedTradeValue = playerTradeValueDetailsMap?.get(pid) ?? null;
    let val = sharedTradeValue?.value ?? null;
    const pos = sp?.position ?? '';

    if (val == null) {
      const detail = computeTradePlayerValueDetail({
        id: pid,
        players: sleeperPlayers,
        adjustedKtcPlayers: ktcPlayers,
        adjustedDynastyKtcPlayers: dynastyKtcPlayers,
        leagueType,
        seasonStats,
        scoringSettings,
        positionalAvgPPG,
        positionalValuePerPPG,
        rankMap,
        mergedIDPMap: idpValueMap,
        blendWeight: 0.50,
      });
      if (detail) {
        val = detail.value;
      }
    }

    candidates.push({
      id: pid,
      label: sp?.full_name ?? pid,
      position: pos,
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
    const { val, displayInfo, quality, valueQuality } = valueDraftPick(pick, {
      rosters,
      ktcPlayers,
      leagueType,
      pickValueMap,
      currentSeason,
      league,
      drafts,
    });
    candidates.push({
      id: pick.key,
      label: displayInfo.label,
      val,
      type: 'pick',
      pickData: pick,
      year: pick.year,
      round: pick.round,
      quality,
      valueQuality,
      displayMode: displayInfo.displayMode,
      lockedSlot: displayInfo.lockedSlot ?? null,
      pickNumberLabel: displayInfo.pickNumberLabel ?? null,
      pickRangeLabel: displayInfo.pickRangeLabel ?? null,
      cardHeadline: displayInfo.cardHeadline ?? null,
      cardMetaLabel: displayInfo.cardMetaLabel ?? null,
      sortSlot: displayInfo.sortSlot ?? null,
    });
  }

  return candidates;
}
