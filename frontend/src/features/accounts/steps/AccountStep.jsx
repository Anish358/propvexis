import React, { useMemo, useState } from 'react';
import { FilePlus2, Layers } from 'lucide-react';
import {
  Badge, Button, ChoiceCard, ChoiceGrid, ChoiceMark, ChoiceRow, Field,
  FieldError, FieldLabel, Input, Select, SelectItem, SelectPopup, SelectTrigger, SelectValue,
  Switch, ToggleGroupExclusive, ToggleGroupItem, WizardActions, WizardFields, WizardForm,
  WizardGroup, WizardHeading, WizardNote, WizardSectionTitle,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { suggestedLabel } from '../newAccountFlow.js';
import {
  ACCOUNT_SIZES, ACCOUNT_TYPES, phasesFor, sizeLabel,
} from '../../prop/propFirms.js';
import { PHASE_LABEL } from '../../prop/propAccounts.js';
import { challengePhases, joinableChallenges } from '../../prop/challengeGroups.js';

/* ONE PAGE FOR THE WHOLE ACCOUNT — type, size, phase, name, then the rules.
 *
 * Owner restructure 2026-08-25: this replaced three separate steps (`product`, `phase`,
 * `name`), which were one question split three ways. Seven pages for a prop account
 * instead of nine, six of them counted.
 *
 * THE LAYOUT IS THE OWNER'S SKETCH, field for field: type · size, then phase · name,
 * then the challenge cost, then an "Account Details" label over daily · max drawdown,
 * target · minimum days, and drawdown type · consistency rule. Two even columns the
 * whole way down, so every label starts on one of two lines rather than wherever its
 * control happens to sit.
 *
 * THE SPLIT BETWEEN THE TWO GROUPS IS WHAT THE ANSWER IS ABOUT, settled over two owner
 * passes on 2026-09-02. Above the heading: what the trader BOUGHT — the type, the size,
 * the phase, the name they call it by, and what it cost. Under it: the RULES the prop
 * engine scores the account against, and nothing else. The cost shipped in Account
 * Details and was moved up for exactly that reason, so a new field belongs on whichever
 * side of that line it answers.
 *
 * DROPDOWNS, NOT CARD GRIDS (owner decision, same pass). The four type cards and three
 * phase cards used ten times the height of a select for the same one-of-N answer, and
 * this page asks nine questions — the grids pushed the drawdowns below the fold, which
 * is where a rule nobody reads gets typed wrong.
 *
 * THE PHASE LIST IS DERIVED FROM THE TYPE. `phasesFor` is the single table: 1 Step has
 * Phase 1 and Funded, 2 Step adds Phase 2, 3 Step adds Phase 3, Instant is funded from
 * the start and has no evaluation at all. Offering every phase for every type would let
 * a trader file a Phase 2 on an Instant account — a challenge that cannot exist — and
 * the phase decides which number the account is scored against.
 *
 * NO PRESETS, BY OWNER DECISION (2026-08-25, second pass). Nothing is resolved from the
 * firm catalog. What that costs is worth writing down rather than discovering:
 *
 *   · A GoatFundedTrader 2-Step trader types 5 / 10 / 8 / 3 by hand, and NOTHING checks
 *     it against the catalog we already have. A typo in a drawdown does not fail loudly
 *     — it mis-scores that account for the length of the challenge.
 *   · `templateToFields` is called from no page at all. It stays tested and stays the
 *     only thing that enforces size membership, so when presets return they should come
 *     back through it rather than by reading phase objects here.
 *
 * account_type IS NEVER WRITTEN HERE. patchDraft derives it from the phase, and this
 * page reads it back only to decide which of the two phase-dependent numbers to ask
 * for. A page patching its own would be a second writer for one fact, and the failure
 * is a funded challenge filed as an evaluation and scored against a target it does not
 * have.
 *
 * A LIVE ACCOUNT SEES ONLY THE NAME. It has no firm, type or phase, and asking it for a
 * drawdown would be asking for a rule nothing scores.
 *
 * ── NEW CHALLENGE, OR THE NEXT PHASE OF ONE? (owner spec 2026-08-27) ────────────────
 *
 * This is now the page's FIRST question, and it is the reason migration 0027 exists. A
 * prop firm does not move an account through its phases: passing Phase 1 gets the
 * trader a BRAND NEW LOGIN for Phase 2. So adding that login has to be able to say
 * "this is a phase of the challenge I am already running", and until now it could not —
 * the Phase 2 account was recorded as an unrelated challenge that happened to start at
 * Phase 2, and Prop OS drew two journeys where there was one.
 *
 * THE LIST IS THIS FIRM'S CHALLENGES ONLY, and page 2 has already asked which firm. A
 * GoatFundedTrader Phase 2 login cannot be a phase of an FTMO challenge, and offering
 * the choice would be offering an error. `joinableChallenges` does the filtering and
 * the ordering: the challenges whose next phase is ready come FIRST, because that is
 * why the trader opened the list.
 *
 * A CHALLENGE THAT CANNOT BE ADDED TO IS STILL SHOWN, disabled, with the reason on it —
 * "Phase 1 is still running." Hiding it would leave the trader looking for a challenge
 * they know they have; a greyed row with no sentence reads as a bug in our app. Same
 * rule §7.5 sets for the gated Auto Sync card, applied to a list.
 *
 * WHAT THE CHALLENGE DICTATES, AND WHAT IT DOES NOT. Type, size and phase come from the
 * challenge and are shown LOCKED: they are properties of the challenge rather than of
 * this phase, and the server enforces the same thing (provisionAccount takes them from
 * the group row, whatever the payload says). The RULES stay the trader's to enter — a
 * firm's Phase 2 drawdowns and target are routinely not its Phase 1 ones, and
 * inheriting them silently is how an account gets scored against the wrong numbers.
 *
 * A FIELD IS LOCKED ONLY WHERE THE CHALLENGE KNOWS THE ANSWER. A challenge created
 * before the fixed taxonomy carries no product_id, and disabling an empty dropdown
 * would leave the trader unable to finish the page at all.
 */

/* The sentinel for "not one of the eight sizes". A value the <select> can hold, because
 * the alternative — inferring custom mode from a size that is not in the list — cannot
 * tell "typing 8000" from "nothing chosen yet". */
const CUSTOM_SIZE = 'custom';

/* The two answers to the page's first question. Data rather than two hand-written
 * cards, for the same reason the capital step's KINDS is: the set is what a test reads,
 * and the handler that patches is written once instead of twice. */
const CHALLENGE_MODES = [
  { id: 'new', icon: FilePlus2, title: 'New challenge' },
  { id: 'existing', icon: Layers, title: 'Existing challenge' },
];

export default function AccountStep() {
  const { draft, patch, advance, accounts, challenges } = useFlow();
  const isProp = draft.capital_kind === 'prop';

  /* Local state, patched to the draft on submit — the whole page works that way, and
   * the capital step's header says why: patching per click would run the invalidation
   * cascade on the way past an option the trader only paused on. Seeded from the draft
   * so Back lands on the answers already stored. */
  const [mode, setMode] = useState(() => draft.challenge_mode || '');
  const [groupId, setGroupId] = useState(() => draft.challenge_group_id ?? null);

  const [productId, setProductId] = useState(() => draft.product_id || '');
  const [phase, setPhase] = useState(() => draft.phase || '');
  const [label, setLabel] = useState(() => draft.label || '');
  const [labelTouched, setLabelTouched] = useState(() => Boolean(draft.label));
  const [ddType, setDdType] = useState(() => draft.dd_type || 'static');
  /* WHAT THE CHALLENGE COST — its own state rather than a sixth key in `rules`, because
   * it is not a rule: nothing scores an account against it, and the four numbers in
   * `rules` are exactly the ones the prop engine judges. It is the price of a purchase,
   * and it leaves this page as a fee rather than as a challenge condition. */
  const [fee, setFee] = useState(() => (draft.challenge_fee == null ? '' : String(draft.challenge_fee)));
  /* IS THERE A CONSISTENCY RULE AT ALL — the toggle in front of the field's label, and
   * a separate answer from the number itself because most prop accounts have no such
   * rule and there is no number that says so. A blank box could not: blank is "I have
   * not typed it yet", and 0 is a cap no profitable account can ever satisfy (the
   * server refuses it for that reason). So absence is the answer, and this boolean is
   * what expresses it.
   *
   * IT DERIVES ITS INITIAL STATE FROM THE DRAFT rather than defaulting to off. Off is
   * the default for a NEW draft because emptyDraft carries null — but a trader who set
   * a cap, walked forward and came back must find their toggle still on. Reading the
   * draft is what makes those two the same rule instead of two. */
  const [consistencyOn, setConsistencyOn] = useState(() => draft.consistency_pct != null);
  const [rules, setRules] = useState(() => {
    const keys = ['daily_dd_pct', 'max_dd_pct', 'profit_target_pct', 'payout_split_pct', 'min_trading_days', 'consistency_pct'];
    return Object.fromEntries(keys.map((k) => [k, draft[k] == null ? '' : String(draft[k])]));
  });

  /* Size is two pieces of state: which row of the dropdown, and the typed number when
   * that row is `custom`. A revived draft whose balance is not one of the eight comes
   * back in custom mode with the number intact. */
  const storedSize = draft.start_balance == null ? '' : String(draft.start_balance);
  const [sizeChoice, setSizeChoice] = useState(() => {
    if (storedSize === '') return '';
    return ACCOUNT_SIZES.includes(Number(storedSize)) ? storedSize : CUSTOM_SIZE;
  });
  const [customSize, setCustomSize] = useState(
    () => (sizeChoice === CUSTOM_SIZE ? storedSize : ''),
  );
  const size = sizeChoice === CUSTOM_SIZE ? customSize : sizeChoice;

  /* THIS FIRM'S CHALLENGES, ordered by whether the trader can act on them. `null` from
   * the shell means the request has not landed yet, and it is drawn as a skeleton rather
   * than as an empty list: "you have no challenges" is a different fact from "we have
   * not asked yet", and the second one talked out of the Existing branch entirely. */
  const loading = challenges == null;
  const options = useMemo(
    () => (isProp && !loading
      ? joinableChallenges(challenges, { firm_id: draft.firm_id, firm_name: draft.firm_name })
      : []),
    [isProp, loading, challenges, draft.firm_id, draft.firm_name],
  );
  const chosen = options.find((o) => o.id === groupId) || null;
  const joining = mode === 'existing' && chosen != null;

  /* BACK-FILLING AN EARLIER PHASE, from a challenge card's rail. The draft carries the
   * phase the trader clicked; the CHALLENGE decides whether it is real, so a stale link
   * or a hand-edited URL falls back to the ordinary invitation rather than filing an
   * account at a phase that already has one. */
  const backfillPhase = joining && chosen.backfillPhases.includes(draft.backfill_phase)
    ? draft.backfill_phase
    : null;

  /* WHAT THE CHALLENGE DECIDES. Read straight off the chosen challenge on every render
   * rather than copied into state, so the locked fields cannot drift from the row they
   * came from — and so switching challenge needs no reset code. `null` for a value the
   * challenge does not carry, which is what leaves that field editable below. */
  const inherited = joining
    ? {
      product_id: chosen.group.product_id ?? null,
      start_balance: chosen.group.start_balance ?? null,
      // The back-fill wins over `addPhase`: the trader named a stop by clicking it, and
      // offering them the far end of the ladder instead would ignore the one instruction
      // they actually gave.
      phase: backfillPhase ?? chosen.addPhase,
    }
    : { product_id: null, start_balance: null, phase: null };

  /* THE EFFECTIVE ANSWERS — what the challenge dictates, else what the trader chose.
   *
   * ONE PAIR OF VALUES FOR THE WHOLE PAGE, and that is the point: `ready`, the suggested
   * name, the phase list and the submitted patch all read these, so a locked field
   * cannot be validated against one value and submitted with another. Writing
   * `joining ? ... : ...` at each of those four sites is how they come to disagree. */
  const effProductId = inherited.product_id ?? productId;
  const effPhase = inherited.phase ?? phase;
  const effSize = inherited.start_balance != null ? String(inherited.start_balance) : size;

  /* Locked where the challenge HAS the answer — not simply "locked when joining". A
   * challenge created before the fixed taxonomy carries no product_id, and a disabled
   * empty dropdown would leave the trader unable to finish the page at all. */
  const locked = {
    type: joining && inherited.product_id != null,
    size: joining && inherited.start_balance != null,
    phase: joining && inherited.phase != null,
  };

  const phases = phasesFor(effProductId);

  /* Suggested from what has been chosen, and it stops the moment the user types —
   * otherwise picking a different size would silently discard their own text. Not a
   * preset: it names the account, it does not decide any rule. */
  const suggestion = useMemo(() => (isProp
    ? suggestedLabel({
      capital_kind: 'prop', firm_id: draft.firm_id, firm_name: draft.firm_name,
      product_id: effProductId, start_balance: effSize === '' ? null : Number(effSize),
      // The phase is appended ONLY when joining, and it is what keeps the suggestion
      // usable: every phase of one challenge shares its firm, type and size, so without
      // it the Phase 2 account is offered the name the Phase 1 account already has —
      // and the duplicate check below then blocks Continue on the wizard's own
      // suggestion. suggestedLabel reads the group id to decide, so it is passed too.
      challenge_group_id: joining ? chosen.id : null, phase: effPhase,
    })
    : ''), [isProp, draft.firm_id, draft.firm_name, effProductId, effSize, joining, chosen, effPhase]);
  const shownLabel = labelTouched ? label : (suggestion || label);

  /* THE NAME HAS TO BE UNIQUE, per the owner's spec. Compared case-insensitively and
   * trimmed against the accounts the user already has, because "FTMO 25K" and "ftmo 25k "
   * in one account switcher are two rows nobody can tell apart.
   *
   * CLIENT-SIDE ONLY, and that is worth stating: nothing in the database or in
   * validateProvision enforces it, so a second tab can still create a duplicate. This
   * blocks the way a user actually gets there. */
  const takenNames = useMemo(
    () => new Set((accounts || []).map((a) => String(a.label ?? '').trim().toLowerCase())),
    [accounts],
  );
  const duplicateName = shownLabel.trim() !== ''
    && takenNames.has(shownLabel.trim().toLowerCase());

  const setRule = (k, v) => setRules((p) => ({ ...p, [k]: v }));
  const fundedPhase = effPhase === 'funded';
  const num = (v) => (String(v).trim() === '' ? null : Number(v));
  const filled = (v) => String(v).trim() !== '' && Number.isFinite(Number(v));

  /* The challenge choice gates the rest of the page, which mirrors isStepComplete's own
   * rule: 'existing' without a challenge is not an answer — it says only that the list
   * was opened, and an account submitted from that state would quietly start a challenge
   * of its own rather than continuing the one on screen. */
  const modeAnswered = mode === 'new' || (mode === 'existing' && chosen != null);

  const ready = shownLabel.trim() !== '' && !duplicateName && (!isProp || (
    modeAnswered
    && effProductId !== '' && effProductId != null && effPhase !== '' && effPhase != null
    && filled(effSize)
    && filled(rules.daily_dd_pct) && filled(rules.max_dd_pct)
    && filled(fundedPhase ? rules.payout_split_pct : rules.profit_target_pct)
    /* A TOGGLE THAT IS ON MUST CARRY A NUMBER. Nothing else on this page has an
       optional-but-declared shape like it: the trader has SAID this account has a
       consistency rule, and letting Continue through on a blank box would send null —
       "no consistency rule" — which is the opposite of what they said. So the switch
       being on makes its own field required, and Continue waits. Turning the switch
       back off releases the gate immediately, which is the way out. */
    && (!consistencyOn || filled(rules.consistency_pct))
  ));

  /* Changing the type can invalidate the phase — picking Instant after Phase 2, or
   * 1 Step after Phase 3 — so the phase is cleared unless the new type still has it.
   * The draft's own cascade does the same thing one layer down (patchDraft clears the
   * phase on a product change); this keeps the FORM from showing a phase the dropdown
   * no longer offers. */
  function chooseType(nextId) {
    setProductId(nextId);
    setPhase((p) => (phasesFor(nextId).includes(p) ? p : ''));
  }

  /* Choosing a challenge does NOT clear the type the trader may already have picked —
   * `productId` is left alone and simply overridden by `inherited` while joining, so
   * changing back to New restores what they had. What the DRAFT carries is settled on
   * submit, from the effective values. */
  function chooseMode(next) {
    setMode(next);
    if (next !== 'existing') setGroupId(null);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!ready) return;
    if (!isProp) { patch({ label: shownLabel.trim() }); advance(); return; }
    patch({
      // The challenge FIRST in the object, because patchDraft's cascade reads
      // `challenge_mode` and the merge that follows must carry the rest of this patch
      // over anything it clears. (The cascade only clears when LEAVING 'existing', so
      // this is order-independent today — pinned by the flow tests rather than relied on
      // by eye.)
      challenge_mode: mode,
      challenge_group_id: mode === 'existing' ? chosen.id : null,
      product_id: effProductId,
      phase: effPhase,
      label: shownLabel.trim(),
      start_balance: num(effSize),
      daily_dd_pct: num(rules.daily_dd_pct),
      max_dd_pct: num(rules.max_dd_pct),
      // Exactly one of the two, decided by the phase — the other is nulled rather than
      // left over from an earlier answer.
      profit_target_pct: fundedPhase ? null : num(rules.profit_target_pct),
      payout_split_pct: fundedPhase ? num(rules.payout_split_pct) : null,
      dd_type: ddType,
      min_trading_days: rules.min_trading_days.trim() === '' ? 0 : num(rules.min_trading_days),
      /* Blank stays NULL — unlike min_trading_days above, which reads a blank field as
       * 0 because "no requirement" is a real rule. A blank cost is not "this challenge
       * was free", it is "I have not said", and the two must not become the same fact:
       * a 0 posts no fee row and would leave the trader believing they had recorded
       * one. `num` is what keeps them apart.
       *
       * NULLED ON THE EXISTING BRANCH, where the field is not rendered at all. Without
       * this, a trader who typed a cost under New and then switched to Existing would
       * submit the number they can no longer see — and the server refuses that pair,
       * so the wizard would fail on its own last page. */
      /* THE TOGGLE IS THE ANSWER, not the box. Off sends null however much is typed in
       * the (disabled) field — a trader who entered 30, thought again and switched the
       * rule off has said this account has no consistency rule, and the number they can
       * no longer edit must not outvote them. `ready` guarantees the other direction:
       * on with a blank box cannot reach here at all. */
      consistency_pct: consistencyOn ? num(rules.consistency_pct) : null,
      challenge_fee: mode === 'new' ? num(fee) : null,
    });
    advance();
  }

  const pct = { type: 'number', inputMode: 'decimal', min: '0', max: '100', step: '0.1' };

  const nameField = (
    <Field>
      <FieldLabel htmlFor="naf-label">Account Name</FieldLabel>
      <Input
        id="naf-label"
        value={shownLabel}
        onChange={(e) => { setLabelTouched(true); setLabel(e.target.value); }}
        placeholder={isProp ? 'FTMO Challenge #1' : 'IC Markets Live'}
        autoComplete="off"
        maxLength={80}
        aria-invalid={duplicateName || undefined}
        autoFocus={!isProp}
      />
      {/* An error, not a hint: it says what is wrong with what is in the field, and it
          is the one piece of prose on this page for exactly that reason. */}
      {duplicateName ? <FieldError>You already have an account with this name.</FieldError> : null}
    </Field>
  );

  if (!isProp) {
    return (
      <>
        <WizardHeading align="center" title="Name the account" />
        <WizardForm onSubmit={onSubmit}>
          {nameField}
          <Button type="submit" variant="primary" disabled={!ready}>Continue</Button>
        </WizardForm>
      </>
    );
  }

  /* One challenge as a card: its name, where it has got to, and the phase this account
   * would become. A card rather than a row, because the state line is the whole reason
   * the trader can tell two challenges apart — and ChoiceRow is one truncated line. */
  const challengeCard = (o) => (
    <ChoiceCard
      key={o.id}
      title={o.name}
      // The phase to add is the ANSWER, so it is the badge — the thing that says what
      // clicking this does. The blocked reason takes its place when there is nothing to
      // add, for the same reason the import step's gate reason replaces its badge: the
      // actionable half of a disabled option is why it is disabled.
      badge={badgeFor(o)}
      /* The blocked reason only stands when there is genuinely nothing to do. A challenge
         mid-evaluation still has old phases to fill in, so refusing it with "Phase 2 is
         still running" would be answering a question the trader did not ask. */
      description={(o.addPhase == null && !o.backfillPhases.length ? o.blockedReason : null)
        ?? phaseSummary(o)}
      selected={groupId === o.id}
      disabled={o.addPhase == null && o.backfillPhases.length === 0}
      onClick={() => setGroupId(o.id)}
    />
  );

  return (
    <>
      <WizardHeading align="center" title="Tell us about the account" />

      {/* THE PAGE'S FIRST QUESTION, above the form it decides the shape of. Rows rather
          than the capital step's icon-tile cards: those are for a step that is nothing
          BUT a question, and this one has nine fields under it — a pair of 8rem cards
          here would push the drawdowns off the screen, which is the same mistake the
          type and phase card grids made before they became dropdowns. */}
      <WizardGroup>
        <ChoiceGrid layout="rows">
          {CHALLENGE_MODES.map(({ id, icon: Icon, title }) => (
            <ChoiceRow
              key={id}
              mark={<ChoiceMark><Icon aria-hidden="true" /></ChoiceMark>}
              title={title}
              selected={mode === id}
              onClick={() => chooseMode(id)}
            />
          ))}
        </ChoiceGrid>

        {mode === 'existing' ? (
          <>
            {/* Three states, drawn as three different things. The in-flight one says so
                in words, because an empty list would read as "you have no challenges" and
                talk the trader out of the branch they just chose.
                A SKELETON WOULD NEED A SIZE, and a size cannot be written here: a
                className in a step file compiles to nothing (tailwind.css scopes @source
                to components/{ui,primitives}). Adding a self-sizing primitive for one
                line of waiting is machinery for nothing, and DESIGN-LANGUAGE §16 leaves
                skeleton fidelity undecided — so a note it is. */}
            {loading ? <WizardNote>Loading your challenges…</WizardNote> : null}
            {!loading && options.length === 0 ? (
              <WizardNote>
                No challenges yet at this firm — choose New challenge to start one.
              </WizardNote>
            ) : null}
            {!loading && options.length > 0 ? (
              <ChoiceGrid>{options.map(challengeCard)}</ChoiceGrid>
            ) : null}
          </>
        ) : null}
      </WizardGroup>

      {/* The form appears once the question above it is answered. Not disabled-but-
          visible: nine fields whose values are about to be dictated by a challenge the
          trader has not picked yet are nine questions asked too early. */}
      {modeAnswered ? (
      <WizardForm onSubmit={onSubmit} stretch>
        {/* Row 1 — Account Type · Account Size.  Row 2 — Select Phase · Set Account Name.
            Row 3 — Challenge Cost, alone, on the New-challenge branch only. */}
        <WizardFields>
          <Field>
            <FieldLabel htmlFor="naf-type">Account Type</FieldLabel>
            {/* Locked to the challenge's own type while joining one — a Phase 2 login of a
                2-Step challenge is not a 3-Step account, and the server takes this from the
                challenge row regardless of what the payload says. Disabled rather than
                hidden, so the trader can SEE what they are inheriting. */}
            <Select
              value={effProductId} onValueChange={chooseType} items={TYPE_LABELS}
              disabled={locked.type}
            >
              <SelectTrigger id="naf-type">
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectPopup>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="naf-size">Account Size</FieldLabel>
            <Select
              value={locked.size ? String(inherited.start_balance) : sizeChoice}
              onValueChange={setSizeChoice} items={SIZE_LABELS} disabled={locked.size}
            >
              <SelectTrigger id="naf-size">
                <SelectValue placeholder="Select account size" />
              </SelectTrigger>
              <SelectPopup>
                {ACCOUNT_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>{sizeLabel(n)}</SelectItem>
                ))}
                {/* A challenge's size need not be one of the eight — it may have been
                    typed into the custom field when the challenge was created. Without an
                    item for it, Base UI's Select would hold a value its list does not
                    contain and the locked trigger would render blank. */}
                {locked.size && !ACCOUNT_SIZES.includes(Number(inherited.start_balance)) ? (
                  <SelectItem value={String(inherited.start_balance)}>
                    {sizeLabel(inherited.start_balance)}
                  </SelectItem>
                ) : null}
                {/* The eight cover what firms usually sell; they also sell 8K and 1M. */}
                <SelectItem value={CUSTOM_SIZE}>Other amount…</SelectItem>
              </SelectPopup>
            </Select>
            {!locked.size && sizeChoice === CUSTOM_SIZE ? (
              <Input
                id="naf-size-custom" type="number" inputMode="decimal" min="0" step="1"
                value={customSize} onChange={(e) => setCustomSize(e.target.value)}
                placeholder="8000" autoFocus aria-label="Account size"
              />
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="naf-phase">Select Phase</FieldLabel>
            {/* Disabled until the type is chosen, because the type is what decides the
                options — an empty dropdown that opens onto nothing reads as broken. */}
            {/* Locked to the phase the challenge is WAITING for: Phase 1 passed means the
                firm has issued a Phase 2 login and nothing else. Offering the dropdown
                here would let a trader file that login as a second Phase 1. */}
            <Select
              value={effPhase} onValueChange={setPhase} items={PHASE_LABEL}
              disabled={locked.phase || phases.length === 0}
            >
              <SelectTrigger id="naf-phase">
                <SelectValue placeholder={phases.length ? 'Select phase' : 'Choose a type first'} />
              </SelectTrigger>
              <SelectPopup>
                {(locked.phase && !phases.includes(effPhase) ? [effPhase] : phases).map((id) => (
                  <SelectItem key={id} value={id}>{PHASE_LABEL[id]}</SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>

          {nameField}

          {/* WHAT THE CHALLENGE COST (owner spec 2026-09-02).
              IN THE GROUP ABOVE "ACCOUNT DETAILS", with the type, the size, the phase
              and the name — moved here by the owner, having first shipped inside Account
              Details. It belongs with those four because it is the same KIND of answer
              they are: what the trader BOUGHT. This firm's 2-Step 50K, starting on
              Phase 2, called this, for this much. Account Details below is now exactly
              the rules the prop engine scores an account against — six of them, three
              even rows — and the one field nothing scores is no longer sitting among
              them under a heading that implies it is.

              ALONE ON ROW 3, which is what a fifth field in a two-column grid costs.
              The alternative was pairing it with the name and moving the phase up, and a
              phase belongs beside the type that decides which phases it may have.

              NEW CHALLENGE ONLY. A phase of an existing challenge was bought when that
              challenge was created; the Phase 2 login a firm issues for passing Phase 1
              is not a second purchase, so asking again is how one challenge comes to be
              counted twice in spend. CONDITIONALLY RENDERED rather than hidden: a
              `hidden` utility written here would compile to nothing (tailwind.css scopes
              @source to components/{ui,primitives}), and even under components it loses
              to an author `display`. §1's second mechanical constraint.

              WHERE THE NUMBER GOES: the server writes it as an account_fees row, so it
              turns up in Prop OS > Finance as spend, in the ROI, in the by-firm
              breakdown and on the transaction timeline, where the trader can also
              delete it.

              NO HELPER LINE UNDER IT, and none under the consistency rule below either
              (owner call 2026-09-02). Both shipped with a FieldDescription — where the
              money goes, and what the cap means — and both are DELETED: two of them put
              a paragraph of prose inside a form that is otherwise labelled boxes, and a
              described field is two lines taller than the one beside it. The labels
              carry their own meaning, so do not reintroduce one — the place to explain a
              rule is the surface that scores it. */}
          {mode === 'new' ? (
            <Field>
              <FieldLabel htmlFor="naf-fee">Challenge Cost ($)</FieldLabel>
              <Input
                id="naf-fee"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          ) : null}
        </WizardFields>

        <WizardSectionTitle>Account Details</WizardSectionTitle>

        <WizardFields>
          <Field>
            {/* step 0.1: real firms use half-percent drawdowns, which is also why
                insertAccountQuery casts these to ::numeric. */}
            <FieldLabel htmlFor="naf-daily-dd">Daily Drawdown (%)</FieldLabel>
            <Input
              id="naf-daily-dd" {...pct} value={rules.daily_dd_pct}
              onChange={(e) => setRule('daily_dd_pct', e.target.value)} placeholder="5"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="naf-max-dd">Max Drawdown (%)</FieldLabel>
            <Input
              id="naf-max-dd" {...pct} value={rules.max_dd_pct}
              onChange={(e) => setRule('max_dd_pct', e.target.value)} placeholder="10"
            />
          </Field>
          {/* One of the two, never both — the phase decides which, and isStepComplete
              enforces exactly that pair. */}
          {fundedPhase ? (
            <Field>
              <FieldLabel htmlFor="naf-split">Payout Split (%)</FieldLabel>
              <Input
                id="naf-split" {...pct} value={rules.payout_split_pct}
                onChange={(e) => setRule('payout_split_pct', e.target.value)} placeholder="80"
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="naf-target">Profit Target (%)</FieldLabel>
              <Input
                id="naf-target" {...pct} value={rules.profit_target_pct}
                onChange={(e) => setRule('profit_target_pct', e.target.value)} placeholder="8"
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="naf-min-days">Minimum Trading Days</FieldLabel>
            <Input
              id="naf-min-days" type="number" inputMode="numeric" min="0" step="1"
              value={rules.min_trading_days}
              onChange={(e) => setRule('min_trading_days', e.target.value)} placeholder="0"
            />
          </Field>
          <Field>
            <FieldLabel>Drawdown Type</FieldLabel>
            {/* Two values, so a segmented control rather than a dropdown: both are
                visible, and the difference decides when a breach is scored. */}
            <ToggleGroupExclusive value={ddType} onValueChange={setDdType}>
              <ToggleGroupItem value="static">Static</ToggleGroupItem>
              <ToggleGroupItem value="trailing">Trailing</ToggleGroupItem>
            </ToggleGroupExclusive>
          </Field>

          {/* THE CONSISTENCY RULE (owner spec 2026-09-02) — the cap on how much of the
              account's total profit may come from its single best trading day. best day
              / total profit <= cap; the firms that run one set 15%-50%, most commonly
              30%, and plenty of firms (FTMO among them) set none.

              A TOGGLE IN FRONT OF THE LABEL, on the registry's own p-field-15
              composition: the Switch is a child of FieldLabel, which is already
              `inline-flex items-center gap-2`, so the control and its title sit on one
              line with no layout written by this page — which matters here, because a
              utility class written in a page compiles to NOTHING (§1). It carries an
              aria-label of its own: FieldLabel's htmlFor names the INPUT, so the switch
              would otherwise be an unnamed control inside someone else's label.

              THE FIELD IS DISABLED UNTIL THE TOGGLE IS ON, per the owner's spec, and
              that is the honest state — a box a trader can type into implies a rule the
              account may not have. Base UI's Field wires the disabled attribute through
              to the label's opacity too, so the whole field reads as inactive rather
              than just the box.

              IT TAKES THE CELL DRAWDOWN TYPE HAD BEEN SHARING WITH THE COST, which
              moves the cost down a row. Deliberate: the five things above are RULES the
              prop engine judges an account against, the cost is a purchase, and a
              seventh field in a two-column grid has to leave one of them alone on the
              last row. Leaving it to the one that is not a rule keeps the rules
              contiguous and puts the section's odd field out at the end, where its own
              comment below already argues it belongs. */}
          <Field>
            <FieldLabel htmlFor="naf-consistency">
              <Switch
                checked={consistencyOn}
                onCheckedChange={setConsistencyOn}
                aria-label="This account has a consistency rule"
              />
              Consistency Rule (%)
            </FieldLabel>
            <Input
              id="naf-consistency" {...pct}
              disabled={!consistencyOn}
              value={rules.consistency_pct}
              onChange={(e) => setRule('consistency_pct', e.target.value)}
              /* NOT PRE-FILLED WITH 30 when the toggle comes on, tempting as that is
                 (30% is the most common cap in the industry). A cap is the number a
                 firm's own rulebook states, and a seeded 30 is a number the trader
                 never read: accept it on a firm that runs 40% and every payout gate
                 this app draws is computed against a rule that does not exist. A
                 placeholder hints at the shape of the answer; only the trader supplies
                 it. */
              placeholder={consistencyOn ? '30' : 'No consistency rule'}
            />
          </Field>

        </WizardFields>

        <WizardActions>
          <Button type="submit" variant="primary" size="lg" block disabled={!ready}>
            Continue
          </Button>
        </WizardActions>
      </WizardForm>
      ) : null}
    </>
  );
}

/* Where a challenge has got to, in one line: the phase, and what became of it.
 *
 * Built from the phases rather than from the group's own columns, because "Phase 1
 * passed" is a fact about an ACCOUNT's challenge row and the group row does not carry
 * it. Only the phases that have an account are named — an empty stage has no state to
 * report, and printing "Phase 2 —" for it would invent one. */
/* What clicking this challenge DOES, as a badge.
 *
 * The login the firm has just issued when there is one — that is the common case and the
 * one the list is sorted around. Otherwise, when the only thing left is old history, the
 * badge says so rather than going blank: a selectable card with no badge beside three
 * that have one reads as a rendering fault. */
function badgeFor(option) {
  if (option.addPhase) return <Badge tone="neutral">{`Add ${PHASE_LABEL[option.addPhase]}`}</Badge>;
  if (option.backfillPhases.length) return <Badge tone="neutral">Add an earlier phase</Badge>;
  return null;
}

function phaseSummary(option) {
  const done = option.phases.filter((p) => p.account);
  if (!done.length) return 'No accounts yet.';
  return done
    .map((p) => `${p.label} ${p.status === 'passed' ? 'passed' : p.status === 'breached' ? 'breached' : 'running'}`)
    .join(' · ');
}

/* value -> label, for the closed trigger. Base UI's Select.Value renders the raw value
 * unless the Root is told the labels, so without these the field would read "2step" and
 * "25000" after being chosen. Built from the same tables the options are, so a label can
 * only be wrong in one place. */
const TYPE_LABELS = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.id, t.label]));
const SIZE_LABELS = {
  ...Object.fromEntries(ACCOUNT_SIZES.map((n) => [String(n), sizeLabel(n)])),
  [CUSTOM_SIZE]: 'Other amount…',
};
