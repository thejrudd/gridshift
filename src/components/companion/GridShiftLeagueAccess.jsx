import { useCallback, useEffect, useId, useState } from 'react';
import { useLeagueSource } from '../../context/LeagueSourceContext.js';
import {
  getGridShiftSession,
  listGridShiftInvites,
  listGridShiftLeagues,
  requestGridShiftSignInLink,
  signOutGridShift,
} from '../../api/gridshiftPlatformApi.js';
import { mapGridShiftLeagueSummary } from '../../utils/gridshiftLeagueAdapter.js';

// GridShift-league entry point inside the connect flow and league switcher.
// Renders nothing unless the platform is configured. Leagues are listed only
// for a signed-in account that belongs to a league or holds an invite (the
// platform's Client access rule).

function getInitials(value) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'G';
}

export default function GridShiftLeagueAccess({ className = '', onLeagueSelected = null }) {
  const { platformConfigured } = useLeagueSource();
  if (!platformConfigured) return null;
  return <GridShiftLeagueAccessPanel className={className} onLeagueSelected={onLeagueSelected} />;
}

function GridShiftLeagueAccessPanel({ className, onLeagueSelected }) {
  const headingId = useId();
  const { gridshiftLeague, selectGridShiftLeague } = useLeagueSource();
  const [state, setState] = useState({ status: 'checking', email: '', leagues: [], inviteCount: 0, error: '' });
  const [emailInput, setEmailInput] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const session = await getGridShiftSession();
        if (cancelled) return;
        if (!session) {
          setState({ status: 'signed-out', email: '', leagues: [], inviteCount: 0, error: '' });
          return;
        }
        const [leagues, invites] = await Promise.all([listGridShiftLeagues(), listGridShiftInvites()]);
        if (cancelled) return;
        setState({
          status: 'signed-in',
          email: session.user.email ?? '',
          leagues: leagues.map(mapGridShiftLeagueSummary).filter(Boolean),
          inviteCount: invites.length,
          error: '',
        });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', email: '', leagues: [], inviteCount: 0, error: error?.message ?? 'GridShift leagues are unavailable right now.' });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  const handleSignIn = async (event) => {
    event.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    setBusy(true);
    try {
      const callbackURL = `${window.location.origin}${window.location.pathname}`;
      await requestGridShiftSignInLink(email, callbackURL);
      setLinkSent(true);
      setState((current) => ({ ...current, error: '' }));
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message ?? 'The sign-in link could not be sent.' }));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutGridShift();
    } catch {
      // The session may already be gone; reload shows the real state.
    } finally {
      setBusy(false);
      setLinkSent(false);
      reload();
    }
  };

  const handleSelect = (league) => {
    selectGridShiftLeague(league);
    onLeagueSelected?.();
  };

  const hasAccess = state.leagues.length > 0 || state.inviteCount > 0;

  return (
    <section className={`gridshift-league-access ${className}`.trim()} aria-labelledby={headingId} data-testid="gridshift-league-access">
      <div className="gridshift-league-access__header">
        <h3 id={headingId}>GridShift leagues</h3>
        {state.status === 'signed-in' && (
          <button type="button" onClick={handleSignOut} disabled={busy} className="companion-league-switcher__disconnect">Sign out</button>
        )}
      </div>

      {state.status === 'checking' && <p className="gridshift-league-access__status" aria-live="polite">Checking sign-in...</p>}

      {state.status === 'error' && (
        <div className="gridshift-league-access__status" role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={reload} className="companion-league-switcher__disconnect">Try again</button>
        </div>
      )}

      {state.status === 'signed-out' && (linkSent ? (
        <p className="gridshift-league-access__status" aria-live="polite">Check your email for the sign-in link.</p>
      ) : (
        <form onSubmit={handleSignIn} className="gridshift-league-access__form">
          <label htmlFor={`${headingId}-email`} className="sr-only">Email</label>
          <input
            id={`${headingId}-email`}
            type="email"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            className="gridshift-league-access__input"
          />
          {state.error && <p className="gridshift-league-access__error" role="alert">{state.error}</p>}
          <button type="submit" disabled={busy || !emailInput.trim()} className="gridshift-league-access__submit">
            {busy ? 'Sending...' : 'Email me a sign-in link'}
          </button>
        </form>
      ))}

      {state.status === 'signed-in' && !hasAccess && (
        <p className="gridshift-league-access__status">No GridShift leagues for {state.email || 'this account'}.</p>
      )}

      {state.status === 'signed-in' && state.leagues.length === 0 && state.inviteCount > 0 && (
        <p className="gridshift-league-access__status">
          {state.inviteCount === 1 ? 'You have a league invite.' : `You have ${state.inviteCount} league invites.`}
        </p>
      )}

      {state.status === 'signed-in' && state.leagues.length > 0 && (
        <div className="companion-league-switcher__league-list">
          {state.leagues.map((league) => {
            const isCurrent = gridshiftLeague?.leagueId === league.leagueId;
            const meta = [league.season, league.viewerRole === 'commissioner' ? 'Commissioner' : 'Manager'].filter(Boolean).join(' · ');
            return (
              <div key={league.leagueId} className={`companion-league-switch-row${isCurrent ? ' is-current' : ''}`} data-current={isCurrent ? 'true' : 'false'}>
                <button
                  type="button"
                  onClick={() => handleSelect(league)}
                  className="companion-league-switch-row__select"
                  aria-label={`${isCurrent ? 'Currently viewing' : 'View'} ${league.name}`}
                >
                  <span className="companion-league-switch-row__avatar" aria-hidden="true">
                    <span className="companion-league-switch-row__avatar-fallback">{getInitials(league.name)}</span>
                  </span>
                  <div className="companion-league-switch-row__identity">
                    <div className="companion-league-switch-row__name-line">
                      <strong>{league.name}</strong>
                      {isCurrent && <span className="companion-league-switch-row__current">Viewing</span>}
                    </div>
                    <div className="companion-league-switch-row__meta">{meta}</div>
                  </div>
                  <span aria-hidden="true" className="companion-league-switch-row__chevron">›</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
