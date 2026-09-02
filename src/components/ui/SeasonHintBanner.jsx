import { useSeasonHint } from '../../utils/seasonAvailability';
import Spinner from './Spinner';

/**
 * One-line hint shown when the selected league year can't show what the user
 * is looking for, with a one-tap switch to the year that can.
 *
 * Usage:
 *   <SeasonHintBanner capability="current-only" feature="Live scoring" />
 *   <SeasonHintBanner capability="current-only" feature="Trade" currentSeason="2026" />
 *   <SeasonHintBanner isEmpty={rows.length === 0} />
 *
 * Renders nothing when no hint applies.
 */
export default function SeasonHintBanner({ capability, isEmpty = false, feature, currentSeason, className = '' }) {
  const hint = useSeasonHint({ capability, isEmpty, feature, currentSeason });
  if (!hint) return null;

  const pending = hint.seasonSwitching != null;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${className}`}
      style={{
        background: 'var(--color-fill-secondary)',
        borderLeft: '3px solid var(--color-signature)',
      }}
      role="status"
    >
      <span className="min-w-0 flex-1 text-xs font-medium" style={{ color: 'var(--color-label)' }}>
        {hint.message}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => hint.changeSeason(hint.targetSeason)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-opacity active:opacity-70"
        style={{
          background: 'var(--color-signature)',
          color: 'var(--color-signature-fg)',
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending && <Spinner size="sm" style={{ color: 'var(--color-signature-fg)' }} />}
        Switch to {hint.targetSeason}
      </button>
    </div>
  );
}
