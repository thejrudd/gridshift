// ── KTC API Utility ───────────────────────────────────────────────────────────
// Fetches trade values from KeepTradeCut via a server-side proxy.
// KTC embeds player data as a JS variable in page HTML; we extract it via
// bracket counting (not regex) so nested arrays don't trip us up.
//
// Proxy endpoint: /ktc-proxy/* (nginx proxy_pass in prod, Vite dev proxy in dev).
// The proxy strips the Origin/Referer headers so KTC's CORS block doesn't apply.

const CACHE = {};   // { dynasty: [...], redraft: [...] }
const PENDING = {}; // In-flight deduplication

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

  // 1. mflid — most reliable, bridges Sleeper ↔ KTC IDs directly
  if (sleeperPlayer?.mflid) {
    const mfl = String(sleeperPlayer.mflid);
    const byMfl = ktcPlayers.find(k => k.mflid && String(k.mflid) === mfl);
    if (byMfl) return byMfl;
  }

  const espnName = normName(espnPlayer.displayName);
  const espnPos  = espnPlayer.position?.toUpperCase() ?? '';

  // 2. Normalized name + position
  const byNamePos = ktcPlayers.find(
    k => normName(k.playerName) === espnName && k.position?.toUpperCase() === espnPos
  );
  if (byNamePos) return byNamePos;

  // 3. Normalized name only (handles position label differences e.g. FB vs RB)
  const byName = ktcPlayers.find(k => normName(k.playerName) === espnName) ?? null;

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

  // 1. mflid — authoritative bridge
  if (sp.mflid) {
    const mfl = String(sp.mflid);
    const byMfl = ktcPlayers.find(k => k.mflid && String(k.mflid) === mfl);
    if (byMfl) return byMfl;
  }

  // 2. Normalized name + position
  const name = normName(sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`);
  const pos  = sp.position?.toUpperCase() ?? '';

  const byNamePos = ktcPlayers.find(
    k => normName(k.playerName) === name && k.position?.toUpperCase() === pos
  );
  if (byNamePos) return byNamePos;

  // 3. Name only fallback
  return ktcPlayers.find(k => normName(k.playerName) === name) ?? null;
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

  // ── TE premium (bonus_rec_te) ─────────────────────────────────────────────
  // A 0.5pt TE premium raises elite TE value considerably; we apply a uniform
  // positional lift as a first-order approximation.
  const teBonus = scoringSettings.bonus_rec_te ?? 0;
  if (teBonus > 0) {
    mults.TE += teBonus * 0.40; // 0.5 bonus → +20%, 1.0 bonus → +40%
  }

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

// ── Draft pick matching ───────────────────────────────────────────────────────

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

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

  return null;
}
