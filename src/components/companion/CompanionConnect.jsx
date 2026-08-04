import { useState } from 'react';
import { useFantasy } from '../../context/SleeperContext';

export default function CompanionConnect({ forceLeaguePicker = false, onLeagueSelected = null }) {
  const {
    connect,
    selectLeague,
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
  const [username, setUsername] = useState('');

  const handleConnect = async (event) => {
    event.preventDefault();
    if (!username.trim()) return;
    try {
      await connect(username);
    } catch { /* surfaced through connectError */ }
  };

  const handleSelectLeague = async (leagueId) => {
    try {
      await selectLeague(leagueId);
      onLeagueSelected?.();
    } catch { /* surfaced through connectError */ }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16">
        <SleeperIcon />
        <h2 className="mt-5 font-display font-bold" style={{ fontSize: '20px', letterSpacing: '0.06em', color: 'var(--color-label)' }}>CONNECT SLEEPER</h2>
        <p className="mb-6 mt-1 max-w-xs text-center text-sm" style={{ color: 'var(--color-label-secondary)' }}>Enter your Sleeper username to find the league years and leagues available on your account.</p>
        <form onSubmit={handleConnect} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="text"
            value={username}
            onChange={(event) => { setUsername(event.target.value); setConnectError(null); }}
            placeholder="Sleeper username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl px-4 py-3 font-medium focus:outline-none"
            style={{ fontSize: '16px', background: 'var(--color-fill-secondary)', color: 'var(--color-label)' }}
          />
          <ConnectError error={connectError} />
          <button type="submit" disabled={connectLoading || !username.trim()} className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity active:opacity-70 disabled:opacity-40" style={{ background: 'var(--color-accent)', color: '#fff' }}>
            {connectLoading ? 'Looking Up Leagues...' : 'Find My Leagues'}
          </button>
        </form>
      </div>
    );
  }

  if (!hasLeague || forceLeaguePicker) {
    return (
      <div className="mx-auto flex max-w-lg flex-col px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <img
            src={sleeperUser?.avatar ? `https://sleepercdn.com/avatars/thumbs/${sleeperUser.avatar}` : 'https://sleepercdn.com/images/v2/icons/player_default.webp'}
            alt={sleeperUser?.display_name ?? 'Sleeper user'}
            className="h-10 w-10 rounded-full"
          />
          <div><div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{sleeperUser?.display_name || sleeperUser?.username}</div><div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>@{sleeperUser?.username}</div></div>
          <button type="button" onClick={disconnect} className="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}>Disconnect</button>
        </div>
        <LeagueList leagues={leagues} season={season} availableSeasons={availableSeasons} changeSeason={changeSeason} connectLoading={connectLoading} connectError={connectError} onSelectLeague={handleSelectLeague} />
      </div>
    );
  }

  return null;
}

function LeagueList({ leagues, season, availableSeasons, changeSeason, connectLoading, connectError, onSelectLeague }) {
  if (availableSeasons.length === 0) return <p className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>This Sleeper account does not currently return any NFL leagues for the supported league years.</p>;
  return <>
    <div className="mb-4 flex items-start gap-3"><div><div className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Season</div><p className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>Choose from the league years available for this account.</p></div><div className="ml-auto flex flex-wrap justify-end gap-1.5">{availableSeasons.map((option) => <button key={option} type="button" onClick={() => changeSeason(option)} className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: season === option ? 'var(--color-signature)' : 'var(--color-fill)', color: season === option ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)' }}>{option}</button>)}</div></div>
    <h3 className="mb-3 font-display font-bold" style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-label-tertiary)' }}>SELECT A LEAGUE</h3>
    <ConnectError error={connectError} />
    <div className="mt-3 flex flex-col gap-2">{leagues.map((league) => <button key={league.league_id} type="button" onClick={() => onSelectLeague(league.league_id)} disabled={connectLoading} className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-opacity active:opacity-60 disabled:opacity-40" style={{ background: 'var(--color-fill-secondary)' }}><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{league.name}</div><div className="mt-0.5 text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{league.total_rosters} teams · {league.settings?.type === 2 ? 'Dynasty' : league.settings?.type === 1 ? 'Keeper' : 'Redraft'}</div></div><span aria-hidden="true" style={{ color: 'var(--color-label-quaternary)' }}>›</span></button>)}</div>
  </>;
}

function ConnectError({ error }) { return error ? <p className="text-center text-xs" style={{ color: 'var(--color-accent-red)' }}>{error}</p> : null; }

function SleeperIcon() { return <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--color-fill)' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-signature)' }} aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.5" /><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="9" cy="10" r="1.2" fill="currentColor" /><circle cx="15" cy="10" r="1.2" fill="currentColor" /></svg></div>; }
