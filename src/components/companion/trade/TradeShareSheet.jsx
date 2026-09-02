import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../../Modal';
import useBodyScrollLock from '../../../hooks/useBodyScrollLock';
import useSheetHistory from '../../../hooks/useSheetHistory';
import { copyText } from '../../../utils/pageShare';
import { DEFAULT_TRADE_EXPIRY, getTradeProposalExpiryLabel, TRADE_EXPIRY_OPTIONS } from '../../../utils/tradeProposal';
import TradeShareCard from './TradeShareCard';

function ScreenshotView({ snapshot, shareUrl, qrImage, expiresAt, senderTimeZone, expiryPreset, status, sleeperOutcome, viewerUserId, valueResolver, onOpenPlayer, onClose }) {
  useBodyScrollLock();
  useSheetHistory(true, onClose);
  return (
    <div className="trade-share-screenshot" role="dialog" aria-modal="true" aria-label="Trade proposal screenshot view">
      <div className="trade-share-screenshot__stage">
        <TradeShareCard snapshot={snapshot} shareUrl={shareUrl} qrImage={qrImage} expiresAt={expiresAt} senderTimeZone={senderTimeZone} expiryPreset={expiryPreset} status={status} sleeperOutcome={sleeperOutcome} viewerIsCurrentAuthor viewerUserId={viewerUserId} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} />
      </div>
      <div className="trade-share-screenshot__controls">
        <div><strong>Trade image ready</strong><span>Use your device screenshot controls to export this card.</span></div>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export default function TradeShareSheet({ snapshot, mode = 'send', onSubmit, onClose, submitting = false, result = null, error = '', viewerUserId = null, valueResolver = null, onOpenPlayer = null, onOpenProposals = null }) {
  const [expiryPreset, setExpiryPreset] = useState(DEFAULT_TRADE_EXPIRY);
  const [qrImage, setQrImage] = useState('');
  const [copyState, setCopyState] = useState('Share link');
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const shareUrl = result?.shareUrl ?? '';

  useEffect(() => {
    let cancelled = false;
    if (!shareUrl) {
      queueMicrotask(() => {
        if (!cancelled) setQrImage('');
      });
      return () => { cancelled = true; };
    }
    QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 420,
      color: { dark: '#0c0f14', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) setQrImage(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrImage('');
    });
    return () => { cancelled = true; };
  }, [shareUrl]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    await copyText(shareUrl);
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Share link'), 1600);
  }, [shareUrl]);

  if (screenshotOpen && shareUrl) {
    return <ScreenshotView snapshot={result?.proposal?.revision?.snapshot ?? snapshot} shareUrl={shareUrl} qrImage={qrImage} expiresAt={result?.expiresAt ?? result?.proposal?.expiresAt} senderTimeZone={result?.proposal?.revision?.senderTimeZone} expiryPreset={expiryPreset} status={result?.proposal?.status ?? 'pending'} sleeperOutcome={result?.proposal?.sleeperOutcome} viewerUserId={viewerUserId} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} onClose={() => setScreenshotOpen(false)} />;
  }

  return (
    <Modal onClose={onClose} ariaLabel={mode === 'counter' ? 'Send counter-proposal' : 'Share trade proposal'} containerClassName="trade-share-modal" containerStyle={{ maxWidth: '980px', maxHeight: '94vh', background: 'var(--color-bg-secondary)' }}>
      <header className="trade-share-modal__header">
        <div><p>GridShift Trade</p><h2>{mode === 'counter' ? 'Send counter-proposal' : 'Send trade proposal'}</h2><span>Only the two connected Sleeper participants can respond.</span></div>
        <button type="button" onClick={onClose} aria-label="Close trade sharing">×</button>
      </header>
      <div className="trade-share-modal__body">
        <div className="trade-share-modal__preview"><TradeShareCard snapshot={result?.proposal?.revision?.snapshot ?? snapshot} shareUrl={shareUrl} qrImage={qrImage} expiresAt={result?.expiresAt ?? result?.proposal?.expiresAt} senderTimeZone={result?.proposal?.revision?.senderTimeZone} expiryPreset={expiryPreset} status={result?.proposal?.status ?? 'pending'} sleeperOutcome={result?.proposal?.sleeperOutcome} viewerIsCurrentAuthor viewerUserId={viewerUserId} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} /></div>
        <div className="trade-share-modal__controls">
          {!result && <>
            <label htmlFor="trade-proposal-expiry">Expires</label>
            <select id="trade-proposal-expiry" value={expiryPreset} onChange={(event) => setExpiryPreset(event.target.value)}>
              {TRADE_EXPIRY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <p>Send this proposal first to create its expiring link and QR code. Every counter-proposal chooses a fresh expiry; links cannot be made permanent and never last more than one week.</p>
            {error && <div className="trade-share-modal__error" role="alert">{error}</div>}
            <button type="button" className="trade-share-modal__primary" onClick={() => onSubmit?.(expiryPreset)} disabled={submitting}>
              {submitting ? 'Sending…' : mode === 'counter' ? 'Send Counter' : 'Send in GridShift'}
            </button>
          </>}
          {result && <>
            <div className="trade-share-modal__success" role="status"><strong>{mode === 'counter' ? 'Counter-proposal sent' : 'Trade proposal sent'}</strong><span>Saved to Proposals · {getTradeProposalExpiryLabel(expiryPreset)} · participant-only actions</span></div>
            <button type="button" className="trade-share-modal__primary" onClick={onOpenProposals}>View Proposals</button>
            <button type="button" className="trade-share-modal__secondary" onClick={handleCopy}>{copyState}</button>
            <button type="button" className="trade-share-modal__secondary" onClick={() => setScreenshotOpen(true)} disabled={!qrImage}>Export image</button>
            <button type="button" className="trade-share-modal__secondary" onClick={onClose}>Done</button>
          </>}
        </div>
      </div>
    </Modal>
  );
}
