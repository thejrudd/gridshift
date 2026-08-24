import { useEffect } from 'react';
import { ROOKIE_GAME_LOGS_2026 } from '../../data/rookieGameLogs.generated.js';
import { ROOKIE_PRODUCTION_2026 } from '../../data/rookieProduction.generated.js';
import { playerPhotoUrl, photoFallback } from './scoutUtils';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

const STAT_LABELS = {
  attempts: 'Att',
  carries: 'Car',
  completions: 'Cmp',
  defInterceptions: 'INT',
  extraPointsAttempted: 'XPA',
  extraPointsMade: 'XPM',
  fieldGoalsAttempted: 'FGA',
  fieldGoalsMade: 'FGM',
  forcedFumbles: 'FF',
  fumbleRecoveries: 'FR',
  interceptions: 'INT',
  kickReturnYards: 'KR Yds',
  passTDs: 'Pass TD',
  passYards: 'Pass Yds',
  passesDefended: 'PD',
  puntYards: 'Punt Yds',
  receptions: 'Rec',
  recTDs: 'Rec TD',
  recYards: 'Rec Yds',
  rushTDs: 'Rush TD',
  rushYards: 'Rush Yds',
  sacks: 'Sacks',
  soloTackles: 'Solo',
  tacklesForLoss: 'TFL',
  totalTackles: 'Tackles',
};

const STAT_PRIORITY = [
  'passYards', 'passTDs', 'interceptions',
  'rushYards', 'rushTDs', 'carries',
  'recYards', 'recTDs', 'receptions',
  'totalTackles', 'sacks', 'tacklesForLoss', 'defInterceptions', 'passesDefended',
  'fieldGoalsMade', 'fieldGoalsAttempted', 'extraPointsMade', 'punts', 'puntYards',
];

