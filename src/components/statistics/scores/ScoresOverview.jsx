import { useEffect, useMemo, useRef, useState } from 'react';
import { buildWinProbabilityTimeline } from '../../../utils/winProbability.js';
import { getDriveNetYards, getPlayTrajectory, isFieldFlipped, teamLogo } from '../../../utils/nflPlays/fieldGeometry.js';
import { parsePlayNarrative } from '../../../utils/nflPlays/playNarrative.js';
import { lookupPlayerByName } from '../../../utils/nflPlays/playerNameIndex.js';
import { DriveField } from '../../nflPlays/DriveField.jsx';
import { PlayerAvatar } from '../../shared/PlayerAvatar.jsx';
import { detailCoverageMessage, driveMeta, drivePlayNote, nextSnapFor, playClockLabel, playSentence } from './scoresDetailFormat.js';

// The Overview dashboard: scoring, win probability, the drive in focus, and the
// leaders. Selecting a play or a drive in any section focuses it in the others;
// the drilldown owns that selection so the hero can offer "Back to live".

export function SectionHeading({ title, meta, action }) {
  return (
    <header className="scores-section-heading">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
      {action}
    </header>
  );
}

export function DetailUnavailable({ children }) {
  return <p className="scores-detail-unavailable">{children}</p>;
}

