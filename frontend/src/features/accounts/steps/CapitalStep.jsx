import React, { useState } from 'react';
import { Building2, Wallet } from 'lucide-react';
import {
  Button, ChoiceCard, ChoiceGrid, WizardActions, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';

/* The first question, and the one the whole `capital_kind` column exists to ask.
 *
 * WHY THE COPY WORKS THIS HARD. Getting this wrong hands a trader an invented
 * 5% / 10% / 8% challenge — mt5_accounts COALESCEs those defaults, so a live account
 * filed as prop is scored against GoatFundedTrader's rules and every drawdown reads
 * against a limit nobody set. Migration 0026's own header says as much. So each card
 * names what we will DO with the answer rather than restating the label.
 *
 * SELECT, THEN CONTINUE — owner decision 2026-08-25, from the reference layout, and
 * it reverses this file's original "choosing advances in one action". The reason to
 * spend the extra click is that this answer is not a preference, it is the branch:
 * picking prop adds two pages and puts the account under a firm's drawdown rules.
 * Advancing on the first card the pointer lands on gives that no moment of review,
 * and the answer is only re-choosable until the commit. A selected card that stays on
 * screen with the question above it is what makes the choice legible before it is
 * taken.
 *
 * THE KINDS ARE DATA, not two hand-written handlers. Migration 0026's CHECK is
 * `capital_kind IN ('prop','live')` and those are the only two values that exist; a
 * third card would 400 at provision after the user had answered eight more questions.
 * Written as a list, the set is one literal a test can read — and the branch that
 * patches and advances is written once instead of twice.
 *
 * WHY THERE ARE TWO CARDS AND NOT THE REFERENCE'S THREE. The reference offers a third
 * option, "Both", because it is asking about the TRADER. This page asks about the one
 * account it is creating, and an account's money is the firm's or it is yours — there
 * is no third value for the column to hold, and a trader who does both answers this
 * page twice, once per account.
 */
const KINDS = [
  {
    capital_kind: 'prop',
    icon: Building2,
    title: 'Prop Firm',
    description: "",
  },
  {
    capital_kind: 'live',
    icon: Wallet,
    title: 'Live Capital',
    description: '',
  },
];

export default function CapitalStep() {
  const { draft, patch, advance } = useFlow();
  /* Seeded from the draft so Back lands on the answer that is already stored, rather
   * than on an empty step that would let Continue re-ask a question the draft has
   * answered. Local state, not the draft, because nothing else on this step depends on
   * the choice — patching per click would run the invalidation cascade (which clears
   * the firm, the product and every rule) on the way past a card the user only paused
   * on. */
  const [chosen, setChosen] = useState(draft.capital_kind);

  /* patch() returns the new draft and it is handed to advance(), because THIS choice
   * decides the branch: the pre-patch draft has no capital_kind, so its next step is
   * the live path's `account`. It used to navigate there and get bounced back to `firm`
   * by the shell's guard — the right destination by way of a wrong one. */
  const onContinue = () => advance(patch({ capital_kind: chosen }));

  return (
    <>
      {/* NO DESCRIPTION UNDER THE TITLE, across every question page (owner decision
          2026-08-25). What stood here explained what the answer decides; the two cards
          below already say what we DO with each answer, which is the same fact in the
          place the user is looking. */}
      <WizardHeading align="center" eyebrow="Add Account" title="Whose money are you trading?" />
      <ChoiceGrid>
        {KINDS.map(({ capital_kind, icon: Icon, title, description }) => (
          <ChoiceCard
            key={capital_kind}
            align="center"
            icon={<Icon aria-hidden="true" />}
            title={title}
            description={description}
            selected={chosen === capital_kind}
            onClick={() => setChosen(capital_kind)}
          />
        ))}
      </ChoiceGrid>
      <WizardActions>
        {/* Disabled until something is chosen, rather than hidden: a button that
            appears once a card is picked moves the row under it, and the user has to
            find the control again after every change of mind. */}
        <Button variant="primary" size="lg" block onClick={onContinue} disabled={!chosen}>
          Continue
        </Button>
      </WizardActions>
    </>
  );
}
