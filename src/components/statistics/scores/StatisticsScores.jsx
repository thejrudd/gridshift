import { useEffect, useMemo, useRef, useState } from 'react';
import useMediaQuery from '../../../hooks/useMediaQuery';
import useHorizontalScrollCue from '../../../hooks/useHorizontalScrollCue';
import HorizontalScrollCue from '../../HorizontalScrollCue';
import SeasonPhaseToggle from '../SeasonPhaseToggle';
import {
  NFL_SEASON_PHASES,
  fetchEspnPreseason,
  fetchEspnScoreboardWeek,
  readStoredNflSeasonPhase,
  replaceEspnScoreboardWeek,
  writeStoredNflSeasonPhase,
} from '../../../utils/espnNflScoreboard';
import {
  SCORES_FIXTURE_CURRENT_WEEK,
  SCORES_FIXTURE_SEASONS,
  STATISTICS_SCORES_FIXTURE,
} from '../../../data/statisticsScoresFixtures';
import ScoresSeasonBoard from './ScoresSeasonBoard';
import ScoresGameDrilldown from './ScoresGameDrilldown';
import './StatisticsScores.css';

const LIVE_REFRESH_INTERVAL_MS = 30_000;
const PLACEHOLDER_DATA_ENABLED = import.meta.env.DEV || import.meta.env.MODE === 'test';
const PRODUCTION_SEASON = new Date().getFullYear();
const AVAILABLE_SEASONS = PLACEHOLDER_DATA_ENABLED ? SCORES_FIXTURE_SEASONS : [PRODUCTION_SEASON];

function getCurrentWeekId(weeks, now = Date.now()) {
  const populated = weeks.filter((week) => week.games.length > 0);
  if (!populated.length) return weeks[0]?.id ?? null;

  const dated = populated
    .map((week) => ({
      id: week.id,
      kickoff: Math.min(...week.games.map((game) => Date.parse(game.kickoff)).filter(Number.isFinite)),
    }))
    .filter((week) => Number.isFinite(week.kickoff))
    .sort((left, right) => left.kickoff - right.kickoff);
  if (!dated.length || now < dated[0].kickoff) return populated[0].id;

  let currentId = dated[0].id;
  for (const week of dated) {
    if (now < week.kickoff) break;
    currentId = week.id;
  }
  return currentId;
}

