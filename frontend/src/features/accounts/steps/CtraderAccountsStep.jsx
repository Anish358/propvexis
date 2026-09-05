import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, AlertDescription, AlertTitle, Button, LoadingBlock, WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { ctraderAccounts } from '../../../lib/api.js';

/* Bringing this cTrader grant's accounts in — WITHOUT ASKING WHICH.
 *
 * IT USED TO BE A PICKER, AND THE PICKER ASKED THE SAME QUESTION TWICE (owner decision
 * 2026-09-06). cTrader's own consent screen is where a trader chooses which accounts an
 * app may see, and ProtoOAGetAccountListByAccessTokenReq returns ONLY the accounts that
 * grant covers. So a second list of checkboxes could not narrow anything the trader had
 * not already narrowed; it could only make them do it again, and get it wrong.
 *
 * THE PAGE STAYS THOUGH, AND THAT IS THE POINT OF THE CHANGE'S SHAPE. Listing a cTID's
 * accounts needs a protobuf socket, which is the worker's job -- the web tier has no
 * protobuf client and growing one would mean two implementations of app auth and
 * reconnect. So the worker fills ctrader_discovered_accounts and this polls for them.
 * DELETING THE STEP would delete the only thing that waits: with nothing to hold the
 * wizard, a trader whose worker was a few seconds behind would reach the receipt with
 * zero accounts created and no explanation. Prod has had the worker down for stretches.
 * So the step keeps the waiting and loses the asking.
 *
 * `pending` IS NOT `empty`. "The worker has not looked yet" and "this connection owns no
 * accounts" are the same empty array and completely different messages, and showing the
 * second while the first is true reads as a broken integration.
 *
 * EVERY DEAD END HAS A WAY OUT. Three states here cannot commit an account -- the grant
 * owns none, they are all connected already, and the worker never answered -- and
 * `COMPLETE['ctrader-accounts']` is `isCommitted`, so the wizard's own guard will not let
 * any of them move forward. Without an explicit exit the trader is simply stuck on this
 * page, which is what the picker did too.
 */
const POLL_MS = 2000;
const POLL_LIMIT = 30;      // ~60s, after which we stop and say so

