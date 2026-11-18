import { TOUR_PREVIEW_DATA } from '../../data/tourPreviewData';

// Static sample-data stand-ins for the league-dependent sections, shown only
// during the league-less first-run tour. They never read league context, so a
// disconnected app cannot leak real data into them. The `data-tour` hero of each
// preview is what the tour spotlights.

const PANEL_STYLE = {
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-separator)',
};

function Panel({ children, className = '', ...rest }) {
  return (
    <section className={`rounded-2xl p-4 ${className}`} style={PANEL_STYLE} {...rest}>
      {children}
    </section>
  );
}

function Eyebrow({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-secondary)' }}>
      {children}
    </div>
  );
}

function PositionChip({ position }) {
  return (
    <span
      className="inline-flex w-9 shrink-0 justify-center rounded-md py-0.5 text-xs font-bold"
      style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
    >
      {position}
    </span>
  );
}

function Row({ children, last = false }) {
  return (
    <div
      className="flex items-center gap-3 py-2.5 text-sm"
      style={last ? undefined : { borderBottom: '1px solid var(--color-separator)' }}
    >
      {children}
    </div>
  );
}

function SubTabs({ items }) {
  return (
    <div className="flex gap-2 overflow-hidden" aria-hidden="true">
      {items.map((item, index) => (
        <span
          key={item}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold"
          style={index === 0
            ? { background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }
            : { background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function FantasyPreview({ data }) {
  const { matchup, roster } = data.fantasy;
  return (
    <>
      <SubTabs items={data.fantasy.sections} />
      <Panel data-tour="preview-fantasy">
        <Eyebrow>{matchup.week}</Eyebrow>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{matchup.you.name}</div>
            <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-label)' }}>
              {matchup.you.points}
            </div>
          </div>
          <div className="text-xs font-bold uppercase" style={{ color: 'var(--color-label-secondary)' }}>vs</div>
          <div className="text-right">
            <div className="text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>{matchup.opponent.name}</div>
            <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-label-secondary)' }}>
              {matchup.opponent.points}
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-fill)' }}>
          <div className="h-full rounded-full" style={{ width: `${matchup.winProbability}%`, background: 'var(--color-signature)' }} />
        </div>
        <div className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
          {matchup.winProbability}% chance to win
        </div>
      </Panel>
      <Panel>
        <Eyebrow>Your lineup</Eyebrow>
        <div className="mt-1">
          {roster.map((player, index) => (
            <Row key={player.name} last={index === roster.length - 1}>
              <PositionChip position={player.position} />
              <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: 'var(--color-label)' }}>{player.name}</span>
              <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>{player.team}</span>
              <span className="w-12 text-right font-semibold tabular-nums" style={{ color: 'var(--color-label)' }}>{player.points}</span>
            </Row>
          ))}
        </div>
      </Panel>
    </>
  );
}

function LeaguePreview({ data }) {
  const { standings } = data.league;
  return (
    <>
      <SubTabs items={data.league.sections} />
      <Panel data-tour="preview-league">
        <Eyebrow>Standings</Eyebrow>
        <div className="mt-1">
          {standings.map((team, index) => (
            <Row key={team.name} last={index === standings.length - 1}>
              <span className="w-5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                {index + 1}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-semibold"
                style={{ color: team.you ? 'var(--color-signature)' : 'var(--color-label)' }}
              >
                {team.name}
              </span>
              <span className="w-14 text-right tabular-nums" style={{ color: 'var(--color-label)' }}>{team.record}</span>
              <span className="w-16 text-right tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>{team.pointsFor}</span>
            </Row>
          ))}
        </div>
      </Panel>
    </>
  );
}

function TradeSide({ label, players }) {
  return (
    <div className="min-w-0 flex-1">
      <Eyebrow>{label}</Eyebrow>
      {players.map((player) => (
        <div key={player.name} className="mt-2 flex items-center gap-2">
          <PositionChip position={player.position} />
          <span className="min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{player.name}</span>
        </div>
      ))}
    </div>
  );
}

function TradePreview({ data }) {
  const { give, get, verdict, upgrade } = data.trade;
  return (
    <>
      <SubTabs items={data.trade.sections} />
      <Panel data-tour="preview-trade">
        <div className="flex gap-4">
          <TradeSide label="You give" players={give} />
          <TradeSide label="You get" players={get} />
        </div>
        <div
          className="mt-4 rounded-xl px-3 py-2.5 text-sm font-semibold"
          style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
        >
          {verdict}
        </div>
      </Panel>
      <Panel>
        <Eyebrow>Roster upgrade</Eyebrow>
        <p className="mt-2 text-sm leading-snug" style={{ color: 'var(--color-label-secondary)' }}>{upgrade}</p>
      </Panel>
    </>
  );
}

function DraftPreview({ data }) {
  const { clock, board } = data.draft;
  return (
    <>
      <SubTabs items={data.draft.sections} />
      <Panel data-tour="preview-draft">
        <Eyebrow>{clock.label}</Eyebrow>
        <div className="mt-2 text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-label)' }}>
          {clock.pick}
        </div>
        <div className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>{clock.note}</div>
      </Panel>
      <Panel>
        <Eyebrow>Your board</Eyebrow>
        <div className="mt-1">
          {board.map((player, index) => (
            <Row key={player.name} last={index === board.length - 1}>
              <span className="w-5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                {index + 1}
              </span>
              <PositionChip position={player.position} />
              <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: 'var(--color-label)' }}>{player.name}</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-label-secondary)' }}>{player.tier}</span>
            </Row>
          ))}
        </div>
      </Panel>
    </>
  );
}

const PREVIEWS = {
  fantasy: FantasyPreview,
  league: LeaguePreview,
  trade: TradePreview,
  draft: DraftPreview,
};

export default function TourFantasyPreview({ tab }) {
  const Preview = PREVIEWS[tab];
  if (!Preview) return null;
  return (
    <div className="page-frame-readable mx-auto flex w-full flex-col gap-4 px-4 pb-8 pt-2" data-tour-preview={tab}>
      <div
        className="self-start rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest"
        style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}
      >
        Sample data
      </div>
      <Preview data={TOUR_PREVIEW_DATA} />
    </div>
  );
}
