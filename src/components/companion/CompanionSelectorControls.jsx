import { useMemo, useRef } from 'react';
import HorizontalScrollCue from '../HorizontalScrollCue';
import useHorizontalScrollCue from '../../hooks/useHorizontalScrollCue';
import useMenuEscapeClose from '../../hooks/useMenuEscapeClose';

export function CompanionMenuChevron({ open = false, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--color-label-tertiary)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function CompanionMenuTrigger({
  kicker = null,
  value,
  open = false,
  engaged = false,
  className = '',
  ...buttonProps
}) {
  return (
    <button
      {...buttonProps}
      type="button"
      className={[
        'companion-menu-trigger',
        engaged ? 'is-engaged' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-expanded={open}
    >
      {kicker && <span className="companion-menu-trigger__kicker">{kicker}</span>}
      <span className="companion-menu-trigger__value">{value}</span>
      <CompanionMenuChevron open={open} />
    </button>
  );
}

export function CompanionSelectorRail({
  label = null,
  ariaLabel,
  children,
  className = '',
  wrapOnDesktop = false,
  style = null,
}) {
  const railRef = useRef(null);
  const scrollCue = useHorizontalScrollCue(railRef, [children]);

  return (
    <div className={`companion-selector-rail-row ${className}`} style={style}>
      {label && (
        <span className="companion-selector-rail-label">
          {label}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <div
          ref={railRef}
          className={`companion-selector-rail${wrapOnDesktop ? ' companion-selector-rail--wrap-desktop' : ''}`}
          role="group"
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        >
          {children}
        </div>
        <HorizontalScrollCue
          left={scrollCue.left}
          right={scrollCue.right}
          targetRef={railRef}
          label="selector"
        />
      </div>
    </div>
  );
}

export function CompanionSelectorButton({
  active = false,
  disabled = false,
  selected = undefined,
  size = 'sm',
  variant = 'option',
  className = '',
  style = null,
  children,
  type = 'button',
  ...buttonProps
}) {
  const isActive = selected ?? active;
  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled}
      className={[
        'companion-selector-button',
        `companion-selector-button--${size}`,
        `companion-selector-button--${variant}`,
        isActive ? 'is-active' : '',
        disabled ? 'is-disabled' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={style}
      aria-pressed={
        buttonProps['aria-haspopup'] || buttonProps['aria-expanded'] !== undefined
          ? buttonProps['aria-pressed']
          : (buttonProps['aria-pressed'] ?? isActive)
      }
    >
      {children}
    </button>
  );
}

export function CompanionSegmentedControl({
  title = null,
  value,
  options,
  onChange,
  ariaLabel,
  columns = null,
  className = '',
}) {
  return (
    <div className={`companion-segmented ${className}`}>
      {title && (
        <div className="companion-segmented__title">
          {title}
        </div>
      )}
      <div
        className="companion-segmented__grid"
        role="group"
        aria-label={ariaLabel ?? title}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : null}
      >
        {options.map((option) => (
          <CompanionSelectorButton
            key={option.value}
            active={option.value === value}
            disabled={option.disabled}
            size="md"
            variant="segment"
            onClick={() => onChange?.(option.value)}
          >
            {option.label}
          </CompanionSelectorButton>
        ))}
      </div>
    </div>
  );
}

export function CompanionSearchField({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  style = null,
  inputProps = {},
}) {
  return (
    <div className={`companion-search-field ${className}`} style={style}>
      <svg
        className="companion-search-field__icon"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
      </svg>
      <input
        {...inputProps}
        type={inputProps.type ?? 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="companion-search-field__input"
      />
    </div>
  );
}

export function CompanionFantasyTeamMenu({
  open,
  options,
  selectedIds = [],
  selectedOptions = null,
  onOpenChange,
  onChange,
  mode = 'multi',
  includeAll = true,
  allLabel = 'All Teams',
  placeholder = 'All Teams',
  kicker = 'Team',
  menuLabel = 'Fantasy team selector',
  pluralLabel = 'Fantasy Teams',
  className = '',
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isSingleSelect = mode === 'single';
  useMenuEscapeClose(open, onOpenChange);
  const resolvedSelectedOptions = selectedOptions ?? options.filter((option) => selectedSet.has(option.id));
  const buttonLabel = resolvedSelectedOptions.length === 0
    ? placeholder
    : resolvedSelectedOptions.length === 1
      ? resolvedSelectedOptions[0].name
      : `${resolvedSelectedOptions.length} ${pluralLabel}`;

  const commitSelection = (nextIds) => {
    onChange?.(nextIds);
    if (mode === 'single') onOpenChange?.(false);
  };

  const toggleRoster = (rosterId) => {
    if (mode === 'single') {
      commitSelection([rosterId]);
      return;
    }

    const next = selectedSet.has(rosterId)
      ? selectedIds.filter((id) => id !== rosterId)
      : [...selectedIds, rosterId];
    commitSelection(next);
  };

  return (
    <div className={`relative w-full min-w-0 max-w-full min-[481px]:w-[clamp(240px,30vw,340px)] ${className}`}>
      <CompanionMenuTrigger
        kicker={kicker}
        value={buttonLabel}
        open={open}
        engaged={selectedIds.length > 0}
        onClick={() => onOpenChange?.(!open)}
        aria-haspopup="menu"
      />

      {open && (
        <>
          <button
            type="button"
            aria-label="Close fantasy team menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => onOpenChange?.(false)}
            tabIndex={-1}
          />
          <div
            role="menu"
            aria-label={menuLabel}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl py-1 shadow-xl"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-separator)',
              boxShadow: '0 18px 40px color-mix(in srgb, var(--color-label) 18%, transparent)',
            }}
          >
            {includeAll && (
              <button
                type="button"
                role={isSingleSelect ? 'menuitemradio' : 'menuitemcheckbox'}
                aria-checked={selectedIds.length === 0}
                className={`companion-menu-item flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold${selectedIds.length === 0 ? ' is-checked' : ''}`}
                onClick={() => commitSelection([])}
              >
                <CompanionMenuSelectionMark checked={selectedIds.length === 0} mode={mode} />
                <span className="min-w-0 flex-1 truncate">{allLabel}</span>
              </button>
            )}

            <div className="max-h-72 overflow-y-auto py-1">
              {options.map((roster) => {
                const checked = selectedSet.has(roster.id);
                return (
                  <button
                    key={roster.id}
                    type="button"
                    role={isSingleSelect ? 'menuitemradio' : 'menuitemcheckbox'}
                    aria-checked={checked}
                    className={`companion-menu-item flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold${checked ? ' is-checked' : ''}`}
                    onClick={() => toggleRoster(roster.id)}
                  >
                    <CompanionMenuSelectionMark checked={checked} mode={mode} />
                    {roster.avatarHash ? (
                      <img
                        src={`https://sleepercdn.com/avatars/thumbs/${roster.avatarHash}`}
                        alt={roster.name}
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[length:var(--type-label)] font-bold"
                        style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
                      >
                        {roster.name[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{roster.name}{roster.isMe ? ' (Me)' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CompanionMenuSelectionMark({ checked, mode = 'multi' }) {
  if (mode === 'single') {
    return (
      <span
        aria-hidden="true"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
        style={{
          background: checked ? 'var(--color-signature)' : 'var(--color-fill)',
          border: `1px solid ${checked ? 'var(--color-signature)' : 'var(--color-separator)'}`,
        }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: checked ? 'var(--color-signature-fg)' : 'transparent' }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[length:var(--type-label)] font-black"
      style={{
        background: checked ? 'var(--color-signature)' : 'var(--color-fill)',
        border: `1px solid ${checked ? 'var(--color-signature)' : 'var(--color-separator)'}`,
        color: checked ? 'var(--color-signature-fg)' : 'transparent',
      }}
    >
      ✓
    </span>
  );
}