export default function CtraderAccountsStep() {
  const { draft, advance, commit, committing } = useFlow();
  const identityId = draft.ctrader_identity_id;

  const [accounts, setAccounts] = useState(null);
  const [pending, setPending] = useState(true);
  const [gaveUp, setGaveUp] = useState(false);
  const [err, setErr] = useState(null);
  /* Bumped by "Try again", and IN THE EFFECT'S DEPENDENCIES — which is the whole reason
   * it is state and not a ref. Clearing the error alone would re-render a page whose
   * poll loop had already returned, leaving a button that visibly does nothing. */
  const [attempt, setAttempt] = useState(0);

  /* The shell's callbacks, read through a ref rather than listed as dependencies.
   * `commit` is a useCallback over `draft`, so naming it would restart the poll every
   * time the draft changed — including the moment commit() itself records the account. */
  const flow = useRef({ commit, advance });
  flow.current = { commit, advance };

  /* THE COMMIT MUST HAPPEN ONCE, and a ref is the only thing that guarantees it here.
   * The poll resolves inside an effect, React 18's StrictMode runs effects twice in
   * development, and `committing` from the shell is state that has not re-rendered yet
   * at the moment the second call would be made. A second provision call is not
   * harmless: it carries the same provision_key, so it REPLAYS rather than duplicating,
   * but it also races the first and the wizard would record whichever landed second. */
  const submitted = useRef(false);

  useEffect(() => {
    if (!identityId) return undefined;
    let tries = 0;
    let live = true;
    let timer = null;

    /* PROVISION EVERYTHING THIS GRANT COVERS, less anything already connected.
     *
     * `claimed` rows are dropped HERE as well as server-side. The server has to filter
     * them anyway -- it is the only side that can close the race with another tab -- but
     * sending them would make "you already have all of these" arrive as a 409 error
     * rather than as the sentence below, and an error is the wrong word for a trader
     * whose accounts are all present and correct. */
    const provision = async (rows) => {
      if (submitted.current) return;
      const fresh = rows.filter((a) => a.claimed !== true).map((a) => a.ctid_trader_account_id);
      if (!fresh.length) return;                 // nothing to do; the copy below explains
      submitted.current = true;
      try {
        await flow.current.commit({ ctraderSelections: fresh });
        if (live) flow.current.advance();
      } catch (ex) {
        if (!live) return;
        // Re-armed, because the failure may well be transient (the shell's provision
        // call is idempotent on provision_key, so a retry replays rather than
        // duplicating) and the button below is the trader's only way to ask again.
        submitted.current = false;
        setErr(ex.message);
      }
    };

    const poll = async () => {
      try {
        const res = await ctraderAccounts(identityId);
        if (!live) return;
        const rows = res.accounts ?? [];
        setAccounts(rows);
        setPending(Boolean(res.pending));
        if (!res.pending) { await provision(rows); return; }
      } catch (ex) {
        if (!live) return;
        setErr(ex.message);
      }
      tries += 1;
      // A bounded wait, then an honest message. Polling forever would leave the user on
      // a spinner that can never resolve if the worker is down.
      if (tries >= POLL_LIMIT) { setGaveUp(true); return; }
      timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [identityId, attempt]);

  if (!identityId) {
    return (
      <>
        <WizardHeading align="center" title="Adding your accounts" />
        <WizardGroup>
          <Alert variant="error">
            <AlertTitle>That connection was not completed</AlertTitle>
            <AlertDescription>Go back a step and authorize cTrader again.</AlertDescription>
          </Alert>
        </WizardGroup>
      </>
    );
  }

  const rows = accounts ?? [];
  const allClaimed = !pending && rows.length > 0 && rows.every((a) => a.claimed === true);
  // The exit, for the three states that can never commit and so can never advance.
  const exit = <Button variant="primary" render={<Link to="/settings/accounts" />}>Go to your accounts</Button>;

  return (
    <>
      <WizardHeading align="center" title="Adding your accounts" />
      <WizardGroup>
        {err ? (
          <Alert variant="error">
            <AlertTitle>We could not add those accounts</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {/* One spinner for both waits — reading the list, and writing the accounts. They
            are one wait to the trader, who asked for neither. */}
        {(pending && !gaveUp) || committing ? (
          <LoadingBlock label={committing ? 'Adding your accounts…' : 'Reading your cTrader accounts…'} />
        ) : null}

        {gaveUp ? (
          <>
            <Alert variant="warning">
              <AlertTitle>Still waiting on cTrader</AlertTitle>
              <AlertDescription>
                Your connection was saved. We will finish reading your accounts shortly —
                you can add them later from your accounts list.
              </AlertDescription>
            </Alert>
            {exit}
          </>
        ) : null}

        {!pending && rows.length === 0 ? (
          <>
            <Alert variant="warning">
              <AlertTitle>This connection has no trading accounts</AlertTitle>
              <AlertDescription>
                cTrader reported no accounts for that login. If you expected some, check
                you authorized the right cTrader profile.
              </AlertDescription>
            </Alert>
            {exit}
          </>
        ) : null}

        {allClaimed ? (
          <>
            <Alert variant="warning">
              <AlertTitle>These accounts are already in PropVexis</AlertTitle>
              <AlertDescription>
                Every account on this cTrader connection has already been added, so there
                is nothing new to bring in.
              </AlertDescription>
            </Alert>
            {exit}
          </>
        ) : null}

        {err && !committing ? (
          <Button
            variant="primary"
            onClick={() => {
              submitted.current = false;
              setErr(null);
              setGaveUp(false);
              setPending(true);
              setAttempt((n) => n + 1);      // restarts the effect, and only this does
            }}
          >
            Try again
          </Button>
        ) : null}
      </WizardGroup>
    </>
  );
}
