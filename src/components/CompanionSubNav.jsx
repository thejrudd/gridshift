import { useRef } from 'react';
import HorizontalScrollCue from './HorizontalScrollCue';
import useHorizontalScrollCue from '../hooks/useHorizontalScrollCue';

const VIEWS = [
  { id: 'roster',    label: 'Roster' },
  { id: 'rankings',  label: 'Rankings' },
  { id: 'matchup',   label: 'Matchup' },
  { id: 'waiver',    label: 'Waiver' },
  { id: 'league',    label: 'League' },
  { id: 'heatmap',   label: 'Heatmap' },
  { id: 'defense',   label: 'Defense', beta: true },
  { id: 'scoring',   label: 'Scoring' },
];

export default function CompanionSubNav({ activeView, onViewChange }) {
  const tabsRef = useRef(null);
  const scrollCue = useHorizontalScrollCue(tabsRef, [activeView]);

  return (
    <div className="companion-subnav-tabs-shell">
      <div ref={tabsRef} className="season-tabs" role="tablist" aria-label="Companion views">
        {VIEWS.map(({ id, label, beta, alpha }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeView === id}
            onClick={() => onViewChange(id)}
            className={`season-tab${activeView === id ? ' active' : ''}`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {label}
              {beta && (
                <span style={{
                  fontSize: '7px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  padding: '1px 3px',
                  borderRadius: '3px',
                  background: 'var(--color-signature)',
                  color: 'var(--color-signature-fg)',
                  lineHeight: '11px',
                  verticalAlign: 'middle',
                }}>
                  β
                </span>
              )}
              {alpha && (
                <span style={{
                  fontSize: '7px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  padding: '1px 3px',
                  borderRadius: '3px',
                  background: 'var(--color-alpha)',
                  color: 'var(--color-alpha-fg)',
                  lineHeight: '11px',
                  verticalAlign: 'middle',
                }}>
                  α
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <HorizontalScrollCue left={scrollCue.left} right={scrollCue.right} className="horizontal-scroll-cue--nav" />
    </div>
  );
}
