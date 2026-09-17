import { useState } from 'react';
import Modal from '../Modal.jsx';
import { useFantasyLeague } from '../../context/SleeperContext.jsx';
import useGameWeekExport from '../../hooks/useGameWeekExport.js';

const STATUS_LABELS = {
  complete: 'Complete',
  partial: 'Partial',
  unavailable: 'Unavailable',
  not_requested: 'Not included',
  'selected-season-only': 'Selected season',
};

function clampWeek(value, maxWeek) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(maxWeek, Math.max(1, parsed));
}

function coverageLabel(value) {
  return STATUS_LABELS[value] ?? value ?? 'Unknown';
}

function coverageTone(value) {
  if (value === 'complete') return 'complete';
  if (value === 'partial') return 'partial';
  return 'muted';
}

export default function GameWeekExportModal({ initialWeek = null, onClose }) {
  const { league, season } = useFantasyLeague();
  const {
    status,
    progress,
    error,
    result,
    busy,
    runExport,
    cancel,
  } = useGameWeekExport();
  const maxWeek = Math.min(22, Math.max(1, Number(league?.settings?.matchup_periods) || 18));
  const defaultWeek = clampWeek(
    initialWeek ?? league?.settings?.last_scored_leg ?? 1,
    maxWeek,
  ) ?? 1;
  const [week, setWeek] = useState(defaultWeek);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includeMarketValues, setIncludeMarketValues] = useState(true);
  const [nflDetail, setNflDetail] = useState('box_score');

  const handleClose = () => {
    if (busy) cancel();
    onClose();
  };

  const handleExport = async () => {
    try {
      await runExport({ week, includeHistory, includeMarketValues, nflDetail });
    } catch {
      // The hook owns the visible error state. Keep the sheet open so the user
      // can change the scope or retry without losing their selections.
    }
  };

  const coverageRows = result ? [
    ['Player stats', result.coverage?.weeklyPlayerStats?.status],
    ['Fantasy outcomes', result.coverage?.fantasyMatchups?.status],
    ['NFL scoreboard', result.coverage?.nflGames?.status],
    ['NFL box scores', result.coverage?.nflBoxScores],
    ['League records', result.coverage?.leagueHistory?.status],
    ['Market values', result.coverage?.marketValues?.status],
  ] : [];

  return (
    <Modal
      onClose={handleClose}
      mobileSheet
      ariaLabel="Stats export"
      containerClassName="game-week-export-modal"
      containerStyle={{ background: 'var(--color-bg-secondary)', maxWidth: '680px' }}
    >
      <div className="game-week-export__header">
        <div className="min-w-0">
          <span className="game-week-export__eyebrow">Fantasy / Actions</span>
          <h2>Stats Export</h2>
          <p>
            Download one stable JSON handoff with the week&apos;s fantasy evidence,
            records, NFL context, and source coverage for your LLM.
          </p>
        </div>
        <button
          type="button"
          className="game-week-export__close"
          onClick={handleClose}
          aria-label="Close stats export"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="game-week-export__body">
        <div className="game-week-export__scope">
          <div>
            <span className="game-week-export__section-label">Export scope</span>
            <strong>{String(season ?? league?.season ?? '')} season</strong>
            <span className="game-week-export__scope-note">
              {league?.name ?? 'Connected league'} · selected week snapshot
            </span>
          </div>
          <label className="game-week-export__select-field">
            <span>Fantasy week</span>
            <select
              value={week}
              onChange={(event) => setWeek(Number(event.target.value))}
              disabled={busy}
            >
              {Array.from({ length: maxWeek }, (_, index) => index + 1).map((optionWeek) => (
                <option key={optionWeek} value={optionWeek}>Week {optionWeek}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="game-week-export__options">
          <label className="game-week-export__check-row">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(event) => setIncludeHistory(event.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>League history and records</strong>
              <small>Include linked seasons, standings, champions, rivalries, and record book evidence.</small>
            </span>
          </label>
          <label className="game-week-export__check-row">
            <input
              type="checkbox"
              checked={includeMarketValues}
              onChange={(event) => setIncludeMarketValues(event.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>Current market values</strong>
              <small>Include a point-in-time KeepTradeCut snapshot when the source is available.</small>
            </span>
          </label>
        </div>

        <label className="game-week-export__detail-field">
          <span className="game-week-export__section-label">NFL detail</span>
          <select value={nflDetail} onChange={(event) => setNflDetail(event.target.value)} disabled={busy}>
            <option value="box_score">Scoreboard + box scores</option>
            <option value="full_play_by_play">Scoreboard + box scores + play-by-play</option>
          </select>
          <small>Paid provider capabilities and local quota can make detail partial; coverage is recorded in the file.</small>
        </label>

        {busy && (
          <div className="game-week-export__progress" role="status" aria-live="polite">
            <div className="game-week-export__progress-header">
              <span>{progress.label || 'Preparing stats export'}</span>
              <span className="tabular-nums">{progress.completed}/{progress.total}</span>
            </div>
            <div className="game-week-export__progress-track" aria-hidden="true">
              <div
                className="game-week-export__progress-value"
                style={{ width: `${Math.min(100, Math.max(0, (progress.completed / Math.max(1, progress.total)) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="game-week-export__error" role="alert">
            <strong>Export needs attention</strong>
            <span>{error}</span>
          </div>
        )}

        {result && status === 'ready' && (
          <div className="game-week-export__result" role="status" aria-live="polite">
            <div className="game-week-export__result-heading">
              <div>
                <span className="game-week-export__section-label">Bundle ready</span>
                <strong>JSON downloaded</strong>
              </div>
              <span className="game-week-export__result-badge">{result.storylineSignals?.length ?? 0} signals</span>
            </div>
            <div className="game-week-export__coverage" aria-label="Export coverage">
              {coverageRows.map(([label, value]) => (
                <div key={label} className="game-week-export__coverage-row">
                  <span>{label}</span>
                  <strong className={`is-${coverageTone(value)}`}>{coverageLabel(value)}</strong>
                </div>
              ))}
            </div>
            {result.warnings?.length > 0 && (
              <p className="game-week-export__warning-note">
                {result.warnings.length} coverage warning{result.warnings.length === 1 ? '' : 's'} are preserved in the JSON.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="game-week-export__footer">
        <button type="button" className="game-week-export__secondary-button" onClick={handleClose}>
          {busy ? 'Cancel export' : 'Close'}
        </button>
        <button
          type="button"
          className="game-week-export__primary-button"
          onClick={handleExport}
          disabled={busy}
        >
          {busy ? 'Preparing…' : result ? 'Download again' : 'Download JSON'}
        </button>
      </div>
    </Modal>
  );
}
