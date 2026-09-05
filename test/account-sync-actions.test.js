import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from './helpers/src-files.js';
import { accountIdentity } from '../frontend/src/features/settings/accountIdentity.js';

const page = readCode('SettingsAccounts.jsx');

test('THE MT5 CREDENTIAL FORM IS OFFERED ONLY ON MT5', () => {
  /* THE BUG THIS FIXES. "Live sync" opens a modal asking for an MT5 server, login
   * and INVESTOR PASSWORD. It was shown for every non-manual account, so a cTrader
   * account — whose credential is an OAuth grant held on cTrader's side, and which
   * has no password of ours at all — offered the trader a password form for a
   * password that does not exist. */
  assert.match(page, /account\.platform === 'mt5' && \(\s*<MenuItem onClick=\{onSync\}>Live sync/,
    'Live sync must be gated on the platform that actually has a credential form');
});

test('a connected account can be synced on demand, whatever platform it is on', () => {
  // There was no per-account sync action at all: a connected account had no way to
  // be refreshed from this page.
  assert.match(page, /onClick=\{onSyncNow\}/);
  assert.match(page, /import_method === 'auto_sync'/,
    'only an Auto Sync account can be synced — an EA account is pushed to, not pulled');
  assert.match(page, /syncNow\(\[a\.id\]\)/, 'and it must sync THAT account, not all of them');
});

test('the Last Sync column reads the sync job, not the balance timestamp', () => {
  /* balance_updated_at is when the EA last reported equity. That is a different
   * fact, and it is NULL for every cTrader account — so the column showed a dash
   * on a connection that was syncing perfectly well. */
  assert.match(page, /jobs\?\.\[a\.id\]\?\.finished_at/);
});

test('the identity line names the real platform and the real login', () => {
  /* THE MISLABEL THIS FIXES, seen in production: a cTrader account rendered as
   * "MT5 4000048583094". mt5_login holds the BANDED value (4e12 + the cTrader
   * account id) because mt5_login is unique across every tenant; it is an internal
   * join key. platform_login is the number cTrader actually shows the trader. */
  assert.equal(accountIdentity({ platform: 'ctrader', mt5_login: 4_000_048_583_094, platform_login: 48583094 }),
    'cTrader 48583094');
  // MetaTrader is the one platform where the two are the same number.
  assert.equal(accountIdentity({ platform: 'mt5', mt5_login: 314943467, platform_login: null }),
    'MT5 314943467');
  assert.equal(accountIdentity({ platform: 'tradelocker', platform_login: 77 }), 'TradeLocker 77');
  // Never render "undefined" at the user.
  assert.equal(accountIdentity({ platform: 'ctrader' }), 'cTrader');
  assert.equal(accountIdentity({}), 'Account');
});

test('the banded login is never printed as if it were an MT5 login', () => {
  assert.doesNotMatch(page, /`MT5 \$\{a\.mt5_login\}`/,
    'that literal is what produced "MT5 4000048583094" for a cTrader account');
});
