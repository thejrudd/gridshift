import { useState } from 'react';
import {
  defAgg,
  fmt,
  isPressure,
  isTackle,
  ordinal,
} from '../../../utils/playerSeason/dashboardModel.js';
import { RateRows, SectionHead, ShareTree, SplitTable, ZoneField } from './DashboardParts.jsx';
import { LANES, tipAttrs, ZONES } from './dashboardUi.js';
import { FieldMap } from './FieldMap.jsx';
import { PlayListBlock } from './PlayList.jsx';

const scoreBefore = (play) => (play.bm ?? 0) - (play.bo ?? 0);

// Opponent dropbacks are stored per game as [down, quarter, shotgun].
const dropbacksWhere = (games, test) => games.reduce((total, game) => total + game.oppDropbacks.filter(test).length, 0);

function situationRows(team) {
  return [
    ['By down', [['1st down', (p) => p.dn === 1], ['2nd down', (p) => p.dn === 2], ['3rd down', (p) => p.dn === 3], ['4th down', (p) => p.dn === 4]]],
    ['By quarter', [['1st quarter', (p) => p.q === 1], ['2nd quarter', (p) => p.q === 2], ['3rd quarter', (p) => p.q === 3], ['4th quarter', (p) => p.q === 4], ['Overtime', (p) => p.q >= 5]]],
    // Field position is from his team's goal line, so low numbers are his own end.
    ['By field position', [['Opponent territory', (p) => p.xs != null && p.xs >= 50], [`${team} territory`, (p) => p.xs != null && p.xs < 50 && p.xs > 20], ['Red zone (defending)', (p) => p.xs != null && p.xs <= 20]]],
    ['By score before the snap', [['Leading', (p) => scoreBefore(p) > 0], ['Tied', (p) => scoreBefore(p) === 0], ['Trailing', (p) => scoreBefore(p) < 0]]],
    ['By play type', [['Runs', (p) => !p.pass], ['Passes', (p) => p.pass]]],
  ];
}

function DefenseSplits({ plays, team }) {
  return (
    <SplitTable
      columns={['Situation', 'TKL', 'TFL', 'SACK', 'QB HIT', 'PD', 'INT', 'FF']}
      groups={situationRows(team).map(([label, rows]) => ({
        label,
        rows: rows.map(([rowLabel, test]) => {
          const agg = defAgg(plays.filter(test));
          if (!agg.n) return { label: rowLabel, cells: null };
          return { label: rowLabel, strong: 0, cells: [agg.tkl, agg.tfl, fmt(agg.sk, 1), agg.hit, agg.pd, agg.int, agg.ff] };
        }),
      }))}
      note="Credits come from the official play text in play-by-play, so totals can trail the box score: assisted tackles, for example, are not always named."
    />
  );
}

/* ---------- Pass rush (DL, LB) ---------- */

