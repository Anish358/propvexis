import { config } from '../platform/config.js';
import { query } from '../platform/db.js';
import { paymentsEnabled, createSubscription, cancelSubscription, verifyWebhookSignature, planStateFromEvent } from '../domain/billing/payments.js';

/**
 * Razorpay subscriptions. Every route fails SAFE with a 503 when payments are
 * not fully configured; the webhook verifies its HMAC over the raw request bytes.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function billingRoutes(app, ctx) {
  const { io } = ctx;

  // ---------------------------------------------------------------------------
  // Billing (Razorpay recurring subscriptions). Everything degrades to 503 when
  // payments aren't configured, so the app runs exactly as before until keys are
  // set. Pro is the only purchasable plan for now.
  // ---------------------------------------------------------------------------

  // Public config for the checkout UI: whether payments are live + the publishable
  // key id (safe to expose; the secret never leaves the server).
  app.get('/api/billing/config', async () => ({
    enabled: paymentsEnabled(),
    keyId: config.razorpayKeyId || null,
  }));

  // The current user's latest subscription state (for the Billing page).
  app.get('/api/billing/subscription', { preHandler: app.requireAuth }, async (req) => {
    const { rows } = await query(
      `SELECT razorpay_subscription_id, plan, status, current_end
         FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.uid]
    );
    return { subscription: rows[0] ?? null };
  });

  // Start a Pro subscription at Razorpay, persist a pending row, return what the
  // frontend Checkout needs.
  app.post('/api/billing/subscribe', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ error: 'payments are not configured yet' });
    const plan = req.body?.plan || 'pro';
    if (plan !== 'pro') return reply.code(400).send({ error: 'only the Pro plan is purchasable right now' });
    if (!config.razorpayPlanPro) return reply.code(503).send({ error: 'the Pro plan is not configured' });

    // Refuse a second subscription. Without this, a double-clicked Upgrade button
    // or a back-navigation creates TWO Razorpay subscriptions for one user and
    // bills them twice — and the webhook would happily mark both active. Uses the
    // same "not terminal" set as /cancel, so anything cancellable blocks a re-buy.
    const existing = await query(
      `SELECT razorpay_subscription_id, status FROM subscriptions
        WHERE user_id = $1 AND status NOT IN ('cancelled','completed','expired')
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.uid]
    );
    if (existing.rows.length) {
      return reply.code(409).send({
        error: 'you already have a subscription in progress',
        subscription_id: existing.rows[0].razorpay_subscription_id,
        status: existing.rows[0].status,
      });
    }

    let sub;
    try {
      sub = await createSubscription({ userId: req.user.uid, planId: config.razorpayPlanPro });
    } catch (err) {
      req.log.error({ err: err.message }, 'razorpay subscribe failed');
      return reply.code(502).send({ error: 'could not start subscription' });
    }
    await query(
      `INSERT INTO subscriptions (user_id, razorpay_subscription_id, plan, status)
       VALUES ($1, $2, 'pro', $3) ON CONFLICT (razorpay_subscription_id) DO NOTHING`,
      [req.user.uid, sub.id, sub.status || 'created']
    );
    return { subscription_id: sub.id, key_id: config.razorpayKeyId, short_url: sub.short_url };
  });

  // Cancel the active subscription at cycle end; the webhook then downgrades.
  app.post('/api/billing/cancel', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ error: 'payments are not configured yet' });
    const { rows } = await query(
      `SELECT razorpay_subscription_id FROM subscriptions
        WHERE user_id = $1 AND status NOT IN ('cancelled','completed','expired')
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.uid]
    );
    if (!rows.length) return reply.code(404).send({ error: 'no active subscription' });
    try {
      await cancelSubscription(rows[0].razorpay_subscription_id, true);
    } catch (err) {
      req.log.error({ err: err.message }, 'razorpay cancel failed');
      return reply.code(502).send({ error: 'could not cancel subscription' });
    }
    return { ok: true, message: 'subscription will cancel at the end of the current billing cycle' };
  });

  // Razorpay webhook. No session auth — authenticity IS the HMAC signature over the
  // raw body. Only verified events change any plan.
  app.post('/api/billing/webhook', { config: { rateLimit: false } }, async (req, reply) => {
    if (!paymentsEnabled()) return reply.code(503).send({ error: 'payments not configured' });
    if (!verifyWebhookSignature(req.rawBody, req.headers['x-razorpay-signature'], config.razorpayWebhookSecret)) {
      return reply.code(400).send({ error: 'invalid signature' });
    }
    const state = planStateFromEvent(req.body, { pro: config.razorpayPlanPro });
    if (!state) return { ok: true, ignored: true }; // event we don't act on

    // Resolve the owning user: our sub→user row (authoritative), else notes.user_id.
    const subId = state.subscriptionId;
    const { rows } = await query('SELECT user_id FROM subscriptions WHERE razorpay_subscription_id = $1', [subId]);
    const noteUid = req.body?.payload?.subscription?.entity?.notes?.user_id;
    const userId = rows[0]?.user_id ?? (noteUid ? Number(noteUid) : null);
    if (userId == null) {
      req.log.warn({ subId }, 'billing webhook for unknown subscription — no user mapping');
      return { ok: true, unmapped: true };
    }

    // Idempotent: upsert the subscription state, then set the user's effective plan.
    // The subscription row keeps its tier ('pro') even on downgrade; users.plan
    // becomes 'free' on terminal events.
    await query(
      `INSERT INTO subscriptions (user_id, razorpay_subscription_id, plan, status, current_end)
       VALUES ($1, $2, 'pro', $3, $4)
       ON CONFLICT (razorpay_subscription_id)
       DO UPDATE SET status = EXCLUDED.status, current_end = EXCLUDED.current_end`,
      [userId, subId, state.status, state.currentEnd]
    );
    await query('UPDATE users SET plan = $2 WHERE id = $1', [userId, state.plan]);
    // Tell the browser its entitlements changed. Without this the user pays and the
    // UI stays locked until they happen to reload — a poor moment to feel broken.
    io.to(`user:${userId}`).emit('plan:updated', { plan: state.plan });
    req.log.info({ userId, plan: state.plan, event: req.body?.event }, 'billing webhook applied');
    return { ok: true };
  });
}
