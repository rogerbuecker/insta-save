import { useEffect, useRef } from 'react';

// --- Back-button handling for overlays (detail view, sheets, sub-pages) ---
// Every open overlay pushes one history entry. The Android back button (popstate) closes the
// topmost overlay; closing through the UI removes the entry again via history.back().

interface OverlayEntry {
  close: () => void;
}

const stack: OverlayEntry[] = [];
let ignorePops = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    stack.pop()?.close();
  });
  // Escape (desktop) behaves like the back button: closes the topmost overlay only
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length > 0) window.history.back();
  });
}

let lockCount = 0;

function lockBody() {
  lockCount++;
  document.body.classList.add('scroll-locked');
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.classList.remove('scroll-locked');
}

/**
 * While `open`, the overlay owns a history entry (back button closes it) and — unless
 * `lockScroll` is false — the page behind it does not scroll.
 */
export function useOverlay(open: boolean, onClose: () => void, lockScroll = true) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const entry: OverlayEntry = { close: () => closeRef.current() };
    stack.push(entry);
    window.history.pushState({ overlay: true }, '');
    if (lockScroll) lockBody();

    return () => {
      if (lockScroll) unlockBody();
      const idx = stack.indexOf(entry);
      if (idx !== -1) {
        // Closed through the UI: drop our history entry without closing anything else
        stack.splice(idx, 1);
        ignorePops++;
        window.history.back();
      }
    };
  }, [open, lockScroll]);
}
