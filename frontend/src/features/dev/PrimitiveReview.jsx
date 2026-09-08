/* PrimitiveReview — the Test page. DEV ONLY.
 *
 * Every primitive waiting on owner sign-off, rendered as the REAL component, so the
 * appearance being approved is the one that ships. Plan and rationale:
 * docs/architecture/PRIMITIVE-REVIEW-PLAN.md. Rule: DESIGN-LANGUAGE §1.
 *
 * WHY A PAGE IN THE APP AND NOT STORYBOOK. Storybook renders in an isolated iframe.
 * This codebase's recurring bugs are cascade bugs — the legacy layer, utilities that
 * compile to nothing outside components/, tokens that resolve differently in context —
 * so a component can look right in isolation and be broken in the app. Rendering inside
 * the real shell is the whole point.
 *
 * WHY THIS FILE USES INLINE STYLES. Tailwind's `@source` covers components/{ui,
 * primitives} only, so a utility class written in a page emits NOTHING, silently
 * (§1, and `utility-collisions.test.js` fails the build for it). The gallery's own
 * scaffolding is therefore inline `style` reading tokens.css directly. That is not a
 * page originating appearance in the §2 sense — the specimens are the real primitives,
 * and everything around them is dev scaffolding that never ships.
 *
 * REVIEW ONE BATCH AT A TIME. Related primitives are locked together, because a text
 * box and a dropdown that sit on the same form must share a height and a radius —
 * locking them one at a time guarantees the second one reopens the first.
 *
 * This page is deleted when nothing is left `@design unreviewed`.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Bell, CheckCircle2, ChevronDown, Filter, Inbox, Info,
  MoreHorizontal, Trash2,
} from 'lucide-react';
/* THE REGISTRY COMPONENTS, IMPORTED RAW. Every other specimen on this page goes through
 * `@/components/primitives` — our wrapper layer, which is exactly what re-means shadcn's
 * vocabulary (§25) and applies our locked overrides. These two bypass it, so the pane
 * below shows what the REGISTRY gives under our tokens, with none of our corrections.
 * That is the only honest baseline for "does ours match the preview". */
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button as RawButton } from '@/components/ui/button';
/* AND THE FORM FAMILY, for Batch 2's parity pane. Same argument as the dialog above:
 * `ui/select.jsx` is the registry component with none of our layer, so whatever it draws
 * beside ours is attributable to `primitives/select.jsx` and nothing else. The other six
 * in the batch need no raw import — `input`, `textarea`, `checkbox` and `label` ARE
 * straight re-exports, and `field` re-exports everything but its error, so a
 * registry-vs-ours pane for any of them would render the same element twice. */
import {
  SelectContent as RawSelectPopup, SelectItem as RawSelectItem,
  SelectTrigger as RawSelectTrigger, SelectValue as RawSelectValue,
} from '@/components/ui/select';
import {
  Alert, AlertAction, AlertDescription, AlertTitle,
  Badge,
  Button, ButtonLabel, Checkbox, ConsentField, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Field, FieldDescription, FieldError, FieldLabel, Input,
  Label,
  Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger, Modal,
  OverlayContainerContext, Popover, PopoverContent,
  PopoverTrigger, Progress, ProgressIndicator, ProgressLabel, ProgressTrack,
  ProgressValue,
  Avatar, AvatarFallback, AvatarGroup, CountBadge, EmptyState, LoadingBlock, Separator,
  Tabs,
  Select, SelectItem, SelectPopup, SelectTrigger, SelectValue,
  Skeleton, Spinner, Switch, Textarea, ToggleGroupExclusive, ToggleGroupItem,
} from '@/components/primitives';

/* ---------------------------------------------------------------- scaffolding --- */

const S = {
  page: { padding: '28px 32px 96px', maxWidth: 1080, margin: '0 auto' },
  eyebrow: {
    fontSize: 11, letterSpacing: '.11em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500,
  },
  h1: {
    fontSize: 26, lineHeight: '32px', fontWeight: 550, color: 'var(--text)',
    letterSpacing: '-.2px', margin: '10px 0 0',
  },
  lede: {
    fontSize: 13.5, lineHeight: '21px', color: 'var(--text-2)',
    margin: '10px 0 0', maxWidth: '84ch',
  },
  batchHead: {
    display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
    margin: '40px 0 4px',
  },
  batchTitle: { fontSize: 17, fontWeight: 600, color: 'var(--text)' },
  card: {
    border: '1px solid var(--line)', borderRadius: 14,
    background: 'var(--surface)', overflow: 'hidden', marginTop: 16,
  },
  cardHead: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '13px 18px', borderBottom: '1px solid var(--line)',
    background: 'var(--control-bg)',
  },
  cardName: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  mono: {
    fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11.5,
    color: 'var(--text-3)',
  },
  note: {
    padding: '11px 18px', borderTop: '1px solid var(--line-inset)',
    background: 'var(--surface-sunken)', fontSize: 12.5, lineHeight: '20px',
    color: 'var(--text-2)',
  },
  specimens: { display: 'flex', flexWrap: 'wrap', gap: 20, padding: 18 },
  specimen: { display: 'flex', flexDirection: 'column', gap: 9, minWidth: 150 },
  specimenLabel: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500,
  },
  stage: {
    border: '1px dashed var(--line-hover)', borderRadius: 10,
    padding: 16, display: 'flex', alignItems: 'center', gap: 10,
    minHeight: 56, background: 'var(--bg)',
  },
};

function Tag({ children, tone = 'wait' }) {
  const tones = {
    wait: { bg: 'var(--control-bg-strong)', fg: 'var(--text-2)', bd: 'var(--line-hover)' },
    open: { bg: 'var(--accent-bg)', fg: 'var(--accent)', bd: 'var(--accent)' },
    ok: { bg: 'var(--control-bg-strong)', fg: 'var(--text)', bd: 'var(--line-chip)' },
  };
  const t = tones[tone] || tones.wait;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 9px',
      borderRadius: 99, background: t.bg, border: `1px solid ${t.bd}`,
      fontSize: 11, fontWeight: 500, color: t.fg, whiteSpace: 'nowrap',
    }}
    >
      {children}
    </span>
  );
}

/* A single primitive under review. `states` are the two or three conditions worth
 * judging; `context` is the same component inside the arrangement it actually appears
 * in — a component approved in isolation is a component approved in a vacuum. */
function Spec({ name, file, states, context, contextLabel, ask, approved }) {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>{name}</span>
        <span style={S.mono}>{file}</span>
        <span style={{ flex: 1 }} />
        {approved ? <Tag tone="ok">{`approved ${approved}`}</Tag> : <Tag tone="ok">approved 7 Sep 2026</Tag>}
      </div>

      <div style={S.specimens}>
        {states.map((s) => (
          <div key={s.label} style={S.specimen}>
            <span style={S.specimenLabel}>{s.label}</span>
            <div style={S.stage}>{s.render}</div>
          </div>
        ))}
      </div>

      {context ? (
        <div style={{ ...S.specimens, borderTop: '1px solid var(--line-inset)' }}>
          <div style={{ ...S.specimen, flex: 1 }}>
            <span style={S.specimenLabel}>In context — {contextLabel}</span>
            <div style={S.stage}>{context}</div>
          </div>
        </div>
      ) : null}

      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Look at: </strong>
        {ask}
      </div>
    </div>
  );
}

/* ------------------------------------------- the dialog, registry vs ours --- */

/* THE REGISTRY COMPONENT, RENDERED UNMODIFIED, beside ours.
 *
 * Built after four rounds of hand-porting values from screenshots found one more
 * difference every time. That approach was wrong: it reconstructs the component instead
 * of rendering it. This pane imports `ui/alert-dialog.jsx` and `ui/button.jsx` DIRECTLY,
 * so whatever it shows is what the registry produces under our tokens — no wrapper, no
 * §6 radius correction, no re-meant `text-sm`.
 *
 * Anything that differs between the two panes is OUR layer, and is attributable to
 * exactly one of: bridge.css re-meaning a name (§25), a locked rule overriding the
 * preset (§6), or a bug. */
function RegistryDialog() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <div ref={ref} style={{ position: 'relative', minHeight: 300 }}>
      <OverlayContainerContext.Provider value={ref}>
        <RawButton variant="outline" onClick={() => setOpen(true)}>Open registry dialog</RawButton>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account and
                remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => setOpen(false)}>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </OverlayContainerContext.Provider>
    </div>
  );
}

function OurDialog() {
  return (
    <div style={{ position: 'relative', minHeight: 300 }}>
      <ModalSpecimen />
    </div>
  );
}

function DialogParity() {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Dialog — registry component vs ours</span>
        <span style={S.mono}>ui/alert-dialog.jsx, imported raw</span>
        <span style={{ flex: 1 }} />
        <Tag tone="open">open both</Tag>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Registry — no wrapper, no overrides</span>
          <div style={{ ...S.stage, alignItems: 'flex-start' }}><RegistryDialog /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Ours — through primitives/modal.jsx</span>
          <div style={{ ...S.stage, alignItems: 'flex-start' }}><OurDialog /></div>
        </div>
      </div>
      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Open both and compare. </strong>
        The left pane is the registry component with nothing of ours applied — it is the
        honest baseline. Every difference on the right is our layer, and traces to one of
        three things: <span style={S.mono}>bridge.css</span> re-meaning a shadcn name
        (§25), a locked rule overriding the preset (§6 radius), or a bug.
      </div>
    </div>
  );
}

/* --------------------------------------------------------- palette reference --- */

/* THE COMPLETE LOCKED PALETTE, and the preset it was aligned to.
 *
 * Not a before/after: the ramp settled on 2026-09-07 and DESIGN-LANGUAGE §4 carries the
 * rule, so keeping the superseded proposals here would be the accumulating history §21
 * tells the rulebook not to keep.
 *
 * EVERY VALUE ON THIS CARD IS READ FROM THE LIVE STYLESHEET at mount, never typed in.
 * A hardcoded swatch strip is a second opinion that drifts from the tokens silently —
 * this one cannot: if a value here looks wrong, tokens.css is wrong, not this page. The
 * two contextual tokens are read TWICE, once from :root and once from inside a real
 * [data-overlay-surface] subtree, which is the only honest way to show a relative token.
 */
const SURFACES = [
  ['page', '--bg'],
  ['rail', '--rail-bg'],
  ['sunken — footer, meter cell', '--surface-sunken'],
  ['CARD', '--surface'],
  ['the one raised card', '--surface-raised'],
  ['a row inside a card', '--row-bg'],
  ['a pill control', '--control-bg'],
  ['a filled quiet button', '--control-bg-strong'],
  ['a row hover ON A CARD', '--surface-hover'],
  ['a quiet active fill', '--sel-bg'],
  ['a selected account chip', '--sel-well'],
  ['the strongest quiet fill', '--sel-bg-strong'],
];

const OVERLAY = [
  ['FLOATING PANEL', '--surface-2'],
  ['a row highlighted in it', '--overlay-hover'],
  ['its edge', '--overlay-line'],
  ["a MODAL's outer ring — alpha", '--detached-line'],
];

const LINES = [
  ['divider inside a card', '--line-inset'],
  ["a card's edge", '--line'],
  ["a control's edge", '--line-control'],
  ['standard visible border', '--line-strong'],
  ["a chip's edge", '--line-chip'],
  ['selected chip', '--line-selected'],
  ['a hover edge', '--line-hover'],
];

const TEXT = [
  ['primary', '--text'],
  ["the page's base colour", '--text-body'],
  ['links, the clock', '--text-link'],
  ['table heads, event names', '--text-2'],
  ['SECONDARY — the most used', '--muted'],
  ['tertiary — descriptions', '--text-3'],
  ['eyebrows, quiet metadata', '--text-4'],
  ['faintest readable', '--text-5'],
  ['not-really-text', '--text-dim'],
];

const MEANING = [
  ['ACTION — a primary button', '--action'],
  ['its hover, the brand tile', '--action-2'],
  ['BRAND — a fill, never text', '--accent'],
  ['brand as text (AA)', '--accent-on-surface'],
];

const MONEY = [
  ['PROFIT — structural', '--profit'],
  ['profit on a tint', '--profit-bright'],
  ['LOSS — structural, a figure', '--loss'],
  ['loss on a tint', '--loss-bright'],
  ['breakeven — the third outcome', '--be'],
];

const SYSTEM = [
  ['DESTRUCTIVE — a dangerous action', '--destructive'],
  ['success glyph / edge', '--success'],
  ['info glyph / edge', '--info'],
  ['warning', '--warning'],
];

/* THREE, not two, since 2026-09-07: a control's edge is contextual as well. This card
   exists to show relative tokens honestly, so a missing row is the one failure it cannot
   afford. */
const CONTEXTUAL = ['--chrome-line', '--chrome-hover', '--chrome-line-control'];

const ALL_TOKENS = [
  ...SURFACES, ...OVERLAY, ...LINES, ...TEXT, ...MEANING, ...MONEY, ...SYSTEM,
].map(([, t]) => t).concat(CONTEXTUAL, ['--input-line']);

/* Read the tokens as the browser resolved them. A custom property's computed value has
 * its var() references already substituted, so `--chrome-line: var(--line)` comes back
 * as the hex — which is exactly what makes the contextual pair demonstrable. */
function useResolvedTokens() {
  const overlayRef = React.useRef(null);
  const [vals, setVals] = React.useState({});
  React.useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const out = {};
    ALL_TOKENS.forEach((t) => { out[t] = root.getPropertyValue(t).trim(); });
    if (overlayRef.current) {
      const ov = getComputedStyle(overlayRef.current);
      CONTEXTUAL.forEach((t) => { out[`overlay${t}`] = ov.getPropertyValue(t).trim(); });
    }
    setVals(out);
  }, []);
  return [vals, overlayRef];
}

