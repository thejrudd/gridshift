import Modal from './Modal';

// Closing prompt of the league-less app tour, shown over the initial screen.
export default function OnboardingConnectModal({ onConnect, onContinue, onDismiss }) {
  return (
    <Modal
      onClose={onDismiss}
      ariaLabel="Connect your league"
      containerClassName="max-w-md flex flex-col"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
    >
      <div className="px-6 pt-6 pb-4">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-secondary)' }}>
          Tour complete
        </div>
        <h2
          className="mt-1 text-2xl font-bold"
          style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", color: 'var(--color-label)' }}
        >
          Ready to play with your league?
        </h2>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
          Connect your Sleeper league to unlock Fantasy, League, Trade, and Draft with your own data. Or keep exploring
          Statistics and Predict without one.
        </p>
      </div>

      <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--color-separator)' }}>
        <button
          onClick={onContinue}
          className="flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
        >
          Continue without a league
        </button>
        <button
          onClick={onConnect}
          className="flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
        >
          Connect league
        </button>
      </div>
    </Modal>
  );
}
