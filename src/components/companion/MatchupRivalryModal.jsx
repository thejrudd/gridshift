import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import { CompanionSelectorButton } from './CompanionSelectorControls';
import CompanionPlayerRow, { CompanionPlayerMetric } from './CompanionPlayerRow';
import LeagueHistoryIcon from './LeagueHistoryIcon';
import { useTheme } from '../../context/ThemeContext';
import { buildMatchupRivalry } from '../../utils/matchupRivalry.js';

const meetingLabel = (meeting) => `${meeting.season} · Week ${meeting.week}`;
const pointsLabel = (points) => points.toFixed(2);

function StarterExtremes({ performers, managerName, side, darkMode, onOpen, disabled }) {
  return <div className={`matchup-rivalry-starters is-${side}`}>
    <h4>{managerName}</h4>
    {!performers?.available ? <p className="matchup-rivalry-player-note">Complete starter scores are unavailable for this meeting.</p> : [
      { label: 'Highest-scoring starter', icon: 'star', players: performers.highest },
      { label: 'Lowest-scoring starter', icon: 'minus', players: performers.lowest },
    ].map(({ label, icon, players: entries }) => <div className="matchup-rivalry-performer-group" key={label}>
      <div className="matchup-rivalry-performer-label"><LeagueHistoryIcon name={icon} size="sm" /><span>{label}{entries.length > 1 ? 's · tied' : ''}</span></div>
      {entries.map((entry) => <CompanionPlayerRow
        key={entry.id}
        player={{ ...entry.player, id: entry.id, name: entry.name, team: null, nflTeam: null, teamAbbr: null, teamCode: null }}
        name={entry.name}
        darkMode={darkMode}
        showAccentRail={false}
        showPosition={false}
        showTeamLogo={false}
        gridTemplate="36px minmax(0, 1fr) auto"
        columnGridTemplate="auto"
        columns={[<CompanionPlayerMetric key="points" value={pointsLabel(entry.points)} label="pts" />]}
        onClick={onOpen}
        disabled={disabled}
        ariaLabel={`${label}: ${entry.name}, ${pointsLabel(entry.points)} points. View matchup for ${managerName}.`}
        className="matchup-rivalry-player"
      />)}
    </div>)}
  </div>;
}

