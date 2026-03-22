import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchRoster } from '../../utils/playerApi';
import { parseSearchQuery, matchesFilter } from '../../utils/parseSearchQuery';

// ── Search guide chips ────────────────────────────────────────────────────────

const GUIDE_SECTIONS = [
  {
    label: 'By player name',
    chips: ['Patrick Mahomes', 'Josh', 'Jefferson'],
  },
  {
    label: 'By team — nickname, city, or abbreviation',
    chips: ['Bears', 'Detroit', 'KC', '49ers', 'New England'],
  },
  {
    label: 'By position — abbreviation, full name, or plural',
    chips: ['QB', 'RBs', 'Wide Receiver', 'Tight Ends', 'Kicker'],
  },
  {
    label: 'By conference or division',
    chips: ['NFC', 'AFC', 'NFC West', 'AFC North'],
  },
  {
    label: 'Combine terms — order doesn\'t matter',
    chips: ['RB Bears', 'QB NFC West', 'WRs in Detroit', 'Receivers on the Chiefs'],
  },
  {
    label: 'Natural language — filler words are ignored',
    chips: ['Running backs in Detroit', 'QBs playing for the Bears', 'Tight ends in the AFC'],
  },
];

function SearchGuide({ onExample }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-5">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
        Search by any combination of name, team, position, conference, or division.
        Tap an example to try it.
      </p>
      {GUIDE_SECTIONS.map(({ label, chips }) => (
        <div key={label}>
          <div
            className="text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--color-label-quaternary)' }}
          >
            {label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(chip => (
              <button
                key={chip}
                onClick={() => onExample(chip)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-opacity active:opacity-60"
                style={{
                  background: 'var(--color-fill)',
                  color: 'var(--color-label-secondary)',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ComparePickerSheet ────────────────────────────────────────────────────────

/**
 * Bottom-sheet player picker that searches ESPN rosters using the shared
 * parseSearchQuery utility. Supports full smart search with guide chips.
 *
 * Props:
 *   teams      - NFL teams array from scheduleData
 *   excludeId  - ESPN player ID to exclude (the other slot's current player)
 *   onSelect   - called with the selected ESPN player object
 *   onClose    - dismiss the sheet
 */
export default function ComparePickerSheet({ teams, excludeId, onSelect, onClose }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  // teamLookup for div/conference filtering
  const teamLookupRef = useRef({});
  useEffect(() => {
    const map = {};
    for (const team of teams) {
      const id = team.id.toLowerCase();
      map[id] = { division: team.division, conference: team.division?.split(' ')[0] ?? '' };
    }
    teamLookupRef.current = map;
  }, [teams]);

  const runSearch = useCallback(async (q) => {
    if (q.trim().length < 1) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const filters = parseSearchQuery(q);
      const hasFilters = filters.pos.size || filters.team.size ||
                         filters.div.size || filters.conf.size || filters.name.length;
      if (!hasFilters) { setResults([]); setLoading(false); return; }

      const allRosters = await Promise.all(
        teams.map(team =>
          fetchRoster(team.id)
            .then(players => players.map(p => ({ ...p, teamId: team.id.toLowerCase(), teamName: team.name })))
            .catch(() => [])
        )
      );

      const lookup = teamLookupRef.current;
      const found = allRosters
        .flat()
        .filter(p => {
          if (String(p.id) === String(excludeId)) return false;
          if (filters.name.length > 0) {
            const name = p.displayName.toLowerCase();
            if (!filters.name.every(t => name.includes(t))) return false;
          }
          if (filters.pos.size > 0) {
            if (![...filters.pos].some(pos => matchesFilter(p.position, pos))) return false;
          }
          const teamInfo = lookup[p.teamId];
          if (filters.team.size > 0 && !filters.team.has(p.teamId)) return false;
          if (filters.div.size > 0 && (!teamInfo || !filters.div.has(teamInfo.division))) return false;
          if (filters.conf.size > 0 && (!teamInfo || !filters.conf.has(teamInfo.conference))) return false;
          return true;
        })
        .slice(0, 30);
      setResults(found);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ComparePickerSheet] search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [teams, excludeId]);

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 1) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
  }

  function handleExample(text) {
    setQuery(text);
    clearTimeout(debounceRef.current);
    runSearch(text);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--color-bg-secondary)',
          maxWidth: '640px',
          marginLeft: 'auto',
          marginRight: 'auto',
          maxHeight: '80vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'var(--color-fill)' }} />
        </div>

        {/* Header + search */}
        <div className="px-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-base" style={{ color: 'var(--color-label)' }}>
              Select Player
            </span>
            <button onClick={onClose} className="p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-label-quaternary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={handleInput}
              autoFocus
              placeholder="Name, team, position, or natural language…"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label)',
                fontSize: 16,
              }}
            />
            {loading && (
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4" style={{ color: 'var(--color-accent)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
        </div>

        {/* Results / guide */}
        <div className="overflow-y-auto flex-1">
          {!query.trim() && <SearchGuide onExample={handleExample} />}
          {query.trim() && !loading && results.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: 'var(--color-label-tertiary)' }}>
                No players found for &ldquo;{query}&rdquo;
              </span>
            </div>
          )}
          {results.map(player => (
            <button
              key={player.id}
              onClick={() => onSelect(player)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity active:opacity-70"
              style={{ borderBottom: '1px solid var(--color-separator)' }}
            >
              <PlayerThumb id={player.id} name={player.displayName} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
                  {player.displayName}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                  {player.position}{player.teamName ? ` · ${player.teamName}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function PlayerThumb({ id, name }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const src = `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

  return err ? (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
      style={{ background: 'var(--color-fill)', color: 'var(--color-label-quaternary)' }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={src}
      alt=""
      className="w-8 h-8 rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill-secondary)' }}
      onError={() => setErr(true)}
    />
  );
}
