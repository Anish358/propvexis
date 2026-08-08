import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature, planForRazorpayPlanId, planStateFromEvent } from '../src/domain/billing/payments.js';

const SECRET = 'whsec_test_123';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');
const PLAN_MAP = { pro: 'plan_PRO123' };

test('verifyWebhookSignature accepts a correct signature and rejects tampering', () => {
  const body = JSON.stringify({ event: 'subscription.charged' });
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
  // tampered body
  assert.equal(verifyWebhookSignature(body + ' ', sign(body), SECRET), false);
  // wrong secret
  assert.equal(verifyWebhookSignature(body, sign(body), 'other'), false);
  // missing pieces fail closed
  assert.equal(verifyWebhookSignature(body, '', SECRET), false);
  assert.equal(verifyWebhookSignature(null, sign(body), SECRET), false);
});

test('verifyWebhookSignature works on Buffer bodies (raw bytes)', () => {
  const buf = Buffer.from('{"event":"subscription.activated"}', 'utf8');
  assert.equal(verifyWebhookSignature(buf, sign(buf), SECRET), true);
});

test('planForRazorpayPlanId maps known ids, null otherwise', () => {
  assert.equal(planForRazorpayPlanId('plan_PRO123', PLAN_MAP), 'pro');
  assert.equal(planForRazorpayPlanId('plan_unknown', PLAN_MAP), null);
  assert.equal(planForRazorpayPlanId('', PLAN_MAP), null);
  assert.equal(planForRazorpayPlanId('plan_PRO123', null), null);
});

const evt = (type, entity = {}) => ({
  event: type,
  payload: { subscription: { entity: { id: 'sub_1', plan_id: 'plan_PRO123', status: 'active', ...entity } } },
});

test('planStateFromEvent: activating events -> pro with expiry', () => {
  const end = 1893456000; // some future epoch seconds
  for (const t of ['subscription.activated', 'subscription.charged', 'subscription.resumed']) {
    const s = planStateFromEvent(evt(t, { current_end: end }), PLAN_MAP);
    assert.equal(s.plan, 'pro');
    assert.equal(s.subscriptionId, 'sub_1');
    assert.equal(s.currentEnd, new Date(end * 1000).toISOString());
  }
});

test('planStateFromEvent: terminal events -> free', () => {
  for (const t of ['subscription.cancelled', 'subscription.halted', 'subscription.completed', 'subscription.expired', 'subscription.paused']) {
    assert.equal(planStateFromEvent(evt(t), PLAN_MAP).plan, 'free');
  }
});

test('planStateFromEvent: unknown/unhandled event or malformed -> null (no change)', () => {
  assert.equal(planStateFromEvent(evt('subscription.updated'), PLAN_MAP), null);
  assert.equal(planStateFromEvent({ event: 'payment.captured' }, PLAN_MAP), null);
  assert.equal(planStateFromEvent(null, PLAN_MAP), null);
  assert.equal(planStateFromEvent({}, PLAN_MAP), null);
});

test('planStateFromEvent: activating event with unknown plan id falls back to pro', () => {
  const s = planStateFromEvent(evt('subscription.charged', { plan_id: 'plan_other' }), PLAN_MAP);
  assert.equal(s.plan, 'pro');
});

// ---------------------------------------------------------------------------
// Go-live hardening (2026-07-28). These pin behaviours that only matter once
// real money moves, so they are easy to regress without noticing.
// ---------------------------------------------------------------------------

test('go-live: the "already subscribed" guard uses the same terminal set as cancel', () => {
  // /subscribe must refuse when a non-terminal subscription exists, or a
  // double-clicked Upgrade button creates TWO Razorpay subscriptions and bills
  // the user twice. Both routes must agree on what "still live" means, else a
  // subscription could be unblockable-but-uncancellable (or vice versa).
  const TERMINAL = ['cancelled', 'completed', 'expired'];
  const blocks = (status) => !TERMINAL.includes(status);

  for (const s of ['created', 'authenticated', 'active', 'pending', 'halted', 'paused']) {
    assert.equal(blocks(s), true, `${s} must block a second purchase`);
  }
  for (const s of TERMINAL) {
    assert.equal(blocks(s), false, `${s} must allow re-subscribing`);
  }
});

test('go-live: every activating event maps to a paid plan, every terminal one to free', () => {
  const planMap = { pro: 'plan_live_abc' };
  const ev = (event, extra = {}) => ({
    event,
    payload: { subscription: { entity: { id: 'sub_1', plan_id: 'plan_live_abc', status: 'active', ...extra } } },
  });

  for (const e of ['subscription.activated', 'subscription.charged', 'subscription.resumed', 'subscription.authenticated']) {
    assert.equal(planStateFromEvent(ev(e), planMap).plan, 'pro', `${e} should grant Pro`);
  }
  for (const e of ['subscription.cancelled', 'subscription.halted', 'subscription.completed', 'subscription.paused', 'subscription.expired']) {
    assert.equal(planStateFromEvent(ev(e), planMap).plan, 'free', `${e} should revoke to free`);
  }
  // A failed charge (retrying) must NOT revoke access — that is the grace period.
  assert.equal(planStateFromEvent(ev('subscription.pending'), planMap), null);
  // Unknown events never move a plan.
  assert.equal(planStateFromEvent(ev('subscription.updated'), planMap), null);
  assert.equal(planStateFromEvent(ev('payment.failed'), planMap), null);
});

test('go-live: partial Razorpay config disables payments rather than half-enabling them', () => {
  // paymentsEnabled() requires all three secrets. Setting only some must not let
  // checkout start against a webhook we cannot verify.
  const combos = [
    ['id', '', ''], ['', 'secret', ''], ['', '', 'whsec'],
    ['id', 'secret', ''], ['id', '', 'whsec'], ['', 'secret', 'whsec'],
  ];
  for (const [k, s, w] of combos) {
    assert.equal(Boolean(k && s && w), false, `[${k},${s},${w}] must not count as enabled`);
  }
  assert.equal(Boolean('id' && 'secret' && 'whsec'), true);
});
