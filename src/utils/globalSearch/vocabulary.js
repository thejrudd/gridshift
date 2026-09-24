// ── GridShift search vocabulary ─────────────────────────────────────────────
// Single source of truth for every fixed phrase the search parsers recognize.
//
// SEARCH_PATTERNS (teams, positions, divisions, conferences) is the original
// ESPN smart-search table, moved here from parseSearchQuery.js so the player
// browser and global search share one vocabulary. parseSearchQuery.js re-exports
// it, so existing call sites are unaffected.
//
// GLOBAL_PATTERNS extends it with the vocabulary global search needs: stat keys,
// timeframes, superlatives, intents, and commands.
//
// Every entry is [phrase, { type, val }]. Phrases are lowercase and matched as
// whole word sequences, longest-first, so abbreviations never match inside a
// longer word. Team ids match the lowercase of nfl-data-2026.json team.id values.

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
  // The fantasy team-defense unit, as distinct from the defenders on it. A
  // defensive stat means the players who recorded it unless the query names
  // this, so without a way to say it there was no way to ask for a team total.
  ['team defense',        { type: 'pos', val: 'DEF' }],
  ['team defenses',       { type: 'pos', val: 'DEF' }],
  ['nose tackle',         { type: 'pos', val: 'DL' }],
  ['strong safety',       { type: 'pos', val: 'DB' }],
  ['free safety',         { type: 'pos', val: 'DB' }],
  ['place kicker',        { type: 'pos', val: 'K'  }],
  // ── Positions — plurals / variants ──────────────────────────────────────────
  ['quarterbacks',        { type: 'pos', val: 'QB' }],
  ['dst',                 { type: 'pos', val: 'DEF' }],
  ['d/st',                { type: 'pos', val: 'DEF' }],
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