export function PassRushTab({ plays, season, box, people, listProps }) {
  const [selection, setSelection] = useState(null); // { kind, value }
  const games = season?.games ?? [];
  const pressures = plays.filter(isPressure);
  const totals = defAgg(plays);
  const dropbacks = dropbacksWhere(games, () => true);
  const isSelected = (kind, value) => selection?.kind === kind && String(selection.value) === String(value);
  const toggle = (kind, value) => setSelection(isSelected(kind, value) ? null : { kind, value });
  const rateRows = (kind, defs) => defs.map(([label, value, dropbackTest, playTest]) => {
    const faced = dropbacksWhere(games, dropbackTest);
    const count = pressures.filter(playTest).length;
    const rate = faced ? count / faced : 0;
    return {
      key: `${kind}:${value}`,
      label,
      fill: Math.min(100, (rate / 0.4) * 100),
      value: `${fmt(100 * rate)}%`,
      detail: `${count} of ${faced}`,
      tip: [`${count} pressures on ${faced} dropbacks (${fmt(100 * rate)}%)`, `${pressures.filter(playTest).filter((play) => play.cr.sk).length} sacks · select to list them`],
    };
  });
  const onRate = (key) => { const [kind, value] = key.split(':'); toggle(kind, value); };
  const byDown = rateRows('down', [1, 2, 3, 4].map((d) => [ordinal(d), d, ([down]) => down === d, (play) => play.dn === d]));
  const byQuarter = rateRows('q', [1, 2, 3, 4].map((q) => [`Q${q}`, q, ([, quarter]) => quarter === q, (play) => play.q === q]));
  const byFormation = rateRows('form', [['Shotgun', 1, ([, , shotgun]) => shotgun === 1, (play) => play.sg], ['Under center', 0, ([, , shotgun]) => shotgun === 0, (play) => !play.sg]]);

  const quarterbacks = {};
  for (const play of pressures) {
    const key = play.qb ?? 'unknown';
    const entry = (quarterbacks[key] ??= { key, prs: 0, sk: 0, ff: 0 });
    entry.prs += 1;
    entry.sk += play.cr.sk ?? 0;
    entry.ff += play.cr.ff ?? 0;
  }
  const qbRows = Object.values(quarterbacks).sort((a, b) => b.prs - a.prs).map((entry) => ({
    key: entry.key,
    name: people?.[entry.key]?.n ?? 'Unknown passer',
    sub: people?.[entry.key]?.t ?? '',
    outer: entry.prs,
    inner: entry.sk,
    value: entry.prs,
    detail: `pressures · ${fmt(entry.sk, 1)} sk`,
    tip: `${entry.prs} pressures · ${fmt(entry.sk, 1)} sacks · ${entry.ff} forced fumbles`,
  }));
  const selected = !selection ? pressures : pressures.filter((play) => {
    if (selection.kind === 'down') return play.dn === Number(selection.value);
    if (selection.kind === 'q') return play.q === Number(selection.value);
    if (selection.kind === 'form') return Boolean(play.sg) === (String(selection.value) === '1');
    return String(play.qb ?? 'unknown') === String(selection.value);
  });
  const label = !selection ? 'Every pressure'
    : selection.kind === 'down' ? `Pressures on ${ordinal(Number(selection.value))} down`
      : selection.kind === 'q' ? `Pressures in Q${selection.value}`
        : selection.kind === 'form' ? `Pressures against ${String(selection.value) === '1' ? 'shotgun' : 'under center'}`
          : `Pressures on ${people?.[selection.value]?.n ?? 'this passer'}`;

  const summary = [
    ['Dropbacks faced', `${dropbacks}`, 'opponent pass attempts and sacks'],
    ['Pressures', `${totals.prs}`, `${fmt(dropbacks ? (100 * totals.prs) / dropbacks : 0, 1)}% of dropbacks`],
    ['Sacks', fmt(totals.sk, 1), `${fmt(box.defensive_sacks ?? totals.sk, 1)} in the box score`],
    ['Strip-sacks', `${pressures.filter((play) => play.cr.sk && play.cr.ff).length}`, `${totals.ff} forced fumbles in all`],
    ['QB hits without a sack', `${pressures.filter((play) => !play.cr.sk).length}`, 'hit as or after he threw'],
  ];

  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Pass rush" meta={`${fmt(totals.sk, 1)} sacks · ${totals.hit} QB hits · ${totals.ff} forced fumbles`} />
        <div className="player-dash-splits">
          {summary.map(([name, value, detail]) => (
            <div key={name} className="player-dash-split">
              <span>{name}</span>
              <span className="player-dash-meta">{detail}</span>
              <span className="player-dash-split__value">{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="player-dash-grid">
        <div className="player-dash-block">
          <SectionHead title="Pressure rate by down" />
          <RateRows rows={byDown} selected={selection ? `${selection.kind}:${selection.value}` : null} onSelect={onRate} />
          <SectionHead title="By quarter" />
          <RateRows rows={byQuarter} selected={selection ? `${selection.kind}:${selection.value}` : null} onSelect={onRate} />
          <SectionHead title="By offensive formation" />
          <RateRows rows={byFormation} selected={selection ? `${selection.kind}:${selection.value}` : null} onSelect={onRate} />
        </div>
        <div className="player-dash-block">
          <SectionHead title="Quarterbacks he got to" />
          <ShareTree rows={qbRows} selected={selection?.kind === 'qb' ? selection.value : null} onSelect={(key) => toggle('qb', key)} innerLabel="Sacks" outerLabel="Pressures" />
        </div>
      </div>
      <div className="player-dash-block">
        <SectionHead title={`${label} · ${selected.length}`}>
          {selection && <button type="button" className="player-dash-link" onClick={() => setSelection(null)}>Clear selection</button>}
        </SectionHead>
        <PlayListBlock plays={selected} emptyLabel="No pressures match." {...listProps} />
      </div>
    </div>
  );
}

/* ---------- Tackling (DL, LB, DB) ---------- */

const BUCKETS = [['Loss', (y) => y < 0], ['No gain', (y) => y === 0], ['1–2 yds', (y) => y >= 1 && y <= 2], ['3–4 yds', (y) => y >= 3 && y <= 4], ['5–9 yds', (y) => y >= 5 && y <= 9], ['10+ yds', (y) => y >= 10]];

export function TacklingTab({ plays, box, team, listProps }) {
  const [lane, setLane] = useState(null);
  const [depth, setDepth] = useState(null);
  const tackles = plays.filter((play) => isTackle(play) && !play.cr.sk);
  const runTackles = tackles.filter((play) => !play.pass);
  const buckets = BUCKETS.map(([label, test]) => ({ label, plays: tackles.filter((play) => test(play.y ?? 0)) }));
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.plays.length), 1);
  const lanes = LANES.map(([key, label]) => {
    const subset = runTackles.filter((play) => play.gap === key);
    return { k: key, l: label, n: subset.length, y: subset.reduce((total, play) => total + (play.y ?? 0), 0), tfl: subset.filter((play) => (play.y ?? 0) < 0).length };
  });
  const list = tackles
    .filter((play) => (!lane || play.gap === lane) && (depth == null || BUCKETS[depth][1](play.y ?? 0)))
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const listLabel = [lane && `${LANES.find(([key]) => key === lane)?.[1]} runs`, depth != null && BUCKETS[depth][0]].filter(Boolean).join(' · ');

  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Tackling" meta={`${box.total_tackles ?? tackles.length} tackles · ${box.solo_tackles ?? '–'} solo · ${box.tackles_for_loss ?? '–'} for loss`} />
      </div>
      <div className="player-dash-grid">
        <div className="player-dash-block">
          <SectionHead title="Tackle depth" />
          <div className="player-dash-depthbars">
            {buckets.map((bucket, index) => (
              <button
                key={bucket.label}
                type="button"
                className="player-dash-depthbar"
                aria-pressed={depth === index}
                onClick={() => setDepth(depth === index ? null : index)}
                {...tipAttrs(bucket.label, [`${bucket.plays.length} tackles (${bucket.plays.filter((play) => !play.pass).length} runs, ${bucket.plays.filter((play) => play.pass).length} catches)`, 'Select to list them'])}
              >
                <span className="player-dash-depthbar__col">
                  <i className={index === 0 ? 'is-loss' : index <= 2 ? 'is-stop' : 'is-gave'} style={{ height: `${(bucket.plays.length / maxBucket) * 100}%` }} />
                </span>
                <b>{bucket.plays.length}</b>
                <span>{bucket.label}</span>
              </button>
            ))}
          </div>
          <div className="player-dash-legend">
            <span><i className="is-loss" />Tackle for loss</span>
            <span><i className="is-stop" />Stop (0–2 yards)</span>
            <span><i className="is-gave" />Gave up 3+</span>
          </div>
        </div>
        <div className="player-dash-block">
          <SectionHead title="Run stops by gap" />
          <FieldMap mode="stops" lanes={lanes} selected={lane} onSelect={setLane} ariaLabel="Run tackles by gap" />
          <div className="player-dash-legend">
            <span>Circle size = tackles · height = yards gained before his stop</span>
            {lane && <button type="button" className="player-dash-link" onClick={() => setLane(null)}>Show all</button>}
          </div>
        </div>
      </div>
      <div className="player-dash-block">
        <SectionHead title={`${listLabel || 'Every tackle, shortest gain first'} · ${list.length}`}>
          {(lane || depth != null) && <button type="button" className="player-dash-link" onClick={() => { setLane(null); setDepth(null); }}>Clear selection</button>}
        </SectionHead>
        <PlayListBlock plays={list} emptyLabel="No tackles match." {...listProps} />
      </div>
      <div className="player-dash-block">
        <SectionHead title="Splits" />
        <DefenseSplits plays={plays} team={team} />
      </div>
    </div>
  );
}

