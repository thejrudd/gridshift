import { useState, useCallback } from 'react';
import { ROOKIES_2026 } from '../../data/rookies';
import { FANTASY_POSITION_GROUPS } from './scoutUtils';
import ScoutPositionalSpotlight from './ScoutPositionalSpotlight';
import ScoutRosterList from './ScoutRosterList';
import ScoutPlayerSheet from './ScoutPlayerSheet';
import ScoutCompareSheet from './ScoutCompareSheet';

const SORT_OPTIONS = [
  { value: 'bigBoardRank', label: 'Big Board' },
  { value: 'nflGrade',     label: 'NFL Grade' },
  { value: 'dynastyAdp',   label: 'Dynasty ADP' },
  { value: 'draftOverall', label: 'Draft Pick' },
  { value: 'fortyYard',    label: '40-Yard Dash' },
  { value: 'rushYards',    label: 'Rush Yards' },
  { value: 'recYards',     label: 'Rec Yards' },
];

const POS_FILTERS = ['All', 'Fantasy', 'QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'OL', 'ST'];

function compareAscNullLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareDescNullLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function sortRookies(rookies, sortKey) {
  return [...rookies].sort((a, b) => {
    switch (sortKey) {
      case 'fortyYard':
        return compareAscNullLast(a.combine?.fortyYard, b.combine?.fortyYard);
      case 'rushYards':
        return compareDescNullLast(a.collegeStats?.rushYards, b.collegeStats?.rushYards);
      case 'recYards':
        return compareDescNullLast(a.collegeStats?.recYards, b.collegeStats?.recYards);
      case 'dynastyAdp':
        return compareAscNullLast(a.dynastyAdp, b.dynastyAdp);
      case 'draftOverall':
        return compareAscNullLast(a.draftOverall, b.draftOverall);
      case 'nflGrade':
        return compareDescNullLast(a.nflGrade, b.nflGrade);
      case 'bigBoardRank':
      default:
        return compareAscNullLast(a.bigBoardRank, b.bigBoardRank);
    }
  });
}

export default function ScoutTab() {
  const [posFilter, setPosFilter] = useState('All');
  const [sortKey, setSortKey]     = useState('bigBoardRank');
  const [search, setSearch]       = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [compareA, setCompareA]   = useState(null);
  const [compareB, setCompareB]   = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);

  // Ranked on full sorted list before filter (per AGENTS.md gotcha)
  const sorted = sortRookies(ROOKIES_2026, sortKey).map((r, i) => ({ ...r, rank: i + 1 }));

  const filtered = sorted.filter(r => {
    if (posFilter === 'Fantasy' && !FANTASY_POSITION_GROUPS.has(r.positionGroup)) return false;
    if (posFilter !== 'All' && posFilter !== 'Fantasy' && r.positionGroup !== posFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q)
        || r.college?.toLowerCase().includes(q)
        || r.position?.toLowerCase().includes(q)
        || r.positionGroup?.toLowerCase().includes(q)
        || r.draftTeam?.toLowerCase().includes(q)
        || r.draftTeamName?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSelectPlayer = useCallback((player) => {
    setSelectedPlayer(player);
  }, []);

  const handleCompare = useCallback((player) => {
    if (!compareA) {
      setCompareA(player);
    } else if (!compareB && player.id !== compareA.id) {
      setCompareB(player);
      setCompareOpen(true);
    } else {
      // Reset and start fresh with this player
      setCompareA(player);
      setCompareB(null);
      setCompareOpen(false);
    }
  }, [compareA, compareB]);

  const handleCloseCompare = useCallback(() => {
    setCompareOpen(false);
    setCompareA(null);
    setCompareB(null);
  }, []);

  return (
    <div className="scout-tab">
      {/* ── Editorial header ───────────────────────────────── */}
      <ScoutPositionalSpotlight players={sorted} onSelectPlayer={handleSelectPlayer} />

      {/* ── Filter / sort toolbar ──────────────────────────── */}
      <div className="scout-toolbar">
        {/* Position chips */}
        <div className="scout-pos-chips scrollbar-hide">
          {POS_FILTERS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className="scout-chip"
              aria-pressed={posFilter === pos}
              style={posFilter === pos ? {
                background: 'var(--color-signature)',
                color: 'var(--color-signature-fg)',
              } : {
                background: 'var(--color-fill)',
                color: 'var(--color-label-secondary)',
              }}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="scout-search-wrap">
          <svg
            className="scout-search-icon"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search prospects…"
            aria-label="Search prospects"
            className="scout-search-input"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Sort */}
        <div className="scout-sort-wrap">
          <span className="scout-sort-label">Sort</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="scout-sort-select"
            aria-label="Sort prospects by"
            style={{ fontSize: '16px' }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Ranked list ────────────────────────────────────── */}
      <div className="scout-list-shell">
        <ScoutRosterList
          players={filtered}
          selectedPlayerId={selectedPlayer?.id}
          compareAId={compareA?.id}
          onSelectPlayer={handleSelectPlayer}
          onCompare={handleCompare}
        />

        {/* Desktop detail panel */}
        {selectedPlayer && (
          <div className="scout-detail-panel">
            <ScoutPlayerSheet
              player={selectedPlayer}
              variant="panel"
              onClose={() => setSelectedPlayer(null)}
              onCompare={handleCompare}
              compareAId={compareA?.id}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {selectedPlayer && (
        <ScoutPlayerSheet
          player={selectedPlayer}
          variant="sheet"
          onClose={() => setSelectedPlayer(null)}
          onCompare={handleCompare}
          compareAId={compareA?.id}
        />
      )}

      {/* Compare overlay */}
      {compareOpen && compareA && compareB && (
        <ScoutCompareSheet
          playerA={compareA}
          playerB={compareB}
          onClose={handleCloseCompare}
        />
      )}
    </div>
  );
}
