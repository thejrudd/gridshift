// Official college team color palettes for schools represented in ROOKIES_2026.
// Mirrors the NFL TEAM_COLORS structure in `src/data/teamColors.js`.
//
// Keys are normalized via `normalizeCollegeKey` so callers can pass display
// names like "Ohio State" or "Texas A&M" and still hit the right palette.
//
// Each entry has:
//   primary / secondary           — light-mode pair (gradient endpoints)
//   darkPrimary / darkSecondary   — dark-mode adjustments where primary is
//                                    too dark or low-contrast on dark backgrounds
//
// To add a school: pick the official primary + secondary from the school's
// brand guide. If primary is near-black or a very dark navy, swap darkPrimary
// to the brighter accent so the gradient still reads in dark mode.

export const COLLEGE_COLORS = {
  'alabama': {
    primary: '#9E1B32', secondary: '#828A8F',
    darkPrimary: '#9E1B32', darkSecondary: '#C7CDD0',
  },
  'arizona state': {
    primary: '#8C1D40', secondary: '#FFC627',
    darkPrimary: '#8C1D40', darkSecondary: '#FFC627',
  },
  'auburn': {
    primary: '#03244D', secondary: '#DD550C',
    darkPrimary: '#DD550C', darkSecondary: '#A6CFFF',
  },
  'cincinnati': {
    primary: '#E00122', secondary: '#000000',
    darkPrimary: '#E00122', darkSecondary: '#FFFFFF',
  },
  'clemson': {
    primary: '#F66733', secondary: '#522D80',
    darkPrimary: '#F66733', darkSecondary: '#9D7CCB',
  },
  'connecticut': {
    primary: '#000E2F', secondary: '#E4002B',
    darkPrimary: '#3C7BD9', darkSecondary: '#E4002B',
  },
  'florida': {
    primary: '#0021A5', secondary: '#FA4616',
    darkPrimary: '#3C7BD9', darkSecondary: '#FA4616',
  },
  'georgia': {
    primary: '#BA0C2F', secondary: '#000000',
    darkPrimary: '#BA0C2F', darkSecondary: '#FFFFFF',
  },
  'illinois': {
    primary: '#E84A27', secondary: '#13294B',
    darkPrimary: '#E84A27', darkSecondary: '#5879B5',
  },
  'indiana': {
    primary: '#990000', secondary: '#EEEDEB',
    darkPrimary: '#CC2222', darkSecondary: '#EEEDEB',
  },
  'lsu': {
    primary: '#461D7C', secondary: '#FDD023',
    darkPrimary: '#7E55C9', darkSecondary: '#FDD023',
  },
  'miami': {
    primary: '#005030', secondary: '#F47321',
    darkPrimary: '#1F8B5E', darkSecondary: '#F47321',
  },
  'michigan': {
    primary: '#00274C', secondary: '#FFCB05',
    darkPrimary: '#FFCB05', darkSecondary: '#5879B5',
  },
  'missouri': {
    primary: '#000000', secondary: '#F1B82D',
    darkPrimary: '#F1B82D', darkSecondary: '#FFFFFF',
  },
  'notre dame': {
    primary: '#0C2340', secondary: '#C99700',
    darkPrimary: '#C99700', darkSecondary: '#5879B5',
  },
  'ohio state': {
    primary: '#BB0000', secondary: '#666666',
    darkPrimary: '#BB0000', darkSecondary: '#B0B0B0',
  },
  'oklahoma': {
    primary: '#841617', secondary: '#FFF7E1',
    darkPrimary: '#C12B2C', darkSecondary: '#FFF7E1',
  },
  'oregon': {
    primary: '#154733', secondary: '#FEE123',
    darkPrimary: '#FEE123', darkSecondary: '#1F8B5E',
  },
  'penn state': {
    primary: '#041E42', secondary: '#FFFFFF',
    darkPrimary: '#3C7BD9', darkSecondary: '#FFFFFF',
  },
  'san diego state': {
    primary: '#A6192E', secondary: '#000000',
    darkPrimary: '#A6192E', darkSecondary: '#FFFFFF',
  },
  'south carolina': {
    primary: '#73000A', secondary: '#000000',
    darkPrimary: '#B82A36', darkSecondary: '#FFFFFF',
  },
  'tennessee': {
    primary: '#FF8200', secondary: '#FFFFFF',
    darkPrimary: '#FF8200', darkSecondary: '#FFFFFF',
  },
  'texas': {
    primary: '#BF5700', secondary: '#FFFFFF',
    darkPrimary: '#BF5700', darkSecondary: '#FFFFFF',
  },
  'texas a and m': {
    primary: '#500000', secondary: '#FFFFFF',
    darkPrimary: '#A02828', darkSecondary: '#FFFFFF',
  },
  'texas tech': {
    primary: '#CC0000', secondary: '#000000',
    darkPrimary: '#CC0000', darkSecondary: '#FFFFFF',
  },
  'toledo': {
    primary: '#002452', secondary: '#FFB20F',
    darkPrimary: '#FFB20F', darkSecondary: '#5879B5',
  },
  'ucf': {
    primary: '#000000', secondary: '#BA9B37',
    darkPrimary: '#BA9B37', darkSecondary: '#FFFFFF',
  },
  'usc': {
    primary: '#990000', secondary: '#FFC72C',
    darkPrimary: '#CC2222', darkSecondary: '#FFC72C',
  },
  'utah': {
    primary: '#CC0000', secondary: '#000000',
    darkPrimary: '#CC0000', darkSecondary: '#FFFFFF',
  },
  'washington': {
    primary: '#4B2E83', secondary: '#B7A57A',
    darkPrimary: '#7E55C9', darkSecondary: '#B7A57A',
  },
};

