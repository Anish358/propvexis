import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, AlertDescription, AlertTitle, Button, Field, FieldDescription, FieldLabel,
  Input, WizardFields, WizardForm, WizardGroup, WizardHeading,
} from '@/components/primitives';
import { SetupCard } from '../AccountForms.jsx';
import { useFlow } from '../NewAccountFlow.jsx';
import { checkLoginAvailable } from '../../../lib/api.js';

/* The credential — and, for the EA, the setup card for an account that already exists.
 *
 * IT NO LONGER ASKS HOW. The sub-choice ("do we run the terminal, or do you?") moved
 * onto `import` in the owner restructure of 2026-08-25, where the EA is now a card
 * beside Auto Sync. So this page has exactly one job per branch: collect a credential
 * for Auto Sync, or show the EA its three steps. A page that asked the question again
 * after the card had been clicked was the flaw that restructure removed.
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
 * THE FIELD LIST AND THE READ-ONLY NOTE ARE THE CONNECTOR'S, restated here because the
 * frontend cannot import it. `src/domain/sync/platforms.js` is the authority
 * (`credentialFields`, `credentialNote`) and the deploy rsyncs `src` and
 * `frontend/dist` as independent trees, so an import across that line works locally and
 * crashes on the box.
 *
 * THE NOTE IS GATED ON MT5 (spec §7.6, §10 risk 1). For MT5 it is a CHECKED FACT: the
 * worker reads account_info().trade_allowed on every login and deletes a credential
 * that can trade. TradeLocker (P2) has no investor-password concept, so the same
 * sentence becomes a false promise the moment TradeLocker ships.
 *
 * WHY THIS PAGE CAN REFUSE ITSELF. The login pre-check also reports
 * `autoSyncConfigured`, so a server with no SYNC_CRED_KEY says so before the password
 * field is touched rather than after a 503 — the 503 fires BEFORE validateCredential,
 * so the alternative sends a broker password to a server guaranteed to refuse it.
 * `false` only: `null` means the pre-check could not answer.
 */
const MT5_CREDENTIAL_NOTE =
  'Use your investor (read-only) password. A password that can place trades is rejected and deleted on the first login.';

export default function ConnectStep() {
  const { draft, advance, commit, committing, accounts } = useFlow();

  const isEa = draft.import_method === 'ea';

  const [server, setServer] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [check, setCheck] = useState(null);      // the pre-check's last answer
  const [err, setErr] = useState(null);

  // Debounced so the pre-check does not fire on every keystroke. 400ms is long enough
  // that a typed 9-digit login makes one request and short enough that the answer is
  // there before the password field is reached.
  const timer = useRef(null);
  useEffect(() => {
    const n = Number(login);
    if (!Number.isInteger(n) || n <= 0) { setCheck(null); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      checkLoginAvailable(n, draft.platform).then(setCheck);
    }, 400);
    return () => clearTimeout(timer.current);
  }, [login, draft.platform]);

  const serverRunUnavailable = check?.autoSyncConfigured === false;
  const isMt5 = draft.platform === 'mt5';

  async function submitCredential(e) {
    e.preventDefault();
    setErr(null);
    // Assembled at call time and never stored anywhere else.
    const credential = { server: server.trim(), login: Number(login), password };
    try {
      await commit({ credential });
      advance();
    } catch (ex) {
      // Nothing typed is cleared. A 409 that wiped the form would make the user retype
      // a server name to change one digit of a login.
      setErr(ex.message);
    }
  }

  const credentialReady = server.trim() !== ''
    && Number.isInteger(Number(login)) && Number(login) > 0
    && password !== '';

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
        <WizardHeading
          title="Attach the EA"
          description="Your account is created. These three steps point the EA at it — the same three you would see from your accounts list later."
        />
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
          <Button variant="primary" onClick={advance}>Continue</Button>
        </WizardGroup>
      </>
    );
  }

  return (
    <>
      <WizardHeading
        title="Connect your account"
        description="We keep a terminal logged in for you and sync in the background. This is the only step that needs a password."
      />

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
            <Field>
              <FieldLabel htmlFor="naf-mt5-server">MT5 server</FieldLabel>
              <Input
                id="naf-mt5-server" name="naf-mt5-server" value={server}
                onChange={(ev) => setServer(ev.target.value)}
                placeholder="GoatFunded-Server" autoComplete="off" autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="naf-mt5-login">MT5 login</FieldLabel>
              <Input
                id="naf-mt5-login" name="naf-mt5-login"
                type="number" inputMode="numeric" min="1" step="1"
                value={login} onChange={(ev) => setLogin(ev.target.value)}
                placeholder="314943467" autoComplete="off"
              />
              {/* The collision is reported here, while the login is being typed and
                  before the password is reached — a 409 at the end of the flow is what
                  this exists to avoid (spec §6.3). An UNKNOWN answer says nothing at
                  all: the unique index at commit is the real guard, and a spurious
                  warning is worse than silence. */}
              {check?.available === false && check?.mine ? (
                <FieldDescription>
                  You already have an account on this login.{' '}
                  <Link to="/settings/accounts">See your accounts</Link>
                </FieldDescription>
              ) : null}
              {check?.available === false && !check?.mine ? (
                <FieldDescription>That login is already registered.</FieldDescription>
              ) : null}
            </Field>
          </WizardFields>

          <Field>
            <FieldLabel htmlFor="naf-mt5-password">Investor password</FieldLabel>
            <Input
              id="naf-mt5-password" name="naf-mt5-password" type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              // `new-password`, not `off` — see the header. `off` is ignored by every
              // major browser on a field it reads as a password, and what it offered
              // was a credential saved for a different account entirely.
              autoComplete="new-password"
            />
            {isMt5 ? <FieldDescription>{MT5_CREDENTIAL_NOTE}</FieldDescription> : null}
          </Field>

          <Button type="submit" variant="primary" disabled={!credentialReady || committing}>
            {committing ? 'Connecting…' : 'Connect account'}
          </Button>
        </WizardForm>
      </WizardGroup>
    </>
  );
}
