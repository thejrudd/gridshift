import { useState, useEffect } from 'react';
import { fetchPlayerProfile, fetchRoster } from '../utils/playerApi';
import PlayerProfile from './PlayerProfile';
import TeamPage from './TeamPage';
import { getTeamVisualTheme } from '../utils/teamVisualTheme';
import { formatPlayerHeight, formatPlayerWeight } from '../utils/playerMeasurements.js';
import { useSleeperStats } from '../context/SleeperContext';
import Spinner from './ui/Spinner';

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
    injuryStatus: player.injuryStatus || player.injury_status || fallback.injuryStatus || fallback.injury_status || fallback.status || '',
    teamId: player.teamId || fallback.teamId || null,
    height: formatPlayerHeight(player.height) ?? formatPlayerHeight(fallback.height),
    weight: formatPlayerWeight(player.weight) ?? formatPlayerWeight(fallback.weight),
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
  onOpenPlayerBySleeperId,
  onViewSchedule,
  onViewGameStats,
  onPlayerModeChange,
  onComparePlayer,
  onBuildTrade,
  onOpenFantasyTeam,
  tradeDisabled = false,
  tradeDisabledTitle = 'Trade is not available for the connected platform.',
}) => {
  const { loadPlayers } = useSleeperStats();
  const [resolvedPlayer, setResolvedPlayer] = useState(() => (
    selectedPlayerMeta && selectedPlayerId ? buildPlayerMeta(selectedPlayerMeta, { id: selectedPlayerId }) : null
  ));
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerLoadError, setPlayerLoadError] = useState(null);


  const normalizedSelectedTeamId = typeof selectedTeamId === 'string'
    ? selectedTeamId.trim().toUpperCase()
    : null;
  const normalizedSelectedPlayerId = selectedPlayerId != null
    ? String(selectedPlayerId)
    : null;

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
    let cancelInjuryLookup = () => {};
    const initialMeta = selectedPlayerMeta
      ? buildPlayerMeta(selectedPlayerMeta, { id: normalizedSelectedPlayerId })
      : null;

    // Roster/profile payloads can be ESPN-shaped and omit Sleeper's current
    // injury designation. Resolve it independently so the header can enrich
    // either route metadata or the ESPN profile without delaying the profile.
    if (initialMeta && !initialMeta.injuryStatus) {
      let cancelledInjuryLookup = false;
      loadPlayers().then((sleeperPlayers) => {
        if (cancelledInjuryLookup || !sleeperPlayers) return;
        const sleeperEntry = initialMeta.sleeperId
          ? sleeperPlayers[initialMeta.sleeperId]
          : Object.values(sleeperPlayers).find((candidate) => (
            String(candidate?.espn_id ?? candidate?.espnId ?? '') === normalizedSelectedPlayerId
          ));
        const injuryStatus = sleeperEntry?.injury_status ?? sleeperEntry?.injuryStatus ?? '';
        if (!injuryStatus) return;
        setResolvedPlayer((current) => current?.id === normalizedSelectedPlayerId
          ? { ...current, injuryStatus }
          : current);
      }).catch(() => null);
      // The enclosing effect cleanup also cancels the lookup below.
      cancelInjuryLookup = () => { cancelledInjuryLookup = true; };
    }
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
          setResolvedPlayer((current) => buildPlayerMeta(profile, {
            ...(initialMeta ?? { id: normalizedSelectedPlayerId }),
            injuryStatus: current?.injuryStatus || initialMeta?.injuryStatus,
          }));
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

          setResolvedPlayer((current) => buildPlayerMeta(match, {
            ...(initialMeta ?? { id: normalizedSelectedPlayerId }),
            injuryStatus: current?.injuryStatus || initialMeta?.injuryStatus,
          }));
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
        setResolvedPlayer((current) => buildPlayerMeta(initialMeta, {
          ...initialMeta,
          injuryStatus: current?.injuryStatus || initialMeta.injuryStatus,
        }));
        setPlayerLoadError(null);
      } else {
        setResolvedPlayer(null);
        setPlayerLoadError('Player details are unavailable.');
      }
    })();

    return () => {
      cancelled = true;
      if (typeof cancelInjuryLookup === 'function') cancelInjuryLookup();
    };
  }, [loadPlayers, statsView, normalizedSelectedPlayerId, selectedPlayerMeta, teams]);


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
          onViewGameStats={onViewGameStats}
          onOpenPlayerBySleeperId={onOpenPlayerBySleeperId}
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
          onSelectPlayer={onNavigatePlayer}
          onViewSchedule={() => onViewSchedule?.(selectedTeam.id)}
          onViewScheduleGame={(gameId) => onViewSchedule?.(selectedTeam.id, gameId)}
          onViewGameStats={onViewGameStats}
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
      <div className="stats-desk">
        <div className="stats-desk__teams">
          {CONFERENCES.map((conf) => (
            <section key={conf.name} className="stats-conference" aria-labelledby={`stats-conference-${conf.name}`}>
              <h2 id={`stats-conference-${conf.name}`} className="stats-conference__label">{conf.name}</h2>
              <div className="stats-division-grid">
                {conf.divisions.map((division) => (
                  <div key={division} className="stats-division" role="group" aria-label={division}>
                    <h3 className="stats-division__label" aria-hidden="true">
                      {division.split(' ')[1]}
                    </h3>
                    {teams.filter((team) => team.division === division).map((team) => (
                      <TeamCard
                        key={team.id}
                        team={team}
                        darkMode={darkMode}
                        onClick={() => onNavigateTeam?.(team)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <SeasonHonors teams={teams} onNavigateTeam={onNavigateTeam} darkMode={darkMode} />
      </div>
    </div>
  );
};

function teamNameParts(team) {
  const city = team.city || String(team.name || '').split(' ').slice(0, -1).join(' ');
  const nickname = team.nickname || String(team.name || '').split(' ').slice(-1)[0] || team.name;
  return { city, nickname };
}

const TeamLogo = ({ teamId, className }) => (
  <img
    src={`https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`}
    alt=""
    className={className}
    onError={(e) => { e.target.style.visibility = 'hidden'; }}
  />
);

const TeamCard = ({ team, onClick, darkMode = false }) => {
  const teamTheme = getTeamVisualTheme(team.id, darkMode, TEAM_CARD_THEME_OPTIONS);
  const gradient = teamTheme.gradient ?? 'linear-gradient(135deg, #1F2937 0%, #4B5563 100%)';
  const titleColor = teamTheme.gradientForeground ?? '#FFFFFF';
  const muted = teamTheme.gradientMuted ?? 'rgba(255,255,255,0.72)';
  const { city, nickname } = teamNameParts(team);

  return (
    <button type="button" onClick={onClick} className="stats-team-card" aria-label={team.name}>
      <span className="stats-team-card__wash" style={{ background: gradient }} aria-hidden="true" />
      {teamTheme.gradientOverlay && (
        <span className="stats-team-card__wash" style={{ background: teamTheme.gradientOverlay }} aria-hidden="true" />
      )}
      <span className="stats-team-card__body">
        <TeamLogo teamId={team.id} className="stats-team-card__logo" />
        <span className="stats-team-card__identity">
          <span className="stats-team-card__city" style={{ color: muted }}>{city}</span>
          <span className="stats-team-card__nickname" style={{ color: titleColor }}>{nickname}</span>
        </span>
      </span>
    </button>
  );
};

// Season honors live in one rail so no team card repeats them.
const SeasonHonors = ({ teams, onNavigateTeam, darkMode = false }) => {
  const findTeam = (key) => teams.find((team) => team.id.toLowerCase() === key) ?? null;
  const champion = findTeam(SEASON_2025_CHAMPIONS.superBowl);
  const conferenceChampions = Object.entries(SEASON_2025_CHAMPIONS.conference)
    .map(([conference, key]) => ({ tag: conference.toUpperCase(), team: findTeam(key) }))
    .filter((entry) => entry.team);
  const divisionChampions = Object.entries(SEASON_2025_CHAMPIONS.division)
    .map(([division, key]) => ({ tag: division, team: findTeam(key) }))
    .filter((entry) => entry.team);
  if (!champion && !conferenceChampions.length && !divisionChampions.length) return null;

  const championTheme = champion ? getTeamVisualTheme(champion.id, darkMode, TEAM_CARD_THEME_OPTIONS) : null;
  const championName = champion ? teamNameParts(champion) : null;

  const renderRow = ({ tag, team }) => (
    <li key={`${tag}-${team.id}`}>
      <button type="button" className="stats-honors__row" onClick={() => onNavigateTeam?.(team)} aria-label={`${team.name}, ${tag} champion`}>
        <TeamLogo teamId={team.id} className="stats-honors__logo" />
        <span className="stats-honors__name">{teamNameParts(team).nickname}</span>
        <span className="stats-honors__tag">{tag}</span>
      </button>
    </li>
  );

  return (
    <aside className="stats-honors" aria-labelledby="stats-honors-title">
      <div className="stats-honors__heading">
        <span className="stats-honors__eyebrow">2025 season</span>
        <h2 id="stats-honors-title" className="stats-honors__title">Honors</h2>
      </div>
      {champion && (
        <button
          type="button"
          className="stats-honors__champion"
          onClick={() => onNavigateTeam?.(champion)}
          aria-label={`${champion.name}, Super Bowl LX champions`}
        >
          <span className="stats-team-card__wash" style={{ background: championTheme?.gradient ?? undefined }} aria-hidden="true" />
          {championTheme?.gradientOverlay && (
            <span className="stats-team-card__wash" style={{ background: championTheme.gradientOverlay }} aria-hidden="true" />
          )}
          <span className="stats-honors__champion-body" style={{ color: championTheme?.gradientForeground ?? '#FFFFFF' }}>
            <span className="stats-honors__champion-label" style={{ color: championTheme?.gradientMuted ?? undefined }}>
              <TrophyIcon size={12} />
              Super Bowl LX champions
            </span>
            <span className="stats-honors__champion-team">
              <TeamLogo teamId={champion.id} className="stats-honors__champion-logo" />
              <span className="stats-honors__champion-name">
                <span style={{ color: championTheme?.gradientMuted ?? undefined }}>{championName.city}</span>
                <strong>{championName.nickname}</strong>
              </span>
            </span>
          </span>
        </button>
      )}
      <div className="stats-honors__groups">
        {conferenceChampions.length > 0 && (
          <div className="stats-honors__group">
            <h3 className="stats-honors__group-label">Conference champions</h3>
            <ul className="stats-honors__list">{conferenceChampions.map(renderRow)}</ul>
          </div>
        )}
        {divisionChampions.length > 0 && (
          <div className="stats-honors__group">
            <h3 className="stats-honors__group-label">Division champions</h3>
            <ul className="stats-honors__list">{divisionChampions.map(renderRow)}</ul>
          </div>
        )}
      </div>
    </aside>
  );
};

const TrophyIcon = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 11c-2.21 0-4-1.79-4-4V2h8v5c0 2.21-1.79 4-4 4zm0 0v2m-2 2h4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M4 2H2a2 2 0 000 4h2M12 2h2a2 2 0 010 4h-2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <line x1="6" y1="15" x2="10" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default PlayerBrowser;
