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
        {/* RETUNED TO THE 2026-08-28 FIGMA. The tile was an accent-tinted square with a
            blue chevron and a green dot; the frame draws a LIGHT tile with the chevron
            stroked in the surface colour and no dot. Two deliberate consequences:
            the mark now reads at any size without depending on a tint that only works
            on a dark page, and it is the same three values everywhere it appears —
            rail, wizard header, auth screen — because they all render this component.
            The dot is gone rather than recoloured: at 22px (the wizard and auth sizes)
            it was a 1.1px smudge, which is why the frame drops it. */}
        <rect width="32" height="32" rx="8" fill="var(--brand-mark-bg)" />
        <path d="M9 21.5 15 10l6 11.5" stroke="var(--brand-mark-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {word && <span className="pv-logo-word">{BRAND}</span>}
    </span>
  );
}
