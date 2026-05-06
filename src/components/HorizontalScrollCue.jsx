export default function HorizontalScrollCue({
  left = false,
  right = false,
  className = '',
}) {
  if (!left && !right) return null;

  return (
    <>
      {left && (
        <span
          className={['horizontal-scroll-cue horizontal-scroll-cue--left', className].filter(Boolean).join(' ')}
          aria-hidden="true"
          data-scroll-cue="left"
        />
      )}
      {right && (
        <span
          className={['horizontal-scroll-cue horizontal-scroll-cue--right', className].filter(Boolean).join(' ')}
          aria-hidden="true"
          data-scroll-cue="right"
        />
      )}
    </>
  );
}
