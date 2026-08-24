import { useRef } from 'react';

const VIEWS = [
  { id: 'standings', label: 'Standings' },
  { id: 'history', label: 'History' },
  { id: 'activity', label: 'Activity' },
];

export default function LeagueSubNav({ activeView, onViewChange }) {
  const tabsRef = useRef(null);
  const handleTabKeyDown = (event, currentIndex) => {
    let nextIndex = null;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = VIEWS.length - 1;
    if (event.key === 'ArrowRight') nextIndex = Math.min(VIEWS.length - 1, currentIndex + 1);
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
    if (nextIndex == null || nextIndex === currentIndex) return;

    event.preventDefault();
    onViewChange(VIEWS[nextIndex].id);
    window.requestAnimationFrame(() => {
      tabsRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
    });
  };

  return (
    <div ref={tabsRef} className="season-tabs" role="tablist" aria-label="League views">
      {VIEWS.map(({ id, label }, index) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeView === id}
          tabIndex={activeView === id ? 0 : -1}
          onClick={() => onViewChange(id)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
          className={`season-tab${activeView === id ? ' active' : ''}`}
          data-tour={`league-view-${id}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
