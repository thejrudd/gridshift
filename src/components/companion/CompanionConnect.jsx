import { useId, useState } from 'react';
import { useFantasy } from '../../context/SleeperContext';
import { copyText } from '../../utils/pageShare.js';
import { CompanionSegmentedControl } from './CompanionSelectorControls.jsx';

function getInitials(value, fallback = 'L') {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || fallback;
}

function SleeperAccountAvatar({ user }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarHash = String(user?.avatar ?? '').trim();
  const label = user?.display_name || user?.username || 'Sleeper account';

  return (
    <span className="companion-league-switcher__account-avatar" aria-hidden="true">
      {avatarHash && !imageFailed ? (
        <img
          src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="companion-league-switcher__account-avatar-fallback">{getInitials(label, 'S')}</span>
      )}
    </span>
  );
}

export default function CompanionConnect({ forceLeaguePicker = false, onLeagueSelected = null }) {
  const {
    connect,
    selectLeague,
    disconnect,
    sleeperUser,
    leagues,
    selectedLeagueId,
    season,
    changeSeason,
    availableSeasons,
    connectLoading,
    seasonSwitching,
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
      <div className={`companion-league-switcher${forceLeaguePicker ? ' is-modal' : ''}`}>
        <div className="companion-league-switcher__account">
          <SleeperAccountAvatar user={sleeperUser} />
          <div className="companion-league-switcher__account-copy">
            <span>Sleeper account</span>
            <strong>{sleeperUser?.display_name || sleeperUser?.username}</strong>
            <small>@{sleeperUser?.username}</small>
          </div>
          <button type="button" onClick={disconnect} className="companion-league-switcher__disconnect">Disconnect</button>
        </div>
        <LeagueList
          leagues={leagues}
          selectedLeagueId={selectedLeagueId}
          season={season}
          availableSeasons={availableSeasons}
          changeSeason={changeSeason}
          connectLoading={connectLoading}
          seasonSwitching={seasonSwitching}
          connectError={connectError}
          onSelectLeague={handleSelectLeague}
        />
      </div>
    );
  }

  return null;
}

function LeagueAvatar({ league }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarHash = String(league?.avatar ?? '').trim();
  const initials = getInitials(league?.name, 'L');

  return (
    <span className="companion-league-switch-row__avatar" aria-hidden="true">
      {avatarHash && !imageFailed ? (
        <img
          src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="companion-league-switch-row__avatar-fallback">{initials}</span>
      )}
    </span>
  );
}

