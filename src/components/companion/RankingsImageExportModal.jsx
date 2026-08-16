import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import { normalizeRankingsImageCount } from '../../utils/rankingsExport.js';

export default function RankingsImageExportModal({
  maxCount,
  sortLabel,
  scoringModelLabel,
  scoringSourceLabel,
  scoringStatsLabel,
  contextLabel,
  onClose,
  onExport,
}) {
  const initialCount = Math.min(25, maxCount);
  const [count, setCount] = useState(String(initialCount));
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const normalizedCount = String(count).trim()
    ? normalizeRankingsImageCount(count, maxCount)
    : 0;
  const quickCounts = useMemo(
    () => [...new Set([10, 25, 50, maxCount])].filter(value => value > 0 && value <= maxCount),
    [maxCount],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!normalizedCount || isExporting) return;
    setError('');
    setIsExporting(true);
    try {
      await onExport(normalizedCount);
      onClose();
    } catch (exportError) {
      setError(exportError?.message ?? 'GridShift could not create the image. Please try again.');
      setIsExporting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Export rankings image"
      containerClassName="max-w-xl flex max-h-[88vh] flex-col"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <header
          className="flex shrink-0 items-start justify-between gap-5 px-5 py-4 sm:px-6"
          style={{ borderBottom: '1px solid var(--color-separator)' }}
        >
          <div className="min-w-0">
            <div
              className="font-display text-[length:var(--type-label)] font-extrabold uppercase tracking-[0.16em]"
              style={{ color: 'var(--color-signature)' }}
            >
              Rankings export
            </div>
            <h2
              className="mt-1 font-display text-2xl font-extrabold uppercase tracking-wide"
              style={{ color: 'var(--color-label)' }}
            >
              Create top-player image
            </h2>
            <p
              className="mt-1 max-w-md text-[length:var(--type-meta)] leading-5"
              style={{ color: 'var(--color-label-secondary)' }}
            >
              Download the first players from the ranking order you are viewing now.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close image export"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors active:scale-[0.97]"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <label
            htmlFor="rankings-image-player-count"
            className="block text-[length:var(--type-label)] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'var(--color-label-tertiary)' }}
          >
            Number of players
          </label>
          <div className="mt-2 flex items-stretch gap-2">
            <input
              id="rankings-image-player-count"
              type="number"
              min="1"
              max={maxCount}
              step="1"
              value={count}
              onChange={event => setCount(event.target.value)}
              onBlur={() => setCount(String(normalizedCount || 1))}
              className="min-h-11 min-w-0 flex-1 rounded-xl px-4 font-semibold tabular-nums outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-separator)',
                color: 'var(--color-label)',
                fontSize: '16px',
              }}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Quick player counts">
              {quickCounts.map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={normalizedCount === value}
                  onClick={() => setCount(String(value))}
                  className="min-h-11 min-w-11 rounded-xl px-3 text-sm font-bold tabular-nums transition-colors active:scale-[0.97]"
                  style={{
                    background: normalizedCount === value ? 'var(--color-signature)' : 'var(--color-fill)',
                    color: normalizedCount === value ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                    border: '1px solid var(--color-separator)',
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[length:var(--type-label)]" style={{ color: 'var(--color-label-tertiary)' }}>
            Choose from 1 to {maxCount} currently visible player{maxCount === 1 ? '' : 's'}.
          </p>

          <section
            className="mt-5 overflow-hidden rounded-2xl"
            aria-label="Image header preview"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-separator)' }}
          >
            <div className="h-1.5" style={{ background: 'var(--color-signature)' }} />
            <div className="px-4 py-4 sm:px-5">
              <div
                className="font-display text-[length:var(--type-label)] font-extrabold uppercase tracking-[0.16em]"
                style={{ color: 'var(--color-label-tertiary)' }}
              >
                GridShift fantasy rankings
              </div>
              <div className="mt-1 font-display text-3xl font-black uppercase tracking-wide" style={{ color: 'var(--color-label)' }}>
                Top {normalizedCount || 1} players
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ExportContextBlock label="Sorting" value={sortLabel} />
                <ExportContextBlock
                  label="Scoring model"
                  value={scoringModelLabel}
                  detail={scoringSourceLabel}
                  secondaryDetail={scoringStatsLabel}
                />
              </div>
              <p className="mt-3 text-[length:var(--type-label)] leading-5" style={{ color: 'var(--color-label-tertiary)' }}>
                {contextLabel}
              </p>
            </div>
          </section>

          {error && (
            <p className="mt-4 text-sm font-semibold" role="alert" style={{ color: 'var(--color-accent-red)' }}>
              {error}
            </p>
          )}
        </div>

        <footer
          className="flex shrink-0 flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end sm:px-6"
          style={{ borderTop: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="min-h-11 rounded-xl px-5 text-sm font-bold transition-colors active:scale-[0.97] disabled:opacity-50"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!normalizedCount || isExporting}
            className="min-h-11 rounded-xl px-5 text-sm font-extrabold transition-opacity active:scale-[0.97] disabled:opacity-50"
            style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
          >
            {isExporting ? 'Creating image…' : `Download top ${normalizedCount || 1}`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ExportContextBlock({ label, value, detail = null, secondaryDetail = null }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--color-fill)' }}>
      <div
        className="text-[length:var(--type-micro)] font-extrabold uppercase tracking-[0.14em]"
        style={{ color: 'var(--color-label-tertiary)' }}
      >
        {label}
      </div>
      <div className="mt-1 text-[length:var(--type-meta)] font-bold leading-5" style={{ color: 'var(--color-label)' }}>
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 text-[length:var(--type-label)] leading-4" style={{ color: 'var(--color-label-tertiary)' }}>
          {detail}
        </div>
      )}
      {secondaryDetail && (
        <div className="mt-0.5 text-[length:var(--type-label)] leading-4" style={{ color: 'var(--color-label-tertiary)' }}>
          {secondaryDetail}
        </div>
      )}
    </div>
  );
}
