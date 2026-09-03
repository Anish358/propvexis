import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/* PAGE ENTRANCE — the app arriving, ONCE PER BROWSER LOAD.
 *
 * OWNER DECISION, 2026-09-03, and the scope is the entire point of it. I argued against
 * a page entrance and was half wrong: my objection was frequency — a dashboard checked
 * fifteen times a day would play it fifteen times a day, delaying the one screen whose
 * job is to put three numbers in front of a trader quickly. The owner's answer was to
 * confine it to a REAL PAGE RELOAD, not an in-app screen change. In a single-page app
 * that is rare: navigating between Dashboard, Prop OS and Settings is client-side and
 * mounts nothing new here. So the polish lands on the moment it belongs to — the app
 * appearing from nothing — and costs nothing on the fifty navigations after it.
 *
 * AMENDED the same day: the page arrives as a CASCADE of sections rather than one flat
 * fade, and the rail and top bar sweep in around it. My "a cascade reads as a website
 * rather than an instrument" argument was really about frequency, and the gate below
 * already answers it. Two limits survived and still hold — no FIGURE animates (sections
 * arrive as whole blocks), and nothing gains a hover transform to fight the entrance's
 * `transform: none` (§14: hover intensifies, it does not move).
 *
 * ===========================================================================
 * THE ENTRANCE BELONGS TO REAL CONTENT, NOT TO A PLACEHOLDER — fixed 2026-09-03
 * ===========================================================================
 * The first build gated on the first paint of the DOCUMENT and cascaded the dashboard's
 * SKELETON, reasoning that on a cold load the skeleton is what paints first and so is
 * what the gate would see. That was right about the mechanism and wrong about the
 * result, and the owner caught it in one screenshot: a cascade holds each section at
 * opacity 0 until its delay, so for the first half-second the page is a Today's Brief
 * card above a large empty space. Then the trades land, the whole placeholder tree is
 * torn down mid-cascade, and the real page arrives on a DIFFERENT motion. Two competing
 * arrivals on the same boxes, the first of them interrupted. It read as a flicker
 * because it was one.
 *
 * So the flag is now claimed by whoever actually PLAYS an entrance, not by whatever
 * happened to render first:
 *
 *   - `useSectionEntrance` claims it on mount. The skeleton does not call it, so the
 *     placeholder appears as a stable whole and the cascade waits for the real thing.
 *   - `PageEntrance` claims it on the first NAVIGATION, so a route change still ends the
 *     arrival whether or not it has played yet. Without that, deep-linking to Prop OS and
 *     then clicking Dashboard would cascade on a client-side navigation — the exact thing
 *     this component exists to refuse.
 *
 * `booted` IS MODULE STATE, DELIBERATELY. A module is evaluated once per document, so the
 * flag survives every mount, unmount and remount, and a real reload re-evaluates the
 * module and plays the entrance again. A ref would reset with the component; React state
 * would too. THERE IS NO PROVIDER: an earlier version froze the answer in a context at
 * first paint, which is precisely what made the skeleton eat the entrance. Each consumer
 * reads the live flag at its own mount instead.
 *
 * THE FLAG IS SET IN AN EFFECT, NOT IN THE useState INITIALIZER. An initializer must be
 * pure — React may call it more than once and discard the result, and StrictMode does
 * exactly that in development. Flipping a module boolean from inside one would make the
 * entrance fire or not fire depending on a double-invoke, which is the kind of bug that
 * only ever shows up in the build nobody tests. Writing `true` is idempotent, so the
 * double-run is harmless wherever it happens.
 *
 * THE CHROME IS NOT GATED HERE, AND MUST NOT BE. `<Layout>` is a pathless layout route
 * (App.jsx), so the rail and the top bar mount once per document anyway — a CSS animation
 * on them fires exactly once for free. Their rules live in bridge.css and nothing in this
 * file knows about them.
 *
 * Reduced motion is handled globally — see the account.jsx header. The one thing the
 * global reset does NOT cover is `animation-delay`, which bridge.css zeroes for every
 * `[data-entrance]`; without that a staggered element would sit invisible for the whole
 * of its delay and then snap into place, which is worse than the animation it replaces. */

// False exactly once per document. See the header on why this is module scope.
let booted = false;

