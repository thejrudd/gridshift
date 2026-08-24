import { useCallback, useEffect, useRef } from 'react';
import { useSleeperLeague } from '../../context/SleeperContext';

export default function ScoringOverrideBanner({ preserveContentScrollDuringUpdate = null }) {
  const {
    scoringOverride, clearScoringOverride,
    scoringOverridePaused, setScoringOverridePaused,
    league, season: resultSeason,
  } = useSleeperLeague();

  const setPausedWithScrollPreserved = useCallback((paused) => {
    const update = () => setScoringOverridePaused(paused);
    if (preserveContentScrollDuringUpdate) {
      preserveContentScrollDuringUpdate(update);
      return;
    }
    update();
  }, [preserveContentScrollDuringUpdate, setScoringOverridePaused]);

  if (!scoringOverride) return null;

  const { leagueName, season: scoringSeason } = scoringOverride;
  const statsSeason = String(league?.season ?? resultSeason ?? '').trim();
  const activeDescription = `Using ${leagueName}${scoringSeason ? ` (${scoringSeason})` : ''} scoring${statsSeason ? ` · Calculated using ${statsSeason} NFL stats` : ''}`;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 shrink-0"
      style={{
        background: scoringOverridePaused ? 'var(--color-fill)' : 'var(--color-signature)',
        color: scoringOverridePaused ? 'var(--color-label)' : 'var(--color-signature-fg)',
        transition: 'background 150ms ease, color 150ms ease',
      }}
    >
      {/* Icon */}
      {scoringOverridePaused ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      )}

      <span className="flex-1 text-sm font-semibold leading-tight truncate" title={activeDescription}>
        {scoringOverridePaused
          ? <span style={{ opacity: 0.7 }}>Showing your league scoring{statsSeason && <> · Calculated using {statsSeason} NFL stats</>}</span>
          : <>Using {leagueName}{scoringSeason && <span className="font-normal opacity-80"> ({scoringSeason})</span>} scoring{statsSeason && <span className="font-normal opacity-80"> · Calculated using {statsSeason} NFL stats</span>}</>
        }
      </span>

      {/* Hold to compare */}
      <HoldButton
        onHoldStart={() => setPausedWithScrollPreserved(true)}
        onHoldEnd={() => setPausedWithScrollPreserved(false)}
        paused={scoringOverridePaused}
      />

      {/* Reset / X */}
      <button
        type="button"
        onClick={clearScoringOverride}
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-opacity active:opacity-70"
        aria-label="Clear scoring override"
        style={{
          background: 'rgba(0,0,0,0.15)',
          color: scoringOverridePaused ? 'var(--color-label)' : 'var(--color-signature-fg)',
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

function HoldButton({ onHoldStart, onHoldEnd, paused }) {
  const holdingRef = useRef(false);

  const start = useCallback(() => {
    holdingRef.current = true;
    onHoldStart();
  }, [onHoldStart]);

  const end = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    onHoldEnd();
  }, [onHoldEnd]);

  // Release if pointer leaves window while held
  useEffect(() => {
    if (!paused) return;
    const release = () => end();
    window.addEventListener('mouseup', release);
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', release);
    };
  }, [paused, end]);

  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); start(); }}
      onMouseUp={end}
      onTouchStart={(e) => { e.preventDefault(); start(); }}
      onTouchEnd={end}
      onTouchCancel={end}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold select-none"
      aria-label="Hold to preview your league's scoring"
      style={{
        background: paused ? 'var(--color-accent)' : 'rgba(0,0,0,0.18)',
        color: paused ? '#fff' : 'inherit',
        flexShrink: 0,
        transition: 'background 100ms ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Eye icon */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {paused
          ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
        }
      </svg>
      Hold
    </button>
  );
}
