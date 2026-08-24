// LiveAtoms.jsx — the small, repeated pieces of Fantasy Live: player imagery,
// the play-type glyphs, and the position chip. The vocabulary they draw from
// lives in liveVisuals.js.

import { ArrowUUpLeftIcon } from '@phosphor-icons/react/ArrowUUpLeft';
import { FootballIcon } from '@phosphor-icons/react/Football';
import { PersonSimpleRunIcon } from '@phosphor-icons/react/PersonSimpleRun';
import { ShieldIcon } from '@phosphor-icons/react/Shield';
import {
  getCompanionPositionColor,
  getPositionTextColor,
} from '../../../utils/companionAssetVisuals.js';
import { getLiveKindMeta } from './liveVisuals.js';

const PHOSPHOR_GLYPHS = {
  def: ShieldIcon,
  pass: FootballIcon,
  rush: PersonSimpleRunIcon,
  return: ArrowUUpLeftIcon,
};

/**
 * Round player image with headshot → team mark → initials fallback.
 *
 * Re-exported from the shared component so Statistics play-by-play can use the
 * same avatar. Fantasy Live call sites keep importing `LiveAvatar` from here.
 */
export { PlayerAvatar as LiveAvatar } from '../../shared/PlayerAvatar.jsx';

export function LiveGlyph({ glyph, mark = '', size = 11, color = '#fff' }) {
  const stroke = { stroke: color, strokeWidth: 1.9, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  const PhosphorGlyph = PHOSPHOR_GLYPHS[glyph];
  if (PhosphorGlyph) {
    return <PhosphorGlyph size={size} color={color} weight="fill" aria-hidden="true" />;
  }
  if (glyph === 'text') {
    return <span className="fl-glyph__text" style={{ color, fontSize: Math.max(7, size * 0.62) }}>{mark}</span>;
  }
  if (glyph === 'fg') {
    return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 2.6v6.8M9.6 2.6v6.8M2.4 4.2h7.2" {...stroke} /></svg>;
  }
  if (glyph === 'to') {
    return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" {...stroke} /></svg>;
  }
  return null;
}

/** The glyph as a filled badge, for the corner of a feed row's avatar. */
export function LiveGlyphBadge({ kind, size = 19 }) {
  const meta = getLiveKindMeta(kind);
  return (
    <span className="fl-glyph" style={{ background: meta.color, width: size, height: size }} title={meta.label} aria-label={meta.label}>
      <LiveGlyph glyph={meta.glyph} mark={meta.mark} size={size * 0.7} color={meta.foreground} />
    </span>
  );
}

export function LivePosChip({ position }) {
  const normalized = String(position ?? 'FLEX').toUpperCase();
  const background = getCompanionPositionColor(normalized) ?? '#94A3B8';
  return (
    <span className="fl-pos" style={{ background, color: getPositionTextColor(background) }}>
      {normalized}
    </span>
  );
}
