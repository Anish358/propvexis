import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, AlertDescription, AlertTitle, Button, ConsentField, Field, FieldDescription,
  FieldLabel, Input, WizardFields, WizardForm, WizardGroup, WizardHeading,
} from '@/components/primitives';
import { SetupCard } from '../AccountForms.jsx';
import { useFlow } from '../NewAccountFlow.jsx';
import { findPlatformCard } from '../platformCatalog.js';
import { checkLoginAvailable } from '../../../lib/api.js';

/* The credential — and, for the EA, the setup card for an account that already exists.
 *
 * IT NO LONGER ASKS HOW. The sub-choice ("do we run the terminal, or do you?") moved
 * onto `import` in the owner restructure of 2026-08-25, where the EA is now a card
 * beside Auto Sync. So this page has exactly one job per branch: collect a credential
 * for Auto Sync, or show the EA its three steps.
 *
 * THE FORM IS THE PLATFORM'S, NOT THIS PAGE'S. It used to hardcode MT5's three fields
 * — a text server, a NUMERIC login, a password. TradeLocker's credential is an email,
 * a server and a password, with no login at all: its accountId is not known until the
 * worker calls /auth/jwt/all-accounts after the account exists. Hardcoded, a
 * TradeLocker user would be asked for a login that does not exist and `credentialReady`
 * would never go true — a button disabled forever with nothing on screen saying why.
 * The list, the note and the gate all come from `platformCatalog.js`, which
 * test/platform-catalog.test.js holds identical to `src/domain/sync/platforms.js`.
 *
 * THIS PAGE HOLDS NO CREDENTIAL COPY OF ITS OWN, and that is a security property
 * rather than tidiness. MT5 promises a trade-capable password is rejected and deleted,
 * because its worker checks account_info().trade_allowed and does exactly that.
 * TradeLocker's credential IS such a password — the platform offers no read-only
 * alternative. Printing MT5's sentence above TradeLocker's field would be a false
 * security claim on a funded account, and the old `platform === 'mt5'` gate was one
 * edit away from doing it. A page carrying no copy cannot show the wrong platform's.
 *
 * THE CONSENT GATE IS A REAL GATE (spec §3). Where the credential can trade, the
 * submit stays disabled until the trader ticks the box. A paragraph they scrolled past
 * is not consent to handing over something that can move money on a funded account.
 *
 * THE PASSWORD NEVER TOUCHES THE DRAFT. It lives in component state and goes straight
 * into commit()'s `extra`, because the draft is mirrored to sessionStorage and any
 * script on the origin can read that. This file touches no web storage at all.
 *
 * NOTHING IS PREFILLED, AND THAT NEEDED FIXING RATHER THAN LEAVING. Every field starts
 * empty in our code, but the browser was autofilling them: Chrome and Safari ignore
 * `autoComplete="off"` on anything they recognise as a login/password pair, and offer
 * whatever they have saved for the origin. `new-password` on the password field is the
 * value they actually honour, and it suppresses the associated username guess too. A
 * broker credential silently prefilled from a DIFFERENT account is the worst kind of
 * wrong here — it looks answered, and it would be submitted.
 *
 * WHY THIS PAGE CAN REFUSE ITSELF. The login pre-check also reports
 * `autoSyncConfigured`, so a server with no SYNC_CRED_KEY says so before the password
 * field is touched rather than after a 503 — the 503 fires BEFORE validateCredential,
 * so the alternative sends a broker password to a server guaranteed to refuse it.
 * `false` only: `null` means the pre-check could not answer.
 */
