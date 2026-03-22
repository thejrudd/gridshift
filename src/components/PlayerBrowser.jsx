import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchRoster, headshot } from '../utils/playerApi';
import { parseSearchQuery, matchesFilter } from '../utils/parseSearchQuery';
import PlayerProfile from './PlayerProfile';
import TeamPage from './TeamPage';

const POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];

const CONFERENCES = [
  {
    name: 'AFC',
    color: 'text-blue-600 dark:text-blue-400',
    divisions: ['AFC East', 'AFC North', 'AFC South', 'AFC West'],
  },
  {
    name: 'NFC',
    color: 'text-red-600 dark:text-red-400',
    divisions: ['NFC East', 'NFC North', 'NFC South', 'NFC West'],
  },
];

const PlayerBrowser = ({ teams, initialPlayer, onInitialPlayerConsumed, navBack }) => {
  const [selectedTeam, setSelectedTeam]     = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer ?? null);

  useEffect(() => {
    if (initialPlayer) {
      setSelectedPlayer(initialPlayer);
      onInitialPlayerConsumed?.();
      // Enrich with full ESPN roster data (jersey, positionName, etc.) if missing.
      // Rosters are cached in localStorage, so this completes near-instantly on repeat visits.
      if (initialPlayer.teamId) {
        fetchRoster(initialPlayer.teamId).then(roster => {
          const match = roster.find(p => String(p.id) === String(initialPlayer.id));
          if (match) {
            setSelectedPlayer(prev =>
              prev?.id === initialPlayer.id
                ? {
                    ...prev,
                    jersey:       prev.jersey       || match.jersey,
                    position:     prev.position     || match.position,
                    positionName: prev.positionName || match.positionName,
                    status:       prev.status       || match.status,
                  }
                : prev
            );
          }
        }).catch(() => {});
      }
    }
  }, [initialPlayer]);

  const [searchQuery, setSearchQuery]               = useState('');
  const [searchResults, setSearchResults]           = useState([]);
  const [searchLoading, setSearchLoading]           = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [positionFilter, setPositionFilter]         = useState('ALL');

  const searchRef  = useRef(null);
  const debounceRef = useRef(null);

  // Build a lookup: teamId (lowercase) → { division, conference } from the teams prop
  const teamLookup = useRef({});
  useEffect(() => {
    const map = {};
    for (const team of teams) {
      const id = team.id.toLowerCase();
      map[id] = { name: team.name, division: team.division, conference: team.division?.split(' ')[0] ?? '' };
    }
    teamLookup.current = map;
  }, [teams]);

  // ── Browser history ──────────────────────────────────────────────────────
  const skipFirstTeam   = useRef(true);
  const skipFirstPlayer = useRef(true);

  useEffect(() => {
    if (skipFirstTeam.current) { skipFirstTeam.current = false; return; }
    if (selectedTeam) history.pushState({ _nav: 'browser', type: 'team' }, '');
  }, [selectedTeam]);

  useEffect(() => {
    if (skipFirstPlayer.current) { skipFirstPlayer.current = false; return; }
    if (selectedPlayer) history.pushState({ _nav: 'browser', type: 'player' }, '');
  }, [selectedPlayer]);

  useEffect(() => {
    const onPopState = (e) => {
      if (e.state?._nav === 'browser') {
        if (selectedPlayer) setSelectedPlayer(null);
        else if (selectedTeam) setSelectedTeam(null);
      } else if (e.state?._nav === 'app') {
        // Navigated above browser level — clear selections
        setSelectedPlayer(null);
        setSelectedTeam(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectedPlayer, selectedTeam]);
  // ────────────────────────────────────────────────────────────────────────

  // Debounced smart search across all team rosters (rosters are cached in localStorage).
  // Supports position names/abbreviations, team names/cities/nicknames,
  // conference/division terms, and name search — all AND-combined.
  const handleSearchInput = useCallback((e) => {
    const q = e.target.value;
    setSearchQuery(q);
    setShowSearchDropdown(true);

    clearTimeout(debounceRef.current);
    if (q.trim().length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const filters = parseSearchQuery(q);

        // If nothing was parsed at all, bail early
        const hasFilters = filters.pos.size || filters.team.size ||
                           filters.div.size || filters.conf.size || filters.name.length;
        if (!hasFilters) { setSearchResults([]); setSearchLoading(false); return; }

        const allRosters = await Promise.all(
          teams.map(team =>
            fetchRoster(team.id)
              .then(players => players.map(p => ({ ...p, teamId: team.id.toLowerCase(), teamName: team.name })))
              .catch(() => [])
          )
        );

        const lookup = teamLookup.current;
        // Effective position filter: query overrides chip; fall back to chip if chip ≠ ALL
        const effectivePos = filters.pos.size > 0 ? filters.pos
          : (positionFilter !== 'ALL' ? new Set([positionFilter]) : new Set());

        const results = allRosters
          .flat()
          .filter(p => {
            // Name terms (AND — all must appear in name)
            if (filters.name.length > 0) {
              const name = p.displayName.toLowerCase();
              if (!filters.name.every(t => name.includes(t))) return false;
            }
            // Position (OR within the set)
            if (effectivePos.size > 0) {
              if (![...effectivePos].some(pos => matchesFilter(p.position, pos))) return false;
            }
            const teamInfo = lookup[p.teamId];
            // Team (OR within the set — multiple teams allowed e.g. "New York")
            if (filters.team.size > 0) {
              if (!filters.team.has(p.teamId)) return false;
            }
            // Division (OR within the set)
            if (filters.div.size > 0) {
              if (!teamInfo || !filters.div.has(teamInfo.division)) return false;
            }
            // Conference (OR within the set)
            if (filters.conf.size > 0) {
              if (!teamInfo || !filters.conf.has(teamInfo.conference)) return false;
            }
            return true;
          })
          .slice(0, 30);
        setSearchResults(results);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PlayerBrowser search] error:', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, [teams, positionFilter]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectPlayer = (player) => {
    setSelectedPlayer(player);
    setShowSearchDropdown(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // ── Render priority: player profile → team page → browser list

  if (selectedPlayer) {
    return (
      <PlayerProfile
        playerId={selectedPlayer.id}
        playerMeta={selectedPlayer}
        teamId={selectedPlayer.teamId}
        teams={teams}
        onBack={navBack?.onBack ?? (() => history.back())}
        backLabel={navBack?.label}
      />
    );
  }

  if (selectedTeam) {
    return (
      <TeamPage
        team={selectedTeam}
        onBack={() => history.back()}
        onSelectPlayer={handleSelectPlayer}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Search + position filter bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 space-y-3">
        {/* Search */}
        <div ref={searchRef} className="relative">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchInput}
              onFocus={() => searchQuery.length >= 1 && setShowSearchDropdown(true)}
              placeholder="Search by name, position, team, division…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            />
            {searchLoading && (
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>

          {/* Search dropdown */}
          {showSearchDropdown && searchQuery.length >= 1 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {searchResults.length === 0 && !searchLoading && (
                <p className="px-4 py-3 text-sm text-gray-400 italic">No players found.</p>
              )}
              {searchResults.map(player => (
                <button
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                >
                  <PlayerThumbnail id={player.id} name={player.displayName} />
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">{player.displayName}</div>
                    <div className="text-xs text-gray-400">
                      {player.position}{player.teamName ? ` · ${player.teamName}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Position filter chips + Compare toggle */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {POSITION_FILTERS.map(pos => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                positionFilter === pos
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Team browser — AFC then NFC */}
      {CONFERENCES.map(conf => (
        <div key={conf.name}>
          <h2 className={`text-2xl font-display tracking-wider mb-3 ${conf.color}`}>{conf.name}</h2>
          <div className="space-y-4">
            {conf.divisions.map(division => {
              const divTeams = teams.filter(t => t.division === division);
              return (
                <div key={division}>
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold mb-2 px-1">
                    {division}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {divTeams.map(team => (
                      <TeamCard
                        key={team.id}
                        team={team}
                        onClick={() => setSelectedTeam(team)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Team Card — simple drill-down button ──────────────────────────────────────

const TeamCard = ({ team, onClick }) => (
  <button
    onClick={onClick}
    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-3 w-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
    style={{ height: '64px' }}
  >
    <img
      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id.toLowerCase()}.png`}
      alt={team.name}
      className="w-10 h-10 object-contain shrink-0"
      onError={e => { e.target.style.display = 'none'; }}
    />
    <div className="flex-1 min-w-0">
      <div className="font-bold text-gray-800 dark:text-gray-100 text-sm leading-tight">{team.name}</div>
    </div>
    <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

// Headshot with initials fallback
const PlayerThumbnail = ({ id, name, size = 'sm' }) => {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const cls = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return err ? (
    <div className={`${cls} rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0`}>
      <span className="text-[10px] font-bold text-gray-400">{initials}</span>
    </div>
  ) : (
    <img src={headshot(id)} alt="" className={`${cls} rounded-full object-cover bg-gray-100 dark:bg-gray-700 shrink-0`} onError={() => setErr(true)} />
  );
};


export default PlayerBrowser;