function formatUpdatedLabel(value) {
  if (!value) return 'Live ESPN feed';
  return `Live ESPN feed · updated ${value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function WeekRail({ weeks, selectedWeekId, currentWeekId, focusNonce, onSelectWeek }) {
  const railRef = useRef(null);
  const cue = useHorizontalScrollCue(railRef, [weeks.length, selectedWeekId]);

  useEffect(() => {
    const rail = railRef.current;
    const selected = rail?.querySelector(`[data-week-id="${selectedWeekId}"]`);
    if (!rail || !selected) return;
    const left = selected.offsetLeft - ((rail.clientWidth - selected.clientWidth) / 2);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [focusNonce, selectedWeekId]);

  return (
    <div className="scores-week-rail-shell">
      <div ref={railRef} className="scores-week-rail" role="tablist" aria-label="NFL week">
        {weeks.map((week) => (
          <button
            key={week.id}
            type="button"
            role="tab"
            aria-selected={week.id === selectedWeekId}
            data-week-id={week.id}
            data-current={week.id === currentWeekId || undefined}
            onClick={() => onSelectWeek(week.id)}
          >
            <span>{week.shortLabel}</span>
            <small>
              {week.id === currentWeekId
                ? 'Now'
                : week.phase === 'postseason'
                  ? 'Playoffs'
                  : week.phase === NFL_SEASON_PHASES.PRESEASON ? 'Preseason' : 'Week'}
            </small>
          </button>
        ))}
      </div>
      <HorizontalScrollCue
        left={cue.left}
        right={cue.right}
        targetRef={railRef}
        label="NFL weeks"
        className="scores-week-scroll-cue"
      />
    </div>
  );
}

export default function StatisticsScores() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const fixtureSeason = PLACEHOLDER_DATA_ENABLED ? STATISTICS_SCORES_FIXTURE.season : PRODUCTION_SEASON;
  const [season, setSeason] = useState(fixtureSeason);
  const [seasonPhase, setSeasonPhase] = useState(readStoredNflSeasonPhase);
  const [preseasonState, setPreseasonState] = useState({ status: 'idle', data: null, error: null, updatedAt: null });
  const [selectedWeekId, setSelectedWeekId] = useState(
    PLACEHOLDER_DATA_ENABLED ? SCORES_FIXTURE_CURRENT_WEEK : null,
  );
  const [selectedGame, setSelectedGame] = useState(null);
  const [boardFocusNonce, setBoardFocusNonce] = useState(0);

  const currentSeason = season === fixtureSeason;
  const weeks = useMemo(
    () => seasonPhase === NFL_SEASON_PHASES.PRESEASON
      ? preseasonState.data?.weeks ?? []
      : PLACEHOLDER_DATA_ENABLED ? STATISTICS_SCORES_FIXTURE.weeks : [],
    [preseasonState.data, seasonPhase],
  );
  const currentWeekId = seasonPhase === NFL_SEASON_PHASES.PRESEASON
    ? getCurrentWeekId(weeks)
    : currentSeason && PLACEHOLDER_DATA_ENABLED ? SCORES_FIXTURE_CURRENT_WEEK : null;
  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? weeks[0] ?? null,
    [selectedWeekId, weeks],
  );
  const liveCount = selectedWeek?.games.filter((game) => ['live', 'halftime', 'delayed'].includes(game.status)).length ?? 0;

  useEffect(() => {
    if (seasonPhase !== NFL_SEASON_PHASES.PRESEASON) return undefined;
    const controller = new AbortController();
    fetchEspnPreseason({ season, signal: controller.signal })
      .then((data) => {
        setPreseasonState({ status: 'ready', data, error: null, updatedAt: new Date() });
        setSelectedWeekId(getCurrentWeekId(data.weeks));
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setPreseasonState({ status: 'error', data: null, error: error.message, updatedAt: null });
      });
    return () => controller.abort();
  }, [season, seasonPhase]);

  useEffect(() => {
    if (seasonPhase !== NFL_SEASON_PHASES.PRESEASON || preseasonState.status !== 'ready' || !selectedWeek) return undefined;
    const weekNumber = selectedWeek.week;
    if (!Number.isInteger(weekNumber)) return undefined;

    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      fetchEspnScoreboardWeek({ season, week: weekNumber })
        .then((payload) => {
          setPreseasonState((current) => ({
            ...current,
            data: replaceEspnScoreboardWeek(current.data, payload, weekNumber),
            error: null,
            updatedAt: new Date(),
          }));
        })
        .catch((error) => {
          setPreseasonState((current) => ({ ...current, error: error.message }));
        });
    };

    const interval = window.setInterval(refresh, LIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [preseasonState.status, season, seasonPhase, selectedWeek]);

  useEffect(() => {
    document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedGame]);

  if (selectedGame) {
    return <ScoresGameDrilldown game={selectedGame} onBack={() => setSelectedGame(null)} />;
  }

  const goToCurrentWeek = () => {
    if (!currentWeekId) return;
    setSelectedWeekId(currentWeekId);
    setBoardFocusNonce((value) => value + 1);
  };

  const selectSeasonPhase = (nextPhase) => {
    const normalized = writeStoredNflSeasonPhase(nextPhase);
    if (normalized === NFL_SEASON_PHASES.PRESEASON) {
      setPreseasonState({ status: 'loading', data: null, error: null, updatedAt: null });
    }
    setSeasonPhase(normalized);
    setSelectedGame(null);
    setSelectedWeekId(
      normalized === NFL_SEASON_PHASES.REGULAR && PLACEHOLDER_DATA_ENABLED
        ? SCORES_FIXTURE_CURRENT_WEEK
        : null,
    );
  };

  return (
    <div className="statistics-scores page-frame-data">
      <header className="scores-masthead">
        <div>
          <div className="scores-masthead-kicker">
            <span>{selectedWeek?.label ?? (seasonPhase === NFL_SEASON_PHASES.PRESEASON ? 'Preseason' : 'NFL week')} · {season}</span>
            {liveCount > 0 && (
              <strong><span className="scores-live-dot" aria-hidden="true" /> {liveCount} live</strong>
            )}
          </div>
          <h1>Scores <span>/ NFL</span></h1>
        </div>

        <div className="scores-masthead-side">
          <span className="scores-as-of">
            {seasonPhase === NFL_SEASON_PHASES.PRESEASON
              ? formatUpdatedLabel(preseasonState.updatedAt)
              : PLACEHOLDER_DATA_ENABLED ? STATISTICS_SCORES_FIXTURE.updatedLabel : 'Production data only'}
          </span>
          <div className="scores-toolbar-actions">
            <SeasonPhaseToggle
              value={seasonPhase}
              onChange={selectSeasonPhase}
              className="scores-phase-toggle"
            />
            <label className="scores-season-select">
              <span>Season</span>
              <select
                value={season}
                onChange={(event) => {
                  setSeason(Number(event.target.value));
                  if (seasonPhase === NFL_SEASON_PHASES.PRESEASON) {
                    setPreseasonState({ status: 'loading', data: null, error: null, updatedAt: null });
                  }
                  setSelectedWeekId(
                    seasonPhase === NFL_SEASON_PHASES.REGULAR && PLACEHOLDER_DATA_ENABLED
                      ? SCORES_FIXTURE_CURRENT_WEEK
                      : null,
                  );
                  setSelectedGame(null);
                }}
                aria-label="Season"
              >
                {AVAILABLE_SEASONS.map((year) => (
                  <option key={year} value={year}>{year}{year === fixtureSeason ? ' · current' : ''}</option>
                ))}
              </select>
            </label>
            {currentSeason && currentWeekId && (
              <button type="button" className="scores-current-week-button" onClick={goToCurrentWeek}>
                <span aria-hidden="true" /> This Week
              </button>
            )}
          </div>
        </div>
      </header>

      {preseasonState.error && seasonPhase === NFL_SEASON_PHASES.PRESEASON && preseasonState.data && (
        <p className="scores-feed-notice" role="status">Live refresh paused. Showing the last ESPN update.</p>
      )}

      {seasonPhase === NFL_SEASON_PHASES.PRESEASON && ['idle', 'loading'].includes(preseasonState.status) ? (
        <div className="scores-feed-state" role="status">
          <strong>Loading preseason scores</strong>
          <span>Fetching the latest slate from ESPN.</span>
        </div>
      ) : seasonPhase === NFL_SEASON_PHASES.REGULAR && !PLACEHOLDER_DATA_ENABLED ? (
        <div className="scores-feed-state" role="status">
          <strong>Regular-season scores are not available yet</strong>
          <span>Scores is in Beta. Production will show this view once provider-backed coverage is ready.</span>
        </div>
      ) : selectedWeek ? (
        <>
          <WeekRail
            weeks={weeks}
            selectedWeekId={selectedWeek.id}
            currentWeekId={currentWeekId}
            focusNonce={boardFocusNonce}
            onSelectWeek={setSelectedWeekId}
          />

          <ScoresSeasonBoard
            weeks={weeks}
            selectedWeekId={selectedWeek.id}
            desktop={desktop}
            onOpenGame={seasonPhase === NFL_SEASON_PHASES.REGULAR ? setSelectedGame : undefined}
            onSelectWeek={setSelectedWeekId}
          />
        </>
      ) : (
        <div className="scores-feed-state" role="status">
          <strong>Preseason scores are unavailable</strong>
          <span>The live ESPN feed could not be reached. Try again after reconnecting.</span>
        </div>
      )}
    </div>
  );
}
