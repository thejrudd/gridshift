// Official NFL team color palettes — all 32 teams.
// TEAM_NAMES: full team name keyed by lowercase abbreviation.
// TEAM_DIVISIONS: conference/division structure for the team picker UI.

export const TEAM_NAMES = {
  buf: 'Buffalo Bills',        mia: 'Miami Dolphins',
  ne:  'New England Patriots', nyj: 'New York Jets',
  bal: 'Baltimore Ravens',     cin: 'Cincinnati Bengals',
  cle: 'Cleveland Browns',     pit: 'Pittsburgh Steelers',
  hou: 'Houston Texans',       ind: 'Indianapolis Colts',
  jax: 'Jacksonville Jaguars', ten: 'Tennessee Titans',
  den: 'Denver Broncos',       kc:  'Kansas City Chiefs',
  lv:  'Las Vegas Raiders',    lac: 'Los Angeles Chargers',
  dal: 'Dallas Cowboys',       nyg: 'New York Giants',
  phi: 'Philadelphia Eagles',  wsh: 'Washington Commanders',
  chi: 'Chicago Bears',        det: 'Detroit Lions',
  gb:  'Green Bay Packers',    min: 'Minnesota Vikings',
  atl: 'Atlanta Falcons',      car: 'Carolina Panthers',
  no:  'New Orleans Saints',   tb:  'Tampa Bay Buccaneers',
  ari: 'Arizona Cardinals',    la:  'Los Angeles Rams',
  sf:  'San Francisco 49ers',  sea: 'Seattle Seahawks',
};

export const TEAM_DIVISIONS = [
  {
    conference: 'AFC',
    divisions: [
      { name: 'AFC East',  teams: ['buf', 'mia', 'ne',  'nyj'] },
      { name: 'AFC North', teams: ['bal', 'cin', 'cle', 'pit'] },
      { name: 'AFC South', teams: ['hou', 'ind', 'jax', 'ten'] },
      { name: 'AFC West',  teams: ['den', 'kc',  'lv',  'lac'] },
    ],
  },
  {
    conference: 'NFC',
    divisions: [
      { name: 'NFC East',  teams: ['dal', 'nyg', 'phi', 'wsh'] },
      { name: 'NFC North', teams: ['chi', 'det', 'gb',  'min'] },
      { name: 'NFC South', teams: ['atl', 'car', 'no',  'tb']  },
      { name: 'NFC West',  teams: ['ari', 'la',  'sf',  'sea'] },
    ],
  },
];


// primary/secondary: used in light mode contexts.
// darkPrimary/darkSecondary: adjusted for dark mode where the primary
// is too dark to read on a dark background (e.g. Raiders black → silver,
// Saints black → gold, Bears navy → orange).

