import { useEffect, useLayoutEffect, useRef } from 'react';

// Positioning shared by the Matchups hover cards (starter rows, scoring plays).
//
// Opened by a mouse, the card follows the pointer: below-right of it, flipped
// left or above near the frame's right edge or the window's bottom. The side is
// chosen when the card opens and kept while it still fits, so small moves near
// an edge never flip it back and forth. Moves write the position straight to
// the card at most once per animation frame, so following the pointer never
// re-renders the page. Opened from keyboard focus (`point` null), the card sits
// where `placeWithoutPointer` puts it.

// Gap between the pointer and the card's nearest corner.
const POINTER_OFFSET = 16;
const EDGE_MARGIN = 8;

/**
 * `point` is where the pointer opened the card ({ x, y } in client
 * coordinates); it changes only when the card opens for another target.
 * `getFrame()` is the client rect the card is positioned in (its offset
 * parent), bounding it horizontally. `placeWithoutPointer({ width, height })`
 * returns client `{ left, top }` for keyboard focus, or null.
 */
export function usePointerFollow({ cardRef, point, getFrame, placeWithoutPointer }) {
  const pointerRef = useRef(point);
  // Re-renders (live ticks, content updates) must not snap the card back to
  // where it opened, so `point` is adopted once per new value.
  const adoptedPointRef = useRef(point);
  const sideRef = useRef({ x: null, y: null });
  const frameRequestRef = useRef(0);
  // The latest callbacks, read at placement time without resubscribing.
  const optionsRef = useRef({ getFrame, placeWithoutPointer });

  const place = () => {
    const card = cardRef.current;
    const frame = optionsRef.current.getFrame?.();
    if (!card || !frame) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left;
    let top;
    const pointer = pointerRef.current;
    if (pointer) {
      const fitsRight = pointer.x + POINTER_OFFSET + width <= frame.right - EDGE_MARGIN;
      const fitsLeft = pointer.x - POINTER_OFFSET - width >= frame.left + EDGE_MARGIN;
      const fitsBelow = pointer.y + POINTER_OFFSET + height <= window.innerHeight - EDGE_MARGIN;
      const fitsAbove = pointer.y - POINTER_OFFSET - height >= EDGE_MARGIN;
      const sides = sideRef.current;
      if (sides.x === 'right' ? !fitsRight && fitsLeft : sides.x === 'left' ? !fitsLeft && fitsRight : true) {
        sides.x = fitsRight || !fitsLeft ? 'right' : 'left';
      }
      if (sides.y === 'below' ? !fitsBelow && fitsAbove : sides.y === 'above' ? !fitsAbove && fitsBelow : true) {
        sides.y = fitsBelow || !fitsAbove ? 'below' : 'above';
      }
      left = sides.x === 'right' ? pointer.x + POINTER_OFFSET : pointer.x - POINTER_OFFSET - width;
      top = sides.y === 'below' ? pointer.y + POINTER_OFFSET : pointer.y - POINTER_OFFSET - height;
      top = Math.max(EDGE_MARGIN, top);
    } else {
      const placed = optionsRef.current.placeWithoutPointer?.({ width, height });
      if (!placed) return;
      ({ left, top } = placed);
    }
    left = Math.max(EDGE_MARGIN, Math.min(frame.width - width - EDGE_MARGIN, left - frame.left));
    card.style.left = `${left}px`;
    card.style.top = `${top - frame.top}px`;
    card.style.visibility = 'visible';
  };

  // Re-place when the card opens for another target or its content changes size.
  useLayoutEffect(() => {
    optionsRef.current = { getFrame, placeWithoutPointer };
    if (point && point !== adoptedPointRef.current) {
      adoptedPointRef.current = point;
      pointerRef.current = point;
      sideRef.current = { x: null, y: null };
    }
    place();
  });

  const following = Boolean(point);
  useEffect(() => {
    if (!following) return undefined;
    const onMove = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      // One placement per frame, however fast pointer events arrive.
      if (frameRequestRef.current) return;
      frameRequestRef.current = window.requestAnimationFrame(() => {
        frameRequestRef.current = 0;
        place();
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = 0;
    };
    // `place` reads refs at call time; resubscribing per render is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following]);
}
