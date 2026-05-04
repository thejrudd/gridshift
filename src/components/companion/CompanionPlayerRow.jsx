import { useRef, useState } from 'react';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useCompanionPlayerLocalContrast from '../../hooks/useCompanionPlayerLocalContrast.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import {
  getCompanionInitials,
  getCompanionPlayerImageUrl,
  getCompanionPositionColor,
  getCompanionTeamLogoUrl,
  getPositionTextColor,
} from '../../utils/companionAssetVisuals.js';

function normalizeSlotItems(items) {
  if (!items) return [];
  return Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean);
}

function getPlayerName(player, fallback = 'Player') {
  return player?.label ?? player?.name ?? player?.fullName ?? player?.playerName ?? fallback;
}

function getPlayerPosition(player) {
  return player?.position ?? player?.fantasyPosition ?? player?.pos ?? null;
}

function getPlayerTeam(player) {
  return player?.team ?? player?.nflTeam ?? player?.teamAbbr ?? player?.teamCode ?? null;
}

export function CompanionPlayerLocalContrastText({
  children,
  className = '',
  style = null,
  title = undefined,
}) {
  const ref = useRef(null);
  const contrast = useCompanionPlayerLocalContrast(ref);

  if (!children) return null;

  return (
    <span
      ref={ref}
      className={[
        'companion-player-row__local-contrast-text',
        className,
      ].filter(Boolean).join(' ')}
      style={{
        color: contrast?.color ?? 'var(--companion-player-fg, var(--color-label))',
        textShadow: contrast?.textShadow ?? 'none',
        ...style,
      }}
      title={title}
    >
      {children}
    </span>
  );
}

export function CompanionPlayerMetric({
  label,
  value,
  kicker = null,
  title = undefined,
  tone = 'default',
  align = 'end',
  compact = false,
  className = '',
}) {
  if (value == null && label == null && kicker == null) return null;

  return (
    <div
      className={[
        'companion-player-row__metric',
        `is-${align}`,
        compact ? 'is-compact' : '',
        tone !== 'default' ? `is-${tone}` : '',
        className,
      ].filter(Boolean).join(' ')}
      title={title}
    >
      {kicker && <span className="companion-player-row__metric-kicker">{kicker}</span>}
      {value != null && <span className="companion-player-row__metric-value">{value}</span>}
      {label && <span className="companion-player-row__metric-label">{label}</span>}
    </div>
  );
}