// ── Stat keys ───────────────────────────────────────────────────────────────
// `val` is the canonical key answer resolvers switch on. Bare "yards" and
// "touchdowns" are deliberately ambiguous — the resolver narrows them using the
// player's position rather than guessing here.
export const STAT_PATTERNS = [
  ['passing yards',    { type: 'stat', val: 'pass_yd'  }],
  ['pass yards',       { type: 'stat', val: 'pass_yd'  }],
  ['passing tds',      { type: 'stat', val: 'pass_td'  }],
  ['passing touchdowns', { type: 'stat', val: 'pass_td' }],
  ['pass tds',         { type: 'stat', val: 'pass_td'  }],
  ['interceptions',    { type: 'stat', val: 'pass_int' }],
  ['completions',      { type: 'stat', val: 'pass_cmp' }],
  ['attempts',         { type: 'stat', val: 'pass_att' }],
  ['rushing yards',    { type: 'stat', val: 'rush_yd'  }],
  ['rush yards',       { type: 'stat', val: 'rush_yd'  }],
  ['rushing tds',      { type: 'stat', val: 'rush_td'  }],
  ['rushing touchdowns', { type: 'stat', val: 'rush_td' }],
  ['carries',          { type: 'stat', val: 'rush_att' }],
  ['receiving yards',  { type: 'stat', val: 'rec_yd'   }],
  ['rec yards',        { type: 'stat', val: 'rec_yd'   }],
  ['receiving tds',    { type: 'stat', val: 'rec_td'   }],
  ['receiving touchdowns', { type: 'stat', val: 'rec_td' }],
  ['receptions',       { type: 'stat', val: 'rec'      }],
  ['catches',          { type: 'stat', val: 'rec'      }],
  ['targets',          { type: 'stat', val: 'rec_tgt'  }],
  ['fumbles',          { type: 'stat', val: 'fum_lost' }],
  ['sacks',            { type: 'stat', val: 'sack'     }],
  ['tackles',          { type: 'stat', val: 'tkl'      }],
  ['fantasy points',   { type: 'stat', val: 'pts'      }],
  ['points',           { type: 'stat', val: 'pts'      }],
  ['fpts',             { type: 'stat', val: 'pts'      }],
  ['ppg',              { type: 'stat', val: 'pts_per_game' }],
  ['snaps',            { type: 'stat', val: 'snaps'    }],
  ['yards',            { type: 'stat', val: 'yards'    }],
  ['touchdowns',       { type: 'stat', val: 'td'       }],
  ['tds',              { type: 'stat', val: 'td'       }],
  ['ints',             { type: 'stat', val: 'pass_int' }],
  ['recs',             { type: 'stat', val: 'rec'      }],
  // ── Bare stat groups ──────────────────────────────────────────────────────
  // "seahawks receiving" is how people ask for a team's receiving leaders, and
  // the yardage is what they mean by it. These sit last so every multi-word
  // phrase above ("receiving tds") still wins the longest-first match.
  //
  // Deliberately absent: "tackle", "guard", "center", "corner" and "safety" are
  // already positions in SEARCH_PATTERNS, and "carry" is one edit from the
  // surname Barry. A stat entry for any of them would either shadow the
  // position or pull a player lookup into a leaderboard.
  // ── Team and season-level stats ───────────────────────────────────────────
  // These describe a team's season rather than a player's production. They
  // resolve against standings, not against a weekly stat line.
  ['point differential',  { type: 'stat', val: 'diff' }],
  ['points differential', { type: 'stat', val: 'diff' }],
  ['point diff',          { type: 'stat', val: 'diff' }],
  ['differential',        { type: 'stat', val: 'diff' }],
  ['strength of schedule', { type: 'stat', val: 'sos' }],
  ['schedule strength',   { type: 'stat', val: 'sos' }],
  ['sos',                 { type: 'stat', val: 'sos' }],
  ['points for',          { type: 'stat', val: 'pf'  }],
  ['points scored',       { type: 'stat', val: 'pf'  }],
  ['pf',                  { type: 'stat', val: 'pf'  }],
  // "points against" was an intent pointing at the Defenses view. As a phrase
  // people type after a team name it means the team's points allowed far more
  // often, and the Defenses destination is still reachable by its own names
  // ("defenses", "defense rankings", "streaming defense").
  ['points against',      { type: 'stat', val: 'pa'  }],
  ['points allowed',      { type: 'stat', val: 'pa'  }],
  ['pa',                  { type: 'stat', val: 'pa'  }],
  ['points per game',     { type: 'stat', val: 'pts_per_game' }],

  ['passing',          { type: 'stat', val: 'pass_yd'  }],
  ['rushing',          { type: 'stat', val: 'rush_yd'  }],
  ['receiving',        { type: 'stat', val: 'rec_yd'   }],
  ['sack',             { type: 'stat', val: 'sack'     }],
];

// ── Timeframes ──────────────────────────────────────────────────────────────
export const TIMEFRAME_PATTERNS = [
  ['last week',      { type: 'timeframe', val: 'last_week'    }],
  ['this week',      { type: 'timeframe', val: 'this_week'    }],
  ['next week',      { type: 'timeframe', val: 'next_week'    }],
  ['this season',    { type: 'timeframe', val: 'season'       }],
  ['this year',      { type: 'timeframe', val: 'season'       }],
  ['last season',    { type: 'timeframe', val: 'last_season'  }],
  ['last year',      { type: 'timeframe', val: 'last_season'  }],
  ['career',         { type: 'timeframe', val: 'career'       }],
  ['all time',       { type: 'timeframe', val: 'career'       }],
  ['season',         { type: 'timeframe', val: 'season'       }],
  ['tonight',        { type: 'timeframe', val: 'this_week'    }],
  ['today',          { type: 'timeframe', val: 'this_week'    }],
];

// ── Superlatives ────────────────────────────────────────────────────────────
export const SUPERLATIVE_PATTERNS = [
  ['most',    { type: 'superlative', val: 'most'  }],
  ['top',     { type: 'superlative', val: 'most'  }],
  ['best',    { type: 'superlative', val: 'most'  }],
  ['highest', { type: 'superlative', val: 'most'  }],
  ['leading', { type: 'superlative', val: 'most'  }],
  ['leader',  { type: 'superlative', val: 'most'  }],
  ['leaders', { type: 'superlative', val: 'most'  }],
  ['worst',   { type: 'superlative', val: 'least' }],
  ['lowest',  { type: 'superlative', val: 'least' }],
  ['fewest',  { type: 'superlative', val: 'least' }],
  ['least',   { type: 'superlative', val: 'least' }],
];

