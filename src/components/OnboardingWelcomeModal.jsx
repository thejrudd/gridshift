import Modal from './Modal';

export default function OnboardingWelcomeModal({ hasLeague, onBegin, onDismiss }) {
  return (
    <Modal
      onClose={onDismiss}
      ariaLabel="Welcome to GridShift"
      containerClassName="max-w-md flex flex-col"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
    >
      <div className="px-6 pt-6 pb-4">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-secondary)' }}>
          Welcome to GridShift
        </div>
        <h2
          className="mt-1 text-2xl font-bold"
          style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", color: 'var(--color-label)' }}
        >
          Your football command center
        </h2>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
          {hasLeague
            ? 'Take a quick tour of rosters, trades, drafts, statistics, and predictions.'
            : 'Take a quick tour of rosters, trades, drafts, statistics, and predictions, shown with sample data. You can connect your league at the end.'}
        </p>
      </div>

      <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--color-separator)' }}>
        <button
          onClick={onDismiss}
          className="flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
        >
          Skip tour
        </button>
        <button
          onClick={onBegin}
          className="flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
        >
          Start tour
        </button>
      </div>
    </Modal>
  );
}
