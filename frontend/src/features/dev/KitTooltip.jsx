/* KitTooltip — the Cycle 00 review specimens for the tooltip. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`), piece 2. Same method as the data table before it:
 * the REAL component in the real cascade, because a drawing cannot show our bridge
 * re-meaning `bg-foreground` — which is the biggest thing on this page.
 *
 * WHY THE TOOLTIP IS PIECE 2 AND NOT PIECE 6. It is the smallest thing left in the cycle
 * and it is the one part of the data table's own spec that did NOT get built: the brief
 * asked for "adherence cells carry a reason on hover — a tooltip pattern", and what
 * shipped was a `title=` attribute, exactly as the old table does. Nothing regressed and
 * nothing was built either. `ui/tooltip.jsx` has been installed the whole time — it
 * arrived as a dependency of `sidebar` — and had never been wrapped, exported or looked at.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING.
 */
import React from 'react';
import { Info } from 'lucide-react';
import {
  Badge, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TOOLTIP_DELAY,
} from '@/components/primitives';
import {
  Tooltip as RawTooltip, TooltipContent as RawTooltipContent,
  TooltipTrigger as RawTooltipTrigger,
} from '@/components/ui/tooltip';

/* THE SCAFFOLD'S OWN LOOK, copied from KitDataTable so the two pieces read as one page. */
const F = {
  card: {
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)',
    margin: '22px auto 0', maxWidth: 1080, overflow: 'hidden',
  },
  head: {
    display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
    padding: '14px 18px', borderBottom: '1px solid var(--line-inset)',
  },
  name: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  mono: { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' },
  strong: { color: 'var(--text)', fontWeight: 600 },
  note: {
    padding: '11px 18px', borderTop: '1px solid var(--line-inset)',
    background: 'var(--surface-sunken)', fontSize: 12.5, lineHeight: '20px', color: 'var(--text-2)',
  },
  pane: { padding: '22px 18px', minWidth: 0 },
  row: { display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' },
  cell: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 150 },
  label: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500,
  },
  /* A stage tall enough that a tooltip opening ABOVE its trigger is not clipped by the
   * card — the specimen would otherwise reposition itself to the bottom and the review
   * would be of a side nobody asked for. */
  stage: { display: 'flex', alignItems: 'flex-end', minHeight: 74 },
};

/* THE REAL SENTENCE, not lorem (brief §5). This is what the adherence cell actually
 * carries today — `RULE_LABEL` joined with a comma — and it is deliberately the longest
 * of the three the app can produce, because the wrapping is half of what is being judged. */
const REASON = 'Broke: max SL, session, max trades per day';

/* THE ADHERENCE CELL, composed here rather than taken from `data-table.jsx`.
 *
 * THE TABLE IS LOCKED (09-09) AND THIS DOES NOT TOUCH IT. The shipped cell still carries
 * its reason on `title=`; moving it onto this component is a change to a signed-off
 * component's appearance, so it happens when the tooltip is signed, not before. What is
 * on screen here is the same badge with the same string, wired the way it WOULD be. */
function AdherenceBadge() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge tone="warn" />}>3 rules</TooltipTrigger>
      <TooltipContent>{REASON}</TooltipContent>
    </Tooltip>
  );
}

export function TooltipSpecimen() {
  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>Tooltip — the reason the adherence column has been faking</span>
        <span style={F.mono}>primitives/tooltip.jsx · @shadcn/tooltip</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          opens after {TOOLTIP_DELAY}ms
        </span>
      </div>

      {/* ONE PROVIDER AROUND THE WHOLE PANE, which is how a table would wrap its rows:
        * cross from one trigger to the next and the second opens instantly. Hover one,
        * then slide sideways to another — that skip is the thing to judge. */}
      <TooltipProvider>
        <div style={{ ...F.pane, ...F.row }}>
          <div style={F.cell}>
            <span style={F.label}>On a badge — the real cell</span>
            <div style={F.stage}><AdherenceBadge /></div>
          </div>

          <div style={F.cell}>
            <span style={F.label}>On an icon</span>
            <div style={F.stage}>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <button
                      type="button"
                      aria-label="What R means"
                      style={{
                        display: 'grid', placeItems: 'center', width: 28, height: 28,
                        borderRadius: 'var(--r-md)', border: '1px solid var(--line-control)',
                        background: 'transparent', color: 'var(--text-2)', cursor: 'help',
                      }}
                    />
                  )}
                >
                  <Info size={14} aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  R is the trade&rsquo;s result divided by the risk you planned for it.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div style={F.cell}>
            <span style={F.label}>Below, and one word</span>
            <div style={{ ...F.stage, alignItems: 'flex-start' }}>
              <Tooltip>
                <TooltipTrigger render={<Badge tone="profit" />}>Followed</TooltipTrigger>
                <TooltipContent side="bottom">Followed every evaluable rule</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>

      <div style={F.note}>
        <strong style={F.strong}>You have settled all three of these. This is what they
        came out as. </strong>
        <strong style={F.strong}>1. It is a panel, not the negative of the page. </strong>
        Every other floating thing in this app — the menu, the popover, the account
        switcher — is the same dark panel, and
        {' '}
        <code style={F.mono}>tokens.css</code>
        {' said so before the question was asked: --surface-2 is "EVERY FLOATING PANEL". '}
        shadcn&rsquo;s own tooltip inverts instead, which in this app comes out a near-white
        slab; the next card still shows you that, rendered from the registry directly.
        {' '}
        <strong style={F.strong}>2. The corner is the registry&rsquo;s, and it is a
        pill. </strong>
        That is worth saying plainly because it is not a near-miss:
        {' '}
        <code style={F.mono}>text-xs</code>
        {' is 12px on a 1.333 line-height, plus 6px of padding top and bottom, so the box '}
        is exactly 28px — and a corner can never exceed half its box, so the registry&rsquo;s
        14px draws a full stadium. It reads as deliberate here rather than as the checkbox
        bug, because that one was a circle nobody chose and this one was measured first. The
        one thing to know: it stays a stadium only while the tooltip is one line.
        {' '}
        <strong style={F.strong}>3. The pause is {TOOLTIP_DELAY}ms. </strong>
        Yours — the registry had it at zero and Base UI&rsquo;s own default is 600, which
        you cut. It asks &ldquo;are you pointing at this?&rdquo; rather than &ldquo;have you
        stopped on it?&rdquo;, which is the right question for a cell holding the only copy
        of why a rule was broken. Slide from one badge to the next and the second is
        instant — that is the provider grouping them, not the delay being gone.
      </div>
    </div>
  );
}

