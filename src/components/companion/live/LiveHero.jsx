// LiveHero.jsx — the split hero. Two fantasy-team gradients meet on a hard
// diagonal; each side shows its score on the outer edge and names its three
// leading scorers. The win odds sit in a neutral plate so neither colour
// claims them, and run as a rail along the bottom edge.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LiveAvatar } from './LiveAtoms.jsx';
import { getLiveCutoutUrl, lastNameOf } from './liveVisuals.js';
import { fantasyHeroGradient } from '../../../utils/fantasyTeamIdentity.js';
import { getSleeperPlayerName } from '../../../utils/liveScoringFeed.js';
import { formatWinProbabilityPair } from '../../../utils/liveWinProbability.js';

// Portrait density follows the hero's actual inline size rather than the
// viewport. That matters in the desktop shell, where the sidebar and an open
// player drilldown can both change how much room this surface really has.
function useHeroPortraitCapacity() {
  const heroRef = useRef(null);
  const [capacity, setCapacity] = useState(0);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    const apply = (width) => {
      const next = width >= 1120 ? 3 : width >= 840 ? 2 : width >= 640 ? 1 : 0;
      setCapacity((current) => (current === next ? current : next));
    };
    apply(hero.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => apply(hero.getBoundingClientRect().width);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return [heroRef, capacity];
}

/**
 * The cut-out face. Renders nothing if the headshot fails to load, so a bad
 * URL leaves clean gradient rather than a broken-image box.
 */
function HeroFace({ url, featured, slot }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      className={`fl-hero__face${featured ? ' is-featured' : ''}`}
      src={url}
      alt=""
      draggable="false"
      style={{ '--fl-face-slot': `${slot}%` }}
      onError={() => setFailed(true)}
    />
  );
}

