# Transactional email (SES) — go-live runbook

What sends mail: verification links and password-reset links (`src/platform/mailer.js`).
Everything here is for the **`propvexis.com` identity in `ap-south-1`**, account
`077045714472`.

**Nothing in the app breaks while this is incomplete.** With `MAIL_FROM` unset,
`mailerEnabled()` is false and the link is written to the application log at info
level instead of being sent. Signup, reset and verification all still work.

---

## Status

| Step | State | Who |
|---|---|---|
| 1. `APP_BASE_URL` in SSM, all 3 envs | ✅ done 2026-08-15 | — |
| 2. `ses:SendEmail` on the instance role | ✅ done 2026-08-15 | — |
| 3. SES domain identity + DKIM keys | ✅ created, **PENDING verification** | — |
| 4. DKIM CNAMEs in Route 53 | ✅ added 2026-08-16, resolving; SES still `PENDING` | — |
| 5. Production access (leave the sandbox) | ⚠️ **DENIED on first request — must be appealed** | you |
| 6. `MAIL_FROM` in SSM + restart | ❌ **TODO — do this LAST** | you |

Steps 4 and 5 are independent; do them in either order. **Step 6 must come after
step 4**, for the reason in its section.

---

## 4. Add the DKIM CNAMEs (Route 53)

The identity is created and its keys are issued; DNS is what proves ownership.
These three names are new and do **not** touch the Titan/GoDaddy MX record or its
`secureserver1/2._domainkey` entries — SES uses different selectors, so your
existing business email is unaffected.

```bash
cat > /tmp/ses-dkim.json <<'JSON'
{
  "Comment": "SES Easy DKIM for propvexis.com (transactional mail)",
  "Changes": [
    { "Action": "UPSERT", "ResourceRecordSet": { "Name": "uiglzjh5admw2jhwszl5eo7qi55h64lm._domainkey.propvexis.com", "Type": "CNAME", "TTL": 1800, "ResourceRecords": [{ "Value": "uiglzjh5admw2jhwszl5eo7qi55h64lm.dkim.amazonses.com" }] } },
    { "Action": "UPSERT", "ResourceRecordSet": { "Name": "pl2bpjn2l2ujeuydtsyf6tcfyu53ts5u._domainkey.propvexis.com", "Type": "CNAME", "TTL": 1800, "ResourceRecords": [{ "Value": "pl2bpjn2l2ujeuydtsyf6tcfyu53ts5u.dkim.amazonses.com" }] } },
    { "Action": "UPSERT", "ResourceRecordSet": { "Name": "dx4hergq6nrgvjuwjgv3bv65tlilyipo._domainkey.propvexis.com", "Type": "CNAME", "TTL": 1800, "ResourceRecords": [{ "Value": "dx4hergq6nrgvjuwjgv3bv65tlilyipo.dkim.amazonses.com" }] } }
  ]
}
JSON

aws route53 change-resource-record-sets \
  --hosted-zone-id Z05959933UAL0DICVK1JG \
  --change-batch file:///tmp/ses-dkim.json
```

Verification is usually minutes, occasionally up to 72h. Check:

```bash
aws sesv2 get-email-identity --region ap-south-1 --email-identity propvexis.com \
  --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'
```

Wait for `Verified: true, Dkim: SUCCESS`.

> **If the tokens above are stale** (they are only valid for the identity as
> created), regenerate with
> `aws ses verify-domain-dkim --region ap-south-1 --domain propvexis.com`
> and use the three tokens it returns.

### SPF — deliberately not changed