function Swatch({ token }) {
  return (
    <span style={{
      width: 22,
      height: 22,
      flex: 'none',
      borderRadius: 6,
      background: `var(${token})`,
      border: '1px solid var(--line-chip)',
    }}
    />
  );
}

function Swatches({ rows, vals }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map(([role, token]) => (
        <div
          key={token + role}
          style={{
            display: 'grid',
            gridTemplateColumns: '22px minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 10,
            padding: '5px 0',
          }}
        >
          <Swatch token={token} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{
              fontSize: 12,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            >
              {role}
            </span>
            <span style={{ ...S.mono, fontSize: 10.5 }}>{token}</span>
          </span>
          <span style={{ ...S.mono, fontSize: 10.5, whiteSpace: 'nowrap' }}>
            {vals[token] || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* The two relative tokens, each shown resolving on BOTH grounds. This is the card's one
 * piece of live proof rather than live reporting: the right-hand swatches sit inside a
 * real [data-overlay-surface] element, so they are not asserting that the override works
 * — they are the override working. */
function ContextualPair({ vals, overlayRef }) {
  const row = (token, over) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Swatch token={token} />
      <span style={{ ...S.mono, fontSize: 10.5, whiteSpace: 'nowrap' }}>
        {(over ? vals[`overlay${token}`] : vals[token]) || ''}
      </span>
    </span>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: 2 }}>
        <span style={{ ...S.mono, fontSize: 10 }}>on a CARD</span>
        <span style={{ ...S.mono, fontSize: 10 }}>in an OVERLAY</span>
      </div>
      {CONTEXTUAL.map((token, i) => (
        <div key={token} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 0' }}>
          <span style={{ ...S.mono, fontSize: 10.5, color: 'var(--text-2)' }}>{token}</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {row(token, false)}
            <span data-overlay-surface ref={i === 0 ? overlayRef : null}>
              {row(token, true)}
            </span>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 8 }}>
        <span style={{ ...S.mono, fontSize: 10.5, color: 'var(--text-2)' }}>--input-line</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Swatch token="--input-line" />
          <span style={{ ...S.mono, fontSize: 10.5 }}>{vals['--input-line'] || ''}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.45 }}>
          One of TWO translucent values, and neither needs a context — an alpha re-reads
          on any ground. This one is a control&rsquo;s edge and fill;
          {' '}
          <span style={S.mono}>--detached-line</span>
          {' '}
          above is the other, and §4 says when each is allowed: opaque and graded where we
          own the ground, alpha where we do not.
        </span>
      </div>
    </div>
  );
}

function Group({ label, children }) {
  return (
    <div style={{ flex: '1 1 268px', minWidth: 250 }}>
      <span style={S.specimenLabel}>{label}</span>
      {children}
    </div>
  );
}

function PaletteReference() {
  const [vals, overlayRef] = useResolvedTokens();
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Palette — the complete locked set</span>
        <span style={S.mono}>tokens.css · DESIGN-LANGUAGE §4</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">locked 7 Sep 2026</Tag>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, padding: 18 }}>
        <Group label="Surfaces — the order is the design">
          <Swatches rows={SURFACES} vals={vals} />
        </Group>
        <Group label="An overlay is not a card">
          <Swatches rows={OVERLAY} vals={vals} />
          <div style={{ height: 18 }} />
          <span style={S.specimenLabel}>Chrome is contextual</span>
          <ContextualPair vals={vals} overlayRef={overlayRef} />
        </Group>
        <Group label="Borders — seven graded weights">
          <Swatches rows={LINES} vals={vals} />
        </Group>
        <Group label="Text — nine tiers">
          <Swatches rows={TEXT} vals={vals} />
        </Group>
        <Group label="Action and brand">
          <Swatches rows={MEANING} vals={vals} />
          <div style={{ height: 18 }} />
          <span style={S.specimenLabel}>Money — outcomes only</span>
          <Swatches rows={MONEY} vals={vals} />
        </Group>
        <Group label="System message colour — §17">
          <Swatches rows={SYSTEM} vals={vals} />
          <span style={{
            display: 'block', marginTop: 10, fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5,
          }}
          >
            A glyph and a 1px edge only — never body text, never a wash, and never inside a
            data surface, where red and green mean money.
          </span>
        </Group>
      </div>
      <div style={S.note}>
        Values come from the owner&rsquo;s
        {' '}
        <span style={S.mono}>PropVexis Dashboard Zinc</span>
        {' '}
        mockup. The three overlay tokens do not — that file contains no menu, popover or
        dropdown, so they come from preset b2qLMFPP6.
        {' '}
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
          A ramp must climb, and an overlay is never on it.
        </strong>
        {' '}
        Asking one token to serve a card and a floating panel broke the panel, its row
        highlight and its edge at once — the most expensive mistake in this palette&rsquo;s
        history, and what the original &ldquo;the dropdown doesn&rsquo;t stand out&rdquo;
        complaint actually was. The contextual pair above is the permanent fix: one name,
        and the surface underneath supplies the value.
      </div>
    </div>
  );
}

/* ------------------------------------------------- ours against the preset --- */

/* WHAT THIS CARD MAY CLAIM. Every preset value below was read off preset b2qLMFPP6
 * itself — its dark block, converted from oklch — and the same six are hardcoded in the
 * dropdown reference above, from the same source. Roles whose preset value nobody has
 * verified are ABSENT rather than guessed: a comparison table that quietly infers half
 * its left-hand column is worse than a shorter one, because it reads identical.
 *
 * `ours` is read live, so the right-hand column cannot drift out of agreement with
 * tokens.css the way a typed one would. */
const VS_COLOUR = [
  ['A floating panel', '--popover', '#18181b', '--surface-2', true],
  ['A row highlighted in it', '--accent', '#27272a', '--overlay-hover', true],
  ['Primary text', '--foreground', '#fafafa', '--text', true],
  ['Secondary text', '--muted-foreground', '#a1a1aa', '--muted', true],
  ['A dangerous action', '--destructive', '#ff6467', '--destructive', true],
  ["A control's edge and fill", '--input', 'rgba(255,255,255,.15)', '--input-line', true],
  ['Brand fill, dark theme', '--primary', '#193cb8', '--accent', true],
  ["A floating panel's edge", '--border', '#2f2f31 *', '--overlay-line', true],
  ["A card's edge", '--border', '#26262a *', '--line', false],
  ['CARD', '--card', '#18181b', '--surface', false],
];

/* REWRITTEN 2026-09-07 TO MIRROR §6, WHICH THIS HAD FALLEN A WHOLE AMENDMENT BEHIND.
 * Two rows were describing the system as it was before the owner amended §6 the same
 * day, and both were wrong in a way that matters on a page about OVERLAYS:
 *
 *   "BUTTONS, inputs, nav rows — radius lg — 10px"   Buttons are `rounded-2xl` = 16px
 *                                                    now; the wrapper's 10px override is
 *                                                    deleted. `--r-lg` is nav rows only.
 *   "CARDS and floating overlays — 14px"             The card is 14px. The three overlays
 *                                                    in front of you are 16 / 24 / 24.
 *
 * The second one is the trap: it reads as a rule being kept while the menu, the popover
 * and the modal on this very page each disagree with it. They are not wrong — §6 gives a
 * menu `rounded-2xl` and a popover and a dialog `rounded-3xl` — the TABLE was. */
const VS_SHAPE = [
  ['Small chrome, menu rows', 'radius sm / md', '8 / 10px', '--r-md', true],
  ['Buttons, nav rows, list rows, day cells', 'radius lg', '14px', '--r-lg', true],
  ['Card and section shells', 'radius 2xl', '24px', '--r-2xl', true],
  ['CONTROLS — button, input, badge, menu panel', 'radius 2xl', '16px', '--radius-2xl', true],
  ['Popovers, and dialogs at min(4xl, 24px)', 'radius 3xl', '24px', '--radius-3xl', true],
  ['Body, a menu item', 'text-sm', '14px', '--fs-body', true],
  ['A label, a shortcut', 'text-xs', '12px', '--fs-label', true],
];

function VsRow({ role, presetName, presetValue, token, same, vals, colour }) {
  const ours = vals[token] || '';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 150px 150px 96px',
      alignItems: 'center',
      gap: 12,
      padding: '9px 0',
      borderTop: '1px solid var(--line-inset)',
    }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{role}</span>
        <span style={{ ...S.mono, fontSize: 10.5 }}>{token}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {colour ? (
          <span style={{
            width: 20,
            height: 20,
            flex: 'none',
            borderRadius: 6,
            background: presetValue.replace(' *', ''),
            border: '1px solid var(--line-chip)',
          }}
          />
        ) : null}
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ ...S.mono, fontSize: 10.5, color: 'var(--text-2)' }}>{presetValue}</span>
          <span style={{ ...S.mono, fontSize: 10 }}>{presetName}</span>
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {colour ? <Swatch token={token} /> : null}
        <span style={{ ...S.mono, fontSize: 10.5, color: 'var(--text-2)' }}>{ours}</span>
      </span>
      <Tag tone={same ? 'ok' : 'open'}>{same ? 'same' : 'ours, on purpose'}</Tag>
    </div>
  );
}

function PresetComparison() {
  const [vals] = useResolvedTokens();
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Ours against preset b2qLMFPP6</span>
        <span style={S.mono}>the left column is the preset, the right is live</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">2 deliberate differences</Tag>
      </div>
      <div style={{ padding: '4px 18px 18px' }}>
        <span style={S.specimenLabel}>Colour</span>
        {VS_COLOUR.map((r) => (
          <VsRow
            key={r[0] + r[3]}
            role={r[0]}
            presetName={r[1]}
            presetValue={r[2]}
            token={r[3]}
            same={r[4]}
            vals={vals}
            colour
          />
        ))}
        <div style={{ height: 22 }} />
        <span style={S.specimenLabel}>Shape and type</span>
        {VS_SHAPE.map((r) => (
          <VsRow
            key={r[0] + r[3]}
            role={r[0]}
            presetName={r[1]}
            presetValue={r[2]}
            token={r[3]}
            same={r[4]}
            vals={vals}
            colour={false}
          />
        ))}
      </div>
      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
          Fourteen of sixteen roles are now the preset&rsquo;s own value.
        </strong>
        {' '}
        The two that are not are both the mockup&rsquo;s doing, and both are decisions
        rather than drift. A card
        {' '}
        (<span style={S.mono}>--surface</span>)
        {' '}
        is #111114 where the preset draws #18181b, because the mockup separates a card
        from a floating panel and the preset does not — that separation is the whole
        reason the dropdown reads now. And a
        {' '}
        <span style={S.mono}>card&rsquo;s edge</span>
        {' '}
        is one of seven graded opaque weights where the preset has a single white alpha:
        one alpha gets stronger as the surface under it lightens, which is the opposite
        of what the mockup asks for.
        {' '}
        <span style={{ color: 'var(--text-4)' }}>
          * The preset draws every border as white at 10%, so it has no fixed hex — the
          two starred values are what that composites to over a panel and over a card.
        </span>
        {' '}
        Worth noting: the
        {' '}
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
          card radius exception turned out not to be needed
        </strong>
        {' '}
        — 14px was already the preset&rsquo;s xl step, so nothing had to be reserved.
      </div>
    </div>
  );
}

/* ------------------------------------------ the dropdown, against the preset --- */

/* A FAITHFUL REPRODUCTION OF PRESET b2qLMFPP6's DROPDOWN, hardcoded.
 *
 * Every value below is the preset's own, converted from the oklch in its dark block, so
 * this pane is a REFERENCE and not a second opinion. It is deliberately NOT built from
 * our tokens — the whole point is to have something our live menu can be wrong against.
 *
 *   panel      --popover              oklch(0.21  0.006 285.885)  #18181b
 *   edge       --border               oklch(1 0 0 / 10%)          AN ALPHA — see below
 *   divider    --border/50            oklch(1 0 0 / 5%)           half of it, as the registry draws it
 *   text       --popover-foreground   oklch(0.985 0 0)            #fafafa
 *   muted      --muted-foreground     oklch(0.705 0.015 286.067)  #a1a1aa
 *   highlight  --accent               oklch(0.274 0.006 286.033)  #27272a
 *   red        --destructive          oklch(0.704 0.191 22.216)   #ff6467
 *   radius     --radius 10px -> sm 6 / md 8 / lg 10 / xl 14
 *   item type  text-sm = 14px, label/shortcut text-xs = 12px
 *
 * If this and the live pane ever diverge again, the cause is almost certainly our bridge
 * repointing one of shadcn's own names (text-sm, text-xs, --radius-xl,
 * --color-muted-foreground) for the app at large. That happened once and menu.jsx now
 * absorbs it.
 */
/* THE EDGE IS AN ALPHA AND THE DIVIDER IS HALF OF IT (corrected 2026-09-07, by the owner
 * looking at the real preset zoomed in). Both values here were the single literal
 * `#2f2f31` — white/10 pre-composited over the #18181b panel and then frozen. Two things
 * were wrong with that, and together they are the whole "borders and dividers" mismatch:
 *
 *   THE EDGE IS DRAWN ON THE GROUND, NOT ON THE PANEL. The preset's dropdown carries
 *   `ring-1 ring-foreground/10`, and a ring is an OUTSET box-shadow — it lands just
 *   outside the panel, so it composites against whatever is BEHIND. That is exactly what
 *   the owner saw: the same edge reads brighter where it crosses a card and dimmer over
 *   the page. A pre-composited grey cannot do that; it is the same colour everywhere.
 *   So this pane drew a #2f2f31 edge over the dark page (~#212124 in the real thing) and
 *   our live menu, which is CORRECT, looked too faint beside it.
 *
 *   THE DIVIDER IS `bg-border/50`, NOT `border`. This pane reused the edge literal for
 *   both, so its dividers were drawn at double strength.
 *
 * Our menu was right on both counts and the REFERENCE was wrong — which is the one
 * failure a reference pane cannot have, because every comparison against it points at
 * the wrong file. Matching our menu to it would have moved us away from the preset. */
