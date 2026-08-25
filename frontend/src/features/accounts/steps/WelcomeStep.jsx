import React, { useState } from 'react';
import {
  Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardTitle,
  WizardGroup, WizardHeading, WizardPillars, WizardRow,
} from '@/components/primitives';
import { useAuth } from '../../../app/AuthContext.jsx';
import { BRAND } from '../../../lib/theme.js';
import { completeOnboarding } from '../../../lib/api.js';
import { useFlow } from '../NewAccountFlow.jsx';

/* First run only — the one step a returning user never sees.
 *
 * `stepsFor` puts `welcome` in the branch only when `draft.firstRun`, so a returning
 * user cannot route here. The skip control is ALSO gated on firstRun anyway, because a
 * control that completes onboarding is not something to leave reachable by a routing
 * accident.
 *
 * THE SKIP IS LOAD-BEARING, not a courtesy. Without it a brand-new user who does not
 * yet have a trading account cannot reach the app at all — and "add a trading account"
 * is not a reasonable thing to require of someone who has not seen the product. It
 * stamps onboarded_at with no account, which is exactly what needsOnboarding checks.
 *
 * The greeting and the three pillars are ported VERBATIM from the deleted
 * Onboarding.jsx. That copy was written for this moment and there is no reason to
 * rewrite it; only the markup changed, from `.onb-*` rules to composed components.
 */
const PILLARS = [
  { t: 'Journal', d: 'Every trade in R and dollars — calendar, analytics and replay.' },
  { t: 'Prop OS', d: 'Track challenge rules, drawdown headroom and payouts.' },
  { t: 'Reports', d: 'Composed reports you can export to PDF or CSV.' },
];

export default function WelcomeStep() {
  const { user } = useAuth();
  const { draft, patch, advance, firstRun, onOnboarded } = useFlow();
  const [err, setErr] = useState(null);
  const [skipping, setSkipping] = useState(false);

  const firstName = (user?.name || '').trim().split(' ')[0];

  function start() {
    patch({ welcomed: true });
    advance();
  }

  async function skip() {
    setSkipping(true);
    setErr(null);
    try {
      onOnboarded?.(await completeOnboarding());
      // No navigate: stamping onboarded_at re-renders App onto the onboarded branch,
      // which is the redirect. Navigating here as well would race that re-render.
    } catch {
      setErr('Could not finish setup — please try again.');
      setSkipping(false);
    }
  }

  return (
    <>
      <WizardHeading
        title={`Welcome${firstName ? `, ${firstName}` : ''} 👋`}
        description={`${BRAND} is your trading operating system. Here's what you get:`}
      />

      <WizardGroup>
        <WizardPillars>
          {PILLARS.map((p) => (
            <Card key={p.t}>
              <CardContent>
                <CardTitle>{p.t}</CardTitle>
                <CardDescription>{p.d}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </WizardPillars>

        {err ? (
          <Alert variant="error">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <WizardRow>
          <Button variant="primary" onClick={start} disabled={skipping}>Get started</Button>
          {/* First run only — see the header. `draft.firstRun` is the same fact the
              step list is built from, and either being true is enough: the prop is how
              App declares it and the draft is what survives a refresh. */}
          {(firstRun || draft.firstRun) ? (
            <Button variant="ghost" onClick={skip} disabled={skipping}>
              {skipping ? 'Finishing…' : 'Skip for now'}
            </Button>
          ) : null}
        </WizardRow>
      </WizardGroup>
    </>
  );
}
