import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CtraderConnection, HOSTS, backoffMs } from '../worker/ctrader/connection.js';
import { frame, FrameReader } from '../worker/ctrader/framing.js';
import { loadProto, encodeMessage } from '../worker/ctrader/proto.js';

const proto = await loadProto();
// Enum values encode as NUMBERS. protobufjs's verify() rejects the string name,
// which is the same strictness encodeMessage relies on to catch a typo'd field.
const EXEC = proto.root.lookupEnum('ProtoOAExecutionType').values;

/** A socket that records what we wrote and lets a test push replies back. */
class FakeSocket extends EventEmitter {
  constructor() { super(); this.written = []; this.destroyed = false; this.reader = new FrameReader(); }
  write(buf) { for (const f of this.reader.push(buf)) this.written.push(f); return true; }
  destroy() { this.destroyed = true; }
}

function connected({ isLive = false } = {}) {
  const sock = new FakeSocket();
  const conn = new CtraderConnection({
    isLive, clientId: 'cid', clientSecret: 'sec',
    connect: (_opts, onReady) => { setImmediate(onReady); return sock; },
    log: { error() {} },
  });
  return { sock, conn };
}

const reply = (conn, sock, typeName, body, clientMsgId) => {
  const buf = encodeMessage(proto, typeName, body, clientMsgId);
  sock.emit('data', frame(buf));
};

test('demo and live are different endpoints, and both are port 5035', () => {
  // Landmine 10.7. An account authorized on the wrong socket fails in a way that
  // reads as a permissions problem, so this is never inferred at call time.
  assert.equal(HOSTS.demo.host, 'demo.ctraderapi.com');
  assert.equal(HOSTS.live.host, 'live.ctraderapi.com');
  assert.equal(HOSTS.demo.port, 5035);
  assert.equal(HOSTS.live.port, 5035);
});

test('opening the socket authenticates the APPLICATION first', async () => {
  const { sock, conn } = connected();
  const opening = conn.open();
  // Let the connect callback fire and the auth request be written.
  await new Promise((r) => { setImmediate(r); });
  await new Promise((r) => { setImmediate(r); });
  assert.equal(sock.written.length, 1, 'exactly one message before any reply');
  const sent = proto.ProtoMessage.decode(sock.written[0]);
  assert.equal(sent.payloadType, proto.types.PROTO_OA_APPLICATION_AUTH_REQ);
  reply(conn, sock, 'ProtoOAApplicationAuthRes', {}, sent.clientMsgId);
  await opening;
  assert.equal(conn.appAuthed, true);
  conn.close();
});

test('a reply is matched to its request by clientMsgId, not by arrival order', async () => {
  /* THE BUG THIS PREVENTS. This socket also delivers UNSOLICITED execution
   * events, and two requests can be outstanding at once. Resolving "the next
   * message" against "the last request" would hand a deal list to whoever asked
   * for a trader record. */
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c));
  const a = conn.request('ProtoOATraderReq', { ctidTraderAccountId: 1 });
  const b = conn.request('ProtoOATraderReq', { ctidTraderAccountId: 2 });
  const [idA, idB] = sock.written.map((w) => proto.ProtoMessage.decode(w).clientMsgId);
  // Answer them OUT OF ORDER.
  reply(conn, sock, 'ProtoOATraderRes',
    { ctidTraderAccountId: 2, trader: { ctidTraderAccountId: 2, depositAssetId: 1, balance: 0, moneyDigits: 2 } }, idB);
  reply(conn, sock, 'ProtoOATraderRes',
    { ctidTraderAccountId: 1, trader: { ctidTraderAccountId: 1, depositAssetId: 1, balance: 0, moneyDigits: 2 } }, idA);
  assert.equal(Number((await a).ctidTraderAccountId), 1);
  assert.equal(Number((await b).ctidTraderAccountId), 2);
  conn.close();
});

