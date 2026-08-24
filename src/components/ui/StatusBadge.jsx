const KINDS = {
  beta: { label: 'Beta', background: 'var(--color-signature)', color: 'var(--color-signature-fg)' },
  alpha: { label: 'Alpha', background: 'var(--color-alpha)', color: 'var(--color-alpha-fg)' },
  comingSoon: { label: 'Coming Soon', background: 'var(--color-fill-secondary)', color: 'var(--color-label-secondary)' },
};

const SIZES = {
  md: { fontSize: 'var(--type-micro)', padding: '1px 5px', lineHeight: '14px' },
  sm: { fontSize: 'var(--type-micro)', padding: '1px 4px', lineHeight: '12px' },
};

/**
 * The single beta/alpha marker used across nav surfaces — one label, one
 * shape, one color, everywhere. Position from the caller; never restyle.
 */
export default function StatusBadge({ kind = 'beta', size = 'md', className = '', style }) {
  const k = KINDS[kind] ?? KINDS.beta;
  const s = SIZES[size] ?? SIZES.md;
  return (
    <span
      className={className}
      style={{
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderRadius: '4px',
        background: k.background,
        color: k.color,
        ...s,
        ...style,
      }}
    >
      {k.label}
    </span>
  );
}
