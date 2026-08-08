import React from 'react';

// Matches the outlined/rounded icon set used everywhere else in the app
// (Sidebar.jsx's ICONS registry: viewBox 24, stroke currentColor, round caps).
function InfoIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// A small info icon that reveals an explanation on hover/focus. Reusable for
// documenting any button or setting in the app. `align` controls which way the
// popover opens horizontally ('left' = opens rightward, for icons on the left;
// 'right' = opens leftward, for icons near the right edge like toolbar
// buttons). `openUp` opens the popover above the icon instead of below, for
// icons that sit near the top of their container. `size` overrides the
// default 14px icon (e.g. to match a specific label's font size); omit to
// keep the default. A small icon has no ascender/descender leading the way a
// text line does, so flex centering alone can leave it optically low against
// the text's cap-height — `nudgeY` (px, negative = up) corrects that per call
// site rather than shifting every other icon in the app.
export default function Explain({
  children, align = 'left', openUp = false, size, nudgeY = 0, width,
}) {
  return (
    <span
      className={`explain explain-${align}${openUp ? ' explain-up' : ''}`}
      style={nudgeY ? { transform: `translateY(${nudgeY}px)` } : undefined}
      tabIndex={0}
      aria-label="More info"
    >
      <span className="explain-icon" style={size ? { width: size, height: size } : undefined}>
        <InfoIcon size={size || 14} />
      </span>
      <span className="explain-pop" role="tooltip" style={width ? { width } : undefined}>
        {children}
      </span>
    </span>
  );
}
