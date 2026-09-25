import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPlayerProfile, fetchRoster, headshot } from '../utils/playerApi';
import { matchesFilter, matchesJerseyNumber, parseSearchQuery } from '../utils/parseSearchQuery';
import PlayerProfile from './PlayerProfile';
import TeamPage from './TeamPage';
import { getTeamVisualTheme } from '../utils/teamVisualTheme';
import { formatPlayerHeight, formatPlayerWeight, formatPlayerMeasurements } from '../utils/playerMeasurements.js';
import { useSleeperStats } from '../context/SleeperContext';
import Spinner from './ui/Spinner';

const POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];

const CONFERENCES = [
  {
    name: 'AFC',
    divisions: ['AFC East', 'AFC North', 'AFC South', 'AFC West'],
  },
  {
    name: 'NFC',
    divisions: ['NFC East', 'NFC North', 'NFC South', 'NFC West'],
  },
];

const TEAM_LABEL_STYLE = { letterSpacing: '0.16em' };
const TEAM_CARD_THEME_OPTIONS = { logoSide: 'start' };

function LoadingSpinner({ className = '' }) {
  return <Spinner size="sm" className={className} style={{ color: 'var(--color-accent)' }} />;
}

// 2025 season champions (Super Bowl LX played February 2026)
const SEASON_2025_CHAMPIONS = {
  superBowl: 'sea',
  conference: { afc: 'ne', nfc: 'sea' },
  division: {
    'AFC East': 'ne',
    'AFC North': 'pit',
    'AFC South': 'jax',
    'AFC West': 'den',
    'NFC East': 'phi',
    'NFC North': 'chi',
    'NFC South': 'car',
    'NFC West': 'sea',
  },
};
function buildPlayerMeta(player = {}, fallback = {}) {
  const id = player.id ?? fallback.id ?? '';
  const espnId = player.espnId
    ?? player.espn_id
    ?? player.sourceIds?.espn
    ?? fallback.espnId
    ?? fallback.espn_id
    ?? fallback.sourceIds?.espn
    ?? (/^\d+$/.test(String(id)) ? id : null);
  const sourceIds = {
    ...(fallback.sourceIds ?? {}),
    ...(player.sourceIds ?? {}),
  };
  if (espnId != null) sourceIds.espn = String(espnId);

  return {
    id: String(id),
    sleeperId: player.sleeperId ?? fallback.sleeperId,
    espnId: espnId != null ? String(espnId) : undefined,
    espn_id: espnId != null ? String(espnId) : undefined,
    sourceIds,
    displayName: player.displayName || fallback.displayName || '',
    jersey: player.jersey || fallback.jersey || '',
    position: player.position || fallback.position || '',
    positionName: player.positionName || fallback.positionName || '',
    experience: player.experience ?? fallback.experience,
    status: player.status || fallback.status || '',
    teamId: player.teamId || fallback.teamId || null,
    height: formatPlayerHeight(player.height) ?? formatPlayerHeight(fallback.height),
    weight: formatPlayerWeight(player.weight) ?? formatPlayerWeight(fallback.weight),
  };
}

function getSleeperDisplayName(player = {}) {
  return player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
}

function normalizeSleeperSearchResult(sleeperId, player = {}, espnIdOverrides = {}, teams = []) {
  const espnId = player.espn_id ?? espnIdOverrides?.[sleeperId] ?? null;
  const displayName = getSleeperDisplayName(player);
  if (!espnId || !displayName) return null;

  const teamId = player.team?.toLowerCase?.() ?? null;
  const team = teamId ? teams.find((item) => item.id.toLowerCase() === teamId) : null;
  const isRetired = player.active === false && !teamId;

  return {
    id: String(espnId),
    sleeperId: String(sleeperId),
    displayName,
    jersey: player.number ?? '',
    position: player.position ?? '',
    positionName: '',
    height: formatPlayerHeight(player.height),
    weight: formatPlayerWeight(player.weight),
    experience: player.years_exp != null ? player.years_exp + 1 : undefined,
    status: player.status ?? player.injury_status ?? (isRetired ? 'Retired' : ''),
    teamId,
    teamName: team?.name ?? (teamId ? teamId.toUpperCase() : (isRetired ? 'Retired' : 'Free Agent')),
    source: 'sleeper',
    active: player.active,
    searchRank: Number(player.search_rank),
  };
}

