/* loading-block.jsx
 *
 * @design approved 2026-09-08 — owner signed off Batch 6 (Rebuilt, then reviewed) as a
 *   family on the Test page. These three were rebuilt off legacy CSS the same day and
 *   reviewed as the rebuild, not as what preceded it. See test/primitives-status.test.js.
 */

import React from 'react';
import { Skeleton } from './skeleton.jsx';

/* LoadingBlock — PropVexis primitive.
 *
 * A page-shaped skeleton for route-level loading: title, KPI row, chart.
 *
 * ── REBUILT OFF LEGACY CSS ON 2026-09-08, ON THE `Skeleton` NEXT DOOR ────────────────
 *
 * This file used to explain why it did NOT use the Skeleton primitive, and the argument
 * deserves answering rather than deleting, because it was reasonable:
 *
 *     "the generated skeleton is a bare `animate-pulse` box with no size and no
 *      variants, whereas this block IS its sizes — a 22px title bar, 96px KPI tiles, a
 *      280px chart. Composing it out of the generated one would mean passing every
 *      dimension in from here, which puts layout values back in a JSX file and loses
 *      `.u-skeleton`'s shimmer."
 *
 * TWO OF THE THREE PREMISES NO LONGER HOLD.
 *
 * "Puts layout values back in a JSX file" was the strong one, and it is backwards for
 * THIS component: a page-shaped skeleton is nothing BUT its dimensions, and they were
 * living in `app.css` as `.u-skeleton--title` (22px), `--block` (120px, overridden to 96
 * and 280 by inline styles at the call site anyway). The values were already split
 * across two files with the JSX winning. One file now holds them, and it is the one that
 * says what shape the page is.
 *
 * "Loses the shimmer" is the real loss and it is deliberate. `.u-skeleton::after` swept a
 * gradient across each bar; the generated Skeleton pulses opacity instead. A sweep on
 * eight bars at once is eight animations the eye tracks individually, and §10 allows
 * motion for state changes the user must follow — a placeholder is the opposite of that.
 * The pulse is one property on one timing and reads as a single surface waiting.
 *
 * `Skeleton` IS APPROVED (Batch 3, 2026-09-08) and this one is not, which is the right
 * way round: the mark is settled and the arrangement is what is still being judged.
 *
 * `aria-busy` stays on the CONTAINER, which is the counterpart the Skeleton primitive's
 * own header describes — the region announces that content is coming, and the individual
 * bars stay `aria-hidden` (Skeleton's default), so assistive tech is told "loading" once
 * rather than read eight grey boxes.
 */

/* The shapes, in the file that owns them. `%` for the title so it tracks the column it
 * sits in, px for the tiles and the chart because those are the real heights of the
 * things they stand in for — a KPI card and a chart panel. */
const TITLE = { height: 22, width: '40%' };
const KPI = { height: 96 };
const CHART = { height: 280 };

function LoadingBlock({ label = 'Loading', kpis = 4 }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      style={{ padding: '16px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Skeleton style={TITLE} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 16,
      }}
      >
        {Array.from({ length: kpis }).map((_, i) => (
          <Skeleton key={i} style={KPI} />
        ))}
      </div>
      <Skeleton style={CHART} />
    </div>
  );
}

export { LoadingBlock };
