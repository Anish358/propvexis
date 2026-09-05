// Loading Spotware's .proto files once, and encoding/decoding the ProtoMessage
// envelope every cTrader message travels inside.
//
// The .proto files are VENDORED under proto/ (MIT, Spotware) rather than fetched
// at boot, for the reason everything else in this repo is vendored: a worker that
// needs GitHub to start is a worker that cannot start during a GitHub outage, and
// the deploy rsyncs a directory, not a network.
//
// THE ENVELOPE. Every message on the wire is a ProtoMessage { payloadType,
// payload, clientMsgId }, where `payload` is the encoded inner message and
// payloadType says which one it is. clientMsgId is ours and comes back on the
// response, which is the only way to correlate a reply on a socket that is also
// delivering unsolicited execution events.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  'OpenApiCommonMessages.proto',
  'OpenApiCommonModelMessages.proto',
  'OpenApiMessages.proto',
  'OpenApiModelMessages.proto',
].map((f) => path.join(here, 'proto', f));

let cached = null;

/** The protobuf root, loaded once per process. */
export async function loadProto() {
  if (!cached) {
    const root = await protobuf.load(FILES);
    const ProtoMessage = root.lookupType('ProtoMessage');
    const oaTypes = root.lookupEnum('ProtoOAPayloadType').values;
    const commonTypes = root.lookupEnum('ProtoPayloadType').values;
    // payloadType -> message name, so an inbound frame can be decoded without a
    // switch statement that drifts from the proto.
    const byNumber = new Map();
    for (const [name, num] of Object.entries({ ...commonTypes, ...oaTypes })) {
      // PROTO_OA_DEAL_LIST_RES -> ProtoOADealListRes
      const camel = name.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const guess = camel.replace(/^proto/, 'Proto').replace(/^ProtoOa/, 'ProtoOA');
      const typeName = guess.charAt(0).toUpperCase() + guess.slice(1);
      try { byNumber.set(num, root.lookupType(typeName)); } catch { /* not every enum value has a message */ }
    }
    cached = { root, ProtoMessage, types: { ...commonTypes, ...oaTypes }, byNumber };
  }
  return cached;
}

/** Encode an inner message into a ProtoMessage payload buffer. */
export function encodeMessage(proto, typeName, payloadType, body, clientMsgId) {
  const Inner = proto.root.lookupType(typeName);
  const err = Inner.verify(body);
  // Loud: protobufjs silently drops unknown fields, so a typo'd field name would
  // otherwise send a request missing the thing we meant to ask for.
  if (err) throw new Error(`ctrader: ${typeName} invalid — ${err}`);
  const inner = Inner.encode(Inner.create(body)).finish();
  return proto.ProtoMessage.encode(
    proto.ProtoMessage.create({ payloadType, payload: inner, clientMsgId }),
  ).finish();
}

/** Decode a frame into { payloadType, clientMsgId, message }. */
export function decodeMessage(proto, buf) {
  const env = proto.ProtoMessage.decode(buf);
  const Inner = proto.byNumber.get(env.payloadType);
  return {
    payloadType: env.payloadType,
    clientMsgId: env.clientMsgId || null,
    message: Inner && env.payload ? Inner.decode(env.payload) : null,
  };
}