// Same normalization logic that `scoutTeamLogos.normalizeTeamName` uses, kept
// inline so this data module has zero internal imports. Display name "Texas
// A&M" becomes "texas a and m"; "USC" becomes "usc"; etc.
export function normalizeCollegeKey(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getCollegePalette(name) {
  const key = normalizeCollegeKey(name);
  return key ? (COLLEGE_COLORS[key] ?? null) : null;
}

// Build a secondary → primary gradient. We deliberately reverse the NFL
// pick-row direction (which leads with primary) because the college rookie
// pool skews heavily red/crimson — Alabama, Ohio State, Georgia, Indiana,
// Oklahoma, Texas Tech, Utah, USC, Cincinnati, San Diego State, South
// Carolina all share a red primary, making rows visually indistinguishable
// when primary leads. Leading with secondary surfaces the school's
// distinguishing accent first (Bama silver, Ohio State gray, Georgia black,
// Oklahoma cream, etc.) while the primary still anchors the right side.
//
// Pass `isDark` to pick the correct primary/secondary pair for the active
// theme. Returns `null` when the school has no palette entry, letting callers
// fall back to the default row background.
export function buildCollegeRowGradient(name, isDark = false) {
  const palette = getCollegePalette(name);
  if (!palette) return null;

  const primary = isDark ? palette.darkPrimary : palette.primary;
  const secondaryRaw = isDark ? palette.darkSecondary : palette.secondary;
  // Avoid blown-out near-white starts (Tennessee, Penn State, Texas A&M, etc.)
  // by darkening any too-light secondary toward a tinted primary.
  const secondary = readableSecondary(primary, secondaryRaw);

  return `linear-gradient(135deg, ${secondary} 0%, ${darkenHex(primary, 0.28)} 58%, ${primary} 100%)`;
}

// Pick a foreground color that reads on top of the gradient's start. Now that
// the gradient leads with secondary, the foreground is keyed off secondary's
// luminance — matching where the player name/rank/college copy actually sits.
export function getCollegeForeground(name, isDark = false) {
  const sides = getCollegeForegrounds(name, isDark);
  return sides ? sides.left : null;
}

// Return per-side foreground colors so the row can use one text color over
// the secondary side (left) and a different one over the primary side
// (right). Avoids cases like black-on-dark-red or black-on-purple when one
// luminance check has to cover the whole gradient.
export function getCollegeForegrounds(name, isDark = false) {
  const palette = getCollegePalette(name);
  if (!palette) return null;
  const primary = isDark ? palette.darkPrimary : palette.primary;
  const secondaryRaw = isDark ? palette.darkSecondary : palette.secondary;
  const secondary = readableSecondary(primary, secondaryRaw);
  return {
    left:  hexLuminance(secondary) > 0.36 ? '#0C0F14' : '#FFFFFF',
    right: hexLuminance(primary)   > 0.36 ? '#0C0F14' : '#FFFFFF',
  };
}

// ── Internal color helpers (kept inline so this data module has zero imports).

function darkenHex(hex, amount = 0.32) {
  const clean = String(hex ?? '').replace('#', '');
  if (clean.length !== 6) return hex;
  const n = parseInt(clean, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexLuminance(hex) {
  const clean = String(hex ?? '').replace('#', '');
  if (clean.length !== 6) return 0;
  const n = parseInt(clean, 16);
  const [r, g, b] = [((n >> 16) & 255), ((n >> 8) & 255), (n & 255)].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readableSecondary(primary, secondary) {
  if (!secondary || hexLuminance(secondary) > 0.82) {
    return darkenHex(primary, 0.38);
  }
  return secondary;
}
