import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchRoster, headshot } from '../utils/playerApi';
import { parseSearchQuery, matchesFilter } from '../utils/parseSearchQuery';
import PlayerProfile from './PlayerProfile';
import TeamPage from './TeamPage';

const POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];

const CONFERENCES = [
  {
    name: 'AFC',
    color: 'var(--color-accent)',
    divisions: ['AFC East', 'AFC North', 'AFC South', 'AFC West'],
  },
  {
    name: 'NFC',
    color: 'var(--color-accent-red)',
    divisions: ['NFC East', 'NFC North', 'NFC South', 'NFC West'],
  },
];

const PlayerBrowser = ({ teams, initialPlayer, onInitialPlayerConsumed, navBack, onComparePlayer, onBuildTrade }) => {
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
        onCompare={onComparePlayer}
        onBuildTrade={onBuildTrade}
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
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        }}
      >
        {/* Search */}
        <div ref={searchRef} className="relative">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-label-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchInput}
              onFocus={() => searchQuery.length >= 1 && setShowSearchDropdown(true)}
              placeholder="Search by name, position, team, division…"
              className="w-full pl-9 pr-4 py-2 rounded-lg text-base focus:outline-none"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-separator)',
                color: 'var(--color-label)',
                '--tw-ring-color': 'var(--color-accent)',
              }}
            />
            {searchLoading && (
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4" style={{ color: 'var(--color-accent)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>

          {/* Search dropdown */}
          {showSearchDropdown && searchQuery.length >= 1 && (
            <div
              className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden max-h-72 overflow-y-auto"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
              }}
            >
              {searchResults.length === 0 && !searchLoading && (
                <p className="px-4 py-3 text-sm italic" style={{ color: 'var(--color-label-tertiary)' }}>No players found.</p>
              )}
              {searchResults.map(player => (
                <button
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 active:opacity-80"
                  style={{ '--hover-bg': 'var(--color-fill)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fill)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <PlayerThumbnail id={player.id} name={player.displayName} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>{player.displayName}</div>
                    <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                      {player.position}{player.teamName ? ` · ${player.teamName}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Position filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          {POSITION_FILTERS.map(pos => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className="px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95"
              style={positionFilter === pos
                ? { background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }
                : { background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }
              }
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Team browser — AFC then NFC */}
      {CONFERENCES.map(conf => (
        <div key={conf.name}>
          <h2 className="text-2xl font-display tracking-wider mb-3" style={{ color: conf.color }}>{conf.name}</h2>
          <div className="space-y-4">
            {conf.divisions.map(division => {
              const divTeams = teams.filter(t => t.division === division);
              return (
                <div key={division}>
                  <h3
                    className="text-xs uppercase tracking-widest font-semibold mb-2 px-1"
                    style={{ color: 'var(--color-label-tertiary)' }}
                  >
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
    className="rounded-xl p-3 flex items-center gap-3 w-full transition-all duration-150 text-left active:scale-[0.98]"
    style={{
      height: '64px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-separator)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-fill)'}
    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
  >
    <img
      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id.toLowerCase()}.png`}
      alt={team.name}
      className="w-10 h-10 object-contain shrink-0"
      onError={e => { e.target.style.display = 'none'; }}
    />
    <div className="flex-1 min-w-0">
      <div className="font-bold text-sm leading-tight" style={{ color: 'var(--color-label)' }}>{team.name}</div>
    </div>
    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--color-label-quaternary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    <div className={`${cls} rounded-full flex items-center justify-center shrink-0`} style={{ background: 'var(--color-fill)' }}>
      <span className="text-[10px] font-bold" style={{ color: 'var(--color-label-tertiary)' }}>{initials}</span>
    </div>
  ) : (
    <img src={headshot(id)} alt="" className={`${cls} rounded-full object-cover shrink-0`} style={{ background: 'var(--color-fill)' }} onError={() => setErr(true)} />
  );
};


export default PlayerBrowser;
