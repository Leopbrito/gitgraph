import {useRef} from 'react';

// The terminal does not report click counts: two clicks on the same target within this time are a double click.
export const DOUBLE_CLICK_MS = 400;

/** Returns a function that takes the clicked target and says whether this click completes a double click. */
export function useDoubleClick(): (target: number) => boolean {
  const last = useRef<{target: number; at: number} | null>(null);
  return target => {
    const now = Date.now();
    const previous = last.current;
    if (previous?.target === target && now - previous.at <= DOUBLE_CLICK_MS) {
      // A third quick click starts over instead of counting as another double.
      last.current = null;
      return true;
    }
    last.current = {target, at: now};
    return false;
  };
}
