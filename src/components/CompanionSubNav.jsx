import { useEffect, useRef } from 'react';
import HorizontalScrollCue from './HorizontalScrollCue';
import useHorizontalScrollCue from '../hooks/useHorizontalScrollCue';
import StatusBadge from './ui/StatusBadge';

const VIEWS = [
  { id: 'roster',    label: 'Roster' },
  { id: 'rankings',  label: 'Rankings' },
  { id: 'live',      label: 'Live', comingSoon: true },
  { id: 'matchup',   label: 'Matchup' },
  { id: 'waiver',    label: 'Waiver' },
  { id: 'league',    label: 'League' },
  { id: 'heatmap',   label: 'Heatmap' },
  { id: 'defense',   label: 'Defense' },
  { id: 'scoring',   label: 'Scoring' },
];

export default function CompanionSubNav({ activeView, onViewChange }) {
  const tabsRef = useRef(null);
  const scrollCue = useHorizontalScrollCue(tabsRef, [activeView]);

  // Keep the active tab visible inside the scrollable rail
  useEffect(() => {
    const rail = tabsRef.current;
    const activeTab = rail?.querySelector('.season-tab.active');
    if (!rail || !activeTab) return;
    const railRect = rail.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    if (tabRect.right > railRect.right) {
      rail.scrollLeft += tabRect.right - railRect.right + 24;
    } else if (tabRect.left < railRect.left) {
      rail.scrollLeft -= railRect.left - tabRect.left + 24;
    }
  }, [activeView]);

  return (
    <div className="companion-subnav-tabs-shell">
      <div ref={tabsRef} className="season-tabs" role="tablist" aria-label="Companion views">
        {VIEWS.map(({ id, label, beta, alpha, comingSoon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeView === id}
            onClick={() => onViewChange(id)}
            disabled={comingSoon}
            className={`season-tab${activeView === id ? ' active' : ''}`}
            data-tour={`companion-view-${id}`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {label}
              {beta && <StatusBadge kind="beta" size="sm" />}
              {alpha && <StatusBadge kind="alpha" size="sm" />}
              {comingSoon && <StatusBadge kind="comingSoon" size="sm" />}
            </span>
          </button>
        ))}
      </div>
      <HorizontalScrollCue left={scrollCue.left} right={scrollCue.right} className="horizontal-scroll-cue--nav" />
    </div>
  );
}