export default function MatchupRivalryModal({ selection, historyState, players = {}, onOpenMatchup, onRetry, onClose }) {
  const contentRef = useRef(null);
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [navigationError, setNavigationError] = useState(null);
  const { darkMode } = useTheme();
  const { leftName, rightName, leftManagerId, rightManagerId } = selection;
  const rivalry = buildMatchupRivalry(historyState.model, leftManagerId, rightManagerId, players);
  const loading = ['idle', 'loading'].includes(historyState.status);
  const unavailable = ['error', 'unavailable'].includes(historyState.status);

  useEffect(() => {
    const trigger = document.activeElement;
    const panel = contentRef.current?.closest('[role="dialog"]');
    const focusable = () => [...(panel?.querySelectorAll('button:not([disabled]), [href], [tabindex="0"]') ?? [])];
    focusable()[0]?.focus();
    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    panel?.addEventListener('keydown', trapFocus);
    return () => {
      panel?.removeEventListener('keydown', trapFocus);
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const openMeeting = async (meeting, side = 'left') => {
    if (!onOpenMatchup || openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setNavigationError(null);
    try {
      await onOpenMatchup({ season: meeting.season, week: meeting.week, rosterId: side === 'right' ? meeting.rightRosterId : meeting.leftRosterId });
      onClose();
    } catch {
      setNavigationError('This matchup could not be opened. Please try again.');
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };
  const canOpen = (meeting) => Boolean(onOpenMatchup && meeting.leftRosterId != null && meeting.rightRosterId != null);
  const seriesHeading = !rivalry ? '' : rivalry.leftWins === rivalry.rightWins
    ? `Series tied ${rivalry.leftWins}–${rivalry.rightWins}`
    : `${rivalry.leftWins > rivalry.rightWins ? leftName : rightName} leads ${Math.max(rivalry.leftWins, rivalry.rightWins)}–${Math.min(rivalry.leftWins, rivalry.rightWins)}`;
  const highlights = rivalry ? [
    rivalry.closestMeeting && {
      title: 'Closest meeting', icon: 'target', side: 'left',
      meeting: rivalry.closestMeeting,
      value: rivalry.closestMeeting.margin === 0 ? 'Tied game' : `${pointsLabel(rivalry.closestMeeting.margin)} pts apart`,
    },
    rivalry.biggestWin && {
      title: 'Biggest win', icon: 'bolt', side: rivalry.biggestWin.winner,
      meeting: rivalry.biggestWin,
      value: `${pointsLabel(rivalry.biggestWin.margin)} pts`,
      detail: rivalry.biggestWin.winner === 'left' ? leftName : rightName,
    },
    rivalry.highestScore && {
      title: 'Highest score', icon: 'flame', side: rivalry.highestScore.side,
      meeting: rivalry.highestScore,
      value: `${pointsLabel(rivalry.highestScore.points)} pts`,
      detail: rivalry.highestScore.side === 'left' ? leftName : rightName,
    },
  ].filter(Boolean) : [];

  return (
    <Modal onClose={onClose} ariaLabel={`League rivalry: ${leftName} versus ${rightName}`} containerClassName="matchup-rivalry-modal" containerStyle={{ '--rivalry-left': selection.leftPalette?.[0] ?? 'var(--color-accent)', '--rivalry-right': selection.rightPalette?.[0] ?? 'var(--color-signature)', maxWidth: '900px', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="matchup-tale-of-tape-modal__header">
        <h2 className="matchup-rivalry-title"><LeagueHistoryIcon name="versus" /> League rivalry</h2>
        <button type="button" onClick={onClose} aria-label="Close league rivalry" className="matchup-rivalry-close">×</button>
      </header>
      <div ref={contentRef} className="matchup-rivalry-body" aria-busy={loading}>
        <div className="matchup-rivalry-managers">
          <div className="is-left"><span>Series record</span><strong>{leftName}</strong>{rivalry && <b>{rivalry.leftWins}<small> {rivalry.leftWins === 1 ? 'win' : 'wins'}</small></b>}</div>
          <span><LeagueHistoryIcon name="versus" /></span>
          <div className="is-right"><span>Series record</span><strong>{rightName}</strong>{rivalry && <b>{rivalry.rightWins}<small> {rivalry.rightWins === 1 ? 'win' : 'wins'}</small></b>}</div>
        </div>
        {opening && <p className="matchup-rivalry-player-note" role="status">Opening historical matchup…</p>}
        {navigationError && <p role="alert" className="matchup-rivalry-player-note">{navigationError}</p>}
        {loading ? <p className="matchup-tale-of-tape-empty-note" role="status">Loading linked league history…</p> : unavailable ? (
          <div className="matchup-rivalry-state">
            <p>Linked league history is currently unavailable.</p>
            {historyState.status === 'error' && <CompanionSelectorButton onClick={onRetry}>Try again</CompanionSelectorButton>}
          </div>
        ) : !rivalry ? <p className="matchup-tale-of-tape-empty-note">No completed head-to-head history is available for these managers.</p> : (
          <>
            <div className="matchup-rivalry-summary">
              <strong>{seriesHeading}</strong>
              <p>{rivalry.games} completed matchup{rivalry.games === 1 ? '' : 's'}{rivalry.ties ? ` · ${rivalry.ties} tie${rivalry.ties === 1 ? '' : 's'}` : ''}</p>
              <span>Across available linked league seasons</span>
            </div>
            {highlights.length > 0 && <section aria-labelledby="matchup-rivalry-highlights">
              <h3 id="matchup-rivalry-highlights" className="matchup-rivalry-section-title">Meeting highlights</h3>
              <div className="matchup-rivalry-highlights">
                {highlights.map(({ title, icon, side, value, detail, meeting }) => <button
                  type="button" key={title} className={`matchup-rivalry-highlight is-${side}`}
                  onClick={() => openMeeting(meeting, side)} disabled={opening || !canOpen(meeting)}
                  aria-label={`${title}: ${value}. ${meetingLabel(meeting)}. View matchup.`}
                >
                  <span className="matchup-rivalry-highlight-label"><LeagueHistoryIcon name={icon} /><span>{title}</span><LeagueHistoryIcon name="open" size="sm" /></span>
                  <strong>{value}</strong>{detail && <span>{detail}</span>}<span>{meetingLabel(meeting)}</span>
                </button>)}
              </div>
            </section>}
            <section aria-labelledby="matchup-rivalry-meetings">
              <h3 id="matchup-rivalry-meetings" className="matchup-rivalry-section-title">Previous meetings</h3>
              <ol className="matchup-rivalry-meetings">
                {rivalry.meetings.map((meeting) => <li key={meeting.id}>
                  <button type="button" className="matchup-rivalry-meeting-link" onClick={() => openMeeting(meeting)} disabled={opening || !canOpen(meeting)} aria-label={`View matchup: ${leftName} versus ${rightName}, ${meetingLabel(meeting)}`}>
                    <span className="matchup-rivalry-meeting-meta"><span>{meetingLabel(meeting)}</span><span>View matchup <LeagueHistoryIcon name="open" size="sm" /></span></span>
                    <span className="matchup-rivalry-meeting-score">
                      <span className={`is-left${meeting.winner === 'left' ? ' is-winner' : ''}`}><small>{leftName}</small><strong>{pointsLabel(meeting.leftPoints)}</strong></span>
                      <span aria-hidden="true">–</span>
                      <span className={`is-right${meeting.winner === 'right' ? ' is-winner' : ''}`}><small>{rightName}</small><strong>{pointsLabel(meeting.rightPoints)}</strong></span>
                    </span>
                    <span className="matchup-rivalry-result"><LeagueHistoryIcon name={meeting.winner ? 'trophy' : 'versus'} size="sm" />{meeting.winner ? `${meeting.winner === 'left' ? leftName : rightName} won by ${pointsLabel(meeting.margin)} pts` : 'Tied matchup'}</span>
                  </button>
                  <div className="matchup-rivalry-starter-grid">
                    <StarterExtremes performers={meeting.leftPerformers} managerName={leftName} side="left" darkMode={darkMode} disabled={opening || !canOpen(meeting)} onOpen={() => openMeeting(meeting, 'left')} />
                    <StarterExtremes performers={meeting.rightPerformers} managerName={rightName} side="right" darkMode={darkMode} disabled={opening || !canOpen(meeting)} onOpen={() => openMeeting(meeting, 'right')} />
                  </div>
                </li>)}
              </ol>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
