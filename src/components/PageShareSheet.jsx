import { useState } from 'react';
import Modal from './Modal';
import { copyText } from '../utils/pageShare.js';

export default function PageShareSheet({ metadata, url, onClose, onNativeShare }) {
  const [copyState, setCopyState] = useState('Copy link');
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = async () => {
    try {
      await copyText(url);
      setCopyState('Link copied');
      window.setTimeout(() => setCopyState('Copy link'), 1800);
    } catch {
      setCopyState('Copy failed');
    }
  };

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Share this page"
      containerClassName="page-share-sheet"
      containerStyle={{ maxWidth: '520px' }}
    >
      <div className="page-share-sheet__content">
        <div className="page-share-sheet__header">
          <div>
            <p className="page-share-sheet__eyebrow">Share page</p>
            <h2>{metadata.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share sheet" className="page-share-sheet__close">×</button>
        </div>
        <div className="page-share-sheet__preview">
          <div className="page-share-sheet__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
            </svg>
          </div>
          <div className="page-share-sheet__copy">
            <p>{metadata.description}</p>
            <span>{url}</span>
          </div>
        </div>
        <div className="page-share-sheet__actions">
          {canNativeShare && (
            <button type="button" className="page-share-sheet__button page-share-sheet__button--primary" onClick={onNativeShare}>
              Share from this device
            </button>
          )}
          <button
            type="button"
            className={`page-share-sheet__button${canNativeShare ? '' : ' page-share-sheet__button--primary'}`}
            onClick={handleCopy}
          >
            {copyState}
          </button>
        </div>
      </div>
    </Modal>
  );
}