const P = {
  panel: '#18181b',
  edge: 'rgba(250,250,250,.10)',
  divider: 'rgba(250,250,250,.05)',
  text: '#fafafa',
  muted: '#a1a1aa',
  hi: '#27272a',
  red: '#ff6467',
};

function PresetRow({ icon, children, shortcut, trailing, highlighted, danger }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minHeight: 28,
      padding: '6px 8px',
      borderRadius: 14,
      background: highlighted ? P.hi : 'transparent',
      color: danger ? P.red : P.text,
      fontSize: 14,
    }}
    >
      <span style={{ display: 'flex', flex: 'none', color: 'currentColor' }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{children}</span>
      {shortcut ? (
        <span style={{ fontSize: 12, letterSpacing: '.1em', color: P.muted }}>{shortcut}</span>
      ) : null}
      {trailing}
    </div>
  );
}

const ico = (d, extra) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
);

/* The submenu, drawn open beside the row that owns it — as the reference screenshot
 * shows it. Same panel values as the parent: a submenu is not a quieter surface. */
function PresetSubmenu() {
  return (
    <div style={{
      position: 'absolute',
      left: 260,
      top: 232,
      width: 150,
      padding: 4,
      borderRadius: 14,
      background: P.panel,
      boxShadow: `0 0 0 1px ${P.edge}, 0 10px 30px rgba(0,0,0,.5)`,
    }}
    >
      <PresetRow icon={ico('M22 7 13.03 12.7a2 2 0 0 1-2.06 0L2 7', <rect x="2" y="4" width="20" height="16" rx="2" />)}>Email</PresetRow>
      <PresetRow icon={ico('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z')}>Message</PresetRow>
      <div style={{ height: 1, background: P.divider, margin: '4px -4px' }} />
      <PresetRow icon={ico('M12 8v8M8 12h8', <circle cx="12" cy="12" r="10" />)}>More…</PresetRow>
    </div>
  );
}

function PresetMenuReference() {
  return (
    <div style={{
      position: 'relative',
      width: 268,
      padding: 4,
      borderRadius: 14,
      background: P.panel,
      boxShadow: `0 0 0 1px ${P.edge}, 0 10px 30px rgba(0,0,0,.5)`,
      fontFamily: 'inherit',
    }}
    >
      <div style={{ padding: '4px 8px', fontSize: 12, color: P.muted }}>My Account</div>
      <PresetRow icon={ico('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', <circle cx="12" cy="7" r="4" />)} shortcut="⇧⌘P">Profile</PresetRow>
      <PresetRow icon={ico('M3 10h18M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z')} shortcut="⌘B">Billing</PresetRow>
      <PresetRow icon={ico('M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z', <circle cx="12" cy="12" r="3" />)} shortcut="⌘S">Settings</PresetRow>

      <div style={{ height: 1, background: P.divider, margin: '4px -4px' }} />

      <div style={{ padding: '4px 8px', fontSize: 12, color: P.muted }}>View</div>
      <PresetRow
        icon={ico('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 3v18')}
        trailing={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={P.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
      >
        Sidebar
      </PresetRow>
      <PresetRow icon={ico('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 15h18')}>Status Bar</PresetRow>

      <div style={{ height: 1, background: P.divider, margin: '4px -4px' }} />

      <PresetRow
        highlighted
        icon={ico('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 11h-6', <circle cx="9" cy="7" r="4" />)}
        trailing={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={P.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>}
      >
        Invite Users
      </PresetRow>
      <PresetRow icon={ico('M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', <circle cx="12" cy="12" r="10" />)}>Support</PresetRow>
      <PresetRow danger icon={ico('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9')} shortcut="⇧⌘Q">Sign Out</PresetRow>
      <PresetSubmenu />
    </div>
  );
}

/* Our real Menu, forced open and portaled into the pane so it can be compared without
 * hovering. `defaultOpen` is Base UI's; the container seam is what keeps the popup
 * inside the pane instead of escaping to document.body. */
function LiveMenuOpen() {
  const ref = useRef(null);
  return (
    <div ref={ref} style={{ position: 'relative', minHeight: 380 }}>
      <OverlayContainerContext.Provider value={ref}>
        <Menu defaultOpen>
          <MenuTrigger render={<Button variant="secondary" />}>
            Complex Menu
            <ChevronDown aria-hidden="true" />
          </MenuTrigger>
          {/* NO `sideOffset` HERE ON PURPOSE (2026-09-07). This read `sideOffset={6}`,
              a number that matched neither the old default (8) nor the preset (4), and it
              is why the offset change could not be seen on the page built to review it:
              the specimen was overriding the very default it exists to show. This pane is
              labelled THE REAL COMPONENT — a prop passed here is our scaffolding being
              approved as the primitive's behaviour. Every other specimen on this page
              already passes none. */}
          <MenuContent align="start">
            <MenuGroup>
              <MenuGroupLabel>My Account</MenuGroupLabel>
              <MenuItem>Profile</MenuItem>
              <MenuItem>Billing</MenuItem>
              <MenuItem>Settings</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>View</MenuGroupLabel>
              <MenuCheckboxItem checked>Sidebar</MenuCheckboxItem>
              <MenuCheckboxItem checked={false}>Status Bar</MenuCheckboxItem>
            </MenuGroup>
            <MenuSeparator />
            {/* NESTED DATA. Sub/SubTrigger/SubContent were exported by the generated
                file all along and simply never wrapped, so a nested menu was
                unreachable from application code. Wired 2026-09-07. */}
            <MenuSub>
              <MenuSubTrigger>Invite Users</MenuSubTrigger>
              <MenuSubContent>
                <MenuItem>Email</MenuItem>
                <MenuItem>Message</MenuItem>
                <MenuSeparator />
                <MenuItem>More…</MenuItem>
              </MenuSubContent>
            </MenuSub>
            <MenuItem>Support</MenuItem>
            <MenuItem variant="destructive">
              <Trash2 aria-hidden="true" />
              Sign Out
            </MenuItem>
          </MenuContent>
        </Menu>
      </OverlayContainerContext.Provider>
    </div>
  );
}

/* THIS TABLE HAD GONE OUT OF DATE IN THE SAME HOUR THE MENU WAS APPROVED, and the way it
 * went out of date is the finding: it listed the four things our BRIDGE re-meant, and
 * three of the four stopped being true when the type scale moved onto the preset later
 * the same day. `text-sm` is 14px, `text-xs` is 12px and `--radius-xl` is 14px — the
 * preset's own values. Only the muted colour is still ours.
 *
 * So three of `menu.jsx`'s overrides now restate what the tokens already say. They are
 * CORRECT today and FROZEN — pinned to literals rather than bound to the scale, so the
 * next scale move leaves the menu behind. That is an owner call on an approved
 * primitive, not a silent cleanup, so it is written here rather than done. */
const MENU_PARITY = [
  ['panel', '#18181b', '--surface-2'],
  ['highlighted row', '#27272a', '--overlay-hover'],
  ['panel edge', 'white/10, on the GROUND', 'MATCHED — the generated ring-foreground/10; a ring is outset, so it composites'],
  ['item text', '14px', 'MATCHED — text-sm is 14px now; ITEM still pins text-[14px]'],
  ['label + shortcut', '12px', 'MATCHED — text-xs is 12px now; LABEL still pins text-[12px]'],
  ['muted text', '#a1a1aa', 'STILL OURS — muted-foreground is #c9c9d1, so LABEL sets --muted'],
  ['item radius', '14px', 'MATCHED — rounded-xl is 14px now; ITEM still pins rounded-[14px]'],
  ['separator', 'white/5 — half the edge', 'MATCHED — the generated bg-border/50; this pane drew it at DOUBLE until 2026-09-07'],
  ['destructive', '#ff6467', '--destructive (shipped earlier)'],
  ['submenu edge', 'white/10, on the GROUND', 'MATCHED — the override is deleted; both panels wear the generated ring'],
  ['distance from trigger', '4px', 'MATCHED — the default was 8, and THIS SPECIMEN overrode it to 6 until the prop was deleted'],
];

function DropdownParity() {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Dropdown — preset reference vs ours</span>
        <span style={S.mono}>b2qLMFPP6</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">matched · approved</Tag>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Preset — hardcoded reference</span>
          <div style={{ ...S.stage, alignItems: 'flex-start', minHeight: 380, paddingTop: 62 }}>
            <PresetMenuReference />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Ours — the real component, on live tokens</span>
          <div style={{ ...S.stage, alignItems: 'flex-start', minHeight: 380 }}>
            <LiveMenuOpen />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 18px 18px' }}>
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '160px 130px 1fr',
            background: 'var(--control-bg)',
          }}
          >
            {['Part', 'Preset', 'Where ours gets it'].map((h) => (
              <div key={h} style={{ padding: '9px 12px', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>{h}</div>
            ))}
          </div>
          {MENU_PARITY.map(([part, preset, source]) => (
            <div
              key={part}
              style={{
                display: 'grid', gridTemplateColumns: '160px 130px 1fr',
                borderTop: '1px solid var(--line-inset, #1a1a1d)', alignItems: 'baseline',
              }}
            >
              <div style={{ padding: '9px 12px', fontSize: 12.5, color: 'var(--text)' }}>{part}</div>
              <div style={{ padding: '9px 12px', ...S.mono, color: 'var(--text-2)' }}>{preset}</div>
              <div style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-3)' }}>{source}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Five of these were invisible until measured &mdash; and three have since fixed themselves. </strong>
        The generated item asks for
        {' '}
        <span style={S.mono}>text-sm rounded-xl text-muted-foreground</span>
        {' '}
        — shadcn&rsquo;s own names, which in the preset mean 14px, 14px and #a1a1aa. When
        this menu was approved our bridge re-meant all three, so the same component
        rendered smaller and brighter here, and
        {' '}
        <span style={S.mono}>menu.jsx</span>
        {' '}
        absorbed the difference rather than the bridge. Later the same day the type scale
        moved ONTO the preset, so
        {' '}
        <span style={S.mono}>text-sm</span>
        {' '}
        is 14px,
        {' '}
        <span style={S.mono}>text-xs</span>
        {' '}
        is 12px and
        {' '}
        <span style={S.mono}>--radius-xl</span>
        {' '}
        is 14px on their own. Only the muted colour still needs us. The three redundant
        pins are correct today but frozen as literals — un-pinning them is a change to an
        approved component, so it is your call, not a tidy-up.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ specimens --- */

function MenuSpecimens() {
  const [dense, setDense] = useState(true);

  const simple = (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" />}>
        Actions
        <ChevronDown aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem>Edit trade</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuItem>Add a note</MenuItem>
      </MenuContent>
    </Menu>
  );

  /* Groups, a checkbox row and a destructive item — the three things the top bar and
   * the filter bar actually need, and the three the current styling is weakest on. */
  const full = (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" />}>
        Trade options
        <ChevronDown aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start">
        {/* A bare MenuGroupLabel outside a MenuGroup took a page down once — it is
            always a child of MenuGroup, never a sibling. */}
        <MenuGroup>
          <MenuGroupLabel>This trade</MenuGroupLabel>
          <MenuItem>Open in chart replay</MenuItem>
          <MenuItem>Tag a setup</MenuItem>
          <MenuItem>Copy R multiple</MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>View</MenuGroupLabel>
          <MenuCheckboxItem checked={dense} onCheckedChange={setDense}>
            Dense rows
          </MenuCheckboxItem>
          <MenuCheckboxItem checked={false}>Show commissions</MenuCheckboxItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem>
          <Trash2 aria-hidden="true" />
          Delete trade
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  const longLabels = (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" size="icon" />}>
        <MoreHorizontal aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem>Export the filtered selection as CSV</MenuItem>
        <MenuItem>Recalculate R using the account&rsquo;s current risk</MenuItem>
        <MenuItem>Short one</MenuItem>
      </MenuContent>
    </Menu>
  );

  const toolbar = (
    <Menu>
      <MenuTrigger render={<Button variant="chrome" size="sm" pill />}>
        <ButtonLabel>Actions</ButtonLabel>
        <ChevronDown aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem>Export as CSV</MenuItem>
        <MenuItem>Recalculate R</MenuItem>
        <MenuItem>Clear selection</MenuItem>
      </MenuContent>
    </Menu>
  );

  return {
    simple, full, longLabels, toolbar,
  };
}

function ModalSpecimen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Open modal</Button>
      {/* THE SKIN'S `gap-6`, SUPPLIED BELOW, because the shell deliberately does not carry
          it: `modal.jsx` adopts `bg-popover p-6 text-sm shadow-xl ring-1 max-w-md` and
          stops there, so each of the 13 dialogs spaces its own content. That is a real
          difference from the registry pane on the left, where `DialogContent` is
          `grid gap-6`, and it belongs in the specimen rather than hidden by it.
          (It sits out here, not inside the ternary: a lone `{...}` in a consequent's
          parentheses parses as an object literal, not a comment, and the build says so.) */}
      {open ? (
        <Modal open onClose={() => setOpen(false)} label="Close account" style={{ display: 'grid', gap: 24 }}>
          {/* THE REAL PARTS, NOT HAND-TYPED NUMBERS (2026-09-07). This read
              `fontSize: 16, fontWeight: 550` and `fontSize: 13, lineHeight: 20` as inline
              styles — 13px is not even on the scale (12/14/16/18/24/28), and the whole
              charter of this page is that "the appearance being approved is the one that
              ships". Hand-typing it meant the parity card attributed OUR OWN scaffolding
              to "our layer". `DialogTitle` is `text-base font-medium` (16/500) and
              `DialogDescription` is `text-sm text-muted-foreground` — the primitives.

              WORTH KNOWING BEFORE YOU APPROVE THIS: no shipping dialog uses these two
              parts yet. All 13 draw their own header through legacy `.modal h2`, which is
              17px — off the scale, and the reason this specimen never matched anything.
              Approving the specimen is approving the direction the legacy rule moves to. */}
          <DialogHeader>
            <DialogTitle>Close FTMO-8842291?</DialogTitle>
            <DialogDescription>
              Its 412 trades stay in your history and keep counting toward your all-account
              analytics. You will stop seeing it in the switcher.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            {/* `primary` explicitly: this Button's default variant is `secondary`, so a
                bare <Button> is an OUTLINE one and the confirm read as plain text. */}
            <Button variant="primary" onClick={() => setOpen(false)}>Close account</Button>
          </DialogFooter>
        </Modal>
      ) : null}
    </>
  );
}

function PopoverSpecimen() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="secondary" />}>
        <Filter aria-hidden="true" />
        Brief settings
      </PopoverTrigger>
      <PopoverContent align="start">
        {/* ON THE SCALE (2026-09-07). These read 13px and 12.5px, neither of which is a
            step — the scale is 12/14/16/18/24 plus the 28px metric. A specimen typed a
            half-pixel off the system is the owner approving something the system cannot
            reproduce. Bound to the tokens now, so the next scale move carries it. */}
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 550, color: 'var(--text)' }}>
            What to show
          </div>
          <div style={{ fontSize: 'var(--fs-label)', lineHeight: '18px', color: 'var(--text-2)' }}>
            A popover holds controls you change and then dismiss. A menu holds actions
            you pick one of.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* =================================================================== BATCH 2 ===
 * FORM CONTROLS — input · textarea · select · checkbox · label · field · consent-field.
 *
 * SEVEN, NOT EIGHT. The plan lists `switch` in this family and it is already approved —
 * it came through the variant matrix on 2026-09-07, because an on/off control is one of
 * the things you cannot judge from a still. It is rendered in the geometry row below
 * anyway: it has to keep AGREEING with the six being reviewed, and a locked part is
 * exactly the part a batch can drift away from without anyone noticing.
 *
 * WHAT THIS BATCH IS ACTUALLY DECIDING, and it is not "does a text box look nice". These
 * seven appear on one form, in one row, at the same moment — PRIMITIVE-REVIEW-PLAN §5 is
 * the whole reason they are locked together. So the panes below are built to answer
 * agreement questions rather than beauty questions: same height, same corner, same text
 * size, same edge when focused, same behaviour when wrong.
 *
 * WHAT THE AUDIT FOUND BEFORE YOU LOOKED (2026-09-07), because Batch 1's lesson was that
 * three of its four findings were in the review apparatus rather than the components:
 *
 *   · FOUR OF THE SEVEN ARE PASS-THROUGHS. `input`, `textarea`, `checkbox` and `label`
 *     re-export the generated component with no change at all, and all four are
 *     byte-identical to what the registry serves for base-rhea today (fetched and
 *     diffed, per the method in the preset-parity note). So for those four, "ours" and
 *     "the preset" are the same object, and there is no parity pane to draw.
 *   · `field` is the @coss one, also byte-identical, with ONE difference: our
 *     `FieldError` forces `match` and re-colours to `text-destructive`. Both are
 *     recorded in field.jsx and neither is a look decision you need to make.
 *   · `select` HAD A REAL BUG, now fixed: its option rows had been copied from the
 *     generated component minus the `sm:` steps, back when those compiled to nothing.
 *     The breakpoints came back on 2026-09-07 and the rows did not, so the value read
 *     14px in the closed trigger and 16px in the open list — it changed size as you
 *     opened it — and the rows stood 32px against the dropdown's 28px.
 *
 * ONE THING IS DELIBERATELY LEFT WRONG-LOOKING FOR YOU TO RULE ON: the select's option
 * corner. See "Open questions" at the end of the batch.
 */

/* THE LABEL MAPS. Base UI's Select renders a VALUE, not a label, unless the root is told
 * how the two relate — `items` is that mapping, and AccountStep.jsx passes it on every
 * one of its three pickers. Without it a trigger reads "2step" while the option under it
 * reads "2 Step", which would make the one comparison this batch turns on (is the closed
 * trigger the same size as the open list?) harder to make, not easier. */
const TYPES = { '1step': '1 Step', '2step': '2 Step', '3step': '3 Step', instant: 'Instant Funding' };
const SIZES = { 25000: '$25,000', 50000: '$50,000', 100000: '$100,000', 200000: '$200,000' };

/* Reads what the browser actually computed, rather than what the class says. The whole
 * batch turns on four numbers agreeing, and "they look the same height" is the kind of
 * judgement this page exists to replace. Measures the wrapper's first element child, so
 * each probe wraps exactly one control. */
function useProbe() {
  const ref = useRef(null);
  const [m, setM] = useState(null);
  useEffect(() => {
    const el = ref.current?.firstElementChild;
    if (!el) return;
    const cs = getComputedStyle(el);
    setM({
      h: Math.round(el.getBoundingClientRect().height),
      r: Math.round(parseFloat(cs.borderTopLeftRadius)),
      fs: Math.round(parseFloat(cs.fontSize)),
    });
  }, []);
  return [ref, m];
}

function Probe({ label, expect, children }) {
  const [ref, m] = useProbe();
  const agrees = m && (!expect || (m.h === expect.h && m.r === expect.r && m.fs === expect.fs));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
      <span style={S.specimenLabel}>{label}</span>
      <div ref={ref} style={{ display: 'flex', alignItems: 'center', minHeight: 40 }}>
        {children}
      </div>
      <span style={{
        ...S.mono,
        fontSize: 11,
        color: agrees === false ? 'var(--loss)' : 'var(--text-3)',
      }}
      >
        {m ? `${m.h}px tall · ${m.r}px corner · ${m.fs}px text` : '—'}
      </span>
    </div>
  );
}

/* THE POINT OF THE BATCH, IN ONE ROW. Every control that can sit on the same line of the
 * same form, measured. The button is here as the fixed reference — it is locked, it is
 * what a form's Save is, and a field that does not match it is the mismatch you would
 * see first. The switch is here because it is already approved and still has to agree.
 *
 * `expect` is the shape a 32px control is supposed to be — h-8, `rounded-2xl` at the
 * preset's 16px, and 14px text once `md:`/`sm:` resolve. Anything that misses it turns
 * its readout red rather than relying on you to spot four pixels. */
const CONTROL_SHAPE = { h: 32, r: 16, fs: 14 };

function FormGeometry() {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Do they agree?</span>
        <span style={S.mono}>height · corner · text size, measured in the browser</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">the reason this is one batch</Tag>
      </div>
      <div style={S.specimens}>
        <Probe label="Button (locked)" expect={CONTROL_SHAPE}>
          <Button variant="secondary">Save</Button>
        </Probe>
        <Probe label="Input" expect={CONTROL_SHAPE}>
          <Input defaultValue="FTMO-8842291" style={{ width: 190 }} />
        </Probe>
        <Probe label="Select trigger" expect={CONTROL_SHAPE}>
          <Select defaultValue="2step" items={TYPES}>
            <SelectTrigger style={{ width: 190 }}><SelectValue /></SelectTrigger>
            <SelectPopup>
              <SelectItem value="1step">1 Step</SelectItem>
              <SelectItem value="2step">2 Step</SelectItem>
            </SelectPopup>
          </Select>
        </Probe>
        <Probe label="Switch (approved)">
          <Switch defaultChecked />
        </Probe>
        <Probe label="Checkbox">
          <Checkbox defaultChecked />
        </Probe>
        <Probe label="Textarea">
          <Textarea defaultValue="Held it through the retest." style={{ width: 220 }} />
        </Probe>
      </div>
      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Look at: </strong>
        whether the first three are the same height and the same roundness — they are the
        three that sit side by side on the Add Account form. The switch and the tick box
        are deliberately smaller; the question there is whether they look like they belong
        to the same family, not whether they match. A red readout means a control missed
        the shape the other three hold.
      </div>
    </div>
  );
}

