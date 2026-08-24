import { useState } from 'react';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import {
  getCompanionPositionColor,
  getNflTeamLogoUrl,
  getPositionTextColor,
  getSleeperAvatarUrl,
  getSleeperPlayerImageUrl,
} from '../../utils/companionAssetVisuals.js';

function assetInitials(label) {
  return String(label ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

export default function CompanionAssetRow({
  asset,
  darkMode = false,
  selected = false,
  disabled = false,
  interactive = undefined,
  showSelectionMark = false,
  metaPrefix = undefined,
  metaSegments = [],
  valueKicker = null,
  valueLabel = null,
  valueTitle = undefined,
  leading = null,
  trailing = null,
  onClick = null,
  onRemove = null,
  removeLabel = null,
  title = null,
  ariaLabel = null,
  dataTestId = null,
  className = '',
  loading = 'lazy',
  draggable = undefined,
  onDragStart = undefined,
  role = undefined,
  tabIndex = undefined,
  teamThemeOptions = undefined,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const safeAsset = asset ?? {};
  const type = safeAsset.type ?? 'player';
  const isPlayer = type === 'player';
  const isPick = type === 'pick';
  const isManager = type === 'manager';
  const label = safeAsset.label ?? safeAsset.name ?? 'Asset';
  const isInteractive = interactive ?? Boolean(onClick);
  const theme = isPlayer && safeAsset.team ? getTeamVisualTheme(safeAsset.team, darkMode, teamThemeOptions) : null;
  const hasTeamGradient = isPlayer && theme?.gradient;
  const accentColor = theme?.borderColor ?? (isPick ? 'var(--color-signature)' : 'var(--color-accent)');
  const rowBg = hasTeamGradient ? theme.gradient : (theme?.tint ?? (selected ? 'var(--color-fill-secondary)' : 'var(--color-fill)'));
  const hoverBg = theme?.hoverTint ?? 'var(--color-fill-secondary)';
  const rowForeground = hasTeamGradient ? theme.gradientForeground : 'var(--color-label)';
  const rowMuted = hasTeamGradient ? theme.gradientMuted : 'var(--color-label-secondary)';
  const rowSubtle = hasTeamGradient ? theme.gradientSubtle : 'var(--color-fill-secondary)';
  const rowValueForeground = hasTeamGradient ? theme.gradientEndForeground : rowForeground;
  const rowValueMuted = hasTeamGradient ? theme.gradientEndMuted : rowMuted;
  const positionColor = isPlayer ? getCompanionPositionColor(safeAsset.position) : null;
  const positionTextColor = positionColor ? getPositionTextColor(positionColor) : rowForeground;
  const normalizedMeta = (metaSegments ?? []).filter(Boolean);
  const prefix = metaPrefix ?? (isPick ? 'Draft Asset' : isManager ? 'Manager' : 'Player');
  const imageUrl = safeAsset.imageUrl
    ?? (isPlayer ? getSleeperPlayerImageUrl(safeAsset.id) : null)
    ?? (isManager ? getSleeperAvatarUrl(safeAsset.avatarHash) : null);
  const teamLogoUrl = isPlayer ? getNflTeamLogoUrl(safeAsset.logoKey ?? theme?.logoKey) : null;
  const rowTitle = title ?? [label, ...normalizedMeta, valueLabel ? `${valueKicker ?? 'Value'} ${valueLabel}` : null].filter(Boolean).join(' · ');
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isInteractive && isHovered,
    color: accentColor,
    cardColor: theme?.color ?? null,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: accentColor,
  });
  const baseShadow = isInteractive && isHovered ? '0 5px 12px rgba(12,15,20,0.09)' : 'none';
  const rowShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

  const activate = () => {
    if (!disabled) onClick?.(safeAsset);
  };

  if (!asset) return null;

  return (
    <div
      className={[
        'trade-selection-row',
        'companion-asset-row',
        isInteractive ? 'is-interactive' : '',
        selected ? 'is-selected' : '',
        disabled ? 'is-disabled' : '',
        className,
      ].filter(Boolean).join(' ')}
      data-testid={dataTestId}
      draggable={disabled ? false : draggable}
      onDragStart={disabled ? undefined : onDragStart}
      style={{
        background: isHovered && !hasTeamGradient ? hoverBg : rowBg,
        '--trade-selection-accent': selected ? 'var(--color-signature)' : accentColor,
        '--trade-selection-fg': rowForeground,
        '--trade-selection-muted': rowMuted,
        '--trade-selection-subtle': rowSubtle,
        '--trade-selection-value-fg': rowValueForeground,
        '--trade-selection-value-muted': rowValueMuted,
        boxShadow: selected ? `${rowShadow === 'none' ? '' : `${rowShadow}, `}inset 3px 0 0 var(--color-signature)` : rowShadow,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : isInteractive || draggable ? 'pointer' : undefined,
        transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), opacity 150ms',
      }}
      onClick={isInteractive ? activate : undefined}
      onMouseMove={isInteractive ? glowHandlers.onMouseMove : undefined}
      onMouseEnter={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onBlur={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      onKeyDown={isInteractive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      } : undefined}
      role={role ?? (isInteractive ? 'button' : undefined)}
      tabIndex={tabIndex ?? (isInteractive && !disabled ? 0 : undefined)}
      title={rowTitle}
      aria-label={ariaLabel ?? (isInteractive ? `Open ${label}` : undefined)}
      aria-disabled={disabled || undefined}
    >
      {borderOverlay}
      {hasTeamGradient && (
        <div
          className="trade-selection-row__gradient-overlay"
          style={{ background: theme.gradientOverlay }}
          aria-hidden="true"
        />
      )}
      {showSelectionMark && (
        <span
          className="trade-selection-row__select-mark"
          style={{
            background: selected ? 'var(--color-signature)' : 'transparent',
            borderColor: selected ? 'var(--color-signature)' : rowMuted,
            color: selected ? 'var(--color-signature-fg)' : 'transparent',
          }}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
      {leading}
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="trade-selection-row__avatar"
          loading={loading}
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      {!imageUrl && isManager && (
        <div className="trade-selection-row__avatar companion-asset-row__initials" style={{ color: rowMuted }}>
          {assetInitials(label)}
        </div>
      )}
      {isPick && (
        <div className="trade-selection-row__pick-mark">
          PICK
        </div>
      )}
      {isPlayer && (
        <span
          className="trade-selection-row__position"
          style={{
            background: positionColor ?? rowSubtle,
            color: positionTextColor,
            boxShadow: positionColor ? '0 4px 10px rgba(0,0,0,0.16)' : 'none',
          }}
        >
          {safeAsset.position || '—'}
        </span>
      )}
      <div className="trade-selection-row__body">
        <div className="trade-selection-row__identity" style={{ color: rowForeground }}>
          {label}
        </div>
        {normalizedMeta.length > 0 && (
          <div className="trade-selection-row__meta">
            {prefix && <span className="trade-selection-row__meta-prefix">{prefix}</span>}
            {normalizedMeta.map((segment) => (
              <span key={segment} className="trade-selection-row__meta-item">{segment}</span>
            ))}
          </div>
        )}
      </div>
      {teamLogoUrl ? (
        <img
          src={teamLogoUrl}
          aria-hidden="true"
          alt=""
          className="trade-selection-row__team-logo"
          loading={loading}
          decoding="async"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      ) : isPlayer ? (
        <span className="trade-selection-row__team-logo-spacer" aria-hidden="true" />
      ) : null}
      {valueLabel != null && (
        <div className="trade-selection-row__value">
          {valueKicker && <span className="trade-selection-row__value-kicker">{valueKicker}</span>}
          <span className="trade-selection-row__value-number" title={valueTitle}>
            {valueLabel}
          </span>
        </div>
      )}
      {trailing}
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(safeAsset);
          }}
          className="trade-selection-row__remove"
          aria-label={removeLabel ?? `Remove ${label}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
