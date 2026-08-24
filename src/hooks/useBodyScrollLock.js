import { useEffect } from 'react';

let activeLockCount = 0;
let lockedScrollY = 0;
let previousBodyStyles = null;

export default function useBodyScrollLock(locked = true) {
  useEffect(() => {
    if (!locked || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const { body } = document;

    if (activeLockCount === 0) {
      lockedScrollY = window.scrollY;
      previousBodyStyles = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
      };

      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }

    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount > 0) return;

      body.style.overflow = previousBodyStyles?.overflow ?? '';
      body.style.position = previousBodyStyles?.position ?? '';
      body.style.top = previousBodyStyles?.top ?? '';
      body.style.left = previousBodyStyles?.left ?? '';
      body.style.right = previousBodyStyles?.right ?? '';
      body.style.width = previousBodyStyles?.width ?? '';
      window.scrollTo(0, lockedScrollY);
      previousBodyStyles = null;
    };
  }, [locked]);
}
