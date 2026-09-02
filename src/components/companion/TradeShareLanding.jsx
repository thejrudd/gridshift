import TradeShareCard from './trade/TradeShareCard';
import { hasTradeProposalAssets } from '../../utils/tradeProposal';
import useTradeProposalValues from '../../hooks/useTradeProposalValues';
import './trade/tradeInbox.css';

export default function TradeShareLanding({ shareToken, sharedData, loading = false, error = '', canClaim = false, claimLoading = false, onClaim, onOpenProposals, viewerUserId = null, onOpenPlayer = null }) {
  const proposal = sharedData?.proposal;
  const snapshot = proposal?.revision?.snapshot ?? (proposal?.sender ? { season: proposal.season, sender: proposal.sender, recipient: proposal.recipient, totals: {}, verdict: {} } : null);
  const { getAssetValue } = useTradeProposalValues();
  const viewerIsCurrentAuthor = String(proposal?.revision?.authorUserId ?? '') === String(viewerUserId ?? '');
  return (
    <div className="page-frame-readable trade-inbox trade-share-landing">
      <div className="trade-inbox__intro">
        <div><p>SHARED TRADE</p><h1>Trade proposal</h1><span>The details are visible from the link. Actions stay limited to the two connected Sleeper participants.</span></div>
      </div>
      {loading && <div className="trade-inbox__empty">Loading trade proposal…</div>}
      {error && <div className="trade-inbox__error" role="alert">{error}</div>}
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
          viewerUserId={viewerUserId}
          valueResolver={canClaim ? getAssetValue : null}
          onOpenPlayer={canClaim ? onOpenPlayer : null}
        />
        : !loading && !error && <div className="trade-inbox__details-error" role="alert">Trade details are unavailable or this proposal has expired.</div>}
      {!loading && !error && !canClaim && snapshot && <div className="trade-inbox__outcome">Connect the exact Sleeper account and select the exact league this proposal belongs to before claiming it.</div>}
      {canClaim && <div className="trade-inbox__actions"><button type="button" className="trade-inbox__primary-action" onClick={() => onClaim?.(shareToken)} disabled={claimLoading}>{claimLoading ? 'Claiming…' : 'Open in GridShift'}</button><button type="button" onClick={onOpenProposals}>Open Proposals</button></div>}
    </div>
  );
}
