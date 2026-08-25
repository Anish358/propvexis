import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, AlertDescription, AlertTitle, Button, ChoiceCard, ChoiceGrid, Field,
  FieldDescription, FieldLabel, Input, WizardFields, WizardForm, WizardGroup,
  WizardHeading,
} from '@/components/primitives';
import { SetupCard } from '../AccountForms.jsx';
import { useFlow } from '../NewAccountFlow.jsx';
import { checkLoginAvailable } from '../../../lib/api.js';

/* How Auto Sync actually connects — and the only step that handles a secret.
 *
 * IT ASKS HOW BEFORE IT ASKS FOR ANYTHING SECRET (spec §7.4). A page that renders a
 * password field before the user has chosen to give us one is asking for a broker
 * credential by default. So the sub-choice is first and nothing secret is on screen
 * until "we run the terminal" is picked.
 *
 * THE PASSWORD NEVER TOUCHES THE DRAFT. It lives in component state and goes straight
 * into commit()'s `extra`, because the draft is mirrored to sessionStorage and any
 * script on the origin can read that. This file touches no web storage at all, and a
 * test holds both facts — the weaker version (grep patch() for "password") cannot see
 * a console.log or a query string.
 *
 * THE FIELD LIST AND THE READ-ONLY NOTE ARE THE CONNECTOR'S, restated here because
 * the frontend cannot import it. `src/domain/sync/platforms.js` is the authority
 * (`credentialFields`, `credentialNote`) and the deploy rsyncs `src` and
 * `frontend/dist` as independent trees, so an import across that line works locally
 * and crashes on the box. They are NOT added to platformCatalog.js: that file has a
 * drift test, and adding fields to it without extending platform-catalog.test.js would
 * put a second uncovered copy where a covered one appears to be.
 *
 * THE NOTE IS GATED ON MT5 (spec §7.6, §10 risk 1). For MT5 it is a CHECKED FACT: the
 * worker reads account_info().trade_allowed on every login and deletes a credential
 * that can trade. TradeLocker (P2) has no investor-password concept, so the same
 * sentence becomes a false promise the moment TradeLocker ships. Printing it
 * unconditionally is how it gets inherited by accident.
 *
 * WHY THE SERVER-RUN BRANCH CAN DISAPPEAR. Owner decision, 2026-08-25: the login
 * pre-check now also reports `autoSyncConfigured`, so the step hides a branch it
 * cannot complete instead of attempting the provision and reading the 503. That is not
 * only tidier — the 503 fires BEFORE validateCredential, so the alternative sends a
 * broker password to a server guaranteed to refuse it. Hidden on `false` only: `null`
 * means the pre-check could not answer, and hiding on an unknown would strand a user
 * whose network blipped.
 */
const MT5_CREDENTIAL_NOTE =
  'Use your investor (read-only) password. A password that can place trades is rejected and deleted on the first login.';

export default function ConnectStep() {
  const { draft, patch, advance, commit, committing } = useFlow();

  // Which branch is open. Seeded from the draft so coming back to the step does not
  // forget the choice, but the EA branch also needs the created account, which only
  // exists after a commit — hence `created` below rather than reading it off `draft`.
  const [mode, setMode] = useState(() => (draft.import_method === 'ea' ? 'ea' : null));
  const [created, setCreated] = useState(null);

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

  // `false` only — see the header. An unknown answer leaves the branch offered.
  const serverRunUnavailable = check?.autoSyncConfigured === false;
  const isMt5 = draft.platform === 'mt5';

  async function chooseEa() {
    setErr(null);
    setMode('ea');
    // import_method is on the DRAFT, not in `extra`, so it has to be patched before
    // the payload is built — and `patch` returns the new draft because this component
    // has not re-rendered yet. That is what commit's second argument is for.
    const next = patch({ import_method: 'ea' });
    try {
      setCreated(await commit({}, next));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function submitCredential(e) {
    e.preventDefault();
    setErr(null);
    const next = patch({ import_method: 'auto_sync' });
    // Assembled at call time and never stored anywhere else.
    const credential = { server: server.trim(), login: Number(login), password };
    try {
      await commit({ credential }, next);
      advance();
    } catch (ex) {
      // Nothing typed is cleared. A 409 that wiped the form would make the user
      // retype a server name to change one digit of a login.
      setErr(ex.message);
    }
  }

  const credentialReady = server.trim() !== ''
    && Number.isInteger(Number(login)) && Number(login) > 0
    && password !== '';

  // ---- the EA branch, after the account exists -------------------------------
  if (mode === 'ea' && created) {
    return (
      <>
        <WizardHeading
          title="Attach the EA"
          description="Your account is created. These three steps point the EA at it — the same three you would see from the accounts table later."
        />
        {/* SetupCard, not a restatement: "how do I attach the EA" keeps exactly one
            answer whether it is asked here or a month from now (spec §7.4). */}
        <SetupCard account={created} />
        <Button variant="primary" onClick={advance}>Continue</Button>
      </>
    );
  }

  return (
    <>
      <WizardHeading
        title="How should we connect?"
        description="Either we run a terminal for you, or you attach our EA to the terminal you already run. Both keep the journal in sync; only the first needs a password."
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
              The hosted terminal is not configured here, so the EA route is the way in
              for now. Nothing you typed was sent.
            </AlertDescription>
          </Alert>
        ) : null}

        {mode === null ? (
          <ChoiceGrid>
            {!serverRunUnavailable ? (
              <ChoiceCard
                title="We run the terminal"
                description="We keep a terminal logged in for you and sync in the background. Nothing to install, nothing left running on your PC."
                disabled={committing}
                onClick={() => setMode('auto_sync')}
              />
            ) : null}
            <ChoiceCard
              title="I'll run the EA on my PC"
              description="Attach our Expert Advisor to your own MetaTrader 5. It syncs while your terminal is open."
              disabled={committing}
              onClick={chooseEa}
            />
          </ChoiceGrid>
        ) : null}

        {mode === 'auto_sync' ? (
          <WizardForm onSubmit={submitCredential}>
            <WizardFields>
              <Field>
                <FieldLabel htmlFor="naf-mt5-server">MT5 server</FieldLabel>
                <Input
                  id="naf-mt5-server" value={server}
                  onChange={(ev) => setServer(ev.target.value)}
                  placeholder="GoatFunded-Server" autoComplete="off" autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="naf-mt5-login">MT5 login</FieldLabel>
                <Input
                  id="naf-mt5-login" type="number" inputMode="numeric" min="1" step="1"
                  value={login} onChange={(ev) => setLogin(ev.target.value)}
                  placeholder="314943467" autoComplete="off"
                />
                {/* The collision is reported here, while the login is being typed and
                    before the password is reached — a 409 at the end of a nine-step
                    flow is the thing this exists to avoid (spec §6.3). An UNKNOWN
                    answer says nothing at all: the unique index at commit is the real
                    guard, and a spurious warning is worse than silence. */}
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
                id="naf-mt5-password" type="password" value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                autoComplete="off"
              />
              {isMt5 ? <FieldDescription>{MT5_CREDENTIAL_NOTE}</FieldDescription> : null}
            </Field>

            <Button type="submit" variant="primary" disabled={!credentialReady || committing}>
              {committing ? 'Connecting…' : 'Connect account'}
            </Button>
            {/* A way back to the other branch, so no error here is a dead end. */}
            <Button variant="ghost" size="sm" onClick={chooseEa} disabled={committing}>
              Use the EA instead
            </Button>
          </WizardForm>
        ) : null}
      </WizardGroup>
    </>
  );
}
