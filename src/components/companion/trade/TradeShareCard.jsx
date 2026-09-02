import { useEffect, useState } from 'react';
import { fmtKtcValue } from '../../../utils/ktcApi';
import {
  formatTradeProposalExpiry,
  formatTradeProposalEventTime,
  getTradeProposalAssetValue,
  getTradeProposalCountdown,
  getTradeProposalDisplayStatus,
  getTradeProposalExpiryLabel,
  getTradeProposalTerminalEvent,
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
  if (asset?.type === 'pick') return asset.label || `${asset.year} Round ${asset.round} pick`;
  return asset?.label || asset?.name || 'Asset';
}

function TradeShareAsset({ asset, darkMode, valueResolver, onOpenPlayer }) {
  const isPlayer = asset?.type === 'player';
  const isPick = asset?.type === 'pick';
  const meta = isPlayer
    ? [asset.position, asset.team].filter(Boolean).join(' · ') || 'Player'
    : isPick
      ? [asset.year, `Round ${asset.round}`].filter(Boolean).join(' · ')
      : 'Waiver budget';
  const label = getAssetLabel(asset);
  const normalizedAsset = { ...asset, label };
  const value = getTradeProposalAssetValue(asset, valueResolver);
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
        metaSegments={[meta, ...(isPick && asset.pickNumberLabel ? [asset.pickNumberLabel] : [])]}
        valueKicker="Value"
        valueLabel={value != null ? fmtKtcValue(value) : '—'}
        className="trade-share-card__asset-row"
        teamThemeOptions={{ logoSide: 'end' }}
        interactive={isPlayer && Boolean(onOpenPlayer)}
        onClick={isPlayer ? () => onOpenPlayer?.(asset) : null}
        ariaLabel={isPlayer ? `Open statistics for ${label}` : undefined}
      />
    </li>
  );
}

function TradeAssetGroup({ assets, label, tone, counterpartyName, darkMode, valueResolver, onOpenPlayer }) {
  const relationship = tone === 'send' ? 'To' : 'From';

  return (
    <div className={`trade-share-card__asset-group trade-share-card__asset-group--${tone}`}>
      <div className="trade-share-card__asset-group-heading">
        <span className="trade-share-card__asset-group-label">{label}</span>
        <span className="trade-share-card__asset-group-context">{relationship} {counterpartyName}</span>
      </div>
      <ul className="trade-share-card__assets">
        {(assets ?? []).length > 0
          ? (assets ?? []).map((asset, index) => <TradeShareAsset key={`${asset.id ?? asset.type}:${index}`} asset={asset} darkMode={darkMode} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} />)
          : <li className="trade-share-card__empty">No listed assets</li>}
      </ul>
    </div>
  );
}

function TradeSide({ side, otherSide, darkMode, valueResolver, onOpenPlayer }) {
  const counterpartyName = otherSide?.name || 'Other manager';

  return (
    <section className="trade-share-card__side">
      <div className="trade-share-card__side-heading">
        <strong>{side?.name || 'Manager'}</strong>
        <span>{side?.teamName || 'Team'}</span>
      </div>
      <div className="trade-share-card__asset-groups">
        <TradeAssetGroup assets={side?.assets} label="SENDS" tone="send" counterpartyName={counterpartyName} darkMode={darkMode} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} />
        <TradeAssetGroup assets={otherSide?.assets} label="RECEIVES" tone="receive" counterpartyName={counterpartyName} darkMode={darkMode} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} />
      </div>
    </section>
  );
}

function getDisplayedSideTotal(side, fallback, valueResolver) {
  if (!valueResolver || !Array.isArray(side?.assets)) return fallback;
  const values = side.assets.map((asset) => getTradeProposalAssetValue(asset, valueResolver));
  return values.every((value) => value != null)
    ? values.reduce((total, value) => total + value, 0)
    : fallback;
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
  valueResolver = null,
  onOpenPlayer = null,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const displaySnapshot = getViewerRelativeSnapshot(snapshot, viewerUserId);
  const senderTotal = getDisplayedSideTotal(displaySnapshot?.sender, displaySnapshot?.totals?.sender, valueResolver);
  const recipientTotal = getDisplayedSideTotal(displaySnapshot?.recipient, displaySnapshot?.totals?.recipient, valueResolver);
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
          {terminalEvent
            ? <p className="trade-share-card__countdown is-terminal" role="status">{terminalEvent.label}{terminalEventTime ? <> · <time dateTime={new Date(terminalEvent.timestamp).toISOString()}>{terminalEventTime}</time></> : null}</p>
            : countdown && <p className={`trade-share-card__countdown${countdown.expired ? ' is-expired' : ''}`} role="status" aria-live="polite">{countdown.expired ? 'Expired' : `Expires in ${countdown.label}`}</p>}
        </div>
        <div className={`trade-share-card__status trade-share-card__status--${displayStatus.tone}`} role="status">{displayStatus.label}</div>
      </header>

      <div className="trade-share-card__sides">
        <TradeSide side={displaySnapshot?.sender} otherSide={displaySnapshot?.recipient} darkMode={SHARE_CARD_DARK_MODE} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} />
        <div className="trade-share-card__exchange" aria-hidden="true">⇄</div>
        <TradeSide side={displaySnapshot?.recipient} otherSide={displaySnapshot?.sender} darkMode={SHARE_CARD_DARK_MODE} valueResolver={valueResolver} onOpenPlayer={onOpenPlayer} />
      </div>

      <footer className="trade-share-card__footer">
        <div className="trade-share-card__totals">
          <span><b>{senderTotal != null ? fmtKtcValue(senderTotal) : '—'}</b> offered</span>
          <span><b>{recipientTotal != null ? fmtKtcValue(recipientTotal) : '—'}</b> requested</span>
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
