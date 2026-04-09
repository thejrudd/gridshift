import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { fetchRoster } from '../../utils/playerApi';
import { parseSearchQuery, matchesFilter } from '../../utils/parseSearchQuery';
import { TEAM_COLORS } from '../../data/teamColors';
import { useTheme } from '../../context/ThemeContext';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

const ESPN_TEAM_MAP = { lar: 'la', was: 'wsh' };
function toTeamKey(espnTeamId) {
  if (!espnTeamId) return '';
  const lower = espnTeamId.toLowerCase();
  return ESPN_TEAM_MAP[lower] ?? lower;
}

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function buildTeamLookup(teams = []) {
  const map = {};
  for (const team of teams) {
    const id = team.id.toLowerCase();
    map[id] = {
      division: team.division,
      conference: team.division?.split(' ')[0] ?? '',
      teamName: team.name,
    };
  }
  return map;
}

function buildSearchCorpusKey(teams = []) {
  return teams.map((team) => team.id.toLowerCase()).sort().join('|');
}

let compareSearchCorpusCacheKey = '';
let compareSearchCorpusCache = null;
let compareSearchCorpusPromise = null;

async function loadCompareSearchCorpus(teams, teamLookup) {
  const cacheKey = buildSearchCorpusKey(teams);
  if (!cacheKey) return [];

  if (compareSearchCorpusCacheKey === cacheKey && compareSearchCorpusCache) {
    return compareSearchCorpusCache;
  }
  if (compareSearchCorpusCacheKey === cacheKey && compareSearchCorpusPromise) {
    return compareSearchCorpusPromise;
  }

  compareSearchCorpusCacheKey = cacheKey;
  compareSearchCorpusPromise = Promise.all(
    teams.map((team) =>
      fetchRoster(team.id)
        .then((players) => players.map((player) => {
          const teamId = team.id.toLowerCase();
          const teamInfo = teamLookup[teamId] ?? {};
          return {
            ...player,
            teamId,
            teamName: teamInfo.teamName ?? team.name,
            division: teamInfo.division ?? '',
            conference: teamInfo.conference ?? '',
            searchName: (player.displayName ?? '').toLowerCase(),
          };
        }))
        .catch(() => [])
    )
  ).then((allRosters) => {
    const corpus = allRosters.flat();
    compareSearchCorpusCache = corpus;
    compareSearchCorpusPromise = null;
    return corpus;
  }).catch((error) => {
    compareSearchCorpusPromise = null;
    throw error;
  });

  return compareSearchCorpusPromise;
}

// ── Search guide chips ────────────────────────────────────────────────────────

const GUIDE_SECTIONS = [
  {
    label: 'By player name',
    chips: ['Patrick Mahomes', 'Josh', 'Jefferson'],
  },
  {
    label: 'By team — nickname, city, or abbreviation',
    chips: ['Bears', 'Detroit', 'KC', '49ers', 'New England'],
  },
  {
    label: 'By position — abbreviation, full name, or plural',
    chips: ['QB', 'RBs', 'Wide Receiver', 'Tight Ends', 'Kicker'],
  },
  {
    label: 'By conference or division',
    chips: ['NFC', 'AFC', 'NFC West', 'AFC North'],
  },
  {
    label: 'Combine terms — order doesn\'t matter',
    chips: ['RB Bears', 'QB NFC West', 'WRs in Detroit', 'Receivers on the Chiefs'],
  },
  {
    label: 'Natural language — filler words are ignored',
    chips: ['Running backs in Detroit', 'QBs playing for the Bears', 'Tight ends in the AFC'],
  },
];

