// ── KTC API Utility ───────────────────────────────────────────────────────────
// Fetches trade values from KeepTradeCut via a server-side proxy.
// KTC embeds player data as a JS variable in page HTML; we extract it via
// bracket counting (not regex) so nested arrays don't trip us up.
//
// Proxy endpoint: /ktc-proxy/* (nginx proxy_pass in prod, Vite dev proxy in dev).
// The proxy strips the Origin/Referer headers so KTC's CORS block doesn't apply.

const CACHE = {};   // { dynasty: [...], redraft: [...] }
const PENDING = {}; // In-flight deduplication
const LOOKUP_CACHE = new WeakMap();

// ── Array extraction ──────────────────────────────────────────────────────────

/**
 * Extracts the playersArray value from KTC HTML using bracket counting.
 * Regex-only approaches fail when the array contains nested arrays.
 */
function extractPlayersArray(html) {
  // Find where the assignment starts
  let idx = html.indexOf('playersArray = [');
  if (idx === -1) idx = html.indexOf('playersArray=[');
  if (idx === -1) throw new Error('Could not find playersArray in KTC response');

  const arrayStart = html.indexOf('[', idx);
  if (arrayStart === -1) throw new Error('Could not find opening [ for playersArray');

  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }

    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '[') { depth++; continue; }
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        return JSON.parse(html.slice(arrayStart, i + 1));
      }
    }
  }

  throw new Error('Could not find matching ] for playersArray');
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all KTC player entries for a given format.
 * Results are cached for the session.
 */
export async function fetchKtcPlayers(format = 'dynasty') {
  if (CACHE[format]) return CACHE[format];
  if (PENDING[format]) return PENDING[format];

  const path = format === 'dynasty'
    ? '/ktc-proxy/dynasty-rankings'
    : '/ktc-proxy/fantasy-rankings';

  PENDING[format] = fetch(path, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`KTC proxy returned HTTP ${res.status}`);
      const html = await res.text();
      const players = extractPlayersArray(html);
      CACHE[format] = players;
      delete PENDING[format];
      return players;
    })
    .catch((err) => {
      delete PENDING[format];
      throw err;
    });

  return PENDING[format];
}

// ── Player matching ───────────────────────────────────────────────────────────

/**
 * Normalize a player name for fuzzy matching.
 * Strips suffixes (Jr, Sr, II–IV), removes punctuation, collapses whitespace.
 */
function normName(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '') // strip generational suffixes
    .replace(/['.,-]/g, '')                          // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function getKtcLookupTables(ktcPlayers) {
  if (!Array.isArray(ktcPlayers) || !ktcPlayers.length) {
    return { byMfl: new Map(), byName: new Map(), byNamePos: new Map() };
  }

  const cached = LOOKUP_CACHE.get(ktcPlayers);
  if (cached) return cached;

  const byMfl = new Map();
  const byName = new Map();
  const byNamePos = new Map();

  for (const player of ktcPlayers) {
    if (!player) continue;

    if (player.mflid != null) {
      const mfl = String(player.mflid);
      if (!byMfl.has(mfl)) byMfl.set(mfl, player);
    }

    const name = normName(player.playerName);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, player);

    const pos = player.position?.toUpperCase() ?? '';
    if (pos) {
      const namePosKey = `${name}|${pos}`;
      if (!byNamePos.has(namePosKey)) byNamePos.set(namePosKey, player);
    }
  }

  const lookup = { byMfl, byName, byNamePos };
  LOOKUP_CACHE.set(ktcPlayers, lookup);
  return lookup;
}

/**
 * Match an ESPN player object to a KTC player entry.
 *
 * Priority:
 *   1. mflid match (via Sleeper player — authoritative)
 *   2. Exact normalized name + position
 *   3. Normalized name only (position mismatch fallback)
 *
 * @param {object} espnPlayer    - ESPN player: { fullName, position, ... }
 * @param {Array}  ktcPlayers    - Array from fetchKtcPlayers()
 * @param {object} sleeperPlayer - Sleeper player object (may have .mflid)
 * @returns KTC player entry or null
 */
export function findKtcPlayer(espnPlayer, ktcPlayers, sleeperPlayer) {
  if (!espnPlayer || !ktcPlayers?.length) return null;
  const lookup = getKtcLookupTables(ktcPlayers);

  // 1. mflid — most reliable, bridges Sleeper ↔ KTC IDs directly
  if (sleeperPlayer?.mflid) {
    const mfl = String(sleeperPlayer.mflid);
    const byMfl = lookup.byMfl.get(mfl);
    if (byMfl) return byMfl;
  }

  const espnName = normName(espnPlayer.displayName);
  const espnPos  = espnPlayer.position?.toUpperCase() ?? '';

  // 2. Normalized name + position
  const byNamePos = lookup.byNamePos.get(`${espnName}|${espnPos}`);
  if (byNamePos) return byNamePos;

  // 3. Normalized name only (handles position label differences e.g. FB vs RB)
  const byName = lookup.byName.get(espnName) ?? null;

  return byName;
}

