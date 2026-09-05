import React, { useEffect, useState } from 'react';
import {
  Alert, AlertDescription, AlertTitle, Button, ConsentField, LoadingBlock,
  WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { ctraderAccounts, provisionCtraderAccounts } from '../../../lib/api.js';

/* Which of this cTrader grant's accounts to journal.
 *
 * WHY THIS STEP EXISTS AT ALL. Every other platform's credential identifies ONE
 * trading account, so `connect` knows what it is making. A cTrader grant is at
 * cTID level and can cover several accounts across two environments, so
 * authorizing tells us the connection exists and nothing about which accounts the
 * trader wants. Guessing "all of them" would silently create accounts — and
 * consume plan slots — for demo accounts they opened once and forgot.
 *
 * WHY IT POLLS. Listing a cTID's accounts needs ProtoOAGetAccountListByAccessTokenReq
 * on a protobuf socket, which is the worker's job; the web tier has no protobuf
 * client and growing one would mean two implementations of app auth and reconnect.
 * So the worker fills the table and this reads it.
 *
 * `pending` IS NOT `empty`. "The worker has not looked yet" and "this connection
 * owns no accounts" are the same empty array and completely different messages,
 * and showing the second while the first is true reads as a broken integration.
 */
const POLL_MS = 2000;
const POLL_LIMIT = 30;      // ~60s, after which we stop and say so

export default function CtraderAccountsStep() {
  const { draft, advance, commit, committing } = useFlow();
  const identityId = draft.ctrader_identity_id;

  const [accounts, setAccounts] = useState(null);
  const [pending, setPending] = useState(true);
  const [gaveUp, setGaveUp] = useState(false);
  const [picked, setPicked] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!identityId) return undefined;
    let tries = 0;
    let live = true;
    let timer = null;

    const poll = async () => {
      try {
        const res = await ctraderAccounts(identityId);
        if (!live) return;
        setAccounts(res.accounts ?? []);
        setPending(Boolean(res.pending));
        if (!res.pending) return;
      } catch (ex) {
        if (!live) return;
        setErr(ex.message);
      }
      tries += 1;
      // A bounded wait, then an honest message. Polling forever would leave the
      // user on a spinner that can never resolve if the worker is down.
      if (tries >= POLL_LIMIT) { setGaveUp(true); return; }
      timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [identityId]);

  const toggle = (ctid) => setPicked((prev) => (
    prev.includes(ctid) ? prev.filter((x) => x !== ctid) : [...prev, ctid]
  ));

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    try {
      await commit({ ctraderSelections: picked });
      advance();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  if (!identityId) {
    return (
      <>
        <WizardHeading align="center" title="Choose your accounts" />
        <WizardGroup>
          <Alert variant="error">
            <AlertTitle>That connection was not completed</AlertTitle>
            <AlertDescription>Go back a step and authorize cTrader again.</AlertDescription>
          </Alert>
        </WizardGroup>
      </>
    );
  }

  return (
    <>
      <WizardHeading align="center" title="Choose your accounts" />
      <WizardGroup>
        {err ? (
          <Alert variant="error">
            <AlertTitle>We could not add those accounts</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {pending && !gaveUp ? <LoadingBlock label="Reading your cTrader accounts…" /> : null}

        {gaveUp ? (
          <Alert variant="warning">
            <AlertTitle>Still waiting on cTrader</AlertTitle>
            <AlertDescription>
              Your connection was saved. We will finish reading your accounts shortly —
              you can add them later from your accounts list.
            </AlertDescription>
          </Alert>
        ) : null}

        {!pending && accounts && accounts.length === 0 ? (
          <Alert variant="warning">
            <AlertTitle>This connection has no trading accounts</AlertTitle>
            <AlertDescription>
              cTrader reported no accounts for that login. If you expected some, check
              you authorized the right cTrader profile.
            </AlertDescription>
          </Alert>
        ) : null}

        {accounts && accounts.length > 0 ? (
          <form onSubmit={submit}>
            {accounts.map((a) => (
              <ConsentField
                key={a.ctid_trader_account_id}
                id={`ct-${a.ctid_trader_account_id}`}
                checked={picked.includes(a.ctid_trader_account_id)}
                onCheckedChange={() => toggle(a.ctid_trader_account_id)}
              >
                {a.trader_login ?? a.ctid_trader_account_id}
                {a.broker_name ? ` · ${a.broker_name}` : ''}
                {a.is_live ? ' · Live' : ' · Demo'}
              </ConsentField>
            ))}
            <Button type="submit" variant="primary" disabled={!picked.length || committing}>
              {committing ? 'Adding…' : `Add ${picked.length || ''} account${picked.length === 1 ? '' : 's'}`}
            </Button>
          </form>
        ) : null}
      </WizardGroup>
    </>
  );
}
