import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { BRAND } from '../../lib/theme.js';
import {
  completeOnboarding, fetchChallengeGroups, provisionAccount, provisionCtraderAccounts,
} from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import {
  Button, WizardBody, WizardBrand, WizardExit, WizardFooter, WizardHeader, WizardPage,
  WizardProgress,
} from '@/components/primitives';
import {
  DRAFT_KEY, FLOW_VERSION, canVisit, emptyDraft, firstIncomplete, isCommitted, isSpentDraft,
  nextStep, patchDraft, prevStep, progress, reviveDraft, toProvisionPayload,
} from './newAccountFlow.js';
import { backfillablePhases, phaseToAdd } from '../prop/challengeGroups.js';

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

  /* THE DEEP LINK FROM PROP OS: `?challenge=<id>`, which the "Add Phase 2 Account" button
   * on a challenge card carries. The trader has already said which challenge by clicking
   * that card's rail, so the wizard must not ask again — it opens on the account page with
   * the challenge chosen.
   *
   * THE FIRM COMES FROM THE SERVER, NOT FROM THE URL. Putting `&firm=gft` on the link
   * would let the page seed itself synchronously and skip the wait below, at the cost of
   * trusting a URL for the one fact that decides which firm's challenge this account joins
   * — and of a second copy of it to disagree with the group row. So the seed waits for
   * GET /api/prop/challenges, and the guard holds the step open until it lands. */
  const wantedGroup = Number(new URLSearchParams(location.search).get('challenge')) || null;
  /* `&phase=<id>` — the BACK-FILL link, from a rail stop the app has already taken as
   * passed. Without it the wizard would offer the phase the firm has just issued, which
   * is the opposite end of the ladder from the one the trader clicked. Validated against
   * the group below, never trusted on its own. */
  const wantedPhase = new URLSearchParams(location.search).get('phase') || null;
  /* `?ctrader=connected&identity=<id>` — where the cTrader consent screen sends the
   * trader back.
   *
   * READ HERE, IN THE SHELL, AND NOT IN ConnectStep. The callback redirects to
   * `/accounts/new`, which is FlowIndex, which immediately does
   * `<Navigate to={`/accounts/new/${firstIncomplete(draft)}`} />` -- and <Navigate>
   * does NOT carry location.search. The query is therefore GONE before any step
   * mounts, so a step reading useSearchParams() sees nothing and asks the user to
   * authorize again, forever, while the identity is created server-side every time.
   *
   * The shell is mounted for every step and sees the entry location, which is why
   * `challenge` and `phase` are already read here. This is the same problem.
   *
   * CAPTURED ONCE, IN useState, NOT DERIVED FROM THE LIVE LOCATION. A useMemo on
   * location.search recomputes to null the moment FlowIndex navigates -- which the
   * SUCCESS path survives, because the identity is already in the draft by then,
   * but the FAILURE path does not: `?ctrader=error&reason=expired` would render
   * for one frame and vanish, leaving the trader on an Authorize button with no
   * explanation of why the last attempt did nothing. */
  const [ctraderReturn] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get('ctrader');
    if (!status) return null;
    return { status, reason: q.get('reason'), identityId: Number(q.get('identity')) || null };
  });
  const [seedTried, setSeedTried] = useState(false);

  useEffect(() => {
    // `wantedGroup` is why the second condition exists: on a COLD deep link the draft has
    // no capital_kind yet, so gating the fetch on 'prop' alone would never fetch, and the
    // seed below would wait forever on a payload nobody asked for.
    if (draft.capital_kind !== 'prop' && wantedGroup == null) return undefined;
    let live = true;
    fetchChallengeGroups()
      .then((d) => { if (live) setChallenges(d?.groups ?? []); })
      .catch(() => { if (live) setChallenges([]); });
    return () => { live = false; };
  }, [draft.capital_kind, wantedGroup]);

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

  /* DECLARED AFTER patch(), AND THAT IS LOAD-BEARING. `patch` is a `const` arrow from
   * useCallback, so an effect written above it that closes over it hits the temporal dead
   * zone on the FIRST render — "Cannot access 'patch' before initialization", the whole
   * wizard replaced by the error boundary. It shipped that way for one commit because the
   * flow's tests read this file as TEXT (no jsdom, no React Testing Library, by decision)
   * and a build cannot see it either: the reference is legal, its timing is not.
   *
   * ONE PATCH, and the order inside patchDraft is what makes that safe: the cascade
   * clears the firm and the challenge when capital_kind changes, then merges this patch
   * over the result — so every field here survives. Two patches would not: the first
   * would clear what the second was about to rely on.
   *
   * A CHALLENGE THAT CANNOT BE JOINED SEEDS NOTHING, and `seedTried` flips either way. A
   * stale link — the phase was added from another tab, the challenge has since failed —
   * must not hold the wizard on a step it cannot fill; falling through to the guard sends
   * the trader to the first question instead, which is a flow they can finish. */
  useEffect(() => {
    if (wantedGroup == null || seedTried || challenges == null) return;
    const group = challenges.find((g) => g.id === wantedGroup) ?? null;
    /* THE GROUP DECIDES WHETHER THE PHASE IS REAL, not the URL. A link may only name a
     * phase this challenge actually has a hole at — so a hand-edited `&phase=` cannot
     * file a second Phase 1 against a challenge that already has one, and a link that
     * has gone stale (the phase was added from another tab) simply falls back to the
     * normal invitation instead of seeding an impossible draft. */
    const backfill = group && wantedPhase && backfillablePhases(group).includes(wantedPhase)
      ? wantedPhase
      : null;
    // Seedable when there is a login to add: the one the firm just issued, OR the old
    // phase this link names. A back-fill is valid even when nothing new is issuable —
    // that is the case where the trader is filling in history mid-evaluation.
    const seedable = group && (phaseToAdd(group).phase != null || backfill != null);
    if (seedable && !isCommitted(draft)) {
      patch({
        capital_kind: 'prop',
        firm_id: group.firm_id,
        firm_name: group.firm_name,
        challenge_mode: 'existing',
        challenge_group_id: group.id,
        backfill_phase: backfill,
      });
    }
    setSeedTried(true);
  }, [wantedGroup, wantedPhase, seedTried, challenges, draft, patch]);

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
  /* The identity goes into the DRAFT, which is mirrored to sessionStorage and
   * survives the navigation that eats the query string. Guarded on the current
   * value so this cannot loop. */
  useEffect(() => {
    if (ctraderReturn?.status === 'connected' && ctraderReturn.identityId
        && draft.ctrader_identity_id !== ctraderReturn.identityId) {
      patch({ ctrader_identity_id: ctraderReturn.identityId });
    }
  }, [ctraderReturn, draft.ctrader_identity_id, patch]);

  const commit = useCallback(async (extra = {}, draftOverride) => {
    setCommitting(true);
    try {
      const source = draftOverride ?? draft;
      // cTRADER COMMITS THROUGH ITS OWN ENDPOINT, because one grant can become
      // SEVERAL accounts and /api/accounts/provision makes exactly one. The
      // selections are re-validated server-side against what that identity
      // actually owns, so a tampered list cannot point at a stranger's account.
      let account;
      if (extra.ctraderSelections) {
        const { ctraderSelections, ...rest } = extra;
        const { accounts } = await provisionCtraderAccounts(source.ctrader_identity_id, {
          ...toProvisionPayload(source), ...rest, selections: ctraderSelections,
        });
        // The draft records ONE account because the rest of the wizard is
        // single-account shaped; the others exist and appear in the accounts list.
        [account] = accounts;
      } else {
        account = await provisionAccount({ ...toProvisionPayload(source), ...extra });
      }
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
    draft, patch, advance, back, canGoBack, step, index, total, ctraderReturn,
    accounts, challenges, plan: user?.plan, firstRun, onOnboarded,
    commit, committing, finish,
  };

  /* THE GUARD, PLUS THE ONE CASE IT CANNOT SEE. `canVisit` reads the draft, and on a cold
   * `?challenge=` link the draft is empty for as long as the challenges take to arrive —
   * so the guard would redirect to the first question and the deep link would be lost
   * before the seed could run. Holding the account step open while the seed is pending is
   * the whole of the exception, and it closes on its own: `seedTried` flips whether or not
   * the challenge turned out to be joinable. */
  const seedPending = wantedGroup != null && !seedTried && !isCommitted(draft);
  const allowed = canVisit(draft, step) || (seedPending && step === 'account');

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
        {seedPending ? null : allowed ? <Outlet context={ctx} /> : (
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