/* STATES, NOT STILLS — the Batch 1 lesson, applied before you ask for it. Three of the
 * four findings in the overlays batch were things a forced-open specimen could not show,
 * and a form control has more states than an overlay does: empty, typed in, focused,
 * switched off, and rejected. The last two are the ones that ship broken, because nobody
 * screenshots a disabled field.
 *
 * `aria-invalid` is passed by hand here, and an earlier version of this note claimed
 * "nothing in the app sets it yet — the account page renders a FieldError and leaves the
 * input alone". That was WRONG, and it went in front of the owner as an open question
 * before anyone checked. AccountStep passes `aria-invalid` on the one validated field
 * this app has, so the red edge and ring below are exactly what already ships. The
 * question the pane really answers is whether the SECOND validated field will do the
 * same; form-family.test.js now makes sure it does. */
function FormStates() {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Every state</span>
        <span style={S.mono}>click into them — focus is not a screenshot</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">approved 7 Sep 2026</Tag>
      </div>
      <div style={S.specimens}>
        {[
          { label: 'Empty', node: <Input placeholder="Account name" /> },
          { label: 'Typed in', node: <Input defaultValue="FTMO-8842291" /> },
          { label: 'Switched off', node: <Input defaultValue="FTMO-8842291" disabled /> },
          { label: 'Rejected', node: <Input defaultValue="FTMO-8842291" aria-invalid="true" /> },
        ].map((s) => (
          <div key={s.label} style={S.specimen}>
            <span style={S.specimenLabel}>{s.label}</span>
            <div style={{ ...S.stage, width: 210 }}>
              {React.cloneElement(s.node, { style: { width: '100%' } })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...S.specimens, borderTop: '1px solid var(--line-inset)' }}>
        {[
          { label: 'Tick box — off', node: <Checkbox /> },
          { label: 'Tick box — on', node: <Checkbox defaultChecked /> },
          { label: 'Tick box — off, disabled', node: <Checkbox disabled /> },
          { label: 'Tick box — on, disabled', node: <Checkbox defaultChecked disabled /> },
          { label: 'Long text — empty', node: <Textarea placeholder="What did you see?" style={{ width: 200 }} /> },
          { label: 'Long text — grows', node: <Textarea defaultValue={'Entered on the retest of the 15m level.\nSized down because the spread was wide.\nHeld it to target.'} style={{ width: 200 }} /> },
        ].map((s) => (
          <div key={s.label} style={S.specimen}>
            <span style={S.specimenLabel}>{s.label}</span>
            <div style={S.stage}>{s.node}</div>
          </div>
        ))}
      </div>
      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Look at: </strong>
        whether an empty box is clearly different from a switched-off one — both are pale,
        and if they read the same, a user will type into something that cannot take it.
        Then click into each field and watch the ring that appears: it should be the same
        ring on the text box, the dropdown and the tick box. The long box grows as you
        type rather than scrolling; tell me if you would rather it scrolled.
      </div>
    </div>
  );
}

/* THE ONE PARITY PANE THIS BATCH NEEDS. `ui/select.jsx` is the registry component with
 * none of our layer — its own trigger (a bordered, shadowed, `rounded-lg` field) and its
 * own popup (`rounded-lg`, `shadow-lg/5`, two `before:` hairlines). Ours corrects both,
 * for the reasons written in select.jsx: the trigger has to look like the Input beside
 * it, and §6/§7 give a floating panel the app's own radius and elevation.
 *
 * The registry one is UNUSABLE in the app, by the way, and not for looks — its option
 * rows carry `grid`, which legacy/app.css claims unlayered for the Trade Log, so every
 * row renders as a 1012px table. Expect the right-hand list to blow out to the width of
 * the page. That is the bug being demonstrated, not a broken specimen. */
function SelectParity() {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Dropdown picker — registry vs ours</span>
        <span style={S.mono}>ui/select.jsx · primitives/select.jsx</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">approved 7 Sep 2026</Tag>
      </div>
      <div style={{ ...S.specimens, alignItems: 'flex-start' }}>
        <div style={{ ...S.specimen, flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Registry — no corrections</span>
          <div style={{ ...S.stage, alignItems: 'flex-start', overflow: 'hidden' }}>
            <Select defaultValue="2step" items={TYPES}>
              <RawSelectTrigger style={{ width: 220 }}><RawSelectValue /></RawSelectTrigger>
              <RawSelectPopup>
                <RawSelectItem value="1step">1 Step</RawSelectItem>
                <RawSelectItem value="2step">2 Step</RawSelectItem>
                <RawSelectItem value="instant">Instant Funding</RawSelectItem>
              </RawSelectPopup>
            </Select>
          </div>
        </div>
        <div style={{ ...S.specimen, flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Ours</span>
          <div style={{ ...S.stage, alignItems: 'flex-start' }}>
            <Select defaultValue="2step" items={TYPES}>
              <SelectTrigger style={{ width: 220 }}><SelectValue /></SelectTrigger>
              <SelectPopup>
                <SelectItem value="1step">1 Step</SelectItem>
                <SelectItem value="2step">2 Step</SelectItem>
                <SelectItem value="instant">Instant Funding</SelectItem>
              </SelectPopup>
            </Select>
          </div>
        </div>
      </div>
      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Look at: </strong>
        open both — and expect them to look almost identical, which is the point. The
        left one is the shipped shadcn component with nothing of ours applied. The right
        one is the same component plus two classes: the field fills its column instead of
        hugging its text, and its padding matches the text box beside it. Everything else
        you asked for on 7 Sep — the field shape, the single chevron, the tick on the
        right, the 14px highlight, opening on the field — is what shadcn now ships.
      </div>
      <div style={{ ...S.note, borderTop: '1px solid var(--line-inset)' }}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>What this pane used to say: </strong>
        that the left one draws a bordered, shadowed field and a panel with squarer
        corners than everything else, and that its list flies out to the width of the page
        because of a collision with the old Trade Log CSS. All of that was true of the
        version we had been holding since install, and none of it is true of the one
        shadcn ships today. Re-installing it deleted about 150 lines of ours.
      </div>
    </div>
  );
}

/* THE LABEL PAIR. Two things called a label exist, and until this batch nobody had put
 * them next to each other: `Label` (the shadcn one — a plain <label>, `text-sm
 * font-medium`) and `FieldLabel` (the @coss one, inside a Field, which is what every
 * form in the app actually uses). They read 14px/500 each today, which they did NOT four
 * days ago — the coss one is `text-base/4.5 sm:text-sm/4`, so it stood at 16px for as
 * long as `sm:` was dead. The pair is drawn together so the next time one moves, it is
 * visible rather than derived. */
function LabelPair() {
  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={S.specimenLabel}>Label — used with a bare control</span>
        <Label htmlFor="pr-label-a">Account Name</Label>
        <Input id="pr-label-a" defaultValue="FTMO-8842291" style={{ width: 220 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={S.specimenLabel}>FieldLabel — what forms actually use</span>
        <Field>
          <FieldLabel htmlFor="pr-label-b">Account Name</FieldLabel>
          <Input id="pr-label-b" defaultValue="FTMO-8842291" style={{ width: 220 }} />
          <FieldDescription>The name you will see in the switcher.</FieldDescription>
        </Field>
      </div>
    </div>
  );
}

/* THE REAL FORM, not an arrangement invented for this page. Field for field this is
 * AccountStep.jsx — two even columns, a label over every control, the same questions in
 * the same order — because a control approved in isolation is a control approved in a
 * vacuum, and this specific layout is where all six of these parts meet.
 *
 * The error line is forced on, which is the only lie in the pane: on the real page it
 * appears when the name is already taken. It is here because inline validation copy is a
 * look decision and it cannot be judged from a form that is not wrong. */
function FormInContext() {
  const [size, setSize] = useState('100000');
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%',
    }}
    >
      <Field>
        <FieldLabel htmlFor="pr-type">Account Type</FieldLabel>
        <Select defaultValue="2step" items={TYPES}>
          <SelectTrigger id="pr-type"><SelectValue placeholder="Select account type" /></SelectTrigger>
          <SelectPopup>
            <SelectItem value="1step">1 Step</SelectItem>
            <SelectItem value="2step">2 Step</SelectItem>
            <SelectItem value="3step">3 Step</SelectItem>
            <SelectItem value="instant">Instant Funding</SelectItem>
          </SelectPopup>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="pr-size">Account Size</FieldLabel>
        <Select value={size} onValueChange={setSize} items={SIZES}>
          <SelectTrigger id="pr-size"><SelectValue placeholder="Select account size" /></SelectTrigger>
          <SelectPopup>
            <SelectItem value="25000">$25,000</SelectItem>
            <SelectItem value="50000">$50,000</SelectItem>
            <SelectItem value="100000">$100,000</SelectItem>
            <SelectItem value="200000">$200,000</SelectItem>
          </SelectPopup>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="pr-name">Account Name</FieldLabel>
        {/* MARKED INVALID, not just accompanied by red prose (owner ruling). The real
            page does the same thing on this exact field. */}
        <Input id="pr-name" defaultValue="FTMO 100k — Phase 2" aria-invalid="true" />
        <FieldError>You already have an account with this name.</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="pr-daily">Daily Drawdown (%)</FieldLabel>
        <Input id="pr-daily" inputMode="decimal" defaultValue="5" />
      </Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field>
          <FieldLabel htmlFor="pr-notes">Notes</FieldLabel>
          <Textarea id="pr-notes" placeholder="Anything you want to remember about this account." />
        </Field>
      </div>
    </div>
  );
}

/* THE CONSENT GATE, in its own pane, because it is the one place in this batch where the
 * look has a consequence. An unticked box is what stops a trade-capable password being
 * submitted — consent-field.jsx says so at length — so "did you notice you had to tick
 * it" is a real question about this specimen, not a stylistic one. The sentence is the
 * live copy from platformCatalog.js, not filler; its length is the reason the primitive
 * exists at all (a three-line label centred against a 16px box is what the composition
 * is correcting). */
function ConsentSpecimen() {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
      <Field>
        <FieldLabel htmlFor="pr-cred">Investor password</FieldLabel>
        <Input id="pr-cred" type="password" defaultValue="hunter2hunter2" />
        <FieldDescription>Read-only if your broker offers one.</FieldDescription>
      </Field>
      <ConsentField id="pr-consent" checked={ok} onCheckedChange={(v) => setOk(v === true)}>
        I understand this password can place trades on my account, and I authorise
        PropVexis to use it to read my trade history.
      </ConsentField>
      <div>
        <Button variant="primary" disabled={!ok}>Connect account</Button>
      </div>
    </div>
  );
}

/* THE LIST IS EMPTY, AND THAT IS THE POINT OF IT.
 *
 * Four questions were parked here on 7 Sep rather than decided, because each was a
 * defensible-either-way call on the owner's own product. All four were put to them the
 * same day and all four came back. They are kept as a CLOSED list rather than deleted:
 * the next round is read from this page, and a question that vanishes looks like one
 * that was never asked — which is how the same argument gets had twice.
 *
 * ONE OF THEM I HAD GOT WRONG, and it is recorded here rather than quietly corrected.
 * The "rejected field" question claimed the app ships the red sentence and leaves the box
 * looking normal. It does not: AccountStep already passes `aria-invalid`, the preset's
 * red edge and ring already apply, and there is exactly one validated field in the app,
 * which already does both. The owner picked "the box AND the sentence" — the behaviour
 * that was already there. What the answer buys is not a change; it is a RULE, and
 * form-family.test.js now holds it, because the risk was never the first call site.
 */
const DECIDED = [
  {
    q: 'A dropdown option had squarer corners than a menu row.',
    a: 'Matched to the menu — 14px.',
    detail:
      'An option was a 6px corner against the dropdown menu’s 14px. The split is '
      + 'shadcn’s own, which is why it was asked rather than tidied; §6 locked the '
      + 'overlays as a family, so one row shape now wins wherever something floats.',
  },
  {
    q: 'Field labels were full-strength white, not the muted label colour.',
    a: 'Muted — one label colour in the app.',
    detail:
      'You locked --text-2 for labels on the dashboard, and the form labels were '
      + 'rendering as bright as the value typed under them. There was a real argument '
      + 'for keeping them bright — a form label is a question you must read, not a '
      + 'caption — and you chose consistency. The label and its help text now differ '
      + 'by size, not by brightness.',
  },
  {
    q: 'What marks a rejected field.',
    a: 'The box and the sentence — which it already did.',
    detail:
      'I told you the app printed the sentence and left the box alone. That was wrong: '
      + 'the one validated field in the app already sets both, and the preset’s red '
      + 'edge and ring already apply to it. So nothing changed — what your answer '
      + 'bought is a test that pairs them, so the SECOND validated field cannot ship '
      + 'with only half.',
  },
  {
    q: 'The tick box corner was 5px, off our scale.',
    a: 'Rounded to 6px.',
    detail:
      'One pixel, and you were told so. Our steps are 6 / 8 / 10 / 14 / 16 and the '
      + 'generated tick box asked for an arbitrary 5. A knowing divergence from the '
      + 'preset, taken because a single arbitrary value is how a scale stops being one.',
  },
];

function OpenQuestions() {
  return (
    <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Decisions</span>
        <span style={S.mono}>four asked, four answered — nothing outstanding</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">all settled 7 Sep</Tag>
      </div>
      {DECIDED.map((o, i) => (
        <div
          key={o.q}
          style={{
            padding: '14px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--line-inset)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}
        >
          <span style={{ ...S.mono, minWidth: 14, paddingTop: 2 }}>{i + 1}</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 550, color: 'var(--text)' }}>{o.q}</div>
            <div style={{ fontSize: 12.5, color: 'var(--profit)', marginTop: 2 }}>{o.a}</div>
            <div style={{
              fontSize: 12.5, lineHeight: '20px', color: 'var(--text-2)', marginTop: 4,
            }}
            >
              {o.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================ THE ONE THAT WAS IN NO BATCH ===
 *
 * `overlay-container.js` renders NOTHING. It is a React context holding a ref, and the
 * batches were drawn from things you can look at, so it was never assigned to one — which
 * left the arithmetic short: 24 approved plus 11 batched is 35, not 36.
 *
 * IT HAS EXACTLY ONE VISIBLE CONSEQUENCE, and that is what this pane shows rather than
 * asking anyone to approve an abstraction. Base UI portals an overlay into its nearest
 * parent portal, not to the page — so a menu opened inside a modal lands as a SIBLING of
 * the modal's backdrop, where the positioner's hardcoded z-index of 50 loses to the
 * scrim's 2147483000 and the menu paints underneath it: focused, keyboard-operable, and
 * invisible. This context is how an overlay says "I belong to that modal" instead of
 * asking for a bigger number.
 *
 * So: open the modal, then open the menu and the picker inside it. If you can see them,
 * the component works. That is the entire review, and it is the honest one — there is no
 * appearance here to have an opinion about.
 */
function OverlayContainerSpecimen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open a modal with overlays inside it
      </Button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} label="Overlay containment" style={{ display: 'grid', gap: 24 }}>
          <DialogHeader>
            <DialogTitle>Overlays inside a modal</DialogTitle>
            <DialogDescription>
              Both controls below open panels of their own. Without this context they would
              render underneath the dark backdrop behind this dialog — reachable by
              keyboard, invisible to you.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Menu>
              <MenuTrigger render={<Button variant="secondary" />}>
                <Filter aria-hidden="true" />
                A menu
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem>Export CSV</MenuItem>
                <MenuItem>Duplicate</MenuItem>
                <MenuSeparator />
                <MenuItem>Archive</MenuItem>
              </MenuContent>
            </Menu>
            {/* THE PICKER IS DELIBERATELY STILL HERE AND STILL BROKEN (2026-09-08).
                It does not open inside a modal, and the reason is not ours to fix in a
                className: the generated `SelectContent` renders `<Select.Portal>` with no
                props at all, so there is no way to hand it the container the way `Menu`
                takes one. Base UI then falls back to the parent portal — beside the
                backdrop — where the panel paints under the scrim and the dialog's own
                focus containment makes it inert.

                Left in rather than removed, because a specimen that quietly omits the
                broken case is how a limitation stops being visible. The owner has the
                trade-off; see the note under this pane. */}
            <Select defaultValue="2step" items={TYPES}>
              <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
              <SelectPopup>
                <SelectItem value="1step">1 Step</SelectItem>
                <SelectItem value="2step">2 Step</SelectItem>
                <SelectItem value="instant">Instant Funding</SelectItem>
              </SelectPopup>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </Modal>
      ) : null}
    </>
  );
}

/* ================================================================= BATCH 3 ===
 * FEEDBACK — alert · skeleton · spinner · progress.
 *
 * These four say what is happening: something went wrong, something is coming, something
 * is running, something is this far along. They are one batch because they are the app
 * talking about ITSELF rather than about trades — and because §17, the rule for how a
 * system message may spend colour, governs the first one and nothing else in the app.
 *
 * WHAT THE PRE-REVIEW AUDIT FOUND (2026-09-07), run under the standing rule that the
 * registry is checked BEFORE anything is wrapped or hand-built:
 *
 *   · ALL FOUR ARE THE SHIPPED COMPONENT, and all four are byte-identical to what their
 *     registry serves today. `skeleton` and `spinner` are shadcn base-rhea; `alert` and
 *     `progress` are @coss. Nothing is hand-built, nothing has drifted, and there is no
 *     rewrite waiting the way there was for the picker.
 *   · `alert` IS @coss ON PURPOSE and it is worth knowing why: shadcn's own alert ships
 *     two variants, default and destructive. §17 needs a four-step ladder — error,
 *     warning, info, success — and @coss ships exactly that. §1's build order working,
 *     not a shortcut past it.
 *   · `progress` carries the batch's ONE override: the generated indicator animates over
 *     500ms and §10 allows two durations, 200 and 120. Worth noting that shadcn's own
 *     progress has since dropped its duration entirely, so if we ever move off the coss
 *     one that override goes with it.
 *   · NOTHING IN THE APP RENDERS THE SPINNER. Not one screen — checked. It is drawn below
 *     so it can be judged, but it is being approved with no call sites.
 */

/* §17 IS WHAT THIS PANE IS FOR, and it is the rule settled on 2026-09-06: a system message
 * may colour its GLYPH and a 1px EDGE; it may not colour its WORDS or wash its surface,
 * and nothing inside a data surface may use status colour at all. The generated component
 * already spends colour in exactly those two places, so there is nothing of ours in here —
 * which means what is being judged is whether the RULE reads right in practice, not
 * whether we implemented it. */
const ALERT_TONES = [
  { v: 'error', icon: AlertCircle, title: 'We could not start the connection', body: 'Nothing was saved. You can try authorizing again.' },
  { v: 'warning', icon: AlertTriangle, title: 'You are 88% through today’s loss limit', body: 'One more losing trade at your usual size would breach it.' },
  { v: 'info', icon: Info, title: 'Your EA has not reported since Friday', body: 'Trades placed since then will appear once it reconnects.' },
  { v: 'success', icon: CheckCircle2, title: 'Payout recorded', body: '$4,120 added to your withdrawal history.' },
];

function AlertTones() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {ALERT_TONES.map(({ v, icon: Icon, title, body }) => (
        <Alert key={v} variant={v}>
          <Icon aria-hidden="true" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{body}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function AlertShapes() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <Alert variant="error">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Sync failed</AlertTitle>
        <AlertDescription>
          Your last 3 trades did not import. This usually means the terminal was closed
          mid-write; retrying is safe and will not duplicate anything.
        </AlertDescription>
        <AlertAction>
          <Button variant="secondary" size="sm">Retry</Button>
        </AlertAction>
      </Alert>
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertDescription>
          One line, no heading &mdash; which is what most of the app&rsquo;s alerts
          actually are.
        </AlertDescription>
      </Alert>
    </div>
  );
}

/* THE OTHER THREE TOGETHER, because they are one question asked three ways: "something is
 * happening, wait." A skeleton says it about a REGION, a spinner about an ACTION, a
 * progress bar about a JOB WITH A KNOWN END. If they do not read as one family, the user
 * learns three vocabularies for one idea. */
function LoadingFamily() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: 230 }}>
        <span style={S.specimenLabel}>Skeleton — a region</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton style={{ height: 28, width: 140 }} />
          <Skeleton style={{ height: 14, width: '100%' }} />
          <Skeleton style={{ height: 14, width: '78%' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Skeleton style={{ height: 56, flex: 1 }} />
            <Skeleton style={{ height: 56, flex: 1 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={S.specimenLabel}>Spinner — an action</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minHeight: 56 }}>
          <Spinner />
          <Spinner style={{ width: 20, height: 20 }} />
          <Spinner style={{ width: 28, height: 28 }} />
          <Button variant="primary" disabled>
            <Spinner />
            <ButtonLabel>Connecting…</ButtonLabel>
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 230 }}>
        <span style={S.specimenLabel}>Progress — a job with an end</span>
        {[0, 40, 100].map((v) => (
          <Progress key={v} value={v}>
            <ProgressTrack><ProgressIndicator /></ProgressTrack>
          </Progress>
        ))}
        <Progress value={62}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <ProgressLabel>Importing trades</ProgressLabel>
            <ProgressValue />
          </div>
          <ProgressTrack><ProgressIndicator /></ProgressTrack>
        </Progress>
      </div>
    </div>
  );
}

