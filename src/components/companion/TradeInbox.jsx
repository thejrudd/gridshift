import { useCallback, useMemo, useState } from 'react';
import { getSleeperLeagueUrl, hasTradeProposalAssets } from '../../utils/tradeProposal';
import useTradeProposalValues from '../../hooks/useTradeProposalValues';
import TradeShareCard from './trade/TradeShareCard';
import './trade/tradeInbox.css';

function eventLabel(type) {
  return {
    proposal_received: 'New trade proposal',
    counter_received: 'New counter-proposal',
    trade_accepted: 'Your trade was accepted',
    trade_declined: 'Trade declined',
    trade_withdrawn: 'Trade withdrawn',
    trade_marked_completed: 'Trade marked done',
    trade_marked_not_completed: 'Trade marked not completed',
    sleeper_match_possible: 'Sleeper found a possible matching trade',
  }[type] ?? 'Trade update';
}

function ProposalActions({ proposal, userId, onAccept, onCounter, onDecline, onWithdraw, onReconcile, onMarkDone, runAction, busy }) {
  const currentAuthor = proposal.revision?.authorUserId;
  const isAuthor = String(currentAuthor ?? '') === String(userId ?? '');
  const isOpen = proposal.status === 'pending' || proposal.status === 'countered';
  const isAccepted = proposal.status === 'accepted';
  const isAcceptingViewer = isAccepted && String(proposal.acceptedByUserId ?? '') === String(userId ?? '');
  if (!isOpen && !isAcceptingViewer) return null;
  if (isAccepted) {
    if (proposal.sleeperOutcome === 'completed') return null;
    return (
      <div className="trade-inbox__actions">
        <button type="button" className="trade-inbox__primary-action" onClick={() => runAction(onReconcile, proposal, 'reconcile')} disabled={busy}>{busy ? 'Checking…' : 'Check Sleeper'}</button>
        <button type="button" onClick={() => runAction(onMarkDone, proposal, 'mark-done')} disabled={busy}>{busy ? 'Saving…' : 'Mark Done'}</button>
      </div>
    );
  }
  const isAwaitingViewerResponse = !isAuthor;
  return (
    <div className="trade-inbox__actions">
      {isAwaitingViewerResponse && <button type="button" className="trade-inbox__primary-action" onClick={() => runAction(onAccept, proposal, 'accept')} disabled={busy}>{busy ? 'Accepting…' : 'Accept'}</button>}
      {!isAuthor && <>
        <button type="button" onClick={() => runAction(onCounter, proposal, 'counter')} disabled={busy}>{busy ? 'Loading trade…' : 'Counter'}</button>
        <button type="button" className="trade-inbox__danger" onClick={() => runAction(onDecline, proposal, 'decline')} disabled={busy}>Decline</button>
      </>}
      {isAuthor && <button type="button" onClick={() => runAction(onWithdraw, proposal, 'withdraw')} disabled={busy}>Withdraw</button>}
    </div>
  );
}

function SleeperNextSteps({ proposal, userId }) {
  const isAcceptingViewer = proposal.status === 'accepted'
    && String(proposal.acceptedByUserId ?? '') === String(userId ?? '')
    && proposal.sleeperOutcome !== 'completed';
  const sleeperUrl = getSleeperLeagueUrl(proposal.leagueId);
  if (!isAcceptingViewer || !sleeperUrl) return null;
  return (
    <section className="trade-inbox__next-steps" aria-label="What to do next">
      <p className="trade-inbox__next-steps-kicker">WHAT TO DO NEXT</p>
      <h2>Re-create this trade in Sleeper</h2>
      <ol>
        <li>Re-create the accepted trade in Sleeper with the same Sends and Receives.</li>
        <li>Send the Sleeper trade to the other manager there.</li>
        <li>Return to GridShift after Sleeper processes the trade.</li>
        <li>Use Check Sleeper, then Mark Done to finish this record.</li>
      </ol>
      <a className="trade-inbox__primary-action" href={sleeperUrl} target="_blank" rel="noreferrer">Open Sleeper</a>
      <p className="trade-inbox__next-steps-note">GridShift records the acceptance and completion, but cannot submit the trade to Sleeper.</p>
    </section>
  );
}

