import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DASH_SECTIONS, KPI_WIDGETS, MAIN_WIDGETS, DASH_LABEL, GRID_COLUMNS,
  widgetSpan, widgetSizeName, isDashVisible, visibleDashIds, visibleSections,
  hiddenDashWidgets, isDefaultDashLayout,
} from './dashLayout.js';

// Dashboard Layout Editor — a miniature, editable wireframe of the dashboard.
//
// This is an EDITOR, not a settings panel: there is no list of options and no
// Save button. The miniature renders from the same layout data the real
// dashboard does, and every drag writes straight through, so the workspace
// behind the editor rearranges as you move things.
//
// ---- why pointer events, not HTML5 drag-and-drop ----------------------------
// The list reorders LIVE while you drag, which means the dragged node gets moved
// in the DOM mid-gesture. HTML5 DnD aborts when that happens (and it's
// mouse-only). Pointer events give us live reorder, touch support, and full
// control over hit-testing for free.
//
// ---- how a drag works -------------------------------------------------------
// The dragged tile STAYS in the list, rendered as a dashed ghost, and the other
// tiles FLIP-animate around it as the pointer moves. So the ghost always sits
// exactly where the widget will land — no floating clone to keep in sync, and
// "snap to grid" is just CSS Grid doing the packing.

// ---- FLIP ------------------------------------------------------------------
// Measure every tile before the re-render, then animate each one from where it
// WAS to where it now is. Grid placement can't be transitioned directly, so the
// movement has to be faked with transforms.
//
// It also publishes the SETTLED geometry into `rects`, which is what the drag
// hit-tests against — see the note in useDragReorder for why that matters.
const FLIP_MS = 160;
// How far the pointer must travel between two reorders, in px. Small enough to
// feel immediate, large enough that jitter or a repack can't retrigger a move.
const MIN_TRAVEL = 8;

function useFlip(deps) {
  const ref = useRef(null);
  const prev = useRef(new Map());
  // id -> { zone, rect } at rest. Read by the drag; written only here, where we
  // already have to measure.
  const rects = useRef(new Map());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const tiles = [...root.querySelectorAll('[data-sortable]')];

    // Clear any in-flight transform BEFORE measuring. Without this we'd measure a
    // tile halfway through its previous animation and treat that as its resting
    // place — the deltas would compound and the tiles would visibly judder.
    for (const tile of tiles) {
      tile.style.transition = 'none';
      tile.style.transform = '';
    }

    const next = new Map(tiles.map((t) => [t.dataset.sortable, t.getBoundingClientRect()]));
    rects.current = new Map(tiles.map((t) => [t.dataset.sortable, {
      zone: t.dataset.zone,
      rect: next.get(t.dataset.sortable),
    }]));

    for (const tile of tiles) {
      const id = tile.dataset.sortable;
      const old = prev.current.get(id);
      if (!old) continue;
      // The ghost is the drop target indicator — it must not slide around.
      if (tile.dataset.dragging === 'true') continue;
      const rect = next.get(id);
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      tile.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        tile.style.transition = `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1)`;
        tile.style.transform = '';
      });
    }
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, rects };
}

