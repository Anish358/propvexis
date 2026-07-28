# Razorpay go-live runbook

The payments code is shipped and **feature-flagged off**. Everything below is
account/dashboard work that cannot be automated — Razorpay KYC requires business
documents and a human. Once the four values are in SSM, billing turns itself on;
no code change or redeploy of the app logic is needed.

Fails safe at every step: with keys missing, `paymentsEnabled()` is false, the
billing routes return 503, and the app behaves exactly as it does today.

---

## 1. Razorpay account + KYC

1. Sign up at <https://dashboard.razorpay.com>. **Test mode works immediately** —
   you can do steps 2–5 and a full end-to-end test before KYC clears.
2. Submit KYC (PAN, business proof, bank account). Live keys stay disabled until
   this is approved; budget days, not minutes.
3. Enable the **Subscriptions** product (Dashboard → Subscriptions). It is not on
   by default on all accounts.

## 2. Create the Pro plan

Dashboard → Subscriptions → Plans → **New Plan**:

| Field | Value |
|---|---|
| Billing frequency | Monthly, every 1 month |
| Amount | **₹399** |
| Plan name | PropVexis Pro |
| Description | Monthly Pro subscription |

Copy the plan id (`plan_XXXXXXXX`). Create it **twice** — once in Test mode, once
in Live mode; the ids differ.

## 3. Configure the webhook

Dashboard → Settings → Webhooks → **Add New Webhook**:

- **URL:** `https://app.propvexis.com/api/billing/webhook`
- **Secret:** generate a long random string and keep it — it goes in SSM as
  `RAZORPAY_WEBHOOK_SECRET`. This is what makes the endpoint trustworthy; it has
  no session auth, authenticity *is* the HMAC over the raw body.
- **Active events** — all of these, or plan changes will silently not apply:
  `subscription.activated`, `subscription.charged`, `subscription.authenticated`,
  `subscription.resumed`, `subscription.pending`, `subscription.halted`,
  `subscription.cancelled`, `subscription.paused`, `subscription.completed`,
  `subscription.expired`

## 4. Put the four values in SSM

The webhook secret and API secret are real secrets → **SecureString**. Run these
locally (the `cliadmin` profile has SSM write; the box only has read):

```bash
R=ap-south-1; P=/amey-journal/prod

aws ssm put-parameter --region $R --overwrite --type String \
  --name $P/RAZORPAY_KEY_ID        --value 'rzp_live_xxxxxxxx'
aws ssm put-parameter --region $R --overwrite --type SecureString \
  --name $P/RAZORPAY_KEY_SECRET    --value 'xxxxxxxxxxxxxxxx'
aws ssm put-parameter --region $R --overwrite --type SecureString \
  --name $P/RAZORPAY_WEBHOOK_SECRET --value 'the-secret-from-step-3'
aws ssm put-parameter --region $R --overwrite --type String \
  --name $P/RAZORPAY_PLAN_PRO      --value 'plan_xxxxxxxx'
```

Then pick them up (SSM is read once at boot):

```bash
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72 \
  'pm2 restart amey-backend --update-env'
```

> Do **not** paste secrets into a chat or a commit. `RAZORPAY_KEY_ID` is public by
> design (it ships in the browser bundle); the other two are not.

## 5. Verify

```bash
# 1. Payments report enabled, and the public key id is exposed (expected).
curl -s https://app.propvexis.com/api/billing/config
#    -> {"enabled":true,"keyId":"rzp_live_..."}

# 2. A forged webhook must be rejected. This is the one that matters.
curl -s -X POST https://app.propvexis.com/api/billing/webhook \
  -H 'content-type: application/json' -H 'x-razorpay-signature: bogus' \
  -d '{"event":"subscription.activated"}'
#    -> {"error":"invalid signature"}   (400)
```

Then in **Test mode**, from a real browser: Billing → Upgrade → pay with a
[test card](https://razorpay.com/docs/payments/payments/test-card-details/)
(`4111 1111 1111 1111`, any future expiry/CVV). Expected:

- `users.plan` flips to `pro` **only** after the webhook arrives — the checkout
  closing is not what grants the plan.
- The UI unlocks **without a reload** (the webhook emits `plan:updated` and the
  browser re-reads `/api/auth/me`).
- Dashboard → Webhooks → Deliveries shows 2xx responses.
- A second Upgrade click returns **409**, not a second subscription.
- `pm2 logs amey-backend | grep "billing webhook applied"` shows the event.

Then repeat step 4 with the **live** key id / secret / plan id.

## Boot-time diagnostics

The app names its own misconfiguration in the log:

- `PAYMENTS DISABLED: Razorpay is partially configured` + the missing var names —
  billing 503s. Partial config fails safe but is otherwise invisible.
- `PAYMENTS: keys are set but RAZORPAY_PLAN_PRO is missing` — checkout would 503.

## Design notes worth knowing before you touch this

- **The webhook is the only thing that writes `users.plan`**, and only on a valid
  signature. A user completing checkout does not grant themselves anything.
- **Raw-body parsing** is required for the HMAC — re-serialised JSON will not
  match. `src/app.js` registers a raw-body parser for this route specifically.
- **Idempotent** — Razorpay retries. The subscription row upserts on
  `razorpay_subscription_id` and the plan write is a plain `UPDATE`, so replays
  are harmless.
- **`subscription.pending` deliberately does not revoke access.** A failed charge
  starts Razorpay's retry cycle; revoking immediately would punish a user for a
  bank blip. `halted` (retries exhausted) is what downgrades.
- **Unknown plan id on an activating event falls back to `pro`.** Safe while Pro
  is the only purchasable tier — but when Premium is added, add it to the plan map
  in the webhook handler, or Premium buyers would be granted Pro.
- **Only Pro is purchasable.** Premium (₹1499) is priced against MetaApi's metered
  COGS, which no longer applies now that the MT5 farm is self-hosted — those
  numbers need re-deriving before Premium goes on sale.

## Rollback

Delete any one of the three secrets and restart:

```bash
aws ssm delete-parameter --region ap-south-1 --name /amey-journal/prod/RAZORPAY_WEBHOOK_SECRET
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72 'pm2 restart amey-backend --update-env'
```

`paymentsEnabled()` goes false, billing 503s, and existing `users.plan` values are
untouched — nobody loses access, they just cannot buy or cancel in-app.