/* THE REGISTRY'S OWN, RENDERED UNMODIFIED — the same argument as `RegistryDialog` in
 * PrimitiveReview. Anything that differs between this card and the one above is OUR layer,
 * and is attributable to exactly one of: the bridge re-meaning a name (§25), a locked rule
 * overriding the preset (§6 radius), or a bug. */
export function TooltipRegistry() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>The same component, untouched by us</span>
        <span style={F.mono}>ui/tooltip.jsx, imported directly</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          the only difference left is the colour
        </span>
      </div>

      <div style={{ ...F.pane, ...F.row }}>
        <div style={F.cell}>
          <span style={F.label}>Registry — inverted, no delay</span>
          <div style={F.stage}>
            <RawTooltip>
              <RawTooltipTrigger render={<Badge tone="warn" />}>3 rules</RawTooltipTrigger>
              <RawTooltipContent>{REASON}</RawTooltipContent>
            </RawTooltip>
          </div>
        </div>

        <div style={F.cell}>
          <span style={F.label}>Ours — same corner, our colours, your delay</span>
          <div style={F.stage}><AdherenceBadge /></div>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>Hover both. The corner is now identical and the colour is
        the whole difference. </strong>
        Same component, same string. The left is what the registry ships, and it is not
        wrong where it comes from — shadcn draws a tooltip as the negative of the page, and
        on a light app that is a tasteful dark chip. Our bridge points
        {' '}
        <code style={F.mono}>--color-foreground</code>
        {' at --text and '}
        <code style={F.mono}>--color-background</code>
        {' at --bg, so the identical two utilities come out the other way round. That is '}
        §25 exactly: a generated component does not arrive as previewed, and the difference
        is absorbed in the wrapper rather than in the bridge.
        {' '}
        <strong style={F.strong}>The pane stays even though you have decided, </strong>
        because it is the only place the re-meaning is visible rather than described — and
        it is what to open first if a tooltip ever looks wrong after a token move.
      </div>
    </div>
  );
}

/* WHAT THIS PIECE STILL OWES. Written down rather than carried, per the pattern the
 * table's question pane set: an open item is on the page, not in someone's head. */
export function TooltipQuestions() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>What is left on this piece</span>
        <span style={{ flex: 1 }} />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>1. Panel or inverted — CLOSED 9 Sep. </strong>
        Panel, and the corner is the registry&rsquo;s. The
        {' '}
        <code style={F.mono}>surface</code>
        {' prop that existed so you could see both is deleted — it had one job and it is '}
        done, and a switch left behind after its question is answered is how an overlay ends
        up disagreeing with the other four.
        <br />
        <br />
        <strong style={F.strong}>2. The adherence cell is not migrated yet, on purpose.
        </strong>
        The table was locked this morning and the shipped cell still uses
        {' '}
        <code style={F.mono}>title=</code>
        . Moving it changes a signed-off component, so it happens the day you sign this one
        — and that is also the day the Trade Log gets a reason it can read on a touch device,
        which a `title=` has never given it.
        <br />
        <br />
        <strong style={F.strong}>3. A tooltip inside a modal does not work yet, and I have
        not faked it. </strong>
        The generated component hardcodes where it renders, so unlike the menu and the
        popover this one cannot be told &ldquo;draw inside the dialog&rdquo; — inside a
        modal it would paint under the scrim. Nothing in the app puts one there today. The
        fix is upstream, not a local edit, so it is a report rather than a patch.
      </div>
    </div>
  );
}
