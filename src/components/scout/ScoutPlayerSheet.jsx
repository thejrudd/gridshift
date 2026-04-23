import { useEffect, useRef } from 'react';
import ScoutPlayerCard from './ScoutPlayerCard';

// variant="sheet"  — mobile bottom sheet (hidden on lg+)
// variant="panel"  — desktop right panel (hidden below lg)

function CloseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close profile"
      className="scout-sheet-close"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

export default function ScoutPlayerSheet({ player, variant, onClose, onCompare, compareAId }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [player?.id]);

  useEffect(() => {
    if (variant !== 'sheet') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [variant, player?.id]);

  if (variant === 'panel') {
    return (
      <div className="scout-panel">
        <div className="scout-panel-header">
          <span className="scout-panel-title">Prospect Profile</span>
          <CloseButton onClick={onClose} />
        </div>
        <div ref={scrollRef} className="scout-panel-body">
          <ScoutPlayerCard player={player} onCompare={onCompare} compareAId={compareAId} />
        </div>
      </div>
    );
  }

  // Bottom sheet — mobile only
  return (
    <div className="scout-sheet-overlay lg:hidden">
      <div
        className="scout-sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prospect profile"
        className="scout-sheet"
      >
        <div className="scout-sheet-handle-row">
          <div className="scout-sheet-handle" />
          <CloseButton onClick={onClose} />
        </div>
        <div ref={scrollRef} className="scout-sheet-body">
          <ScoutPlayerCard player={player} onCompare={onCompare} compareAId={compareAId} />
        </div>
      </div>
    </div>
  );
}
