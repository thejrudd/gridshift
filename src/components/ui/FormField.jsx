import { cloneElement, isValidElement, useId } from 'react';

/**
 * Form field (Stage 5.1): label above the control, optional hint, and an
 * error that replaces the hint. Pass the control as the child; it receives
 * the id, the `gs-field__control` class, and aria-describedby / aria-invalid.
 * Inputs stay at 16px so iOS does not zoom.
 */
export default function FormField({ label, hint = null, error = null, children, className = '' }) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  const control = isValidElement(children)
    ? cloneElement(children, {
      id: children.props.id ?? id,
      className: ['gs-field__control', children.props.className].filter(Boolean).join(' '),
      'aria-describedby': note ? noteId : children.props['aria-describedby'],
      'aria-invalid': error ? true : children.props['aria-invalid'],
    })
    : children;
  const controlId = isValidElement(children) ? (children.props.id ?? id) : undefined;
  return (
    <div className={`gs-field${error ? ' is-invalid' : ''} ${className}`.trim()}>
      <label className="gs-field__label" htmlFor={controlId}>{label}</label>
      {control}
      {note && (
        <span id={noteId} className={error ? 'gs-field__error' : 'gs-text-secondary'} role={error ? 'alert' : undefined}>
          {note}
        </span>
      )}
    </div>
  );
}
