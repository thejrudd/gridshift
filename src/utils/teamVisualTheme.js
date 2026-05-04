import { getTeamColorKey, getTeamPalette } from '../data/teamColors.js';

// These teams need the secondary color on the gradient start so their logo
// remains readable against identity-forward card and row treatments.
export const TEAM_IDENTITY_REVERSED_GRADIENT_TEAMS = new Set([
  'dal',
  'gb',
  'jax',
  'la',
  'lar',
  'lv',
  'no',
  'nyg',
  'nyj',
  'pit',
  'wsh',
]);

export const TEAM_LOGO_SIDE_SENSITIVE_GRADIENT_TEAMS = new Set([
  'nyg',
  'nyj',
]);

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function hexLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA, hexB) {
  const luminanceA = hexLuminance(hexA);
  const luminanceB = hexLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function darkenHex(hex, factor) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clampedFactor = Math.min(1, Math.max(0, factor));
  const r = Math.round(rgb.r * clampedFactor);
  const g = Math.round(rgb.g * clampedFactor);
  const b = Math.round(rgb.b * clampedFactor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function mixHex(hexA, hexB, weight = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA ?? hexB ?? null;
  const clampedWeight = Math.min(1, Math.max(0, weight));
  const r = Math.round((a.r * (1 - clampedWeight)) + (b.r * clampedWeight));
  const g = Math.round((a.g * (1 - clampedWeight)) + (b.g * clampedWeight));
  const blue = Math.round((a.b * (1 - clampedWeight)) + (b.b * clampedWeight));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}

function tuneGradientStopForMode(hex, darkMode) {
  const luminance = hexLuminance(hex);
  if (darkMode) {
    if (luminance > 0.72) return mixHex(hex, '#000000', 0.42);
    if (luminance > 0.45) return mixHex(hex, '#000000', 0.28);
    if (luminance > 0.28) return mixHex(hex, '#000000', 0.16);
    return hex;
  }

  if (luminance < 0.12) return mixHex(hex, '#FFFFFF', 0.28);
  if (luminance < 0.24) return mixHex(hex, '#FFFFFF', 0.18);
  return hex;
}

export function pickReadableForeground(stops = []) {
  const validStops = stops.filter(Boolean);
  if (!validStops.length) return '#FFFFFF';
  const candidates = ['#FFFFFF', '#0C0F14'];
  return candidates
    .map((color) => ({
      color,
      worstContrast: Math.min(...validStops.map((stop) => contrastRatio(color, stop))),
    }))
    .sort((a, b) => b.worstContrast - a.worstContrast)[0]?.color ?? '#FFFFFF';
}

function mutedForForeground(foreground) {
  return foreground === '#FFFFFF'
    ? 'rgba(255,255,255,0.70)'
    : 'rgba(12,15,20,0.64)';
}

function subtleForForeground(foreground) {
  return foreground === '#FFFFFF'
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(12,15,20,0.12)';
}

export function getTeamVisualTheme(team, darkMode = false, options = {}) {
  const {
    logoSide = undefined,
    reverse = undefined,
    reversedTeams = TEAM_IDENTITY_REVERSED_GRADIENT_TEAMS,
    logoSideSensitiveTeams = TEAM_LOGO_SIDE_SENSITIVE_GRADIENT_TEAMS,
    middleStop = true,
  } = options;

  const logoKey = getTeamColorKey(team) ?? '';
  const palette = getTeamPalette(team);

  if (!palette) {
    return {
      key: logoKey,
      logoKey: '',
      palette: null,
      color: null,
      secondary: null,
      primary: null,
      gradientStart: null,
      gradientMid: null,
      gradientEnd: null,
      gradient: null,
      gradientOverlay: null,
      gradientForeground: null,
      gradientMuted: 'var(--color-label-secondary)',
      gradientSubtle: 'var(--color-fill-secondary)',
      gradientStartForeground: null,
      gradientStartMuted: 'var(--color-label-secondary)',
      gradientStartSubtle: 'var(--color-fill-secondary)',
      gradientMidForeground: null,
      gradientMidMuted: 'var(--color-label-secondary)',
      gradientMidSubtle: 'var(--color-fill-secondary)',
      gradientEndForeground: null,
      gradientEndMuted: 'var(--color-label-secondary)',
      gradientEndSubtle: 'var(--color-fill-secondary)',
      gradientFullForeground: null,
      gradientFullMuted: 'var(--color-label-secondary)',
      gradientFullSubtle: 'var(--color-fill-secondary)',
      tint: null,
      hoverTint: null,
      borderColor: null,
      accentColor: null,
      logoBadgeBg: darkMode ? 'rgba(255,255,255,0.92)' : 'rgba(12,15,20,0.72)',
      logoBadgeBorder: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(12,15,20,0.12)',
      isLight: false,
      reverseGradient: false,
    };
  }

  const primary = darkMode ? palette.darkPrimary : palette.primary;
  const secondary = darkMode
    ? (palette.darkSecondary ?? palette.secondary ?? primary)
    : (palette.secondary ?? primary);
  const isLogoSideSensitive = logoKey ? logoSideSensitiveTeams.has(logoKey) : false;
  const reverseForLogoSide = logoSide === 'start'
    ? true
    : logoSide === 'end'
      ? false
      : undefined;
  const reverseGradient = reverse
    ?? (isLogoSideSensitive && reverseForLogoSide !== undefined
      ? reverseForLogoSide
      : (logoKey ? reversedTeams.has(logoKey) : false));
  const rawGradientStart = reverseGradient ? secondary : primary;
  const rawGradientEnd = reverseGradient ? primary : secondary;
  const gradientStart = tuneGradientStopForMode(rawGradientStart, darkMode);
  const gradientEnd = tuneGradientStopForMode(rawGradientEnd, darkMode);
  const gradientMid = middleStop
    ? mixHex(darkenHex(gradientStart, 0.72), gradientEnd, 0.32)
    : mixHex(gradientStart, gradientEnd, 0.5);
  const gradientStops = [
    gradientStart,
    gradientMid,
    gradientEnd,
    mixHex(gradientStart, gradientMid, 0.5),
    mixHex(gradientMid, gradientEnd, 0.5),
  ];
  const gradientStartForeground = pickReadableForeground([
    gradientStart,
    mixHex(gradientStart, gradientMid, 0.5),
    gradientMid,
  ]);
  const gradientMidForeground = pickReadableForeground([
    mixHex(gradientStart, gradientMid, 0.5),
    gradientMid,
    mixHex(gradientMid, gradientEnd, 0.5),
  ]);
  const gradientEndForeground = pickReadableForeground([
    gradientMid,
    mixHex(gradientMid, gradientEnd, 0.5),
    gradientEnd,
  ]);
  const gradientFullForeground = pickReadableForeground(gradientStops);
  // Default foregrounds are start-side because player/team names sit on the
  // left of the shared 135deg gradient in Statistics and Trade rows.
  const gradientForeground = gradientStartForeground;
  const gradientMuted = mutedForForeground(gradientForeground);
  const gradientSubtle = subtleForForeground(gradientForeground);
  const isLight = hexLuminance(gradientStart) > 0.35;
  const borderColor = (!darkMode && isLight) ? darkenHex(gradientStart, 0.55) : gradientStart;
  const accentSource = darkMode && hexLuminance(gradientStart) < 0.14
    ? gradientEnd
    : gradientStart;
  const accentColor = accentSource && hexLuminance(accentSource) < 0.18
    ? '#F2F1EC'
    : accentSource;

  return {
    key: logoKey,
    logoKey,
    palette,
    primary,
    secondary,
    color: gradientStart,
    gradientStart,
    gradientMid,
    gradientEnd,
    gradient: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientMid} 48%, ${gradientEnd} 100%)`,
    gradientOverlay: darkMode
      ? 'linear-gradient(180deg, rgba(12,15,20,0.04) 0%, rgba(12,15,20,0.22) 100%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(12,15,20,0.12) 100%)',
    gradientForeground,
    gradientMuted,
    gradientSubtle,
    gradientStartForeground,
    gradientStartMuted: mutedForForeground(gradientStartForeground),
    gradientStartSubtle: subtleForForeground(gradientStartForeground),
    gradientMidForeground,
    gradientMidMuted: mutedForForeground(gradientMidForeground),
    gradientMidSubtle: subtleForForeground(gradientMidForeground),
    gradientEndForeground,
    gradientEndMuted: mutedForForeground(gradientEndForeground),
    gradientEndSubtle: subtleForForeground(gradientEndForeground),
    gradientFullForeground,
    gradientFullMuted: mutedForForeground(gradientFullForeground),
    gradientFullSubtle: subtleForForeground(gradientFullForeground),
    tint: `${gradientStart}${isLight ? '18' : '22'}`,
    hoverTint: `${gradientStart}${isLight ? '2e' : '34'}`,
    borderColor,
    accentColor,
    logoBadgeBg: darkMode
      ? 'rgba(255,255,255,0.92)'
      : 'rgba(12,15,20,0.76)',
    logoBadgeBorder: darkMode
      ? `${accentColor ?? '#ffffff'}55`
      : 'rgba(12,15,20,0.12)',
    isLight,
    reverseGradient,
  };
}