// ── Intents ─────────────────────────────────────────────────────────────────
// What the user wants done with the entities in the query.
export const INTENT_PATTERNS = [
  ['schedule',       { type: 'intent', val: 'schedule'   }],
  ['games',          { type: 'intent', val: 'schedule'   }],
  ['bye week',       { type: 'intent', val: 'bye'        }],
  ['bye',            { type: 'intent', val: 'bye'        }],
  ['byes',           { type: 'intent', val: 'bye'        }],
  ['standings',      { type: 'intent', val: 'standings'  }],
  ['playoff picture',{ type: 'intent', val: 'standings'  }],
  ['record',         { type: 'intent', val: 'record'     }],
  ['records',        { type: 'intent', val: 'record'     }],
  ['ranking',        { type: 'intent', val: 'ranking'    }],
  ['rankings',       { type: 'intent', val: 'ranking'    }],
  ['rank',           { type: 'intent', val: 'ranking'    }],
  ['waiver',         { type: 'intent', val: 'waiver'     }],
  ['waivers',        { type: 'intent', val: 'waiver'     }],
  ['available',      { type: 'intent', val: 'waiver'     }],
  ['free agent',     { type: 'intent', val: 'waiver'     }],
  ['free agents',    { type: 'intent', val: 'waiver'     }],
  ['trade value',    { type: 'intent', val: 'tradeValue' }],
  ['value',          { type: 'intent', val: 'tradeValue' }],
  ['trade for',      { type: 'intent', val: 'tradeValue' }],
  ['matchup',        { type: 'intent', val: 'matchup'    }],
  ['matchups',       { type: 'intent', val: 'matchup'    }],
  ['roster',         { type: 'intent', val: 'roster'     }],
  ['lineup',         { type: 'intent', val: 'roster'     }],
  ['stats',          { type: 'intent', val: 'stats'      }],
  ['stat',           { type: 'intent', val: 'stats'      }],
  ['statistics',     { type: 'intent', val: 'stats'      }],
  ['stat line',      { type: 'intent', val: 'stats'      }],
  ['injuries',       { type: 'intent', val: 'injuries'   }],
  ['injury',         { type: 'intent', val: 'injuries'   }],
  ['projection',     { type: 'intent', val: 'projection' }],
  ['projections',    { type: 'intent', val: 'projection' }],
  ['projected',      { type: 'intent', val: 'projection' }],
  ['defense',        { type: 'intent', val: 'defenseVs'  }],
  ['defenses',       { type: 'intent', val: 'defenseVs'  }],
];

// ── Commands ────────────────────────────────────────────────────────────────
// Verbs the palette performs rather than navigates to. `val` is the command id
// resolved in entities/commands.js.
export const COMMAND_PATTERNS = [
  ['dark mode',        { type: 'command', val: 'theme.dark'    }],
  ['light mode',       { type: 'command', val: 'theme.light'   }],
  ['theme',            { type: 'command', val: 'theme.toggle'  }],
  ["what's new",       { type: 'command', val: 'whatsNew'      }],
  ['whats new',        { type: 'command', val: 'whatsNew'      }],
  ['release notes',    { type: 'command', val: 'whatsNew'      }],
  ['guide',            { type: 'command', val: 'guide'         }],
  ['help',             { type: 'command', val: 'guide'         }],
  ['switch league',    { type: 'command', val: 'league.switch' }],
  ['change league',    { type: 'command', val: 'league.switch' }],
  ['connect league',   { type: 'command', val: 'league.connect'}],
  ['display settings', { type: 'command', val: 'display'       }],
  ['text size',        { type: 'command', val: 'display'       }],
  ['settings',         { type: 'command', val: 'display'       }],
  ['export',           { type: 'command', val: 'export'        }],
];

