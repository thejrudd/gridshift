import Modal from './Modal';

// Shown once after updating across one or more feature versions.
// "Show me" starts the interactive tour; Dismiss (button, backdrop, or
// Escape) permanently skips it for these versions.
export default function WhatsNewModal({ entries, onStartTour, onDismiss }) {
  const latest = entries[entries.length - 1];

  return (
    <Modal
      onClose={onDismiss}
      ariaLabel="What's new in GridShift"
      containerClassName="max-w-md flex flex-col"
      containerStyle={{ border: '1px solid var(--color-separator)', maxHeight: 'min(80dvh, 640px)' }}
    >
      <div className="px-6 pt-6 pb-4">
        <div
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--color-label-secondary)' }}
        >
          Updated to v{__APP_VERSION__}
        </div>
        <h2
          className="mt-1 text-2xl font-bold"
          style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", color: 'var(--color-label)' }}
        >
          What&rsquo;s New{latest?.title ? `: ${latest.title}` : ''}
        </h2>
      </div>

      <div className="min-h-0 overflow-y-auto px-6 pb-2">
        {entries.map((entry) => (
          <div key={entry.version} className="mb-4">
            {entries.length > 1 && (
              <div
                className="mb-2 text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)' }}
              >
                v{entry.version} — {entry.title}
              </div>
            )}
            <ul className="space-y-3">
              {entry.features.map((feature) => (
                <li key={feature.id} className="flex gap-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--color-signature)' }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-base font-semibold" style={{ color: 'var(--color-label)' }}>
                      {feature.name}
                    </div>
                    <div className="text-sm leading-snug" style={{ color: 'var(--color-label-secondary)' }}>
                      {feature.description}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="flex gap-3 px-6 py-4"
        style={{ borderTop: '1px solid var(--color-separator)' }}
      >
        <button
          onClick={onDismiss}
          className="flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{
            background: 'var(--color-fill)',
            color: 'var(--color-label)',
          }}
        >
          Dismiss
        </button>
        <button
          onClick={onStartTour}
          className="flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{
            background: 'var(--color-signature)',
            color: 'var(--color-signature-fg)',
          }}
        >
          Show me
        </button>
      </div>
    </Modal>
  );
}