/* ================================================================= BATCH 6 ===
 * REBUILT, THEN REVIEWED — "nothing here yet" · page loading block · tabs.
 *
 * THIS BATCH IS DIFFERENT FROM THE OTHER FIVE. The three were never reviewable: they
 * still rendered the app's own `.u-*` markup, so looking at them would have been looking
 * at something already scheduled for deletion. The plan's answer was to rebuild them
 * FIRST and review the result — which is what happened on 2026-09-08, and what is drawn
 * below is the rebuild, not the thing that was there yesterday.
 *
 * TWO OF THE THREE WERE HELD BACK BY REASONS THAT HAD EXPIRED, which by now is the most
 * reliable finding of the whole review:
 *
 *   · `empty-state.jsx` argued at length that it would stay hand-written — "no registry
 *     has an empty state, because what belongs in one is a product decision" — while its
 *     own status line, two paragraphs above, already named `@shadcn empty` and the parts
 *     it ships. The registry has it, with exactly those parts.
 *   · `tabs.jsx` argued it was "the LAST primitive scheduled for library adoption"
 *     because its underline interaction "is a documented design-system rule rather than
 *     a default, and a generated tab list arrives with its own idea of all of that". The
 *     generated tab list ships OUR rule as `variant="line"`: transparent track, and an
 *     `after:` underline that fades in on the active tab.
 *
 * Only `loading-block.jsx` had a live argument, and it was answered rather than waved
 * away — see its header for what the rebuild costs (the shimmer) and why that is a gain.
 *
 * TWENTY-SIX LEGACY RULES WENT WITH THEM, which is the point of the batch as much as the
 * appearance is: `legacy/app.css` is down to 994 class names and the `u-*` layer is now
 * just the button, the card and the form field.
 */
