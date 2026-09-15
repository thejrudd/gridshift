// playerNameIndex.js — the shared name→player index used to attach real players
// to play-by-play text. Play descriptions name people three different ways
// ("Saquon Barkley", "S.Barkley", "Barkley"), so the index stores every variant
// and drops the ones that would be ambiguous.
//
// Generalized out of livePlaysFeed.buildStarterNameIndex so Statistics Scores
// and Fantasy Live can share one implementation. The normalizer is injectable
// because Fantasy Live's existing matching runs on liveScoringFeed.normalizeName,
// which does not strip generational suffixes; new callers should take the
// default.

/**
 * Lowercase, strip diacritics and generational suffixes, reduce to single
 * spaces. "Adoree' Jackson" and "Nolan Smith Jr." both normalize to the form
 * play text will produce.
 */
export function normalizePlayerName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TEAM_DEFENSE_POSITIONS = new Set(['DEF', 'DST', 'D/ST']);

export function isTeamDefensePosition(position) {
  return TEAM_DEFENSE_POSITIONS.has(String(position ?? '').toUpperCase());
}

/**
 * Every way a play description might name this person.
 *
 * The bare last name is included but callers must drop it when two people in
 * the game share it — "Smith" alone can't be attributed, while "T.Smith" can.
 */
export function getNameVariants(normalizedName) {
  const parts = String(normalizedName ?? '').split(' ').filter(Boolean);
  if (parts.length === 0) return [];
  const full = parts.join(' ');
  if (parts.length < 2) return [full];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return [
    full,
    `${first[0]} ${last}`, // "s barkley" — matches "S. Barkley"
    `${first[0]}${last}`, // "sbarkley" — matches "S.Barkley", no space
    last,
  ];
}

/**
 * Index of players by name variant.
 *
 * `entries` are `{ id, name, team, position }`. Returns `index` (variant →
 * owning ids), `meta` (id → record), and `teamDefenseIds` (team → ids of its
 * team-defense entries), matching the shape livePlaysFeed already consumes.
 *
 * Ambiguous bare last names are dropped entirely; longer variants keep every
 * owner and rely on the caller's team cross-check to disambiguate.
 */
export function buildPlayerNameIndex(entries, { normalize = normalizePlayerName } = {}) {
  const variantOwners = new Map();
  const meta = new Map();
  const teamDefenseIds = new Map();

  (entries ?? []).forEach((entry) => {
    if (!entry || entry.id == null) return;
    const team = entry.team ?? null;
    const position = String(entry.position ?? '').toUpperCase();
    const normalized = normalize(entry.name);
    meta.set(entry.id, { ...entry, team, position, normalizedName: normalized });

    if (isTeamDefensePosition(position) && team) {
      const owners = teamDefenseIds.get(team) ?? new Set();
      owners.add(entry.id);
      teamDefenseIds.set(team, owners);
    }

    getNameVariants(normalized).forEach((variant) => {
      const owners = variantOwners.get(variant) ?? new Set();
      owners.add(entry.id);
      variantOwners.set(variant, owners);
    });
  });

  const index = new Map();
  variantOwners.forEach((owners, variant) => {
    if (owners.size > 1 && !variant.includes(' ')) return;
    index.set(variant, [...owners]);
  });
  return { index, meta, teamDefenseIds };
}

/**
 * The single player a name refers to, or null when the name is unknown or
 * still ambiguous after the team cross-check.
 *
 * `name` may be full ("Saquon Barkley") or abbreviated ("S.Barkley") — both
 * normalize onto indexed variants.
 */
export function lookupPlayerByName(nameIndex, name, { team = null, normalize = normalizePlayerName } = {}) {
  if (!nameIndex?.index) return null;
  const normalized = normalize(name);
  if (!normalized) return null;

  const parts = normalized.split(' ').filter(Boolean);
  const candidateKeys = parts.length >= 2
    ? [normalized, `${parts[0][0]} ${parts[parts.length - 1]}`, `${parts[0][0]}${parts[parts.length - 1]}`]
    : [normalized];

  // Whether the caller supplied a full first name rather than a bare initial
  // ("Javonte Williams" vs "J.Williams"), read off the raw string's own
  // punctuation/whitespace rather than the normalized one. The two
  // `normalize` implementations in use disagree on what "A.St. Brown" does
  // to its first token — normalizePlayerName's blanket non-alnum collapse
  // keeps "a" and "st" apart, while normalizeName deletes periods outright
  // and merges them into "ast" — so the normalized string can't tell a real
  // multi-letter first name from an initial glued to the next word by a
  // provider's "A.St." abbreviation. The raw text can.
  const rawFirstToken = String(name ?? '').trim().split(/[.\s]+/).filter(Boolean)[0] ?? '';
  const fullFirstNameGiven = rawFirstToken.length > 1;
  const normalizedFirstToken = fullFirstNameGiven
    ? (normalize(rawFirstToken).split(' ').filter(Boolean)[0] ?? '')
    : '';

  for (const key of candidateKeys) {
    const owners = nameIndex.index.get(key);
    if (!owners?.length) continue;
    let records = owners.map((id) => nameIndex.meta.get(id)).filter(Boolean);
    if (team) {
      // Drop candidates that are known to be on a different team. Records
      // with no team on file stay eligible — we have no basis to exclude
      // them, and excluding them would make a genuinely unambiguous match
      // disappear just because roster data is incomplete.
      records = records.filter((record) => !record.team || record.team === team);
    }
    // A fallback key built from just the first initial (every key after the
    // exact full-name key) can be shared by two teammates with different
    // first names and the same initial and last name — "Javonte Williams"
    // and "Jameson Williams" both produce "j williams". When the caller gave
    // a full first name, only keep a candidate whose own first name is
    // actually consistent with it: equal, or one a prefix of the other (a
    // hyphenated first name like "Amon-Ra" normalizes to two tokens, "amon
    // ra", one more than a plain comparison expects).
    if (fullFirstNameGiven && key !== normalized && normalizedFirstToken) {
      records = records.filter((record) => {
        const candidateFirstToken = String(record.normalizedName ?? '').split(' ').filter(Boolean)[0] ?? '';
        if (!candidateFirstToken) return true;
        return candidateFirstToken === normalizedFirstToken
          || candidateFirstToken.startsWith(normalizedFirstToken)
          || normalizedFirstToken.startsWith(candidateFirstToken);
      });
    }
    if (records.length === 1) return records[0];
    return null;
  }
  return null;
}
