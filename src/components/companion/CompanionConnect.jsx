import { useState } from 'react';
import { useFantasy } from '../../context/SleeperContext';

const ESPN_FANTASY_HOME_URL = 'https://www.espn.com/fantasy/football/';
const ESPN_PRIVATE_LEAGUE_EXTENSION_URL = 'https://chromewebstore.google.com/detail/espn-private-league-setup/bjmalaafoepfooflcnhjejnopgefjgia?hl=en';

function parseEspnLeagueInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return { url: null, leagueId: raw, teamId: null, seasonId: null };
  }
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'espn.com' && !hostname.endsWith('.espn.com')) return null;
    const leagueId = url.searchParams.get('leagueId');
    const teamId = url.searchParams.get('teamId');
    const seasonId = url.searchParams.get('seasonId');
    return { url: url.toString(), leagueId, teamId, seasonId };
  } catch {
    return null;
  }
}

export default function CompanionConnect({ forceLeaguePicker = false, onLeagueSelected = null }) {
  const {
    platform,
    connect,
    connectEspn,
    selectLeague,
    loadEspnLeagueSelection,
    disconnect,
    sleeperUser,
    leagues,
    season,
    changeSeason,
    availableSeasons,
    connectLoading,
    connectError,
    setConnectError,
    isConnected,
    hasLeague,
  } = useFantasy();

  const [selectedPlatform, setSelectedPlatform] = useState(platform === 'espn' ? 'espn' : 'sleeper');
  const [username, setUsername] = useState('');
  const [swid, setSwid] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [espnSeason, setEspnSeason] = useState(String(season));
  const [manualLeagueId, setManualLeagueId] = useState('');
  const [espnTeamId, setEspnTeamId] = useState('');
  const [espnLeagueUrl, setEspnLeagueUrl] = useState('');
  const [espnImportLoading, setEspnImportLoading] = useState(false);
  const [showEspnManual, setShowEspnManual] = useState(false);

  const parsedEspnInput = parseEspnLeagueInput(espnLeagueUrl);
  const activeEspnLeagueId = parsedEspnInput?.leagueId ?? manualLeagueId.trim();
  const activeEspnTeamId = parsedEspnInput?.teamId ?? espnTeamId.trim();
  const activeEspnSeason = parsedEspnInput?.seasonId ?? espnSeason;

  const handleConnectSleeper = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      await connect(username);
    } catch { /* error shown via connectError */ }
  };

  const handleConnectEspn = async (e) => {
    e.preventDefault();
    if (!swid.trim() || !espnS2.trim()) return;
    try {
      const leagueId = activeEspnLeagueId || null;
      const teamId = activeEspnTeamId || null;
      await connectEspn({ swid, espnS2, season: activeEspnSeason, leagueId, teamId });
      if (leagueId) onLeagueSelected?.();
    } catch { /* error shown via connectError */ }
  };

  const handleImportEspnLeague = async (e) => {
    e.preventDefault();
    if (!activeEspnLeagueId) {
      setConnectError('Paste an ESPN team link, league link, or league ID first.');
      return;
    }
    setEspnImportLoading(true);
    setConnectError(null);
    try {
      await loadEspnLeagueSelection(activeEspnLeagueId, activeEspnSeason, activeEspnTeamId || null);
      onLeagueSelected?.();
    } catch (err) {
      setShowEspnManual(true);
      setConnectError(err.message ?? 'ESPN could not import that league. Add secure ESPN session values below for private leagues.');
    } finally {
      setEspnImportLoading(false);
    }
  };

  const handleManualEspnLeague = async (e) => {
    e.preventDefault();
    if (!manualLeagueId.trim()) return;
    try {
      await loadEspnLeagueSelection(manualLeagueId.trim(), espnSeason);
      onLeagueSelected?.();
    } catch (err) {
      setConnectError(err.message ?? 'Failed to open ESPN league.');
    }
  };

  const handleSelectLeague = async (leagueId) => {
    try {
      await selectLeague(leagueId);
      onLeagueSelected?.();
    } catch { /* error shown via connectError */ }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--color-fill)' }}
        >
          {selectedPlatform === 'espn' ? <EspnIcon /> : <SleeperIcon />}
        </div>

        <div
          className="inline-flex p-1 rounded-xl mb-5"
          style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-separator)' }}
        >
          {[
            ['sleeper', 'Sleeper'],
            ['espn', 'ESPN'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSelectedPlatform(value);
                setConnectError(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: selectedPlatform === value ? 'var(--color-bg)' : 'transparent',
                color: selectedPlatform === value ? 'var(--color-label)' : 'var(--color-label-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <h2
          className="font-display font-bold mb-1"
          style={{ fontSize: '20px', letterSpacing: '0.06em', color: 'var(--color-label)' }}
        >
          CONNECT {selectedPlatform === 'espn' ? 'ESPN' : 'SLEEPER'}
        </h2>

        {selectedPlatform === 'sleeper' ? (
          <>
            <p className="text-sm mb-6 text-center max-w-xs" style={{ color: 'var(--color-label-secondary)' }}>
              Enter your Sleeper username to find the league years and leagues available on your account.
            </p>
            <form onSubmit={handleConnectSleeper} className="w-full max-w-sm flex flex-col gap-3">
              <ConnectInput
                value={username}
                onChange={(value) => {
                  setUsername(value);
                  setConnectError(null);
                }}
                placeholder="Sleeper username"
              />
              <ConnectError error={connectError} />
              <ConnectButton disabled={connectLoading || !username.trim()}>
                {connectLoading ? 'Looking Up Leagues...' : 'Find My Leagues'}
              </ConnectButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm mb-6 text-center max-w-sm" style={{ color: 'var(--color-label-secondary)' }}>
              Paste an ESPN team or league link. Public leagues import directly; private leagues can use secure session import.
            </p>

            <div className="w-full max-w-sm flex flex-col gap-3">
              <form onSubmit={handleImportEspnLeague} className="flex flex-col gap-3">
                <ConnectInput
                  value={espnLeagueUrl}
                  onChange={(value) => {
                    setEspnLeagueUrl(value);
                    const parsed = parseEspnLeagueInput(value);
                    setEspnSeason(parsed?.seasonId ?? String(season));
                    setManualLeagueId(parsed?.leagueId ?? '');
                    setEspnTeamId(parsed?.teamId ?? '');
                    setConnectError(null);
                  }}
                  placeholder="ESPN team URL or league ID"
                />
                {activeEspnTeamId && (
                  <div className="text-xs px-1" style={{ color: 'var(--color-label-tertiary)' }}>
                    Team ID from ESPN link: {activeEspnTeamId}
                  </div>
                )}
                <ConnectButton disabled={espnImportLoading || connectLoading || !activeEspnLeagueId}>
                  {espnImportLoading || connectLoading ? 'Importing ESPN...' : 'Import ESPN League'}
                </ConnectButton>
              </form>

              <div className="flex items-center justify-center gap-2">
                <a
                  href={ESPN_FANTASY_HOME_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold self-center px-3 py-1 rounded-lg transition-opacity active:opacity-70"
                  style={{ color: 'var(--color-label-tertiary)' }}
                >
                  Find my ESPN league link
                </a>
              </div>

              {!showEspnManual && (
                <button
                  type="button"
                  onClick={() => setShowEspnManual(true)}
                  className="text-xs font-semibold self-center px-3 py-2 rounded-lg transition-opacity active:opacity-70"
                  style={{ color: 'var(--color-label-tertiary)' }}
                >
                  Use secure manual import
                </button>
              )}

              {showEspnManual && (
                <form onSubmit={handleConnectEspn} className="flex flex-col gap-3">
                  <div
                    className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                    style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
                  >
                    <div className="font-semibold mb-1" style={{ color: 'var(--color-label)' }}>
                      Private league setup
                    </div>
                    <p className="mb-3">
                      On desktop Chrome, use the ESPN Private League Setup extension to copy SWID and espn_s2, then paste them here. Mobile private-league setup is not available yet.
                    </p>
                    <a
                      href={ESPN_PRIVATE_LEAGUE_EXTENSION_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex font-semibold rounded-lg transition-opacity active:opacity-70"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      Open Chrome extension
                    </a>
                    <p className="mt-3">
                      GridShift encrypts these values into an HttpOnly browser cookie and never writes them to localStorage.
                    </p>
                  </div>
                  <ConnectInput
                    value={swid}
                    onChange={(value) => {
                      setSwid(value);
                      setConnectError(null);
                    }}
                    placeholder="SWID"
                  />
                  <ConnectInput
                    value={espnS2}
                    onChange={(value) => {
                      setEspnS2(value);
                      setConnectError(null);
                    }}
                    placeholder="espn_s2"
                  />
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                    <ConnectInput
                      value={espnSeason}
                      onChange={(value) => {
                        setEspnSeason(value.replace(/\D/g, '').slice(0, 4));
                        setConnectError(null);
                      }}
                      placeholder="Season"
                      inputMode="numeric"
                    />
                    <ConnectInput
                      value={manualLeagueId}
                      onChange={(value) => {
                        setManualLeagueId(value.replace(/[^\d]/g, ''));
                        setConnectError(null);
                      }}
                      placeholder="League ID optional"
                      inputMode="numeric"
                    />
                  </div>
                  {espnTeamId && (
                    <div className="text-xs px-1" style={{ color: 'var(--color-label-tertiary)' }}>
                      Team ID from ESPN link: {espnTeamId}
                    </div>
                  )}
                  <ConnectError error={connectError} />
                  <ConnectButton disabled={connectLoading || !swid.trim() || !espnS2.trim()}>
                    {connectLoading ? 'Connecting ESPN...' : 'Connect ESPN'}
                  </ConnectButton>
                </form>
              )}

              {!showEspnManual && <ConnectError error={connectError} />}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!hasLeague || forceLeaguePicker) {
    if (platform === 'espn') {
      return (
        <div className="flex flex-col py-8 px-4 max-w-lg mx-auto">
          <ConnectedHeader
            platform="espn"
            user={sleeperUser}
            onDisconnect={disconnect}
          />

          <form onSubmit={handleManualEspnLeague} className="flex flex-col gap-3 mb-6">
            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
              <ConnectInput
                value={espnSeason}
                onChange={(value) => {
                  setEspnSeason(value.replace(/\D/g, '').slice(0, 4));
                  setConnectError(null);
                }}
                placeholder="Season"
                inputMode="numeric"
              />
              <ConnectInput
                value={manualLeagueId}
                onChange={(value) => {
                  setManualLeagueId(value.replace(/[^\d]/g, ''));
                  setConnectError(null);
                }}
                placeholder="ESPN league ID"
                inputMode="numeric"
              />
            </div>
            <ConnectError error={connectError} />
            <ConnectButton disabled={connectLoading || !manualLeagueId.trim()}>
              {connectLoading ? 'Opening League...' : 'Open ESPN League'}
            </ConnectButton>
          </form>

          <LeagueList
            platform="espn"
            leagues={leagues}
            season={season}
            availableSeasons={availableSeasons}
            changeSeason={changeSeason}
            connectLoading={connectLoading}
            onSelectLeague={handleSelectLeague}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col py-8 px-4 max-w-lg mx-auto">
        <ConnectedHeader
          platform="sleeper"
          user={sleeperUser}
          onDisconnect={disconnect}
        />

        <LeagueList
          platform="sleeper"
          leagues={leagues}
          season={season}
          availableSeasons={availableSeasons}
          changeSeason={changeSeason}
          connectLoading={connectLoading}
          connectError={connectError}
          onSelectLeague={handleSelectLeague}
        />
      </div>
    );
  }

  return null;
}

function ConnectInput({ value, onChange, placeholder, inputMode = undefined }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className="w-full px-4 py-3 rounded-xl font-medium focus:outline-none"
      style={{
        fontSize: '16px',
        background: 'var(--color-fill-secondary)',
        color: 'var(--color-label)',
      }}
    />
  );
}

function ConnectError({ error }) {
  if (!error) return null;
  return (
    <p className="text-xs text-center" style={{ color: 'var(--color-accent-red)' }}>
      {error}
    </p>
  );
}

function ConnectButton({ disabled, children }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity active:opacity-70 disabled:opacity-40"
      style={{
        background: 'var(--color-accent)',
        color: '#fff',
      }}
    >
      {children}
    </button>
  );
}

function ConnectedHeader({ platform, user, onDisconnect }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {platform === 'sleeper' ? (
        <img
          src={user?.avatar
            ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}`
            : 'https://sleepercdn.com/images/v2/icons/player_default.webp'}
          alt={user?.display_name ?? 'Sleeper user'}
          className="w-10 h-10 rounded-full"
          onError={(e) => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
        />
      ) : (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-fill)' }}
        >
          <EspnIcon size={22} />
        </div>
      )}
      <div>
        <div className="font-semibold text-sm" style={{ color: 'var(--color-label)' }}>
          {platform === 'espn' ? 'ESPN Fantasy' : (user?.display_name || user?.username)}
        </div>
        <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
          {platform === 'espn' ? 'League connected' : `@${user?.username}`}
        </div>
      </div>
      <button
        onClick={onDisconnect}
        className="ml-auto text-xs font-medium px-2.5 py-1 rounded-lg"
        style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
      >
        Disconnect
      </button>
    </div>
  );
}

function LeagueList({
  platform,
  leagues,
  season,
  availableSeasons,
  changeSeason,
  connectLoading,
  connectError,
  onSelectLeague,
}) {
  if (availableSeasons.length === 0) {
    return (
      <div className="rounded-2xl px-4 py-5" style={{ background: 'var(--color-fill-secondary)' }}>
        <h3 className="font-display font-bold mb-2" style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-label-tertiary)' }}>
          NO LEAGUES FOUND
        </h3>
        <p className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          {platform === 'espn'
            ? 'ESPN discovery did not return leagues for this account. Enter the league ID manually.'
            : 'This Sleeper account does not currently return any NFL leagues from the API for the supported league years.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-start gap-3 mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
            Season
          </div>
          <p className="text-xs max-w-xs" style={{ color: 'var(--color-label-secondary)' }}>
            Choose from the league years available for this account.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto justify-end">
          {availableSeasons.map((seasonOption) => (
            <button
              key={seasonOption}
              type="button"
              onClick={() => changeSeason(seasonOption)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: season === seasonOption ? 'var(--color-signature)' : 'var(--color-fill)',
                color: season === seasonOption ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
              }}
            >
              {seasonOption}
            </button>
          ))}
        </div>
      </div>

      <h3
        className="font-display font-bold mb-3"
        style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-label-tertiary)' }}
      >
        SELECT A LEAGUE
      </h3>

      {connectError && (
        <p className="text-xs mb-3" style={{ color: 'var(--color-accent-red)' }}>{connectError}</p>
      )}

      {leagues.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          {platform === 'espn'
            ? `No ESPN leagues discovered for ${season}. Use the manual league ID field above.`
            : `No leagues found for ${season} on this account.`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {leagues.map((leagueOption) => (
            <button
              key={leagueOption.league_id}
              onClick={() => onSelectLeague(leagueOption.league_id)}
              disabled={connectLoading}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-opacity active:opacity-60 disabled:opacity-40"
              style={{ background: 'var(--color-fill-secondary)' }}
            >
              <LeagueAvatar league={leagueOption} platform={platform} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
                  {leagueOption.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                  {platform === 'espn'
                    ? `${leagueOption.season ?? season} ESPN`
                    : `${leagueOption.total_rosters} teams · ${leagueOption.settings?.type === 2 ? 'Dynasty' : leagueOption.settings?.type === 1 ? 'Keeper' : 'Redraft'}${leagueOption.scoring_settings?.rec === 1 ? ' · PPR' : leagueOption.scoring_settings?.rec === 0.5 ? ' · Half PPR' : ' · Standard'}`}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', shrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function LeagueAvatar({ league, platform }) {
  if (platform === 'sleeper' && league.avatar) {
    return (
      <img
        src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
        alt={league.name}
        className="w-9 h-9 rounded-lg shrink-0"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
      style={{ background: 'var(--color-fill)' }}
    >
      {platform === 'espn' ? (
        <EspnIcon size={18} />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)' }}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )}
    </div>
  );
}

function SleeperIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-signature)' }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" />
      <circle cx="15" cy="10" r="1.2" fill="currentColor" />
    </svg>
  );
}

function EspnIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-accent-red)' }}>
      <path d="M4 7h11.5c2.5 0 4.5 2 4.5 4.5S18 16 15.5 16H4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 11.5h10.5c.6 0 1 .4 1 1s-.4 1-1 1H4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 19h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