export default function ConnectStep() {
  const { draft, advance, commit, committing, accounts } = useFlow();

  const isEa = draft.import_method === 'ea';

  const card = findPlatformCard(draft.platform);
  const fields = card?.credentialFields || [];
  // The login pre-check is asked of the PLATFORM, not of the typed value. Reading
  // the value instead happens to work today — Number(undefined) is NaN and the
  // guard rejects it — but it would stop working the moment a platform ships a
  // non-numeric field called `login`, and it would fail silently when it did.
  const loginField = fields.find((f) => f.name === 'login' && f.type === 'number') || null;
  const needsConsent = Boolean(card?.credentialConsent);

  // ONE map, starting EMPTY. Nothing seeds it from the draft.
  const [values, setValues] = useState({});
  const [consented, setConsented] = useState(false);
  const [check, setCheck] = useState(null);      // the pre-check's last answer
  const [err, setErr] = useState(null);

  const setField = (name) => (ev) =>
    setValues((prev) => ({ ...prev, [name]: ev.target.value }));

  const login = values.login ?? '';

  // Debounced so the pre-check does not fire on every keystroke. 400ms is long enough
  // that a typed 9-digit login makes one request and short enough that the answer is
  // there before the password field is reached.
  const timer = useRef(null);
  useEffect(() => {
    if (!loginField) { setCheck(null); return undefined; }
    const n = Number(login);
    if (!Number.isInteger(n) || n <= 0) { setCheck(null); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      checkLoginAvailable(n, draft.platform).then(setCheck);
    }, 400);
    return () => clearTimeout(timer.current);
  }, [login, loginField, draft.platform]);

  const serverRunUnavailable = check?.autoSyncConfigured === false;

  async function submitCredential(e) {
    e.preventDefault();
    setErr(null);
    // Assembled at call time and never stored anywhere else.
    const credential = {};
    for (const f of fields) {
      const raw = values[f.name] ?? '';
      if (f.type === 'password') {
        // NEVER TRIMMED. A leading or trailing space is a legal password
        // character; trimming it silently changes the credential and the broker
        // login fails hours later with nothing to explain it.
        credential[f.name] = raw;
      } else if (f.type === 'number') {
        credential[f.name] = Number(String(raw).trim());
      } else {
        credential[f.name] = String(raw).trim();
      }
    }
    try {
      await commit({ credential });
      advance();
    } catch (ex) {
      // Nothing typed is cleared. A 409 that wiped the form would make the user retype
      // a server name to change one digit of a login.
      setErr(ex.message);
    }
  }

  const fieldFilled = (f) => {
    const raw = values[f.name] ?? '';
    if (!f.required) return true;
    if (f.type === 'number') {
      const n = Number(String(raw).trim());
      return Number.isInteger(n) && n > 0;
    }
    // The password counts as filled if anything was typed, spaces included.
    return f.type === 'password' ? raw !== '' : String(raw).trim() !== '';
  };

  const credentialReady = fields.length > 0
    && fields.every(fieldFilled)
    && (!needsConsent || consented);

  /* ---- the EA branch: the account already exists ---------------------------
   * The EA commits on `import` now, so by the time this page renders the row is
   * written. SetupCard needs `ingest_token`, which the DRAFT deliberately does not
   * carry — commit() stores only { id, mt5_login }, so the token never reaches
   * sessionStorage. It is read from the account list instead, which the commit already
   * reloaded and which carries ingest_token through ACCOUNT_COLUMNS. */
  if (isEa) {
    const created = (accounts || []).find((a) => a.id === draft.account?.id) || null;
    return (
      <>
        <WizardHeading align="center" title="Attach the EA" />
        <WizardGroup>
          {created ? <SetupCard account={created} /> : (
            <Alert variant="warning">
              <AlertTitle>Your account is created</AlertTitle>
              <AlertDescription>
                We could not load its setup steps just now. They are always available
                from <Link to="/settings/accounts">your accounts list</Link>.
              </AlertDescription>
            </Alert>
          )}
          {/* `() => advance()`, not `onClick={advance}`: advance now takes an optional
              draft, and handing it the click event would resolve the next step from a
              MouseEvent. */}
          <Button variant="primary" onClick={() => advance()}>Continue</Button>
        </WizardGroup>
      </>
    );
  }

  // Everything but the password sits in the paired grid; the password gets its own
  // full-width Field so the note and the gate can sit directly under it.
  const passwordField = fields.find((f) => f.type === 'password') || null;
  const topFields = fields.filter((f) => f !== passwordField);

  return (
    <>
      <WizardHeading align="center" title="Connect your account" />

      <WizardGroup>
        {err ? (
          <Alert variant="error">
            <AlertTitle>We could not connect the account</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {serverRunUnavailable ? (
          <Alert variant="warning">
            <AlertTitle>We cannot hold a password on this server yet</AlertTitle>
            <AlertDescription>
              The hosted terminal is not configured here. Go back a step and choose the
              EA instead — nothing you typed was sent.
            </AlertDescription>
          </Alert>
        ) : null}

        <WizardForm onSubmit={submitCredential}>
          <WizardFields>
            {topFields.map((f, i) => (
              <Field key={f.name}>
                <FieldLabel htmlFor={`naf-cred-${f.name}`}>{f.label}</FieldLabel>
                <Input
                  id={`naf-cred-${f.name}`}
                  name={`naf-cred-${f.name}`}
                  type={f.type === 'number' ? 'number' : f.type}
                  {...(f.type === 'number' ? { inputMode: 'numeric', min: '1', step: '1' } : {})}
                  value={values[f.name] ?? ''}
                  onChange={setField(f.name)}
                  placeholder={f.placeholder || ''}
                  autoComplete="off"
                  autoFocus={i === 0}
                />
                {/* The collision is reported here, while the login is being typed and
                    before the password is reached — a 409 at the end of the flow is what
                    this exists to avoid (spec §6.3). An UNKNOWN answer says nothing at
                    all: the unique index at commit is the real guard, and a spurious
                    warning is worse than silence. */}
                {f === loginField && check?.available === false && check?.mine ? (
                  <FieldDescription>
                    You already have an account on this login.{' '}
                    <Link to="/settings/accounts">See your accounts</Link>
                  </FieldDescription>
                ) : null}
                {f === loginField && check?.available === false && !check?.mine ? (
                  <FieldDescription>That login is already registered.</FieldDescription>
                ) : null}
              </Field>
            ))}
          </WizardFields>

          {passwordField ? (
            <Field>
              <FieldLabel htmlFor="naf-cred-password">{passwordField.label}</FieldLabel>
              <Input
                id="naf-cred-password" name="naf-cred-password" type="password"
                value={values[passwordField.name] ?? ''}
                onChange={setField(passwordField.name)}
                // `new-password`, not `off` — see the header. `off` is ignored by every
                // major browser on a field it reads as a password, and what it offered
                // was a credential saved for a different account entirely.
                autoComplete="new-password"
              />
              {card?.credentialNote ? (
                <FieldDescription>{card.credentialNote}</FieldDescription>
              ) : null}
            </Field>
          ) : null}

          {needsConsent ? (
            <ConsentField
              id="naf-cred-consent"
              checked={consented}
              onCheckedChange={(v) => setConsented(v === true)}
            >
              {card.credentialConsent}
            </ConsentField>
          ) : null}

          <Button type="submit" variant="primary" disabled={!credentialReady || committing}>
            {committing ? 'Connecting…' : 'Connect account'}
          </Button>
        </WizardForm>
      </WizardGroup>
    </>
  );
}
