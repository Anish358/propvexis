import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, AlertDescription, AlertTitle, Button, ChoiceCard, ChoiceGrid, WizardGroup,
  WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { commitStep } from '../newAccountFlow.js';
import { findPlatformCard } from '../platformCatalog.js';
import { autoSyncGate } from '../accountGating.js';

/* How the trades get in — and the only place in the flow where a plan gates anything.
 *
 * GATING HAPPENS HERE, NEVER AT SUBMIT (spec §7.5). The refusal a user can act on is
 * "3 of 3 synced accounts used" on the card in front of them; the refusal they cannot
 * is a 402 that arrives after they have typed a broker password at the end of a
 * nine-step flow. So the gate decides what the card looks like, and provisionGate on
 * the server stays the enforcement that should be unreachable through the UI.
 *
 * IT ASKS autoSyncGate, IT DOES NOT DO PLAN ARITHMETIC. A second copy of the rule
 * here is how the UI comes to disagree with the server — and account-gating.test.js
 * drift-tests that one copy against plans.js, which a copy in this page would escape.
 *
 * GATING IS CURRENTLY OFF. Plan gating was lifted by owner decision on 2026-08-25
 * (see THE POLICY PIN in plans.test.js), so autoSyncGate allows every plan and the
 * disabled-with-a-reason path below is unreachable today. It is kept wired rather than
 * deleted because it is exactly what §7.5 needs the moment caps return, and the pin
 * fails if they come back without it.
 *
 * ONLY AUTO SYNC IS EVER GATED. Manual entry and CSV import are the whole free tier;
 * a gate that caught all three would make the flow uncompletable for a free user.
 * That is why `gated` is a property of the METHODS table rather than a branch — the
 * set of gated methods is data, and a test reads it.
 *
 * THE EA IS NOT A FOURTH CARD, and a future reader will want to add one. Spec §2
 * decision 5 and §7.4 make it a sub-choice UNDER Auto Sync, decided on `connect`,
 * because "attach our EA to your own terminal" and "we run the terminal" are the same
 * answer to this question with different plumbing. A card here would put two doors on
 * one route and leave `connect` unreachable for the EA.
 *
 * THIS STEP IS ALSO THE COMMIT POINT for Manual and File upload (spec §6.2) — they
 * have nothing left to ask. Auto Sync and the EA collect a credential first and commit
 * on `connect`. `commitStep()` decides which, so the branch comes from the tested
 * function rather than from a condition repeated here.
 */
const METHODS = [
  {
    id: 'auto_sync',
    gated: true,
    title: 'Auto Sync',
    description: 'We connect to your account and keep it in sync. Nothing to install, nothing left running.',
  },
  {
    id: 'manual',
    gated: false,
    title: 'Enter trades by hand',
    description: 'Log each trade yourself. You can add a CSV or connect a platform later.',
  },
  {
    id: 'file',
    gated: false,
    title: 'Import a statement',
    description: 'Upload a CSV export from your platform. We detect the columns and skip duplicates.',
  },
];

export default function ImportStep() {
  const { draft, patch, advance, commit, committing, accounts, plan } = useFlow();
  const [err, setErr] = useState(null);

  const gate = autoSyncGate({ plan, accounts });
  const platform = findPlatformCard(draft.platform);

  // A platform can withdraw a method: `other` and MT4 offer file and manual only, and
  // the EA is a .mq5 so Auto Sync is MT5-only. Offering a withdrawn method here sends
  // a payload platformSupports() refuses with a 400.
  const offered = METHODS.filter((m) => platform?.importMethods.includes(m.id));

  async function choose(method) {
    setErr(null);
    const next = patch({ import_method: method });
    if (commitStep(next) === 'import') {
      // `next` is passed explicitly: patch() returns the new draft but this component
      // has not re-rendered, so the payload has to be built from what we just computed
      // rather than from the stale `draft` in scope.
      try {
        await commit({}, next);
      } catch (e) {
        // A failed commit leaves import_method set and account null, which
        // isStepComplete reports as incomplete — so the user stays here and can retry
        // against the SAME provision_key, which is what that column is for.
        setErr(e.message);
        return;
      }
    }
    advance();
  }

  return (
    <>
      <WizardHeading
        title="How should we get your trades?"
        description="You can change this later, and you are not locked out of the others — this is just where we start."
      />

      <WizardGroup>
        {err ? (
          <Alert variant="error">
            <AlertTitle>We could not create the account</AlertTitle>
            <AlertDescription>
              {err} If that keeps happening, something changed on our side — try again,
              or pick another way in.
            </AlertDescription>
          </Alert>
        ) : null}

        <ChoiceGrid>
          {offered.map((m) => {
            const blocked = m.gated && !gate.allowed;
            return (
              <ChoiceCard
                key={m.id}
                title={m.title}
                // The reason REPLACES the description when blocked, rather than sitting
                // under it: a card that says both what it does and why you cannot have
                // it buries the actionable half.
                description={blocked ? gate.reason : m.description}
                selected={draft.import_method === m.id}
                disabled={blocked || committing}
                onClick={() => choose(m.id)}
              />
            );
          })}
        </ChoiceGrid>

        {/* The route that lifts the refusal. A greyed card with no way forward reads as
            a bug in our app rather than as a plan boundary. */}
        {gate.upgrade ? (
          <Button variant="ghost" size="sm" as={Link} to="/billing">
            See what the plans include
          </Button>
        ) : null}
      </WizardGroup>
    </>
  );
}
