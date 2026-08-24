const SIZES = { sm: 14, md: 20 };

/**
 * Shared indeterminate spinner — the only sanctioned spinner in the app.
 * Strokes with `currentColor`, so it takes the surrounding text tone.
 */
export default function Spinner({ size = 'sm', className = '', style }) {
  const px = SIZES[size] ?? SIZES.sm;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`shrink-0 ${className}`}
      style={{ animation: 'spin 0.8s linear infinite', ...style }}
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