The zone currently has **no `v=spf1` record**. That was left alone on purpose:
adding one changes how receivers treat your *existing Titan* mail too (from "no
SPF" to "not listed → softfail"), which is real blast radius for a deliverability
gain we don't need. DMARC is `p=quarantine` with relaxed alignment, and
SES-signed mail carries `d=propvexis.com`, so **DKIM alignment alone passes
DMARC**. If you ever do add SPF, it must include both senders:

```
v=spf1 include:amazonses.com include:secureserver.net ~all
```

---

## 5. Leave the SES sandbox

**This is the real blocker for actual users.** In the sandbox SES will only
deliver to *verified* addresses, so a stranger who signs up gets nothing even
once DKIM is green. Current limits: 200/day, 1/sec.

Request production access (Console → SES → Account dashboard → *Request
production access*, or the CLI below). AWS wants to see that bounces and
complaints are handled and that mail is solicited:

```bash
aws sesv2 put-account-details --region ap-south-1 \
  --mail-type TRANSACTIONAL \
  --website-url https://propvexis.com \
  --use-case-description "Transactional email only for PropVexis, a trading-journal SaaS: email-address verification and password-reset links, both triggered by an explicit user action. No marketing or bulk mail. Recipients are only our own registered users. Verification links expire in 24h and reset links in 1h, single-use. Estimated volume under 100 messages/day." \
  --additional-contact-email-addresses <your-email> \
  --contact-language EN \
  --production-access-enabled
```

Approval is typically ~24h.

### ⚠️ The first request was DENIED (2026-08-16) — case `178689643800463`

`aws sesv2 get-account --region ap-south-1 --query Details.ReviewDetails` returns
`{"Status": "DENIED", "CaseId": "178689643800463"}`.

A denial is **not** final and re-submitting the same request does not help — you
reply in the existing case. The reason is only visible in **AWS Console → Support
→ Case 178689643800463** (the Support *API* needs a paid support plan, so it
cannot be read from the CLI), and AWS also emails it to the account contact.

First requests are commonly denied for a young account, or for a use-case
description that doesn't spell out bounce/complaint handling. Read the actual
reason first, then reply covering it. The facts below are all true of this
account and are what AWS looks for:

- **Purely transactional, and only two triggers exist in the code**: an
  address-verification link on signup, and a password-reset link the user asks
  for. There is no marketing, bulk, or newsletter path in the product at all.
- **No purchased or imported lists.** Every recipient typed their own address
  into our signup form; mail only ever goes to that same address.
- **Bounce and complaint handling is already active**: SES account-level
  suppression is enabled for both `BOUNCE` and `COMPLAINT`
  (`aws sesv2 get-account --query SuppressionAttributes.SuppressedReasons`
  → `["BOUNCE","COMPLAINT"]`), and account `EnforcementStatus` is `HEALTHY`.
  Suppressed addresses are therefore dropped automatically before send.
- **Volume is small and self-limiting**: under ~100 messages/day, and both
  endpoints are rate-limited server-side (reset requests 5/hour per IP,
  verification resend 5/hour).
- **Authenticated**: DKIM is configured for propvexis.com, and the domain
  publishes DMARC `p=quarantine`.
- **The links are short-lived and single-use**: verification 24h, reset 1h, each
  redeemable exactly once.
- **Unsubscribe does not apply** — these are security notifications a user
  triggers about their own account, not solicited marketing.
- The product is live at https://app.propvexis.com.

If the denial cites *sending history*, the practical route is to send genuine
mail to verified recipients inside the sandbox for a few days, then reply to the
case pointing at that record.

### While still in the sandbox — test with a verified recipient

```bash
aws sesv2 create-email-identity --region ap-south-1 --email-identity <your-email>
# click the confirmation link AWS mails you, then:
aws sesv2 get-email-identity --region ap-south-1 --email-identity <your-email> \
  --query VerifiedForSendingStatus
```

That address can then receive real verification/reset mail on app-dev.

---

## 6. Turn it on (do this LAST)

⚠️ **Do not set `MAIL_FROM` before the domain shows `Verified: true`.** Setting it
flips `mailerEnabled()` to true, which *stops* the log-only fallback. If SES
cannot send at that point, users get no link **and** no logged link — strictly
worse than leaving it off.

Start with dev, confirm a real email arrives, then staging, then prod:

```bash
for env in dev staging prod; do
  aws ssm put-parameter --region ap-south-1 \
    --name /amey-journal/$env/MAIL_FROM \
    --value 'PropVexis <no-reply@propvexis.com>' \
    --type String --overwrite
done
```

`MAIL_FROM` must stay `no-reply@propvexis.com` — the IAM policy
(`amey-journal-ses-send`) is conditioned on that exact address, so a different
sender is denied by IAM, not just by SES. Change both together.

Optional: `MAIL_REPLY_TO` (e.g. `support@propvexis.com`, a real Titan mailbox).
Without it, replies go to the no-reply address and bounce.

Secrets load **at boot only**, so restart the target env:

```bash
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72
pm2 restart amey-backend-dev --update-env     # or amey-backend-staging / amey-backend
pm2 logs amey-backend-dev --lines 40 | grep -i mail
```

Expect `transactional email enabled (SES)`. If you instead see
`transactional email disabled — ... missing: [...]`, the parameter did not reach
that env; check the SSM prefix.

**One pm2 daemon runs all three environments** — never `pm2 kill` / `pm2 update`
to fix one env; that cycles prod too.

---

## Verify end to end

```bash
# always 200, identical for known and unknown addresses (anti-enumeration)
curl -s -X POST https://app-dev.propvexis.com/api/auth/password/forgot \
  -H 'content-type: application/json' -d '{"email":"<verified-address>"}'
```

The mail should arrive within seconds. Then check the headers show
`dkim=pass header.d=propvexis.com` and `dmarc=pass`.

Sending metrics: `mailerStatus` counters (`sent`, `failed`, `logged`) and the
`mail send failed` log line carry the SES error verbatim.

---

## Rollback

Unset `MAIL_FROM` and restart — the app returns to log-only, and every flow keeps
working:

```bash
aws ssm delete-parameter --region ap-south-1 --name /amey-journal/prod/MAIL_FROM
```

Removing the DKIM records or the IAM policy is not necessary for rollback and
would only slow a retry.
