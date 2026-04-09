import { useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';

export default function CompanionConnect() {
  const {
    connect, selectLeague, disconnect,
    sleeperUser, leagues,
    season, changeSeason, availableSeasons,
    connectLoading, connectError, setConnectError,
    isConnected, hasLeague,
  } = useSleeper();

  const [username, setUsername] = useState('');

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      await connect(username);
    } catch { /* error shown via connectError */ }
  };

  const handleSelectLeague = async (leagueId) => {
    try {
      await selectLeague(leagueId);
    } catch { /* error shown via connectError */ }
  };

  // ── Step 1: not connected yet ─────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--color-fill)' }}
        >
          <SleeperIcon />
        </div>

        <h2
          className="font-display font-bold mb-1"
          style={{ fontSize: '20px', letterSpacing: '0.06em', color: 'var(--color-label)' }}
        >
          CONNECT SLEEPER
        </h2>
        <p className="text-sm mb-6 text-center max-w-xs" style={{ color: 'var(--color-label-secondary)' }}>
          Enter your Sleeper username to find the league years and leagues available on your account.
        </p>

        <form onSubmit={handleConnect} className="w-full max-w-sm flex flex-col gap-3">
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setConnectError(null); }}
            placeholder="Sleeper username"
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

          {connectError && (
            <p className="text-xs text-center" style={{ color: 'var(--color-accent-red)' }}>
              {connectError}
            </p>
          )}

          <button
            type="submit"
            disabled={connectLoading || !username.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity active:opacity-70 disabled:opacity-40"
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {connectLoading ? 'Looking Up Leagues…' : 'Find My Leagues'}
          </button>
        </form>
      </div>
    );
  }

  // ── Step 2: connected, pick a season and league ──────────────────────────
  if (!hasLeague) {
    return (
      <div className="flex flex-col py-8 px-4 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img
            src={sleeperUser.avatar
              ? `https://sleepercdn.com/avatars/thumbs/${sleeperUser.avatar}`
              : 'https://sleepercdn.com/images/v2/icons/player_default.webp'}
            alt={sleeperUser.display_name}
            className="w-10 h-10 rounded-full"
            onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
          />
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--color-label)' }}>
              {sleeperUser.display_name || sleeperUser.username}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
              @{sleeperUser.username}
            </div>
          </div>
          <button
            onClick={disconnect}
            className="ml-auto text-xs font-medium px-2.5 py-1 rounded-lg"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
          >
            Disconnect
          </button>
        </div>

        {availableSeasons.length > 0 ? (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Season
                </div>
                <p className="text-xs max-w-xs" style={{ color: 'var(--color-label-secondary)' }}>
                  Choose from the Sleeper league years available for this account.
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
                No leagues found for {season} on this account.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {leagues.map((leagueOption) => (
                  <button
                    key={leagueOption.league_id}
                    onClick={() => handleSelectLeague(leagueOption.league_id)}
                    disabled={connectLoading}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-opacity active:opacity-60 disabled:opacity-40"
                    style={{ background: 'var(--color-fill-secondary)' }}
                  >
                    {leagueOption.avatar ? (
                      <img
                        src={`https://sleepercdn.com/avatars/thumbs/${leagueOption.avatar}`}
                        alt={leagueOption.name}
                        className="w-9 h-9 rounded-lg shrink-0"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
                        style={{ background: 'var(--color-fill)' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-tertiary)' }}>
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
                        {leagueOption.name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                        {leagueOption.total_rosters} teams · {leagueOption.settings?.type === 2 ? 'Dynasty' : leagueOption.settings?.type === 1 ? 'Keeper' : 'Redraft'}
                        {leagueOption.scoring_settings?.rec === 1 ? ' · PPR' : leagueOption.scoring_settings?.rec === 0.5 ? ' · Half PPR' : ' · Standard'}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', shrink: 0 }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl px-4 py-5" style={{ background: 'var(--color-fill-secondary)' }}>
            <h3 className="font-display font-bold mb-2" style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-label-tertiary)' }}>
              NO LEAGUES FOUND
            </h3>
            <p className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
              This Sleeper account does not currently return any NFL leagues from the API for the supported league years.
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function SleeperIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-signature)' }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="10" r="1.2" fill="currentColor"/>
      <circle cx="15" cy="10" r="1.2" fill="currentColor"/>
    </svg>
  );
}