export function CompanionPlayerStatus({
  children,
  label = null,
  tone = 'neutral',
  title = undefined,
  className = '',
  localContrast = tone !== 'positive' && tone !== 'negative',
}) {
  const content = children ?? label;
  const ref = useRef(null);
  const contrast = useCompanionPlayerLocalContrast(ref, localContrast);
  if (!content) return null;

  return (
    <span
      ref={ref}
      className={[
        'companion-player-row__status',
        `is-${tone}`,
        localContrast ? 'has-local-contrast' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={contrast ? {
        color: contrast.color,
        background: contrast.background,
        borderColor: contrast.borderColor,
        textShadow: contrast.textShadow,
      } : null}
      title={title}
    >
      {content}
    </span>
  );
}

export function CompanionPlayerAction({
  children,
  label,
  onClick,
  disabled = false,
  selected = false,
  title = undefined,
  className = '',
}) {
  return (
    <button
      type="button"
      className={[
        'companion-player-row__action',
        selected ? 'is-selected' : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick?.(event);
      }}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export default function CompanionPlayerRow({
  player,
  darkMode = false,
  selected = false,
  disabled = false,
  interactive = undefined,
  compact = false,
  showAvatar = true,
  showPosition = true,
  showTeamLogo = true,
  showSelectionMark = false,
  metaPrefix = undefined,
  metaSegments = [],
  leading = null,
  trailing = null,
  columns = null,
  actions = null,
  status = null,
  gridTemplate = undefined,
  compactGridTemplate = undefined,
  columnGridTemplate = undefined,
  name = undefined,
  identityAccessory = null,
  title = null,
  ariaLabel = null,
  onClick = null,
  onMouseEnter = undefined,
  onMouseLeave = undefined,
  className = '',
  style = null,
  dataTestId = null,
  loading = 'lazy',
  role = undefined,
  tabIndex = undefined,
  teamThemeOptions = undefined,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null);
  const [failedTeamLogoUrl, setFailedTeamLogoUrl] = useState(null);
  const safePlayer = player ?? {};
  const label = name ?? getPlayerName(safePlayer);
  const position = getPlayerPosition(safePlayer);
  const team = getPlayerTeam(safePlayer);
  const isInteractive = interactive ?? Boolean(onClick);
  const theme = team ? getTeamVisualTheme(team, darkMode, teamThemeOptions) : null;
  const hasTeamGradient = Boolean(theme?.gradient);
  const accentColor = theme?.borderColor ?? getCompanionPositionColor(position) ?? 'var(--color-accent)';
  const rowBg = hasTeamGradient ? theme.gradient : (theme?.tint ?? (selected ? 'var(--color-fill-secondary)' : 'var(--color-fill)'));
  const hoverBg = theme?.hoverTint ?? 'var(--color-fill-secondary)';
  const rowForeground = hasTeamGradient ? theme.gradientForeground : 'var(--color-label)';
  const rowMuted = hasTeamGradient ? theme.gradientMuted : 'var(--color-label-secondary)';
  const rowSubtle = hasTeamGradient ? theme.gradientSubtle : 'var(--color-fill-secondary)';
  const rowValueForeground = hasTeamGradient ? theme.gradientEndForeground : rowForeground;
  const rowValueMuted = hasTeamGradient ? theme.gradientEndMuted : rowMuted;
  const positionColor = getCompanionPositionColor(position);
  const positionTextColor = positionColor ? getPositionTextColor(positionColor) : rowForeground;
  const imageUrl = getCompanionPlayerImageUrl(safePlayer);
  const teamLogoUrl = showTeamLogo ? getCompanionTeamLogoUrl(safePlayer, theme) : null;
  const avatarFailed = Boolean(imageUrl && failedAvatarUrl === imageUrl);
  const teamLogoFailed = Boolean(teamLogoUrl && failedTeamLogoUrl === teamLogoUrl);
  const normalizedMeta = normalizeSlotItems(metaSegments);
  const normalizedColumns = normalizeSlotItems(columns);
  const normalizedActions = normalizeSlotItems(actions);
  const resolvedGridTemplate = compact ? (compactGridTemplate ?? gridTemplate) : gridTemplate;
  const rowTitle = title ?? [label, ...normalizedMeta].filter(Boolean).join(' · ');
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

  const rootStyle = {
    background: isHovered && !hasTeamGradient ? hoverBg : rowBg,
    '--companion-player-accent': selected ? 'var(--color-signature)' : accentColor,
    '--companion-player-fg': rowForeground,
    '--companion-player-muted': rowMuted,
    '--companion-player-subtle': rowSubtle,
    '--companion-player-value-fg': rowValueForeground,
    '--companion-player-value-muted': rowValueMuted,
    '--companion-player-start-fg': theme?.gradientStartForeground ?? rowForeground,
    '--companion-player-mid-fg': theme?.gradientMidForeground ?? rowForeground,
    '--companion-player-end-fg': theme?.gradientEndForeground ?? rowValueForeground,
    '--companion-player-full-fg': theme?.gradientFullForeground ?? rowForeground,
    gridTemplateColumns: resolvedGridTemplate,
    boxShadow: selected ? `${rowShadow === 'none' ? '' : `${rowShadow}, `}inset 3px 0 0 var(--color-signature)` : rowShadow,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'default' : isInteractive ? 'pointer' : undefined,
    ...style,
  };

  const activate = (event) => {
    if (!disabled) onClick?.(safePlayer, event);
  };

  if (!player) return null;

  return (
    <div
      className={[
        'companion-player-row',
        compact ? 'is-compact' : '',
        isInteractive ? 'is-interactive' : '',
        selected ? 'is-selected' : '',
        disabled ? 'is-disabled' : '',
        hasTeamGradient ? 'has-team-gradient' : '',
        className,
      ].filter(Boolean).join(' ')}
      data-testid={dataTestId}
      style={rootStyle}
      onClick={isInteractive ? activate : undefined}
      onMouseMove={isInteractive ? glowHandlers.onMouseMove : undefined}
      onMouseEnter={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
        onMouseLeave?.(event);
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
          activate(event);
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
          className="companion-player-row__gradient-overlay"
          style={{ background: theme.gradientOverlay }}
          aria-hidden="true"
        />
      )}
      {showSelectionMark && (
        <span
          className="companion-player-row__select-mark"
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
      {leading && <div className="companion-player-row__leading">{leading}</div>}
      {showAvatar && (
        imageUrl && !avatarFailed ? (
          <img
            src={imageUrl}
            alt=""
            className="companion-player-row__avatar"
            loading={loading}
            decoding="async"
            onError={() => setFailedAvatarUrl(imageUrl)}
          />
        ) : (
          <div className="companion-player-row__avatar companion-player-row__avatar-fallback" style={{ color: rowMuted }}>
            {getCompanionInitials(label)}
          </div>
        )
      )}
      {showPosition && (
        <span
          className="companion-player-row__position"
          style={{
            background: positionColor ?? rowSubtle,
            color: positionTextColor,
            boxShadow: positionColor ? '0 4px 10px rgba(0,0,0,0.16)' : 'none',
          }}
        >
          {position || '-'}
        </span>
      )}
      <div className="companion-player-row__body">
        <div className="companion-player-row__identity" style={{ color: rowForeground }}>
          <span className="companion-player-row__identity-label">{label}</span>
          {identityAccessory ? (
            <span className="companion-player-row__identity-accessory">
              {identityAccessory}
            </span>
          ) : null}
        </div>
        {normalizedMeta.length > 0 && (
          <div className="companion-player-row__meta">
            {metaPrefix && <span className="companion-player-row__meta-prefix">{metaPrefix}</span>}
            {normalizedMeta.map((segment) => (
              <span key={String(segment)} className="companion-player-row__meta-item">{segment}</span>
            ))}
          </div>
        )}
      </div>
      {teamLogoUrl && !teamLogoFailed ? (
        <img
          src={teamLogoUrl}
          aria-hidden="true"
          alt=""
          className="companion-player-row__team-logo"
          loading={loading}
          decoding="async"
          onError={() => setFailedTeamLogoUrl(teamLogoUrl)}
        />
      ) : showTeamLogo ? (
        <span className="companion-player-row__team-logo-spacer" aria-hidden="true" />
      ) : null}
      {normalizedColumns.length > 0 && (
        <div
          className="companion-player-row__columns"
          style={{ gridTemplateColumns: columnGridTemplate }}
        >
          {normalizedColumns.map((column, index) => (
            <div key={column?.key ?? index} className="companion-player-row__column">
              {column}
            </div>
          ))}
        </div>
      )}
      {status && <div className="companion-player-row__status-slot">{status}</div>}
      {normalizedActions.length > 0 && (
        <div className="companion-player-row__actions">
          {normalizedActions.map((action, index) => (
            <div key={action?.key ?? index} className="companion-player-row__action-slot">
              {action}
            </div>
          ))}
        </div>
      )}
      {trailing && <div className="companion-player-row__trailing">{trailing}</div>}
    </div>
  );
}
