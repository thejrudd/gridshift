import { useState, useEffect } from 'react';
import { fetchRoster, fetchDepthChart, headshot } from '../utils/playerApi';
import { TEAM_COLORS } from '../data/teamColors.js';
import { TEAM_HISTORY } from '../data/teamHistory.js';
import { useTheme } from '../context/ThemeContext';

// ── Color helpers (duplicated from PlayerProfile to keep components self-contained) ──

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Position groupings ────────────────────────────────────────────────────────

const POSITION_GROUPS = [
  { label: 'Quarterbacks',    positions: ['QB'] },
  { label: 'Running Backs',   positions: ['RB', 'FB', 'HB'] },
  { label: 'Wide Receivers',  positions: ['WR'] },
  { label: 'Tight Ends',      positions: ['TE'] },
  { label: 'Offensive Line',  positions: ['OT', 'OG', 'C', 'OL', 'G', 'T'] },
  { label: 'Defensive Line',  positions: ['DE', 'DT', 'NT', 'DL', 'ED'] },
  { label: 'Linebackers',     positions: ['LB', 'ILB', 'OLB', 'MLB'] },
  { label: 'Defensive Backs', positions: ['CB', 'S', 'SS', 'FS', 'DB'] },
  { label: 'Kickers',         positions: ['K'] },
  { label: 'Specialists',     positions: ['P', 'LS'] },
];

