// ── ESPN Smart Search Parser ───────────────────────────────────────────────
// Token-based approach: split query into words, match phrases against word
// sequences. Multi-word phrases (longer word count) tried before single words.
// Team IDs match the lowercase of nfl-data-2026.json's team.id values.

export const SEARCH_PATTERNS = [
  // ── Positions — multi-word ───────────────────────────────────────────────────
  ['running back',        { type: 'pos', val: 'RB' }],
  ['wide receiver',       { type: 'pos', val: 'WR' }],
  ['tight end',           { type: 'pos', val: 'TE' }],
  ['offensive lineman',   { type: 'pos', val: 'OL' }],
  ['offensive tackle',    { type: 'pos', val: 'OL' }],
  ['offensive guard',     { type: 'pos', val: 'OL' }],
  ['offensive line',      { type: 'pos', val: 'OL' }],
  ['outside linebacker',  { type: 'pos', val: 'LB' }],
  ['inside linebacker',   { type: 'pos', val: 'LB' }],
  ['middle linebacker',   { type: 'pos', val: 'LB' }],
  ['defensive lineman',   { type: 'pos', val: 'DL' }],
  ['defensive tackle',    { type: 'pos', val: 'DL' }],
  ['defensive end',       { type: 'pos', val: 'DL' }],
  ['defensive line',      { type: 'pos', val: 'DL' }],
  ['defensive back',      { type: 'pos', val: 'DB' }],
  ['nose tackle',         { type: 'pos', val: 'DL' }],
  ['strong safety',       { type: 'pos', val: 'DB' }],
  ['free safety',         { type: 'pos', val: 'DB' }],
  ['place kicker',        { type: 'pos', val: 'K'  }],
  // ── Positions — plurals / variants ──────────────────────────────────────────
  ['quarterbacks',        { type: 'pos', val: 'QB' }],
  ['running backs',       { type: 'pos', val: 'RB' }],
  ['wide receivers',      { type: 'pos', val: 'WR' }],
  ['tight ends',          { type: 'pos', val: 'TE' }],
  // ── Positions — single-word ──────────────────────────────────────────────────
  ['quarterback', { type: 'pos', val: 'QB' }],
  ['linebacker',  { type: 'pos', val: 'LB' }],
  ['cornerback',  { type: 'pos', val: 'DB' }],
  ['halfback',    { type: 'pos', val: 'RB' }],
  ['fullback',    { type: 'pos', val: 'RB' }],
  ['receiver',    { type: 'pos', val: 'WR' }],
  ['receivers',   { type: 'pos', val: 'WR' }],
  ['wideout',     { type: 'pos', val: 'WR' }],
  ['wideouts',    { type: 'pos', val: 'WR' }],
  ['lineman',     { type: 'pos', val: 'OL' }],
  ['safety',      { type: 'pos', val: 'DB' }],
  ['kicker',      { type: 'pos', val: 'K'  }],
  ['kickers',     { type: 'pos', val: 'K'  }],
  ['punter',      { type: 'pos', val: 'P'  }],
  ['corner',      { type: 'pos', val: 'DB' }],
  ['tackle',      { type: 'pos', val: 'OL' }],
  ['guard',       { type: 'pos', val: 'OL' }],
  ['center',      { type: 'pos', val: 'OL' }],
  ['backs',       { type: 'pos', val: 'RB' }],
  // abbreviations — safe because token-based (won't match inside longer words)
  ['olb',  { type: 'pos', val: 'LB' }],
  ['ilb',  { type: 'pos', val: 'LB' }],
  ['mlb',  { type: 'pos', val: 'LB' }],
  ['qbs',  { type: 'pos', val: 'QB' }],
  ['rbs',  { type: 'pos', val: 'RB' }],
  ['wrs',  { type: 'pos', val: 'WR' }],
  ['tes',  { type: 'pos', val: 'TE' }],
  ['qb',   { type: 'pos', val: 'QB' }],
  ['rb',   { type: 'pos', val: 'RB' }],
  ['wr',   { type: 'pos', val: 'WR' }],
  ['te',   { type: 'pos', val: 'TE' }],
  ['ol',   { type: 'pos', val: 'OL' }],
  ['dl',   { type: 'pos', val: 'DL' }],
  ['lb',   { type: 'pos', val: 'LB' }],
  ['db',   { type: 'pos', val: 'DB' }],
  ['de',   { type: 'pos', val: 'DL' }],
  ['dt',   { type: 'pos', val: 'DL' }],
  ['ot',   { type: 'pos', val: 'OL' }],
  ['og',   { type: 'pos', val: 'OL' }],
  ['cb',   { type: 'pos', val: 'DB' }],
  ['ss',   { type: 'pos', val: 'DB' }],
  ['fs',   { type: 'pos', val: 'DB' }],
  ['nt',   { type: 'pos', val: 'DL' }],
  ['k',    { type: 'pos', val: 'K'  }],
  ['p',    { type: 'pos', val: 'P'  }],
  // ── Divisions — must be tried before bare conference tokens ─────────────────
  ['afc east',  { type: 'div', val: 'AFC East'  }],
  ['afc north', { type: 'div', val: 'AFC North' }],
  ['afc south', { type: 'div', val: 'AFC South' }],
  ['afc west',  { type: 'div', val: 'AFC West'  }],
  ['nfc east',  { type: 'div', val: 'NFC East'  }],
  ['nfc north', { type: 'div', val: 'NFC North' }],
  ['nfc south', { type: 'div', val: 'NFC South' }],
  ['nfc west',  { type: 'div', val: 'NFC West'  }],
  ['afc',       { type: 'conf', val: 'AFC' }],
  ['nfc',       { type: 'conf', val: 'NFC' }],
  // ── Teams — 3-word full names ────────────────────────────────────────────────
  ['san francisco 49ers',  { type: 'team', val: 'sf'  }],
  ['new england patriots', { type: 'team', val: 'ne'  }],
  ['new york giants',      { type: 'team', val: 'nyg' }],
  ['new york jets',        { type: 'team', val: 'nyj' }],
  ['kansas city chiefs',   { type: 'team', val: 'kc'  }],
  ['las vegas raiders',    { type: 'team', val: 'lv'  }],
  ['los angeles chargers', { type: 'team', val: 'lac' }],
  ['los angeles rams',     { type: 'team', val: 'lar' }],
  ['green bay packers',    { type: 'team', val: 'gb'  }],
  ['new orleans saints',   { type: 'team', val: 'no'  }],
  ['tampa bay buccaneers', { type: 'team', val: 'tb'  }],
  // ── Teams — 2-word full names ────────────────────────────────────────────────
  ['buffalo bills',        { type: 'team', val: 'buf' }],
  ['miami dolphins',       { type: 'team', val: 'mia' }],
  ['baltimore ravens',     { type: 'team', val: 'bal' }],
  ['cincinnati bengals',   { type: 'team', val: 'cin' }],
  ['cleveland browns',     { type: 'team', val: 'cle' }],
  ['pittsburgh steelers',  { type: 'team', val: 'pit' }],
  ['houston texans',       { type: 'team', val: 'hou' }],
  ['indianapolis colts',   { type: 'team', val: 'ind' }],
  ['jacksonville jaguars', { type: 'team', val: 'jax' }],
  ['tennessee titans',     { type: 'team', val: 'ten' }],
  ['denver broncos',       { type: 'team', val: 'den' }],
  ['dallas cowboys',       { type: 'team', val: 'dal' }],
  ['philadelphia eagles',  { type: 'team', val: 'phi' }],
  ['washington commanders',{ type: 'team', val: 'wsh' }],
  ['chicago bears',        { type: 'team', val: 'chi' }],
  ['detroit lions',        { type: 'team', val: 'det' }],
  ['minnesota vikings',    { type: 'team', val: 'min' }],
  ['atlanta falcons',      { type: 'team', val: 'atl' }],
  ['carolina panthers',    { type: 'team', val: 'car' }],
  ['arizona cardinals',    { type: 'team', val: 'ari' }],
  ['seattle seahawks',     { type: 'team', val: 'sea' }],
  // ── Teams — 2-word cities (ambiguous: both teams for shared cities) ──────────
  ['new york',      { type: 'team', val: ['nyg', 'nyj'] }],
  ['los angeles',   { type: 'team', val: ['lac', 'lar'] }],
  ['la rams',       { type: 'team', val: 'lar' }],
  ['la chargers',   { type: 'team', val: 'lac' }],
  ['new england',   { type: 'team', val: 'ne'  }],
  ['kansas city',   { type: 'team', val: 'kc'  }],
  ['las vegas',     { type: 'team', val: 'lv'  }],
  ['green bay',     { type: 'team', val: 'gb'  }],
  ['new orleans',   { type: 'team', val: 'no'  }],
  ['san francisco', { type: 'team', val: 'sf'  }],
  ['tampa bay',     { type: 'team', val: 'tb'  }],
  // ── Teams — single-word cities ───────────────────────────────────────────────
  ['buffalo',      { type: 'team', val: 'buf' }],
  ['miami',        { type: 'team', val: 'mia' }],
  ['baltimore',    { type: 'team', val: 'bal' }],
  ['cincinnati',   { type: 'team', val: 'cin' }],
  ['cleveland',    { type: 'team', val: 'cle' }],
  ['pittsburgh',   { type: 'team', val: 'pit' }],
  ['houston',      { type: 'team', val: 'hou' }],
  ['indianapolis', { type: 'team', val: 'ind' }],
  ['jacksonville', { type: 'team', val: 'jax' }],
  ['tennessee',    { type: 'team', val: 'ten' }],
  ['denver',       { type: 'team', val: 'den' }],
  ['dallas',       { type: 'team', val: 'dal' }],
  ['philadelphia', { type: 'team', val: 'phi' }],
  ['washington',   { type: 'team', val: 'wsh' }],
  ['chicago',      { type: 'team', val: 'chi' }],
  ['detroit',      { type: 'team', val: 'det' }],
  ['minnesota',    { type: 'team', val: 'min' }],
  ['atlanta',      { type: 'team', val: 'atl' }],
  ['carolina',     { type: 'team', val: 'car' }],
  ['arizona',      { type: 'team', val: 'ari' }],
  ['seattle',      { type: 'team', val: 'sea' }],
  // ── Teams — nicknames ────────────────────────────────────────────────────────
  ['bills',      { type: 'team', val: 'buf' }],
  ['dolphins',   { type: 'team', val: 'mia' }],
  ['patriots',   { type: 'team', val: 'ne'  }],
  ['pats',       { type: 'team', val: 'ne'  }],
  ['jets',       { type: 'team', val: 'nyj' }],
  ['ravens',     { type: 'team', val: 'bal' }],
  ['bengals',    { type: 'team', val: 'cin' }],
  ['browns',     { type: 'team', val: 'cle' }],
  ['steelers',   { type: 'team', val: 'pit' }],
  ['texans',     { type: 'team', val: 'hou' }],
  ['colts',      { type: 'team', val: 'ind' }],
  ['jaguars',    { type: 'team', val: 'jax' }],
  ['jags',       { type: 'team', val: 'jax' }],
  ['titans',     { type: 'team', val: 'ten' }],
  ['broncos',    { type: 'team', val: 'den' }],
  ['chiefs',     { type: 'team', val: 'kc'  }],
  ['raiders',    { type: 'team', val: 'lv'  }],
  ['chargers',   { type: 'team', val: 'lac' }],
  ['cowboys',    { type: 'team', val: 'dal' }],
  ['giants',     { type: 'team', val: 'nyg' }],
  ['eagles',     { type: 'team', val: 'phi' }],
  ['commanders', { type: 'team', val: 'wsh' }],
  ['bears',      { type: 'team', val: 'chi' }],
  ['lions',      { type: 'team', val: 'det' }],
  ['packers',    { type: 'team', val: 'gb'  }],
  ['vikings',    { type: 'team', val: 'min' }],
  ['falcons',    { type: 'team', val: 'atl' }],
  ['panthers',   { type: 'team', val: 'car' }],
  ['saints',     { type: 'team', val: 'no'  }],
  ['buccaneers', { type: 'team', val: 'tb'  }],
  ['bucs',       { type: 'team', val: 'tb'  }],
  ['cardinals',  { type: 'team', val: 'ari' }],
  ['rams',       { type: 'team', val: 'lar' }],
  ['49ers',      { type: 'team', val: 'sf'  }],
  ['niners',     { type: 'team', val: 'sf'  }],
  ['seahawks',   { type: 'team', val: 'sea' }],
  // ── Teams — NFL abbreviations ──────────────────────────────────────────────
  ['ari', { type: 'team', val: 'ari' }],
  ['atl', { type: 'team', val: 'atl' }],
  ['bal', { type: 'team', val: 'bal' }],
  ['buf', { type: 'team', val: 'buf' }],
  ['car', { type: 'team', val: 'car' }],
  ['chi', { type: 'team', val: 'chi' }],
  ['cin', { type: 'team', val: 'cin' }],
  ['cle', { type: 'team', val: 'cle' }],
  ['dal', { type: 'team', val: 'dal' }],
  ['den', { type: 'team', val: 'den' }],
  ['det', { type: 'team', val: 'det' }],
  ['gb',  { type: 'team', val: 'gb'  }],
  ['hou', { type: 'team', val: 'hou' }],
  ['ind', { type: 'team', val: 'ind' }],
  ['jax', { type: 'team', val: 'jax' }],
  ['kc',  { type: 'team', val: 'kc'  }],
  ['lac', { type: 'team', val: 'lac' }],
  ['lar', { type: 'team', val: 'lar' }],
  ['lv',  { type: 'team', val: 'lv'  }],
  ['mia', { type: 'team', val: 'mia' }],
  ['min', { type: 'team', val: 'min' }],
  ['ne',  { type: 'team', val: 'ne'  }],
  ['no',  { type: 'team', val: 'no'  }],
  ['nyg', { type: 'team', val: 'nyg' }],
  ['nyj', { type: 'team', val: 'nyj' }],
  ['phi', { type: 'team', val: 'phi' }],
  ['pit', { type: 'team', val: 'pit' }],
  ['sea', { type: 'team', val: 'sea' }],
  ['sf',  { type: 'team', val: 'sf'  }],
  ['tb',  { type: 'team', val: 'tb'  }],
  ['ten', { type: 'team', val: 'ten' }],
  ['wsh', { type: 'team', val: 'wsh' }],
];