// ── Value accessors ───────────────────────────────────────────────────────────

/**
 * Extract the numeric value (0–10,000) from a KTC player entry.
 * @param {object} ktcPlayer  - KTC player entry
 * @param {string} leagueType - '1qb' | 'sf'
 */
export function getKtcValue(ktcPlayer, leagueType = '1qb') {
  if (!ktcPlayer) return null;
  const vals = leagueType === 'sf' ? ktcPlayer.superflexValues : ktcPlayer.oneQBValues;
  return vals?.value ?? null;
}

/** Format a KTC value for display: 8450 → "8,450" */
export function fmtKtcValue(val) {
  if (val == null) return '—';
  return val.toLocaleString();
}

// ── Sleeper-native matching ───────────────────────────────────────────────────

/**
 * Match a Sleeper player directly to a KTC entry (no ESPN intermediary).
 * Used by the Trade Agent which works entirely with Sleeper roster data.
 *
 * @param {string} sleeperId      - Sleeper player ID
 * @param {object} sleeperPlayers - Full Sleeper players map { [id]: playerObj }
 * @param {Array}  ktcPlayers     - Array from fetchKtcPlayers()
 * @returns KTC player entry or null
 */
export function findKtcPlayerFromSleeper(sleeperId, sleeperPlayers, ktcPlayers) {
  const sp = sleeperPlayers?.[sleeperId];
  if (!sp || !ktcPlayers?.length) return null;
  const lookup = getKtcLookupTables(ktcPlayers);

  // 1. mflid — authoritative bridge
  if (sp.mflid) {
    const mfl = String(sp.mflid);
    const byMfl = lookup.byMfl.get(mfl);
    if (byMfl) return byMfl;
  }

  // 2. Normalized name + position
  const name = normName(sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`);
  const pos  = sp.position?.toUpperCase() ?? '';

  const byNamePos = lookup.byNamePos.get(`${name}|${pos}`);
  if (byNamePos) return byNamePos;

  // 3. Name only fallback
  return lookup.byName.get(name) ?? null;
}

// ── League-specific value adjustment ─────────────────────────────────────────

/**
 * Compute positional KTC value multipliers from a league's scoring settings.
 *
 * KTC dynasty consensus baseline assumptions:
 *   - ~0.5 PPR reception scoring
 *   - 4pt passing TDs
 *   - No TE premium
 *   - Standard single TE + 1–2 flex roster construction
 *
 * Multipliers are clamped to [0.80, 1.40] to prevent wild distortion.
 *
 * @param {object} scoringSettings  - From useSleeper().scoringSettings
 * @param {Array}  rosterPositions  - league.roster_positions array
 * @returns {{ QB: number, RB: number, WR: number, TE: number }}
 */
export function computeKtcMultipliers(scoringSettings, rosterPositions) {
  const mults = { QB: 1, RB: 1, WR: 1, TE: 1 };
  if (!scoringSettings) return mults;

  // ── Reception scoring (baseline ≈ 0.5 rec/catch) ─────────────────────────
  // Full PPR (1.0) inflates WR value ~8-10% and RB value ~4-5% vs half-PPR.
  const rec = scoringSettings.rec ?? 0.5;
  const recDelta = rec - 0.5;
  if (recDelta !== 0) {
    mults.WR += recDelta * 0.16; // ±8% per full PPR step
    mults.RB += recDelta * 0.08; // ±4% per full PPR step
  }

  // ── Per-position reception bonuses ───────────────────────────────────────
  // bonus_rec_te/rb/wr are extra pts per catch for that position only, stacked
  // on top of the base rec value. KTC baseline has none of these.
  const teBonus = scoringSettings.bonus_rec_te ?? 0;
  const rbBonus = scoringSettings.bonus_rec_rb ?? 0;
  const wrBonus = scoringSettings.bonus_rec_wr ?? 0;
  if (teBonus > 0) mults.TE += teBonus * 0.40; // 0.25 → +10%, 0.5 → +20%
  if (rbBonus > 0) mults.RB += rbBonus * 0.10; // 0.5 → +5%, 1.0 → +10%
  if (wrBonus > 0) mults.WR += wrBonus * 0.12; // 0.25 → +3%, 0.5 → +6%

  // ── Per-carry bonus (bonus_rush_att) ──────────────────────────────────────
  // Rewards high-volume RBs; a 0.1 pt/carry bonus adds ~2 pts/game for a
  // 20-carry back, raising workhorse RB values relative to pass-catchers.
  const rushAttBonus = scoringSettings.bonus_rush_att ?? 0;
  if (rushAttBonus > 0) mults.RB += rushAttBonus * 0.15; // 0.1 → +1.5%, 0.5 → +7.5%

  // ── Passing TD value (baseline = 4pts) ────────────────────────────────────
  const passTd = scoringSettings.pass_td ?? 4;
  if (passTd !== 4) {
    mults.QB += (passTd - 4) * 0.06; // 6pt TDs → QB +12%
  }

  // ── Interception penalty (baseline = -2 pts) ──────────────────────────────
  // Heavier INT penalties depress QB value since turnovers cost more.
  const passInt = scoringSettings.pass_int ?? -2;
  if (passInt < -2) {
    mults.QB += (passInt - (-2)) * 0.03; // each -1 beyond baseline → QB -3%
  }

  // ── Pick 6 penalty (baseline = 0, i.e. not scored separately) ─────────────
  // An extra penalty when a thrown INT is returned for a TD. Hurts turnover-prone QBs.
  const passIntTd = scoringSettings.pass_int_td ?? 0;
  if (passIntTd < 0) {
    mults.QB += passIntTd * 0.015; // -5 pts → QB -7.5%; rare event (~0.3 pick-6s/game for avg QB)
  }

  // ── Fumble lost penalty (baseline = -2 pts) ───────────────────────────────
  // Heavier fumble penalties hurt RBs (high-carry players) most.
  const fumLost = scoringSettings.fum_lost ?? -2;
  if (fumLost < -2) {
    mults.RB += (fumLost - (-2)) * 0.025; // each -1 beyond baseline → RB -2.5%
    mults.WR += (fumLost - (-2)) * 0.010; // smaller effect on WR/TE
  }

  // ── Big-play passing bonuses ──────────────────────────────────────────────
  // Leagues awarding bonuses for 300/400-yd passing games boost elite QB value.
  const bonusPassYd300 = scoringSettings.bonus_pass_yd_300 ?? 0;
  const bonusPassYd400 = scoringSettings.bonus_pass_yd_400 ?? 0;
  if (bonusPassYd300 > 0) mults.QB += bonusPassYd300 * 0.015; // 3pt bonus → +4.5%
  if (bonusPassYd400 > 0) mults.QB += bonusPassYd400 * 0.010;

  // ── Big-play rushing bonuses ──────────────────────────────────────────────
  // 100/200-yd rushing game bonuses reward workhorse RBs with volume.
  const bonusRushYd100 = scoringSettings.bonus_rush_yd_100 ?? 0;
  const bonusRushYd200 = scoringSettings.bonus_rush_yd_200 ?? 0;
  if (bonusRushYd100 > 0) mults.RB += bonusRushYd100 * 0.015;
  if (bonusRushYd200 > 0) mults.RB += bonusRushYd200 * 0.010;

  // ── Big-play receiving bonuses ────────────────────────────────────────────
  // 100/200-yd receiving game bonuses lift high-target WRs and elite TEs.
  const bonusRecYd100 = scoringSettings.bonus_rec_yd_100 ?? 0;
  const bonusRecYd200 = scoringSettings.bonus_rec_yd_200 ?? 0;
  if (bonusRecYd100 > 0) {
    mults.WR += bonusRecYd100 * 0.012;
    mults.TE += bonusRecYd100 * 0.008;
  }
  if (bonusRecYd200 > 0) {
    mults.WR += bonusRecYd200 * 0.008;
    mults.TE += bonusRecYd200 * 0.005;
  }

  // ── Big-play TD / completion bonuses ─────────────────────────────────────
  // Leagues rewarding 40/50-yd TDs or completions lift explosive players.
  // QBs who throw them, WRs/TEs who catch them, RBs who run them all benefit.
  // Frequency: elite QB ~3-5 deep TDs/season; top WR ~2-4 big catches/game; RB rare.
  const bonusPassTd40p  = scoringSettings.bonus_pass_td_40p  ?? 0;
  const bonusPassTd50p  = scoringSettings.bonus_pass_td_50p  ?? 0;
  const bonusPassCmp40p = scoringSettings.bonus_pass_cmp_40p ?? 0;
  const bonusRushTd40p  = scoringSettings.bonus_rush_td_40p  ?? 0;
  const bonusRushTd50p  = scoringSettings.bonus_rush_td_50p  ?? 0;
  const bonusRecTd40p   = scoringSettings.bonus_rec_td_40p   ?? 0;
  const bonusRecTd50p   = scoringSettings.bonus_rec_td_50p   ?? 0;
  const bonusRec40p     = scoringSettings.bonus_rec_40p      ?? 0;
  const bonusRush40p    = scoringSettings.bonus_rush_40p     ?? 0;

  if (bonusPassTd40p > 0)  mults.QB += bonusPassTd40p  * 0.015; // 2pt bonus → +3%
  if (bonusPassTd50p > 0)  mults.QB += bonusPassTd50p  * 0.010;
  if (bonusPassCmp40p > 0) mults.QB += bonusPassCmp40p * 0.008; // ~4 deep comps/game for elite QBs
  if (bonusRushTd40p > 0)  mults.RB += bonusRushTd40p  * 0.012; // rare; speed backs benefit most
  if (bonusRushTd50p > 0)  mults.RB += bonusRushTd50p  * 0.008;
  if (bonusRecTd40p > 0) { mults.WR += bonusRecTd40p * 0.015; mults.TE += bonusRecTd40p * 0.008; }
  if (bonusRecTd50p > 0) { mults.WR += bonusRecTd50p * 0.010; mults.TE += bonusRecTd50p * 0.005; }
  if (bonusRec40p > 0)   { mults.WR += bonusRec40p   * 0.020; mults.TE += bonusRec40p   * 0.010; } // ~2-4 big plays/game for top WRs
  if (bonusRush40p > 0)    mults.RB += bonusRush40p   * 0.015; // speed/breakaway backs benefit

  // ── First down bonuses ────────────────────────────────────────────────────
  // First-down points reward high-volume, efficient players who convert.
  const rushFd = scoringSettings.rush_fd ?? 0;
  const recFd  = scoringSettings.rec_fd  ?? 0;
  if (rushFd > 0) mults.RB += rushFd * 0.04; // 0.25/FD → +1%
  if (recFd  > 0) {
    mults.WR += recFd * 0.04;
    mults.TE += recFd * 0.03;
  }

  // ── Positional scarcity from roster construction ───────────────────────────
  // Extra starting TE or RB slots increase demand beyond the KTC baseline.
  if (rosterPositions?.length) {
    const counts = {};
    for (const p of rosterPositions) counts[p] = (counts[p] ?? 0) + 1;
    if ((counts.TE ?? 0) >= 2) mults.TE *= 1.12;  // 2+ TE starters
    if ((counts.RB ?? 0) >= 3) mults.RB *= 1.06;  // 3+ RB starters
    if ((counts.WR ?? 0) >= 4) mults.WR *= 1.05;  // 4+ WR starters
  }

  // Clamp to prevent extreme distortion
  for (const pos of Object.keys(mults)) {
    mults[pos] = Math.max(0.80, Math.min(1.40, mults[pos]));
  }

  return mults;
}

/**
 * Apply positional multipliers to a full KTC players array.
 * Returns a new array with `oneQBValues.value` and `superflexValues.value`
 * pre-adjusted so all downstream code sees league-tuned numbers without
 * any signature changes.
 *
 * Draft picks (position === 'RDP') are not adjusted — pick values are
 * determined by round/year consensus and aren't meaningfully affected by
 * per-play scoring settings.
 *
 * @param {Array}  ktcPlayers  - Raw array from fetchKtcPlayers()
 * @param {object} multipliers - From computeKtcMultipliers()
 * @returns Array
 */
export function applyKtcMultipliers(ktcPlayers, multipliers) {
  if (!ktcPlayers?.length || !multipliers) return ktcPlayers;

  return ktcPlayers.map(k => {
    if (k.position === 'RDP') return k; // never adjust pick values
    const pos = k.position?.toUpperCase();
    const mult = multipliers[pos] ?? 1;
    if (mult === 1) return k;

    const adj = v => (v != null ? Math.round(v * mult) : v);
    return {
      ...k,
      oneQBValues:     k.oneQBValues     ? { ...k.oneQBValues,     value: adj(k.oneQBValues.value)     } : k.oneQBValues,
      superflexValues: k.superflexValues ? { ...k.superflexValues, value: adj(k.superflexValues.value) } : k.superflexValues,
    };
  });
}

/**
 * Adjust a raw KTC value by blending in a per-player production factor.
 * Players above their positional PPG average are boosted; below-average are reduced.
 * Players without stats (rookies, IR, no games played) return ktcVal unchanged.
 *
 * @param {number} ktcVal           - Base KTC value (post scoring-setting multipliers)
 * @param {number|null} avgPPG      - Player's average PPG this season (null = no stats)
 * @param {number|null} positionalAvgPPG - League avg PPG for this position (null = skip)
 * @param {number} blendWeight      - 0–1; how much production drives the adjustment (default 0.35)
 * @returns {number}
 */
export function productionAdjustedValue(ktcVal, avgPPG, positionalAvgPPG, blendWeight = 0.35) {
  if (!ktcVal || avgPPG == null || !positionalAvgPPG) return ktcVal ?? null;
  const factor = avgPPG / positionalAvgPPG;
  const mult = Math.max(0.80, Math.min(1.40, (1 - blendWeight) + blendWeight * factor));
  return Math.round(ktcVal * mult);
}

// ── Draft pick matching ───────────────────────────────────────────────────────

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th', 10: '10th' };

// Decay factors for rounds beyond what KTC explicitly lists.
// Round 4 = ~25% of a Mid 3rd, round 5 = ~12%, round 6+ = ~5%.
const LATE_ROUND_DECAY = { 4: 0.25, 5: 0.12 };
const LATE_ROUND_DEFAULT_DECAY = 0.05;

/**
 * Find a KTC draft pick entry matching a specific year/round/quality.
 * KTC stores picks as entries with position "RDP" and names like "2026 Mid 1st".
 *
 * @param {string|number} year       - Draft year (e.g., 2026)
 * @param {number}        round      - Round number (1, 2, 3, ...)
 * @param {string}        quality    - "Early" | "Mid" | "Late"
 * @param {Array}         ktcPlayers - Array from fetchKtcPlayers()
 * @returns KTC player entry or null
 */
export function findKtcDraftPick(year, round, quality, ktcPlayers) {
  if (!ktcPlayers?.length) return null;

  const yr  = String(year);
  const ord = ORDINALS[round] ?? `${round}th`;
  const q   = (quality ?? 'Mid').toLowerCase();

  // Candidates: RDP position, or any entry whose name looks like a pick
  // (contains both a year and a round ordinal). This handles KTC variants
  // that may use different position strings.
  const rdp = ktcPlayers.filter(k =>
    k.position === 'RDP' ||
    (k.playerName?.includes(yr) && k.playerName?.toLowerCase().includes(ord.toLowerCase()))
  );

  // 1. Exact: year + quality + round
  const exact = rdp.find(k => {
    const n = k.playerName?.toLowerCase() ?? '';
    return n.includes(yr) && n.includes(q) && n.includes(ord.toLowerCase());
  });
  if (exact) return exact;

  // 2. Loose: year + round, any quality — try adjacent qualities if exact fails
  const loose = rdp.find(k => {
    const n = k.playerName?.toLowerCase() ?? '';
    return n.includes(yr) && n.includes(ord.toLowerCase());
  });
  if (loose) return loose;

  // 3. Round only — for years beyond KTC's range, use the closest available year
  const altQualities = ['mid', 'early', 'late'].filter(x => x !== q);
  for (const alt of altQualities) {
    const byAlt = rdp.find(k => {
      const n = k.playerName?.toLowerCase() ?? '';
      return n.includes(alt) && n.includes(ord.toLowerCase());
    });
    if (byAlt) return byAlt;
  }

  // 4. Late-round synthetic fallback (rounds 4+): KTC doesn't publish values for
  //    these rounds. Estimate by scaling a mid-3rd pick down by a decay factor.
  if (round >= 4) {
    const anchor = rdp.find(k => {
      const n = k.playerName?.toLowerCase() ?? '';
      return n.includes('mid') && n.includes('3rd');
    }) ?? rdp.find(k => {
      const n = k.playerName?.toLowerCase() ?? '';
      return n.includes('3rd');
    });
    if (anchor) {
      const factor = LATE_ROUND_DECAY[round] ?? LATE_ROUND_DEFAULT_DECAY;
      const scale = v => Math.round((v ?? 0) * factor);
      const ord2 = ORDINALS[round] ?? `${round}th`;
      return {
        ...anchor,
        playerName: `${year} ${quality} ${ord2}`,
        isSynthetic: true,
        oneQBValues: anchor.oneQBValues
          ? { ...anchor.oneQBValues, value: scale(anchor.oneQBValues.value) }
          : anchor.oneQBValues,
        superflexValues: anchor.superflexValues
          ? { ...anchor.superflexValues, value: scale(anchor.superflexValues.value) }
          : anchor.superflexValues,
      };
    }
  }

  return null;
}
