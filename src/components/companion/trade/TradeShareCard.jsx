import { useEffect, useState } from 'react';
import { fmtTradeValue } from '../../../utils/tradeValueScale';
import { getDraftPickLabel } from '../../../utils/draftPickDisplay';
import {
  formatTradeProposalExpiry,
  formatTradeProposalEventTime,
  getTradeProposalCountdown,
  getTradeProposalDisplayStatus,
  getTradeProposalExpiryLabel,
  getTradeProposalTerminalEvent,
  isLegacyTradeProposalValueScale,
  swapTradeProposalPerspective,
} from '../../../utils/tradeProposal';
import CompanionAssetRow from '../CompanionAssetRow';
import './tradeShare.css';

const SHARE_CARD_DARK_MODE = true;

function getViewerRelativeSnapshot(snapshot, viewerUserId) {
  if (!snapshot || viewerUserId == null) return snapshot;
  if (String(snapshot.sender?.userId ?? '') === String(viewerUserId)) return snapshot;
  if (String(snapshot.recipient?.userId ?? '') === String(viewerUserId)) return swapTradeProposalPerspective(snapshot);
  return snapshot;
}

function getAssetLabel(asset) {
  if (asset?.type === 'faab') return `$${asset.amount} FAAB`;
  if (asset?.type === 'pick') return getDraftPickLabel(asset);
  return asset?.label || asset?.name || 'Asset';
}

function TradeShareAsset({ asset, darkMode, onOpenPlayer }) {
  const isPlayer = asset?.type === 'player';
  const isPick = asset?.type === 'pick';
  const meta = isPlayer
    ? [asset.position, asset.team].filter(Boolean).join(' · ') || 'Player'
    : isPick ? null : 'Waiver budget';
  const label = getAssetLabel(asset);
  const normalizedAsset = { ...asset, label };
  const value = asset?.value ?? asset?.val ?? null;
  const leading = !isPlayer && !isPick
    ? <span className="trade-share-card__faab-mark" aria-hidden="true">$</span>
    : null;

  return (
    <li className="trade-share-card__asset">
      <CompanionAssetRow
        asset={normalizedAsset}
        darkMode={darkMode}
        selected
        showSelectionMark
        loading="eager"
        leading={leading}
        metaPrefix=""
        metaSegments={meta ? [meta] : []}
        valueKicker="Value"
        valueLabel={value != null ? fmtTradeValue(value) : '—'}
        className="trade-share-card__asset-row"
        teamThemeOptions={{ logoSide: 'end' }}
        interactive={isPlayer && Boolean(onOpenPlayer)}
        onClick={isPlayer ? () => onOpenPlayer?.(asset) : null}
        ariaLabel={isPlayer ? `Open statistics for ${label}` : undefined}
      />
    </li>
  );
}

function TradeAssetGroup({ assets, label, tone, counterpartyName, darkMode, onOpenPlayer }) {
  const relationship = tone === 'send' ? 'To' : 'From';

  return (
    <div className={`trade-share-card__asset-group trade-share-card__asset-group--${tone}`}>
      <div className="trade-share-card__asset-group-heading">
        <span className="trade-share-card__asset-group-label">{label}</span>
        <span className="trade-share-card__asset-group-context">{relationship} {counterpartyName}</span>
      </div>
      <ul className="trade-share-card__assets">
        {(assets ?? []).length > 0
          ? (assets ?? []).map((asset, index) => <TradeShareAsset key={`${asset.id ?? asset.type}:${index}`} asset={asset} darkMode={darkMode} onOpenPlayer={onOpenPlayer} />)
          : <li className="trade-share-card__empty">No listed assets</li>}
      </ul>
    </div>
  );
}

function TradeSide({ side, otherSide, darkMode, onOpenPlayer }) {
  const counterpartyName = otherSide?.name || 'Other manager';

  return (
    <section className="trade-share-card__side">
      <div className="trade-share-card__side-heading">
        <strong>{side?.name || 'Manager'}</strong>
        <span>{side?.teamName || 'Team'}</span>
      </div>
      <div className="trade-share-card__asset-groups">
        <TradeAssetGroup assets={side?.assets} label="SENDS" tone="send" counterpartyName={counterpartyName} darkMode={darkMode} onOpenPlayer={onOpenPlayer} />
        <TradeAssetGroup assets={otherSide?.assets} label="RECEIVES" tone="receive" counterpartyName={counterpartyName} darkMode={darkMode} onOpenPlayer={onOpenPlayer} />
      </div>
    </section>
  );
}