export default function TradeInbox({ inbox, userId, onAccept, onCounter, onDecline, onWithdraw, onReconcile, onMarkDone, onMarkRead, busyProposalId = null, loading = false, error = '', onOpenShare, onOpenPlayer }) {
  const events = useMemo(() => inbox?.events ?? [], [inbox?.events]);
  const eventsByProposal = useMemo(() => {
    const grouped = new Map();
    events.forEach((event) => {
      const proposalEvents = grouped.get(event.proposalId) ?? [];
      grouped.set(event.proposalId, [...proposalEvents, event]);
    });
    return grouped;
  }, [events]);
  const proposals = inbox?.proposals ?? [];
  const [pendingAction, setPendingAction] = useState(null);
  const { getAssetValue } = useTradeProposalValues();
  const runAction = useCallback(async (action, proposal, actionName) => {
    if (!action || pendingAction) return;
    setPendingAction({ proposalId: proposal.id, action: actionName });
    try {
      await action(proposal);
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction]);
  return (
    <div className="page-frame-readable trade-inbox" data-tour="trade-proposals-content">
      <div className="trade-inbox__intro">
        <div><p>TRADE DESK</p><h1>Proposals</h1><span>Review incoming and outgoing trade conversations between the two connected Sleeper participants in this league.</span></div>
        <span className="trade-inbox__count">{inbox?.unreadCount ?? 0} unread notifications</span>
      </div>
      {error && <div className="trade-inbox__error" role="alert">{error.message ?? String(error)}</div>}
      {loading && proposals.length === 0 ? <div className="trade-inbox__empty">Loading your trade proposals…</div> : null}
      {!loading && proposals.length === 0 && !error ? <div className="trade-inbox__empty">No active trade proposals in this league.</div> : null}
      <div className="trade-inbox__list">
        {proposals.map((proposal) => {
          const busy = busyProposalId === proposal.id || pendingAction?.proposalId === proposal.id;
          const snapshot = proposal.revision?.snapshot;
          const viewerIsCurrentAuthor = String(proposal.revision?.authorUserId ?? '') === String(userId ?? '');
          const viewerIsAcceptor = String(proposal.acceptedByUserId ?? '') === String(userId ?? '');
          const directionLabel = viewerIsCurrentAuthor ? 'You sent' : 'You received';
          const proposalEvents = eventsByProposal.get(proposal.id) ?? [];
          return (
            <article key={proposal.id} className={`trade-inbox__proposal trade-inbox__proposal--${proposal.status}`}>
              {proposalEvents.length > 0 && (
                <div className="trade-inbox__proposal-notifications" aria-label="Unread notifications for this proposal">
                  {proposalEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="trade-inbox__proposal-notification"
                      aria-label={`${eventLabel(event.type)}. Mark notification as read`}
                      onClick={() => { onMarkRead?.(event); onOpenShare?.(event.proposalId); }}
                    >
                      <span className="trade-inbox__event-dot" aria-hidden="true" />
                      <span><strong>{eventLabel(event.type)}</strong><small>{new Date(event.createdAt).toLocaleString()}</small></span>
                    </button>
                  ))}
                </div>
              )}
              <div className="trade-inbox__proposal-context"><strong>{directionLabel}</strong><span>Revision {proposal.currentRevision}</span></div>
              {hasTradeProposalAssets(snapshot)
                ? <TradeShareCard
                  snapshot={snapshot}
                  expiresAt={proposal.expiresAt}
                  updatedAt={proposal.updatedAt}
                  acceptedAt={proposal.acceptedAt}
                  sleeperMatch={proposal.sleeperMatch}
                  senderTimeZone={proposal.revision?.senderTimeZone}
                  status={proposal.status}
                  sleeperOutcome={proposal.sleeperOutcome}
                  viewerIsCurrentAuthor={viewerIsCurrentAuthor}
                  viewerUserId={userId}
                  valueResolver={getAssetValue}
                  onOpenPlayer={onOpenPlayer}
                />
                : <div className="trade-inbox__details-error" role="alert">Trade details are unavailable. Refresh Proposals before trying to counter this proposal.</div>}
              {proposal.sleeperOutcome !== 'unknown' && <div className="trade-inbox__outcome">Sleeper status: <strong>{proposal.sleeperOutcome === 'possible_match' ? viewerIsAcceptor ? 'Possible match — confirm with Mark Done' : 'Possible match' : proposal.sleeperOutcome === 'completed' ? 'Done' : proposal.sleeperOutcome.replace('_', ' ')}</strong></div>}
              <SleeperNextSteps proposal={proposal} userId={userId} />
              <ProposalActions proposal={proposal} userId={userId} onAccept={onAccept} onCounter={onCounter} onDecline={onDecline} onWithdraw={onWithdraw} onReconcile={onReconcile} onMarkDone={onMarkDone} runAction={runAction} busy={busy} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
