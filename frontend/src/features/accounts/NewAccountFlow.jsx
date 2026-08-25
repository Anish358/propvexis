import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { BRAND } from '../../lib/theme.js';
import { completeOnboarding, provisionAccount } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import {
  Button, WizardBody, WizardBrand, WizardFooter, WizardHeader, WizardPage, WizardProgress,
} from '@/components/primitives';
import {
  DRAFT_KEY, canVisit, firstIncomplete, nextStep, patchDraft, prevStep, progress,
  reviveDraft, toProvisionPayload,
} from './newAccountFlow.js';

/* The Add Account wizard's shell — eleven routed steps, one draft, one guard.
 *
 * A SIBLING OF <Layout>, NOT A CHILD (spec §8.1). Nested inside it the wizard would
 * render through Layout's <Outlet> and inherit the sidebar, the filter bar and the
 * shell's own outlet context — the full-bleed design would simply be gone. Being a
 * sibling is also why `accounts`, `reloadAccounts` and `setAccountId` arrive as props:
 * there is no outlet context above this to read them from.
 *
 * THE GUARD LIVES HERE, ONCE. The spec puts it per page; one implementation cannot
 * drift from itself and eleven can, and `canVisit()` is already a tested pure
 * function. A cold /accounts/new/phase lands on the first step that is actually
 * unanswered rather than on a page whose questions have no answers behind them.
 *
 * NO STYLING DECISIONS ARE MADE IN THIS FILE. Every visual choice is inside the
 * wizard primitives, because tailwind.css scopes @source to components/{ui,primitives}
 * and a utility written here would emit no CSS at all — silently. DESIGN-LANGUAGE §1.
 */

/** The outlet context, read in one place so a step never repeats the hook and a
 *  future context change touches one line. */
export const useFlow = () => useOutletContext();

/** Spec §8.1: "/accounts/new redirects to the first incomplete step." */
export function FlowIndex() {
  const { draft } = useFlow();
  return <Navigate to={`/accounts/new/${firstIncomplete(draft)}`} replace />;
}

/* The steps not built yet (Task 6 shipped ten of these; 8 filled name and platform). They ship as named stubs so the route
 * table is complete and the guard is exercisable from the first commit — a missing
 * route would redirect to a blank page, which reads as a guard bug. Each carries the
 * task that fills it, so a half-finished stub cannot ship unnoticed. */
const Stub = ({ name, task }) => (
  <p data-slot="wizard-stub" data-task={task}>{name} — not built yet ({task})</p>
);
export const WelcomeStep = () => <Stub name="Welcome" task="TASK 12" />;

/* sessionStorage, not localStorage: the draft should die with the tab rather than
 * greet the user days later. Both directions are wrapped, because sessionStorage
 * THROWS in a private window with site data blocked — and a wizard that white-screens
 * there is worse than one that starts fresh. */
