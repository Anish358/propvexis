import * as React from "react"

/* 900, NOT THE GENERATED 768 — and this is the one edit made to a generated file
 * rather than in a wrapper, because a hook has no wrapper seam and the number has to
 * agree with CSS or the rail tears.
 *
 * DESIGN-LANGUAGE §22 closes the breakpoint set at 1200 / 1080 / 900, and 900 is
 * specifically "the rail leaves the flow and becomes a drawer". The shadcn Sidebar
 * decides drawer-vs-rail from THIS hook and paints the desktop rail from `md:`, so
 * both have to name the same width: bridge.css repoints --breakpoint-md at 900 for
 * the CSS half. If these two ever disagree the rail is a drawer that still reserves
 * its 248px gap, or a rail with no way to open it — between the two numbers, silently.
 * `sidebar-breakpoint.test.js` pins that they match. */
const MOBILE_BREAKPOINT = 900

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return !!isMobile
}