// Positions shown in the "key players" strip — one starter each
const FEATURED_POSITIONS = [
  { key: 'QB',  match: p => p.position === 'QB' },
  { key: 'RB',  match: p => ['RB', 'FB', 'HB'].includes(p.position) },
  { key: 'WR',  match: p => p.position === 'WR' },
  { key: 'TE',  match: p => p.position === 'TE' },
  { key: 'DL',  match: p => ['DE', 'DT', 'NT', 'DL', 'ED'].includes(p.position) },
  { key: 'LB',  match: p => ['LB', 'ILB', 'OLB', 'MLB'].includes(p.position) },
  { key: 'CB',  match: p => p.position === 'CB' },
  { key: 'S',   match: p => ['S', 'SS', 'FS'].includes(p.position) },
  { key: 'K',   match: p => p.position === 'K' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamPage({ team, onBack, onSelectPlayer }) {
  const { darkMode } = useTheme();

  const [roster, setRoster]       = useState(null);
  const [depthChart, setDepthChart] = useState({});
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set(['Quarterbacks']));

  const teamKey = team.id.toLowerCase();
  const palette = TEAM_COLORS[teamKey];
  const history = TEAM_HISTORY[teamKey];

  const heroBg     = palette ? (darkMode ? palette.darkPrimary   : palette.primary)   : '#1C2332';
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary)  : '#F5B700';
  const heroOnBg   = hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroMuted  = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.60)';
  const podBg      = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.12)' : 'rgba(12,15,20,0.10)';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchRoster(team.id),
      fetchDepthChart(team.id).catch(() => ({})),
    ])
      .then(([players, dc]) => { setRoster(players); setDepthChart(dc); })
      .catch(() => setLoadError('Failed to load roster.'))
      .finally(() => setLoading(false));
  }, [team.id]);

  const toggleGroup = (label) =>
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // One starter per featured position, sorted by depth chart rank
  const featuredPlayers = (() => {
    if (!roster) return [];
    const byDepth = [...roster].sort((a, b) => {
      // 1. Explicit depth chart rank (most reliable when the API has data)
      const da = depthChart[a.id] ?? Infinity;
      const db = depthChart[b.id] ?? Infinity;
      if (da !== db) return da - db;
      // 2. ESPN roster order within the position group (implicit depth — reflects
      //    prior-season snap-count/usage ordering in ESPN's system)
      const ra = a.rosterOrder ?? Infinity;
      const rb = b.rosterOrder ?? Infinity;
      if (ra !== rb) return ra - rb;
      // 3. Experience as a last resort
      return (b.experience ?? 0) - (a.experience ?? 0);
    });
    const seen = new Set();
    const result = [];
    for (const { key, match } of FEATURED_POSITIONS) {
      const player = byDepth.find(p => match(p) && !seen.has(p.id));
      if (player) { seen.add(player.id); result.push({ ...player, posLabel: key }); }
    }
    return result;
  })();

  // Full roster grouped by position, sorted by depth chart rank within each group
  const rosterGroups = POSITION_GROUPS.map(group => ({
    ...group,
    players: (roster ?? [])
      .filter(p => group.positions.includes(p.position))
      .sort((a, b) => (depthChart[a.id] ?? Infinity) - (depthChart[b.id] ?? Infinity)),
  })).filter(g => g.players.length > 0);

  return (
    <div className="space-y-5">

      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--color-accent)' }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Statistics
      </button>

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden shadow-lg relative"
        style={{
          background: `linear-gradient(135deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.35)} 100%)`,
          borderLeft: `4px solid ${heroAccent}`,
        }}
      >
        {/* City map background — full-bleed, very low opacity */}
        <img
          src={`/maps/${teamKey}.png`}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.12, mixBlendMode: 'luminosity' }}
          onError={e => { e.target.style.display = 'none'; }}
        />

        {/* Watermark logo — desktop only */}
        <div
          className="absolute inset-y-0 right-0 hidden sm:flex items-center pointer-events-none"
          aria-hidden="true"
          style={{ paddingRight: '20px' }}
        >
          <img
            src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
            alt=""
            style={{ width: '180px', height: '180px', objectFit: 'contain', opacity: 0.11 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>

        <div className="p-6 relative">
          {/* Team identity */}
          <div className="flex items-center gap-4 mb-5">
            <img
              src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
              alt={team.name}
              className="w-16 h-16 object-contain shrink-0"
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div>
              <h1
                className="font-display font-bold leading-none"
                style={{ fontSize: '26px', letterSpacing: '0.06em', color: heroOnBg }}
              >
                {team.name.toUpperCase()}
              </h1>
              {history && (
                <p style={{ fontSize: '13px', color: heroMuted, marginTop: '3px' }}>
                  {history.city}, {history.state} · Est. {history.founded} · {history.stadium}
                </p>
              )}
            </div>
          </div>

          {/* Championship pods */}
          {history && (
            <div className="flex flex-wrap gap-3 mb-4">
              <ChampPod
                count={history.superBowls}
                label={history.superBowls === 1 ? 'Super Bowl' : 'Super Bowls'}
                note={history.superBowlYears.length > 0 ? history.superBowlYears.join(', ') : null}
                icon="🏆"
                onBg={heroOnBg}
                muted={heroMuted}
                podBg={podBg}
              />
              <ChampPod
                count={history.conferenceChamps}
                label={history.conferenceChamps === 1 ? 'Conf. Title' : 'Conf. Titles'}
                icon="🏅"
                onBg={heroOnBg}
                muted={heroMuted}
                podBg={podBg}
              />
              <ChampPod
                count={history.divisionTitles}
                label={history.divisionTitles === 1 ? 'Div. Title' : 'Div. Titles'}
                icon="📋"
                onBg={heroOnBg}
                muted={heroMuted}
                podBg={podBg}
              />
              {history.superBowlAppearances > history.superBowls && (
                <ChampPod
                  count={history.superBowlAppearances}
                  label={history.superBowlAppearances === 1 ? 'SB Appearance' : 'SB Appearances'}
                  icon="🎖️"
                  onBg={heroOnBg}
                  muted={heroMuted}
                  podBg={podBg}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Team highlights ───────────────────────────────────────────────── */}
      {history?.facts?.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--color-bg-secondary)', borderLeft: `3px solid ${heroAccent}` }}
        >
          <h2
            className="text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ color: heroAccent }}
          >
            Team Highlights
          </h2>
          <ul className="space-y-2.5">
            {history.facts.map((fact, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-sm leading-relaxed"
                style={{ color: 'var(--color-label-secondary)' }}
              >
                <span style={{ color: heroAccent, flexShrink: 0, fontWeight: 700 }}>—</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Loading / error ───────────────────────────────────────────────── */}
      {loading && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-label-tertiary)' }}>
          Loading roster…
        </div>
      )}
      {loadError && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-accent-red)' }}>
          {loadError}
        </div>
      )}

      {roster && (
        <>
          {/* ── Key players strip ─────────────────────────────────────────── */}
          {featuredPlayers.length > 0 && (
            <section>
              <h2
                className="text-[10px] font-bold uppercase tracking-widest mb-3"
                style={{ color: heroAccent }}
              >
                Key Players
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                {featuredPlayers.map(player => (
                  <FeaturedCard
                    key={player.id}
                    player={player}
                    accentColor={heroAccent}
                    onClick={() => onSelectPlayer(player)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Full roster by position ───────────────────────────────────── */}
          <section>
            <h2
              className="text-[10px] font-bold uppercase tracking-widest mb-3"
              style={{ color: heroAccent }}
            >
              Full Roster
            </h2>
            <div className="space-y-2">
              {rosterGroups.map(group => (
                <RosterGroup
                  key={group.label}
                  group={group}
                  expanded={expandedGroups.has(group.label)}
                  onToggle={() => toggleGroup(group.label)}
                  accentColor={heroAccent}
                  onSelectPlayer={onSelectPlayer}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChampPod({ count, label, note, icon, onBg, muted, podBg }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2"
      style={{ background: podBg }}
    >
      <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
      <div>
        <div className="text-lg font-bold leading-none" style={{ color: onBg }}>{count}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: muted }}>
          {label}
        </div>
        {note && (
          <div className="text-[9px] tabular-nums" style={{ color: muted, marginTop: '1px' }}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedCard({ player, accentColor, onClick }) {
  const [imgErr, setImgErr] = useState(false);
  const initials = (player.displayName ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const lastName = player.displayName?.split(' ').slice(1).join(' ') || player.displayName;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center rounded-xl p-2.5 text-center transition-opacity active:opacity-60 w-full"
      style={{ background: 'var(--color-bg-secondary)' }}
    >
      {imgErr ? (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-1.5"
          style={{ background: accentColor ? `${accentColor}22` : 'var(--color-fill)' }}
        >
          <span className="text-xs font-bold" style={{ color: accentColor ?? 'var(--color-label-secondary)' }}>
            {initials}
          </span>
        </div>
      ) : (
        <img
          src={headshot(player.id)}
          alt={player.displayName}
          className="w-12 h-12 rounded-full object-cover mb-1.5"
          style={{ background: 'var(--color-fill)' }}
          onError={() => setImgErr(true)}
        />
      )}
      <div
        className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
        style={{ color: accentColor ?? 'var(--color-label-tertiary)' }}
      >
        {player.posLabel}
      </div>
      <div
        className="text-[11px] font-semibold leading-tight w-full truncate"
        style={{ color: 'var(--color-label)' }}
      >
        {lastName}
      </div>
    </button>
  );
}

function RosterGroup({ group, expanded, onToggle, accentColor, onSelectPlayer }) {
  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      style={expanded && accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : undefined}
    >
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <span
          className="font-semibold text-sm shrink-0"
          style={{ color: 'var(--color-label)' }}
        >
          {group.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
            {group.players.length}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            style={{ color: 'var(--color-label-tertiary)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Player rows */}
      {expanded && (
        <div className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
          {group.players.map(player => (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
            >
              <PlayerThumb id={player.id} name={player.displayName} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
                  {player.displayName}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                  {player.position}{player.jersey ? ` · #${player.jersey}` : ''}
                </div>
              </div>
              <svg
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-label-quaternary)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerThumb({ id, name }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return err ? (
    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold text-gray-400">{initials}</span>
    </div>
  ) : (
    <img
      src={headshot(id)}
      alt=""
      className="w-8 h-8 rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill)' }}
      onError={() => setErr(true)}
    />
  );
}