function orderedStatEntries(stats = {}) {
  return Object.entries(stats)
    .filter(([, value]) => value != null)
    .sort(([a], [b]) => {
      const ai = STAT_PRIORITY.indexOf(a);
      const bi = STAT_PRIORITY.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
}

function formatRecord(record) {
  if (!record) return '—';
  if (typeof record === 'string') return record;
  if (record.wins == null || record.losses == null) return '—';
  return `${record.wins}-${record.losses}`;
}

function resultOutcome(result) {
  if (typeof result !== 'string') return null;
  if (result.startsWith('W ')) return 'wins';
  if (result.startsWith('L ')) return 'losses';
  return null;
}

function addStats(target, stats = {}) {
  for (const [key, value] of Object.entries(stats)) {
    if (value == null) continue;
    target[key] = (target[key] ?? 0) + value;
  }
}

function buildGameLogSeasons(games = []) {
  const bySeason = new Map();

  for (const game of games) {
    const key = `${game.year ?? 'Unknown'}-${game.team ?? 'Unknown'}`;
    const season = bySeason.get(key) ?? {
      year: game.year ?? 'Unknown',
      team: game.team ?? 'Unknown',
      importedGames: 0,
      record: { wins: 0, losses: 0 },
      stats: {},
      isGameLogSummary: true,
    };
    const outcome = resultOutcome(game.result);
    if (outcome) season.record[outcome] += 1;
    season.importedGames += 1;
    addStats(season.stats, game.stats);
    bySeason.set(key, season);
  }

  return [...bySeason.values()].sort((a, b) => {
    if (a.year !== b.year) return Number(a.year) - Number(b.year);
    return String(a.team).localeCompare(String(b.team));
  });
}

function formatSeasonSecondary(season) {
  if (season.isGameLogSummary) {
    const games = season.importedGames ?? 0;
    const gameText = `${games} game${games === 1 ? '' : 's'} shown`;
    const record = formatRecord(season.record);
    return record === '—' ? gameText : `${gameText} · W-L ${record}`;
  }
  return season.record ? `Record ${formatRecord(season.record)}` : 'Record unavailable';
}

function StatPills({ stats, limit = 6 }) {
  const entries = orderedStatEntries(stats).slice(0, limit);
  if (!entries.length) return <span className="scout-stats-empty-inline">No stats</span>;

  return (
    <div className="scout-stats-pills">
      {entries.map(([key, value]) => (
        <span key={key} className="scout-stats-pill">
          <span>{STAT_LABELS[key] ?? key}</span>
          <strong>{Number(value).toLocaleString()}</strong>
        </span>
      ))}
    </div>
  );
}

function formatProductionYears(seasons = []) {
  if (!seasons.length) return 'Latest';
  const sorted = [...new Set(seasons)].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

function formatProductionTeams(teams = [], fallbackTeam) {
  const uniqueTeams = [...new Set(teams.filter(Boolean))];
  if (!uniqueTeams.length) return fallbackTeam;
  return uniqueTeams.join(' / ');
}

function buildProductionRows(player) {
  if (!player?.collegeStats) return [];

  const production = ROOKIE_PRODUCTION_2026[player.id];

  return [{
    year: formatProductionYears(production?.cfbd?.seasons),
    team: formatProductionTeams(production?.cfbd?.teams, player.college),
    record: null,
    stats: player.collegeStats,
    source: production?.source ?? player.sources?.collegeProduction ?? null,
    isProductionSummary: true,
  }];
}

function seasonProductionMessage() {
  return 'Career college totals from available season data.';
}

function emptyWeeklyLogMessage() {
  return 'Game-by-game stats are not available for this player yet.';
}

export default function ScoutStatisticsModal({ player, onClose }) {
  useBodyScrollLock();

  const data = player ? ROOKIE_GAME_LOGS_2026[player.id] : null;
  const games = data?.games ?? [];
  const gameLogSeasons = buildGameLogSeasons(games);
  const productionRows = buildProductionRows(player);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!player) return null;

  return (
    <div className="scout-stats-modal-overlay" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} college statistics`}
        className="scout-stats-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="scout-stats-modal-header">
          <div className="scout-stats-player">
            <img
              src={playerPhotoUrl(player)}
              onError={photoFallback}
              alt=""
              className="scout-stats-photo"
            />
            <div>
              <div className="scout-stats-kicker">College Statistics</div>
              <h3>{player.name}</h3>
              <p>{player.position} · {player.college}</p>
            </div>
          </div>
          <button type="button" className="scout-sheet-close" onClick={onClose} aria-label="Close statistics">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="scout-stats-modal-body">
          {productionRows.length > 0 ? (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Season Production</div>
              <p className="scout-stats-section-note">
                {seasonProductionMessage()}
              </p>
              <div className="scout-stats-season-list">
                {productionRows.map(season => (
                  <div key={`${season.year}-${season.team}`} className="scout-stats-season-row">
                    <div>
                      <div className="scout-stats-season-primary">{season.year} · {season.team}</div>
                      <div className="scout-stats-season-secondary">
                        Season totals
                      </div>
                    </div>
                    <StatPills stats={season.stats} limit={99} />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="scout-empty">
              {emptyWeeklyLogMessage()}
            </div>
          )}

          {gameLogSeasons.length > 0 && (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Game Summary</div>
              <p className="scout-stats-section-note">
                Game-by-game coverage may be incomplete.
              </p>
              <div className="scout-stats-season-list">
                {gameLogSeasons.map(season => (
                  <div key={`${season.year}-${season.team}`} className="scout-stats-season-row">
                    <div>
                      <div className="scout-stats-season-primary">{season.year} · {season.team}</div>
                      <div className="scout-stats-season-secondary">
                        {formatSeasonSecondary(season)}
                      </div>
                    </div>
                    <StatPills stats={season.stats} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {games.length > 0 ? (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Week by Week</div>
              <div className="scout-stats-game-list">
                {games.map(game => (
                  <div key={`${game.year}-${game.week}-${game.team}-${game.opponent}`} className="scout-stats-game-row">
                    <div className="scout-stats-game-meta">
                      <span>{game.week != null ? `Week ${game.week}` : 'Week unavailable'}</span>
                      <strong>{game.team} {game.result ?? ''} {game.opponent}</strong>
                      <span>{[game.year, game.seasonType].filter(Boolean).join(' · ') || 'Season unavailable'}</span>
                    </div>
                    <StatPills stats={game.stats} limit={5} />
                  </div>
                ))}
              </div>
            </section>
          ) : productionRows.length > 0 && (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Week by Week</div>
              <div className="scout-empty">
                {emptyWeeklyLogMessage()}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
