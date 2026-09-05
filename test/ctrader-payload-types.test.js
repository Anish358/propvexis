import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProto, payloadTypeOf, encodeMessage, decodeMessage } from '../worker/ctrader/proto.js';

const proto = await loadProto();

/* Every message the worker sends. If any of these cannot resolve a payload type,
 * the request goes out malformed (or not at all) and the job hangs. */
const SENDS = [
  'ProtoOAApplicationAuthReq',
  'ProtoOAAccountAuthReq',
  'ProtoOAGetAccountListByAccessTokenReq',
  'ProtoOAGetCtidProfileByTokenReq',
  'ProtoOATraderReq',
  'ProtoOASymbolsListReq',
  'ProtoOASymbolByIdReq',
  'ProtoOADealListReq',
  'ProtoHeartbeatEvent',
];

/* Every message it must be able to DECODE. A response with no entry in the
 * payload-type map decodes to `message: null`, so the caller sees a resolved
 * promise carrying nothing and reports success having done nothing. */
const RECEIVES = [
  'ProtoOAApplicationAuthRes',
  'ProtoOAAccountAuthRes',
  'ProtoOAGetAccountListByAccessTokenRes',
  'ProtoOAGetCtidProfileByTokenRes',
  'ProtoOATraderRes',
  'ProtoOASymbolsListRes',
  'ProtoOASymbolByIdRes',
  'ProtoOADealListRes',
  'ProtoOAErrorRes',
  'ProtoOAExecutionEvent',
  'ProtoOAAccountsTokenInvalidatedEvent',
];

test('THE PAYLOAD TYPE COMES FROM THE MESSAGE, NOT FROM ITS NAME', () => {
  /* THE BUG THIS CATCHES, WHICH SHIPPED AND BROKE DISCOVERY ENTIRELY.
   *
   * The old code looked payload types up by a hand-written enum key, and built
   * its decode map by DERIVING a message name from each enum name. That works for
   * almost every pair — and Spotware's naming diverges for the one message
   * discovery depends on:
   *
   *   message  ProtoOAGetAccountList ByAccessTokenRes
   *   enum     PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES
   *
   * "AccountList" vs "ACCOUNTS". So the REQUEST key resolved to undefined and the
   * RESPONSE resolved to no message at all. The account picker sat on its loading
   * skeleton forever, with no error anywhere.
   *
   * Every message declares its own type: `optional ProtoOAPayloadType payloadType
   * = 1 [default = PROTO_OA_...]`. Reading that is authoritative and cannot drift
   * from the .proto files, because it IS the .proto files. */
  for (const name of [...SENDS, ...RECEIVES]) {
    const n = payloadTypeOf(proto, name);
    assert.equal(typeof n, 'number', `${name} must declare its own payloadType`);
  }
});

test('every response the worker consumes decodes to a real message', () => {
  for (const name of RECEIVES) {
    const num = payloadTypeOf(proto, name);
    const type = proto.byNumber.get(num);
    assert.ok(type, `payload type ${num} (${name}) resolves to no message — it would decode to null`);
    assert.equal(type.name, name, `payload type ${num} resolves to ${type?.name}, not ${name}`);
  }
});

test('the account-list pair specifically, since its names disagree', () => {
  // Named on its own so a regression here is unmissable rather than one line in a loop.
  assert.equal(payloadTypeOf(proto, 'ProtoOAGetAccountListByAccessTokenReq'), 2149);
  assert.equal(payloadTypeOf(proto, 'ProtoOAGetAccountListByAccessTokenRes'), 2150);
  assert.equal(proto.byNumber.get(2150).name, 'ProtoOAGetAccountListByAccessTokenRes');
});

test('a round trip carries the type the message declares', () => {
  const buf = encodeMessage(proto, 'ProtoOAGetAccountListByAccessTokenReq', { accessToken: 't' }, 'm1');
  const back = decodeMessage(proto, buf);
  assert.equal(back.payloadType, 2149);
  assert.equal(back.clientMsgId, 'm1');
  assert.equal(back.message.accessToken, 't');
});

test('an unknown message name fails loudly rather than sending type undefined', () => {
  assert.throws(() => payloadTypeOf(proto, 'ProtoOANoSuchThing'), /ProtoOANoSuchThing/);
});