export default function TradeShareCard({
  snapshot,
  qrImage = '',
  shareUrl = '',
  expiresAt = null,
  updatedAt = null,
  acceptedAt = null,
  sleeperMatch = null,
  senderTimeZone = null,
  expiryPreset = 'two_days',
  status = 'pending',
  sleeperOutcome = 'unknown',
  viewerIsCurrentAuthor = false,
  viewerUserId = null,
  onOpenPlayer = null,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const displaySnapshot = getViewerRelativeSnapshot(snapshot, viewerUserId);
  const senderTotal = displaySnapshot?.totals?.sender ?? null;
  const recipientTotal = displaySnapshot?.totals?.recipient ?? null;
  const isLegacyScale = isLegacyTradeProposalValueScale(displaySnapshot);
  const senderName = displaySnapshot?.sender?.name || displaySnapshot?.sender?.teamName || 'Sender';
  const recipientName = displaySnapshot?.recipient?.name || displaySnapshot?.recipient?.teamName || 'Recipient';
  const displayStatus = getTradeProposalDisplayStatus({ status, sleeperOutcome, viewerIsCurrentAuthor });
  const terminalEvent = getTradeProposalTerminalEvent({ status, sleeperOutcome, updatedAt, acceptedAt, sleeperMatch });
  const hasTerminalEvent = Boolean(terminalEvent);
  const responseOpen = !hasTerminalEvent && (status === 'pending' || status === 'countered');
  const expiryLabel = responseOpen ? formatTradeProposalExpiry(expiresAt, senderTimeZone) : null;
  const terminalEventTime = formatTradeProposalEventTime(terminalEvent?.timestamp);
  const countdown = responseOpen ? getTradeProposalCountdown(expiresAt, nowMs) : null;

  useEffect(() => {
    if (!expiresAt || !responseOpen || countdown?.expired) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [countdown?.expired, expiresAt, responseOpen]);

  return (
    <article className="trade-share-card" aria-label="GridShift trade proposal">
      <header className="trade-share-card__header">
        <div>
          <h1>{senderName} <span aria-hidden="true">↔</span> {recipientName}</h1>
          <p className="trade-share-card__subtitle">Trade Proposal</p>
          <p className="trade-share-card__context">{snapshot?.season || 'Season'} · {expiryLabel ? `Expires ${expiryLabel}${senderTimeZone ? ' · sender time' : ''}` : terminalEvent?.label ?? `${getTradeProposalExpiryLabel(expiryPreset)} to respond`}</p>
          <p className="trade-share-card__context">{isLegacyScale ? 'Legacy value scale · values captured when sent' : 'Values use the 0–100 player scale · side totals can exceed 100'}</p>
          {terminalEvent
            ? <p className="trade-share-card__countdown is-terminal" role="status">{terminalEvent.label}{terminalEventTime ? <> · <time dateTime={new Date(terminalEvent.timestamp).toISOString()}>{terminalEventTime}</time></> : null}</p>
            : countdown && <p className={`trade-share-card__countdown${countdown.expired ? ' is-expired' : ''}`} role="status" aria-live="polite">{countdown.expired ? 'Expired' : `Expires in ${countdown.label}`}</p>}
        </div>
        <div className={`trade-share-card__status trade-share-card__status--${displayStatus.tone}`} role="status">{displayStatus.label}</div>
      </header>

      <div className="trade-share-card__sides">
        <TradeSide side={displaySnapshot?.sender} otherSide={displaySnapshot?.recipient} darkMode={SHARE_CARD_DARK_MODE} onOpenPlayer={onOpenPlayer} />
        <div className="trade-share-card__exchange" aria-hidden="true">⇄</div>
        <TradeSide side={displaySnapshot?.recipient} otherSide={displaySnapshot?.sender} darkMode={SHARE_CARD_DARK_MODE} onOpenPlayer={onOpenPlayer} />
      </div>

      <footer className="trade-share-card__footer">
        <div className="trade-share-card__totals">
          <span><b>{senderTotal != null ? fmtTradeValue(senderTotal) : '—'}</b> offered</span>
          <span><b>{recipientTotal != null ? fmtTradeValue(recipientTotal) : '—'}</b> requested</span>
        </div>
        {qrImage && (
          <div className="trade-share-card__qr-wrap">
            <img className="trade-share-card__qr" src={qrImage} alt="QR code for this GridShift trade proposal" />
            <span>Scan to open</span>
          </div>
        )}
        {shareUrl && <p className="trade-share-card__url">{shareUrl}</p>}
      </footer>
    </article>
  );
}
