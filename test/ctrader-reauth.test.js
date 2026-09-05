import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CtraderConnection } from '../worker/ctrader/connection.js';
import { frame, FrameReader } from '../worker/ctrader/framing.js';
import { loadProto, encodeMessage } from '../worker/ctrader/proto.js';
import { identitiesAwaitingDiscoveryQuery } from '../src/domain/sync/ctraderIdentities.js';

const proto = await loadProto();

class FakeSocket extends EventEmitter {
  constructor() { super(); this.written = []; this.destroyed = false; this.reader = new FrameReader(); }
  write(buf) { for (const f of this.reader.push(buf)) this.written.push(f); return true; }
  destroy() { this.destroyed = true; }
}

function wired() {
  const sock = new FakeSocket();
  const conn = new CtraderConnection({
    isLive: false, clientId: 'c', clientSecret: 's', log: { error() {} },
    connect: (_o, cb) => { setImmediate(cb); return sock; },
  });
  conn.proto = proto;
  conn.socket = sock;
  sock.on('data', (c) => conn.onData(c));
  return { sock, conn };
}
const reply = (sock, typeName, body, id) =>
  sock.emit('data', frame(encodeMessage(proto, typeName, body, id)));

test('AUTHORIZING AN ALREADY-AUTHORIZED ACCOUNT IS NOT AN ERROR', async () => {
  /* THE BUG THIS FIXES, STRAIGHT OUT OF THE PROD LOG:
   *
   *   ctrader job failed, job:2,
   *   err: ctrader ALREADY_LOGGED_IN: Trading account is already authorized in
   *        this channel
   *
   * ...four times in a row, so the account never synced and the job sat queued
   * forever, which the dashboard reported as "already syncing".
   *
   * The worker re-authorized on every job, with a comment claiming that was
   * "idempotent and cheap". It is neither: the sockets are long-lived and serve
   * unlimited accounts, so the SECOND job for an account is always a re-auth, and
   * cTrader refuses it. From our side the outcome is the one we wanted — the
   * account IS authorized — so this is success, not failure. */
  const { sock, conn } = wired();
  const p = conn.authAccount(4242, 'tok');
  const id = proto.ProtoMessage.decode(sock.written[0]).clientMsgId;
  reply(sock, 'ProtoOAErrorRes',
    { ctidTraderAccountId: 4242, errorCode: 'ALREADY_LOGGED_IN', description: 'already authorized' }, id);
  await p;   // must resolve, not reject
  assert.equal(conn.accounts.has('4242'), true, 'and the account counts as authorized');
  conn.close();
});

test('any OTHER auth error still fails, loudly', async () => {
  // Swallowing every error here would turn an expired token into a silent no-op
  // and a job that "succeeds" having read nothing.
  const { sock, conn } = wired();
  const p = conn.authAccount(4242, 'bad');
  const id = proto.ProtoMessage.decode(sock.written[0]).clientMsgId;
  reply(sock, 'ProtoOAErrorRes',
    { ctidTraderAccountId: 4242, errorCode: 'CH_ACCESS_TOKEN_INVALID', description: 'nope' }, id);
  await assert.rejects(p, /CH_ACCESS_TOKEN_INVALID/);
  assert.equal(conn.accounts.has('4242'), false);
  conn.close();
});

test('an account already authorized on this socket is not re-authorized at all', async () => {
  // The cheapest fix for a refusal is not making the request. The connection
  // already tracks which accounts it has authorized, for reconnects.
  const { sock, conn } = wired();
  conn.accounts.set('4242', 'tok');
  await conn.ensureAccount(4242, 'tok');
  assert.equal(sock.written.length, 0, 'no request should go out');
  conn.close();
});

test('a reconnect forgets its authorizations, so they happen again', async () => {
  /* The set lives on the CONNECTION. When the socket drops, the new one has
   * authorized nobody — and cTrader agrees, so the re-auth is correct there. A
   * cache that outlived the socket would skip the auth the new socket needs. */
  const { sock, conn } = wired();
  conn.accounts.set('4242', 'tok');
  conn.onDown(new Error('socket closed'));
  assert.equal(conn.accounts.size, 0, 'a dead socket has authorized nobody');
  conn.close();
});

test('AN IDENTITY THAT OWNS NO ACCOUNTS IS NOT POLLED FOREVER', () => {
  /* ALSO STRAIGHT OUT OF THE PROD LOG:
   *
   *   ctrader discovery done, identity:1, found:0
   *   ctrader discovery done, identity:2, found:0
   *
   * The query asked for identities with NO rows in ctrader_discovered_accounts.
   * An identity that legitimately owns zero trading accounts never gets a row, so
   * it qualified again on the very next tick -- forever, opening a socket and
   * making two requests against a rate-limited API every time.
   *
   * "Has it been looked at" and "did it find anything" are different questions.
   * discovered_at answers the first. */
  const q = identitiesAwaitingDiscoveryQuery(5);
  assert.match(q.text, /i\.discovered_at IS NULL/,
    'the filter must be "not yet looked at", not "found nothing"');
});