function SearchGuide({ onExample }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-5">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
        Search by any combination of name, team, position, conference, or division.
        Tap an example to try it.
      </p>
      {GUIDE_SECTIONS.map(({ label, chips }) => (
        <div key={label}>
          <div
            className="text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--color-label-quaternary)' }}
          >
            {label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(chip => (
              <button
                key={chip}
                onClick={() => onExample(chip)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-opacity active:opacity-60"
                style={{
                  background: 'var(--color-fill)',
                  color: 'var(--color-label-secondary)',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ComparePickerSheet ────────────────────────────────────────────────────────

/**
 * Bottom-sheet player picker that searches ESPN rosters using the shared
 * parseSearchQuery utility. Supports full smart search with guide chips.
 *
 * Props:
 *   teams      - NFL teams array from scheduleData
 *   excludeId  - ESPN player ID to exclude (the other slot's current player)
 *   onSelect   - called with the selected ESPN player object
 *   onClose    - dismiss the sheet
 */
export default function ComparePickerSheet({ teams, excludeId, onSelect, onClose }) {
  const { darkMode } = useTheme();
  useBodyScrollLock();
  const [query, setQuery] = useState('');
  const [searchCorpus, setSearchCorpus] = useState(() => {
    const cacheKey = buildSearchCorpusKey(teams);
    return compareSearchCorpusCacheKey === cacheKey ? (compareSearchCorpusCache ?? []) : null;
  });
  const [corpusLoading, setCorpusLoading] = useState(() => {
    const cacheKey = buildSearchCorpusKey(teams);
    return Boolean(cacheKey && !(compareSearchCorpusCacheKey === cacheKey && compareSearchCorpusCache));
  });
  const deferredQuery = useDeferredValue(query);
  const teamLookup = useMemo(() => buildTeamLookup(teams), [teams]);

  useEffect(() => {
    let isActive = true;
    const cacheKey = buildSearchCorpusKey(teams);

    if (!cacheKey) {
      setSearchCorpus([]);
      setCorpusLoading(false);
      return undefined;
    }

    if (compareSearchCorpusCacheKey === cacheKey && compareSearchCorpusCache) {
      setSearchCorpus(compareSearchCorpusCache);
      setCorpusLoading(false);
      return undefined;
    }

    setCorpusLoading(true);
    loadCompareSearchCorpus(teams, teamLookup)
      .then((corpus) => {
        if (!isActive) return;
        setSearchCorpus(corpus);
        setCorpusLoading(false);
      })
      .catch((err) => {
        if (!isActive) return;
        // eslint-disable-next-line no-console
        console.error('[ComparePickerSheet] corpus load error:', err);
        setSearchCorpus([]);
        setCorpusLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [teamLookup, teams]);

  const results = useMemo(() => {
    const trimmedQuery = deferredQuery.trim();
    if (!trimmedQuery || !searchCorpus?.length) return [];

    const filters = parseSearchQuery(trimmedQuery);
    const hasFilters = filters.pos.size || filters.team.size ||
      filters.div.size || filters.conf.size || filters.name.length;
    if (!hasFilters) return [];

    return searchCorpus.filter((player) => {
      if (String(player.id) === String(excludeId)) return false;
      if (filters.name.length > 0 && !filters.name.every((term) => player.searchName.includes(term))) return false;
      if (filters.pos.size > 0 && ![...filters.pos].some((pos) => matchesFilter(player.position, pos))) return false;
      if (filters.team.size > 0 && !filters.team.has(player.teamId)) return false;
      if (filters.div.size > 0 && !filters.div.has(player.division)) return false;
      if (filters.conf.size > 0 && !filters.conf.has(player.conference)) return false;
      return true;
    }).slice(0, 30);
  }, [deferredQuery, excludeId, searchCorpus]);

  const loading = query.trim().length > 0 && corpusLoading;

  function handleExample(text) {
    setQuery(text);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
    >
      {/* Modal panel — fixed dimensions so search box never shifts */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden w-full"
        style={{
          background: 'var(--color-bg-secondary)',
          maxWidth: '520px',
          height: '72vh',
          maxHeight: '640px',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header + search — always fixed at top */}
        <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-base" style={{ color: 'var(--color-label)' }}>
              Select Player
            </span>
            <button onClick={onClose} className="p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-label-quaternary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder="Name, team, position, or natural language…"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label)',
                fontSize: 16,
              }}
            />
            {loading && (
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4" style={{ color: 'var(--color-accent)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
        </div>

        {/* Results / guide — scrollable, fills remaining height */}
        <div className="overflow-y-auto flex-1">
          {!query.trim() && <SearchGuide onExample={handleExample} />}
          {query.trim() && !loading && results.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: 'var(--color-label-tertiary)' }}>
                No players found for &ldquo;{query}&rdquo;
              </span>
            </div>
          )}
          {results.map(player => {
            const teamKey = toTeamKey(player.teamId);
            const palette = TEAM_COLORS[teamKey] ?? null;
            const teamColor = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
            const isLight = teamColor ? hexLuminance(teamColor) > 0.35 : false;
            return (
              <button
                key={player.id}
                onClick={() => onSelect(player)}
                className="flex items-center w-full px-4 py-3 gap-3 relative overflow-hidden transition-colors"
                style={{
                  borderBottom: '1px solid var(--color-separator)',
                  borderLeft: teamColor ? `3px solid ${teamColor}` : '3px solid transparent',
                  background: teamColor ? `${teamColor}${isLight ? '18' : '22'}` : 'transparent',
                }}
              >
                <PlayerThumb id={player.id} name={player.displayName} />
                <div className="min-w-0 flex-1 text-left relative">
                  {teamKey && (
                    <img
                      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
                      aria-hidden="true"
                      className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
                      style={{ width: 40, height: 40, objectFit: 'contain', opacity: 0.10 }}
                      loading="lazy"
                      decoding="async"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
                    {player.displayName}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                    {player.position}{player.teamName ? ` · ${player.teamName}` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayerThumb({ id, name }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return err ? (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-quaternary)' }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={`https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`}
      alt=""
      className="w-9 h-9 rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill-secondary)' }}
      loading="lazy"
      decoding="async"
      onError={() => setErr(true)}
    />
  );
}
