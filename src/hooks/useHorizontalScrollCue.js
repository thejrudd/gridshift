import { useEffect, useState } from 'react';

export default function useHorizontalScrollCue(ref, deps = []) {
  const [cue, setCue] = useState({ left: false, right: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const updateCue = () => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      const nextCue = {
        left: maxScrollLeft > 1 && element.scrollLeft > 1,
        right: maxScrollLeft > 1 && element.scrollLeft < maxScrollLeft - 1,
      };

      setCue((current) => (
        current.left === nextCue.left && current.right === nextCue.right
          ? current
          : nextCue
      ));
    };

    updateCue();
    element.addEventListener('scroll', updateCue, { passive: true });

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateCue)
      : null;
    resizeObserver?.observe(element);

    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(updateCue)
      : null;
    mutationObserver?.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const raf = window.requestAnimationFrame?.(updateCue);

    return () => {
      element.removeEventListener('scroll', updateCue);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return cue;
}
