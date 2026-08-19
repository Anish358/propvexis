import { useEffect, useState } from 'react';

// One breakpoint, expressed once.
//
// The stylesheet had grown eight ad-hoc widths (520/560/720/760/860/900/1100/
// 1180), which is how "mobile" ends up meaning something slightly different in
// every rule. 900px is the dominant one already in the CSS and is where the
// 230px sidebar stops being affordable, so it is the one the shell switches on.
// JS and CSS must agree — a drawer that opens at 900 while the CSS lays out for
// a fixed rail until 860 is broken in the 40px between them.
export const MOBILE_QUERY = '(max-width: 900px)';

/**
 * Subscribe to a media query.
 *
 * SSR/test-safe: returns false when matchMedia is unavailable rather than
 * throwing, so importing this in a non-browser context is harmless.
 *
 * Reads the value during the first render rather than in an effect, so the
 * shell never paints the desktop layout for one frame before correcting itself
 * — on a phone that flash is a 230px sidebar appearing and vanishing.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false)
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    // Re-read on subscribe: the query can have changed between the initial
    // render and this effect (a rotation during hydration).
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True on phone/small-tablet widths, where the shell uses a drawer. */
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