function LeagueList({ leagues, selectedLeagueId, season, availableSeasons, changeSeason, connectLoading, seasonSwitching, connectError, onSelectLeague }) {
  const headingIdBase = useId();
  const [copyFeedback, setCopyFeedback] = useState(null);
  const leagueYearHeadingId = `${headingIdBase}-year`;
  const leagueChoiceHeadingId = `${headingIdBase}-league`;

  const handleCopyLeagueId = async (leagueId) => {
    if (!leagueId) return;
    try {
      await copyText(leagueId);
      setCopyFeedback({ leagueId, status: 'copied' });
      window.setTimeout(() => {
        setCopyFeedback((current) => current?.leagueId === leagueId ? null : current);
      }, 1600);
    } catch {
      setCopyFeedback({ leagueId, status: 'failed' });
    }
  };

  if (availableSeasons.length === 0) return <p className="companion-league-switcher__empty">This Sleeper account does not currently return any NFL leagues for the supported league years.</p>;

  const seasonOptions = availableSeasons.map((option) => ({
    value: String(option),
    label: String(option),
    disabled: connectLoading && String(option) !== String(season),
  }));

  return <div className="companion-league-switcher__choices">
    <section className="companion-league-switcher__stage" aria-labelledby={leagueYearHeadingId}>
      <div className="companion-league-switcher__stage-header">
        <span className="companion-league-switcher__step" aria-hidden="true">1</span>
        <div>
          <h3 id={leagueYearHeadingId}>League year</h3>
          <p>Choose the season you want to view.</p>
        </div>
      </div>
      <CompanionSegmentedControl
        value={String(season)}
        options={seasonOptions}
        onChange={changeSeason}
        ariaLabel="League year"
        columns={seasonOptions.length}
        className="companion-league-switcher__season-control"
      />
      <div className="companion-league-switcher__loading" aria-live="polite">
        {seasonSwitching ? `Loading ${seasonSwitching} leagues...` : ''}
      </div>
    </section>

    <section className="companion-league-switcher__stage" aria-labelledby={leagueChoiceHeadingId}>
      <div className="companion-league-switcher__stage-header">
        <span className="companion-league-switcher__step" aria-hidden="true">2</span>
        <div>
          <h3 id={leagueChoiceHeadingId}>Choose a league</h3>
          <p>{leagues.length} {leagues.length === 1 ? 'league' : 'leagues'} available for {season}.</p>
        </div>
      </div>
      <ConnectError error={connectError} />
      <div className="companion-league-switcher__league-list">{leagues.map((league) => {
      const leagueId = String(league?.league_id ?? '').trim();
      const isCurrentLeague = leagueId && leagueId === String(selectedLeagueId ?? '').trim();
      const teamCount = Number(league?.total_rosters);
      const leagueType = league.settings?.type === 2 ? 'Dynasty' : league.settings?.type === 1 ? 'Keeper' : 'Redraft';
      const leagueMeta = [Number.isFinite(teamCount) && teamCount > 0 ? `${teamCount} teams` : null, leagueType].filter(Boolean).join(' · ');
      const feedback = copyFeedback?.leagueId === leagueId ? copyFeedback.status : null;
      const copyLabel = feedback === 'copied' ? 'Copied' : feedback === 'failed' ? 'Copy failed' : 'Copy ID';

      return (
        <div key={league.league_id} className={`companion-league-switch-row${isCurrentLeague ? ' is-current' : ''}`} data-current={isCurrentLeague ? 'true' : 'false'}>
          <button
            type="button"
            onClick={() => onSelectLeague(league.league_id)}
            disabled={connectLoading}
            className="companion-league-switch-row__select"
            aria-label={`${isCurrentLeague ? 'Currently viewing' : 'View'} ${league.name}`}
          >
            <LeagueAvatar league={league} />
            <div className="companion-league-switch-row__identity">
              <div className="companion-league-switch-row__name-line">
                <strong>{league.name}</strong>
                {isCurrentLeague && <span className="companion-league-switch-row__current">Viewing</span>}
              </div>
              <div className="companion-league-switch-row__meta">{leagueMeta}</div>
              <div className="companion-league-switch-row__id">
                <span className="companion-league-switch-row__id-label">League ID</span>
                <code className="companion-league-switch-row__id-value">{leagueId || 'Unavailable'}</code>
              </div>
            </div>
            <span aria-hidden="true" className="companion-league-switch-row__chevron">›</span>
          </button>
          <button
            type="button"
            onClick={() => handleCopyLeagueId(leagueId)}
            disabled={connectLoading || !leagueId}
            className={`companion-league-switch-row__copy${feedback ? ` is-${feedback}` : ''}`}
            aria-label={`${feedback === 'copied' ? 'Copied' : 'Copy'} league ID${leagueId ? ` ${leagueId}` : ''}`}
          >
            <span aria-live="polite">{copyLabel}</span>
          </button>
        </div>
      );
    })}</div>
    </section>
  </div>;
}

function ConnectError({ error }) { return error ? <p className="text-center text-xs" style={{ color: 'var(--color-accent-red)' }}>{error}</p> : null; }

function SleeperIcon() { return <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--color-fill)' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-signature)' }} aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.5" /><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="9" cy="10" r="1.2" fill="currentColor" /><circle cx="15" cy="10" r="1.2" fill="currentColor" /></svg></div>; }
