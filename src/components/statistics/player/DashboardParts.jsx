import { useLayoutEffect, useRef } from 'react';
import { getNflTeamLogoUrl } from '../../../utils/companionAssetVisuals.js';
import { getTeamVisualTheme } from '../../../utils/teamVisualTheme.js';
import { fmt, ordinal } from '../../../utils/playerSeason/dashboardModel.js';
import { tipAttrs, ZONES } from './dashboardUi.js';

export function TeamMark({ abbr, darkMode, size = 16 }) {
  const logoKey = getTeamVisualTheme(abbr, darkMode)?.logoKey;
  const url = getNflTeamLogoUrl(logoKey || String(abbr ?? '').toLowerCase());
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="player-dash-teammark"
      loading="lazy"
      decoding="async"
      onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

export function SectionHead({ title, meta, children }) {
  return (
    <div className="player-dash-section-head">
      <h3 className="player-dash-subhead">{title}</h3>
      {meta && <span className="player-dash-meta">{meta}</span>}
      {children}
    </div>
  );
}

/** Chip naming an active cross-filter; selecting it clears that filter. */
export function FilterChip({ label, onClear }) {
  return (
    <button type="button" className="player-dash-chip team-dash-filter-chip" aria-pressed="true" aria-label={`Clear the ${label} filter`} onClick={onClear}>
      {label} ×
    </button>
  );
}

const TWEEN_MS = 420;
// Standard easing cubic-bezier(0.32, 0.72, 0, 1), solved for y at time t.
function broadcastEase(t) {
  const bezier = (a, b, u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezier(0.32, 0, mid) < t) lo = mid; else hi = mid;
  }
  return bezier(0.72, 1, (lo + hi) / 2);
}
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const parseLead = (text) => {
  const match = /^([−-]?)(\d[\d,]*(?:\.\d+)?)(.*)$/s.exec(text);
  if (!match) return null;
  return { sign: match[1], value: Number(match[2].replace(/,/g, '')) * (match[1] ? -1 : 1), digits: match[2].split('.')[1]?.length ?? 0, rest: match[3] };
};
const formatLead = ({ sign, digits, rest }, value) => {
  const number = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 && Number(number.replace(/,/g, '')) !== 0 ? sign || '-' : ''}${number}${rest}`;
};

/**
 * Text whose leading number counts to its new value when it changes ("13.8",
 * "37%", "1,204"). The first render shows the value as-is; non-numeric text
 * ("–") swaps immediately. Frames write the span directly, so a count costs no re-renders.
 */
export function Tween({ text }) {
  const value = String(text ?? '');
  const span = useRef(null);
  const shown = useRef(null);
  // The span has no React children: frames own its text, so React never holds a stale text node.
  useLayoutEffect(() => {
    const el = span.current;
    const lead = parseLead(value);
    const from = shown.current;
    shown.current = lead?.value ?? null;
    if (!el) return undefined;
    if (!lead || from == null || from === lead.value || reducedMotion()) {
      el.textContent = value;
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const paint = (now) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      shown.current = from + (lead.value - from) * broadcastEase(progress);
      el.textContent = progress < 1 ? formatLead(lead, shown.current) : value;
      if (progress < 1) frame = requestAnimationFrame(paint);
    };
    paint(start);
    // Frames pause in hidden tabs; land on the final value regardless.
    const settle = setTimeout(() => { cancelAnimationFrame(frame); shown.current = lead.value; el.textContent = value; }, TWEEN_MS + 80);
    return () => { cancelAnimationFrame(frame); clearTimeout(settle); };
  }, [value]);
  return <span ref={span} />;
}

export function Segmented({ label, options, value, onChange, size = 'md' }) {
  return (
    <div className={`player-dash-seg is-${size}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.id)}
          {...(option.tip ? tipAttrs(option.label, option.tip) : {})}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, className = '' }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`player-dash-switch ${className}`} onClick={() => onChange(!checked)}>
      <span className="player-dash-switch__track" aria-hidden="true"><i /></span>
      {label}
    </button>
  );
}

