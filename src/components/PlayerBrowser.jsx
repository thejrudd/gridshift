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

function buildPlayerMeta(player = {}, fallback = {}) {
  return {
    id: String(player.id ?? fallback.id ?? ''),
    displayName: player.displayName || fallback.displayName || '',
    jersey: player.jersey || fallback.jersey || '',
    position: player.position || fallback.position || '',
    positionName: player.positionName || fallback.positionName || '',
    experience: player.experience ?? fallback.experience,
    status: player.status || fallback.status || '',
    teamId: player.teamId || fallback.teamId || null,
  };
}

const PlayerBrowser = ({
  teams,
  statsView = 'browser',
  selectedTeamId = null,
  selectedPlayerId = null,
  selectedPlayerMeta = null,
  navBack,
  onNavigateHome,
  onNavigateTeam,
  onNavigatePlayer,
  onComparePlayer,
  onBuildTrade,
}) => {
  const [resolvedPlayer, setResolvedPlayer] = useState(() => (
    selectedPlayerMeta && selectedPlayerId ? buildPlayerMeta(selectedPlayerMeta, { id: selectedPlayerId }) : null
  ));
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerLoadError, setPlayerLoadError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [positionFilter, setPositionFilter] = useState('ALL');

  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const normalizedSelectedTeamId = typeof selectedTeamId === 'string'
    ? selectedTeamId.trim().toUpperCase()
    : null;
  const normalizedSelectedPlayerId = selectedPlayerId != null
    ? String(selectedPlayerId)
    : null;

  const teamLookup = useRef({});
  useEffect(() => {
    const map = {};
    for (const team of teams) {
      const id = team.id.toLowerCase();
      map[id] = { name: team.name, division: team.division, conference: team.division?.split(' ')[0] ?? '' };
    }
    teamLookup.current = map;
  }, [teams]);

  const selectedTeam = statsView === 'team'
    ? (teams.find((team) => team.id.toUpperCase() === normalizedSelectedTeamId) ?? null)
    : null;
  const selectedPlayer = statsView === 'player' ? resolvedPlayer : null;

  useEffect(() => {
    if (statsView !== 'player' || !normalizedSelectedPlayerId) {
      setResolvedPlayer(null);
      setPlayerLoading(false);
      setPlayerLoadError(null);
      return;
    }

    const nextMeta = selectedPlayerMeta
      ? buildPlayerMeta(selectedPlayerMeta, { id: normalizedSelectedPlayerId })
      : null;

    if (nextMeta?.id === normalizedSelectedPlayerId) {
      setResolvedPlayer((prev) => {
        if (prev?.id !== normalizedSelectedPlayerId) return nextMeta;
        return buildPlayerMeta(nextMeta, prev);
      });
      setPlayerLoadError(null);
    } else {
      setResolvedPlayer((prev) => (prev?.id === normalizedSelectedPlayerId ? prev : null));
    }
  }, [statsView, normalizedSelectedPlayerId, selectedPlayerMeta]);

  useEffect(() => {
    if (statsView !== 'player' || !normalizedSelectedPlayerId) return;

    let cancelled = false;
    const initialMeta = selectedPlayerMeta
      ? buildPlayerMeta(selectedPlayerMeta, { id: normalizedSelectedPlayerId })
      : null;
    const hasEnoughData = !!(initialMeta?.displayName && initialMeta?.teamId && initialMeta?.position);

    if (hasEnoughData) {
      setPlayerLoading(false);
      setPlayerLoadError(null);
      return () => { cancelled = true; };
    }

    setPlayerLoading(true);
    setPlayerLoadError(null);

    const prioritizedTeamIds = initialMeta?.teamId
      ? [initialMeta.teamId, ...teams.map((team) => team.id).filter((teamId) => teamId !== initialMeta.teamId)]
      : teams.map((team) => team.id);

    (async () => {
      for (const teamId of prioritizedTeamIds) {
        try {
          const roster = await fetchRoster(teamId);
          if (cancelled) return;
          const match = roster.find((player) => String(player.id) === normalizedSelectedPlayerId);
          if (!match) continue;

          setResolvedPlayer(buildPlayerMeta(match, initialMeta ?? { id: normalizedSelectedPlayerId }));
          setPlayerLoading(false);
          setPlayerLoadError(null);
          return;
        } catch {
          // Try the next team; a missing roster should not break direct player routes.
        }
      }

      if (cancelled) return;
      setPlayerLoading(false);
      if (initialMeta) {
        setResolvedPlayer(initialMeta);
        setPlayerLoadError(null);
      } else {
        setResolvedPlayer(null);
        setPlayerLoadError('Player details are unavailable.');
      }
    })();

    return () => { cancelled = true; };
  }, [statsView, normalizedSelectedPlayerId, selectedPlayerMeta, teams]);

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
        const hasFilters = filters.pos.size || filters.team.size
          || filters.div.size || filters.conf.size || filters.name.length;
        if (!hasFilters) {
          setSearchResults([]);
          setSearchLoading(false);
          return;
        }

        const allRosters = await Promise.all(
          teams.map((team) => (
            fetchRoster(team.id)
              .then((players) => players.map((player) => ({
                ...player,
                teamId: team.id.toLowerCase(),
                teamName: team.name,
              })))
              .catch(() => [])
          )),
        );

        const lookup = teamLookup.current;
        const effectivePos = filters.pos.size > 0
          ? filters.pos
          : (positionFilter !== 'ALL' ? new Set([positionFilter]) : new Set());

        const results = allRosters
          .flat()
          .filter((player) => {
            if (filters.name.length > 0) {
              const name = player.displayName.toLowerCase();
              if (!filters.name.every((term) => name.includes(term))) return false;
            }
            if (effectivePos.size > 0) {
              if (![...effectivePos].some((pos) => matchesFilter(player.position, pos))) return false;
            }
            const teamInfo = lookup[player.teamId];
            if (filters.team.size > 0 && !filters.team.has(player.teamId)) return false;
            if (filters.div.size > 0 && (!teamInfo || !filters.div.has(teamInfo.division))) return false;
            if (filters.conf.size > 0 && (!teamInfo || !filters.conf.has(teamInfo.conference))) return false;
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

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleSelectPlayer = useCallback((player) => {
    onNavigatePlayer?.(player);
    setShowSearchDropdown(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [onNavigatePlayer]);

  if (statsView === 'player') {
    if (selectedPlayer) {
      return (
        <PlayerProfile
          playerId={selectedPlayer.id}
          playerMeta={selectedPlayer}
          teamId={selectedPlayer.teamId}
          teams={teams}
          onBack={navBack?.onBack ?? (() => window.history.back())}
          backLabel={navBack?.label}
          onCompare={onComparePlayer}
          onBuildTrade={onBuildTrade}
        />
      );
    }

    return (
      <div className="space-y-4">
        <button
          onClick={navBack?.onBack ?? onNavigateHome}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: 'var(--color-accent)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {navBack?.label ?? 'Statistics'}
        </button>
        <div
          className="rounded-xl p-5 text-sm"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-separator)',
            color: playerLoadError ? 'var(--color-accent-red)' : 'var(--color-label-secondary)',
          }}
        >
          {playerLoading ? 'Loading player…' : (playerLoadError || 'Player details are unavailable.')}
        </div>
      </div>
    );
  }

  if (statsView === 'team') {
    if (selectedTeam) {
      return (
        <TeamPage
          team={selectedTeam}
          onBack={onNavigateHome}
          onSelectPlayer={handleSelectPlayer}
        />
      );
    }

    return (
      <div className="space-y-4">
        <button
          onClick={onNavigateHome}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: 'var(--color-accent)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Statistics
        </button>
        <div
          className="rounded-xl p-5 text-sm"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-separator)',
            color: 'var(--color-accent-red)',
          }}
        >
          Team details are unavailable.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        }}
      >
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
              {searchResults.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 active:opacity-80"
                  style={{ '--hover-bg': 'var(--color-fill)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-fill)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
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

        <div className="flex flex-wrap gap-2 items-center">
          {POSITION_FILTERS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className="px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95"
              style={positionFilter === pos
                ? { background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }
                : { background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {CONFERENCES.map((conf) => (
        <div key={conf.name}>
          <h2 className="text-2xl font-display tracking-wider mb-3" style={{ color: conf.color }}>{conf.name}</h2>
          <div className="space-y-4">
            {conf.divisions.map((division) => {
              const divTeams = teams.filter((team) => team.division === division);
              return (
                <div key={division}>
                  <h3
                    className="text-xs uppercase tracking-widest font-semibold mb-2 px-1"
                    style={{ color: 'var(--color-label-tertiary)' }}
                  >
                    {division}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {divTeams.map((team) => (
                      <TeamCard
                        key={team.id}
                        team={team}
                        onClick={() => onNavigateTeam?.(team)}
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
    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-fill)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
  >
    <img
      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id.toLowerCase()}.png`}
      alt={team.name}
      className="w-10 h-10 object-contain shrink-0"
      onError={(e) => { e.target.style.display = 'none'; }}
    />
    <div className="flex-1 min-w-0">
      <div className="font-bold text-sm leading-tight" style={{ color: 'var(--color-label)' }}>{team.name}</div>
    </div>
    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--color-label-quaternary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

const PlayerThumbnail = ({ id, name, size = 'sm' }) => {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
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