// ---- drag ------------------------------------------------------------------
// One drag at a time, addressed by widget id (not index — the index changes under
// us on every live reorder). `zone` is captured at drag start and every move is
// resolved within that zone only, which is what confines a KPI card to the KPI
// row and a grid widget to the grid.
//
// ---- why not document.elementFromPoint --------------------------------------
// Hit testing respects CSS transforms, and FLIP animates tiles with transforms.
// So mid-animation a tile SWEEPS ACROSS the cursor, elementFromPoint reports it as
// the drop target, that triggers another reorder, which starts another animation —
// a feedback loop that reads as the tiles shaking rapidly under the pointer.
// Resolving against the settled rects FLIP measured instead breaks the loop: the
// geometry we test against doesn't move until the layout actually changes.
function useDragReorder(onMove, rects) {
  const [drag, setDrag] = useState(null); // { zone, id } | null
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    if (!drag) return undefined;
    let frame = 0;
    let pending = null;
    // Pointer position at the last committed reorder. A reorder requires the
    // pointer to have travelled MIN_TRAVEL since then, which is the hard
    // guarantee against oscillation: dense grid packing can occasionally drop a
    // tile back under a stationary cursor, and without this that would flip-flop
    // forever. A still pointer can never reorder twice.
    let committedAt = null;

    // Which tile in this zone is the point inside? Same-zone rects never overlap,
    // so the first containing rect is the answer. Nested tiles (a KPI card inside
    // its section) are filtered out by zone rather than by depth.
    const hitTest = (x, y) => {
      for (const [id, { zone, rect }] of rects.current) {
        if (zone !== drag.zone) continue;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
      }
      return null;
    };

    const apply = () => {
      frame = 0;
      if (!pending) return;
      const { x, y } = pending;
      pending = null;
      if (committedAt) {
        const tx = x - committedAt.x;
        const ty = y - committedAt.y;
        if (tx * tx + ty * ty < MIN_TRAVEL * MIN_TRAVEL) return;
      }
      const targetId = hitTest(x, y);
      // Landing on itself is the steady state after a successful move: the tile
      // now occupies the slot the pointer is over, so there is nothing to do.
      if (!targetId || targetId === drag.id) return;
      committedAt = { x, y };
      moveRef.current(drag.zone, drag.id, targetId);
    };

    // Coalesce to one hit-test per frame — pointermove can fire several times per
    // paint, and reordering more than once between frames is wasted work the user
    // can never see.
    const onPointerMove = (e) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const end = () => setDrag(null);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [drag, rects]);

  const start = (zone, id) => (e) => {
    if (e.button != null && e.button !== 0) return; // primary button / touch only
    e.preventDefault(); // kills the native text-selection drag
    e.stopPropagation(); // a widget drag must not also start its section dragging
    // preventDefault above suppresses the default focus, so do it explicitly —
    // otherwise clicking a tile and then pressing Alt+arrow does nothing.
    e.currentTarget?.focus?.();
    setDrag({ zone, id });
  };

  return { drag, start };
}

const EyeIcon = ({ off }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.39-1.61" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <path d="m2 2 20 20" />
      </>
    ) : (
      <>
        <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

// Hide/show control. Stops pointerdown propagating so clicking the eye on a tile
// never starts dragging that tile.
function VisibilityToggle({ id, label, visible, onToggle }) {
  return (
    <button
      type="button"
      className="dle-eye"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(id, !visible); }}
      title={visible ? `Hide ${label}` : `Show ${label}`}
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={!visible}
    >
      <EyeIcon off={!visible} />
    </button>
  );
}

