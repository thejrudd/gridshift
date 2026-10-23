import { useMemo, useRef, useState } from 'react';
import { gameSecond } from '../../../utils/playerSeason/playerSeasonGames.js';
import {
  defAgg,
  fmt,
  gameWon,
  isInterception,
  isPressure,
  isTouchdown,
  kickAgg,
  matchupLabel,
  opponentContext,
  ordinal,
  passerRating,
  POOL_RULES,
  recAgg,
  runAgg,
} from '../../../utils/playerSeason/dashboardModel.js';
import { RankStrips, SectionHead, Segmented, TeamMark } from './DashboardParts.jsx';
import { tipAttrs, useDashboardTip, useMeasuredWidth } from './dashboardUi.js';

const lineRating = (line) => passerRating(line.passing_completions ?? 0, line.passing_attempts ?? 0, line.passing_yards ?? 0, line.passing_touchdowns ?? 0, line.passing_interceptions ?? 0);

/* ---------- Per-group game metric vs the opponent ---------- */

// For each group: the one number a game card gauges, and the matching opponent figure.
const GAME_GAUGE = {
  QB: { label: 'rating', oppKey: 'rate', oppLabel: 'allowed', range: [40, 150], dp: 1, value: (game) => lineRating(game.line) },
  RB: { label: 'yds/carry', oppKey: 'ypc', oppLabel: 'allowed to RBs', range: [0, 8], dp: 1, value: (game, plays) => runAgg(plays).ypc },
  WR: { label: 'yds/target', oppKey: 'ypt', oppLabel: 'allowed to WRs', range: [0, 14], dp: 1, value: (game, plays) => recAgg(plays).ypt },
  TE: { label: 'yds/target', oppKey: 'ypt', oppLabel: 'allowed to TEs', range: [0, 14], dp: 1, value: (game, plays) => recAgg(plays).ypt },
};

// Scatter: this game's number (y) against the opponent's usual number (x).
const SCATTER = {
  QB: { title: 'Rating vs. defense', x: 'rate', xLabel: "Defense's rating allowed (other games)", xShort: 'Defense allows', yLabel: 'Passer rating', diagonal: true, value: (game) => lineRating(game.line), dp: 1, better: 'Better than allowed' },
  RB: { title: 'Yards per carry vs. defense', x: 'ypc', xLabel: 'Defense allows to RBs, yards per carry (other games)', xShort: 'Defense allows', yLabel: 'Yards per carry', diagonal: true, value: (game, plays) => runAgg(plays).ypc, dp: 1, better: 'Better than allowed' },
  WR: { title: 'Yards per target vs. defense', x: 'ypt', xLabel: 'Defense allows to WRs, yards per target (other games)', xShort: 'Defense allows', yLabel: 'Yards per target', diagonal: true, value: (game, plays) => recAgg(plays).ypt, dp: 1, better: 'Better than allowed' },
  TE: { title: 'Yards per target vs. defense', x: 'ypt', xLabel: 'Defense allows to TEs, yards per target (other games)', xShort: 'Defense allows', yLabel: 'Yards per target', diagonal: true, value: (game, plays) => recAgg(plays).ypt, dp: 1, better: 'Better than allowed' },
  DL: { title: 'Pressures vs. offensive line', x: 'skA', xLabel: "Offense's sacks allowed per game (other games)", xShort: 'Sacks allowed / game', yLabel: 'Pressures', value: (game, plays) => plays.filter(isPressure).length, dp: 0 },
  LB: { title: 'Tackles vs. offense', x: 'ypc', xLabel: "Offense's RB yards per carry (other games)", xShort: 'Offense RB yds/carry', yLabel: 'Tackles', value: (game) => game.line.total_tackles ?? 0, dp: 0 },
  DB: { title: 'Plays on the ball vs. passing offense', x: 'passYds', xLabel: "Offense's passing yards per game (other games)", xShort: 'Offense pass yds/game', yLabel: 'Passes defended + INT', value: (game) => (game.line.passes_defended ?? 0) + (game.line.defensive_interceptions ?? 0), dp: 0 },
};

