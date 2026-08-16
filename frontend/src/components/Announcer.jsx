import React, { useEffect, useRef, useState } from 'react';

/**
 * The app's single polite live region.
 *
 * WHY THIS EXISTS: trades arrive over a socket and re-render the page under the
 * user. Sighted users see a row appear and a KPI move; a screen-reader user got
 * nothing at all — the app had exactly one aria-live region before this, on an
 * unrelated element. Silent mutation is the specific failure WCAG 4.1.3 (Status
 * Messages) is about.
 *
 * ONE region, mounted once in the shell, rather than a region per feature.
 * Multiple live regions compete: two updating in the same tick are announced in
 * DOM order with no relationship to importance, and assistive tech throttles
 * them unpredictably. A single queue is both simpler and better behaved.
 *
 * `polite`, never `assertive`: these are ambient updates, not errors. Assertive
 * interrupts whatever the user is reading, which for a trade landing mid-sentence
 * is hostile. Errors keep using role="alert" at their own site, where they have
 * the context.
 */

// Re-announcing an identical string is a no-op in most screen readers — the node
// content did not change, so nothing fires. Alternating a zero-width suffix makes
// consecutive identical messages distinct without changing what is read aloud.
const ZWSP = '​';

export default function Announcer({ message }) {
  const [text, setText] = useState('');
  const toggle = useRef(false);

  useEffect(() => {
    if (!message) return;
    toggle.current = !toggle.current;
    setText(toggle.current ? message : `${message}${ZWSP}`);
  }, [message]);

  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // Announcements are for assistive tech only. It is visually hidden by
      // clip-rect rather than display:none or visibility:hidden — both of those
      // remove the node from the accessibility tree entirely, so the region
      // would never announce anything.
    >
      {text}
    </div>
  );
}

/**
 * Build the announcement for a trade feed.
 *
 * Pure and exported so the wording is testable without a browser, and so the
 * rule "announce the change, not the state" stays visible: a screen-reader user
 * wants to hear "1 trade added", not the full count re-read every time.
 *
 * Returns null when there is nothing worth saying — the initial load, and any
 * render where the count did not move. Announcing on first paint would talk over
 * the page the user just navigated to.
 */
export function tradeFeedAnnouncement(previousCount, nextCount) {
  if (previousCount == null || nextCount == null) return null;
  if (previousCount === nextCount) return null;
  const delta = nextCount - previousCount;
  if (delta > 0) {
    return `${delta} trade${delta === 1 ? '' : 's'} added. ${nextCount} shown.`;
  }
  const removed = -delta;
  return `${removed} trade${removed === 1 ? '' : 's'} removed. ${nextCount} shown.`;
}

/** Connection changes matter — a disconnected socket means stale numbers. */
export function connectionAnnouncement(wasConnected, isConnected) {
  if (wasConnected == null || wasConnected === isConnected) return null;
  return isConnected ? 'Reconnected. Live updates resumed.' : 'Disconnected. Trades may be out of date.';
}
