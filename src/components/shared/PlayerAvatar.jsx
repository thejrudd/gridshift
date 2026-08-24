// PlayerAvatar.jsx — round player image with a headshot → team mark → initials
// fallback chain.
//
// Shared rather than Fantasy Live-local because the Statistics play-by-play
// feed needs exactly the same behavior. It keeps the `fl-av` class names so
// every existing Fantasy Live style, including the per-surface overrides that
// reach into `.fl-av__initials`, applies unchanged.

import { useState } from 'react';
import { getCompanionInitials } from '../../utils/companionAssetVisuals.js';
import { getLiveImageSources } from '../companion/live/liveVisuals.js';

function getDisplayName(player) {
  return player?.full_name
    || player?.name
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || 'Unknown Player';
}

export function PlayerAvatar({ player = {}, size = 46, initialsSize, background, className = '', name }) {
  const [failed, setFailed] = useState({ key: '', count: 0 });
  const { urls, logoIndex } = getLiveImageSources(player);
  const key = urls.join('|');
  const index = failed.key === key ? failed.count : 0;
  const url = urls[index] ?? null;
  const isMark = logoIndex >= 0 && index >= logoIndex;
  const numericSize = Number(size);
  const resolvedInitialsSize = initialsSize ?? (Number.isFinite(numericSize)
    ? Math.round(numericSize * 0.32)
    : '1em');

  return (
    <span className={`fl-av ${className}`} style={{ width: size, height: size, background }} aria-hidden="true">
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable="false"
          className={isMark ? 'is-mark' : ''}
          onError={() => setFailed({ key, count: index + 1 })}
        />
      ) : (
        <span className="fl-av__initials" style={{ fontSize: resolvedInitialsSize }}>
          {getCompanionInitials(name ?? getDisplayName(player))}
        </span>
      )}
    </span>
  );
}

export default PlayerAvatar;