test('retryAfter is SECONDS and is converted before it reaches a millisecond clock', async () => {
  /* THE UNIT BUG THIS PREVENTS. ProtoOAErrorRes.retryAfter is documented as
   * "amount of seconds until related payload type will be unlocked". Passing 30
   * straight to a ms clock backs off for THIRTY MILLISECONDS and hammers back
   * into the rate limit immediately — the same class of error as the cTrader
   * moneyDigits 100x trap, and just as invisible. */
  let clock = 1_000_000;
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c)); conn.now = () => clock;
  const p = conn.request('ProtoOADealListReq', { ctidTraderAccountId: 1 });
  const id = proto.ProtoMessage.decode(sock.written[0]).clientMsgId;
  reply(conn, sock, 'ProtoOAErrorRes',
    { errorCode: 'BLOCKED_PAYLOAD_TYPE', description: 'slow down', retryAfter: 30 }, id);
  await assert.rejects(p, /BLOCKED_PAYLOAD_TYPE/);
  assert.ok(conn.throttle.nextSlotAt() >= clock + 30_000,
    'a 30-second retryAfter must block for 30 seconds, not 30 milliseconds');
  conn.close();
});

test('a token invalidation re-authorizes ONLY the named accounts', async () => {
  /* Landmine 10.1, verbatim from OpenApiMessages.proto: the session to the named
   * accounts is terminated "but the existing connections with the other trader's
   * accounts are maintained". Tearing down the whole socket would disconnect
   * every other user's account on it for one user's token refresh. */
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c));
  conn.accounts.set('111', 'tok'); conn.accounts.set('222', 'tok');
  const seen = [];
  conn.on('accountsInvalidated', (e) => seen.push(e));
  let wentDown = false;
  conn.on('down', () => { wentDown = true; });
  reply(conn, sock, 'ProtoOAAccountsTokenInvalidatedEvent',
    { ctidTraderAccountIds: [111], reason: 'token was refreshed' });
  assert.deepEqual(seen[0].ids, ['111']);
  assert.equal(conn.accounts.has('111'), false, 'the invalidated account must be forgotten');
  assert.equal(conn.accounts.has('222'), true, 'the others keep working');
  assert.equal(wentDown, false, 'the SOCKET survives — only those sessions ended');
  conn.close();
});

test('an execution event is emitted, not mistaken for a reply', async () => {
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c));
  const got = [];
  conn.on('execution', (m) => got.push(m));
  reply(conn, sock, 'ProtoOAExecutionEvent',
    { ctidTraderAccountId: 5, executionType: EXEC.ORDER_FILLED });
  assert.equal(got.length, 1);
  assert.equal(Number(got[0].ctidTraderAccountId), 5);
  conn.close();
});

test('a half-open socket is detected by SILENCE, not by write failures', () => {
  /* A half-open TCP connection accepts writes forever and delivers nothing. To a
   * heartbeat that only writes, that is indistinguishable from a quiet market —
   * the connector would look healthy and silently stop ingesting trades. */
  let clock = 0;
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c)); conn.now = () => clock;
  conn.lastInbound = 0;
  let downErr = null;
  conn.on('down', (e) => { downErr = e; });
  conn.startTimers();
  clock = 40_000;
  conn.hb._onTimeout();
  assert.match(String(downErr), /half-open|inbound/i);
  conn.close();
});

test('reconnect backoff grows, is capped, and is jittered', () => {
  // Both sockets die together whenever the box loses network. Without jitter they
  // reconnect in lockstep forever, doubling every burst against one endpoint.
  assert.ok(backoffMs(0, () => 0) < backoffMs(3, () => 0));
  assert.ok(backoffMs(99, () => 1) <= 60_000, 'capped');
  assert.notEqual(backoffMs(3, () => 0), backoffMs(3, () => 1), 'jittered');
});

test('a desynchronised stream brings the connection down rather than stalling', () => {
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c));
  let downErr = null;
  conn.on('down', (e) => { downErr = e; });
  const bad = Buffer.alloc(4); bad.writeUInt32BE(0x7fffffff, 0);
  sock.emit('data', bad);
  assert.match(String(downErr), /frame/i);
  conn.close();
});

test('going down rejects every in-flight request instead of hanging them', async () => {
  // A caller awaiting a reply that can never arrive would hold its job's lease
  // until it expired, which is the silent-spin failure in a different costume.
  const { sock, conn } = connected();
  conn.proto = proto; conn.socket = sock; sock.on('data', (c) => conn.onData(c));
  const p = conn.request('ProtoOATraderReq', { ctidTraderAccountId: 1 });
  conn.onDown(new Error('network gone'));
  await assert.rejects(p, /network gone/);
  conn.close();
});