function RebuiltSix() {
  const [tab, setTab] = useState('summary');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, width: '100%' }}>
      <div>
        <span style={S.specimenLabel}>Tabs — the underline is the registry&rsquo;s now</span>
        <div style={{ marginTop: 10 }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'summary', label: 'Summary' },
              { value: 'transactions', label: 'Transactions' },
              { value: 'funded', label: 'Funded' },
            ]}
          />
        </div>
      </div>

      <div>
        <span style={S.specimenLabel}>Nothing here yet</span>
        {/* PADDED, so the two borders are not flush. The first version of this pane sat the
            empty state's edge directly against the card's, with no gap — which made the
            corners the only place the two curves could be compared, and exaggerated a
            mismatch that was real but smaller than it looked. A real page puts an empty
            state inside a card's padding, so the specimen does too. */}
        <div style={{
          marginTop: 10, padding: 12, border: '1px solid var(--line)', borderRadius: 14,
          background: 'var(--surface)',
        }}
        >
          <EmptyState
            icon={<Inbox aria-hidden="true" />}
            title="No payouts yet"
            description="When you record a withdrawal it will appear here, with the fees and the cycle it belonged to."
            actions={<Button variant="primary" size="sm">Record a payout</Button>}
          />
        </div>
      </div>

      <div>
        <span style={S.specimenLabel}>Page loading block</span>
        <div style={{
          marginTop: 10, border: '1px solid var(--line)', borderRadius: 14,
          background: 'var(--surface)', overflow: 'hidden',
        }}
        >
          <LoadingBlock kpis={4} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================= BATCH 5 ===
 * SMALL PIECES — profile picture · dividing line · number badge.
 *
 * A glance each, which is why the plan put them last and why they are one card rather
 * than three. All three came back identical to their registry (checked before anything
 * else, per the standing rule), so there is nothing of ours to defend in any of them
 * except two locked-rule corrections on the number badge, both already written down.
 *
 * WHAT TO ACTUALLY LOOK AT, because "a glance" is not the same as "no decisions":
 *
 *   · The number badge is the only one carrying a colour decision, and it changed once
 *     already — an unread count used to be RED and is now the action colour, because §4
 *     spends red on losses and a red dot beside a bell reads as money lost.
 *   · The divider is the one part §8 fully settles: 1px, full width, never inset. If it
 *     looks wrong here it is the RULE that is wrong, not the component.
 *   · The profile picture appears in exactly one place in the app, and its fallback —
 *     the initial, when Google's image fails to load — is the state nobody ever sees on
 *     purpose. It is drawn below precisely because it is the one that ships broken.
 */
function SmallPieces() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 34, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={S.specimenLabel}>Profile picture</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 56 }}>
          <Avatar size="lg">
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AP</AvatarFallback>
          </Avatar>
          <AvatarGroup>
            <Avatar><AvatarFallback>A</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>M</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>K</AvatarFallback></Avatar>
          </AvatarGroup>
        </div>
        <span style={{ ...S.mono, fontSize: 11 }}>large · default · a group</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
        <span style={S.specimenLabel}>Dividing line</span>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12, width: '100%',
          padding: 14, borderRadius: 12, background: 'var(--surface)',
          border: '1px solid var(--line)',
        }}
        >
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Daily drawdown</span>
          <Separator />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Maximum drawdown</span>
          <Separator />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>Profit target</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={S.specimenLabel}>Number badge</span>
        {/* THE BADGE GOES INSIDE THE BUTTON, and the first version of this pane put it
            beside one — which the owner spotted immediately as "the hover feels off".
            It was: as a SIBLING, moving the pointer from the bell onto the badge LEAVES
            the button, so the hover fill drops while the cursor is still visually on the
            control. Notifications.jsx has always had it right — the badge is a child of
            the trigger, `size="icon-sm" pill`, and `.notif` supplies the positioned
            ancestor `corner` needs. Reproduced here exactly, because a specimen that
            composes a component differently from its one real call site is testing
            something the app does not do. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, minHeight: 56 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Filters</span>
            <CountBadge>3</CountBadge>
          </span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Button variant="chrome" size="icon-sm" pill>
              <Bell aria-hidden="true" />
              <CountBadge tone="alert" corner>7</CountBadge>
            </Button>
          </span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Button variant="chrome" size="icon-sm" pill>
              <Bell aria-hidden="true" />
              <CountBadge tone="alert" corner>99+</CountBadge>
            </Button>
          </span>
        </div>
        <span style={{ ...S.mono, fontSize: 11 }}>a filter count · unread · capped at 99+</span>
      </div>
    </div>
  );
}

/* ============================================== BATCH 4, DEFERRED 2026-09-08 ===
 * FLOWS — the Add Account wizard. Skipped at the owner's request: the Add Account flow is
 * being redesigned, so reviewing it now would be reviewing it twice. Its specimens are
 * deleted rather than commented out — the page is a queue, and a queue with dead entries
 * in it stops being one. The file itself stays exactly where it is: eleven shipping pages
 * render it, and `@design unreviewed` is what keeps the REDESIGNED flow from adopting it.
 *
 * ONE COMPONENT, 21 EXPORTED PARTS, and the only batch in the review that is genuinely
 * HAND-WRITTEN rather than a registry component with a wrapper. That is a claim the
 * standing rule says to check rather than assert, so it was checked: neither shadcn nor
 * @coss ships a wizard, a stepper, or anything shaped like one — @coss's 484 particles
 * cover 52 component types and none of them is this. The pieces it is BUILT from are all
 * registry components (Button, Input, Progress), and it composes them.
 *
 * WHY IT WAITED FOR BATCH 2 AND 3. Every page of this wizard is made of form controls and
 * a progress bar. Reviewing the container before its contents were settled would have
 * meant reviewing it twice — and in the event both batches moved under it: the labels went
 * muted, the picker was replaced outright, and the progress bar's animation was corrected.
 *
 * WHAT THE PRE-REVIEW AUDIT FOUND (2026-09-08):
 *
 *   · A THIRD EXPIRED JUSTIFICATION, same shape as the two in `select.jsx`. All four grids
 *     were written as an arbitrary `[display:grid]` property rather than the plain `grid`
 *     utility, to dodge a legacy CSS collision — one that had been closed at BOTH ends on
 *     2026-08-28, before this file was written. Deleted; the grids are plain `grid` now.
 *   · Nothing else. Every value in the file traces to a rule, and the file says which.
 */
/* ============================================================ FOLDING AWAY ===
 *
 * THE PAGE IS A QUEUE, AND A FINISHED QUEUE THAT STILL SHOWS EVERY FINISHED ITEM IS NOT
 * ONE (owner, 2026-09-08: "find a way to hide the approved and locked things... dont want
 * to overcrowde it"). Every locked batch collapses to a single line and opens on click.
 *
 * `<details>` RATHER THAN REACT STATE, and it is not laziness. The browser gives us the
 * open/closed behaviour, the keyboard handling and the accessibility semantics for free,
 * and it keeps working if this page is ever printed or opened with JS half-loaded. State
 * here would be three lines to reimplement what the platform already does correctly.
 *
 * The marker is removed and drawn by hand because Safari and Firefox disagree about the
 * default triangle's size and position, and a review page that looks different per browser
 * is the one thing this page must not be.
 *
 * NOTHING IS DELETED BY FOLDING. Every locked specimen still renders when opened — that is
 * the whole reason the page survives the review: change one token and you can check all 36
 * parts at once. Folding is about what you see FIRST, not about what is here. */
function Folded({ title, tag, hint, children, open = false }) {
  return (
    <details open={open} style={{ marginTop: 22 }}>
      <summary
        style={{
          display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
          cursor: 'pointer', listStyle: 'none', userSelect: 'none',
        }}
      >
        {/* The chevron rotates via the parent's open state — a sibling selector would need
            a stylesheet, and a utility class here would compile to nothing. */}
        <span style={{ fontSize: 11, color: 'var(--text-3)', width: 10 }}>▸</span>
        <span style={S.batchTitle}>{title}</span>
        {tag}
        {hint ? <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{hint}</span> : null}
      </summary>
      <div style={{ paddingLeft: 22 }}>{children}</div>
    </details>
  );
}

/* ======================================================= THE REDESIGN MAP ===
 *
 * WHY IT LIVES ON THIS PAGE. The primitive review was never the project — it was the
 * PREREQUISITE for it. §1 says a redesigned screen may only use parts the owner has signed
 * off, so the review is what unblocks the redesign, and until now the two were tracked in
 * two untracked documents nobody opens. Putting the map here means the thing that says
 * "what next" sits directly under the thing that says "with what".
 *
 * SOURCE OF TRUTH IS STILL `docs/architecture/SCREEN-REDESIGN-PLAN.md`. This is a view of
 * it, not a second copy of the decisions — the cycle order, the families and the archetypes
 * are that document's, and the counts below were measured when it was authored (2026-09-06)
 * except where marked live.
 */
/* HOW MANY CLASS NAMES THE OLD STYLESHEET STILL DECLARES.
 *
 * A NUMBER IN A COMMENT IS A NUMBER THAT ROTS, and this page has spent a week finding
 * exactly that failure in other files. So it is not a comment — `legacy-css-count.test.js`
 * counts the real declarations and fails if this disagrees. It cannot drift without
 * someone being told, and updating it is one line when a cycle deletes a screen's CSS.
 *
 * It is the honest measure of the redesign's progress in a way "screens done" is not: a
 * screen can be redesigned and still leave its old rules behind, which is the step §9 of
 * the plan says gets skipped. */
const LEGACY_CLASSES = 968;

const CYCLES = [
  {
    n: 0,
    what: 'The kit',
    detail: 'Every shared piece, every state, and the filter bar. Nothing else can start until this exists.',
    screens: 'unlocks all 30',
    state: 'next',
  },
  {
    n: 1,
    what: 'Trade Log',
    detail: 'The table archetype, and the busiest page in the app. Five screens are assembled from it.',
    screens: '5 screens',
  },
  {
    n: 2,
    what: 'Analytics',
    detail: 'The chart archetype and the biggest family — Psychology, Progress, Reports, Strategies, Backtesting all follow it.',
    screens: '7 screens',
  },
  {
    n: 3,
    what: 'Journal, Day, Calendar',
    detail: 'The workspace archetype. The Calendar is the heaviest user of the old stylesheet outside Prop OS.',
    screens: '3 screens',
  },
  {
    n: 4,
    what: 'Settings + Add Account',
    detail: 'The form archetype: six settings sections and the account wizard. Small and low risk, which is why it sits before Prop OS.',
    screens: '8 screens',
    note: 'this is the cycle the wizard comes back for review in',
  },
  {
    n: 5,
    what: 'Prop OS',
    detail: 'Overview, Challenges, Finance, Accounts. The biggest and most complex, and deliberately scheduled after four families have proven the kit.',
    screens: '4 screens',
  },
  {
    n: 6,
    what: 'Auth + Onboarding',
    detail: 'The front door for every new signup. It does not jump the queue ahead of the in-app screens — that was decided rather than assumed.',
    screens: '6 screens',
  },
  {
    n: 7,
    what: 'Alerts, Reports, Tools',
    detail: 'The leftovers, assembled from a kit that is fully proven by this point.',
    screens: '4 screens',
  },
  {
    n: 8,
    what: 'Delete the old stylesheet',
    detail: 'The finish line. A screen is not done until its old CSS is deleted, so by here there should be nothing left to remove.',
    screens: 'the end',
  },
];

function RedesignMap({ legacyClasses }) {
  return (
    <div style={{ ...S.card, marginTop: 16 }}>
      <div style={S.cardHead}>
        <span style={S.cardName}>The redesign, in order</span>
        <span style={S.mono}>docs/architecture/SCREEN-REDESIGN-PLAN.md</span>
        <span style={{ flex: 1 }} />
        <Tag tone="open">cycle 0 is next</Tag>
      </div>

      <div style={{ ...S.note, borderTop: 'none' }}>
        Thirty screens, seven families, one archetype each — the other twenty-three are
        assembled from those seven rather than designed. The rule that makes it hold: a
        tweak touching more than one screen goes into the kit or the tokens, never into
        the page. Otherwise you get thirty slightly different tables.
        {' '}
        <strong style={{ color: 'var(--text)' }}>The parts above are what the kit is built
        from</strong>
        {' '}
        — which is why the review came first, and why an unapproved part cannot be used by
        a redesigned screen.
      </div>

      {CYCLES.map((c) => (
        <div
          key={c.n}
          style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '13px 18px', borderTop: '1px solid var(--line-inset)',
            background: c.state === 'next' ? 'var(--surface-sunken)' : 'transparent',
          }}
        >
          <span style={{
            ...S.mono,
            minWidth: 18,
            color: c.state === 'next' ? 'var(--accent)' : 'var(--text-3)',
            paddingTop: 2,
          }}
          >
            {c.n}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 550, color: 'var(--text)' }}>{c.what}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{c.screens}</span>
              {c.state === 'next' ? <Tag tone="open">next</Tag> : null}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: '20px', color: 'var(--text-2)', marginTop: 3 }}>
              {c.detail}
            </div>
            {c.note ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontStyle: 'italic' }}>
                {c.note}
              </div>
            ) : null}
          </div>
        </div>
      ))}

      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>How you will know it is working: </strong>
        the old stylesheet shrinks. It was 1,126 class names when this started and is
        {' '}
        <strong style={{ color: 'var(--text)' }}>{legacyClasses} now</strong>
        {' '}
        — but almost all of that came from replacing components, not from deleting dead
        rules. Each cycle above should take a visible bite out of it, and cycle 8 only
        exists to confirm there is nothing left.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- the page --- */