/* ---------- Stat rail ---------- */

function railTiles(group, box, plays) {
  switch (group) {
    case 'QB': return [
      ['Passer rating', 'rate', `${box.passing_completions ?? 0}/${box.passing_attempts ?? 0} · ${box.passing_touchdowns ?? 0} TD · ${box.passing_interceptions ?? 0} INT`],
      ['Yards / attempt', 'ya', `${fmt(box.passing_yards)} passing yards`],
      ['Completion', 'cmp', `${box.passing_completions ?? 0} of ${box.passing_attempts ?? 0}`],
      ['Rush yds / game', 'rypg', `${box.rushing_attempts ?? 0} carries · ${fmt(box.rushing_yards)} yds · ${box.rushing_touchdowns ?? 0} TD`],
      ['Total TD', 'totd', `${box.passing_touchdowns ?? 0} passing · ${box.rushing_touchdowns ?? 0} rushing`],
    ];
    case 'RB': return [
      ['Rush yds / game', 'rypg', `${box.rushing_attempts ?? 0} carries · ${fmt(box.rushing_yards)} yds · ${box.rushing_touchdowns ?? 0} TD`],
      ['Yards / carry', 'ypc', `${runAgg(plays).big} runs of 10+`],
      ['Carries / game', 'cpg', `${box.rushing_attempts ?? 0} carries`],
      ['Scrimmage / game', 'scrim', `${fmt((box.rushing_yards ?? 0) + (box.receiving_yards ?? 0))} rushing + receiving`],
      ['Total TD', 'totd', `${box.rushing_touchdowns ?? 0} rushing · ${box.receiving_touchdowns ?? 0} receiving`],
    ];
    case 'WR':
    case 'TE': return [
      ['Rec yds / game', 'rcypg', `${box.receptions ?? 0} catches · ${fmt(box.receiving_yards)} yds`],
      ['Targets / game', 'tgpg', `${box.receiving_targets ?? 0} targets`],
      ['Catch rate', 'catch', `${box.receptions ?? 0} of ${box.receiving_targets ?? 0}`],
      ['Yards / target', 'ypt', `${recAgg(plays).fd} first downs charted`],
      ['Receiving TD', 'rtd', `${box.receiving_touchdowns ?? 0} touchdowns`],
    ];
    case 'K': {
      const kicks = kickAgg(plays);
      return [
        ['Field goal rate', 'fgp', `${box.field_goals_made ?? kicks.fgm} of ${box.field_goal_attempts ?? kicks.fga}`],
        ['Field goals', 'fgm', `long ${kicks.long || '–'}`],
        ['Made from 50+', 'fg50', 'season'],
        ['Extra point rate', 'xpp', `${kicks.xpm} of ${kicks.xpa} charted`],
        ['Points / game', 'ppg', 'field goals and extra points'],
      ];
    }
    case 'DL': return [
      ['Sacks', 'sk', `${box.qb_hits ?? 0} QB hits`],
      ['QB hits', 'hit', `${defAgg(plays).prs} pressures charted`],
      ['Pressures / 100 snaps', 'prs100', 'sacks + QB hits'],
      ['Tackles for loss', 'tfl', `${box.total_tackles ?? 0} tackles · ${box.solo_tackles ?? 0} solo`],
      ['Snap share', 'share', 'of team defensive snaps'],
    ];
    case 'LB': return [
      ['Tackles / game', 'tkl', `${box.total_tackles ?? 0} tackles · ${box.solo_tackles ?? 0} solo`],
      ['Tackles for loss', 'tfl', `${box.tackles_for_loss ?? 0} this season`],
      ['Sacks', 'sk', `${box.qb_hits ?? 0} QB hits`],
      ['Passes defended', 'pd', `${box.defensive_interceptions ?? 0} interceptions`],
      ['Snap share', 'share', 'of team defensive snaps'],
    ];
    case 'DB': return [
      ['Passes defended', 'pd', `${box.defensive_interceptions ?? 0} interceptions`],
      ['Interceptions', 'int', 'season'],
      ['Tackles / game', 'tkl', `${box.total_tackles ?? 0} tackles · ${box.solo_tackles ?? 0} solo`],
      ['Tackles for loss', 'tfl', `${box.tackles_for_loss ?? 0} this season`],
      ['Snap share', 'share', 'of team defensive snaps'],
    ];
    default: return [];
  }
}

