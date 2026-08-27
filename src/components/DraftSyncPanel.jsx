import { useState } from 'react';
import useDraftSync from '../hooks/useDraftSync.js';

function statusTone(statusLabel) {
  if (statusLabel === 'Synced') return 'var(--color-accent-green)';
  if (statusLabel === 'Paired') return 'var(--color-accent-green)';
  if (statusLabel === 'Offline — saved locally' || statusLabel === 'Conflict needs review' || statusLabel === 'Choose starting device' || statusLabel === 'Waiting for primary') {
    return 'var(--color-accent-orange)';
  }
  if (statusLabel === 'Sync unavailable' || statusLabel === 'Pairing required') {
    return 'var(--color-accent-red)';
  }
  return 'var(--color-accent)';
}

function ActionButton({ children, onClick, disabled = false, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-opacity active:opacity-60 disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        background: primary ? 'var(--color-accent)' : 'var(--color-fill)',
        color: primary ? 'var(--color-bg-secondary)' : 'var(--color-label-secondary)',
        border: '1px solid var(--color-separator)',
      }}
    >
      {children}
    </button>
  );
}

export default function DraftSyncPanel() {
  const {
    enabled,
    deviceToken,
    deviceRole,
    pairingCode,
    pairingStatus,
    statusLabel,
    conflict,
    initialSyncSetup,
    startPairing,
    claimPairing,
    revokeDevice,
    resolveConflict,
  } = useDraftSync();
  const [claimCode, setClaimCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!enabled) return null;

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (nextError) {
      setError(nextError?.message ?? 'Draft Sync is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  const copyPairingCode = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Copy was unavailable. Enter the code manually on the other device.');
    }
  };

  const normalizedClaimCode = claimCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const formattedClaimCode = normalizedClaimCode.length > 4
    ? `${normalizedClaimCode.slice(0, 4)}-${normalizedClaimCode.slice(4)}`
    : normalizedClaimCode;

  return (
    <section
      className="mx-4 my-3 rounded-xl p-4"
      style={{
        background: 'var(--color-fill-tertiary)',
        border: '1px solid var(--color-separator)',
      }}
      aria-labelledby="device-sync-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div id="device-sync-title" className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}>
            Device Sync
          </div>
          <p className="mt-1 text-sm leading-5" style={{ color: 'var(--color-label-secondary)' }}>
            Keep Draft planning and Predictions available across your paired devices.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold" style={{ color: statusTone(statusLabel) }}>
          <span className="h-2 w-2 rounded-full" style={{ background: statusTone(statusLabel) }} aria-hidden="true" />
          {statusLabel}
        </div>
      </div>

      {pairingCode && (
        <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            Authoritative device
          </div>
          <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
            Enter this code on your other device
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 text-center text-xl font-bold tracking-[0.2em]" style={{ color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums' }}>
              {pairingCode}
            </code>
            <ActionButton onClick={copyPairingCode} disabled={busy}>
              {copied ? 'Copied' : 'Copy'}
            </ActionButton>
          </div>
          <p className="mt-3 text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
            This device is authoritative for the starting plan. When the other device enters this code, it will use this device’s current board, keepers, and ranking settings automatically.
          </p>
          <div className="mt-2 text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
            This code expires shortly and can be used once.
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--color-separator)' }}>
            <span className="text-xs leading-5" style={{ color: 'var(--color-label-tertiary)' }}>
              Need to cancel setup?
            </span>
            <ActionButton onClick={() => run(revokeDevice)} disabled={busy}>
              Cancel setup
            </ActionButton>
          </div>
        </div>
      )}

      {pairingStatus === 'claimed' && !pairingCode && (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-accent-green)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
              Paired
            </div>
          <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--color-accent-green)' }}>
            Authoritative device
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
            Your other device accepted the code. This device is authoritative and provides the shared starting plan automatically.
          </p>
          </div>
      )}

      {!deviceToken && !pairingCode && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg p-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
              Set up this device
            </div>
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
              Generate a code, then enter it on your other device.
            </p>
            <ActionButton primary onClick={() => run(startPairing)} disabled={busy}>
              Generate pairing code
            </ActionButton>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
              Pair this device
            </div>
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
              Enter the code shown on your other device.
            </p>
            <div className="mt-3 flex min-h-11 gap-2">
              <input
                value={formattedClaimCode}
                onChange={(event) => setClaimCode(event.target.value)}
                placeholder="XXXX-XXXX"
                aria-label="Draft Sync pairing code"
                inputMode="text"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold tracking-[0.12em] outline-none"
                style={{
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-label)',
                  border: '1px solid var(--color-separator)',
                  // Mobile Safari zooms focused text inputs below 16px. This must
                  // remain an absolute floor even in GridShift's Compact display size.
                  fontSize: 'max(16px, 1rem)',
                }}
              />
              <ActionButton
                onClick={() => run(() => claimPairing(formattedClaimCode))}
                disabled={busy || normalizedClaimCode.length !== 8}
              >
                Pair
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {deviceToken && !pairingCode && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton primary onClick={() => run(startPairing)} disabled={busy}>
            Pair another device
          </ActionButton>
          <ActionButton onClick={() => run(revokeDevice)} disabled={busy}>
            Remove this device from sync
          </ActionButton>
        </div>
      )}

      {(deviceRole === 'non-authoritative' || initialSyncSetup?.status === 'waiting') && !pairingCode && pairingStatus !== 'claimed' && (
        <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-accent-orange)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            Non-authoritative device
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
            The device that generated the code provides the shared starting plan. This device will use that board, keeper list, and ranking settings automatically; any unsynced local starting plan will be replaced when it arrives.
          </p>
        </div>
      )}

      {conflict && (
        <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-accent-orange)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            This device and another device changed the same draft plan.
          </div>
          <div className="mt-1 text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
            Sync replaces the complete draft snapshot. Choosing one version discards the other device’s board, keepers, and ranking settings from the shared plan.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton onClick={() => run(() => resolveConflict('server'))} disabled={busy}>
              Use other device’s version
            </ActionButton>
            <ActionButton primary onClick={() => run(() => resolveConflict('local'))} disabled={busy}>
              Use this device’s version
            </ActionButton>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs leading-5" role="alert" style={{ color: 'var(--color-accent-red)' }}>{error}</p>}
    </section>
  );
}