/* THE COUNTS MOVE AS THINGS GET SIGNED OFF, and two of them moved on 2026-09-07 without
 * this list being told. Batch 4 read "2 parts · wizard · toggle-group" after the toggle
 * had already cleared the variant matrix, and Batch 6 still counted `badge`, which left
 * legacy CSS the same day and is approved. A queue that overstates what is left is the
 * one thing this page must not do — it is the only place anyone reads how much is
 * outstanding. */
/* `LATER_BATCHES` IS GONE (2026-09-08). It listed the batches still queued, under a
 * heading reading "Not open yet — each opens when the one before it is locked". With every
 * batch locked it had one entry, the deferred wizard, sitting at the very bottom of the
 * page under a heading that described it wrongly: the wizard is not waiting its turn, it
 * is waiting for a redesign.
 *
 * The one outstanding thing now has its own note directly under the redesign map, where it
 * belongs — beside cycle 4, which is the cycle it comes back in. */

/* ===== VARIANT MATRIX - the states you can only check by using them =====
 *
 * Built 2026-09-07, at the owner's request, after three state bugs in a row that no
 * screenshot could have caught: a blanket `aria-expanded` override that painted a
 * PRIMARY button grey while its menu was open, a pill that held its fill where the preset
 * lets go, and a switch whose off-state was tuned against a token mapping that had moved
 * months earlier.
 *
 * WHY EVERY OTHER SPECIMEN ON THIS PAGE MISSED THEM. The panes above render one variant
 * each, usually forced open (`defaultOpen`) so the panel can be compared without a
 * pointer. That is right for comparing SURFACES and useless for comparing STATES: rest,
 * hover, press, open, and open-then-move-away are five different pictures and a forced
 * specimen shows one. The primary-button bug survived precisely because no specimen on
 * this page had ever opened a menu from a primary button.
 *
 * So this section is deliberately NOT forced open. Use it: hover each one, click it, then
 * move the cursor onto the panel and watch the trigger. button.jsx's open-state note
 * carries the table of what each variant is supposed to do.
 *
 * The scaffolding is inline styles, per this file's header: Tailwind compiles only under
 * components/{ui,primitives}, so a utility written here would emit nothing, silently. */

/* THE FOUR REAL VARIANTS, in our vocabulary. `tinted` and `chrome` are deliberately NOT
 * in this list and get their own row below: neither is a generated variant - `VARIANTS`
 * has no key for either - so `buttonVariants({ variant: 'tinted' })` asks cva for a
 * variant it does not define and compiles to NOTHING. Both are real only with `pill`,
 * which is what supplies their surface. Putting them in this row would render two
 * unstyled buttons and read as a bug in the matrix rather than a misuse of the API. */
const TRIGGER_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'];

function MenuInVariant({ variant, pill = false }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={S.specimenLabel}>{pill ? `${variant} - pill` : variant}</span>
      {/* The container seam again: without it the popup escapes to document.body and
          leaves the row, which makes "move the cursor onto the panel" impossible to do
          without losing the trigger off the edge of the card. */}
      <div ref={ref} style={{ position: 'relative' }}>
        <OverlayContainerContext.Provider value={ref}>
          <Menu>
            <MenuTrigger render={<Button variant={variant} pill={pill} />}>
              {variant}
              <ChevronDown aria-hidden="true" />
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem>Open in chart replay</MenuItem>
              <MenuItem>Tag a setup</MenuItem>
              <MenuSeparator />
              <MenuItem variant="destructive">Delete trade</MenuItem>
            </MenuContent>
          </Menu>
        </OverlayContainerContext.Provider>
      </div>
    </div>
  );
}

const TONES = ['neutral', 'brand', 'profit', 'loss', 'warn', 'ai'];

function VariantMatrix() {
  const [on, setOn] = useState(true);
  const [unit, setUnit] = useState('R');
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Variant matrix</span>
        <span style={S.mono}>hover / click / move onto the panel</span>
        <span style={{ flex: 1 }} />
        <Tag tone="open">manual check</Tag>
      </div>

      <div style={{ ...S.specimens, gap: 26 }}>
        {TRIGGER_VARIANTS.map((v) => <MenuInVariant key={v} variant={v} />)}
        <MenuInVariant variant="tinted" pill />
        <MenuInVariant variant="chrome" pill />
      </div>

      <div style={{ ...S.specimens, borderTop: '1px solid var(--line-inset)' }}>
        <div style={{ ...S.specimen, flex: 1 }}>
          <span style={S.specimenLabel}>Badge - all six tones, first render off legacy</span>
          <div style={{ ...S.stage, flexWrap: 'wrap' }}>
            {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
          </div>
        </div>
      </div>

      <div style={{ ...S.specimens, borderTop: '1px solid var(--line-inset)' }}>
        <div style={S.specimen}>
          <span style={S.specimenLabel}>Switch - click it; the OFF half is what changed</span>
          <div style={S.stage}>
            <Switch checked={on} onCheckedChange={setOn} aria-label="Demo switch" />
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{on ? 'on' : 'off'}</span>
          </div>
        </div>
        <div style={S.specimen}>
          <span style={S.specimenLabel}>Toggle group - pill, left as it was by the audit</span>
          <div style={S.stage}>
            <ToggleGroupExclusive pill value={unit} onValueChange={setUnit}>
              <ToggleGroupItem value="R">R</ToggleGroupItem>
              <ToggleGroupItem value="$">$</ToggleGroupItem>
            </ToggleGroupExclusive>
          </div>
        </div>
      </div>

      <div style={S.note}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>What to watch on the triggers. </strong>
        Hover brightens. Click opens, and the colour should not jump. Then move the cursor
        onto the panel:
        {' '}
        <span style={S.mono}>primary</span>
        {' '}
        and
        {' '}
        <span style={S.mono}>danger</span>
        {' '}
        fall back to rest, while
        {' '}
        <span style={S.mono}>secondary</span>
        {' '}
        and
        {' '}
        <span style={S.mono}>ghost</span>
        {' '}
        hold a fill. That split is the preset&rsquo;s rather than ours - it is what you
        chose over our stricter reading of &sect;14, and the two halves disagreeing on
        purpose is exactly what this row exists to make visible.
      </div>
    </div>
  );
}