// Stopwords stripped before name matching (natural language support)
const STOPWORDS = new Set([
  'in','on','the','a','an','for','at','from','who','are','is','playing',
  'plays','play','with','and','or','my','our','their','us','them','me',
  'number','jersey',
]);

/**
 * Parse a free-text query into structured filters.
 *
 * Tokenizes by whitespace/punctuation, then at each word position tries the
 * longest matching phrase first (greedy, position-first). Stopwords are
 * consumed and ignored, enabling natural-language queries like "RBs in Detroit".
 * Unrecognized tokens become name search terms.
 *
 * AND logic between categories; OR within a category.
 * Returns { pos: Set, team: Set, div: Set, conf: Set, number: Set, name: string[] }
 */
export function parseSearchQuery(q) {
  const filters = {
    pos: new Set(),
    team: new Set(),
    div: new Set(),
    conf: new Set(),
    number: new Set(),
    name: [],
  };
  const words = q.toLowerCase().trim().split(/[\s,#+&]+/).filter(Boolean);
  if (!words.length) return filters;

  const consumed = new Array(words.length).fill(false);
  const MAX_PHRASE_LEN = 3; // "san francisco 49ers" is 3 words

  for (let i = 0; i < words.length; i++) {
    if (consumed[i]) continue;

    // Consume stopwords without adding to name[]
    if (STOPWORDS.has(words[i])) { consumed[i] = true; continue; }

    // Jersey numbers are not part of the phrase table because they are
    // player data rather than a fixed vocabulary. Accept both "29" and
    // "#29", including leading-zero forms such as "00".
    const jerseyNumber = normalizeJerseyNumber(words[i]);
    if (jerseyNumber) {
      consumed[i] = true;
      filters.number.add(jerseyNumber);
      continue;
    }

    // Try longest phrase starting at i, down to 1 word
    for (let len = Math.min(MAX_PHRASE_LEN, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ');
      const entry = SEARCH_PATTERNS.find(([pat]) => pat === phrase);
      if (entry) {
        const [, tag] = entry;
        for (let j = 0; j < len; j++) consumed[i + j] = true;
        const vals = Array.isArray(tag.val) ? tag.val : [tag.val];
        for (const v of vals) filters[tag.type].add(v);
        break;
      }
    }
  }

  // Unconsumed tokens with ≥2 chars become name search terms
  filters.name = words.filter((_, i) => !consumed[i] && words[i].length >= 2);
  return filters;
}

/**
 * Normalize an NFL jersey number for query/player comparison.
 * NFL jersey numbers are 0–99; leading zeroes are equivalent ("00" → "0").
 */
export function normalizeJerseyNumber(value) {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  if (!/^\d{1,2}$/.test(raw)) return '';

  const numeric = Number(raw);
  return numeric >= 0 && numeric <= 99 ? String(numeric) : '';
}

/**
 * Does a player jersey number match a parsed number filter.
 */
export function matchesJerseyNumber(playerNumber, filter) {
  const normalizedPlayerNumber = normalizeJerseyNumber(playerNumber);
  return Boolean(normalizedPlayerNumber) && normalizedPlayerNumber === String(filter);
}

/**
 * Does an ESPN position string match a filter group?
 * Used by both the Statistics player browser and the Compare tab.
 */
export function matchesFilter(position, filter) {
  if (filter === 'ALL') return true;
  if (filter === 'OL') return ['OT', 'OG', 'C', 'OL', 'G', 'T'].includes(position);
  if (filter === 'DL') return ['DE', 'DT', 'NT', 'DL', 'ED'].includes(position);
  if (filter === 'LB') return ['LB', 'ILB', 'OLB', 'MLB'].includes(position);
  if (filter === 'DB') return ['CB', 'S', 'SS', 'FS', 'DB'].includes(position);
  return position === filter;
}
