import tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { frame, FrameReader } from './framing.js';
import { loadProto, encodeMessage, decodeMessage } from './proto.js';
import { HistoricalThrottle } from './throttle.js';

// One long-lived protobuf socket, and everything that keeps it honest.
//
// TWO SOCKETS SERVE EVERY ACCOUNT PROPVEXIS WILL EVER HAVE. Spotware's own
// guidance: "At most, you should create two connections: one for demo accounts
// and one for live accounts. Each connection can support an unlimited number of
// accounts of a certain type." That is why this connector is orthogonal to the
// 1000-user bar -- its socket count does not grow with users.
//
// The environments are DISJOINT (landmine 10.7): a live connection cannot see a
// demo account, and asking it to fails in a way that reads as a permissions
// problem rather than a routing mistake. is_live_env is stored at discovery so
// the question is answered once.

export const HOSTS = Object.freeze({
  live: { host: 'live.ctraderapi.com', port: 5035 },
  demo: { host: 'demo.ctraderapi.com', port: 5035 },
});

/** Spotware disconnects an idle socket; 10s is their documented cadence. */
export const HEARTBEAT_MS = 10_000;
/** No inbound traffic at all for this long means the socket is dead to us. */
export const INBOUND_TIMEOUT_MS = 35_000;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Reconnect backoff, exponential with jitter.
 *
 * JITTER IS NOT DECORATION. Both sockets die together whenever the box loses
 * network or Spotware restarts, and without jitter they would reconnect in
 * lockstep forever, doubling every burst against the same endpoint.
 */
export const backoffMs = (attempt, rand = Math.random) => {
  const base = Math.min(1000 * 2 ** Math.min(attempt, 6), 60_000);
  return Math.round(base / 2 + base * rand() / 2);
};

export class CtraderConnection extends EventEmitter {
  constructor({
    isLive, clientId, clientSecret,
    connect = tls.connect, log = console, now = Date.now,
  } = {}) {
    super();
    this.env = isLive ? 'live' : 'demo';
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.connectImpl = connect;
    this.log = log;
    this.now = now;

    this.socket = null;
    this.reader = new FrameReader();
    this.proto = null;
    this.pending = new Map();      // clientMsgId -> {resolve, reject, timer}
    this.msgSeq = 0;
    this.appAuthed = false;
    /** ctidTraderAccountId -> accessToken, so a reconnect can re-authorize them all. */
    this.accounts = new Map();
    this.attempts = 0;
    this.lastInbound = 0;
    this.throttle = new HistoricalThrottle();
    this.closed = false;
  }

  async open() {
    this.proto ??= await loadProto();
    const { host, port } = HOSTS[this.env];
    await new Promise((resolve, reject) => {
      const sock = this.connectImpl({ host, port, servername: host }, () => resolve());
      sock.on('data', (c) => this.onData(c));
      sock.on('error', (e) => this.onDown(e));
      sock.on('close', () => this.onDown(new Error('socket closed')));
      sock.once('error', reject);
      this.socket = sock;
    });
    this.lastInbound = this.now();
    await this.authApp();
    this.attempts = 0;
    this.startTimers();
    this.emit('open');
  }

  async authApp() {
    await this.request('ProtoOAApplicationAuthReq',
      { clientId: this.clientId, clientSecret: this.clientSecret });
    this.appAuthed = true;
  }

  /** Authorize one trading account on this socket, and remember it for reconnects. */
  async authAccount(ctidTraderAccountId, accessToken) {
    await this.request('ProtoOAAccountAuthReq', { ctidTraderAccountId, accessToken });
    this.accounts.set(String(ctidTraderAccountId), accessToken);
  }