const PlayerBrowser = ({
  teams,
  darkMode = false,
  statsView = 'browser',
  selectedTeamId = null,
  selectedPlayerId = null,
  selectedPlayerMeta = null,
  selectedPlayerMode = 'game',
  leagueSeason = null,
  navBack,
  onNavigateHome,
  onNavigateTeam,
  onNavigatePlayer,
  onViewSchedule,
  onPlayerModeChange,
  onComparePlayer,
  onBuildTrade,
  onOpenFantasyTeam,
  tradeDisabled = false,
  tradeDisabledTitle = 'Trade is not available for the connected platform.',
}) => {
  const { loadPlayers, espnIdOverrides } = useSleeperStats();
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
    setPlayerLoading(true);
    setPlayerLoadError(null);

    const prioritizedTeamIds = initialMeta?.teamId
      ? [initialMeta.teamId, ...teams.map((team) => team.id).filter((teamId) => teamId !== initialMeta.teamId)]
      : teams.map((team) => team.id);

    (async () => {
      try {
        const profile = await fetchPlayerProfile(normalizedSelectedPlayerId);
        if (cancelled) return;
        if (profile?.id) {
          setResolvedPlayer(buildPlayerMeta(profile, initialMeta ?? { id: normalizedSelectedPlayerId }));
          setPlayerLoading(false);
          setPlayerLoadError(null);
          return;
        }
      } catch {
        // Fall back to active roster lookup; older ESPN profiles can be sparse.
      }

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
          || filters.div.size || filters.conf.size || filters.number.size || filters.name.length;
        if (!hasFilters) {
          setSearchResults([]);
          setSearchLoading(false);
          return;
        }

        const [allRosters, sleeperPlayers] = await Promise.all([
          Promise.all(
            teams.map((team) => (
              fetchRoster(team.id)
                .then((players) => players.map((player) => ({
                  ...player,
                  teamId: team.id.toLowerCase(),
                  teamName: team.name,
                  source: 'roster',
                })))
                .catch(() => [])
            )),
          ),
          loadPlayers().catch(() => null),
        ]);

        const lookup = teamLookup.current;
        const effectivePos = filters.pos.size > 0
          ? filters.pos
          : (positionFilter !== 'ALL' ? new Set([positionFilter]) : new Set());

        const matchesSearchFilters = (player) => {
          if (filters.name.length > 0) {
            const name = player.displayName.toLowerCase();
            if (!filters.name.every((term) => name.includes(term))) return false;
          }
          if (effectivePos.size > 0) {
            if (![...effectivePos].some((pos) => matchesFilter(player.position, pos))) return false;
          }
          if (filters.number.size > 0
            && ![...filters.number].some((number) => matchesJerseyNumber(player.jersey, number))) return false;
          const teamInfo = player.teamId ? lookup[player.teamId] : null;
          if (filters.team.size > 0 && (!player.teamId || !filters.team.has(player.teamId))) return false;
          if (filters.div.size > 0 && (!teamInfo || !filters.div.has(teamInfo.division))) return false;
          if (filters.conf.size > 0 && (!teamInfo || !filters.conf.has(teamInfo.conference))) return false;
          return true;
        };

        const rosterResults = allRosters
          .flat()
          .filter(matchesSearchFilters);

        const sleeperResults = sleeperPlayers
          ? Object.entries(sleeperPlayers)
            .map(([sleeperId, player]) => normalizeSleeperSearchResult(sleeperId, player, espnIdOverrides, teams))
            .filter(Boolean)
            .filter(matchesSearchFilters)
          : [];

        const deduped = new Map();
        for (const player of [...rosterResults, ...sleeperResults]) {
          const existing = deduped.get(player.id);
          if (!existing || existing.source !== 'roster') deduped.set(player.id, player);
        }

        const results = [...deduped.values()]
          .sort((left, right) => {
            const leftName = left.displayName.toLowerCase();
            const rightName = right.displayName.toLowerCase();
            const queryName = filters.name.join(' ');
            const leftStarts = queryName && leftName.startsWith(queryName) ? 0 : 1;
            const rightStarts = queryName && rightName.startsWith(queryName) ? 0 : 1;
            if (leftStarts !== rightStarts) return leftStarts - rightStarts;
            const leftRoster = left.source === 'roster' ? 0 : 1;
            const rightRoster = right.source === 'roster' ? 0 : 1;
            if (leftRoster !== rightRoster) return leftRoster - rightRoster;
            const leftRank = Number.isFinite(left.searchRank) ? left.searchRank : 999999;
            const rightRank = Number.isFinite(right.searchRank) ? right.searchRank : 999999;
            if (leftRank !== rightRank) return leftRank - rightRank;
            return left.displayName.localeCompare(right.displayName);
          })
          .slice(0, 30);
        setSearchResults(results);
      } catch (err) {
        console.error('[PlayerBrowser search] error:', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, [espnIdOverrides, loadPlayers, teams, positionFilter]);

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
          key={selectedPlayer.id}
          playerId={selectedPlayer.id}
          playerMeta={selectedPlayer}
          teamId={selectedPlayer.teamId}
          teams={teams}
          mode={selectedPlayerMode}
          leagueSeason={leagueSeason}
          onModeChange={onPlayerModeChange}
          onBack={navBack?.onBack ?? onNavigateHome}
          backLabel={navBack?.label}
          onCompare={onComparePlayer}
          onBuildTrade={onBuildTrade}
          tradeDisabled={tradeDisabled}
          tradeDisabledTitle={tradeDisabledTitle}
          onViewSchedule={selectedPlayer.teamId ? () => onViewSchedule?.(selectedPlayer.teamId) : undefined}
          onOpenFantasyTeam={onOpenFantasyTeam}
        />
      );
    }

    const isResolvingPlayer = playerLoading || (!!normalizedSelectedPlayerId && !playerLoadError);

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
          {isResolvingPlayer ? (
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              <LoadingSpinner />
              <span>Loading player details...</span>
            </div>
          ) : (
            playerLoadError || 'Player details are unavailable.'
          )}
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
          onViewSchedule={() => onViewSchedule?.(selectedTeam.id)}
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
    <div className="stats-browser">
      <div className="space-y-3">
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
              placeholder="Search player, team, position, or #number…"
              aria-label="Search NFL players"
              className="w-full pl-9 pr-4 py-2 rounded-lg text-base focus:outline-none"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-separator)',
                color: 'var(--color-label)',
                '--tw-ring-color': 'var(--color-accent)',
              }}
            />
            {searchLoading && (
              <LoadingSpinner className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>

          <p className="mt-2 text-[length:var(--type-label)]" style={{ color: 'var(--color-label-tertiary)' }}>
            Try “Raiders 29” or “29 TE”; terms can be in any order.
          </p>

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
              {searchResults.map((player) => {
                const measurements = formatPlayerMeasurements(player);
                return (
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
                        {player.position}{player.jersey ? ` · #${player.jersey}` : ''}{player.teamName ? ` · ${player.teamName}` : ''}
                      </div>
                      {measurements && (
                        <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                          {measurements}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="player-browser-position-rail" aria-label="Player positions">
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
        <section key={conf.name} className="stats-conference" aria-label={`${conf.name} teams`}>
          {conf.divisions.map((division) => {
            const divTeams = teams.filter((team) => team.division === division);
            return (
              <div key={division} className="stats-division">
                <h3 className="stats-division__label" style={TEAM_LABEL_STYLE}>
                  {division}
                </h3>
                <div className="stats-team-grid">
                  {divTeams.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      darkMode={darkMode}
                      onClick={() => onNavigateTeam?.(team)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
};

const TrophyIcon = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 11c-2.21 0-4-1.79-4-4V2h8v5c0 2.21-1.79 4-4 4zm0 0v2m-2 2h4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M4 2H2a2 2 0 000 4h2M12 2h2a2 2 0 010 4h-2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <line x1="6" y1="15" x2="10" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const TeamCard = ({ team, onClick, darkMode = false }) => {
  const teamKey = String(team.id).toLowerCase();
  const teamTheme = getTeamVisualTheme(team.id, darkMode, TEAM_CARD_THEME_OPTIONS);
  const gradient = teamTheme.gradient ?? 'linear-gradient(135deg, #1F2937 0%, #4B5563 100%)';
  const titleColor = teamTheme.gradientForeground ?? '#FFFFFF';
  const muted = teamTheme.gradientMuted ?? 'rgba(255,255,255,0.72)';
  const city = team.city || String(team.name || '').split(' ').slice(0, -1).join(' ');
  const nickname = team.nickname || String(team.name || '').split(' ').slice(-1)[0] || team.name;

  const isSuperBowl = SEASON_2025_CHAMPIONS.superBowl === teamKey;
  const isConf = !isSuperBowl && Object.values(SEASON_2025_CHAMPIONS.conference).includes(teamKey);
  const isDiv = !isSuperBowl && !isConf && SEASON_2025_CHAMPIONS.division[team.division] === teamKey;
  const goldColor = titleColor === '#FFFFFF' ? '#F5B700' : '#B8860B';
  const silverColor = titleColor === '#FFFFFF' ? 'rgba(255,255,255,0.90)' : 'rgba(12,15,20,0.75)';
  // Honours ride one non-wrapping line, highest first, so a decorated team never
  // stands taller than its division mates. Narrow cards show only the leading
  // honour; the full list stays in title/aria-label.
  const conferenceLabel = `${team.division?.startsWith('AFC') ? 'AFC' : 'NFC'} Champ`;
  const honours = [];
  if (isSuperBowl) honours.push({ label: 'SB LX', color: goldColor, trophy: true });
  if (isSuperBowl || isConf) honours.push({ label: conferenceLabel, color: isSuperBowl ? goldColor : silverColor });
  if (isSuperBowl || isConf || isDiv) honours.push({ label: 'Div Champ', color: muted });
  const honourText = honours.map((item) => item.label).join(' · ');

  return (
    <button
      onClick={onClick}
      className="stats-team-card"
      title={honourText ? `${team.name} — ${honourText}` : team.name}
      aria-label={honourText ? `${team.name} — ${honourText}` : team.name}
    >
      <span className="stats-team-card__wash" style={{ background: gradient }} aria-hidden="true" />
      {teamTheme.gradientOverlay && (
        <span className="stats-team-card__wash" style={{ background: teamTheme.gradientOverlay }} aria-hidden="true" />
      )}
      <span className="stats-team-card__body">
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id.toLowerCase()}.png`}
          alt=""
          className="stats-team-card__logo"
          onError={(e) => { e.target.style.visibility = 'hidden'; }}
        />
        <span className="stats-team-card__identity">
          <span className="stats-team-card__city" style={{ color: muted }}>
            {city}
          </span>
          <span className="stats-team-card__nickname" style={{ color: titleColor }}>
            {nickname}
          </span>
          {honours.length > 0 && (
            <span className="stats-team-card__honours">
              {honours.map((item, index) => (
                <span
                  key={item.label}
                  className={`stats-team-card__honour${index > 0 ? ' stats-team-card__honour--extra' : ''}`}
                  style={{ color: item.color }}
                >
                  {item.trophy && <TrophyIcon size={9} />}
                  {item.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <svg className="stats-team-card__chevron" style={{ color: titleColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </button>
  );
};

const PlayerThumbnail = ({ id, name, size = 'sm' }) => {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  const cls = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return err ? (
    <div className={`${cls} rounded-full flex items-center justify-center shrink-0`} style={{ background: 'var(--color-fill)' }}>
      <span className="text-[length:var(--type-label)] font-bold" style={{ color: 'var(--color-label-tertiary)' }}>{initials}</span>
    </div>
  ) : (
    <img src={headshot(id)} alt="" className={`${cls} rounded-full object-cover shrink-0`} style={{ background: 'var(--color-fill)' }} onError={() => setErr(true)} />
  );
};

export default PlayerBrowser;
