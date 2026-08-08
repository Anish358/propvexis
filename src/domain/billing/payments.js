// Razorpay recurring-subscription helpers. The security-critical bits
// (signature verification, event→plan reducer, plan-id mapping) are pure and
// unit-tested; only createSubscription/cancelSubscription touch the network.
// Uses global fetch + node:crypto — no new dependency.
import crypto from 'node:crypto';
import { config } from '../../platform/config.js';

// Payments are live only when all three secrets are present. Absent → billing
// routes 503 and the app behaves exactly as before (prod parity today).
export function paymentsEnabled() {
  return Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);
}

// Our plan slug for a given Razorpay plan id. planMap e.g. { pro: 'plan_abc' }.
// Pure so it's testable without config/env.
export function planForRazorpayPlanId(planId, planMap) {
  if (!planId || !planMap) return null;
  for (const [slug, id] of Object.entries(planMap)) {
    if (id && id === planId) return slug;
  }
  return null;
}

// Verify Razorpay's webhook signature: HMAC-SHA256(rawBody, secret) hex, compared
// timing-safe to the x-razorpay-signature header. rawBody must be the EXACT bytes
// Razorpay sent (Buffer or string) — re-serialized JSON would not match.
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret || rawBody == null) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Reduce a Razorpay subscription webhook event to the plan state it implies, or
// null for events we don't act on. Pure. `planMap` maps Razorpay plan ids → our
// slugs; a recognized activating event with an unknown plan id falls back to the
// single paid tier we currently sell ('pro').
export function planStateFromEvent(event, planMap) {
  const type = event?.event;
  const sub = event?.payload?.subscription?.entity;
  if (!type || !sub) return null;
  const currentEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
  const paidSlug = planForRazorpayPlanId(sub.plan_id, planMap) || 'pro';

  switch (type) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
    case 'subscription.authenticated':
      return { plan: paidSlug, status: sub.status || 'active', currentEnd, subscriptionId: sub.id };
    case 'subscription.cancelled':
    case 'subscription.halted':
    case 'subscription.completed':
    case 'subscription.paused':
    case 'subscription.expired':
      return { plan: 'free', status: sub.status || type.split('.')[1], currentEnd, subscriptionId: sub.id };
    default:
      return null; // no plan change
  }
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
}

// Create a recurring subscription for a user against a Razorpay Plan id.
// Returns { id, short_url, status }. `notes.user_id` lets us (belt) trace back,
// but our own subscriptions table is the authoritative sub→user mapping.
export async function createSubscription({ userId, planId }) {
  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { authorization: authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 120,          // Razorpay requires a bound; 120 monthly cycles (~10y)
      customer_notify: 1,
      notes: { user_id: String(userId) },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `razorpay subscription create failed (${res.status})`);
  return { id: data.id, short_url: data.short_url, status: data.status };
}

// Cancel a subscription (at cycle end by default). The resulting webhook flips
// the user back to free.
export async function cancelSubscription(subscriptionId, atCycleEnd = true) {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: { authorization: authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `razorpay cancel failed (${res.status})`);
  return { id: data.id, status: data.status };
}
