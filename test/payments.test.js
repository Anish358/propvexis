import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature, planForRazorpayPlanId, planStateFromEvent } from '../src/payments.js';

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
