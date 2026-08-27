import React, { useMemo, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import {
  Button, ChoiceGrid, ChoiceMark, ChoiceRow, Field, FieldDescription, FieldLabel, Input,
  WizardActions, WizardGroup, WizardHeading, WizardNote, WizardSearch, WizardSectionTitle,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { UNLISTED_FIRM_ID, firmInitials, wizardFirms } from '../../prop/propFirms.js';

/* Which firm the account is with.
 *
 * IT READS wizardFirms(), NEVER PROP_FIRMS. A firm whose every product carries
 * `verified: false` would be a row leading to an empty product page — wizardFirms()
 * drops those, and reaching past it to the raw catalog is how that row comes back.
 *
 * A LIST OF ROWS, NOT A GRID OF CARDS (owner reference layout, 2026-08-25). The label
 * IS the whole answer here: someone looking for FTMO is looking for the word FTMO, and
 * the sentence the old cards carried under each firm ("we know this firm's products, so
 * the rules come pre-filled") said the same thing three times. What it said that was
 * worth keeping is now said once, by the step, where it belongs.
 *
 * THE SEARCH FIELD IS THE OWNER'S CALL, and it overrides this file's previous "NO
 * SEARCH FIELD — the list is three". It stays honest at three: it filters the same rows
 * rather than reaching for anything hidden, and typing a firm we do not carry lands on
 * the one row that can still help, which the note under an empty result names. It earns
 * its keep the moment the catalog grows, and that growth is the point of the layout.
 *
 * THE MARK IS A MONOGRAM BECAUSE WE HAVE NO LOGO ASSETS. The reference shows real
 * broker marks; inventing one for a real firm is not a thing to do in a stylesheet. The
 * geometry is the reference's — a 40px rounded tile, left of the label — and `mark`
 * takes any node, so dropping in real artwork later is one line per firm and no layout
 * change.
 *
 * THE UNLISTED FIRM ASKS FOR ITS NAME BEFORE ADVANCING. firm_name feeds suggestedLabel
 * and every Prop OS display of the account, and "Other / not listed" is useless in
 * both. COMPLETE.firm refuses to pass an unlisted firm without one, so the page agrees
 * with the guard rather than being optimistic and having the guard bounce the user back.
 *
 * ONLY THE ESCAPE HATCH PATCHES firm_name. patchDraft DERIVES it from the catalog for
 * every firm the catalog names — one fact, one writer — so sending our own here would be
 * a second writer that a rename in the catalog would silently disagree with. The
 * unlisted firm is the exception because its name is the user's to type.
 *
 * patchDraft also clears the product, the phase and every rule on a firm change, so
 * switching firms mid-flow needs no handling here.
 */

export default function FirmStep() {
  const { draft, patch, advance } = useFlow();
  const firms = wizardFirms();

  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState(draft.firm_id);
  const [typedName, setTypedName] = useState(() => draft.firm_name || '');

  /* Matches on the name only. The ids are internal ('gft', 'ftmo') and matching them
   * would make a query find a row whose visible text does not contain what was typed. */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return firms;
    return firms.filter((f) => f.name.toLowerCase().includes(q));
  }, [firms, query]);

  const unlisted = chosenId === UNLISTED_FIRM_ID;
  const canContinue = Boolean(chosenId) && (!unlisted || typedName.trim() !== '');

  /* TWO LITERAL CALLS, NOT ONE WITH A TERNARY INSIDE IT. The typed name goes in the SAME
   * patch as the firm id, because patchDraft only preserves it when the two arrive
   * together — a firm_id change with no firm_name clears the name by design. And the
   * calls are written as `patch({ ... })` because two existing tests read this file for
   * exactly that form: a `patch(cond ? {…} : {…})` reads as fine and makes both of them
   * pass vacuously. */
  function onContinue() {
    if (!canContinue) return;
    if (unlisted) {
      advance(patch({ firm_id: UNLISTED_FIRM_ID, firm_name: typedName.trim() }));
      return;
    }
    advance(patch({ firm_id: chosenId }));
  }

  return (
    <>
      <WizardHeading align="center" title="Choose Prop Firm" />

      <WizardGroup>
        <WizardSearch
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing the firm name"
          aria-label="Search prop firms"
        />

        <WizardSectionTitle>Prop Firms</WizardSectionTitle>

        {shown.length > 0 ? (
          <ChoiceGrid layout="rows">
            {shown.map((firm) => (
              <ChoiceRow
                key={firm.id}
                title={firm.name}
                mark={(
                  <ChoiceMark>
                    {firm.id === UNLISTED_FIRM_ID
                      ? <PlusIcon aria-hidden="true" />
                      : firmInitials(firm.name)}
                  </ChoiceMark>
                )}
                selected={chosenId === firm.id}
                onClick={() => setChosenId(firm.id)}
              />
            ))}
          </ChoiceGrid>
        ) : (
          /* Not an EmptyState block: the list is still on the page one keystroke away,
             so this is a sentence about the query, not a state the page is in. It names
             the way forward rather than only reporting the miss. */
          <WizardNote>
            No firm here matches “{query.trim()}”. Clear the search and choose
            “{firms.find((f) => f.id === UNLISTED_FIRM_ID)?.name}” to enter its rules
            yourself — nothing is assumed.
          </WizardNote>
        )}

        {unlisted ? (
          <Field>
            <FieldLabel htmlFor="naf-firm-name">Firm name</FieldLabel>
            <Input
              id="naf-firm-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              // Enter submits, because Continue is the step's only action and a single
              // text field that ignores Enter reads as broken.
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onContinue(); } }}
              placeholder="FundedNext"
              autoFocus
              autoComplete="off"
              maxLength={80}
            />
          </Field>
        ) : null}
      </WizardGroup>

      <WizardActions stretch>
        <Button variant="primary" size="lg" block onClick={onContinue} disabled={!canContinue}>
          Continue
        </Button>
      </WizardActions>
    </>
  );
}
