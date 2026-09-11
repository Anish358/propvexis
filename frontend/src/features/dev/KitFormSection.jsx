/* KitFormSection — the Cycle 00 review specimens for the form section. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`), piece 5. The specimen is the REAL form:
 * AddTradeModal's eleven fields, in its real order, rebuilt on the new parts — because
 * the thing being judged is a grid of controls at a real density, and eleven fields of
 * lorem would answer a different question (brief §5).
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING. The two
 * bugs the suite caught in the drawer specimen on 09-10 were both this.
 */
import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Alert, AlertDescription, Button,
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
  DatePicker, Field, FieldDescription, FieldLabel,
  FormFooter, FormGrid, FormSection, FormWide,
  Input, Select, SelectItem, SelectPopup, SelectTrigger, SelectValue,
} from '@/components/primitives';

/* THE SCAFFOLD'S OWN LOOK, copied from KitDrawer so the five pieces read as one page. */
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
  row: { display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' },
  cell: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 150 },
  label: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500,
  },
  /* THE MODAL'S REAL WIDTH. `modal.jsx`'s shell is `max-w-md`, and a form judged at the
   * page's full 1080px would be judged at a width it never gets. */
  modalWidth: { maxWidth: 448, width: '100%' },
};

const INITIAL_DATE = new Date('2026-09-08T00:00:00');
const SESSIONS = ['', 'London', 'New York', 'Asia'];
const SETUPS = ['', 'Break & Retest', 'Liquidity Grab', 'Range Fade'];

/* THE INSTRUMENT LIST — real ones, with the broker suffixes this app actually stores.
 * `symbol_base` is what a trader reads ("XAUUSD") and `symbol` is what MT5 sends
 * ("XAUUSD.pro"); the Trade Log shows both, and the drawer has a "Broker Symbol" row for
 * exactly that reason. Short here because it is a specimen — the real list is whatever
 * the connected account has traded, which for a prop trader is dozens and for a broker
 * feed is hundreds. That length is the whole argument for typing. */
const SYMBOLS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD', 'USDCAD', 'EURJPY',
  'NZDUSD', 'USDCHF', 'EURGBP', 'US30', 'NAS100', 'SPX500', 'GER40', 'UK100',
  'XAGUSD', 'USOIL', 'BTCUSD', 'ETHUSD',
];

/* ══════════════════════════════════════════════ 1 · THE REAL FORM, AT THE REAL WIDTH ═
 *
 * ADD TRADE, REBUILT. Eleven fields in the shipped order, the wide comments row, the
 * error line and the actions — §2 keeps the structure exactly where it is; what changes
 * is that none of it is a bare element selector any more.
 *
 * The switches below it drive the footer, which is the half of this piece that is
 * actually new. They are review apparatus and they go on sign-off.
 */
