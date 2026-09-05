// Length-prefixed framing for the cTrader protobuf socket.
//
// TLS GIVES YOU A BYTE STREAM, NOT MESSAGES. Every cTrader message is a 4-byte
// big-endian length followed by that many bytes of encoded ProtoMessage. Treating
// one 'data' event as one message works flawlessly against a quiet demo socket
// and corrupts everything the first busy minute on live, when two messages arrive
// coalesced in one read or one is split across two -- including mid-prefix.
//
// Pure and synchronous, so the whole reassembly problem is unit-testable without
// a socket.

/** The largest frame we will believe. */
// A desynchronised stream reads garbage as a length. Without a ceiling the reader
// waits for a 2GB message forever, holding the socket open and never recovering.
// Real messages are kilobytes; a deal list page is well under a megabyte.
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/** Prefix a payload with its length, ready to write to the socket. */
export function frame(payload) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(payload.length, 0);
  return Buffer.concat([head, payload]);
}

/** Accumulates socket reads and emits whole payloads as they complete. */
export class FrameReader {
  constructor() {
    this.buf = Buffer.alloc(0);
  }

  /**
   * Feed bytes in; get zero or more complete payloads out.
   * Whatever is left over is kept for the next read.
   */
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const out = [];
    for (;;) {
      if (this.buf.length < 4) break;
      const len = this.buf.readUInt32BE(0);
      if (len > MAX_FRAME_BYTES) {
        // Loud, and fatal to the connection: the stream is desynchronised and
        // nothing after this point can be trusted. The caller reconnects.
        throw new Error(`ctrader: refusing a ${len}-byte frame — stream desynchronised`);
      }
      if (this.buf.length < 4 + len) break;
      out.push(this.buf.subarray(4, 4 + len));
      this.buf = this.buf.subarray(4 + len);
    }
    return out;
  }
}
