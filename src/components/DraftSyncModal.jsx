import Modal from './Modal.jsx';
import DraftSyncPanel from './DraftSyncPanel.jsx';

export default function DraftSyncModal({ onClose }) {
  return (
    <Modal
      onClose={onClose}
      ariaLabel="Draft Sync"
      containerClassName="max-w-2xl max-h-[90vh] overflow-hidden"
    >
      <div
        className="flex items-start justify-between gap-4 px-5 py-4"
        style={{ borderBottom: '1px solid var(--color-separator)' }}
      >
        <div className="min-w-0">
          <div
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}
          >
            Draft Sync
          </div>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: 'var(--color-label)' }}>
            Use your War Room and Board across devices
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-5" style={{ color: 'var(--color-label-secondary)' }}>
            The device that generates the one-time code provides the shared starting plan. The device that enters it adopts that plan automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition-opacity active:opacity-60"
          style={{
            background: 'var(--color-fill)',
            color: 'var(--color-label-secondary)',
            border: '1px solid var(--color-separator)',
          }}
          aria-label="Close Draft Sync"
        >
          Close
        </button>
      </div>

      <div className="overflow-y-auto">
        <DraftSyncPanel />
      </div>
    </Modal>
  );
}