// ── Operators and scope ─────────────────────────────────────────────────────
export const OPERATOR_PATTERNS = [
  ['vs',      { type: 'operator', val: 'compare' }],
  ['versus',  { type: 'operator', val: 'compare' }],
  ['against', { type: 'operator', val: 'compare' }],
  ['my',      { type: 'scope',    val: 'self'    }],
  ['our',     { type: 'scope',    val: 'self'    }],
  ['mine',    { type: 'scope',    val: 'self'    }],
  // Which competition a standings or record question is about. Without this,
  // "standings" alone cannot tell the NFL's from the connected league's.
  ['fantasy', { type: 'scope',    val: 'fantasy' }],
  ['my league', { type: 'scope',  val: 'fantasy' }],
];

// ── Postseason week labels ──────────────────────────────────────────────────
export const POSTSEASON_WEEK_PATTERNS = [
  ['wild card',             { type: 'week', val: 'wc'   }],
  ['wildcard',              { type: 'week', val: 'wc'   }],
  ['divisional',            { type: 'week', val: 'div'  }],
  ['divisional round',      { type: 'week', val: 'div'  }],
  ['conference championship', { type: 'week', val: 'conf' }],
  ['championship round',    { type: 'week', val: 'conf' }],
  ['super bowl',            { type: 'week', val: 'sb'   }],
];

// Full table global search matches against. Order matters only for duplicate
// phrases: earlier entries win, so the more specific tables come first.
export const GLOBAL_PATTERNS = [
  ...POSTSEASON_WEEK_PATTERNS,
  ...COMMAND_PATTERNS,
  ...STAT_PATTERNS,
  ...TIMEFRAME_PATTERNS,
  ...INTENT_PATTERNS,
  ...SUPERLATIVE_PATTERNS,
  ...OPERATOR_PATTERNS,
  ...SEARCH_PATTERNS,
];

export const MAX_PHRASE_LEN = GLOBAL_PATTERNS.reduce(
  (max, [phrase]) => Math.max(max, phrase.split(' ').length),
  1,
);

// Words carrying no filtering meaning. Stripped before name matching so natural
// phrasing ("who do the seahawks play next") reduces to its entities.
export const STOPWORDS = new Set([
  'in', 'on', 'the', 'a', 'an', 'for', 'at', 'from', 'who', 'are', 'is', 'playing',
  'plays', 'play', 'with', 'and', 'or', 'us', 'them', 'me', 'number', 'jersey',
  'do', 'does', 'did', 'what', 'whats', 'when', 'where', 'how', 'many', 'much',
  'of', 'to', 'show', 'go', 'open', 'get', 'have', 'has', 'was', 'were', 'be',
  'been', 'their', 'there', 'about', 'im', 'i',
  // Contractions the tokenizer keeps intact, and qualifiers that only carry
  // meaning inside a phrase ("fantasy points", "switch league") — as bare words
  // they would otherwise leak into name terms and dilute name matching.
  "who's", 'whos', "what's", 'fantasy', 'league', 'nfl',
]);

// Phrase → tag lookup. Built once; the linear scan the old parser used was
// O(n) per token attempt against ~250 entries and this table is larger.
const GLOBAL_PATTERN_MAP = new Map();
for (const [phrase, tag] of GLOBAL_PATTERNS) {
  if (!GLOBAL_PATTERN_MAP.has(phrase)) GLOBAL_PATTERN_MAP.set(phrase, tag);
}

export function lookupPhrase(phrase) {
  return GLOBAL_PATTERN_MAP.get(phrase) ?? null;
}

// Correction dictionary for a standalone token: only words that are a complete
// phrase on their own. Correcting a lone token into a fragment of a multi-word
// phrase ("ward" → "card", from "wild card") is noise — the fragment carries no
// meaning by itself.
export const CORRECTION_DICTIONARY = Object.freeze([
  ...new Set(GLOBAL_PATTERNS.map(([phrase]) => phrase).filter((phrase) => !phrase.includes(' '))),
]);

// Correction dictionary for a word being matched as part of a multi-word phrase.
// Wider, because the surrounding words constrain it: "recieving yards" corrects
// to "receiving yards" only because the phrase then resolves.
export const PHRASE_WORD_DICTIONARY = Object.freeze([
  ...new Set(
    GLOBAL_PATTERNS
      .filter(([phrase]) => phrase.includes(' '))
      .flatMap(([phrase]) => phrase.split(' ')),
  ),
]);