function readStoredDraft() {
  try {
    return sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

export default function NewAccountFlow({
  accounts = [],
  reloadAccounts,
  setAccountId,
  firstRun = false,
  onOnboarded,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  /* Minted once per mount, and a ref rather than useState so "once" is obvious to a
   * reader — useState's initializer expression is written as if it runs every render
   * even though React discards the result. It matters: provision_key is UNIQUE
   * globally while its lookup is per-user, so a second key per attempt defeats the
   * idempotency guard that stops a double-submit creating two accounts. A revived
   * draft keeps its own stored key over this one (reviveDraft's job). */
  const keyRef = useRef(crypto.randomUUID());

  const [draft, setDraft] = useState(() => reviveDraft(readStoredDraft(), {
    provisionKey: keyRef.current,
    firstRun,
  }));
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* private window with site data blocked — the flow still works */ }
  }, [draft]);

  /* The step comes from the URL, not from state. That is the point of real routes
   * over one stateful page: the browser's Back button, a refresh and a pasted link
   * all mean the same thing. */
  const step = location.pathname.split('/').filter(Boolean).pop();
  const { index, total } = progress(draft, step);
  const canGoBack = prevStep(draft, step) !== null;

  const patch = useCallback((p) => {
    let next;
    setDraft((d) => { next = patchDraft(d, p); return next; });
    return next;
  }, []);

  const advance = useCallback(() => {
    navigate(`/accounts/new/${nextStep(draft, step)}`);
  }, [navigate, draft, step]);

  const back = useCallback(() => {
    const to = prevStep(draft, step);
    if (to) navigate(`/accounts/new/${to}`);
  }, [navigate, draft, step]);

  /* The only place that provisions.
   *
   * `extra` is how the connect step passes { credential } without it ever entering
   * the draft — sessionStorage is readable by any script on the origin, so a broker
   * password lives in component state and goes straight to this call.
   *
   * `draftOverride` exists because a step sometimes patches and commits in one
   * handler (connect's EA branch patches import_method then provisions). patch()
   * returns the new draft but this component has not re-rendered yet, so the payload
   * must be built from what the caller just computed. */
  const commit = useCallback(async (extra = {}, draftOverride) => {
    setCommitting(true);
    try {
      const source = draftOverride ?? draft;
      const account = await provisionAccount({ ...toProvisionPayload(source), ...extra });
      // Recorded BEFORE anything that can fail: from here the draft is committed,
      // navigation is forward-only, and a retry would create a second account.
      // reloadAccounts and the onboarding stamp are best-effort by comparison.
      setDraft((d) => patchDraft(d, {
        account: { id: account.id, mt5_login: account.mt5_login },
      }));
      await reloadAccounts?.();
      // Decision B9: stamp onboarding at COMMIT, not on `done`. A first-run user who
      // closes the tab after creating an account must not be asked for a second one
      // at the next login.
      if (firstRun) {
        try { onOnboarded?.(await completeOnboarding()); } catch { /* the account exists; the stamp can wait */ }
      }
      return account;
    } finally {
      setCommitting(false);
    }
  }, [draft, reloadAccounts, firstRun, onOnboarded]);

  /* Spec §8.1: "'Home page' lands on a dashboard already scoped to what was just
   * created." */
  const finish = useCallback(() => {
    if (draft.account?.mt5_login != null) setAccountId?.(String(draft.account.mt5_login));
    navigate('/');
  }, [draft, setAccountId, navigate]);

  const ctx = {
    draft, patch, advance, back, canGoBack, step, index, total,
    accounts, plan: user?.plan, firstRun, onOnboarded,
    commit, committing, finish,
  };

  const allowed = canVisit(draft, step);

  return (
    <WizardPage>
      <WizardHeader>
        <WizardBrand><Logo size={22} />{BRAND}</WizardBrand>
        <WizardProgress index={index} total={total} />
        {/* Exit is not in the spec and is needed: a sibling of <Layout> has no
            sidebar, so without it a user who opened the wizard by accident has no way
            out but the browser button. On first run it does not render — that escape
            is welcome's "Skip for now" (Task 12), which also stamps onboarding. */}
        {firstRun ? <span data-slot="wizard-exit-spacer" /> : (
          <Button variant="chrome" size="sm" as={Link} to="/settings/accounts">Exit</Button>
        )}
      </WizardHeader>

      {/* key={step} remounts the body per step: it is both the transition trigger and
          the reason a step's local state cannot leak into the next one. */}
      <WizardBody key={step}>
        {allowed ? <Outlet context={ctx} /> : (
          <Navigate to={`/accounts/new/${firstIncomplete(draft)}`} replace />
        )}
      </WizardBody>

      <WizardFooter>
        {canGoBack
          ? <Button variant="ghost" size="sm" onClick={back} disabled={committing}>Back</Button>
          : <span data-slot="wizard-back-spacer" />}
      </WizardFooter>
    </WizardPage>
  );
}