export default function DashLayoutEditor({
  open, onClose, layout, setDashVisible, moveDashWidget, resetDashLayout,
}) {
  const onToggle = setDashVisible || (() => {});
  // Re-measure whenever the layout changes — that's every live reorder. The rects
  // it publishes are also what the drag resolves against.
  const { ref: flipRef, rects } = useFlip([layout]);
  const { drag, start } = useDragReorder(moveDashWidget || (() => {}), rects);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dragging = (zone, id) => drag?.zone === zone && drag?.id === id;
  // Attributes every draggable tile needs: the hit-test hooks (data-zone +
  // data-sortable) and the ghost flag FLIP reads.
  const tileProps = (zone, id) => ({
    'data-sortable': id,
    'data-zone': zone,
    'data-dragging': dragging(zone, id) ? 'true' : undefined,
  });

  const sections = visibleSections(layout);
  const kpis = visibleDashIds(layout, 'kpis');
  const main = visibleDashIds(layout, 'main');
  const hidden = hiddenDashWidgets(layout);

  // Keyboard equivalent of a drag: Alt+arrows nudge a tile through its zone.
  // Pointer drag is mouse/touch-only and this editor is the only way to arrange
  // the workspace, so it can't be pointer-exclusive.
  const onTileKeyDown = (zone, id, list) => (e) => {
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (!e.altKey || (!back && !fwd)) return;
    e.preventDefault();
    const i = list.indexOf(id);
    const target = list[back ? i - 1 : i + 1];
    if (target) moveDashWidget(zone, id, target);
  };

  const sectionBody = {
    brief: () => <div className="dle-block">Today's Brief</div>,

    kpis: () => (
      <div className="dle-kpis">
        {kpis.map((id) => (
          <div
            key={id}
            {...tileProps('kpis', id)}
            className={`dle-tile dle-kpi ${dragging('kpis', id) ? 'is-ghost' : ''}`}
            onPointerDown={start('kpis', id)}
            onKeyDown={onTileKeyDown('kpis', id, kpis)}
            tabIndex={0}
            role="button"
            aria-label={`${DASH_LABEL[id]} KPI card, ${kpis.indexOf(id) + 1} of ${kpis.length}. Drag, or Alt with arrow keys, to reorder.`}
          >
            <span className="dle-tile-name">{DASH_LABEL[id]}</span>
            <VisibilityToggle id={id} label={DASH_LABEL[id]} visible onToggle={onToggle} />
          </div>
        ))}
      </div>
    ),

    main: () => (
      // Dense auto-flow does the packing: a widget's ordinal position in the list
      // plus its fixed size is enough to place it, so dragging is pure reordering.
      <div className="dle-grid" style={{ '--dle-cols': GRID_COLUMNS }}>
        {main.map((id) => {
          const { cols, rows } = widgetSpan(id);
          return (
            <div
              key={id}
              {...tileProps('main', id)}
              className={`dle-tile dle-widget ${dragging('main', id) ? 'is-ghost' : ''}`}
              style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
              onPointerDown={start('main', id)}
              onKeyDown={onTileKeyDown('main', id, main)}
              tabIndex={0}
              role="button"
              aria-label={`${DASH_LABEL[id]} widget, ${widgetSizeName(id)}, ${main.indexOf(id) + 1} of ${main.length}. Drag, or Alt with arrow keys, to reorder.`}
            >
              <span className="dle-tile-name">{DASH_LABEL[id]}</span>
              <VisibilityToggle id={id} label={DASH_LABEL[id]} visible onToggle={onToggle} />
            </div>
          );
        })}
      </div>
    ),
  };

  return (
    // Deliberately a LIGHT backdrop, not the app's usual dim: the point of a live
    // editor is watching the real dashboard rearrange behind it.
    <div className="dle-backdrop" onClick={onClose}>
      <div
        className={`dle-panel ${drag ? 'is-dragging' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Customize Dashboard"
      >
        <header className="dle-head">
          <h2>Customize Dashboard</h2>
          <div className="dle-head-actions">
            <button type="button" className="dle-reset" onClick={resetDashLayout} disabled={isDefaultDashLayout(layout)}>
              Reset Layout
            </button>
            <button type="button" className="dle-x" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        <p className="dle-hint">
          Drag to rearrange — the dashboard behind updates as you go. Sections move vertically;
          KPI cards and widgets stay within their own row or grid.
        </p>

        <div className="dle-canvas" ref={flipRef}>
          {sections.map((id) => (
            <div
              key={id}
              {...tileProps('sections', id)}
              className={`dle-section ${dragging('sections', id) ? 'is-ghost' : ''}`}
            >
              {/* Section drags start from the grip only. Anywhere-on-the-tile
                  would be ambiguous once the tile contains its own draggables. */}
              <div className="dle-section-head">
                <span
                  className="dle-grip"
                  onPointerDown={start('sections', id)}
                  onKeyDown={onTileKeyDown('sections', id, sections)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Move ${DASH_LABEL[id]} section, ${sections.indexOf(id) + 1} of ${sections.length}. Drag, or Alt with arrow keys, to reorder.`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="5" r="1.8" /><circle cx="15" cy="5" r="1.8" />
                    <circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" />
                    <circle cx="9" cy="19" r="1.8" /><circle cx="15" cy="19" r="1.8" />
                  </svg>
                </span>
                <span className="dle-section-name">{DASH_LABEL[id]}</span>
                <VisibilityToggle id={id} label={DASH_LABEL[id]} visible onToggle={onToggle} />
              </div>
              {sectionBody[id]()}
            </div>
          ))}
        </div>

        {/* Hidden widgets leave the wireframe entirely, so without this tray there
            would be no way back short of Reset Layout. */}
        {hidden.length > 0 && (
          <div className="dle-hidden">
            <span className="dle-hidden-label">Hidden</span>
            {hidden.map((w) => (
              <button
                key={w.id}
                type="button"
                className="dle-chip"
                onClick={() => onToggle(w.id, true)}
                title={`Show ${w.label}`}
              >
                <EyeIcon off />
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Re-exported for tests: the editor must offer a tile for every catalogue entry.
export const EDITOR_CATALOGUE = { DASH_SECTIONS, KPI_WIDGETS, MAIN_WIDGETS };
