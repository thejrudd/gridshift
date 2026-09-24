import { useMemo, useState } from 'react';
import Modal from '../Modal';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { useTheme } from '../../context/ThemeContext';
import { fantasyHeroGradient } from '../../utils/fantasyTeamIdentity.js';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';

/**
 * Fantasy Matchup preview — the broadcast-style panel behind the masthead's
 * pregame/live/final control. Rendering only; every number arrives already
 * derived on the model from buildMatchupPreviewModel.
 */

const one = (value) => (value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—');

function KeyText({ parts }) {
  return (
    <>
      {(parts ?? []).map((part, index) => (
        part.emphasis
          ? <em key={index}>{part.text}</em>
          : <span key={index}>{part.text}</span>
      ))}
    </>
  );
}

/** Mirrored comparison row: value, bar, shared centre label, value. */
function CompareRow({ row, index }) {
  const aValue = row.aValue ?? (typeof row.a === 'number' ? row.a : null);
  const bValue = row.bValue ?? (typeof row.b === 'number' ? row.b : null);
  let leadsA = false;
  let leadsB = false;
  if (aValue != null && bValue != null && aValue !== bValue) {
    leadsA = row.lowerWins ? aValue < bValue : aValue > bValue;
    leadsB = !leadsA;
  }
  const max = Math.max(Math.abs(aValue ?? 0), Math.abs(bValue ?? 0)) || 1;
  const bars = row.numeric !== false;

  const cell = (side, display, sub, leads, value) => (
    <div
      className={`matchup-preview-cmp__value is-${side}${leads ? ' is-leading' : ''}${bars ? '' : ' has-no-bar'}`}
      style={{ '--matchup-preview-bar': bars ? `${Math.round(Math.abs(value ?? 0) / max * 100)}%` : 0, '--matchup-preview-index': index }}
    >
      <div className="matchup-preview-cmp__number tabular-nums">
        <span>{typeof display === 'number' ? display.toFixed(1) : display}</span>
        {row.unit && <span className="matchup-preview-cmp__unit">{row.unit}</span>}
      </div>
      {sub && <div className="matchup-preview-cmp__sub">{sub}</div>}
    </div>
  );

  return (
    <div className="matchup-preview-cmp__row">
      {cell('a', row.a, row.aSub, leadsA, aValue)}
      <div className="matchup-preview-cmp__label">{row.label}{row.sub && <small>{row.sub}</small>}</div>
      {cell('b', row.b, row.bSub, leadsB, bValue)}
    </div>
  );
}

const CHIP_TONE = { good: 'positive', bad: 'negative', flat: 'neutral' };
const isTeamDefense = (position) => position === 'DEF' || position === 'DST';

/**
 * One starter as a shared player row: headshot, team gradient and logo come
 * from CompanionPlayerRow, with the points label and the projection chip.
 */
function PreviewPlayerCard({ player, unit = null, darkMode }) {
  const defense = isTeamDefense(player.position);
  const opponent = player.opponentTeam ? `${player.isHome ? 'vs' : 'at'} ${player.opponentTeam}` : null;
  const meta = [
    player.position,
    player.team,
    opponent,
    player.chip
      ? <CompanionPlayerStatus key="chip" tone={CHIP_TONE[player.tone] ?? 'neutral'} localContrast={false} label={player.chip} title={player.tag ?? undefined} />
      : null,
  ].filter(Boolean);
  const gridTemplate = ['44px', 'minmax(0, 1fr)', defense ? null : '30px', 'minmax(46px, auto)'].filter(Boolean).join(' ');

  return (
    <CompanionPlayerRow
      player={player}
      name={player.name}
      darkMode={darkMode}
      showAccentRail={false}
      showPosition={false}
      showTeamLogo={!defense}
      useTeamLogoAsAvatar={defense}
      metaSegments={meta}
      columns={[
        <CompanionPlayerMetric
          key="points"
          align="end"
          value={one(player.value)}
          label={unit}
        />,
      ]}
      gridTemplate={gridTemplate}
      className="matchup-preview-card"
    />
  );
}

function WatchColumn({ side, accent, list, unit, summary, darkMode }) {
  if (!list?.length) return null;
  return (
    <div className="matchup-preview-watch__col" style={{ '--matchup-preview-accent': accent }}>
      <div className="matchup-preview-watch__head">
        <b>{side.name}</b>
        <span>{summary}</span>
      </div>
      <div className="matchup-preview-watch__list">
        {list.map((player) => (
          <PreviewPlayerCard
            key={player.id}
            player={player}
            unit={player.unit ?? unit}
            darkMode={darkMode}
          />
        ))}
      </div>
    </div>
  );
}

const MEETING_LIMIT = 5;

export default function MatchupPreviewModal({
  model,
  loading = false,
  rivalryStatus = 'idle',
  onOpenMeeting,
  onClose,
}) {
  const isCompact = useMediaQuery('(max-width: 640px)');
  const isWide = useMediaQuery('(min-width: 1024px)');
  const { darkMode } = useTheme();
  const size = isCompact ? 'compact' : isWide ? 'wide' : 'regular';

  const accents = useMemo(() => ({
    a: model?.sides?.a?.palette?.[0] ?? 'var(--color-accent)',
    b: model?.sides?.b?.palette?.[0] ?? 'var(--color-signature)',
  }), [model]);

  const [meetingNotice, setMeetingNotice] = useState(null);
  const [openingMeeting, setOpeningMeeting] = useState(false);

  if (!model) {
    return (
      <Modal onClose={onClose} mobileSheet={isCompact} ariaLabel="Matchup preview" containerClassName="matchup-preview-modal">
        <div className="matchup-preview__unavailable" role="status">
          {loading ? 'Building the matchup preview…' : 'The matchup preview is unavailable for this week.'}
        </div>
      </Modal>
    );
  }

  const { sides, odds, rivalry } = model;
  const headerLine = model.phase === 'post'
    ? ''
    : model.phase === 'live'
      ? model.liveNow
        ? 'Live scoring in progress'
        : model.nextKickoff
          ? `No games live · next kickoff ${model.nextKickoff}`
          : 'No games live right now'
      : model.firstKickoff
        ? `First kickoff ${model.firstKickoff}`
        : `${model.starterCount} starters`;
  const phaseChip = model.phase === 'post' ? `Final · Week ${model.week}`
    : model.phase === 'live' ? (model.liveNow ? `Live · Week ${model.week}` : `Week ${model.week} · Underway`)
      : `Week ${model.week} preview`;

  const openMeeting = async (meeting) => {
    if (openingMeeting) return;
    setOpeningMeeting(true);
    setMeetingNotice(null);
    try {
      await onOpenMeeting(meeting);
    } catch (error) {
      setMeetingNotice(error?.message || 'This matchup could not be opened. Please try again.');
    } finally {
      setOpeningMeeting(false);
    }
  };

  const teamLabel = (side) => sides[side === 'left' ? 'a' : 'b'].abbr ?? sides[side === 'left' ? 'a' : 'b'].name;
  const moments = rivalry ? [
    rivalry.closestMeeting && {
      label: 'Closest meeting',
      side: rivalry.closestMeeting.winner === 'right' ? 'b' : 'a',
      value: rivalry.closestMeeting.margin === 0 ? 'Tied' : rivalry.closestMeeting.margin.toFixed(2),
      detail: `${rivalry.closestMeeting.season} · Wk ${rivalry.closestMeeting.week}`,
    },
    rivalry.biggestWin && {
      label: 'Biggest win',
      side: rivalry.biggestWin.winner === 'right' ? 'b' : 'a',
      value: rivalry.biggestWin.margin.toFixed(2),
      detail: `${teamLabel(rivalry.biggestWin.winner)} · ${rivalry.biggestWin.season} Wk ${rivalry.biggestWin.week}`,
    },
    rivalry.highestScore && {
      label: 'Highest score',
      side: rivalry.highestScore.side === 'right' ? 'b' : 'a',
      value: rivalry.highestScore.points.toFixed(2),
      detail: `${teamLabel(rivalry.highestScore.side)} · ${rivalry.highestScore.season} Wk ${rivalry.highestScore.week}`,
    },
  ].filter(Boolean) : [];

  const renderSide = (key, degrees) => {
    const side = sides[key];
    const accent = accents[key];
    const background = side.palette?.length
      ? fantasyHeroGradient(side.palette[0], side.palette[1], degrees)
      : 'var(--color-fill-secondary)';
    const identity = [side.seedLabel, side.managerName].filter(Boolean).join(' · ');
    return (
      <div
        className={`matchup-preview__side companion-matchup-masthead__side is-${key} is-${key === 'a' ? 'mine' : 'opponent'}`}
        style={{ '--matchup-preview-accent': accent, background }}
      >
        {(side.initials || identity) && (
          <div className="matchup-preview__seed">
            {side.initials && <i aria-hidden="true">{side.initials}</i>}
            {identity && <span>{identity}</span>}
          </div>
        )}
        {!side.summary && side.record && <div className="matchup-preview__record tabular-nums">{side.record}</div>}
        <div className="matchup-preview__big">
          <b className="tabular-nums">{one(model.big[key])}</b>
          <span>{model.bigLabel}</span>
        </div>
        {side.projectedFinal != null && (
          <span className="companion-matchup-masthead__projected-final">
            Projected final {side.projectedFinal.toFixed(1)}
            {side.projectionDelta && (
              <span className="companion-matchup-masthead__projection-delta">{' · '}{side.projectionDelta}</span>
            )}
          </span>
        )}
        {side.summary && (
          <span
            className="companion-matchup-masthead__team-summary"
            aria-label={`${side.name} season record ${side.summary.record}, points for ${side.summary.pointsFor}, points against ${side.summary.pointsAgainst}`}
          >
            <strong className="companion-matchup-masthead__team-record tabular-nums">{side.summary.record}</strong>
            <i className="companion-matchup-masthead__team-summary-separator" aria-hidden="true">·</i>
            <span className="companion-matchup-masthead__team-points tabular-nums">
              PF {side.summary.pointsFor}<i className="companion-matchup-masthead__team-summary-separator" aria-hidden="true">·</i>PA {side.summary.pointsAgainst}
            </span>
          </span>
        )}
      </div>
    );
  };

  let revealIndex = 0;
  const reveal = () => ({ '--matchup-preview-index': revealIndex++ });

  return (
    <Modal
      onClose={onClose}
      mobileSheet={isCompact}
      ariaLabel={`Matchup preview: ${sides.a.name} versus ${sides.b.name}`}
      containerClassName={`matchup-preview-modal is-${size}`}
      containerStyle={{
        maxWidth: '900px',
        maxHeight: '90dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        '--matchup-preview-left-accent': accents.a,
        '--matchup-preview-right-accent': accents.b,
      }}
    >
      <header className="matchup-preview__header">
        <span className={`matchup-preview__chip${model.liveNow ? ' is-live' : ''}`}>{phaseChip}</span>
        <span className="matchup-preview__when">{headerLine}</span>
        <button type="button" className="matchup-preview__close" onClick={onClose} aria-label="Close matchup preview">×</button>
      </header>

      <div className="matchup-preview__body gridshift-reveal">
        <div className="matchup-preview__title companion-matchup-masthead__score-grid">
          {renderSide('a', 135)}
          <div className="matchup-preview__axis companion-matchup-masthead__axis">
            <span className="companion-matchup-masthead__axis-label">VS</span>
            <em>WK {model.week}</em>
          </div>
          {renderSide('b', 225)}
        </div>

        <div className="matchup-preview__odds gridshift-reveal__item" style={reveal()}>
          <div className="matchup-preview__odds-top">
            <b className="is-a tabular-nums" style={{ color: accents.a }}>{odds.labelA}</b>
            <span>{odds.mid}</span>
            <b className="is-b tabular-nums" style={{ color: accents.b }}>{odds.labelB}</b>
          </div>
          <div
            className="matchup-preview__seam"
            style={{ gridTemplateColumns: `${odds.probabilityA}% minmax(0, 1fr)` }}
            role="img"
            aria-label={`${sides.a.name} ${odds.labelA} win probability; ${sides.b.name} ${odds.labelB} win probability`}
          >
            <i /><i />
          </div>
          {odds.band && (
            <div className="matchup-preview__odds-foot">
              <span className={`matchup-preview__band${odds.bandTone ? ` is-${odds.bandTone}` : ''}`}>{odds.band}</span>
              {odds.note && <span>{odds.note}</span>}
            </div>
          )}
        </div>

        {model.lede?.length ? (
          <p className="matchup-preview__lede gridshift-reveal__item" style={reveal()}>
            <KeyText parts={model.lede} />
          </p>
        ) : null}

        {model.keys?.length ? (
          <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
            <div className="matchup-preview__eyebrow">{model.keysTitle}</div>
            <div className="matchup-preview__keys">
              {model.keys.map((key, index) => (
                <div className="matchup-preview__key" key={key.id}>
                  <i className="tabular-nums" aria-hidden="true">{index + 1}</i>
                  <div>
                    <div className="matchup-preview__key-tag">{key.tag}</div>
                    <p className="matchup-preview__key-text"><KeyText parts={key.parts} /></p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {model.slotGroups?.length ? (
          <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
            <div className="matchup-preview__eyebrow">
              Where the rosters lead
              <span className="matchup-preview__note">{model.phase === 'pre' ? 'projected points by slot group' : 'points by slot group'}</span>
            </div>
            <div className="matchup-preview-cmp">
              {model.slotGroups.map((group, index) => (
                <CompareRow
                  key={group.label}
                  index={index}
                  row={{ label: group.label, sub: `${group.starters} starter${group.starters === 1 ? '' : 's'}`, a: group.a, b: group.b, aSub: group.aNames, bSub: group.bNames }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {(model.watch.a.length || model.watch.b.length) ? (
          <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
            <div className="matchup-preview__eyebrow">
              {model.watch.title}
            </div>
            <div className="matchup-preview-watch">
              <WatchColumn side={sides.a} accent={accents.a} list={model.watch.a} unit={model.watch.unit} summary={`${one(model.big.a)} ${model.bigLabel}`} darkMode={darkMode} />
              <WatchColumn side={sides.b} accent={accents.b} list={model.watch.b} unit={model.watch.unit} summary={`${one(model.big.b)} ${model.bigLabel}`} darkMode={darkMode} />
            </div>
          </section>
        ) : null}

        {model.seasonShape ? (
          <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
            <div className="matchup-preview__eyebrow">
              {model.seasonShape.title}
              <span className="matchup-preview__note">{model.seasonShape.note}</span>
            </div>
            <div className="matchup-preview-cmp">
              {model.seasonShape.rows.map((row, index) => <CompareRow key={row.label} row={row} index={index} />)}
            </div>
          </section>
        ) : null}

        <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
          <div className="matchup-preview__eyebrow">
            The rivalry
            {rivalry && <span className="matchup-preview__note">{rivalry.games} meeting{rivalry.games === 1 ? '' : 's'}</span>}
          </div>
          {rivalryStatus === 'loading' ? (
            <p className="matchup-preview__empty" role="status">Loading linked league history…</p>
          ) : !rivalry ? (
            <p className="matchup-preview__empty">
              No completed head-to-head exists between these two across linked league seasons. The series record fills in as linked seasons accumulate.
            </p>
          ) : (
            <>
              <div className="matchup-preview__series">
                <div className={`matchup-preview__series-side is-a${rivalry.leftWins === 0 ? ' is-dim' : ''}`}>
                  <b className="tabular-nums">{rivalry.leftWins}</b>
                  <span>{sides.a.name}</span>
                </div>
                <div className="matchup-preview__series-mid">
                  {rivalry.leftWins === rivalry.rightWins
                    ? <span>Series tied {rivalry.leftWins}–{rivalry.rightWins}</span>
                    : (
                      <>
                        <span>{rivalry.leftWins > rivalry.rightWins ? sides.a.name : sides.b.name}</span>
                        <span>leads {Math.max(rivalry.leftWins, rivalry.rightWins)}–{Math.min(rivalry.leftWins, rivalry.rightWins)}</span>
                      </>
                    )}
                </div>
                <div className={`matchup-preview__series-side is-b${rivalry.rightWins === 0 ? ' is-dim' : ''}`}>
                  <b className="tabular-nums">{rivalry.rightWins}</b>
                  <span>{sides.b.name}</span>
                </div>
              </div>
              {moments.length > 0 && (
                <div className="matchup-preview__moments">
                  {moments.map((moment) => (
                    <div className={`matchup-preview__moment is-${moment.side}`} key={moment.label}>
                      <span>{moment.label}</span>
                      <b className="tabular-nums">{moment.value}</b>
                      <em>{moment.detail}</em>
                    </div>
                  ))}
                </div>
              )}
              <div className="matchup-preview__meetings">
                {rivalry.meetings.slice(0, MEETING_LIMIT).map((meeting) => {
                  const openable = Boolean(onOpenMeeting && meeting.leftRosterId != null && meeting.rightRosterId != null);
                  const Row = openable ? 'button' : 'div';
                  return (
                    <Row
                      className={`matchup-preview__meeting${openable ? ' is-link' : ''}`}
                      key={meeting.id}
                      {...(openable ? { type: 'button', onClick: () => openMeeting(meeting), disabled: openingMeeting, 'aria-label': `Open ${meeting.season} week ${meeting.week} matchup` } : {})}
                    >
                      <span className="matchup-preview__meeting-when">{meeting.season} · Wk {meeting.week}</span>
                      <span className="matchup-preview__meeting-score tabular-nums">
                        <b className={`is-a${meeting.winner === 'left' ? ' is-winner' : ''}`}>{meeting.leftPoints.toFixed(2)}</b>
                        <i aria-hidden="true">–</i>
                        <b className={`is-b${meeting.winner === 'right' ? ' is-winner' : ''}`}>{meeting.rightPoints.toFixed(2)}</b>
                      </span>
                      <span className="matchup-preview__meeting-margin">
                        {meeting.winner
                          ? `${meeting.winner === 'left' ? (sides.a.abbr ?? sides.a.name) : (sides.b.abbr ?? sides.b.name)} by ${meeting.margin.toFixed(2)}`
                          : 'Tied'}
                        {openable && <span aria-hidden="true"> ↗</span>}
                      </span>
                    </Row>
                  );
                })}
              </div>
              {meetingNotice && <p className="matchup-preview__notice" role="alert">{meetingNotice}</p>}
              {rivalry.games > MEETING_LIMIT && (
                <p className="matchup-preview__more-note">Latest {MEETING_LIMIT} of {rivalry.games} meetings</p>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