function playElapsedSeconds(play) {
  const period = Number(play?.period);
  const match = String(play?.time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!(period > 0) || !match) return null;
  return ((period - 1) * 900) + (900 - Math.min(900, (Number(match[1]) * 60) + Number(match[2])));
}

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function LineScore({ detail }) {
  if (!detail.quarterLabels.length || !detail.lineScore.away.length || !detail.lineScore.home.length) {
    return <DetailUnavailable>Quarter-by-quarter scoring is not included in this provider response.</DetailUnavailable>;
  }
  return (
    <div className="scores-line-score-shell">
      <table className="scores-line-score" aria-label="Score by quarter">
        <thead><tr><th scope="col">Team</th>{detail.quarterLabels.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {[['away', detail.away], ['home', detail.home]].map(([side, team]) => (
            <tr key={side}>
              <th scope="row"><img src={teamLogo(team.id)} alt="" />{team.id}</th>
              {detail.lineScore[side].map((score, index) => <td key={`${side}-${detail.quarterLabels[index]}`}>{score}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- win probability ---------- */

function GameWinProbability({ detail, plays, colors, selectedPlayId, onSelectPlay }) {
  const [frameRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const timeline = useMemo(() => buildWinProbabilityTimeline(plays, { gameStatus: detail.status }), [detail.status, plays]);
  const { complete, points } = timeline;

  // The plays that moved the needle most, kept in game order. The final point
  // of a finished game is the whistle settling the line at 0 or 100, not a play,
  // and swings closer than a marker's width would hide one another.
  const swings = useMemo(() => {
    const candidates = points
      .map((point, index) => ({ point, delta: index ? point.probability - points[index - 1].probability : 0 }))
      .filter((entry, index) => Math.abs(entry.delta) >= 0.05 && !(complete && index === points.length - 1))
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
    const picked = [];
    for (const entry of candidates) {
      if (picked.length === (complete ? 5 : 4)) break;
      if (picked.every((kept) => Math.abs(kept.point.x - entry.point.x) >= 2.5)) picked.push(entry);
    }
    return picked.sort((left, right) => left.point.x - right.point.x);
  }, [complete, points]);

  if (points.length < 3) return null;

  const W = Math.max(260, width || 0);
  const H = W >= 900 ? 300 : W <= 520 ? 200 : 240;
  const pad = { l: 40, r: 10, t: 8, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const sx = (x) => pad.l + (x / 100) * iw;
  const sy = (p) => pad.t + (1 - p) * ih;
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x).toFixed(1)},${sy(point.probability).toFixed(1)}`).join('');
  const last = points.at(-1);
  const area = `${line}L${sx(last.x).toFixed(1)},${sy(0.5)}L${sx(points[0].x).toFixed(1)},${sy(0.5)}Z`;
  const quarterXs = points.filter((point, index) => index && point.period !== points[index - 1].period).map((point) => sx(point.x));
  const maxPeriod = Math.max(4, ...points.map((point) => Number(point.period) || 0));
  const selected = selectedPlayId ? points.find((point) => point.play.id === selectedPlayId) : null;
  const live = detail.status === 'live';
  const { away, home } = detail;
  const shown = hover ?? null;

  const nearest = (clientX, target) => {
    const box = target.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * W;
    let best = null;
    for (const point of points) {
      const distance = Math.abs(sx(point.x) - x);
      if (!best || distance < best.distance) best = { point, distance };
    }
    return best?.point ?? null;
  };
  const describe = (point) => {
    const index = points.indexOf(point);
    const delta = index > 0 ? point.probability - points[index - 1].probability : 0;
    const favored = point.probability >= 0.5 ? home.id : away.id;
    const share = Math.round((point.probability >= 0.5 ? point.probability : 1 - point.probability) * 100);
    const moved = Math.round(Math.abs(delta) * 100);
    return {
      title: `${playClockLabel(point.play)} · ${favored} ${share}%${moved ? ` (${delta > 0 ? home.id : away.id} +${moved})` : ''}`,
      text: playSentence(point.play),
    };
  };
  const tip = shown ? describe(shown) : null;
  const tipX = shown ? sx(shown.x) : 0;

  return (
    <div className="scores-wp" ref={frameRef} style={{ '--scores-wp-away': colors.away, '--scores-wp-home': colors.home }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Win probability by play. ${home.id} above the midline, ${away.id} below.`}
        onPointerMove={(event) => setHover(nearest(event.clientX, event.currentTarget))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const point = nearest(event.clientX, event.currentTarget);
          if (point) onSelectPlay(point.play.id);
        }}
      >
        <defs>
          <clipPath id="scores-wp-top"><rect x={pad.l} y={pad.t} width={iw} height={ih / 2} /></clipPath>
          <clipPath id="scores-wp-bottom"><rect x={pad.l} y={sy(0.5)} width={iw} height={ih / 2} /></clipPath>
        </defs>
        {[0, 1].map((value) => <line key={value} className="scores-wp-edge" x1={pad.l} x2={pad.l + iw} y1={sy(value)} y2={sy(value)} />)}
        <line className="scores-wp-mid" x1={pad.l} x2={pad.l + iw} y1={sy(0.5)} y2={sy(0.5)} />
        <text className="scores-wp-axis is-home" x={pad.l - 8} y={sy(1) + 4} textAnchor="end">{home.id}</text>
        <text className="scores-wp-axis" x={pad.l - 8} y={sy(0.5) + 4} textAnchor="end">50%</text>
        <text className="scores-wp-axis is-away" x={pad.l - 8} y={sy(0) + 4} textAnchor="end">{away.id}</text>
        {quarterXs.map((x) => <line key={x} className="scores-wp-quarter" x1={x} x2={x} y1={pad.t} y2={pad.t + ih} />)}
        {Array.from({ length: maxPeriod }, (_, index) => (
          <text key={index} className="scores-wp-axis" x={pad.l + ((index + 0.5) / maxPeriod) * iw} y={H - 6} textAnchor="middle">
            {index < 4 ? `Q${index + 1}` : 'OT'}
          </text>
        ))}
        <path className="scores-wp-fill is-home" d={area} clipPath="url(#scores-wp-top)" />
        <path className="scores-wp-fill is-away" d={area} clipPath="url(#scores-wp-bottom)" />
        <path className="scores-wp-line" d={line} />
        {swings.map(({ point, delta }, index) => {
          const cx = sx(point.x);
          const cy = sy(point.probability);
          const label = `${complete ? `Swing ${index + 1}: ` : ''}${describe(point).title}. ${playSentence(point.play)}`;
          return (
            <g
              key={point.play.id}
              className={`scores-wp-swing ${delta > 0 ? 'is-home' : 'is-away'}${complete ? ' is-numbered' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={(event) => { event.stopPropagation(); onSelectPlay(point.play.id); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPlay(point.play.id); }
              }}
            >
              {complete ? (
                <>
                  <rect x={cx - 9} y={cy - 9} width="18" height="18" />
                  <text x={cx} y={cy + 4} textAnchor="middle">{index + 1}</text>
                </>
              ) : <rect x={cx - 4.5} y={cy - 4.5} width="9" height="9" />}
            </g>
          );
        })}
        {selected && (
          <g className="scores-wp-selected">
            <line x1={sx(selected.x)} x2={sx(selected.x)} y1={pad.t} y2={pad.t + ih} />
            <circle cx={sx(selected.x)} cy={sy(selected.probability)} r="5.5" />
          </g>
        )}
        {live && <circle className="scores-wp-live" cx={sx(last.x)} cy={sy(last.probability)} r="4.5" />}
        {shown && (
          <g className="scores-wp-hover" aria-hidden="true">
            <line x1={tipX} x2={tipX} y1={pad.t} y2={pad.t + ih} />
            <circle cx={tipX} cy={sy(shown.probability)} r="4" />
          </g>
        )}
      </svg>
      {tip && (
        <div className="scores-wp-tip" style={{ left: tipX + 264 > W ? Math.max(0, tipX - 264) : tipX + 14 }} aria-hidden="true">
          <b>{tip.title}</b>
          <span>{tip.text}</span>
        </div>
      )}
    </div>
  );
}

function winProbabilityMeta(detail, plays) {
  const { points, complete } = buildWinProbabilityTimeline(plays, { gameStatus: detail.status });
  const last = points.at(-1);
  if (!last) return null;
  const favored = last.probability >= 0.5 ? detail.home.id : detail.away.id;
  const share = Math.round((last.probability >= 0.5 ? last.probability : 1 - last.probability) * 100);
  return `${complete ? 'Final' : 'Now'} · ${favored} ${share}%${complete ? ' · Numbered squares are the biggest swings, in game order' : ''}`;
}

/* ---------- scoring ---------- */

function scoreLabel(play, detail) {
  if (play.awayScore == null || play.homeScore == null) return play.score ?? '';
  return `${detail.away.id} ${play.awayScore} – ${detail.home.id} ${play.homeScore}`;
}

function scoreKind(play) {
  const narrative = parsePlayNarrative(play);
  if (narrative.playKind === 'field-goal') return 'FG';
  if (narrative.playKind === 'touchdown') return 'TD';
  return /safety/i.test(play.typeSlug ?? play.description ?? '') ? 'SAF' : 'TD';
}

function ScoringTimeline({ detail, scoringPlays, selectedPlayId, onSelectPlay }) {
  const [frameRef, width] = useElementWidth();
  const timed = scoringPlays.map((play) => ({ play, elapsed: playElapsedSeconds(play) })).filter((entry) => entry.elapsed != null);
  if (!timed.length) return null;
  const maxPeriod = Math.max(4, ...scoringPlays.map((play) => Number(play.period) || 0));
  const duration = maxPeriod * 900;
  const W = Math.max(260, width || 0);
  const H = 92;
  const mid = 44;
  const sx = (seconds) => 8 + (seconds / duration) * (W - 16);
  return (
    <div className="scores-scoring-timeline" ref={frameRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scoring timeline. ${detail.away.id} scores above the line, ${detail.home.id} below.`}>
        <line className="scores-timeline-axis" x1="8" x2={W - 8} y1={mid} y2={mid} />
        {Array.from({ length: maxPeriod - 1 }, (_, index) => {
          const x = sx((index + 1) * 900);
          return <line key={x} className="scores-wp-quarter" x1={x} x2={x} y1="4" y2={H - 18} />;
        })}
        {Array.from({ length: maxPeriod }, (_, index) => (
          <text key={index} className="scores-wp-axis" x={sx((index + 0.5) * 900)} y={H - 4} textAnchor="middle">{index < 4 ? `Q${index + 1}` : 'OT'}</text>
        ))}
        {timed.map(({ play, elapsed }) => {
          const awaySide = play.team === detail.away.id;
          const x = sx(elapsed);
          const kind = scoreKind(play);
          const y = awaySide ? mid - 26 : mid + 8;
          return (
            <g
              key={play.id}
              className={`scores-timeline-mark ${awaySide ? 'is-away' : 'is-home'}${selectedPlayId === play.id ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${playClockLabel(play)}, ${play.team} ${kind === 'FG' ? 'field goal' : kind === 'SAF' ? 'safety' : 'touchdown'}: ${playSentence(play)}`}
              onClick={() => onSelectPlay(play.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPlay(play.id); }
              }}
            >
              <line x1={x} x2={x} y1={mid} y2={awaySide ? y + 18 : y} />
              <rect x={x - 14} y={y} width="28" height="18" />
              <text x={x} y={y + 13} textAnchor="middle">{kind}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GameScoring({ detail, scoringPlays, selectedPlayId, onSelectPlay }) {
  return (
    <section className="scores-overview-section" aria-labelledby="scores-overview-scoring">
      <SectionHeading title={<span id="scores-overview-scoring">Scoring</span>} />
      <LineScore detail={detail} />
      {scoringPlays.length > 0 && (
        <>
          <ScoringTimeline detail={detail} scoringPlays={scoringPlays} selectedPlayId={selectedPlayId} onSelectPlay={onSelectPlay} />
          <ol className="scores-scoring-list">
            {scoringPlays.map((play) => (
              <li key={play.id}>
                <button type="button" aria-pressed={selectedPlayId === play.id} onClick={() => onSelectPlay(play.id)}>
                  <time>{playClockLabel(play)}</time>
                  <img src={teamLogo(play.team)} alt="" />
                  <span>{playSentence(play)}</span>
                  <b>{scoreLabel(play, detail)}</b>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      {!scoringPlays.length && detail.scoring.length > 0 && (
        <ol className="scores-scoring-list">
          {detail.scoring.map((play) => (
            <li key={`${play.quarter}-${play.time}-${play.title}`}>
              <div>
                <time>{play.quarter} {play.time}</time>
                <img src={teamLogo(play.team)} alt="" />
                <span>{play.title}</span>
                <b>{play.score}</b>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- drive in focus ---------- */

const SHORT_RESULT = [
  [/touchdown/i, 'TD'], [/field goal/i, 'FG'], [/punt/i, 'Punt'], [/interception/i, 'INT'],
  [/fumble/i, 'Fumble'], [/downs/i, 'Downs'], [/safety/i, 'Safety'], [/half|game|end/i, 'End'],
];
const shortResult = (result) => SHORT_RESULT.find(([pattern]) => pattern.test(result ?? ''))?.[1] ?? (result || '—');

/**
 * The drive in focus on one field — each play's lane with its down and a short
 * note beside it, the next snap while the drive is live — and a picker for
 * every drive. Shared by Overview and Play-by-Play.
 */
export function DrivePanel({ detail, drives, shownDriveId, liveDriveId, participants, themes, onSelectDrive }) {
  const drive = drives.find((entry) => entry.id === shownDriveId) ?? drives.at(-1);
  const stripRef = useRef(null);
  useEffect(() => {
    // Scroll only the strip sideways; scrollIntoView would also scroll the
    // page down to the panel whenever the tab mounts.
    const strip = stripRef.current;
    const chip = strip?.querySelector('[aria-pressed="true"]');
    if (!strip || !chip) return;
    const stripRect = strip.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    if (chipRect.left < stripRect.left) strip.scrollLeft += chipRect.left - stripRect.left;
    else if (chipRect.right > stripRect.right) strip.scrollLeft += chipRect.right - stripRect.right;
  }, [drive?.id]);
  if (!drive) return null;
  const attacking = drive.team === detail.home.id ? themes.home : themes.away;
  const isLiveDrive = drive.id === liveDriveId;
  const context = { homeTeam: detail.home.id, awayTeam: detail.away.id };
  const nextSnap = isLiveDrive ? nextSnapFor(drive, (play) => getPlayTrajectory(play, context)) : null;
  const headingId = `scores-drive-${drive.id}`;
  return (
    <section className="scores-overview-section scores-drive-panel" aria-labelledby={headingId}>
      <SectionHeading
        title={<span id={headingId}>{isLiveDrive ? 'Current drive' : 'Drive'}</span>}
        meta={nextSnap ? (
          <span className="scores-drive-key">
            <span><i className="is-los" aria-hidden="true" />Line of scrimmage</span>
            {nextSnap.firstDown != null && <span><i className="is-togain" aria-hidden="true" />First down</span>}
          </span>
        ) : null}
      />
      <div className="scores-overview-drive-head">
        <img src={teamLogo(drive.team)} alt="" />
        <strong>{drive.team} · {isLiveDrive ? 'In progress' : drive.result}</strong>
        <span>{driveMeta(drive)}</span>
      </div>
      <DriveField
        key={drive.id}
        plays={drive.plays}
        drive={drive}
        homeTeam={detail.home.id}
        awayTeam={detail.away.id}
        awayTheme={themes.away}
        homeTheme={themes.home}
        barColor={attacking?.accentColor ?? attacking?.color ?? 'var(--color-accent)'}
        flipped={isFieldFlipped(drive.plays[0]?.period)}
        participants={participants}
        playLabel={(play) => `${play.down} · ${play.description}`}
        laneNote={drivePlayNote}
        nextSnap={nextSnap}
      />
      <div className="scores-drive-strip" ref={stripRef} role="group" aria-label="Choose a drive">
        {drives.map((entry) => (
          <button key={entry.id} type="button" aria-pressed={entry.id === drive.id} onClick={() => onSelectDrive(entry.id)}>
            <img src={teamLogo(entry.team)} alt="" />
            <span>{playClockLabel(entry.plays[0]).split(' ')[0]}</span>
            {entry.id === liveDriveId ? <b className="is-now">Now</b> : <b>{shortResult(entry.result)}</b>}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- leaders ---------- */

const num = (value) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const nonzero = (value) => num(value) !== 0;

const LEADER_UNITS = [
  ['Offense', [
    { label: 'Passing', group: 'passing', column: 1, line: (v) => `${v[0]} · ${v[1]} yds · ${v[2]} TD${nonzero(v[3]) ? ` · ${v[3]} INT` : ''}` },
    { label: 'Rushing', group: 'rushing', column: 1, line: (v) => `${v[0]} car · ${v[1]} yds${nonzero(v[3]) ? ` · ${v[3]} TD` : ''}` },
    { label: 'Receiving', group: 'receiving', column: 2, line: (v) => `${v[0]} rec · ${v[2]} yds${nonzero(v[4]) ? ` · ${v[4]} TD` : ''}` },
  ]],
  ['Defense', [
    { label: 'Tackles', group: 'defense', column: 0, line: (v) => `${v[0]} tkl · ${v[1]} solo${nonzero(v[3]) ? ` · ${v[3]} TFL` : ''}` },
    { label: 'Sacks', group: 'defense', column: 2, line: (v) => `${v[2]} sack${num(v[2]) === 1 ? '' : 's'} · ${v[3]} TFL · ${v[0]} tkl` },
    { label: 'Passes defended', group: 'defense', column: 4, line: (v) => `${v[4]} PD · ${v[0]} tkl` },
  ]],
];

function LeaderSide({ row, category, align, advantage, participants, onOpen }) {
  if (!row) {
    return <div className={`scores-leader-side is-${align} is-empty`}><span>No {category.label.toLowerCase()} yet</span></div>;
  }
  const participant = participants ? lookupPlayerByName(participants, row.player, { team: row.team }) : null;
  return (
    <button type="button" className={`scores-leader-side is-${align}`} onClick={() => onOpen(category.group, row.key ?? null)}>
      <PlayerAvatar
        player={participant ? { imageUrl: participant.imageUrl, espnId: participant.espnId } : {}}
        name={row.player}
        size={40}
        className="scores-player-face"
      />
      <span className="scores-leader-name">
        <strong>{row.player}</strong>
        <small className={advantage ? 'is-advantage' : ''}>{category.line(row.values)}</small>
      </span>
    </button>
  );
}

function GameLeaders({ detail, participants, colors, onOpenPlayers }) {
  const groups = Object.fromEntries((detail.playerGroups ?? []).map((group) => [group.id, group]));
  const best = (teamId, category) => (groups[category.group]?.rows ?? [])
    .filter((row) => row.team === teamId && num(row.values[category.column]) > 0)
    .sort((left, right) => num(right.values[category.column]) - num(left.values[category.column]))[0] ?? null;
  const units = LEADER_UNITS
    .map(([unit, categories]) => [unit, categories.filter((category) => groups[category.group])])
    .filter(([, categories]) => categories.length);

  return (
    <section className="scores-overview-section" aria-labelledby="scores-overview-leaders">
      <SectionHeading title={<span id="scores-overview-leaders">Leaders</span>} meta={`${detail.away.id} left · ${detail.home.id} right`} />
      {units.length ? (
        <div className="scores-leader-units">
          {units.map(([unit, categories]) => (
            <section key={unit}>
              <h3>{unit}</h3>
              {categories.map((category) => {
                const away = best(detail.away.id, category);
                const home = best(detail.home.id, category);
                const awayValue = away ? num(away.values[category.column]) : 0;
                const homeValue = home ? num(home.values[category.column]) : 0;
                const awayShare = awayValue + homeValue > 0 ? (awayValue / (awayValue + homeValue)) * 100 : 50;
                return (
                  <div key={category.label} className="scores-leader-row">
                    <LeaderSide row={away} category={category} align="start" advantage={awayValue > homeValue} participants={participants} onOpen={onOpenPlayers} />
                    <span className="scores-leader-category">{category.label}</span>
                    <LeaderSide row={home} category={category} align="end" advantage={homeValue > awayValue} participants={participants} onOpen={onOpenPlayers} />
                    <span className="scores-leader-rail" aria-hidden="true">
                      <span style={{ width: `${awayShare}%`, background: colors.away }} />
                      <span style={{ width: `${100 - awayShare}%`, background: colors.home }} />
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      ) : detail.leaders.length ? (
        <div className="scores-detail-leaders">
          {detail.leaders.map((leader) => (
            <article key={leader.label}>
              <span>{leader.label}</span>
              <div><img src={teamLogo(detail.away.id)} alt="" /><strong>{leader.away}</strong></div>
              <div><img src={teamLogo(detail.home.id)} alt="" /><strong>{leader.home}</strong></div>
            </article>
          ))}
        </div>
      ) : <DetailUnavailable>{detailCoverageMessage(detail, 'Player leaders are not included in this score feed.')}</DetailUnavailable>}
    </section>
  );
}

/* ---------- overview ---------- */

export default function ScoresOverview({
  detail, awayTheme, homeTheme, participants, selection, onSelectPlay, onSelectDrive, onOpenPlayers,
}) {
  const homeId = detail.home.id;
  const awayId = detail.away.id;
  const drives = useMemo(
    () => detail.drives.map((drive) => ({ ...drive, netYards: getDriveNetYards(drive.plays, { homeTeam: homeId, awayTeam: awayId }) })),
    [detail.drives, homeId, awayId],
  );
  const plays = useMemo(() => detail.drives.flatMap((drive) => drive.plays), [detail.drives]);
  const scoringPlays = useMemo(() => plays.filter((play) => play.scoring && play.id), [plays]);
  const colors = {
    away: awayTheme?.borderColor ?? awayTheme?.color ?? 'var(--color-label-secondary)',
    home: homeTheme?.borderColor ?? homeTheme?.color ?? 'var(--color-label)',
  };
  const liveDriveId = detail.status === 'live' ? drives.at(-1)?.id ?? null : null;
  const selectedDriveId = selection.playId
    ? drives.find((drive) => drive.plays.some((play) => play.id === selection.playId))?.id ?? null
    : selection.driveId;
  const shownDriveId = selectedDriveId ?? drives.at(-1)?.id ?? null;
  const hasWinProbability = plays.some((play) => play.homeWinProbability != null);

  return (
    <div className="scores-detail-overview">
      <GameScoring detail={detail} scoringPlays={scoringPlays} selectedPlayId={selection.playId} onSelectPlay={onSelectPlay} />

      {hasWinProbability && (
        <section className="scores-overview-section" aria-labelledby="scores-overview-wp">
          <SectionHeading title={<span id="scores-overview-wp">Win probability</span>} meta={winProbabilityMeta(detail, plays)} />
          <GameWinProbability detail={detail} plays={plays} colors={colors} selectedPlayId={selection.playId} onSelectPlay={onSelectPlay} />
        </section>
      )}

      {drives.length > 0 && (
        <DrivePanel
          detail={detail}
          drives={drives}
          shownDriveId={shownDriveId}
          liveDriveId={liveDriveId}
          participants={participants}
          themes={{ away: awayTheme, home: homeTheme }}
          onSelectDrive={onSelectDrive}
        />
      )}

      <GameLeaders detail={detail} participants={participants} colors={colors} onOpenPlayers={onOpenPlayers} />
    </div>
  );
}