export function FormSpecimen() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [date, setDate] = useState(INITIAL_DATE);
  /* THE SYMBOL IS AN OPEN VALUE (owner ruling, 2026-09-10), AND IT TAKES TWO PIECES OF
   * STATE RATHER THAN ONE. Base UI's Combobox keeps the SELECTED item (`value`) and the
   * TYPED text (`inputValue`) apart, and by default text matching nothing selects
   * nothing — so a combobox left alone is effectively a CLOSED list whatever the
   * placeholder implies. "Open" is wiring, not a flag: both are bound to one string, so
   * whatever is in the box when you submit is the symbol. */
  const [symbol, setSymbol] = useState('XAUUSD');
  /* DIRTY IS DERIVED, NOT TOGGLED (owner ruling, 2026-09-10: Save greys out until
   * something changes). It was a switch while the question was open; a switch that
   * outlives its question is how one component ends up able to look like two, so it is
   * gone and this compares against the values the form opened with — which is exactly
   * what a migrated dialog will have to do. */
  const dirty = symbol !== 'XAUUSD' || date?.toISOString() !== INITIAL_DATE.toISOString();

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>Add trade, rebuilt on the new parts</span>
        <span style={F.mono}>primitives/form-section.jsx · at the modal&rsquo;s real 448px</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          the switches drive the footer
        </span>
      </div>

      <div style={{ ...F.pane, display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <div style={F.modalWidth}>
          <FormSection title="Trade details">
            <FormGrid>
              <FormWide>
                <Field>
                  <FieldLabel>Account</FieldLabel>
                  <Select defaultValue="8891204">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="8891204">FTMO 100k — Phase 2</SelectItem>
                      <SelectItem value="7714003">Personal — Live</SelectItem>
                    </SelectPopup>
                  </Select>
                </Field>
              </FormWide>

              <Field>
                <FieldLabel>Date</FieldLabel>
                {/* WAS `<input type="date">` (owner, 2026-09-10: "for this calendar take
                  * it from shadcn"). That rendered the BROWSER's calendar — Chrome's
                  * colours, Chrome's Clear/Today links, a blue selection — the one
                  * control on the page our stylesheet could not reach at all. */}
                <DatePicker value={date} onValueChange={setDate} />
              </Field>
              <Field>
                <FieldLabel>Result (R)</FieldLabel>
                <Input type="number" step="0.01" placeholder="e.g. 2 or -1" />
              </Field>

              <Field>
                <FieldLabel>P&amp;L ($)</FieldLabel>
                <Input type="number" step="0.01" placeholder="optional" />
              </Field>
              <Field>
                <FieldLabel>Symbol</FieldLabel>
                {/* THE ONE FIELD THAT TAKES A COMBOBOX (owner, 2026-09-10). It ships
                  * today as `<input placeholder="EURUSD">` — free text, no validation,
                  * accepts `EURSUD` silently. Session and Direction next to it stay on
                  * Select: a search box over three options is furniture. The rule is
                  * that a Select becomes a Combobox when the list outgrows the EYE. */}
                <Combobox
                  items={SYMBOLS}
                  value={symbol}
                  onValueChange={(v) => setSymbol(v ?? '')}
                  inputValue={symbol}
                  onInputValueChange={setSymbol}
                >
                  <ComboboxInput placeholder="Type to search…" />
                  <ComboboxContent>
                    {/* THE EMPTY STATE SAYS THE LIST IS OPEN. A bare "No matches" reads
                      * as a dead end and is why an open combobox gets mistaken for a
                      * closed one — the control looks identical either way. */}
                    <ComboboxEmpty>
                      Not in your instruments — it will be saved as typed.
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>

              <Field>
                <FieldLabel>Direction</FieldLabel>
                <Select defaultValue="buy">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Strategy</FieldLabel>
                <Select defaultValue="Break & Retest">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    {SETUPS.map((s) => (
                      <SelectItem key={s || 'none'} value={s}>{s || '—'}</SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>

              <Field>
                <FieldLabel>Session</FieldLabel>
                <Select defaultValue="London">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    {SESSIONS.map((s) => (
                      <SelectItem key={s || 'none'} value={s}>{s || '—'}</SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>SL size (pips)</FieldLabel>
                <Input type="number" step="0.1" placeholder="optional" />
              </Field>

              <FormWide>
                <Field>
                  <FieldLabel>Comments</FieldLabel>
                  <Input placeholder="optional" />
                  <FieldDescription>
                    What you saw, and what you would do again.
                  </FieldDescription>
                </Field>
              </FormWide>

              {error && (
                <FormWide>
                  {/* THE FORM-LEVEL ERROR IS `alert.jsx`, NOT A NEW PART. It is approved
                    * (Batch 3) and §17's tone ladder is already in it. What ships today
                    * is `.login-error`, a legacy class borrowed from the LOGIN page by a
                    * trade modal — which is how one rule ends up styling two unrelated
                    * screens and neither can change. `FieldError` is the other kind: it
                    * belongs to ONE control, not to the submit. */}
                  <Alert variant="error">
                    <AlertDescription>
                      A trade with this ticket already exists on FTMO 100k.
                    </AlertDescription>
                  </Alert>
                </FormWide>
              )}

              <FormWide>
                <FormFooter
                  onCancel={() => {}}
                  submitLabel="Add trade"
                  pendingLabel="Adding…"
                  pending={pending}
                  dirty={dirty}
                />
              </FormWide>
            </FormGrid>
          </FormSection>
        </div>

        <div style={{ ...F.cell, gap: 16 }}>
          <div style={F.cell}>
            <span style={F.label}>Footer states</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                size="sm"
                variant={pending ? 'primary' : 'secondary'}
                onClick={() => setPending((v) => !v)}
              >
                {pending ? 'Saving…' : 'Pending'}
              </Button>
              <Button
                size="sm"
                variant={error ? 'primary' : 'secondary'}
                onClick={() => setError((v) => !v)}
              >
                Error
              </Button>
            </div>
          </div>
          <div style={{ ...F.mono, maxWidth: 260, lineHeight: '18px' }}>
            Save starts GREY and turns live the moment you change the date or the symbol
            — your ruling, 10 Sep. It is derived from the values the form opened with,
            which is what every migrated dialog will have to do.
          </div>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>That is the real Add Trade form. </strong>
        Same eleven fields, same order, same wide comments row (§2 — a visual pass does
        not move structure). What changed is underneath: every control was a
        {' '}
        <strong style={F.strong}>bare element selector</strong>
        {' '}
        —
        {' '}
        <code style={F.mono}>.modal input</code>
        ,
        {' '}
        <code style={F.mono}>.modal select</code>
        ,
        {' '}
        <code style={F.mono}>.at-form label</code>
        {' '}
        — wrapped in a
        {' '}
        <code style={F.mono}>&lt;label&gt;</code>
        {' '}
        with the control nested inside it. Now each is a
        {' '}
        <code style={F.mono}>Field</code>
        , which was signed off in Batch 2 and wires the label, the description and the
        control&rsquo;s
        {' '}
        <code style={F.mono}>aria-describedby</code>
        {' '}
        together, and the group is a real
        {' '}
        <code style={F.mono}>&lt;fieldset&gt;</code>
        {' '}
        with a real
        {' '}
        <code style={F.mono}>&lt;legend&gt;</code>
        .
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ 1b · THE FOOTER, WHICH IS THE NEW PART ═
 *
 * FOUR STATES SIDE BY SIDE, because they are the deliverable. §4.3 asked for the footer
 * AND its disabled/dirty states, and the footer itself is nine lines of flexbox every
 * dialog already gets free — what it is worth building is the RULE about when Save can
 * be pressed, which nine modals currently each decide alone.
 *
 * The fourth shows the `leading` slot. `.modal footer .footer-spacer` and
 * `.modal button.danger` exist because some dialogs carry a destructive action, and it
 * belongs hard left, as far from Save as the row allows.
 */
export function FormFooterStates() {
  const states = [
    ['Ready', { submitLabel: 'Save changes' }],
    ['Pending', { submitLabel: 'Save changes', pendingLabel: 'Saving…', pending: true }],
    ['Clean — nothing to save', { submitLabel: 'Save changes', dirty: false }],
  ];
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>The footer, and the states it owns</span>
        <span style={F.mono}>FormFooter</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Cancel goes dead while a save is in flight — on purpose
        </span>
      </div>

      <div style={{ ...F.pane, display: 'grid', gap: 22 }}>
        {states.map(([label, props]) => (
          <div key={label} style={{ display: 'grid', gap: 8 }}>
            <span style={F.label}>{label}</span>
            <div style={F.modalWidth}>
              <FormFooter onCancel={() => {}} {...props} />
            </div>
          </div>
        ))}

        <div style={{ display: 'grid', gap: 8 }}>
          <span style={F.label}>With a destructive action — the `leading` slot</span>
          <div style={F.modalWidth}>
            <FormFooter
              onCancel={() => {}}
              submitLabel="Save changes"
              leading={(
                <Button variant="danger" style={{ display: 'inline-flex', gap: 6 }}>
                  <Trash2 size={14} />
                  Delete
                </Button>
              )}
            />
          </div>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>Two behaviours here are decisions, not defaults. </strong>
        <b style={F.strong}>Cancel is disabled while pending</b>
        {' — the request is in flight and cannot be recalled, so a live Cancel closes the '}
        dialog over a write that still lands. The nine shipped modals leave it enabled;
        nobody has hit it because the requests are fast.
        {' '}
        <b style={F.strong}>The spinner is the one signed off on 8 Sep</b>
        {' with no call sites at all — its approval note says it exists "so that the first '}
        button that needs one is not inventing it". This is that button.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════ 2 · WHAT DIES WHEN THE MODALS MIGRATE ═ */
export function FormLegacy() {
  const rules = [
    ['.modal input, .modal select, .modal textarea', 'every control in every dialog'],
    ['.modal input:focus, .modal select:focus', 'and their focus ring'],
    ['.modal input:disabled', 'and the disabled one'],
    ['.modal header, .modal h2', 'the dialog’s own heading'],
    ['.modal footer', 'the actions row'],
    ['.modal button.primary', 'submit'],
    ['.modal button.secondary', 'cancel'],
    ['.modal button.danger', 'the destructive one'],
    ['.modal button.danger-link', 'and its quiet form'],
    ['.modal button:disabled', 'the state the footer now owns'],
    ['.modal footer .footer-spacer', 'the `leading` slot'],
    ['.field-row, .field-row label, label.full', 'the two-across layout'],
    ['.at-form, .at-wide, .at-actions, .at-cancel', 'Add Trade’s own copy of all of it'],
  ];
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>The rules this piece exists to delete</span>
        <span style={F.mono}>styles/legacy/app.css</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          they go with the screens, not with this component
        </span>
      </div>

      <div style={F.pane}>
        <div style={{ display: 'grid', gap: 6 }}>
          {rules.map(([sel, what]) => (
            <div key={sel} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <code style={{ ...F.mono, minWidth: 330, color: 'var(--text-2)' }}>{sel}</code>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{what}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>The form layer of this app is a set of bare element
        selectors scoped to a dialog. </strong>
        That is why it never showed up as a
        {' '}
        <code style={F.mono}>.form-*</code>
        {' '}
        family in the audit, and why
        {' '}
        <code style={F.mono}>modal.jsx</code>
        {' '}
        had to KEEP the class
        {' '}
        <code style={F.mono}>modal</code>
        {' '}
        when the shell was migrated in Phase 4b: nineteen content rules still hang off
        it, and dropping the class would have unstyled the inside of all thirteen
        dialogs at once. This piece is what lets them go — one dialog at a time, each
        deleting its own rules and their names in
        {' '}
        <code style={F.mono}>legacy-classes.txt</code>
        {' '}
        in the same commit.
        <br />
        <br />
        <strong style={F.strong}>Nothing is migrated yet. </strong>
        All nine modals still ship exactly as they are.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ 3 · WHAT IS STILL OPEN ═ */
export function FormQuestions() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>One report, two decisions, one note</span>
        <span style={{ flex: 1 }} />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>⚠ REPORT — the registry&rsquo;s `field` has diverged from
        ours, and we should not follow it. </strong>
        shadcn ships the whole section anatomy
        {' '}
        <code style={F.mono}>FieldSet / FieldLegend / FieldGroup / FieldContent / FieldTitle</code>
        {' '}
        — so by the build order we should have taken it. We must not. The version on disk
        is 78 lines on
        {' '}
        <code style={F.mono}>@base-ui/react/field</code>
        ; the current registry one is 239 lines of plain markup with no Base UI Field in
        it at all. Re-installing would delete the aria wiring that
        {' '}
        <code style={F.mono}>field.jsx</code>
        {' '}
        was approved for, take
        {' '}
        <code style={F.mono}>FieldControl</code>
        {' '}
        and
        {' '}
        <code style={F.mono}>FieldValidity</code>
        {' '}
        with it, change
        {' '}
        <code style={F.mono}>FieldError</code>
        &rsquo;s API, and arrive with the junk
        {' '}
        <code style={F.mono}>cn</code>
        {' '}
        package that clobbered four locked components on 9 Sep.
        {' '}
        <strong style={F.strong}>
          So the section came from @coss instead — Base UI&rsquo;s own Fieldset, the same
          family our Field is already on.
        </strong>
        {' '}
        You are being told because the divergence will only widen, and the next person to
        run
        {' '}
        <code style={F.mono}>shadcn add field</code>
        {' '}
        will regress the form layer without noticing.
        <br />
        <br />
        <strong style={F.strong}>DECIDED 10 Sep — the Symbol list is OPEN, and it offers
        the CLEAN symbol. </strong>
        It suggests instruments and still accepts one you type.
        {' '}
        <strong style={F.strong}>
          A correction worth having: you were told it was already open, and it was not.
        </strong>
        {' '}
        Base UI keeps the SELECTED item and the TYPED text apart, and text matching
        nothing selects nothing — so a combobox left alone is effectively a CLOSED list
        that never says so. Open is two bindings, not a flag, and the empty state now
        says the list is open rather than reading as a dead end. The values are
        {' '}
        <code style={F.mono}>XAUUSD</code>
        {' '}
        rather than
        {' '}
        <code style={F.mono}>XAUUSD.pro</code>
        , which is what the Trade Log column, the drawer heading and every analytics
        grouping already use — the broker string is still stored and still shown.
        <br />
        <br />
        <strong style={F.strong}>DECIDED 10 Sep — Save greys out until something
        changes. </strong>
        Try it: the form opens CLEAN with Save dead, and changing the date or the symbol
        brings it to life. The switch that asked the question is gone, and the state is
        derived from the values the form opened with — which is exactly the work each
        migrated dialog has to do, since no form in the app tracks changes today.
        {' '}
        <strong style={F.strong}>The prop default stays &ldquo;submittable&rdquo;</strong>
        {' '}
        and that is deliberate rather than a hedge: a forgotten
        {' '}
        <code style={F.mono}>dirty</code>
        {' '}
        would otherwise ship a Save button nobody can press. The requirement lives in the
        migration checklist instead of in a default that fails dangerously.
        <br />
        <br />
        <strong style={F.strong}>OLD QUESTION, now closed — is the Symbol list CLOSED or OPEN? </strong>
        You asked for a type-to-search dropdown on Symbol and it is on the form above
        (Session and Direction stay plain Selects — a search box over three options is
        furniture; the rule is that a Select becomes a Combobox when the list outgrows
        the EYE). What that leaves open is a product question, not a visual one: today
        Symbol is
        {' '}
        <code style={F.mono}>&lt;input placeholder=&quot;EURUSD&quot;&gt;</code>
        {' '}
        — free text that accepts
        {' '}
        <code style={F.mono}>EURSUD</code>
        {' '}
        silently. A
        {' '}
        <strong style={F.strong}>closed</strong>
        {' '}
        list only lets you pick instruments the account has actually traded, which kills
        the typo but blocks the first trade on a new pair. An
        {' '}
        <strong style={F.strong}>open</strong>
        {' '}
        one suggests those and still lets you type a new one. It is currently open, which
        matches what ships. Also worth deciding: does the list offer
        {' '}
        <code style={F.mono}>XAUUSD</code>
        {' '}
        or
        {' '}
        <code style={F.mono}>XAUUSD.pro</code>
        {' '}
        — the app stores both, and the drawer has a &ldquo;Broker Symbol&rdquo; row
        because they differ.
        <br />
        <br />
        <strong style={F.strong}>OLD QUESTION, now closed — should Save grey out? </strong>
        No form in this app tracks it: there is no
        {' '}
        <code style={F.mono}>isDirty</code>
        {' '}
        anywhere in the source, and all nine dialogs let you press Save on an untouched
        form. The footer supports it and
        {' '}
        <strong style={F.strong}>defaults to OFF</strong>
        {' '}
        (
        <code style={F.mono}>dirty = true</code>
        {' '}
        means &ldquo;assume submittable&rdquo;), so adopting it changes nothing that
        ships. Turning it on is a per-form decision — a form has to know its initial
        values — and the switch above shows both. Your call whether the migrated dialogs
        take it.
        <br />
        <br />
        <strong style={F.strong}>NOTE — the brief&rsquo;s own call-site list was wrong,
        and it is worth correcting. </strong>
        §4.3 says &ldquo;6 Settings sections, Add Account, and a 10-step wizard&rdquo;.
        The Settings half does not survive contact with the screens: those sections are
        label/value ROWS, not forms. Profile is read-only on purpose, Plan is a summary
        and a link, Appearance writes on change with no Save at all. The real call sites
        are the NINE MODALS, the wizard steps and the three auth pages — which is also
        what identified the legacy layer above.
      </div>
    </div>
  );
}
