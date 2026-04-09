import { useState, useEffect, useCallback } from 'react';
import { usePredictions } from '../context/PredictionContext';
import ShareableImage from './ShareableImage';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import {
  BENTO_LAYOUTS, SECTION_ORDER, RGL_TOTAL_ROWS,
  getCellInfo, matchSectionsToCells, bentoToRGL12,
} from '../utils/layoutUtils';

const SECTION_LABELS = {
  bestWorst: 'Best & Worst Teams',
  playoffSeeds: 'Playoff Seeds',
  divisionWinners: 'Division Winners',
  conferenceShowdown: 'Conference Showdown',
  toughestDivision: 'Toughest Division',
  boldPredictions: 'Bold Predictions',
  worstDivision: 'Worst Division',
  strengthOfSchedule: 'Strength of Schedule',
  closestRace: 'Closest Division Race',
  wildCard: 'Wild Card Teams',
  parityIndex: 'Parity Index',
};

// Compute default RGL layout from BENTO_LAYOUTS for the given active sections
function computeDefaultLayout(enabledSections) {
  const active = SECTION_ORDER.filter(k => enabledSections[k]);
  const count = active.length;
  if (count === 0) return [];

  const bento = BENTO_LAYOUTS[count] || BENTO_LAYOUTS[1];
  const cellInfos = bento.cells.map(([c1, c2, r1, r2]) =>
    getCellInfo(c1, c2, r1, r2, bento.rowFrs)
  );
  const assignment = matchSectionsToCells(active, cellInfos);

  // Build section keys ordered by cell assignment
  const sectionKeysForCells = bento.cells.map((_, cellIdx) => {
    const sectionIdx = assignment.indexOf(cellIdx);
    return sectionIdx >= 0 ? active[sectionIdx] : String(cellIdx);
  });

  return bentoToRGL12(bento.cells, bento.rowFrs, sectionKeysForCells);
}

const ExportPreview = ({ teams, onClose }) => {
  const { predictions } = usePredictions();
  useBodyScrollLock();
  const [userName, setUserName] = useState('');
  const [enabledSections, setEnabledSections] = useState({
    bestWorst: true,
    playoffSeeds: true,
    divisionWinners: true,
    conferenceShowdown: true,
    toughestDivision: true,
    boldPredictions: true,
    worstDivision: false,
    strengthOfSchedule: false,
    closestRace: false,
    wildCard: false,
    parityIndex: false,
  });
  const [rglLayout, setRglLayout] = useState(() => computeDefaultLayout({
    bestWorst: true, playoffSeeds: true, divisionWinners: true,
    conferenceShowdown: true, toughestDivision: true, boldPredictions: true,
    worstDivision: false, strengthOfSchedule: false, closestRace: false,
    wildCard: false, parityIndex: false,
  }));

  // Recompute default layout when sections are toggled
  useEffect(() => {
    setRglLayout(computeDefaultLayout(enabledSections));
  }, [enabledSections]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const toggleSection = (key) => {
    setEnabledSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Only update layout state on actual user drag/resize interactions,
  // not on RGL's internal onLayoutChange which fires during section
  // toggles and causes collision cascades.
  const handleUserLayoutChange = useCallback((layout) => {
    const cols = 4;
    const rows = RGL_TOTAL_ROWS;

    // Split into items that fit vs overflow
    const inBounds = [];
    const overflow = [];
    for (const item of layout) {
      if (item.y >= 0 && item.y + item.h <= rows) {
        inBounds.push(item);
      } else {
        overflow.push(item);
      }
    }

    if (overflow.length === 0) {
      setRglLayout(layout);
      return;
    }

    // Disable any overflowing sections instead of trying to repack
    setEnabledSections(prev => {
      const next = { ...prev };
      for (const item of overflow) {
        next[item.i] = false;
      }
      return next;
    });
  }, []);

  const handleResetLayout = () => {
    setRglLayout(computeDefaultLayout(enabledSections));
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
          <h2 className="text-xl font-display tracking-wide">CREATE IMAGE</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-3xl leading-none"
            aria-label="Close export preview"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Interactive preview */}
            <div className="flex-1 flex items-start justify-center">
              <ShareableImage
                predictions={predictions}
                teams={teams}
                enabledSections={enabledSections}
                userName={userName}
                rglLayout={rglLayout}
                onDragStop={handleUserLayoutChange}
                onResizeStop={handleUserLayoutChange}
              />
            </div>

            {/* Controls */}
            <div className="lg:w-64 space-y-4">
              {/* User name input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Your Name / Handle
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. @thejrudd"
                  className="w-full px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Section toggles */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Sections
                </label>
                <div className="space-y-2">
                  {Object.entries(SECTION_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabledSections[key]}
                        onChange={() => toggleSection(key)}
                        className="w-4 h-4 rounded text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Reset layout button */}
              <button
                onClick={handleResetLayout}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors border border-gray-300 dark:border-gray-600"
              >
                Reset Layout
              </button>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportPreview;
