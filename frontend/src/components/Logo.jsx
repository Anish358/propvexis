import React from 'react';
import { BRAND } from '../lib/theme.js';

// The one brand mark, shared with the marketing site: propvexis-web's
// `Logo.astro` draws the same geometry (chevron + data node on a tinted tile),
// so the landing page and the app read as one product. Token-driven here so it
// follows the theme; `public/favicon.svg` is the same artwork with the values
// inlined, because a favicon can't resolve CSS custom properties.
export default function Logo({ size = 26, word = false, className }) {
  return (
    <span className={['pv-logo', className].filter(Boolean).join(' ')}>
      <svg className="pv-logo-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent-bg)" stroke="var(--accent-border)" />
        <path d="M9 21.5 15 10l6 11.5" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="21" cy="21.5" r="1.6" fill="var(--profit)" />
      </svg>
      {word && <span className="pv-logo-word">{BRAND}</span>}
    </span>
  );
}
