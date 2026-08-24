import { useState } from 'react';

// "Update available" banner shown when a new service worker build is waiting.
// Non-blocking: sits above the bottom tab bar on mobile and clear of the
// sidebar on desktop. Dismissal is session-only — it reappears on next load.
export default function UpdateBanner({ onInstall }) {
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (dismissed) return null;

  const handleInstall = () => {
    setInstalling(true);
    onInstall();
  };

  return (
    <div
      role="status"
      className="fixed z-[60] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg left-4 right-4 sm:left-auto sm:w-auto lg:left-auto"
      style={{
        bottom: 'calc(var(--bar-height-tab) + env(safe-area-inset-bottom) + 12px)',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-separator)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold" style={{ color: 'var(--color-label)' }}>
          Update available
        </div>
        <div className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          A new version is ready. Reload to use it.
        </div>
      </div>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="shrink-0 rounded-lg px-4 py-2 text-base font-semibold"
        style={{
          background: 'var(--color-signature)',
          color: 'var(--color-signature-fg)',
          opacity: installing ? 0.6 : 1,
        }}
      >
        {installing ? 'Reloading…' : 'Reload'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
        className="shrink-0 rounded-lg p-2 text-base"
        style={{ color: 'var(--color-label-secondary)' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
