import { useRef } from 'react';
import {
  getAvailabilityStatusBadgeStyle,
  getAvailabilityStatusLabel,
} from '../../utils/playerAvailabilityStatus';
import useCompanionPlayerLocalContrast from '../../hooks/useCompanionPlayerLocalContrast.js';

export default function PlayerStatusBadge({ status, compact = false, className = '', localContrast = true }) {
  const label = getAvailabilityStatusLabel(status, compact);
  const ref = useRef(null);
  const contrast = useCompanionPlayerLocalContrast(ref, localContrast);
  if (!label) return null;

  return (
    <span
      ref={ref}
      className={`font-bold px-1.5 py-0.5 rounded-lg shrink-0 leading-none ${className}`}
      style={{
        ...getAvailabilityStatusBadgeStyle(status),
        ...(contrast ? {
          background: contrast.background,
          border: `1px solid ${contrast.borderColor}`,
          color: contrast.color,
          textShadow: contrast.textShadow,
        } : {}),
        fontSize: compact ? 9 : 10,
      }}
      title={status}
      aria-label={status}
    >
      {label}
    </span>
  );
}

export function PlayerStatusLogoCluster({
  logoKey,
  status,
  logoSize = 44,
  className = '',
  logoClassName = '',
}) {
  const label = getAvailabilityStatusLabel(status, false);
  if (!logoKey && !label) return null;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {logoKey ? (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${logoKey}.png`}
          alt=""
          aria-hidden="true"
          className={`shrink-0 ${logoClassName}`}
          style={{ width: logoSize, height: logoSize, objectFit: 'contain', opacity: 0.72 }}
          onError={event => { event.currentTarget.style.visibility = 'hidden'; }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="shrink-0"
          style={{ width: logoSize, height: logoSize }}
        />
      )}
      <PlayerStatusBadge status={status} />
    </div>
  );
}
