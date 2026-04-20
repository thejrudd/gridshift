import { useTheme, getSignatureFg } from '../context/ThemeContext';
import { TEAM_COLORS, TEAM_NAMES, TEAM_DIVISIONS } from '../data/teamColors';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

export default function FavoriteTeamPicker({ onClose }) {
  const { favoriteTeam, setFavoriteTeam, darkMode } = useTheme();
  useBodyScrollLock();

  const handleSelect = (teamKey) => {
    setFavoriteTeam(teamKey === favoriteTeam ? null : teamKey);
    onClose();
  };

  const handleClear = () => {
    setFavoriteTeam(null);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{
          background: 'var(--color-bg)',
          maxWidth: '560px',
          margin: '0 auto',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your favorite team"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-separator)' }}
        >
          <div>
            <div
              className="font-display font-bold"
              style={{ fontSize: '18px', letterSpacing: '0.06em', color: 'var(--color-label)' }}
            >
              MY TEAM
            </div>
            <div
              className="text-xs mt-0.5"
              style={{ color: 'var(--color-label-secondary)' }}
            >
              {favoriteTeam
                ? `${TEAM_NAMES[favoriteTeam]} — tap to change or tap again to clear`
                : 'Theme the app around your favorite team'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Team grid — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {TEAM_DIVISIONS.map(({ conference, divisions }) => (
            <div key={conference} className="mb-6">
              {/* Conference header */}
              <div
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.12em' }}
              >
                {conference}
              </div>

              {divisions.map(({ name, teams }) => (
                <div key={name} className="mb-4">
                  {/* Division label */}
                  <div
                    className="text-xs font-semibold mb-2"
                    style={{ color: 'var(--color-label-tertiary)' }}
                  >
                    {name}
                  </div>

                  {/* Team rows */}
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--color-separator)' }}
                  >
                    {teams.map((key, i) => {
                      const colors = TEAM_COLORS[key];
                      const sigColor = darkMode ? colors.darkPrimary : colors.primary;
                      const fgColor = getSignatureFg(sigColor);
                      const isSelected = favoriteTeam === key;
                      const isLast = i === teams.length - 1;

                      return (
                        <button
                          key={key}
                          onClick={() => handleSelect(key)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                          style={{
                            background: isSelected ? sigColor : 'var(--color-bg-secondary)',
                            borderBottom: isLast ? 'none' : '1px solid var(--color-separator)',
                          }}
                          aria-pressed={isSelected}
                        >
                          {/* Color swatch */}
                          <div
                            className="w-6 h-6 rounded-full flex-shrink-0"
                            style={{
                              background: sigColor,
                              boxShadow: isSelected
                                ? 'none'
                                : `0 0 0 2px var(--color-bg-secondary), 0 0 0 3px ${sigColor}`,
                            }}
                          />

                          {/* Abbreviation */}
                          <span
                            className="font-display font-bold text-sm w-8 flex-shrink-0"
                            style={{
                              color: isSelected ? fgColor : 'var(--color-label)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {key.toUpperCase()}
                          </span>

                          {/* Full name */}
                          <span
                            className="text-sm flex-1"
                            style={{
                              color: isSelected ? fgColor : 'var(--color-label-secondary)',
                              opacity: isSelected ? 0.9 : 1,
                            }}
                          >
                            {TEAM_NAMES[key]}
                          </span>

                          {/* Check mark */}
                          {isSelected && (
                            <svg
                              width="16" height="16" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{ color: fgColor, flexShrink: 0 }}
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Clear selection */}
          {favoriteTeam && (
            <button
              onClick={handleClear}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-opacity active:opacity-60 mb-4"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-accent-red)',
              }}
            >
              Remove Favorite Team
            </button>
          )}
        </div>
      </div>
    </>
  );
}