/* THE SECTION RHYTHM — 60ms between the page's own sections.
 *
 * A NUMBER IN JS RATHER THAN A TOKEN IN tokens.css, because no CSS rule ever reads it:
 * the delay is computed per index and handed over as an inline style. A token that
 * nothing resolves would be decoration in the one file whose whole job is to be the
 * single source of values. The rail's tighter 30ms step lives at ITS call site for the
 * same reason — see Sidebar.jsx. */
export const SECTION_STEP = 0.06;

/* A page's sections opting into the cascade.
 *
 * CALL IT FROM THE BRANCH THAT RENDERS REAL CONTENT, never from a loading branch. This
 * hook is what claims the once-per-load flag, so calling it from a skeleton spends the
 * app's one arrival on boxes that are about to be replaced — see the header.
 *
 * RETURNS A FUNCTION rather than the props directly, so ONE hook call covers a page with
 * six sections; a hook per section would put a hook inside whatever conditional the
 * section already lives in. It returns `undefined` on every paint but the first, which
 * spreads to nothing — `{...undefined}` is legal, and that is the point of the shape.
 *
 * TWO SECTIONS MAY SHARE AN INDEX, and the dashboard uses that: the calendar and the
 * right-hand column take the same delay so they arrive as ONE unit, which is how the
 * design draws them. They cannot be wrapped in a div to say so — they are grid children,
 * and a wrapper would break the grid (§2). */
export function useSectionEntrance() {
  const [first] = useState(() => !booted);
  useEffect(() => { booted = true; }, []);
  return useCallback(
    (index) => (first
      ? { 'data-entrance': 'up', style: { animationDelay: `${(index * SECTION_STEP).toFixed(3)}s` } }
      : undefined),
    [first],
  );
}

/* The flat fade — the default for every page that has not opted into a cascade: Prop OS,
 * Settings, the Trade Log, the Journal. `backwards` holds opacity 0 through the frame
 * before the animation starts, so the page cannot flash at full opacity and then fade up
 * from nothing. `--dur` rather than a new number: 200ms is what §10 already calls
 * "content arriving", and a page is content arriving. */
const ENTRANCE = 'animate-[pv-content-in_var(--dur)_var(--ease)_backwards]';

export function PageEntrance({ className, children, ...rest }) {
  const [first] = useState(() => !booted);
  const { pathname } = useLocation();
  const [seen, setSeen] = useState(pathname);

  /* THE FIRST NAVIGATION ENDS THE ARRIVAL, played or not. Derive-during-render rather
   * than an effect, and the ordering is the whole reason: React renders top-down, so
   * setting the flag in this parent's body happens BEFORE the routed page below renders
   * and reads it. In an effect it would be too late — child effects run before parent
   * effects, so the incoming page would already have decided to cascade.
   *
   * The same shape BriefSection uses, and safe under StrictMode for the same reason the
   * effect above is: the write is idempotent and the state guard is real state, not a
   * ref. */
  if (seen !== pathname) {
    setSeen(pathname);
    booted = true;
  }

  return (
    <div data-slot="page-entrance" className={cn(first && ENTRANCE, className)} {...rest}>
      {children}
    </div>
  );
}

/* CONTENT THAT ARRIVED LATE — a sibling of PageEntrance, and the difference is the gate.
 *
 * PageEntrance fires once per browser load. This fires on every MOUNT, and the caller
 * is responsible for only mounting it when something genuinely replaced a placeholder:
 * a fetch landing after first paint, a skeleton giving way to real rows. Used correctly
 * it says "this arrived later than the page around it", which is true and worth saying.
 *
 * NO CALLER TODAY, and that is deliberate rather than an oversight. The dashboard used
 * it for its skeleton→content swap; that swap is now the section cascade, which says the
 * same thing better and says it once. Kept because the case recurs the moment any other
 * surface grows a late fetch, and because a flat fade is the right answer for a surface
 * with no sections to stagger.
 *
 * IT IS NOT A DECORATION FOR EVERY BLOCK. Wrapping content that was present at first
 * paint makes the page fade in piece by piece for no reason, and — worse — it spends the
 * one signal the app has for "this is new" on things that are not. If the content was
 * always going to be there, it should just be there. */
export function ContentArrival({ className, children, ...rest }) {
  return (
    <div data-slot="content-arrival" className={cn(ENTRANCE, className)} {...rest}>
      {children}
    </div>
  );
}

export default PageEntrance;
