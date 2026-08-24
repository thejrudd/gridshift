import Modal from './Modal';

const DISPLAY_OPTIONS = [
  {
    value: 'compact',
    label: 'Compact',
    description: 'More information on screen with a readable minimum type size.',
    sample: ['Amon-Ra St. Brown', '20.6 AVG/G'],
  },
  {
    value: 'comfortable',
    label: 'Comfortable',
    description: 'Balanced spacing and type for everyday use across displays.',
    sample: ['Amon-Ra St. Brown', '20.6 AVG/G'],
  },
  {
    value: 'large',
    label: 'Large',
    description: 'Larger text, controls, and spacing for easier scanning.',
    sample: ['Amon-Ra St. Brown', '20.6 AVG/G'],
  },
];

export default function DisplaySettingsModal({ displaySize, onChange, onClose }) {
  const handleRadioKeyDown = (event, optionIndex) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;

    event.preventDefault();
    const lastIndex = DISPLAY_OPTIONS.length - 1;
    let nextIndex = optionIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (optionIndex + 1) % DISPLAY_OPTIONS.length;
    else nextIndex = (optionIndex - 1 + DISPLAY_OPTIONS.length) % DISPLAY_OPTIONS.length;

    onChange(DISPLAY_OPTIONS[nextIndex].value);
    event.currentTarget.parentElement?.querySelectorAll('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Display settings"
      containerClassName="display-settings-modal"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
    >
      <div className="display-settings-header">
        <div>
          <span className="display-settings-eyebrow">Display</span>
          <h2 className="display-settings-title">Choose your reading size</h2>
          <p className="display-settings-copy">
            GridShift will keep the same information hierarchy while adjusting type, controls, and spacing.
          </p>
        </div>
        <button type="button" className="display-settings-close" onClick={onClose} aria-label="Close display settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="display-settings-options" role="radiogroup" aria-label="Display size">
        {DISPLAY_OPTIONS.map((option, optionIndex) => {
          const selected = option.value === displaySize;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={`display-settings-option${selected ? ' is-selected' : ''}`}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleRadioKeyDown(event, optionIndex)}
            >
              <span className="display-settings-option__radio" aria-hidden="true">
                <span />
              </span>
              <span className="display-settings-option__body">
                <span className="display-settings-option__heading">
                  <strong>{option.label}</strong>
                  {option.value === 'comfortable' && <span>Recommended</span>}
                </span>
                <span className="display-settings-option__description">{option.description}</span>
                <span className={`display-settings-preview display-settings-preview--${option.value}`} aria-hidden="true">
                  <span>{option.sample[0]}</span>
                  <strong>{option.sample[1]}</strong>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="display-settings-footer">
        <p>Browser zoom and operating-system scaling still work normally.</p>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