/**
 * One row per ranked metric: value, a strip of every pooled player, and the
 * player's rank. Dots for other players open their pages when a handler is given.
 */
export function RankStrips({ ranks, playerId, playerName, onOpenPlayer }) {
  if (!ranks?.length) return null;
  const count = ranks[0].vals.length;
  return (
    <div className="player-dash-ranks">
      {ranks.map((rank) => {
        const me = rank.vals.find((entry) => entry.id === String(playerId));
        const values = rank.vals.map((entry) => entry.v);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        const left = (value) => (rank.dir > 0 ? (value - min) / span : (max - value) / span) * 100;
        return (
          <div key={rank.key} className="player-dash-rank">
            <span className="player-dash-rank__label">{rank.label}</span>
            <span className="player-dash-rank__value">{me ? `${fmt(me.v, rank.dp)}${rank.suffix}` : '–'}</span>
            <div className="player-dash-rank__strip" role="img" aria-label={me ? `${rank.label}: ${playerName} ranks ${ordinal(me.r)} of ${count}` : `${rank.label}: not in this pool`}>
              <span className="player-dash-rank__axis" />
              <span className="player-dash-rank__ends" aria-hidden="true"><span>Worst</span><span>Best</span></span>
              {rank.vals.map((entry) => {
                const isMe = entry.id === String(playerId);
                // Inset 8px each side so end dots stay inside the strip.
                const style = { left: `calc(8px + (100% - 16px) * ${(left(entry.v) / 100).toFixed(4)})` };
                const tip = tipAttrs(`${entry.n} · ${entry.t}`, [`${fmt(entry.v, rank.dp)}${rank.suffix} · ${ordinal(entry.r)}`, !isMe && onOpenPlayer ? 'Select to open his stats page' : null]);
                return onOpenPlayer && !isMe ? (
                  <button
                    key={entry.id}
                    type="button"
                    className="player-dash-rank__dot"
                    style={style}
                    aria-label={`${entry.n}, ${entry.t}: ${fmt(entry.v, rank.dp)}${rank.suffix}, ${ordinal(entry.r)}. Open player page`}
                    onClick={() => onOpenPlayer(entry)}
                    {...tip}
                  />
                ) : (
                  <span key={entry.id} className={`player-dash-rank__dot ${isMe ? 'is-me' : ''}`} style={style} {...tip} />
                );
              })}
            </div>
            <span className="player-dash-rank__rank">
              {me ? (
                <>
                  <span className={`player-dash-badge ${me.r <= 5 ? 'is-top' : ''}`}>{ordinal(me.r)}</span>
                  <span className="player-dash-faint"> of {count}</span>
                </>
              ) : <span className="player-dash-faint">Not ranked</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal rate bars ("moved chains on 3rd down", "pressure rate by quarter"). */
export function RateRows({ rows, selected, onSelect }) {
  return (
    <div className="player-dash-rates">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className="player-dash-rate"
          aria-pressed={selected === row.key}
          onClick={() => onSelect?.(row.key)}
          {...tipAttrs(row.tipTitle ?? row.label, row.tip)}
        >
          <span className="player-dash-rate__label">{row.label}</span>
          <span className="player-dash-rate__track"><i style={{ width: `${Math.max(0, Math.min(100, row.fill))}%` }} /></span>
          <span className="player-dash-rate__value"><b><Tween text={row.value} /></b>{row.detail ? ` · ${row.detail}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Share rows: who he threw to, who threw to him, which QBs he got to. Rows with
 * `empty` stay in place, dimmed, so a cross-filter shrinks bars instead of reordering them.
 */
export function ShareTree({ rows, selected, onSelect, outerLabel, innerLabel }) {
  const max = Math.max(...rows.map((row) => row.outer), 1);
  if (!rows.length) return <div className="player-dash-empty">No plays charted yet.</div>;
  return (
    <>
      <div className="player-dash-tree">
        {rows.map((row) => (
          <button key={row.key} type="button" className={`player-dash-tree__row ${row.empty ? 'is-empty' : ''}`} aria-pressed={selected === row.key} onClick={() => onSelect?.(row.key)}>
            <span className="player-dash-tree__name">
              <span className="player-dash-tree__full">{row.name}</span>
              {row.sub && <small>{row.sub}</small>}
            </span>
            <span className="player-dash-tree__share" {...tipAttrs(row.name, row.tip)}>
              <b style={{ width: `${(row.outer / max) * 100}%` }} />
              <i style={{ width: `${(row.inner / max) * 100}%` }} />
            </span>
            <span className="player-dash-tree__value"><b><Tween text={row.value} /></b>{row.detail ? ` ${row.detail}` : ''}</span>
          </button>
        ))}
      </div>
      <div className="player-dash-legend">
        <span><i className="is-me" />{innerLabel}</span>
        <span><i className="is-me-soft" />{outerLabel}</span>
      </div>
    </>
  );
}

/**
 * Deep/short × left/middle/right grid, shaded by the chosen metric.
 * `zones` maps zone key → { value, big, small, tipTitle, tip }.
 */
export function ZoneField({ zones, selected, onSelect, metricControl, footnote }) {
  const values = ZONES.map((key) => zones[key]?.value).filter((value) => value != null);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const cell = (key) => {
    const zone = zones[key] ?? {};
    const strength = zone.value == null ? 0 : (zone.value - min) / ((max - min) || 1);
    return (
      <button
        key={key}
        type="button"
        className={`player-dash-zone ${strength > 0.5 ? 'is-strong' : ''}`}
        style={{ '--zone-mix': `${Math.round(10 + strength * 80)}%` }}
        aria-pressed={selected === key}
        onClick={() => onSelect?.(selected === key ? null : key)}
        {...tipAttrs(zone.tipTitle ?? key.replace('-', ' '), zone.tip)}
      >
        <span className="player-dash-zone__big"><Tween text={zone.big ?? '–'} /></span>
        <span className="player-dash-zone__small">{zone.small ?? ''}</span>
      </button>
    );
  };
  return (
    <div className="player-dash-zones">
      {metricControl}
      <div className="player-dash-zone-field">
        <span />
        <span className="player-dash-zone-field__head">Left</span>
        <span className="player-dash-zone-field__head">Middle</span>
        <span className="player-dash-zone-field__head">Right</span>
        <span className="player-dash-zone-field__head is-side" {...tipAttrs('Deep', '15+ yards past the line of scrimmage')}>Deep</span>
        {ZONES.slice(0, 3).map(cell)}
        <span className="player-dash-zone-field__head is-side">Short</span>
        {ZONES.slice(3).map(cell)}
        <span />
        <div className="player-dash-zone-field__los"><span>Line of scrimmage</span></div>
      </div>
      {footnote && <p className="player-dash-coverage">{footnote}</p>}
    </div>
  );
}

/** Situational splits: grouped rows with a shared column set. */
export function SplitTable({ columns, groups, note }) {
  return (
    <>
      <div className="player-dash-table-wrap">
        <table className="player-dash-table">
          <thead>
            <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <SplitGroup key={group.label} group={group} span={columns.length} />
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="player-dash-coverage">{note}</p>}
    </>
  );
}

function SplitGroup({ group, span }) {
  const rows = group.rows.filter((row) => row.cells);
  if (!rows.length) return null;
  return (
    <>
      <tr className="player-dash-table__group"><th colSpan={span} scope="colgroup">{group.label}</th></tr>
      {rows.map((row) => (
        <tr key={row.label}>
          <th scope="row">{row.label}</th>
          {row.cells.map((cell, index) => <td key={index} className={row.strong === index ? 'is-strong' : ''}>{cell}</td>)}
        </tr>
      ))}
    </>
  );
}
