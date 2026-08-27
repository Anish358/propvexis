import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { BRAND } from '../../lib/theme.js';
import { completeOnboarding, fetchChallengeGroups, provisionAccount } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import {
  Button, WizardBody, WizardBrand, WizardExit, WizardFooter, WizardHeader, WizardPage,
  WizardProgress,
} from '@/components/primitives';
import {
  DRAFT_KEY, FLOW_VERSION, canVisit, emptyDraft, firstIncomplete, isSpentDraft, nextStep,
  patchDraft, prevStep, progress, reviveDraft, toProvisionPayload,
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

/** The body measure per step, for the steps that are not the default width. Data
 *  rather than a conditional expression in the JSX, so adding the next one is a line
 *  here instead of another ternary in the tree. */
const BODY_SIZE = { account: 'wide', firm: 'narrow' };

/** The outlet context, read in one place so a step never repeats the hook and a
 *  future context change touches one line. */
export const useFlow = () => useOutletContext();

/** Spec §8.1: "/accounts/new redirects to the first incomplete step." */
export function FlowIndex() {
  const { draft } = useFlow();
  return <Navigate to={`/accounts/new/${firstIncomplete(draft)}`} replace />;
}


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

/* Dropped on the way out, so the next Add Account starts clean even before the
 * spent-draft check below gets a chance to. Wrapped for the same reason as the read. */
function clearStoredDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch { /* nothing to clear if storage is unavailable */ }
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

  /* The step container, focused on every step change. See WizardBody for why focus
   * rather than a second live region: the app's one polite live region lives in Layout,
   * and this wizard is a SIBLING of Layout, so it does not get it.
   *
   * forwardRef rather than ref-as-prop, deliberately: React 19 passes `ref` as an
   * ordinary prop, but primitives/index.js documents this project as React 18.3 where
   * it does not, and a ref silently dropped here would fail exactly the way this fixes
   * — no error, no announcement, and nothing in a test to see it. */
  const bodyRef = useRef(null);

  /* The step comes from the URL, not from state. That is the point of real routes over
   * one stateful page: the browser's Back button, a refresh and a pasted link all mean
   * the same thing. Derived BEFORE the draft, because whether a stored draft may be
   * resumed depends on where it is being resumed. */
  const step = location.pathname.split('/').filter(Boolean).pop();

  const [draft, setDraft] = useState(() => {
    const stored = reviveDraft(readStoredDraft(), {
      provisionKey: keyRef.current,
      firstRun,
    });
    // A COMMITTED draft is spent everywhere but downstream of the commit. Without this,
    // creating one account and then coming back to /accounts/new in the same tab revived
    // it and redirected onto the previous account's success page — and its provision_key
    // would have replayed that account rather than making a new one. See isSpentDraft.
    if (!isSpentDraft(stored, step)) return stored;
    clearStoredDraft();
    return emptyDraft({ provisionKey: keyRef.current, firstRun });
  });
  const [committing, setCommitting] = useState(false);

  /* THE USER'S EXISTING CHALLENGES, for the account page's first question (migration
   * 0027). `null` means NOT LOADED and `[]` means "you have none", and the page draws
   * those differently — one is a spinner's worth of patience, the other is a reason the
   * Existing option is not offered at all.
   *
   * FETCHED HERE, NOT IN THE STEP, because the body is remounted on every navigation
   * (`key={step}`), so a fetch inside the page would re-run each time the user walked
   * back to it. Gated on the prop branch: a live account has no phases, and asking for
   * a list it can never use is a request per wizard for nothing.
   *
   * A FAILURE RESOLVES TO `[]` RATHER THAN THROWING. The consequence is that the
   * Existing branch quietly disappears and the trader can still create the account as a
   * new challenge — which is the right degradation for a request that is an aid to one
   * question, not the flow's spine. */
  const [challenges, setChallenges] = useState(null);
  useEffect(() => {
    if (draft.capital_kind !== 'prop') return undefined;
    let live = true;
    fetchChallengeGroups()
      .then((d) => { if (live) setChallenges(d?.groups ?? []); })
      .catch(() => { if (live) setChallenges([]); });
    return () => { live = false; };
  }, [draft.capital_kind]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* private window with site data blocked — the flow still works */ }
  }, [draft]);

  // On the step, not on mount: the whole point is announcing the CHANGE.
  useEffect(() => {
    bodyRef.current?.focus();
  }, [step]);
  const { index, total } = progress(draft, step);
  const canGoBack = prevStep(draft, step) !== null;

  const patch = useCallback((p) => {
    let next;
    setDraft((d) => { next = patchDraft(d, p); return next; });
    return next;
  }, []);

  /* `draftOverride` for the same reason commit() takes one: a step that patches and
   * leaves in ONE handler has not re-rendered yet, so `draft` here is still the answer
   * before the patch — and on the capital step that answer decides the BRANCH. Choosing
   * Prop Firm and pressing Continue asked the pre-patch draft for the next step, got
   * `account` (the live branch's), navigated there, and was bounced back to `firm` by
   * the guard. It landed in the right place, which is why nothing caught it. patch()
   * returns the new draft; handing it back closes the gap instead of relying on the
   * redirect to paper over it.
   *
   * THE OVERRIDE IS CHECKED FOR BEING A DRAFT, and that is not defensive noise: this
   * function is handed to steps that write `onClick={advance}`, which would pass a
   * MouseEvent as the override. `stepsFor()` reads whatever it is given, so an event
   * would resolve to the live branch, `indexOf` would miss the current step and the
   * wizard would navigate to `/accounts/new/null`. `v` is the draft's schema version and
   * nothing else in the app carries it, so it is the one property that tells the two
   * apart. The call sites pass `advance()` explicitly (pinned by a test) — this is the
   * second line of defence, not the first. */
  const advance = useCallback((draftOverride) => {
    const from = draftOverride?.v === FLOW_VERSION ? draftOverride : draft;
    navigate(`/accounts/new/${nextStep(from, step)}`);
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
    // The draft is spent the moment we leave — dropping it here means a browser Back to
    // /accounts/new/done finds nothing to revive rather than re-rendering the receipt for
    // an account the user has already moved on from.
    clearStoredDraft();
    navigate('/');
  }, [draft, setAccountId, navigate]);

  const ctx = {
    draft, patch, advance, back, canGoBack, step, index, total,
    accounts, challenges, plan: user?.plan, firstRun, onOnboarded,
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
          <WizardExit as={Link} to="/settings/accounts" />
        )}
      </WizardHeader>

      {/* key={step} remounts the body per step: it is both the transition trigger and
          the reason a step's local state cannot leak into the next one. */}
      {/* THE MEASURE IS A PROPERTY OF THE STEP, and only the shell knows which step is
          rendering — the step itself is inside the body it would be sizing. `wide` for
          the merged account page, which lays its controls out in a grid rather than
          asking one question; `narrow` for the firm picker, whose answers are list rows
          rather than cards. Everything else takes the default measure. */}
      <WizardBody key={step} ref={bodyRef} size={BODY_SIZE[step] || 'default'}>
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
