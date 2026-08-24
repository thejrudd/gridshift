import { useEffect, useRef } from 'react';
import ScoutPlayerCard from './ScoutPlayerCard';
import Modal from '../Modal';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

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

export default function ScoutPlayerSheet({
  player,
  variant,
  onClose,
  onCompare,
  compareAId,
  onViewStatistics,
  onPanelHeightChange,
}) {
  const scrollRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [player?.id]);

  useEffect(() => {
    if (variant !== 'panel' || typeof onPanelHeightChange !== 'function') return undefined;
    const node = panelRef.current;
    if (!node) return undefined;

    const report = () => {
      onPanelHeightChange(Math.round(node.getBoundingClientRect().height));
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);

    return () => observer.disconnect();
  }, [variant, player?.id, onPanelHeightChange]);

  if (variant === 'panel') {
    return (
      <div
        ref={panelRef}
        className="scout-panel"
      >
        <div className="scout-panel-header">
          <span className="scout-panel-title">Prospect Profile</span>
          <CloseButton onClick={onClose} />
        </div>
        <div ref={scrollRef} className="scout-panel-body">
          <ScoutPlayerCard
            player={player}
            onCompare={onCompare}
            compareAId={compareAId}
            onViewStatistics={onViewStatistics}
          />
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <ScoutProfileModal
        player={player}
        onClose={onClose}
        onCompare={onCompare}
        compareAId={compareAId}
        onViewStatistics={onViewStatistics}
      />
    );
  }

  // Bottom sheet — mobile only
  return (
    <div className="lg:hidden">
      <Modal
        onClose={onClose}
        mobileSheet
        ariaLabel="Prospect profile"
        containerClassName="scout-sheet-mobile flex flex-col"
      >
        <div className="scout-sheet-handle-row">
          <CloseButton onClick={onClose} />
        </div>
        <div ref={scrollRef} className="scout-sheet-body">
          <ScoutPlayerCard
            player={player}
            onCompare={onCompare}
            compareAId={compareAId}
            onViewStatistics={onViewStatistics}
          />
        </div>
      </Modal>
    </div>
  );
}

function ScoutProfileModal({ player, onClose, onCompare, compareAId, onViewStatistics }) {
  useBodyScrollLock();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="scout-profile-modal-overlay" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} prospect profile`}
        className="scout-profile-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="scout-profile-modal-header">
          <span className="scout-panel-title">Prospect Profile</span>
          <CloseButton onClick={onClose} />
        </div>
        <div className="scout-profile-modal-body">
          <ScoutPlayerCard
            player={player}
            onCompare={onCompare}
            compareAId={compareAId}
            onViewStatistics={onViewStatistics}
          />
        </div>
      </div>
    </div>
  );
}
