import { createContext, useContext } from 'react';

/* Where an overlay opened INSIDE a modal has to render.
 *
 * THE BUG THIS EXISTS TO PREVENT. The Journal workspace's Filter menu opened,
 * took focus, and was invisible. Not a styling miss — a stacking one, and the
 * chain is worth reading once because every overlay in every modal has it:
 *
 *   1. Base UI's portal, given no container, does NOT go to <body>. It goes to
 *      `parentPortalNode ?? document.body` (`useFloatingPortalNode`). A menu
 *      inside a modal is rendered within the dialog portal's context, so its
 *      popup lands in the dialog's portal node — as a SIBLING of the backdrop.
 *   2. That portal node sets no z-index, so the siblings inside it are compared
 *      in the root stacking context: the generated positioner's hardcoded
 *      `isolate z-50` against `.modal-backdrop`'s `z-index: 2147483000`.
 *   3. The menu loses by nine orders of magnitude and paints under the scrim.
 *
 * WHY THIS IS NOT FIXED WITH A Z-INDEX. The number cannot be raised where it is
 * wrong: the generated Positioner accepts no className (see menu.jsx), and the
 * ladder in tokens.css deliberately puts dropdown (50) below modal, which is
 * right — a dropdown belonging to the PAGE must not float over a modal. What is
 * actually being expressed is "this overlay belongs to the modal", and the way to
 * say that is containment, not a bigger number. Rendered inside the popup, the
 * menu inherits the modal's place in the ladder and needs no opinion of its own.
 *
 * WHY A REF RATHER THAN THE ELEMENT. Base UI accepts either, and a ref object is
 * stable from the first render — an element captured into state would re-render
 * every modal in the app one extra time on open, to hand the value to overlays
 * that mostly don't exist. It also fails softly: a ref whose `current` is still
 * null resolves to the old parent-portal behaviour, where an explicit `null`
 * container makes the portal render nothing at all.
 *
 * The default is `undefined`, NOT null, for that same reason — `undefined` means
 * "no opinion, use the default", and every overlay outside a modal keeps exactly
 * the behaviour it had.
 */
const OverlayContainerContext = createContext(undefined);

if (process.env.NODE_ENV !== 'production') {
  OverlayContainerContext.displayName = 'OverlayContainerContext';
}

// Returns a container to portal into, or `undefined` outside a modal.
function useOverlayContainer() {
  return useContext(OverlayContainerContext);
}

export { OverlayContainerContext, useOverlayContainer };