export function StatRail({ group, box, plays, ranks, playerId }) {
  const tiles = railTiles(group, box, plays);
  if (!tiles.length) return null;
  const list = ranks?.isQualified ? ranks.qualified : ranks?.all;
  return (
    <div className="player-dash-rail">
      {tiles.map(([label, key, detail]) => {
        const rank = list?.find((entry) => entry.key === key);
        const me = rank?.vals.find((entry) => entry.id === String(playerId));
        return (
          <div key={key} className="player-dash-kpi">
            <span className="player-dash-eyebrow">{label}</span>
            <span className="player-dash-kpi__value">{me ? `${fmt(me.v, rank.dp)}${rank.suffix}` : '–'}</span>
            <span className="player-dash-kpi__rank">
              {me ? <><b>{ordinal(me.r)}</b> of {rank.vals.length}</> : 'Not ranked yet'}
            </span>
            <span className="player-dash-kpi__detail">{detail}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Win probability spark ---------- */

const SPARK_W = 300;
const SPARK_H = 64;

function WinSpark({ game, team, marks, onOpen }) {
  const tip = useDashboardTip();
  const lineRef = useRef(null);
  const lastTapRef = useRef(null);
  const overtime = game.wp.some(([second]) => second > 3600);
  const maxSecond = overtime ? 4200 : 3600;
  const x = (second) => (second / maxSecond) * SPARK_W;
  const y = (value) => 4 + (1 - value) * (SPARK_H - 8);
  const points = game.wp.map(([second, value]) => ({ second, value, x: x(second), y: y(value) }));
  if (points.length < 2) return <div className="player-dash-spark is-empty">No win probability for this game.</div>;
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join('');
  const area = `${path}L${points.at(-1).x.toFixed(1)},${y(0.5)}L${points[0].x.toFixed(1)},${y(0.5)}Z`;

  const pick = (clientX, el) => {
    const rect = el.getBoundingClientRect();
    const target = ((clientX - rect.left) / rect.width) * SPARK_W;
    return points.reduce((best, point) => (Math.abs(point.x - target) < Math.abs(best.x - target) ? point : best), points[0]);
  };
  const reading = (point) => {
    const minute = point.second > 3600 ? 'OT' : `Q${Math.min(4, Math.floor(point.second / 900) + 1)}`;
    return [`Week ${game.week} · ${matchupLabel(team, game)} · ${minute}`, `${team} win chance ${Math.round(point.value * 100)}%`];
  };
  const showLine = (point) => {
    const line = lineRef.current;
    if (!line) return;
    line.setAttribute('x1', point.x);
    line.setAttribute('x2', point.x);
    line.setAttribute('visibility', 'visible');
  };
  const hideLine = () => lineRef.current?.setAttribute('visibility', 'hidden');

  return (
    <div
      className="player-dash-spark"
      role="button"
      tabIndex={0}
      aria-label={`${team} win chance through week ${game.week}. Open the game's play-by-play`}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const point = pick(event.clientX, event.currentTarget);
        const [title, body] = reading(point);
        tip.show(title, `${body}\nSelect to open the play-by-play`, event.clientX, event.clientY);
        showLine(point);
      }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') { tip.hide(); hideLine(); } }}
      onClick={(event) => {
        if (tip.isTouch() && event.detail) {
          const sameSpot = tip.pinnedElement() === event.currentTarget && Math.abs(event.clientX - (lastTapRef.current ?? -999)) < 24;
          if (!sameSpot) {
            lastTapRef.current = event.clientX;
            const point = pick(event.clientX, event.currentTarget);
            const [title, body] = reading(point);
            tip.pin(event.currentTarget, title, `${body}\nTap again to open the play-by-play`, event.clientX, event.clientY, hideLine);
            showLine(point);
            return;
          }
        }
        tip.hide();
        onOpen();
      }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}
    >
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2={SPARK_W} y1={y(0.5)} y2={y(0.5)} className="player-dash-spark__mid" vectorEffect="non-scaling-stroke" />
        {[900, 1800, 2700].map((second) => (
          <line key={second} x1={x(second)} x2={x(second)} y1="0" y2={SPARK_H} className="player-dash-spark__quarter" vectorEffect="non-scaling-stroke" />
        ))}
        <defs>
          <clipPath id={`wp-top-${game.id}`}><rect width={SPARK_W} height={y(0.5)} /></clipPath>
          <clipPath id={`wp-bottom-${game.id}`}><rect y={y(0.5)} width={SPARK_W} height={SPARK_H} /></clipPath>
        </defs>
        <path d={area} className="player-dash-spark__ahead" clipPath={`url(#wp-top-${game.id})`} />
        <path d={area} className="player-dash-spark__behind" clipPath={`url(#wp-bottom-${game.id})`} />
        <path d={path} className="player-dash-spark__line" vectorEffect="non-scaling-stroke" />
        {marks.map((mark) => {
          const mx = x(gameSecond(mark.q, mark.c));
          const my = y(mark.wp ?? 0.5);
          return mark.good
            ? <circle key={mark.key} cx={mx} cy={my} r="4.2" className="player-dash-spark__good" />
            : <path key={mark.key} d={`M${mx - 3.4},${my - 3.4}L${mx + 3.4},${my + 3.4}M${mx + 3.4},${my - 3.4}L${mx - 3.4},${my + 3.4}`} className="player-dash-spark__bad" />;
        })}
        <line ref={lineRef} x1="0" x2="0" y1="0" y2={SPARK_H} className="player-dash-spark__cursor" vectorEffect="non-scaling-stroke" visibility="hidden" />
      </svg>
      <div className="player-dash-spark__quarters" aria-hidden="true"><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></div>
    </div>
  );
}

/* ---------- Game cards ---------- */

function gameHeadline(group, game, plays) {
  const l = game.line;
  switch (group) {
    case 'QB': return [`${l.passing_completions ?? 0}/${l.passing_attempts ?? 0} · ${l.passing_yards ?? 0} yds`, `${(l.passing_touchdowns ?? 0) + (l.rushing_touchdowns ?? 0)} TD · ${l.passing_interceptions ?? 0} INT`, `${l.rushing_attempts ?? 0}-${l.rushing_yards ?? 0} rushing · ${l.sacks ?? 0} sacked`];
    case 'RB': return [`${l.rushing_attempts ?? 0}-${l.rushing_yards ?? 0} rushing`, `${(l.rushing_touchdowns ?? 0) + (l.receiving_touchdowns ?? 0)} TD`, `${l.receptions ?? 0}/${l.receiving_targets ?? 0} · ${l.receiving_yards ?? 0} receiving yds`];
    case 'WR':
    case 'TE': return [`${l.receptions ?? 0}/${l.receiving_targets ?? 0} · ${l.receiving_yards ?? 0} yds`, `${l.receiving_touchdowns ?? 0} TD`, `${game.teamPassAtt ? Math.round((100 * (l.receiving_targets ?? 0)) / game.teamPassAtt) : 0}% of team targets`];
    case 'K': {
      const kicks = kickAgg(plays);
      return [`${l.field_goals_made ?? kicks.fgm}/${l.field_goal_attempts ?? kicks.fga} FG`, kicks.long ? `long ${kicks.long}` : '', `${kicks.xpm}/${kicks.xpa} extra points`];
    }
    default: {
      const agg = defAgg(plays);
      return [`${l.total_tackles ?? agg.tkl} tackles · ${fmt(l.defensive_sacks ?? agg.sk, 1)} sacks`, `${l.qb_hits ?? agg.hit} QB hits`, `${agg.prs} pressures on ${game.oppDropbacks.length} dropbacks`];
    }
  }
}

function gameMarks(group, plays) {
  return plays.flatMap((play) => {
    const key = `${play.g.id}-${play.i}`;
    if (play.cr) {
      if (play.cr.sk || play.cr.int || play.cr.ff) return [{ key, q: play.q, c: play.c, wp: play.wp, good: true }];
      return [];
    }
    if (isTouchdown(play) && play.r !== 'kicker') return [{ key, q: play.q, c: play.c, wp: play.wp, good: true }];
    if (isInterception(play) && play.r === 'passer') return [{ key, q: play.q, c: play.c, wp: play.wp, good: false }];
    if (play.fs?.fum_lost) return [{ key, q: play.q, c: play.c, wp: play.wp, good: false }];
    return [];
  });
}

function Gauge({ group, game, plays, opponent, oppRank }) {
  const spec = GAME_GAUGE[group];
  if (!spec) return null;
  const value = spec.value(game, plays);
  if (value == null) return null;
  const allowed = opponent?.[spec.oppKey];
  const [lo, hi] = spec.range;
  const position = (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  const ahead = allowed == null || value >= allowed;
  return (
    <div className="player-dash-gauge">
      <div className="player-dash-gauge__top">
        <b>{fmt(value, spec.dp)}</b>
        <span>{spec.label}{allowed != null ? ` · ${game.opp} ${spec.oppLabel} ${fmt(allowed, spec.dp)}` : ''}</span>
      </div>
      <div className="player-dash-gauge__track">
        {allowed != null && (
          <>
            <span className={`player-dash-gauge__span ${ahead ? 'is-ahead' : 'is-behind'}`} style={{ left: `${position(Math.min(value, allowed))}%`, width: `${Math.abs(position(value) - position(allowed))}%` }} />
            <span className="player-dash-gauge__dot is-opp" style={{ left: `${position(allowed)}%` }} {...tipAttrs(`${game.opp} defense`, `${spec.oppLabel[0].toUpperCase()}${spec.oppLabel.slice(1)} in its other ${opponent.g} games: ${fmt(allowed, spec.dp)}${oppRank ? ` (${ordinal(oppRank)} easiest)` : ''}`)} />
          </>
        )}
        <span className="player-dash-gauge__dot is-me" style={{ left: `${position(value)}%` }} {...tipAttrs(`Week ${game.week}`, `${spec.label}: ${fmt(value, spec.dp)}`)} />
      </div>
    </div>
  );
}

function ThrowMap({ plays, onZone }) {
  const zones = {};
  for (const play of plays) {
    if (play.r !== 'passer' || !play.pd || /sack/.test(play.t)) continue;
    const key = `${play.pd}-${play.pdir}`;
    const zone = (zones[key] ??= { att: 0, cmp: 0, y: 0, td: 0, int: 0 });
    zone.att += 1;
    if (play.t === 'pass-reception' || play.t === 'passing-touchdown') { zone.cmp += 1; zone.y += play.y ?? 0; }
    if (play.t === 'passing-touchdown') zone.td += 1;
    if (/interception/.test(play.t)) zone.int += 1;
  }
  return (
    <div className="player-dash-throwmap" role="group" aria-label="Throw map">
      {['deep-left', 'deep-middle', 'deep-right', 'short-left', 'short-middle', 'short-right'].map((key) => {
        const zone = zones[key];
        const ypa = zone?.att ? zone.y / zone.att : null;
        const strength = ypa == null ? 0 : Math.min(1, ypa / 14);
        return (
          <button
            key={key}
            type="button"
            className={`player-dash-throwmap__cell ${strength > 0.55 ? 'is-strong' : ''}`}
            style={{ '--zone-mix': `${Math.round(8 + strength * 82)}%` }}
            onClick={() => onZone(key)}
            aria-label={`${key.replace('-', ' ')}: ${zone ? `${zone.cmp} of ${zone.att}` : 'no throws'}`}
            {...tipAttrs(key.replace('-', ' '), [zone ? `${zone.cmp}/${zone.att} · ${zone.y} yds${zone.td ? ` · ${zone.td} TD` : ''}${zone.int ? ` · ${zone.int} INT` : ''}` : 'No throws', 'Select to open the season passing chart'])}
          >
            {zone ? `${zone.cmp}/${zone.att}` : '–'}
          </button>
        );
      })}
    </div>
  );
}

function GameCard({ game, group, team, plays, opponent, oppRank, darkMode, onOpenGame, onZone }) {
  const [main, accent, sub] = gameHeadline(group, game, plays);
  return (
    <div className="player-dash-gamecard">
      <button
        type="button"
        className="player-dash-gamecard__open"
        aria-label={`Week ${game.week} ${game.home ? 'versus' : 'at'} ${game.opp}: open the game`}
        onClick={() => onOpenGame(game, 'team')}
      >
        <span className="player-dash-gamecard__top">
          <span className="player-dash-eyebrow">Wk {game.week} · {game.home ? 'vs' : '@'} <TeamMark abbr={game.opp} darkMode={darkMode} size={14} /> {game.opp}</span>
          <span className="player-dash-gamecard__result">
            <span className={`player-dash-pill ${gameWon(game) ? 'is-win' : 'is-loss'}`}>{gameWon(game) ? 'W' : game.pf === game.pa ? 'T' : 'L'}</span>
            {game.pf}–{game.pa}
          </span>
        </span>
        <span className="player-dash-gamecard__line">{main} {accent && <em>{accent}</em>}</span>
        <span className="player-dash-gamecard__sub">{game.active ? sub : 'Did not play'}</span>
      </button>
      <WinSpark game={game} team={team} marks={gameMarks(group, plays)} onOpen={() => onOpenGame(game, 'plays')} />
      {(group === 'QB' || GAME_GAUGE[group]) && (
        <div className="player-dash-gamecard__foot">
          {group === 'QB' && <ThrowMap plays={plays} onZone={onZone} />}
          <Gauge group={group} game={game} plays={plays} opponent={opponent} oppRank={oppRank} />
        </div>
      )}
    </div>
  );
}

/* ---------- Scatter ---------- */

function OpponentScatter({ group, games, playsByGame, contexts, oppRanks, team, playerShort, onOpenGame }) {
  const [measureRef, width] = useMeasuredWidth();
  const spec = SCATTER[group];
  if (!spec) return null;
  const points = games
    .map((game) => ({ game, x: contexts[game.id]?.[spec.x], y: spec.value(game, playsByGame[game.id] ?? []) }))
    .filter((point) => point.x != null && point.y != null && point.game.active);
  return (
    <div className="player-dash-block">
      <SectionHead title={spec.title} />
      <div ref={measureRef} className="player-dash-surface player-dash-scatter">
        {width > 0 && points.length > 0 ? (
          <ScatterSvg width={width} spec={spec} points={points} team={team} oppRanks={oppRanks} playerShort={playerShort} onOpenGame={onOpenGame} />
        ) : (
          <div className="player-dash-empty is-bare">{points.length ? '' : 'No finished games to compare yet.'}</div>
        )}
      </div>
    </div>
  );
}

function ScatterSvg({ width, spec, points, team, oppRanks, playerShort, onOpenGame }) {
  const phone = width < 480;
  const height = phone ? Math.round(width * 0.82) : width < 820 ? 260 : 240;
  const fs = 11;
  const left = phone ? 34 : 44;
  const right = 14;
  const top = 12;
  const bottom = phone ? 34 : 36;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  let xlo; let xhi; let ylo; let yhi;
  if (spec.diagonal) {
    const all = [...xs, ...ys];
    const pad = (Math.max(...all) - Math.min(...all)) * 0.15 || 1;
    xlo = ylo = Math.max(0, Math.min(...all) - pad);
    xhi = yhi = Math.max(...all) + pad;
  } else {
    xlo = 0; xhi = Math.max(...xs) * 1.15 || 1;
    ylo = 0; yhi = Math.max(...ys, 3) + 1;
  }
  const sx = (v) => left + ((v - xlo) / (xhi - xlo)) * (width - left - right);
  const sy = (v) => top + (1 - (v - ylo) / (yhi - ylo)) * (height - top - bottom);
  const ticks = (lo, hi, count) => {
    const step = (hi - lo) / count;
    const nice = [0.5, 1, 2, 5, 10, 20, 25, 50].find((value) => value >= step) ?? step;
    const out = [];
    for (let v = Math.ceil(lo / nice) * nice; v <= hi; v += nice) out.push(Number(v.toFixed(2)));
    return out;
  };
  const xt = ticks(xlo, xhi, phone ? 4 : 6);
  const yt = ticks(ylo, yhi, phone ? 4 : 5);
  const mean = ys.reduce((total, v) => total + v, 0) / ys.length;
  const radius = phone ? 7 : 6;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${spec.yLabel} in each game against the opponent's usual number`}>
      {spec.diagonal && (
        <path d={`M${sx(xlo)},${sy(ylo)} L${sx(xhi)},${sy(yhi)} L${sx(xlo)},${sy(yhi)} Z`} className="player-dash-scatter__better" />
      )}
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={sx(xlo)} x2={sx(xhi)} y1={sy(v)} y2={sy(v)} className="player-dash-gridline" />
          <text x={left - 6} y={sy(v) + 4} textAnchor="end" fontSize={fs}>{v}</text>
        </g>
      ))}
      {xt.map((v) => <text key={`x${v}`} x={sx(v)} y={height - bottom + 16} textAnchor="middle" fontSize={fs}>{v}</text>)}
      {spec.diagonal && (
        <>
          <line x1={sx(xlo)} y1={sy(ylo)} x2={sx(xhi)} y2={sy(yhi)} className="player-dash-scatter__diag" />
          <text x={sx(xlo) + 8} y={sy(yhi) + 15} fontSize={fs - 1} fontWeight="700" className="player-dash-scatter__note is-me">{spec.better.toUpperCase()}</text>
        </>
      )}
      {points.map(({ game, x, y }) => {
        const good = spec.diagonal ? y >= x : y >= mean;
        const rank = oppRanks?.[game.opp]?.[spec.x];
        return (
          <g
            key={game.id}
            className="player-dash-scatter__dot"
            role="button"
            tabIndex={0}
            aria-label={`Week ${game.week} ${game.opp}: ${spec.yLabel} ${fmt(y, spec.dp)}, ${spec.xShort} ${fmt(x, 1)}. Open the game`}
            onClick={() => onOpenGame(game, 'team')}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenGame(game, 'team'); } }}
            {...tipAttrs(`Week ${game.week} · ${matchupLabel(team, game)}`, [`${playerShort}: ${fmt(y, spec.dp)} ${spec.yLabel.toLowerCase()}`, `${game.opp}: ${fmt(x, 1)}${rank ? ` (${ordinal(rank)} easiest matchup)` : ''}`, 'Select to open the game'])}
          >
            {spec.diagonal && <line x1={sx(x)} y1={sy(x)} x2={sx(x)} y2={sy(y)} className={good ? 'is-good' : 'is-bad'} />}
            <circle cx={sx(x)} cy={sy(y)} r={phone ? 16 : 12} fill="transparent" />
            <circle cx={sx(x)} cy={sy(y)} r={radius} className={good ? 'is-good' : 'is-bad'} />
            <text x={sx(x) + radius + 4} y={sy(y) + 4} fontSize={fs} fontWeight="700" className="player-dash-scatter__label">{game.opp}</text>
          </g>
        );
      })}
      <text x={(left + width - right) / 2} y={height - 4} textAnchor="middle" fontSize={fs - 1} className="player-dash-scatter__axis">{(phone ? spec.xShort : spec.xLabel).toUpperCase()} →</text>
      <text transform={`translate(${phone ? 9 : 11} ${(top + height - bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={fs - 1} className="player-dash-scatter__axis">{spec.yLabel.toUpperCase()} →</text>
    </svg>
  );
}

/* ---------- Tab ---------- */

export function OverviewTab({ group, rankGroup = group, season, plays, pools, ranks, oppRanks, team, playerId, playerName, darkMode, onOpenGame, onOpenPlayer, onZone }) {
  const [pool, setPool] = useState(() => (ranks?.isQualified === false ? 'all' : 'qualified'));
  const playsByGame = useMemo(() => {
    const map = {};
    for (const play of plays) (map[play.g.id] ??= []).push(play);
    return map;
  }, [plays]);
  const contexts = useMemo(() => Object.fromEntries((season?.games ?? []).map((game) => [game.id, pools ? opponentContext(pools, group, game.opp, game.week) : null])), [group, pools, season]);
  const lastName = playerName.split(' ').slice(1).join(' ') || playerName;
  const rules = POOL_RULES[rankGroup];
  const list = pool === 'all' ? ranks?.all : ranks?.qualified;
  const gaugeKey = GAME_GAUGE[group]?.oppKey;

  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <div className="player-dash-games">
          {(season?.games ?? []).map((game) => (
            <GameCard
              key={game.id}
              game={game}
              group={group}
              team={team}
              plays={playsByGame[game.id] ?? []}
              opponent={contexts[game.id]}
              oppRank={gaugeKey ? oppRanks?.[game.opp]?.[gaugeKey] : null}
              darkMode={darkMode}
              onOpenGame={onOpenGame}
              onZone={onZone}
            />
          ))}
        </div>
        <div className="player-dash-legend">
          <span><i className="is-good-dot" />{group === 'DL' || group === 'LB' || group === 'DB' ? 'Sack, takeaway, or forced fumble' : `${lastName} touchdown`}</span>
          {!['DL', 'LB', 'DB', 'K'].includes(group) && <span><span className="player-dash-x">✕</span>Turnover</span>}
          <span>
            Line: {team} win chance ·{' '}
            <span className="player-dash-on-hover">hover to read, select to open the play-by-play</span>
            <span className="player-dash-on-touch">tap to read, tap again to open the play-by-play</span>
          </span>
          {group === 'QB' && <span>Grid: completions by depth and direction</span>}
        </div>
      </div>

      <OpponentScatter
        group={group}
        games={season?.games ?? []}
        playsByGame={playsByGame}
        contexts={contexts}
        oppRanks={oppRanks}
        team={team}
        playerShort={lastName}
        onOpenGame={onOpenGame}
      />

      {ranks && (
        <div className="player-dash-block">
          <SectionHead title={`${rankGroup} ranks`}>
            <Segmented
              label={`${rankGroup}s ranked against`}
              size="sm"
              value={pool}
              onChange={setPool}
              options={[
                { id: 'qualified', label: `Qualified (${ranks.qualifiedCount})`, tip: rules?.[0] },
                { id: 'all', label: `All starters (${ranks.allCount})`, tip: rules?.[1] },
              ]}
            />
            <span className="player-dash-meta">better →</span>
          </SectionHead>
          {pool === 'qualified' && !ranks.isQualified ? (
            <div className="player-dash-empty">{lastName} doesn&apos;t meet the qualifying rule yet ({rules?.[0]}). Switch to All starters to see where he ranks.</div>
          ) : (
            <RankStrips ranks={list} playerId={playerId} playerName={playerName} onOpenPlayer={onOpenPlayer} />
          )}
        </div>
      )}
    </div>
  );
}