  startTimers() {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
      if (!this.socket || this.socket.destroyed) return;
      // Liveness is two-sided. We send a heartbeat AND we require inbound traffic:
      // a half-open TCP connection happily accepts writes forever while delivering
      // nothing, which looks identical to a quiet market.
      if (this.now() - this.lastInbound > INBOUND_TIMEOUT_MS) {
        this.onDown(new Error('no inbound traffic — socket is half-open'));
        return;
      }
      try {
        this.send('ProtoHeartbeatEvent', {});
      } catch (err) { this.onDown(err); }
    }, HEARTBEAT_MS);
    this.hb.unref?.();
  }

  send(typeName, body, clientMsgId) {
    // The message declares its own payload type — see proto.js. Passing one in
    // was the seam a wrong enum key slipped through, and it cost us discovery.
    const buf = encodeMessage(this.proto, typeName, body, clientMsgId);
    this.socket.write(frame(buf));
  }

  /** Send and await the correlated reply. */
  request(typeName, body) {
    this.msgSeq += 1;
    const id = `pv-${this.msgSeq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ctrader: ${typeName} timed out`));
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      try { this.send(typeName, body, id); } catch (err) {
        clearTimeout(timer); this.pending.delete(id); reject(err);
      }
    });
  }

  onData(chunk) {
    this.lastInbound = this.now();
    let frames;
    try { frames = this.reader.push(chunk); } catch (err) {
      // A desynchronised stream cannot be recovered by reading more of it.
      this.onDown(err);
      return;
    }
    for (const f of frames) {
      let decoded;
      try { decoded = decodeMessage(this.proto, f); } catch (err) {
        this.log.error?.({ err: err.message }, 'ctrader: undecodable frame');
        continue;
      }
      this.dispatch(decoded);
    }
  }

  dispatch({ payloadType, clientMsgId, message }) {
    const T = this.proto.types;
    if (payloadType === T.PROTO_OA_ERROR_RES || payloadType === T.ERROR_RES) {
      // retryAfter is in SECONDS. Feeding it to a millisecond clock would back
      // off for 30ms instead of 30s and hammer straight back into the limit --
      // the same class of unit bug as the moneyDigits 100x trap.
      const secs = Number(message?.retryAfter ?? 0);
      if (secs > 0) this.throttle.blockUntil(this.now() + secs * 1000);
      const err = new Error(`ctrader ${message?.errorCode}: ${message?.description ?? ''}`);
      err.errorCode = message?.errorCode;
      err.retryAfterMs = secs * 1000;
      this.settle(clientMsgId, err, null);
      if (!clientMsgId) this.emit('apiError', err);
      return;
    }
    if (payloadType === T.PROTO_OA_ACCOUNTS_TOKEN_INVALIDATED_EVENT) {
      // Landmine 10.1: a token refresh terminates the sessions of the named
      // accounts while the SOCKET and every other account survive. So re-authorize
      // exactly those, not the whole connection.
      const ids = (message?.ctidTraderAccountIds ?? []).map(String);
      for (const id of ids) this.accounts.delete(id);
      this.emit('accountsInvalidated', { ids, reason: message?.reason ?? null });
      return;
    }
    if (payloadType === T.PROTO_OA_CLIENT_DISCONNECT_EVENT) {
      this.onDown(new Error(`client disconnected by cTrader: ${message?.reason ?? ''}`));
      return;
    }
    if (payloadType === T.PROTO_OA_EXECUTION_EVENT) {
      this.emit('execution', message);
      return;
    }
    if (payloadType === T.HEARTBEAT_EVENT) return;
    this.settle(clientMsgId, null, message);
  }

  settle(clientMsgId, err, value) {
    if (!clientMsgId) return;
    const p = this.pending.get(clientMsgId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(clientMsgId);
    if (err) p.reject(err); else p.resolve(value);
  }

  onDown(err) {
    if (this.closed) return;
    clearInterval(this.hb);
    this.appAuthed = false;
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
    try { this.socket?.destroy(); } catch { /* already gone */ }
    this.socket = null;
    this.reader = new FrameReader();
    this.emit('down', err);
  }

  close() {
    this.closed = true;
    clearInterval(this.hb);
    try { this.socket?.destroy(); } catch { /* already gone */ }
    this.socket = null;
  }
}
