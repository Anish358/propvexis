import React from 'react';

// Matches the outlined/rounded icon set used everywhere else in the app
// (Sidebar.jsx's ICONS registry: viewBox 24, stroke currentColor, round caps).
function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// A small info icon that reveals an explanation on hover/focus. Reusable for
// documenting any button or setting in the app. `align` controls which way the
// popover opens ('left' = opens rightward, for icons on the left; 'right' =
// opens leftward, for icons near the right edge like toolbar buttons).
export default function Explain({ children, align = 'left', width }) {
  return (
    <span className={`explain explain-${align}`} tabIndex={0} aria-label="More info">
      <span className="explain-icon"><InfoIcon /></span>
      <span className="explain-pop" role="tooltip" style={width ? { width } : undefined}>
        {children}
      </span>
    </span>
  );
}
