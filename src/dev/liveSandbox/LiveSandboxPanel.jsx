// Dev-only control surface for the Fantasy Live replay clock.
//
// Renders nothing unless VITE_LIVE_SANDBOX=true, and the whole module is
// dropped from production builds along with the rest of the sandbox.

import { useState } from 'react';
import {
  completeReplay,
  REPLAY_SPEEDS,
  resetClock,
  setProgress,
  setSpeed,
  togglePlay,
  useReplayClock,
} from './liveSandboxClock';
import { getCachedGames } from './liveSandboxSource';
import { describeReplayInstant } from './liveSandboxReplay';
import { LIVE_SANDBOX_ENABLED } from './liveSandboxFlag';
import { SANDBOX_MODES, setSandboxMode, useSandboxMode } from './liveSandboxMode';
import { CHART_SCALES, setChartScale, useChartScale } from './liveSandboxChartScale';
import './LiveSandboxPanel.css';

export default function LiveSandboxPanel() {
  const clock = useReplayClock();
  const mode = useSandboxMode();
  const chartScale = useChartScale();
  const [collapsed, setCollapsed] = useState(false);

  if (!LIVE_SANDBOX_ENABLED) return null;

  const replay = mode === 'replay';
  // Derived straight from the cached slate; the clock re-renders this panel.
  const label = replay
    ? describeReplayInstant(getCachedGames(), clock.progress)
    : 'Live preseason games — no replay clock';

  return (
    <div className="live-sandbox">
      <div className="live-sandbox-head">
        <span className="live-sandbox-title">Live Sandbox</span>
        <span className="live-sandbox-status">{label}</span>
        <button
          type="button"
          className="live-sandbox-text"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="live-sandbox-row live-sandbox-modes">
            {SANDBOX_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="live-sandbox-chip"
                data-active={mode === entry.id}
                onClick={() => setSandboxMode(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="live-sandbox-row live-sandbox-modes">
            {CHART_SCALES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="live-sandbox-chip"
                data-active={chartScale === entry.id}
                onClick={() => setChartScale(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {replay && (
          <div className="live-sandbox-row">
            <button type="button" className="live-sandbox-play" onClick={togglePlay}>
              {clock.playing ? 'Pause' : 'Play'}
            </button>
            <input
              type="range"
              className="live-sandbox-scrub"
              min={0}
              max={1}
              step={0.001}
              value={clock.progress}
              onChange={(event) => setProgress(event.target.value)}
              aria-label="Replay position"
            />
            <span className="live-sandbox-pct">{Math.round(clock.progress * 100)}%</span>
          </div>
          )}

          {replay && (
          <div className="live-sandbox-row live-sandbox-speeds">
            {REPLAY_SPEEDS.map((speed) => (
              <button
                key={speed.id}
                type="button"
                className="live-sandbox-chip"
                data-active={clock.speedId === speed.id}
                onClick={() => setSpeed(speed.id)}
              >
                {speed.label}
              </button>
            ))}
            <button
              type="button"
              className="live-sandbox-chip live-sandbox-full"
              onClick={completeReplay}
              disabled={clock.progress >= 1}
              aria-label="Fill replay with the full week"
            >
              Full
            </button>
            <button
              type="button"
              className="live-sandbox-text live-sandbox-reset"
              onClick={resetClock}
            >
              Reset
            </button>
          </div>
          )}
        </>
      )}
    </div>
  );
}