/* ---------- Coverage (DB) ---------- */

export function CoverageTab({ plays, season, box, team, people, listProps }) {
  const [zone, setZone] = useState(null);
  const games = season?.games ?? [];
  const onBall = plays.filter((play) => play.cr?.pd || play.cr?.int);
  const catchTackles = plays.filter((play) => play.cr?.tkl && play.pass && !play.cr.sk);
  const dropbacks = dropbacksWhere(games, () => true);
  const zones = Object.fromEntries(ZONES.map((key) => {
    const subset = onBall.filter((play) => `${play.pd}-${play.pdir}` === key);
    const ints = subset.filter((play) => play.cr.int).length;
    return [key, { value: subset.length || null, big: subset.length ? String(subset.length) : '–', small: ints ? `${ints} INT` : '', tip: `${subset.length} passes defended or intercepted${ints ? `, ${ints} interceptions` : ''}` }];
  }));
  const receivers = {};
  for (const play of catchTackles) {
    const key = play.bc ?? 'unknown';
    const entry = (receivers[key] ??= { key, n: 0, y: 0 });
    entry.n += 1;
    entry.y += play.y ?? 0;
  }
  const receiverRows = Object.values(receivers).sort((a, b) => b.n - a.n).map((entry) => ({
    key: entry.key,
    name: people?.[entry.key]?.n ?? 'Unknown receiver',
    sub: people?.[entry.key]?.pos ?? '',
    outer: entry.n,
    inner: entry.n,
    value: entry.n,
    detail: `tackles · ${fmt(entry.y / entry.n, 1)} yds per catch`,
    tip: `${entry.n} tackles after a catch · ${entry.y} yards gained on those catches`,
  }));
  const rateRows = [1, 2, 3, 4].map((d) => {
    const faced = dropbacksWhere(games, ([down]) => down === d);
    const count = onBall.filter((play) => play.dn === d).length;
    const rate = faced ? count / faced : 0;
    return { key: d, label: ordinal(d), fill: Math.min(100, (rate / 0.1) * 100), value: `${fmt(100 * rate, 1)}%`, detail: `${count} of ${faced}`, tip: `${count} plays on the ball on ${faced} opponent dropbacks` };
  });
  const selected = onBall.filter((play) => !zone || `${play.pd}-${play.pdir}` === zone);
  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Coverage" meta={`${box.passes_defended ?? onBall.length} passes defended · ${box.defensive_interceptions ?? 0} interceptions · ${dropbacks} opponent dropbacks`} />
      </div>
      <div className="player-dash-grid is-wide-left">
        <div className="player-dash-block">
          <SectionHead title="Plays on the ball, by where the pass went" />
          <ZoneField zones={zones} selected={zone} onSelect={setZone} footnote="Passes defended and interceptions, placed by the pass depth and direction in play-by-play." />
          <SectionHead title="Plays on the ball by down" />
          <RateRows rows={rateRows} />
        </div>
        <div className="player-dash-block">
          <SectionHead title="Receivers he tackled after a catch" />
          <ShareTree rows={receiverRows} innerLabel="Tackles" outerLabel="Tackles" />
        </div>
      </div>
      <div className="player-dash-block">
        <SectionHead title={`${zone ? `Plays on the ball, ${zone.replace('-', ' ')}` : 'Every play on the ball'} · ${selected.length}`}>
          {zone && <button type="button" className="player-dash-link" onClick={() => setZone(null)}>Clear selection</button>}
        </SectionHead>
        <PlayListBlock plays={selected} emptyLabel="No passes defended or interceptions yet." {...listProps} />
      </div>
      <div className="player-dash-block">
        <SectionHead title="Splits" />
        <DefenseSplits plays={plays} team={team} />
      </div>
    </div>
  );
}
