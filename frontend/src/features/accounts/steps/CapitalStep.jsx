import React from 'react';
import { Building2, Wallet } from 'lucide-react';
import { ChoiceGrid, ChoiceCard, WizardHeading } from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';

/* The first question, and the one the whole `capital_kind` column exists to ask.
 *
 * WHY THE COPY WORKS THIS HARD. Getting this wrong hands a trader an invented
 * 5% / 10% / 8% challenge — mt5_accounts COALESCEs those defaults, so a live account
 * filed as prop is scored against GoatFundedTrader's rules and every drawdown reads
 * against a limit nobody set. Migration 0026's own header says as much. So each card
 * names what we will DO with the answer rather than restating the label.
 *
 * Choosing advances in one action: there is nothing else on this step to fill in, and
 * a Continue button under a two-card question is a second click for no decision. It
 * stays re-choosable — Back works until commit, and patchDraft clears the other
 * branch's answers on the way through, so no warning copy is needed.
 *
 * THE KINDS ARE DATA, not two hand-written handlers. Migration 0026's CHECK is
 * `capital_kind IN ('prop','live')` and those are the only two values that exist; a
 * third card would 400 at provision after the user had answered eight more questions.
 * Written as a list, the set is one literal a test can read — and the branch that
 * patches and advances is written once instead of twice.
 */
const KINDS = [
  {
    capital_kind: 'prop',
    icon: Building2,
    title: 'Prop Firm',
    description: "An evaluation or funded account with a firm's money. We track the drawdown limits, the profit target and the payouts.",
  },
  {
    capital_kind: 'live',
    icon: Wallet,
    title: 'Live Capital',
    description: 'Your own money, at your own broker. Journalled and analysed, with no challenge rules applied.',
  },
];

export default function CapitalStep() {
  const { patch, advance } = useFlow();

  return (
    <>
      <WizardHeading
        title="Whose money are you trading?"
        description="This decides which rules we apply. A prop account is scored against its firm's drawdown limits and profit target; a live account is not scored at all."
      />
      <ChoiceGrid>
        {KINDS.map(({ capital_kind, icon: Icon, title, description }) => (
          <ChoiceCard
            key={capital_kind}
            icon={<Icon aria-hidden="true" />}
            title={title}
            description={description}
            onClick={() => { patch({ capital_kind }); advance(); }}
          />
        ))}
      </ChoiceGrid>
    </>
  );
}
