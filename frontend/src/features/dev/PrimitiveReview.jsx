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
import React, { useRef, useState } from 'react';
import { ChevronDown, Filter, MoreHorizontal, Trash2 } from 'lucide-react';
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
import {
  Button, ButtonLabel, Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger, Modal,
  OverlayContainerContext, Popover, PopoverContent,
  PopoverTrigger,
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
        {approved ? <Tag tone="ok">{`approved ${approved}`}</Tag> : <Tag>awaiting sign-off</Tag>}
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

/* THE LIVE RAMP, as a swatch strip. Not a before/after: the ramp settled on 2026-09-07
 * and DESIGN-LANGUAGE §4 carries the rule, so keeping the supersended proposals here
 * would be the accumulating history §21 tells the rulebook not to keep.
 *
 * Every swatch reads the real token, so this card is also a check: if one of these looks
 * wrong, the token is wrong, not the page. */
const RAMP = [
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
];

const OVERLAY = [
  ['FLOATING PANEL', '--surface-2'],
  ['a row highlighted in it', '--overlay-hover'],
  ['its edge', '--overlay-line'],
];

const LINES = [
  ['divider inside a card', '--line-inset'],
  ["a card's edge", '--line'],
  ["a control's edge", '--line-control'],
  ['standard visible border', '--line-strong'],
  ["a chip's edge", '--line-chip'],
  ['selected chip', '--line-selected'],
];

function Swatches({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map(([role, token]) => (
        <div
          key={token}
          style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr 190px',
            alignItems: 'center',
            gap: 12,
            padding: '7px 0',
          }}
        >
          <span style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: `var(${token})`,
            border: '1px solid var(--line-chip)',
          }}
          />
          <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{role}</span>
          <span style={S.mono}>{token}</span>
        </div>
      ))}
    </div>
  );
}

function PaletteReference() {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardName}>Palette — the live ramp</span>
        <span style={S.mono}>tokens.css · DESIGN-LANGUAGE §4</span>
        <span style={{ flex: 1 }} />
        <Tag tone="ok">locked 7 Sep 2026</Tag>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, padding: 18 }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <span style={S.specimenLabel}>Surfaces — the order is the design</span>
          <Swatches rows={RAMP} />
        </div>
        <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <span style={S.specimenLabel}>An overlay is not a card</span>
            <Swatches rows={OVERLAY} />
          </div>
          <div>
            <span style={S.specimenLabel}>Borders — six graded weights</span>
            <Swatches rows={LINES} />
          </div>
        </div>
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
        complaint actually was.
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
 *   edge       --border               oklch(1 0 0 / 10%)          ~#2f2f31 over #18181b
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
const P = {
  panel: '#18181b',
  edge: '#2f2f31',
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
      border: `1px solid ${P.edge}`,
      boxShadow: '0 10px 30px rgba(0,0,0,.5)',
    }}
    >
      <PresetRow icon={ico('M22 7 13.03 12.7a2 2 0 0 1-2.06 0L2 7', <rect x="2" y="4" width="20" height="16" rx="2" />)}>Email</PresetRow>
      <PresetRow icon={ico('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z')}>Message</PresetRow>
      <div style={{ height: 1, background: P.edge, margin: '4px -4px' }} />
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
      border: `1px solid ${P.edge}`,
      boxShadow: '0 10px 30px rgba(0,0,0,.5)',
      fontFamily: 'inherit',
    }}
    >
      <div style={{ padding: '4px 8px', fontSize: 12, color: P.muted }}>My Account</div>
      <PresetRow icon={ico('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', <circle cx="12" cy="7" r="4" />)} shortcut="⇧⌘P">Profile</PresetRow>
      <PresetRow icon={ico('M3 10h18M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z')} shortcut="⌘B">Billing</PresetRow>
      <PresetRow icon={ico('M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z', <circle cx="12" cy="12" r="3" />)} shortcut="⌘S">Settings</PresetRow>

      <div style={{ height: 1, background: P.edge, margin: '4px -4px' }} />

      <div style={{ padding: '4px 8px', fontSize: 12, color: P.muted }}>View</div>
      <PresetRow
        icon={ico('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 3v18')}
        trailing={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={P.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
      >
        Sidebar
      </PresetRow>
      <PresetRow icon={ico('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 15h18')}>Status Bar</PresetRow>

      <div style={{ height: 1, background: P.edge, margin: '4px -4px' }} />

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
          <MenuContent align="start" sideOffset={6}>
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

const MENU_PARITY = [
  ['panel', '#18181b', '--surface-2'],
  ['highlighted row', '#27272a', '--overlay-hover'],
  ['panel edge', '~#2f2f31', '--overlay-line #2f2f33'],
  ['item text', '14px', 'menu.jsx ITEM — our text-sm is 13px'],
  ['label + shortcut', '12px', 'menu.jsx LABEL — our text-xs is 11px'],
  ['muted text', '#a1a1aa', 'menu.jsx LABEL — our muted-foreground is #c9c9d1'],
  ['item radius', '14px', 'menu.jsx ITEM — our --radius-xl is 12px'],
  ['separator', 'visible', 'menu.jsx SEP — bg-border/50 was invisible on a panel'],
  ['destructive', '#ff6467', '--destructive (shipped earlier)'],
  ['submenu edge', '~#2f2f31', 'menu.jsx SUB_SURFACE — it draws a RING, and its readable value sat behind a dead dark: variant'],
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
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Five of these were invisible until measured. </strong>
        The generated item asks for
        {' '}
        <span style={S.mono}>text-sm rounded-xl text-muted-foreground</span>
        {' '}
        — shadcn&rsquo;s own names, which in the preset mean 14px, 14px and #a1a1aa. Our
        bridge repoints all three for the app at large, so the same component rendered
        smaller and brighter here. Fixed in
        {' '}
        <span style={S.mono}>menu.jsx</span>
        {' '}
        rather than the bridge, because changing them globally would re-size and
        re-colour every screen — and you asked for the dropdown only.
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
      {open ? (
        <Modal open onClose={() => setOpen(false)} label="Close account">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 550, color: 'var(--text)' }}>
              Close FTMO-8842291?
            </div>
            <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--text-2)' }}>
              Its 412 trades stay in your history and keep counting toward your all-account
              analytics. You will stop seeing it in the switcher.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              {/* `primary` explicitly: this Button's default variant is `secondary`, so a
                  bare <Button> is an OUTLINE one and the confirm read as plain text. */}
              <Button variant="primary" onClick={() => setOpen(false)}>Close account</Button>
            </div>
          </div>
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
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 550, color: 'var(--text)' }}>
            What to show
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '19px', color: 'var(--text-2)' }}>
            A popover holds controls you change and then dismiss. A menu holds actions
            you pick one of.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------- the page --- */

