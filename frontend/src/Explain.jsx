import React from 'react';

// A small circled "i" that reveals an explanation on hover/focus. Reusable for
// documenting any button or setting in the app. `align` controls which way the
// popover opens ('left' = opens rightward, for icons on the left; 'right' =
// opens leftward, for icons near the right edge like toolbar buttons).
export default function Explain({ children, align = 'left', width }) {
  return (
    <span className={`explain explain-${align}`} tabIndex={0} aria-label="More info">
      <span className="explain-icon" aria-hidden="true">i</span>
      <span className="explain-pop" role="tooltip" style={width ? { width } : undefined}>
        {children}
      </span>
    </span>
  );
}
