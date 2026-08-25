import React from 'react';
import { Link } from 'react-router-dom';
import {
  Button, WizardGroup, WizardHeading, WizardRow,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';

/* The account exists. This page says what happens next and gets out of the way.
 *
 * WHAT HAPPENS NEXT IS DIFFERENT PER BRANCH, so the copy is per branch. One sentence
 * covering all four would tell a trader nothing about their own account: a queued
 * first sync, an EA waiting for its first trade, a statement already imported and an
 * empty journal are four different states, and the only useful thing this page can do
 * is name the right one.
 *
 * IT DOES NOT CALL completeOnboarding. Decision B9 moved that to the commit, in the
 * shell: a first-run user who closes the tab after creating an account must not be
 * asked to create a second one at the next login. A second call here would be a
 * redundant request whose failure has no meaning.
 *
 * NO BACK CONTROL. `prevStep` returns null after the commit and `canVisit` refuses a
 * return, so a Back button would be a visible dead control.
 *
 * The voice is the one the old first-run Onboarding used at this moment — "You're all
 * set" — because that copy was written for exactly this screen and Task 12 deletes the
 * page it lived on.
 */
const NEXT = {
  auto_sync: 'We have queued the first sync. Your trades will appear as our terminal reads them — no need to keep anything open.',
  ea: 'Attach the EA and place a trade. The account links itself on the first one, and the setup steps stay available from your accounts list.',
  // Deliberately true whether the statement was imported or skipped. The upload step
  // sets `uploadDone` for BOTH outcomes, and it cannot record which: after the commit
  // `patchDraft` accepts no field but that one, on purpose — everything else fed the
  // INSERT and a changed draft would disagree with a row nothing can reconcile it
  // with. So rather than guess, this names where to go next, which holds either way.
  // A confident "your history is in" would be a lie to anyone who skipped, and
  // "nothing imported yet" a lie to anyone who just imported two hundred trades.
  file: 'Import a statement any time from the trade journal — we detect the columns and skip anything already there.',
  manual: 'Add trades from the trade journal whenever you like, or import a CSV later.',
};

export default function DoneStep() {
  const { draft, finish } = useFlow();
  const method = draft.import_method;
  const next = NEXT[method] ?? NEXT.manual;

  return (
    <>
      <WizardHeading
        title="You're all set"
        description={`${draft.label || 'Your account'} is ready. ${next}`}
      />

      <WizardGroup>
        <WizardRow>
          {/* finish() selects the new account and then navigates, so the dashboard
              lands already scoped to what was just created rather than on the god view
              across every account (spec §8.1). */}
          <Button variant="primary" onClick={finish}>Go to dashboard</Button>
          {method === 'ea' ? (
            <Button variant="ghost" as={Link} to="/settings/accounts">See the EA setup steps</Button>
          ) : null}
        </WizardRow>
      </WizardGroup>
    </>
  );
}
