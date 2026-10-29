import Modal from '../Modal.jsx';

/**
 * Dialog (Stage 5.1): the shared Modal (overlay, Escape, scroll lock, mobile
 * sheet) with a fixed header and footer around a body that scrolls on its
 * own. A dialog is an object, so it is the one raised surface; nothing inside
 * it gets another box.
 */
export default function Dialog({ title, onClose, footer = null, children, mobileSheet = false, containerClassName = '' }) {
  return (
    <Modal onClose={onClose} ariaLabel={typeof title === 'string' ? title : undefined} mobileSheet={mobileSheet} containerClassName={`max-w-lg ${containerClassName}`.trim()}>
      <div className="gs-dialog">
        <div className="gs-dialog__header">
          <h2 className="gs-text-section">{title}</h2>
          <button type="button" className="gs-button gs-button--quiet" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="gs-dialog__body">{children}</div>
        {footer && <div className="gs-dialog__footer">{footer}</div>}
      </div>
    </Modal>
  );
}