const LATER_BATCHES = [
  { n: 2, name: 'Form controls', qty: 8, parts: 'input · textarea · select · checkbox · switch · label · field · consent-field' },
  { n: 3, name: 'Feedback', qty: 4, parts: 'alert · skeleton · spinner · progress' },
  { n: 4, name: 'Flows', qty: 2, parts: 'wizard (21 pieces) · toggle-group', dep: 'after Batch 2 — the wizard is built from those controls' },
  { n: 5, name: 'Small pieces', qty: 3, parts: 'avatar · separator · count-badge' },
  { n: 6, name: 'Rebuild first, then review', qty: 4, parts: 'badge · empty-state · loading-block · tabs', dep: 'still on legacy CSS — these get replaced, not adjusted' },
];

export default function PrimitiveReview() {
  const menu = MenuSpecimens();

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>Development only · not visible to customers</div>
      <h1 style={S.h1}>Primitive review</h1>
      <p style={S.lede}>
        Every reusable part waiting for your sign-off, as the real component rather than a
        picture of one. Tell me what looks wrong in your own words — “too tall”, “I can’t
        tell which one is selected” — and I change the component itself. When a whole batch
        looks right, you say <strong style={{ color: 'var(--text)' }}>locked</strong> and
        we move on. Batches are locked together because parts that sit side by side have to
        agree on height, corners and spacing.
        {' '}
        <strong style={{ color: 'var(--text)' }}>11 of 36 approved.</strong>
        {' '}
        The dropdown was the first to clear review, on 7 Sep — and it is the one that made
        this page necessary: it had reached 30 screens while nobody had said whether they
        liked it.
      </p>

      <div style={S.batchHead}>
        <span style={S.batchTitle}>Batch 1 — Overlays</span>
        <Tag tone="open">1 of 4 approved</Tag>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          the dropdown is locked · modal, popover and dialog still need a look
        </span>
      </div>

      <DropdownParity />
      <DialogParity />
      <PaletteReference />

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
          <Tag>locks with Modal</Tag>
        </div>
        <div style={S.note}>
          Dialog is the layer <em>underneath</em> Modal — every one of the app’s 11 modals is
          a Modal, and Modal is built on Dialog. There is nothing to look at separately: what
          you approve on the Modal above is what Dialog renders. It gets locked with Modal.
        </div>
      </div>

      <div style={S.batchHead}>
        <span style={S.batchTitle}>Not open yet</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          in order — each opens when the one before it is locked
        </span>
      </div>

      {LATER_BATCHES.map((b) => (
        <div key={b.n} style={{ ...S.card, marginTop: 10, background: 'var(--surface-sunken)' }}>
          <div style={{ ...S.cardHead, background: 'transparent', borderBottom: 'none', padding: '13px 18px' }}>
            <span style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 13,
              color: 'var(--text-3)', minWidth: 16,
            }}
            >
              {b.n}
            </span>
            <span style={S.cardName}>{b.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{b.qty} parts</span>
            <span style={{ flex: 1 }} />
            <span style={S.mono}>{b.parts}</span>
          </div>
          {b.dep ? (
            <div style={{
              padding: '0 18px 13px 46px', fontSize: 12.5, lineHeight: '19px',
              color: 'var(--text-2)',
            }}
            >
              {b.dep}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
