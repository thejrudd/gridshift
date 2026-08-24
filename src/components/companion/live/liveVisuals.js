// liveVisuals.js — the non-component vocabulary shared by the Fantasy Live
// pieces: player image resolution, the play-type glyph set, and name shortening.

import {
  getCompanionPlayerImageUrls,
  getEspnPlayerImageUrl,
  getNflTeamLogoUrl,
} from '../../../utils/companionAssetVisuals.js';
import { getTeamColorKey } from '../../../data/teamColors.js';
import { getTeamAbbr } from '../../../utils/liveScoringFeed.js';

/**
 * Ordered image candidates for a starter: their headshots, then the NFL team
 * mark (the right imagery for kickers and team defenses anyway). `logoIndex`
 * marks where the list stops being a headshot so the mark can be inset rather
 * than cropped to fill.
 */
export function getLiveImageSources(player = {}) {
  const headshots = getCompanionPlayerImageUrls(player);
  const logo = getNflTeamLogoUrl(getTeamColorKey(getTeamAbbr(player.team)));
  if (!logo) return { urls: headshots, logoIndex: -1 };
  const existing = headshots.indexOf(logo);
  if (existing >= 0) return { urls: headshots, logoIndex: existing };
  return { urls: [...headshots, logo], logoIndex: headshots.length };
}

/**
 * The hero's cut-out image for a player, or null when there isn't one.
 *
 * Only ESPN headshots work here — they are the transparent PNGs that can break
 * the seam. Sleeper's own images are opaque JPEGs and would render as a
 * floating rectangle. A player with no ESPN id has no cut-out at all, and the
 * hero drops to its spotlight treatment rather than substituting a team mark:
 * a logo where a face belongs reads as a bug, not as a design.
 */
export function getLiveCutoutUrl(player = {}) {
  return getEspnPlayerImageUrl(player.espnId ?? player.espn_id ?? player.sourceIds?.espn);
}

const num = (stats, ...keys) => {
  for (const key of keys) {
    const value = Number(stats?.[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return 0;
};

/**
 * The player's counting stats for the sheet's Box score tab, as [label, value]
 * pairs shaped by position. Zero-valued lines are dropped so a quiet stat line
 * reads as a short list rather than a wall of dashes.
 */
export function buildLiveBoxScore(stats, position) {
  if (!stats) return [];
  const pos = String(position ?? '').toUpperCase();
  const pairs = [];
  const push = (label, value) => { if (value) pairs.push([label, value]); };

  if (pos === 'QB') {
    const cmp = num(stats, 'pass_cmp');
    const att = num(stats, 'pass_att');
    if (cmp || att) pairs.push(['C/ATT', `${cmp}/${att}`]);
    push('Pass yds', num(stats, 'pass_yd'));
    push('Pass TD', num(stats, 'pass_td'));
    push('Int', num(stats, 'pass_int'));
    push('Rush yds', num(stats, 'rush_yd'));
    push('Rush TD', num(stats, 'rush_td'));
  } else if (pos === 'RB') {
    push('Carries', num(stats, 'rush_att'));
    push('Rush yds', num(stats, 'rush_yd'));
    push('Rush TD', num(stats, 'rush_td'));
    push('Rec', num(stats, 'rec'));
    push('Rec yds', num(stats, 'rec_yd'));
    push('Rec TD', num(stats, 'rec_td'));
  } else if (pos === 'WR' || pos === 'TE' || pos === 'FLEX') {
    push('Targets', num(stats, 'rec_tgt', 'tgt'));
    push('Rec', num(stats, 'rec'));
    push('Rec yds', num(stats, 'rec_yd'));
    push('Rec TD', num(stats, 'rec_td'));
    push('Rush yds', num(stats, 'rush_yd'));
    push('Rush TD', num(stats, 'rush_td'));
  } else if (pos === 'K' || pos === 'PK') {
    push('FG made', num(stats, 'fgm'));
    push('FG missed', num(stats, 'fgmiss'));
    push('XP made', num(stats, 'xpm'));
  } else if (pos === 'DEF' || pos === 'DST') {
    push('Sacks', num(stats, 'sack'));
    push('Int', num(stats, 'int'));
    push('Fum rec', num(stats, 'fum_rec'));
    push('Safeties', num(stats, 'safe'));
    push('TD', num(stats, 'def_td'));
    push('Pts allowed', num(stats, 'pts_allow'));
  } else {
    push('Tackles', num(stats, 'idp_tkl'));
    push('Solo', num(stats, 'idp_tkl_solo'));
    push('Sacks', num(stats, 'idp_sack'));
    push('Int', num(stats, 'idp_int'));
    push('Pass def', num(stats, 'idp_pd'));
    push('Forced fum', num(stats, 'idp_ff'));
  }

  push('Fum lost', num(stats, 'fum_lost'));
  return pairs;
}

// Primary outcomes and secondary mechanisms use the same compact vocabulary.
// Shape/text carries the meaning so color is reinforcement, not the legend.
const GLYPH_META = {
  td: { label: 'Touchdown', glyph: 'text', mark: 'TD', color: 'var(--color-accent-green)', foreground: 'var(--color-bg)' },
  fg: { label: 'Field goal', glyph: 'fg', color: 'var(--color-accent-orange)', foreground: 'var(--color-bg)' },
  xp: { label: 'Extra point', glyph: 'text', mark: 'XP', color: 'var(--color-accent-orange)', foreground: 'var(--color-bg)' },
  to: { label: 'Turnover', glyph: 'to', color: 'var(--color-accent-red)', foreground: 'var(--color-bg)' },
  def: { label: 'Defensive play', glyph: 'def', color: 'var(--color-live-defense)', foreground: 'var(--color-live-defense-fg)' },
  pass: { label: 'Pass play', glyph: 'pass', color: 'var(--color-accent)', foreground: 'var(--color-bg)' },
  rush: { label: 'Rush', glyph: 'rush', color: 'var(--color-accent-green)', foreground: 'var(--color-bg)' },
  return: { label: 'Return play', glyph: 'return', color: 'var(--color-alpha)', foreground: 'var(--color-alpha-fg)' },
};

export function getLiveKindMeta(kind) {
  return GLYPH_META[kind] ?? GLYPH_META.pass;
}

export function getLiveEventLabel(event = {}) {
  const primary = getLiveKindMeta(event.kind);
  const mechanism = event.mechanism && event.mechanism !== event.kind
    ? getLiveKindMeta(event.mechanism)
    : null;
  return mechanism ? `${primary.label} · ${mechanism.label}` : primary.label;
}

/**
 * A 0..1 position through the notional 60 minutes, read back as a game clock.
 * The pace chart's axis is game progress, so "Q3 7:12" is what a reader can
 * actually place — a wallclock time would mean nothing across a staggered slate.
 */
export function formatGameClock(progress) {
  const seconds = Math.min(3599, Math.max(0, (Number(progress) || 0) * 3600));
  const quarter = Math.min(4, Math.floor(seconds / 900) + 1);
  const left = 900 - (seconds % 900);
  return `Q${quarter} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
}

export function lastNameOf(name) {
  const parts = String(name ?? '').trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '');
}

export function firstWordOf(name) {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}
