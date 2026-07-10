const GameResultToggle = ({ value, onToggle, canMarkWin, canMarkLoss, canMarkTie }) => {
  const handleClick = () => {
    if (value === undefined) {
      if (canMarkWin) onToggle('W');
      else if (canMarkLoss) onToggle('L');
      else if (canMarkTie) onToggle('T');
    } else if (value === 'W') {
      if (canMarkLoss) onToggle('L');
      else if (canMarkTie) onToggle('T');
      else onToggle(undefined);
    } else if (value === 'L') {
      if (canMarkTie) onToggle('T');
      else onToggle(undefined);
    } else {
      // value === 'T'
      onToggle(undefined);
    }
  };

  const base = 'w-8 h-8 rounded text-xs font-bold flex items-center justify-center cursor-pointer transition-colors select-none flex-shrink-0';

  if (value === 'W') {
    return (
      <button onClick={handleClick} className={`${base} bg-[color:var(--color-accent-green)] text-white hover:opacity-85`}>
        W
      </button>
    );
  }
  if (value === 'L') {
    return (
      <button onClick={handleClick} className={`${base} bg-[color:var(--color-accent-red)] text-white hover:opacity-85`}>
        L
      </button>
    );
  }
  if (value === 'T') {
    return (
      <button onClick={handleClick} className={`${base} bg-[color:var(--color-accent-orange)] text-white hover:opacity-85`}>
        T
      </button>
    );
  }
  return (
    <button
      onClick={handleClick}
      disabled={!canMarkWin && !canMarkLoss && !canMarkTie}
      className={`${base} ${
        canMarkWin || canMarkLoss || canMarkTie
          ? 'bg-[color:var(--color-fill)] text-[color:var(--color-label-tertiary)] hover:bg-[color:var(--color-fill-secondary)]'
          : 'bg-[color:var(--color-fill)] text-[color:var(--color-label-tertiary)] cursor-not-allowed'
      }`}
    >
      --
    </button>
  );
};

export default GameResultToggle;
