// fantasyTeamIdentity.js — identity colour for *fantasy* teams (rosters).
//
// NFL teams get their real palette from teamColors.js / teamVisualTheme.js.
// Fantasy teams have no brand, so the Live tab assigns each roster a stable
// slot from a fixed, mutually-distinct palette. Slots are handed out by the
// roster's position in the league's roster list, which keeps a team's colour
// identical across renders, sessions and matchups, and guarantees the two
// sides of a matchup never collide in a normal-sized league.

import { hexLuminance, mixHex } from './teamVisualTheme.js';

// Twelve hues, ordered so adjacent slots stay distinguishable. Each entry is
// [primary, secondary]; the primary carries the identity, the secondary only
// deepens the gradient.
export const FANTASY_TEAM_PALETTES = [
  ['#F5B700', '#C2410C'],
  ['#5AADFF', '#1E3A8A'],
  ['#2ED578', '#065F46'],
  ['#C084FC', '#4C1D95'],
  ['#FF4433', '#7F1D1D'],
  ['#00C2A8', '#0F4C4A'],
  ['#FF8C1A', '#7C2D12'],
  ['#94A3B8', '#334155'],
  ['#F472B6', '#831843'],
  ['#38BDF8', '#0C4A6E'],
  ['#A3E635', '#3F6212'],
  ['#FB7185', '#881337'],
];

const FALLBACK_PALETTE = ['#94A3B8', '#334155'];

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Builds a roster_id → palette-slot map from the league's rosters. Slots come
 * from the sorted roster order so they never shuffle when Sleeper returns the
 * rosters in a different sequence.
 */
export function buildFantasyPaletteSlots(rosters = []) {
  const ordered = [...(rosters ?? [])]
    .map((roster) => Number(roster?.roster_id))
    .filter((rosterId) => Number.isFinite(rosterId))
    .sort((left, right) => left - right);
  return new Map(ordered.map((rosterId, index) => [rosterId, index]));
}

/**
 * Palette for one fantasy team. Prefers the league-order slot; falls back to a
 * hash of the key so a roster missing from the list still gets a stable colour.
 */
export function getFantasyTeamPalette(rosterId, slots = null) {
  const slot = slots?.get?.(Number(rosterId));
  if (Number.isFinite(slot)) return FANTASY_TEAM_PALETTES[slot % FANTASY_TEAM_PALETTES.length];
  if (rosterId == null) return FALLBACK_PALETTE;
  return FANTASY_TEAM_PALETTES[hashString(rosterId) % FANTASY_TEAM_PALETTES.length];
}

/** `rgba()` form of a hex colour, for washes and tints. */
export function withAlpha(hex, alpha) {
  const clean = String(hex ?? '').replace('#', '');
  if (clean.length < 6) return `rgba(148,163,184,${alpha})`;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Hero-half gradient. Runs darker than the shared 135deg row treatment because
 * the hero carries white type over the top of it.
 */
export function fantasyHeroGradient(primary, secondary, degrees = 135) {
  const start = mixHex(primary, '#000000', 0.14);
  const middle = mixHex(primary, '#000000', 0.5);
  const end = mixHex(secondary ?? primary, '#000000', 0.42);
  return `linear-gradient(${degrees}deg, ${start} 0%, ${middle} 54%, ${end} 100%)`;
}

/** Readable ink for a chip filled with the team's primary colour. */
export function fantasyTeamInk(primary) {
  return hexLuminance(primary) > 0.35 ? '#0C0F14' : '#FFFFFF';
}