function useCrossfade(value, transitionKey) {
  const keyRef = useRef(transitionKey);
  const valueRef = useRef(value);
  const timerRef = useRef(null);
  const [layers, setLayers] = useState({
    current: { key: transitionKey, value },
    outgoing: null,
  });

  useLayoutEffect(() => {
    const previous = { key: keyRef.current, value: valueRef.current };
    keyRef.current = transitionKey;
    valueRef.current = value;

    if (previous.key === transitionKey) {
      queueMicrotask(() => {
        if (keyRef.current !== transitionKey) return;
        setLayers((current) => (
          current.current.value === value
            ? current
            : { ...current, current: { key: transitionKey, value } }
        ));
      });
      return undefined;
    }

    window.clearTimeout(timerRef.current);
    queueMicrotask(() => {
      if (keyRef.current !== transitionKey) return;
      setLayers({
        current: { key: transitionKey, value },
        outgoing: previous,
      });
      timerRef.current = window.setTimeout(() => {
        setLayers((current) => ({ ...current, outgoing: null }));
      }, 280);
    });

    return undefined;
  }, [transitionKey, value]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return layers;
}

function getTopScorers(side, limit = 3) {
  return [...(side?.entries ?? [])]
    .filter((entry) => entry.pace)
    .sort((left, right) => (right.pace?.points ?? 0) - (left.pace?.points ?? 0))
    .slice(0, limit);
}

function getHeroPortraits(side, capacity) {
  if (capacity < 1) return [];
  const ranked = getTopScorers(side);
  if (!getLiveCutoutUrl(ranked[0]?.row.player)) return [];

  return ranked
    .slice(0, capacity)
    .filter((entry) => getLiveCutoutUrl(entry.row.player))
    .map((entry) => ({
      id: entry.id,
      url: getLiveCutoutUrl(entry.row.player),
    }));
}

function faceSlot(index, count, sideKey) {
  if (index === 0) {
    if (count === 2) return sideKey === 'a' ? 58 : 42;
    return 50;
  }
  if (count === 2) return sideKey === 'a' ? 35 : 65;
  return index === 1 ? 32 : 68;
}

function PortraitLayer({ sideKey, portraits, state }) {
  return (
    <span
      className={`fl-hero__faces is-${sideKey} is-${state}`}
      aria-hidden="true"
    >
      {portraits.map((portrait, index) => (
        <HeroFace
          key={portrait.id}
          url={portrait.url}
          featured={index === 0}
          slot={faceSlot(index, portraits.length, sideKey)}
        />
      ))}
    </span>
  );
}

function CrossfadePortraits({ sideKey, portraits }) {
  const transitionKey = `${portraits[0]?.id ?? 'empty'}:${portraits.length}`;
  const layers = useCrossfade(portraits, transitionKey);
  return (
    <>
      {layers.outgoing?.value?.length > 0 && (
        <PortraitLayer sideKey={sideKey} portraits={layers.outgoing.value} state="outgoing" />
      )}
      {layers.current.value.length > 0 && (
        <PortraitLayer
          sideKey={sideKey}
          portraits={layers.current.value}
          state={layers.outgoing ? 'incoming' : 'current'}
        />
      )}
    </>
  );
}

function formatPoints(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '—';
}

function ProbabilityValue({ label }) {
  if (!label || label === '—') return <>—</>;
  return (
    <>
      {label.slice(0, -1)}
      <span className="fl-hero__pct">%</span>
    </>
  );
}

function HeroSide({ side, snapshotTotal, snapshotFigures = null, dimmed, onToggle }) {
  const total = snapshotTotal != null ? snapshotTotal : side.pace.total;
  const vsPace = side.pace.vsPace;
  const projected = snapshotFigures?.expected ?? side.pace.liveProjected;
  return (
    <button
      type="button"
      className={`fl-hero__col${side.key === 'b' ? ' is-right' : ''}${dimmed ? ' is-dim' : ''}`}
      onClick={onToggle}
      aria-pressed={!dimmed}
      aria-label={`${side.name} — ${formatPoints(total)} points. Filter the feed to this team.`}
    >
      <span className="fl-hero__tag">
        {side.isMine && <span className="fl-hero__you">You</span>}
        <span>{[side.record, side.manager].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="fl-hero__tname">{side.name}</span>
      <span className={`fl-hero__score${snapshotTotal != null ? ' is-trailing' : ''}`}>{formatPoints(total)}</span>
      <span className="fl-hero__sub">
        <span>Proj {formatPoints(projected)}</span>
        {!snapshotFigures && (
          <>
            <span aria-hidden="true" className="fl-hero__dot">·</span>
            <span className={vsPace >= 0 ? 'is-up' : 'is-down'}>
              {vsPace >= 0 ? '+' : '−'}{Math.abs(vsPace).toFixed(1)} vs pace
            </span>
          </>
        )}
      </span>
    </button>
  );
}

function TopScorers({ side, faces, onOpenPlayer }) {
  const scorers = getTopScorers(side);
  if (!scorers.length || (scorers[0].pace?.points ?? 0) <= 0) {
    return (
      <span className={`fl-hero__ft${side.key === 'b' ? ' is-right' : ''} is-empty`}>
        <span className="fl-hero__ft-text">
          <span className="fl-hero__ft-eyebrow">{side.pace.yetToPlay ? 'Yet to play' : 'No scoring yet'}</span>
        </span>
      </span>
    );
  }
  const leader = scorers[0];
  return (
    <div
      className={`fl-hero__ft${side.key === 'b' ? ' is-right' : ''}`}
    >
      {faces === 'spotlight' && <LiveAvatar player={leader.row.player} size={34} className="fl-hero__ft-av" />}
      <span className="fl-hero__ft-text">
        <span className="fl-hero__ft-eyebrow">Top scorers</span>
        <span className="fl-hero__ft-list" role="list" aria-label={`${side.name} top scorers`}>
          {scorers.map((entry) => {
            const player = entry.row.player;
            const name = getSleeperPlayerName(player);
            return (
              <span key={entry.id} className="fl-hero__scorer-item" role="listitem">
                <button
                  type="button"
                  className="fl-hero__scorer"
                  onClick={() => onOpenPlayer?.(entry)}
                  aria-label={`${name}, ${formatPoints(entry.pace.points)} points. Open breakdown.`}
                >
                  <span>{lastNameOf(name) || name}</span>
                  <b>{formatPoints(entry.pace.points)}</b>
                </button>
              </span>
            );
          })}
        </span>
      </span>
    </div>
  );
}

function CrossfadeTopScorers({ side, faces, onOpenPlayer }) {
  const transitionKey = getTopScorers(side).map((entry) => entry.id).join(':') || 'empty';
  const layers = useCrossfade(side, transitionKey);
  return (
    <span className={`fl-hero__ft-slot${side.key === 'b' ? ' is-right' : ''}`}>
      {layers.outgoing && (
        <span className="fl-hero__ft-layer is-outgoing" aria-hidden="true">
          <TopScorers side={layers.outgoing.value} faces={faces} />
        </span>
      )}
      <span className={`fl-hero__ft-layer${layers.outgoing ? ' is-incoming' : ' is-current'}`}>
        <TopScorers side={layers.current.value} faces={faces} onOpenPlayer={onOpenPlayer} />
      </span>
    </span>
  );
}

/**
 * The reasoning behind the number. Win % is not a vibe: it is the chance the
 * projected margin survives the swing still available in the unplayed games,
 * so the panel shows both of those and the parts they are built from.
 */
function WinExplainer({ left, right, explain, id }) {
  if (!explain) return null;
  const leader = explain.marginLeaderKey === 'a' ? left : right;
  const rows = [[left, explain.a], [right, explain.b]];
  const paceMovers = rows.flatMap(([side, figures]) => (
    (figures.keyMovers ?? []).slice(0, 1).map((mover) => ({ side, ...mover }))
  ));
  return (
    <div className="fl-winex" id={id} role="tooltip">
      <div className="fl-winex__title">How this is worked out</div>
      <table className="fl-winex__table">
        <thead>
          <tr>
            <th scope="col" className="fl-winex__team">Team</th>
            <th scope="col">Now</th>
            <th scope="col">Still to come</th>
            <th scope="col">Projected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([side, figures]) => (
            <tr key={side.key}>
              <th scope="row" className="fl-winex__team">
                <i style={{ background: side.palette[0] }} aria-hidden="true" />
                {side.isMine ? 'You' : side.initials}
              </th>
              <td>{formatPoints(figures.current)}</td>
              <td>{figures.remaining > 0 ? `+${formatPoints(figures.remaining)}` : '—'}</td>
              <td className="fl-winex__strong">{formatPoints(figures.expected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!explain.settled && paceMovers.length > 0 && (
        <div className="fl-winex__movers">
          <span className="fl-winex__movers-title">Ahead / behind target now</span>
          {paceMovers.map((mover) => (
            <span className="fl-winex__mover" key={`${mover.side.key}-${mover.playerId}`}>
              <span>
                <i style={{ background: mover.side.palette[0] }} aria-hidden="true" />
                {mover.playerName || 'Starter'}
              </span>
              <b className={mover.paceDelta >= 0 ? 'is-up' : 'is-down'}>
                {mover.paceDelta >= 0 ? '+' : '−'}{Math.abs(mover.paceDelta).toFixed(1)}
              </b>
            </span>
          ))}
        </div>
      )}
      {explain.settled ? (
        <p className="fl-winex__note">
          Every starter&rsquo;s game is over, so the result is decided — nothing left to project.
        </p>
      ) : explain.settlementPending ? (
        <p className="fl-winex__note">
          Every starter&rsquo;s game appears complete. The result remains projected until Sleeper confirms the final matchup totals.
        </p>
      ) : (
        <>
          <div className="fl-winex__figures">
            <span>
              <b>{explain.margin.toFixed(1)}</b>
              <span>Projected margin</span>
            </span>
            <span>
              <b>± {explain.swing.toFixed(1)}</b>
              <span>Typical swing left</span>
            </span>
            <span>
              <b>{explain.playersRemaining}</b>
              <span>{explain.playersRemaining === 1 ? 'Starter to play' : 'Starters to play'}</span>
            </span>
          </div>
          <p className="fl-winex__note">
            {leader.isMine ? 'You are' : `${leader.initials} is`} projected to finish{' '}
            {explain.margin.toFixed(1)} ahead, and the unplayed games can still move that by about{' '}
            {explain.swing.toFixed(1)} either way. The win % is how often that lead survives.
          </p>
        </>
      )}
    </div>
  );
}

export default function LiveHero({
  left,
  right,
  winProbA,
  winExplain = null,
  snapshot = null,
  filter = 'both',
  onFilter,
  onOpenPlayer,
}) {
  const [heroRef, portraitCapacity] = useHeroPortraitCapacity();
  // Hover and keyboard focus open it on pointer devices; tapping toggles it on
  // touch, where there is no hover to rely on. The last pointer type decides
  // which, so a mouse click doesn't immediately close what hover just opened.
  const [explainOpen, setExplainOpen] = useState(false);
  const pointerTypeRef = useRef('mouse');
  // Cut-outs are all-or-nothing across the hero: one face beside a bare
  // gradient reads as a half-loaded page, so both sides must resolve one.
  const portraits = useMemo(() => ({
    a: getHeroPortraits(left, portraitCapacity),
    b: getHeroPortraits(right, portraitCapacity),
  }), [left, portraitCapacity, right]);
  const faces = portraitCapacity > 0 && portraits.a.length && portraits.b.length
    ? 'cutout'
    : 'spotlight';
  if (!left || !right) return null;
  const probA = Math.min(100, Math.max(0, Number(snapshot?.p ?? winProbA ?? 50)));
  const activeExplain = snapshot?.explain ?? winExplain;
  const probabilityLabels = formatWinProbabilityPair(probA, {
    settled: Boolean(snapshot?.settled ?? activeExplain?.settled),
  });

  return (
    <div ref={heroRef} className={`fl-hero is-${faces}${explainOpen ? ' is-explaining' : ''}`}>
      <span className="fl-hero__half is-a" style={{ background: fantasyHeroGradient(left.palette[0], left.palette[1], 135) }} aria-hidden="true" />
      <span className="fl-hero__half is-b" style={{ background: fantasyHeroGradient(right.palette[0], right.palette[1], 225) }} aria-hidden="true" />
      <span className="fl-hero__scrim" aria-hidden="true" />
      <span className="fl-hero__seam" aria-hidden="true" />
      {faces === 'cutout' && (
        <>
          <CrossfadePortraits sideKey="a" portraits={portraits.a} />
          <CrossfadePortraits sideKey="b" portraits={portraits.b} />
        </>
      )}

      <div className="fl-hero__plate">
        <HeroSide
          side={left}
          snapshotTotal={snapshot?.a ?? null}
          snapshotFigures={snapshot?.explain?.a ?? null}
          dimmed={filter === 'b'}
          onToggle={() => onFilter?.(filter === 'a' ? 'both' : 'a')}
        />
        <div className="fl-hero__winwrap">
          <button
            type="button"
            className={`fl-hero__win${explainOpen ? ' is-open' : ''}`}
            aria-expanded={explainOpen}
            aria-describedby={explainOpen ? 'fl-winex' : undefined}
            aria-label={`Win probability: ${left.name} ${probabilityLabels.a}, ${right.name} ${probabilityLabels.b}. Show how this is worked out.`}
            onPointerDown={(event) => { pointerTypeRef.current = event.pointerType || 'mouse'; }}
            onClick={() => {
              // With a mouse, hover already governs; only touch and pen toggle.
              if (pointerTypeRef.current !== 'mouse') setExplainOpen((open) => !open);
            }}
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') setExplainOpen(true); }}
            onPointerLeave={(event) => { if (event.pointerType === 'mouse') setExplainOpen(false); }}
            // Touch fires focus before click, so an unguarded focus handler
            // would open the panel and let the tap close it again.
            onFocus={() => { if (pointerTypeRef.current === 'mouse') setExplainOpen(true); }}
            onBlur={() => setExplainOpen(false)}
            onKeyDown={(event) => { if (event.key === 'Escape') setExplainOpen(false); }}
          >
            <span className="fl-hero__win-label" aria-hidden="true">
              {snapshot ? 'Win % then' : 'Win probability'}
              {activeExplain && <i className="fl-hero__win-hint">?</i>}
            </span>
            <span className="fl-hero__win-row" aria-hidden="true">
              <span className="fl-hero__win-side">
                <i style={{ background: left.palette[0] }} />
                <em>{left.initials}</em>
                <b><ProbabilityValue label={probabilityLabels.a} /></b>
              </span>
              <span className="fl-hero__win-div" />
              <span className="fl-hero__win-side is-right">
                <b><ProbabilityValue label={probabilityLabels.b} /></b>
                <em>{right.initials}</em>
                <i style={{ background: right.palette[0] }} />
              </span>
            </span>
          </button>
          {explainOpen && activeExplain && (
            <WinExplainer left={left} right={right} explain={activeExplain} id="fl-winex" />
          )}
        </div>
        <HeroSide
          side={right}
          snapshotTotal={snapshot?.b ?? null}
          snapshotFigures={snapshot?.explain?.b ?? null}
          dimmed={filter === 'a'}
          onToggle={() => onFilter?.(filter === 'b' ? 'both' : 'b')}
        />
      </div>

      <div className="fl-hero__feats">
        <CrossfadeTopScorers side={left} faces={faces} onOpenPlayer={onOpenPlayer} />
        <CrossfadeTopScorers side={right} faces={faces} onOpenPlayer={onOpenPlayer} />
      </div>

      <div className="fl-hero__odds" aria-hidden="true">
        <i style={{ width: `${probA}%`, background: left.palette[0] }} />
        <i style={{ width: `${100 - probA}%`, background: right.palette[0] }} />
      </div>
    </div>
  );
}
