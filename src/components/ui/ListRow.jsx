/**
 * Generic flat row (Stage 5.1) for lists that are not player rows (player and
 * asset rows keep the Companion shared row system). A row with `onClick`
 * renders as a button and shows hover, active, focus, and a chevron.
 */
function Chevron() {
  return (
    <svg className="gs-row__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function ListRow({
  title,
  secondary = null,
  leading = null,
  trailing = null,
  onClick = null,
  selected = false,
  disabled = false,
  chevron = undefined,
  className = '',
  ...rest
}) {
  const interactive = Boolean(onClick);
  const classes = [
    'gs-row',
    interactive ? 'is-interactive' : '',
    selected ? 'is-selected' : '',
    disabled ? 'is-disabled' : '',
    className,
  ].filter(Boolean).join(' ');
  const content = (
    <>
      {leading}
      <span className="gs-row__body">
        <span className="gs-text-row-title">{title}</span>
        {secondary && <span className="gs-text-secondary">{secondary}</span>}
      </span>
      {(trailing || (chevron ?? interactive)) && (
        <span className="gs-row__trailing">
          {trailing}
          {(chevron ?? interactive) && <Chevron />}
        </span>
      )}
    </>
  );
  if (!interactive) return <div className={classes} {...rest}>{content}</div>;
  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled} aria-current={selected || undefined} {...rest}>
      {content}
    </button>
  );
}
