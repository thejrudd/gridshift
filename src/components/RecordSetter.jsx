import { useState, useEffect, useRef } from 'react';

const RecordSetter = ({
  initialWins = 8,
  initialTies = 0,
  initialDivisionWins = 3,
  maxDivisionWins = 6,
  minDivisionWins = 0,
  globalMaxWins = 17,
  globalMinWins = 0,
  minTies = 0,
  onChange
}) => {
  // Raw state from user input (sliders, buttons) and parent sync
  const [rawWins, setRawWins] = useState(initialWins);
  const [rawTies, setRawTies] = useState(initialTies);
  const [rawDivisionWins, setRawDivisionWins] = useState(initialDivisionWins);

  // Sync from parent when parent drives changes (e.g., game pick snapping)
  useEffect(() => { setRawWins(initialWins); }, [initialWins]);
  useEffect(() => { setRawDivisionWins(initialDivisionWins); }, [initialDivisionWins]);
  useEffect(() => { setRawTies(initialTies); }, [initialTies]);

  // Clamp all values inline (during render, not in effects) so that
  // derived values and onChange always see post-clamp state.
  const ties = Math.min(Math.max(rawTies, minTies), 4);

  const maxWins = Math.min(17 - ties, maxDivisionWins + 11 - ties, globalMaxWins);
  const minWins = Math.max(0, minDivisionWins, globalMinWins);
  const effectiveMaxWins = Math.max(maxWins, minWins); // impossible range: prefer min
  const wins = Math.min(Math.max(rawWins, minWins), effectiveMaxWins);

  const losses = 17 - wins - ties;
  const divisionLosses = 6 - rawDivisionWins; // use raw for display continuity

  const effectiveMaxDivisionWins = Math.min(maxDivisionWins, wins, 6);
  const effectiveMinDivisionWins = Math.max(minDivisionWins, wins + ties - 11, 0);
  const effectiveMaxDivWinsClamped = Math.max(effectiveMaxDivisionWins, effectiveMinDivisionWins);
  const divisionWins = Math.min(Math.max(rawDivisionWins, effectiveMinDivisionWins), effectiveMaxDivWinsClamped);

  // Update parent when clamped values change
  const prevRef = useRef({ wins, losses, divisionWins, ties });
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.wins !== wins || prev.losses !== losses || prev.divisionWins !== divisionWins || prev.ties !== ties) {
      prevRef.current = { wins, losses, divisionWins, ties };
      onChange(wins, losses, divisionWins, ties);
    }
  }, [wins, losses, divisionWins, ties, onChange]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-6xl font-display text-[color:var(--color-label)] mb-2 tracking-wider">
          {wins}-{losses}{ties > 0 && `-${ties}`}
        </div>
        <p className="text-sm font-semibold text-[color:var(--color-label-secondary)] tracking-wide">
          {ties > 0 ? 'W - L - T' : 'PREDICTED RECORD'}
        </p>
      </div>

      {/* Wins slider */}
      <div className="space-y-2">
        <label className="block">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-[color:var(--color-label-secondary)]">Wins: {wins}</span>
            <span className="text-sm text-[color:var(--color-label-secondary)]">Losses: {losses}</span>
          </div>
          <input
            type="range"
            min={minWins}
            max={effectiveMaxWins}
            value={wins}
            onChange={(e) => setRawWins(parseInt(e.target.value))}
            className="w-full h-2 bg-[color:var(--color-fill)] rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, var(--color-accent-green) 0%, var(--color-accent-green) ${effectiveMaxWins > minWins ? ((wins - minWins) / (effectiveMaxWins - minWins)) * 100 : 100}%, var(--color-fill) ${effectiveMaxWins > minWins ? ((wins - minWins) / (effectiveMaxWins - minWins)) * 100 : 100}%, var(--color-fill) 100%)`
            }}
          />
        </label>

        <div className="flex justify-between text-xs text-[color:var(--color-label-tertiary)]">
          <span>{minWins}-{17 - ties - minWins}{ties > 0 && `-${ties}`}</span>
          <span>{Math.floor((minWins + effectiveMaxWins) / 2)}-{17 - ties - Math.floor((minWins + effectiveMaxWins) / 2)}{ties > 0 && `-${ties}`}</span>
          <span>{effectiveMaxWins}-{17 - ties - effectiveMaxWins}{ties > 0 && `-${ties}`}</span>
        </div>
      </div>

      {/* Quick preset buttons for wins */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
        {[0, 3, 6, 9, 12, 17].filter(v => v >= minWins && v <= effectiveMaxWins).map(value => (
          <button
            key={value}
            onClick={() => setRawWins(value)}
            className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
              wins === value
                ? 'bg-[color:var(--color-accent)] text-white'
                : 'bg-[color:var(--color-fill)] text-[color:var(--color-label-secondary)] hover:bg-[color:var(--color-fill)]'
            }`}
          >
            {value}-{17 - ties - value}{ties > 0 && `-${ties}`}
          </button>
        ))}
      </div>

      {/* Ties slider */}
      <div className="mt-4 pt-4 border-t border-[color:var(--color-separator)]">
        <label className="block">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-[color:var(--color-label-secondary)]">Ties: {ties}</span>
            <span className="text-xs text-[color:var(--color-label-tertiary)]">Rare, but it happens!</span>
          </div>
          <input
            type="range"
            min={minTies}
            max="4"
            value={ties}
            onChange={(e) => setRawTies(parseInt(e.target.value))}
            className="w-full h-2 bg-[color:var(--color-fill)] rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--color-accent-orange) 0%, var(--color-accent-orange) ${4 - minTies > 0 ? ((ties - minTies) / (4 - minTies)) * 100 : 100}%, var(--color-fill) ${4 - minTies > 0 ? ((ties - minTies) / (4 - minTies)) * 100 : 100}%, var(--color-fill) 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-[color:var(--color-label-tertiary)] mt-1">
            {[0, 1, 2, 3, 4].filter(v => v >= minTies).map(v => (
              <span key={v}>{v}</span>
            ))}
          </div>
        </label>
      </div>

      {/* Division Record */}
      <div className="mt-6 pt-6 border-t border-[color:var(--color-separator)]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-[color:var(--color-label-secondary)]">Division Record (Tiebreaker)</span>
          <span className="text-lg font-bold text-[color:var(--color-accent)]">
            {divisionWins}-{6 - divisionWins}
          </span>
        </div>

        {effectiveMinDivisionWins === effectiveMaxDivWinsClamped ? (
          /* Locked - only one valid option */
          <div className="bg-tint-accent border border-tint-accent rounded-lg p-3 text-center">
            <span className="text-sm font-semibold text-[color:var(--color-accent)]">
              Locked at {effectiveMinDivisionWins}-{6 - effectiveMinDivisionWins}
            </span>
            <p className="text-xs text-[color:var(--color-accent)] mt-1">
              Determined by the overall record and division constraints.
            </p>
          </div>
        ) : (
          /* Slider and buttons */
          <>
            <label className="block">
              <input
                type="range"
                min={effectiveMinDivisionWins}
                max={effectiveMaxDivWinsClamped}
                value={divisionWins}
                onChange={(e) => setRawDivisionWins(parseInt(e.target.value))}
                className="w-full h-2 bg-[color:var(--color-fill)] rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${((divisionWins - effectiveMinDivisionWins) / (effectiveMaxDivWinsClamped - effectiveMinDivisionWins)) * 100}%, var(--color-fill) ${((divisionWins - effectiveMinDivisionWins) / (effectiveMaxDivWinsClamped - effectiveMinDivisionWins)) * 100}%, var(--color-fill) 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-[color:var(--color-label-tertiary)] mt-1">
                <span>{effectiveMinDivisionWins}-{6 - effectiveMinDivisionWins}</span>
                <span>{Math.floor((effectiveMinDivisionWins + effectiveMaxDivWinsClamped) / 2)}-{6 - Math.floor((effectiveMinDivisionWins + effectiveMaxDivWinsClamped) / 2)}</span>
                <span>{effectiveMaxDivWinsClamped}-{6 - effectiveMaxDivWinsClamped}</span>
              </div>
            </label>

            {/* Quick preset buttons */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 mt-3">
              {[0, 1, 2, 3, 4, 5, 6]
                .filter(value => value >= effectiveMinDivisionWins && value <= effectiveMaxDivWinsClamped)
                .map(value => (
                  <button
                    key={value}
                    onClick={() => setRawDivisionWins(value)}
                    className={`py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                      divisionWins === value
                        ? 'bg-[color:var(--color-accent)] text-white'
                        : 'bg-[color:var(--color-fill)] text-[color:var(--color-label-secondary)] hover:bg-[color:var(--color-fill)]'
                    }`}
                  >
                    {value}-{6 - value}
                  </button>
                ))}
            </div>
          </>
        )}

        <p className="text-xs text-[color:var(--color-label-secondary)] mt-2">
          Each team plays 6 division games (3 opponents x 2 games). Used to break ties when teams have the same overall record.
        </p>
      </div>
    </div>
  );
};

export default RecordSetter;
