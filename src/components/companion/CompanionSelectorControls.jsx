export function CompanionSelectorRail({
  label = null,
  ariaLabel,
  children,
  className = '',
  wrapOnDesktop = true,
  style = null,
}) {
  return (
    <div className={`companion-selector-rail-row ${className}`} style={style}>
      {label && (
        <span className="companion-selector-rail-label">
          {label}
        </span>
      )}
      <div
        className={`companion-selector-rail${wrapOnDesktop ? ' companion-selector-rail--wrap-desktop' : ''}`}
        role="group"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      >
        {children}
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
      aria-pressed={buttonProps['aria-pressed'] ?? isActive}
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