export const TEAM_COLORS = {
  // AFC EAST
  buf: {
    primary:       '#00338D', // Royal Blue (PMS 286 C)
    secondary:     '#C60C30', // Red (PMS 199 C)
    darkPrimary:   '#00338D',
    darkSecondary: '#C60C30',
  },
  mia: {
    primary:       '#008E97', // Aqua (PMS 321 C)
    secondary:     '#FC4C02', // Orange (PMS 1655 C)
    darkPrimary:   '#008E97',
    darkSecondary: '#FC4C02',
  },
  ne: {
    primary:       '#002244', // Nautical Blue (PMS 282 C)
    secondary:     '#C60C30', // Red (PMS 199 C)
    darkPrimary:   '#C60C30', // Red reads better than navy-on-dark
    darkSecondary: '#B0B7BC', // New Century Silver
  },
  nyj: {
    primary:       '#125740', // Gotham Green (PMS 7484 C)
    secondary:     '#000000',
    darkPrimary:   '#125740',
    darkSecondary: '#FFFFFF',
  },

  // AFC NORTH
  bal: {
    primary:       '#241773', // Purple (PMS 273 C)
    secondary:     '#000000',
    darkPrimary:   '#241773',
    darkSecondary: '#9E7C0C', // Metallic Gold (PMS 8660 C) — black invisible on dark
  },
  cin: {
    primary:       '#FB4F14', // Bengal Orange (PMS 1655 C)
    secondary:     '#000000',
    darkPrimary:   '#FB4F14',
    darkSecondary: '#FFFFFF',
  },
  cle: {
    primary:       '#FF3C00', // Browns Orange (PMS 2028 C)
    secondary:     '#311D00', // Dark Brown (PMS Black 4 C)
    darkPrimary:   '#FF3C00',
    darkSecondary: '#FF3C00', // Brown too dark for dark bg; orange serves both
  },
  pit: {
    primary:       '#FFB612', // Steelers Gold (PMS 1235 C)
    secondary:     '#101820', // Black (PMS Black 6 C)
    darkPrimary:   '#FFB612', // Gold pops on dark
    darkSecondary: '#A5ACAF', // Silver
  },

  // AFC SOUTH
  hou: {
    primary:       '#03202F', // Deep Steel Blue (PMS 296 C)
    secondary:     '#A71930', // Battle Red (PMS 187 C)
    darkPrimary:   '#A71930', // Deep blue near-invisible on dark; red takes over
    darkSecondary: '#FFFFFF',
  },
  ind: {
    primary:       '#002C5F', // Speed Blue (PMS Reflex Blue C)
    secondary:     '#A2AAAD', // Silver (PMS 429 C)
    darkPrimary:   '#4B92DB', // Lighter blue for dark bg legibility
    darkSecondary: '#FFFFFF',
  },
  jax: {
    primary:       '#101820', // Black (PMS Black 6 C)
    secondary:     '#D7A22A', // Gold (PMS 110 C)
    darkPrimary:   '#D7A22A', // Black invisible on dark; gold takes over
    darkSecondary: '#006778', // Teal (PMS 562 C)
  },
  ten: {
    primary:       '#0C2340', // Titans Navy (PMS 289 C)
    secondary:     '#4B92DB', // Titans Blue (PMS 279 C)
    darkPrimary:   '#4B92DB', // Light blue readable on dark navy
    darkSecondary: '#C8102E', // Titans Red (PMS 186 C)
  },

  // AFC WEST
  den: {
    primary:       '#FB4F14', // Broncos Orange (PMS 1655 C)
    secondary:     '#002244', // Broncos Navy (PMS 289 C)
    darkPrimary:   '#FB4F14',
    darkSecondary: '#FFFFFF',
  },
  kc: {
    primary:       '#E31837', // Chiefs Red (PMS 186 C)
    secondary:     '#FFB81C', // Chiefs Gold (PMS 1235 C)
    darkPrimary:   '#E31837',
    darkSecondary: '#FFB81C',
  },
  lv: {
    primary:       '#000000', // Raiders Black
    secondary:     '#A5ACAF', // Raiders Silver (PMS 877 C)
    darkPrimary:   '#A5ACAF', // Black invisible on dark; silver takes over
    darkSecondary: '#FFFFFF',
  },
  lac: {
    primary:       '#0080C6', // Powder Blue (PMS 285 C)
    secondary:     '#FFC20E', // Sunshine Gold (PMS 1235 C)
    darkPrimary:   '#0080C6',
    darkSecondary: '#FFC20E',
  },

  // NFC EAST
  dal: {
    primary:       '#003594', // Navy Blue (PMS 288 C)
    secondary:     '#869397', // Silver (PMS 877 C)
    darkPrimary:   '#869397', // Silver-on-dark is the Cowboys' signature look
    darkSecondary: '#FFFFFF',
  },
  nyg: {
    primary:       '#0B2265', // Dark Blue (PMS 2758 C)
    secondary:     '#A71930', // Red (PMS 187 C)
    darkPrimary:   '#0B2265',
    darkSecondary: '#A71930',
  },
  phi: {
    primary:       '#004C54', // Midnight Green (PMS 316 C)
    secondary:     '#A5ACAF', // Silver (PMS 877 C)
    darkPrimary:   '#004C54',
    darkSecondary: '#ACC0C6', // Helmet silver
  },
  wsh: {
    primary:       '#5A1414', // Burgundy (PMS 483 C)
    secondary:     '#FFB612', // Gold (PMS 1235 C)
    darkPrimary:   '#FFB612', // Gold pops on dark
    darkSecondary: '#5A1414',
  },

  // NFC NORTH
  chi: {
    primary:       '#0B162A', // Navy (PMS 289 C)
    secondary:     '#C83803', // Orange (PMS 1595 C)
    darkPrimary:   '#C83803', // Orange is the recognizable Bears pop color on dark
    darkSecondary: '#FFFFFF',
  },
  det: {
    primary:       '#0076B6', // Honolulu Blue (PMS 7462 C)
    secondary:     '#B0B7BC', // Silver (PMS 8180 C)
    darkPrimary:   '#0076B6',
    darkSecondary: '#B0B7BC',
  },
  gb: {
    primary:       '#203731', // Dark Green (PMS 5535 C)
    secondary:     '#FFB612', // Gold (PMS 1235 C)
    darkPrimary:   '#FFB612', // Gold-on-dark is the iconic Packers look
    darkSecondary: '#203731',
  },
  min: {
    primary:       '#4F2683', // Purple (PMS 268 C)
    secondary:     '#FFC62F', // Gold (PMS 123 C)
    darkPrimary:   '#4F2683',
    darkSecondary: '#FFC62F',
  },

  // NFC SOUTH
  atl: {
    primary:       '#A71930', // Red (PMS 187 C)
    secondary:     '#000000',
    darkPrimary:   '#A71930',
    darkSecondary: '#A5ACAF', // Silver accent
  },
  car: {
    primary:       '#0085CA', // Carolina Blue (PMS Process Blue C)
    secondary:     '#101820',
    darkPrimary:   '#0085CA',
    darkSecondary: '#BFC0BF', // Silver
  },
  no: {
    primary:       '#101820', // Black (PMS Black 6 C)
    secondary:     '#D3BC8D', // Old Gold (PMS 8383 C)
    darkPrimary:   '#D3BC8D', // Gold-forward on dark; classic Saints look
    darkSecondary: '#FFFFFF',
  },
  tb: {
    primary:       '#D50A0A', // Buccaneer Red (PMS 185 C)
    secondary:     '#34302B', // Pewter (PMS 412 C)
    darkPrimary:   '#D50A0A',
    darkSecondary: '#FF7900', // Bay Orange (PMS 1505 C) — pewter too dark on dark bg
  },

  // NFC WEST
  ari: {
    primary:       '#97233F', // Cardinal Red (PMS 194 C)
    secondary:     '#000000',
    darkPrimary:   '#97233F',
    darkSecondary: '#FFB612', // Yellow accent (PMS 1235 C)
  },
  la: {
    primary:       '#003594', // Rams Blue (PMS 2767 C)
    secondary:     '#FFA300', // Gold (PMS 1235 C)
    darkPrimary:   '#003594',
    darkSecondary: '#FFA300',
  },
  sf: {
    primary:       '#AA0000', // Scarlet (PMS 187 C)
    secondary:     '#B3995D', // Gold (PMS 4515 C)
    darkPrimary:   '#AA0000',
    darkSecondary: '#B3995D',
  },
  sea: {
    primary:       '#002244', // College Navy (PMS 289 C)
    secondary:     '#69BE28', // Action Green (PMS 368 C)
    darkPrimary:   '#69BE28', // Action Green pops on dark navy
    darkSecondary: '#A5ACAF', // Wolf Gray (PMS 429 C)
  },
};

const TEAM_COLOR_ALIASES = {
  lar: 'la',
  was: 'wsh',
  jac: 'jax',
};

export function getTeamColorKey(team) {
  if (!team) return null;
  const normalized = String(team).trim().toLowerCase();
  return TEAM_COLOR_ALIASES[normalized] ?? normalized;
}

export function getTeamPalette(team) {
  const key = getTeamColorKey(team);
  return key ? (TEAM_COLORS[key] ?? null) : null;
}
