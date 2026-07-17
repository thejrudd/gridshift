import useMediaQuery from '../hooks/useMediaQuery.js';

export default function HorizontalScrollCue({
  left = false,
  right = false,
  className = '',
  targetRef = null,
  scrollRatio = 0.75,
  label = 'horizontal list',
}) {
  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  if (!left && !right) return null;

  const scroll = (direction) => {
    const target = targetRef?.current;
    if (!target) return;
    const distance = Math.max(160, Math.round(target.clientWidth * scrollRatio));
    target.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  const renderCue = (direction) => {
    const visible = direction === 'left' ? left : right;
    if (!visible) return null;
    const interactive = Boolean(isFinePointer && targetRef);

    return (
      <button
        type="button"
        className={[
          'horizontal-scroll-cue',
          `horizontal-scroll-cue--${direction}`,
          interactive ? 'is-interactive' : '',
          className,
        ].filter(Boolean).join(' ')}
        aria-label={interactive ? `Scroll ${label} ${direction}` : undefined}
        aria-hidden={interactive ? undefined : 'true'}
        tabIndex={interactive ? 0 : -1}
        onClick={interactive ? () => scroll(direction) : undefined}
        onKeyDown={interactive ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          scroll(direction);
        } : undefined}
        data-scroll-cue={direction}
      />
    );
  };

  return (
    <>
      {renderCue('left')}
      {renderCue('right')}
    </>
  );
}