export default function PrimitiveReview() {
  const menu = MenuSpecimens();

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>Development only · not visible to customers</div>
      <h1 style={S.h1}>Primitive review</h1>
      <p style={S.lede}>
        <strong style={{ color: 'var(--text)' }}>35 of 36 approved. Nothing is waiting on
        you.</strong>
        {' '}
        Every batch is locked, so they are folded away below — click one to open it. The
        page stays exactly as useful as it was: change one colour and you can check all 36
        parts at once instead of clicking through the whole app.
        {' '}
        The one part still unsigned is the Add Account wizard, and it is unsigned on
        purpose — that flow is being redesigned, and leaving it unapproved is what stops
        the new one inheriting the old.
        {' '}
        <strong style={{ color: 'var(--text)' }}>What comes next is below.</strong>
      </p>

      <RedesignMap legacyClasses={LEGACY_CLASSES} />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>The one part still unsigned</span>
          <span style={S.mono}>primitives/wizard.jsx</span>
          <span style={{ flex: 1 }} />
          <Tag>deferred to cycle 4</Tag>
        </div>
        <div style={S.note}>
          The Add Account wizard — one component, 21 parts. It is unsigned
          {' '}
          <strong style={{ color: 'var(--text)' }}>on purpose</strong>
          , not by omission: that flow is being redesigned in cycle 4, and an unapproved
          part may stay where it is but may not be adopted by a redesigned screen. So
          leaving it unsigned is exactly what stops the new flow inheriting the old wizard.
          It comes back for review as part of that cycle. Its code stays where it is —
          eleven shipping pages render it.
        </div>
      </div>

      <div style={S.batchHead}>
        <span style={S.batchTitle}>The parts, all signed off</span>
        <Tag tone="ok">🔒 6 batches</Tag>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          folded — open one to check a component, or after changing a token
        </span>
      </div>

      <Folded
        title="The one that was in no batch"
        tag={<Tag tone="ok">approved 8 Sep 2026</Tag>}
        hint={(
          <>
            signed off by confirming it works — it has no appearance to judge
          </>
        )}
      >
      {/* ================================================= THE UNBATCHED ONE === */}

      <Spec
        name="Overlay container"
        approved="8 Sep 2026"
        file="primitives/overlay-container.js"
        ask={
          'nothing, really — and that is the point. This one draws no pixels: it is the '
          + 'wiring that tells a menu opened inside a pop-up window that it belongs to that '
          + 'window. Without it the menu opens underneath the dark backdrop, where you '
          + 'cannot see it but your keyboard can still reach it. So the check is simply: '
          + 'open the window below, open the menu and the picker inside it, and confirm you '
          + 'can see them. If you can, it works. It has no appearance to approve, so it '
          + 'should be signed off the way the dialog was signed off underneath the modal.'
        }
        states={[{ label: 'A menu and a picker, inside a modal', render: <OverlayContainerSpecimen /> }]}
      />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>The picker in that modal does not open</span>
          <span style={S.mono}>a real limitation, not a bug in our code</span>
          <span style={{ flex: 1 }} />
          <Tag tone="open">your call</Tag>
        </div>
        <div style={S.note}>
          The menu works; the picker beside it does nothing when you click it, and I have
          left it there rather than quietly removing it. The reason is not something we can
          fix with styling: the shipped picker gives no way to tell it
          {' '}
          <em>which window it belongs to</em>
          , the way the menu does. So it opens behind the dark backdrop, where the pop-up
          window&rsquo;s own focus rules also make it unclickable.
          {' '}
          <strong style={{ color: 'var(--text)' }}>Nothing in the app hits this today</strong>
          {' '}
          — no pop-up window in PropVexis contains a picker, and this Test page is the only
          place it appears. So there is nothing broken for a customer right now; the
          question is what we do the first time a window needs one.
        </div>
      </div>
      </Folded>

      <Folded
        title="Batch 6 — Rebuilt, then reviewed"
        tag={<Tag tone="ok">🔒 locked 8 Sep 2026</Tag>}
        hint={(
          <>
            the last three on the old CSS — rebuilt on 8 Sep, reviewed as the rebuild, locked
          </>
        )}
      >
      {/* ================================================================ BATCH 6 === */}

      <Spec
        name="Rebuilt on the registry"
        approved="8 Sep 2026"
        file="primitives/empty-state.jsx · tabs.jsx · loading-block.jsx"
        ask={
          'these three are new, not adjusted — yesterday they were still drawing the old '
          + 'stylesheet. So look at them as if for the first time. The tabs: is the '
          + 'underline under the active one clear enough, and does hovering a different '
          + 'one preview it without shouting? The empty block: the icon is smaller than it '
          + 'was and has lost its box outline, and the title and description both moved '
          + 'onto our type scale — does it still read as a deliberate state rather than a '
          + 'gap? The loading block: it now pulses instead of sweeping a shine across each '
          + 'bar, which is the one thing the rebuild deliberately gave up.'
        }
        states={[{ label: 'All three, rebuilt', render: <RebuiltSix /> }]}
      />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>What the rebuild deleted</span>
          <span style={S.mono}>26 rules out of the old stylesheet</span>
          <span style={{ flex: 1 }} />
          <Tag tone="ok">994 classes left</Tag>
        </div>
        <div style={S.note}>
          The point of this batch is as much what went away as what it looks like. Twenty-six
          rules left the old stylesheet with these three, and the part of it that this review
          started against — the shared button, card, tab, skeleton and empty-state layer — is
          now down to the button, the card and the form field.
          {' '}
          <strong style={{ color: 'var(--text)' }}>Two of the three were held back by reasons
          that had expired.</strong>
          {' '}
          The empty block insisted no component library ships an empty state, on the line
          below one naming the component that replaced it. The tabs insisted our underline
          was too particular for a library, and the library ships that underline as an
          option. That is the fifth and sixth time this review has found a rule outliving
          its reason — which is exactly what the standing rule you set now catches.
        </div>
      </div>
      </Folded>

      <Folded
        title="Batch 5 — Small pieces"
        tag={<Tag tone="ok">🔒 locked 8 Sep 2026</Tag>}
        hint={(
          <>
            profile picture · dividing line · number badge — a glance each
          </>
        )}
      >
      {/* ================================================================ BATCH 5 === */}

      <Spec
        name="Small pieces"
        approved="8 Sep 2026"
        file="primitives/avatar.js · separator.js · count-badge.jsx"
        ask={
          'a glance each, but not nothing. The number badge is the only one carrying a '
          + 'colour decision: an unread count used to be red and is now the action colour, '
          + 'because red is what this app spends on losses and a red dot beside a bell '
          + 'reads as money gone. Check the two-digit one still fits its circle. The '
          + 'divider is the one part the rules fully settle — 1px, full width, never '
          + 'inset — so if it looks wrong here it is the rule that is wrong. And the '
          + 'profile picture is drawn as its FALLBACK, the initial you see when Google’s '
          + 'image fails: it appears in one place in the app and it is the state nobody '
          + 'ever checks on purpose.'
        }
        states={[{ label: 'All three', render: <SmallPieces /> }]}
      />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>Batch 4 — the Add Account wizard</span>
          <span style={S.mono}>primitives/wizard.jsx</span>
          <span style={{ flex: 1 }} />
          <Tag>deferred 8 Sep 2026</Tag>
        </div>
        <div style={S.note}>
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Skipped, on your call —
          the flow is being redesigned. </strong>
          It moves to the same category as the other three parts we are rebuilding rather
          than adjusting: reviewing it now would mean reviewing it twice, and approving it
          would be worse than skipping it, because
          {' '}
          <strong style={{ color: 'var(--text)' }}>an unapproved part cannot be used by a
          redesigned screen</strong>
          {' '}
          — so leaving it unsigned is what stops the new Add Account flow quietly inheriting
          the old one. The unreviewed mark is doing real work here rather than sitting as a
          loose end.
        </div>
        <div style={{ ...S.note, borderTop: '1px solid var(--line-inset)' }}>
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>The code stays where it is. </strong>
          You offered removing the primitives instead, and that one I have not done: eleven
          shipping files render them — every page of the Add Account flow — so deleting
          them would take the live flow with it. They stay, unapproved, until the redesign
          replaces them. Nothing about that blocks anything.
        </div>
      </div>
      </Folded>

      <Folded
        title="Batch 3 — Feedback"
        tag={<Tag tone="ok">🔒 locked 8 Sep 2026</Tag>}
        hint={(
          <>
            all four signed off · new screens may use them · Batch 4 is next
          </>
        )}
      >
      {/* ================================================================ BATCH 3 === */}

      <Spec
        name="Message bar"
        approved="8 Sep 2026"
        file="primitives/alert.jsx"
        ask={
          'the four tones against each other. The rule you settled last week says a system '
          + 'message may colour its ICON and a hairline EDGE, and may never colour its '
          + 'WORDS or wash the whole box — so check that the red one reads as urgent '
          + 'without the sentence itself turning red, and that the four make a sensible '
          + 'ladder: an error should be louder than a tip, and the green one must not read '
          + 'as profit. Then the second pane: whether a message with a button in it still '
          + 'reads as a message rather than a card, and whether a one-line one without a '
          + 'heading looks deliberate.'
        }
        states={[
          { label: 'The four tones', render: <AlertTones /> },
          { label: 'With an action · with no heading', render: <AlertShapes /> },
        ]}
      />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>Turned down on 8 Sep</span>
          <span style={S.mono}>two values, same construction</span>
          <span style={{ flex: 1 }} />
          <Tag tone="ok">your call, applied</Tag>
        </div>
        <div style={S.note}>
          You said these were too colourful for the theme and pointed at shadcn&rsquo;s,
          where the box stays plain and only the writing carries the tone. Two things
          moved, and the rule itself did not.
          {' '}
          <strong style={{ color: 'var(--text)' }}>Each tone no longer tints its own
          background</strong>
          {' '}
          — all four now sit on exactly the same surface a plain message sits on, so a
          message is a normal box with a coloured mark rather than a coloured box. And
          {' '}
          <strong style={{ color: 'var(--text)' }}>the edge dropped from 32% to 20%</strong>.
          That number matters: at 32% a red edge landed on #5d2c2f, brighter than any grey
          edge anywhere in the app (the loudest is #2d2d31). At 20% it lands at about that
          weight while staying clearly red.
        </div>
        <div style={{ ...S.note, borderTop: '1px solid var(--line-inset)' }}>
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>What I did not do, and why: </strong>
          shadcn colours the words — its error title, sentence, links and bullets are all
          red. Ours keeps them plain, because your own rule says colour belongs on the icon
          and the edge and nowhere else, and a red sentence in a message bar would read
          like a losing number in a table. The icon also stays at full strength: it is one
          16px mark carrying the whole signal, and dimming it turns &ldquo;quieter&rdquo;
          into &ldquo;easier to miss&rdquo;. If you want the shadcn treatment instead, say
          so — it is a change to a locked rule, so it needs to be a decision rather than a
          nudge.
        </div>
      </div>

      <Spec
        name="Loading, waiting, progress"
        approved="8 Sep 2026"
        file="primitives/skeleton.jsx · spinner.js · progress.jsx"
        ask={
          'whether these three feel like one family. They are the same sentence said three '
          + 'ways — a placeholder for a region that has not loaded, a spinner for an action '
          + 'in flight, a bar for a job with a known end — so they should share a weight '
          + 'and a grey. Specifically: is the placeholder pulse too fast or too slow, is '
          + 'the spinner the right size next to button text, and is the empty progress bar '
          + 'visible enough to read as "nothing yet" rather than as a gap?'
        }
        states={[{ label: 'All three, side by side', render: <LoadingFamily /> }]}
      />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>Before you sign off the spinner</span>
          <span style={S.mono}>primitives/spinner.js</span>
          <span style={{ flex: 1 }} />
          <Tag>no call sites</Tag>
        </div>
        <div style={S.note}>
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Nothing in the app renders it. </strong>
          Not one screen — I checked every file. Buttons that are working show their own
          text (&ldquo;Connecting…&rdquo;), and regions that are loading use the
          placeholder. So you would be approving how something looks before anything uses
          it, which is the opposite of the problem this page was built for. It is still
          worth approving — it costs nothing and the moment a button needs one we should
          not be inventing it — but the specimen beside a button above is the only place it
          has ever appeared.
        </div>
      </div>
      </Folded>

      <Folded
        title="Batch 2 — Form controls"
        tag={<Tag tone="ok">🔒 locked 7 Sep 2026</Tag>}
        hint={(
          <>
            all seven signed off · new screens may use them · Batch 3 is next
          </>
        )}
      >
      {/* ================================================================ BATCH 2 === */}

      <FormGeometry />
      <FormStates />
      <SelectParity />

      <Spec
        name="Field, label and help text"
        approved="7 Sep 2026"
        file="primitives/field.jsx · label.jsx"
        ask={
          'whether the label is the right size and brightness against the value typed '
          + 'under it — the label should be readable without competing with the answer. '
          + 'Then the gap between the label and its box, and between one field and the '
          + 'next. Two components are drawn here on purpose: the plain label on the left '
          + 'is what a bare control uses, the Field on the right is what every form in '
          + 'the app actually uses. They should not look like two different systems.'
        }
        states={[{ label: 'The two labels, side by side', render: <LabelPair /> }]}
        contextLabel="the Add Account form — the real layout, field for field"
        context={<FormInContext />}
      />

      <Spec
        name="Consent tick box"
        approved="7 Sep 2026"
        file="primitives/consent-field.jsx"
        ask={
          'whether it is obvious that you have to tick it. This is the one control in the '
          + 'batch with a consequence: until it is ticked the button underneath will not '
          + 'submit, and the box is a 16px square against a three-line sentence. Check '
          + 'that the box lines up with the FIRST line rather than floating in the middle '
          + 'of the paragraph, that the sentence does not read as a heading, and that '
          + 'clicking anywhere in the sentence ticks it.'
        }
        states={[{ label: 'The credential step', render: <ConsentSpecimen /> }]}
      />

      <OpenQuestions />
      </Folded>

      <Folded
        title="Batch 1 — Overlays"
        tag={<Tag tone="ok">🔒 locked 7 Sep 2026</Tag>}
        hint={(
          <>
            all four signed off · new screens may use them · kept below for comparison
          </>
        )}
      >
      {/* ================================================================ BATCH 1 === */}

      <DropdownParity />
      <VariantMatrix />
      <DialogParity />
      <PaletteReference />
      <PresetComparison />

      <Spec
        name="Dropdown menu"
        approved="7 Sep 2026"
        file="primitives/menu.jsx"
        ask={
          'row height and the gap between rows; how much the highlighted row stands out; '
          + 'whether the group headings read as headings or as disabled items; where the '
          + 'tick sits on a checkbox row; whether the delete row is distinct enough without '
          + 'being alarming; and what the panel does when a label is too long to fit. '
          + 'Judge the PANEL here, not the button that opens it — the two rows use '
          + 'different triggers on purpose: a solid secondary button above, so the panel '
          + 'has something definite to hang off, and the top bar’s own chrome capsule '
          + 'below, which is borderless at rest by design.'
        }
        states={[
          { label: 'Simple list', render: menu.simple },
          { label: 'Groups, tick rows, destructive', render: menu.full },
          { label: 'Long labels · icon trigger', render: menu.longLabels },
        ]}
        contextLabel="a table toolbar — chrome + pill at sm, the real vocabulary from FilterBar.jsx"
        context={(
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 12px', borderRadius: 12,
            border: '1px solid var(--line)', background: 'var(--surface)',
          }}
          >
            <Button variant="chrome" size="sm" pill>
              <Filter aria-hidden="true" />
              <ButtonLabel>Filters</ButtonLabel>
            </Button>
            <Button variant="chrome" size="sm" pill><ButtonLabel>This month</ButtonLabel></Button>
            {menu.toolbar}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>412 trades</span>
          </div>
        )}
      />

      <Spec
        name="Modal"
        approved="7 Sep 2026"
        file="primitives/modal.jsx"
        ask={
          'how dark the background behind it goes; the width for a short message like this '
          + 'one; the space around the text; and whether the two buttons at the bottom are '
          + 'clearly different from each other.'
        }
        states={[{ label: 'A confirmation', render: <ModalSpecimen /> }]}
      />

      <Spec
        name="Popover"
        approved="7 Sep 2026"
        file="primitives/popover.jsx"
        ask={
          'whether it reads as a different kind of thing from the dropdown above — it '
          + 'should, because you change things in a popover and pick things in a menu. If '
          + 'the two look identical, one of them is wrong.'
        }
        states={[{ label: 'Settings panel', render: <PopoverSpecimen /> }]}
      />

      <div style={{ ...S.card, background: 'var(--surface-sunken)' }}>
        <div style={S.cardHead}>
          <span style={S.cardName}>Dialog</span>
          <span style={S.mono}>primitives/dialog.jsx</span>
          <span style={{ flex: 1 }} />
          <Tag tone="ok">approved 7 Sep 2026 — with Modal</Tag>
        </div>
        <div style={S.note}>
          Dialog is the layer <em>underneath</em> Modal — every one of the app’s 11 modals is
          a Modal, and Modal is built on Dialog. There is nothing to look at separately: what
          you approve on the Modal above is what Dialog renders. It gets locked with Modal.
        </div>
      </div>
      </Folded>

    </div>
  );
}
