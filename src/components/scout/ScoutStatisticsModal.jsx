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

function buildFallbackSeasons(player) {
  if (!player?.collegeStats) return [];

  const production = ROOKIE_PRODUCTION_2026[player.id];
  const seasons = production?.cfbd?.seasons?.length ? production.cfbd.seasons : [null];
  const teams = production?.cfbd?.teams?.length ? production.cfbd.teams : [player.college];

  return seasons.map((year, index) => ({
    year: year ?? 'Latest',
    team: teams[index] ?? teams[0] ?? player.college,
    record: null,
    stats: player.collegeStats,
    source: production?.source ?? player.sources?.collegeProduction ?? null,
    isFallback: true,
  }));
}

function isPriorityWeeklyLogTier(player) {
  return player?.tier === 'Elite' || player?.tier === 'Starter';
}

function seasonFallbackMessage(player) {
  if (isPriorityWeeklyLogTier(player)) {
    return 'Showing bundled season production. Weekly logs for Elite and Starter prospects are imported selectively through the CFBD workflow.';
  }
  return 'Showing bundled season production. Weekly logs are prioritized for Elite and Starter prospects, so this profile may only carry season totals by default.';
}

function emptyWeeklyLogMessage(player) {
  if (isPriorityWeeklyLogTier(player)) {
    return 'Weekly college logs are not bundled for this profile yet. Run the selective CFBD game-log importer to add game-by-game rows with opponent and score.';
  }
  return 'Weekly college logs are bundled selectively for Elite and Starter prospects. This profile is currently using season totals only.';
}

export default function ScoutStatisticsModal({ player, onClose }) {
  useBodyScrollLock();

  const data = player ? ROOKIE_GAME_LOGS_2026[player.id] : null;
  const seasons = data?.seasons?.length ? data.seasons : buildFallbackSeasons(player);
  const games = data?.games ?? [];
  const hasSeasonFallback = seasons.some(season => season.isFallback);

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
          {seasons.length > 0 ? (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Season by Season</div>
              {hasSeasonFallback && (
                <p className="scout-stats-section-note">
                  {seasonFallbackMessage(player)}
                </p>
              )}
              <div className="scout-stats-season-list">
                {seasons.map(season => (
                  <div key={`${season.year}-${season.team}`} className="scout-stats-season-row">
                    <div>
                      <div className="scout-stats-season-primary">{season.year} · {season.team}</div>
                      <div className="scout-stats-season-secondary">
                        {season.record ? `Record ${formatRecord(season.record)}` : 'Record unavailable'}
                      </div>
                    </div>
                    <StatPills stats={season.stats} />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="scout-empty">
              {emptyWeeklyLogMessage(player)}
            </div>
          )}

          {games.length > 0 ? (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Week by Week</div>
              <div className="scout-stats-game-list">
                {games.map(game => (
                  <div key={`${game.year}-${game.week}-${game.team}-${game.opponent}`} className="scout-stats-game-row">
                    <div className="scout-stats-game-meta">
                      <span>Week {game.week}</span>
                      <strong>{game.team} {game.result ?? ''} {game.opponent}</strong>
                      <span>{game.year} · {game.seasonType}</span>
                    </div>
                    <StatPills stats={game.stats} limit={5} />
                  </div>
                ))}
              </div>
            </section>
          ) : seasons.length > 0 && (
            <section className="scout-stats-section">
              <div className="scout-stats-section-title">Week by Week</div>
              <div className="scout-empty">
                {emptyWeeklyLogMessage(player)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
