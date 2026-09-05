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

/**
 * The payload type a message DECLARES for itself.
 *
 * Every Open API message carries `optional ProtoOAPayloadType payloadType = 1
 * [default = PROTO_OA_...]`, and protobufjs exposes that default as a number. It
 * is the authoritative answer and it cannot drift from the .proto files, because
 * it IS the .proto files.
 *
 * THE ALTERNATIVE COST US DISCOVERY ENTIRELY. The first version looked types up
 * by a hand-written enum key and built its decode map by DERIVING a message name
 * from each enum name. That works for almost every pair, and Spotware's naming
 * diverges for the one message discovery depends on:
 *
 *   message  ProtoOAGetAccountList ByAccessTokenRes
 *   enum     PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES
 *
 * "AccountList" against "ACCOUNTS". The request key resolved to `undefined` and
 * the response resolved to no message at all, so the account picker sat on its
 * loading skeleton forever with no error raised anywhere.
 */
export function payloadTypeOf(proto, typeName) {
  let type;
  try { type = proto.root.lookupType(typeName); } catch {
    throw new Error(`ctrader: no message named '${typeName}'`);
  }
  const n = type.fields?.payloadType?.typeDefault;
  if (typeof n !== 'number') {
    throw new Error(`ctrader: ${typeName} declares no payloadType default`);
  }
  return n;
}

/** The protobuf root, loaded once per process. */
export async function loadProto() {
  if (!cached) {
    const root = await protobuf.load(FILES);
    const ProtoMessage = root.lookupType('ProtoMessage');
    const types = {
      ...root.lookupEnum('ProtoPayloadType').values,
      ...root.lookupEnum('ProtoOAPayloadType').values,
    };

    // payloadType -> message, built from what each MESSAGE declares rather than
    // from what its enum value happens to be called.
    const byNumber = new Map();
    const walk = (ns) => {
      for (const obj of Object.values(ns.nested ?? {})) {
        if (obj.fields) {
          const n = obj.fields.payloadType?.typeDefault;
          if (typeof n === 'number') byNumber.set(n, obj);
        }
        if (obj.nested) walk(obj);
      }
    };
    walk(root);

    cached = { root, ProtoMessage, types, byNumber };
  }
  return cached;
}

/**
 * Encode an inner message into a ProtoMessage envelope.
 *
 * NO payloadType ARGUMENT. The message knows its own type, and passing one in was
 * the seam a wrong enum key slipped through.
 */
export function encodeMessage(proto, typeName, body, clientMsgId) {
  const payloadType = payloadTypeOf(proto, typeName);
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
