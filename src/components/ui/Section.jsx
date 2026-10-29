import { createElement } from 'react';

/**
 * Flat layout primitives (Stage 5.1). A page has one PageHeader, then
 * Sections separated by space and a divider under each heading. Sections
 * never sit in a box; put a raised surface only around a thing that is itself
 * an object (a dialog, a draggable item). Rules: docs/Design System Quick Ref.md.
 */

export function PageHeader({ eyebrow = null, title, description = null, actions = null, className = '' }) {
  return (
    <header className={`gs-page-header ${className}`.trim()}>
      {eyebrow && <span className="gs-text-meta">{eyebrow}</span>}
      <h1 className="gs-text-page-title">{title}</h1>
      {description && <p className="gs-page-header__description gs-text-secondary">{description}</p>}
      {actions}
    </header>
  );
}

export function SectionHeader({ title, meta = null, icon = null, marker = null, id, as = 'h2', actions = null }) {
  return (
    <div className="gs-section__header">
      <span className="gs-section__title">
        {marker && <span className="gs-section__marker" style={{ '--gs-section-marker': marker }} aria-hidden="true" />}
        {icon}
        {createElement(as, { id, className: 'gs-text-section' }, title)}
      </span>
      {meta && <span className="gs-text-meta">{meta}</span>}
      {actions && <span className="gs-section__actions">{actions}</span>}
    </div>
  );
}

export default function Section({ title, meta = null, icon = null, marker = null, headingId, headingAs = 'h2', actions = null, className = '', children, ...rest }) {
  return (
    <section className={`gs-section ${className}`.trim()} aria-labelledby={headingId} {...rest}>
      {title != null && (
        <SectionHeader title={title} meta={meta} icon={icon} marker={marker} id={headingId} as={headingAs} actions={actions} />
      )}
      {children}
    </section>
  );
}
