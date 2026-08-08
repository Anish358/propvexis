/* LoadingBlock — PropVexis primitive.
 *
 * A page-shaped skeleton for route-level loading: title, KPI row, chart. Moved here
 * verbatim from `ui.jsx`; the `.u-loading` / `.u-skeleton--*` classes are unchanged,
 * so nothing about it renders differently.
 *
 * WHY IT DOES NOT USE THE `Skeleton` PRIMITIVE NEXT DOOR, which looks like the
 * obvious thing to do: the generated skeleton is a bare `animate-pulse` box with no
 * size and no variants, whereas this block IS its sizes — a 22px title bar, 96px
 * KPI tiles, a 280px chart. Composing it out of the generated one would mean
 * passing every dimension in from here, which puts layout values back in a JSX file
 * and loses `.u-skeleton`'s shimmer. So the shapes stay in CSS where they belong,
 * and the two skeleton implementations coexist on purpose until DESIGN-LANGUAGE §16
 * settles skeleton fidelity — at which point ONE of them wins for both.
 *
 * `aria-busy` lives on the container here rather than on each bar, which is the
 * counterpart the Skeleton primitive's header describes: the region announces that
 * content is coming, and the individual bars stay hidden from assistive tech.
 */

function LoadingBlock({ label = 'Loading', kpis = 4 }) {
  return (
    <div className="u-loading" aria-busy="true" aria-label={label}>
      <div className="u-skeleton u-skeleton--title" aria-hidden="true" />
      <div className="u-skel-kpis">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="u-skeleton u-skeleton--block" style={{ height: 96 }} aria-hidden="true" />
        ))}
      </div>
      <div className="u-skeleton u-skeleton--block" style={{ height: 280 }} aria-hidden="true" />
    </div>
  );
}

export { LoadingBlock };
