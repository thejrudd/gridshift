import { useEffect, useRef } from 'react';
import HorizontalScrollCue from './HorizontalScrollCue';
import useHorizontalScrollCue from '../hooks/useHorizontalScrollCue';
import StatusBadge from './ui/StatusBadge';

const VIEWS = [
  { id: 'rosters',   label: 'Rosters', tabGroup: 'team', tourId: 'roster' },
  { id: 'rankings',  label: 'Rankings', tabGroup: 'team' },
  { id: 'live',      label: 'Live', comingSoon: true },
  { id: 'matchups',  label: 'Matchups', tabGroup: 'team', tourId: 'matchup' },
  { id: 'waivers',   label: 'Waivers', tourId: 'waiver' },
  { id: 'heatmap',   label: 'Heatmap', tabGroup: 'team' },
  { id: 'defenses',  label: 'Defenses', tabGroup: 'team', tourId: 'defense' },
  { id: 'scoring',   label: 'Scoring' },
];

export default function CompanionSubNav({ activeView, onViewChange }) {
  const tabsRef = useRef(null);
  const scrollCue = useHorizontalScrollCue(tabsRef, [activeView]);

  const handleTabKeyDown = (event, currentIndex) => {
    let nextIndex = null;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = VIEWS.length - 1;
    if (event.key === 'ArrowRight') nextIndex = currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex - 1;
    if (nextIndex == null) return;

    event.preventDefault();
    const direction = nextIndex < currentIndex ? -1 : 1;
    while (VIEWS[nextIndex]?.comingSoon) nextIndex += direction;
    nextIndex = Math.max(0, Math.min(VIEWS.length - 1, nextIndex));
    if (nextIndex === currentIndex || VIEWS[nextIndex]?.comingSoon) return;

    onViewChange(VIEWS[nextIndex].id);
    window.requestAnimationFrame(() => {
      tabsRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
    });
  };

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
      <div ref={tabsRef} className="season-tabs" role="tablist" aria-label="Fantasy views">
        {VIEWS.map(({ id, label, beta, alpha, comingSoon, tabGroup, tourId = id }, index) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeView === id}
            tabIndex={activeView === id ? 0 : -1}
            onClick={() => onViewChange(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            disabled={comingSoon}
            className={`season-tab${tabGroup ? ` companion-tab--${tabGroup}` : ''}${activeView === id ? ' active' : ''}`}
            data-tour={`companion-view-${tourId}`}
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
      <HorizontalScrollCue
        left={scrollCue.left}
        right={scrollCue.right}
        className="horizontal-scroll-cue--nav"
        targetRef={tabsRef}
        label="Fantasy views"
      />
    </div>
  );
}
