import { createContext, useContext, useState, useEffect } from 'react';
import { TEAM_COLORS } from '../data/teamColors';
import {
  applyDisplaySize,
  persistDisplaySize,
  readDisplaySize,
} from '../utils/displayPreferences';

const ThemeContext = createContext();

// Returns the relative luminance of an RGB hex color (0–1).
function getLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Returns the best foreground text color to place on top of a given hex bg.
export function getSignatureFg(hex) {
  return getLuminance(hex) > 0.45 ? '#0C0F14' : '#FFFFFF';
}

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('nfl-predictor-dark-mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [favoriteTeam, setFavoriteTeamState] = useState(() => {
    return localStorage.getItem('nfl-predictor-favorite-team') || null;
  });

  const [displaySize, setDisplaySizeState] = useState(() => readDisplaySize());

  // Apply dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('nfl-predictor-dark-mode', darkMode);
  }, [darkMode]);

  // Apply team CSS vars whenever favoriteTeam or darkMode changes
  useEffect(() => {
    const root = document.documentElement;
    const colors = favoriteTeam ? TEAM_COLORS[favoriteTeam] : null;

    if (colors) {
      const sig = darkMode ? colors.darkPrimary : colors.primary;
      root.style.setProperty('--color-signature', sig);
      root.style.setProperty('--color-signature-fg', getSignatureFg(sig));
    } else {
      root.style.removeProperty('--color-signature');
      root.style.removeProperty('--color-signature-fg');
    }
  }, [favoriteTeam, darkMode]);

  useEffect(() => {
    applyDisplaySize(displaySize);
    persistDisplaySize(displaySize);
  }, [displaySize]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const setFavoriteTeam = (teamKey) => {
    setFavoriteTeamState(teamKey);
    if (teamKey) {
      localStorage.setItem('nfl-predictor-favorite-team', teamKey);
    } else {
      localStorage.removeItem('nfl-predictor-favorite-team');
    }
  };

  const setDisplaySize = (size) => {
    setDisplaySizeState(applyDisplaySize(size));
  };

  return (
    <ThemeContext.Provider value={{
      darkMode,
      toggleDarkMode,
      favoriteTeam,
      setFavoriteTeam,
      displaySize,
      setDisplaySize,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
