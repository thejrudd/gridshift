import { useState } from 'react';
import { CompanionMenuTrigger, CompanionMenuSelectionMark } from '../companion/CompanionSelectorControls';
import useMenuEscapeClose from '../../hooks/useMenuEscapeClose';
import Spinner from './Spinner';

/**
 * Compact always-visible league-year selector for mobile sub-nav rows.
 * Two taps: open the menu, pick a year. Shows a pending spinner and disables
 * while a season switch is in flight.
 */
export default function SeasonChip({ season, seasons = [], seasonSwitching = null, onChange, compact = false, className = '' }) {
  const [open, setOpen] = useState(false);
  useMenuEscapeClose(open, setOpen);

  if (seasons.length < 2) return null;

  const pending = seasonSwitching != null;
  const value = pending
    ? (
      <span className="inline-flex items-center gap-1.5">
        <Spinner size="sm" />
        {seasonSwitching}
      </span>
    )
    : String(season);

  return (
    <div className={`relative shrink-0 ${className}`}>
      <CompanionMenuTrigger
        value={value}
        open={open}
        disabled={pending}
        style={compact
          ? { width: 'auto', minHeight: 30, padding: '3px 7px 3px 10px', borderRadius: 8 }
          : { width: 'auto' }}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-label="League year"
      />

      {open && (
        <>
          <button
            type="button"
            aria-label="Close league year menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            role="menu"
            aria-label="League year selector"
            className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[120px] overflow-hidden rounded-xl py-1 shadow-xl"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-separator)',
              boxShadow: '0 18px 40px color-mix(in srgb, var(--color-label) 18%, transparent)',
            }}
          >
            {seasons.map((year) => {
              const checked = String(season) === String(year);
              return (
                <button
                  key={year}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  className={`companion-menu-item flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold${checked ? ' is-checked' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    if (!checked) onChange?.(year);
                  }}
                >
                  <CompanionMenuSelectionMark checked={checked} mode="single" />
                  <span className="min-w-0 flex-1">{year}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
