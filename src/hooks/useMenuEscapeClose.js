import { useEffect } from 'react';

// Closes a dropdown menu on Escape while it is open (DESIGN.md Menu pattern).
export default function useMenuEscapeClose(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
}
