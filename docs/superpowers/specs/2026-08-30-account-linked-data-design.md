# Account-linked data: removing god view and cascading account lifecycle

Date: 2026-08-30 · Status: approved

## Problem

Four related defects in how the journal relates trades to accounts:

1. **God view is a second scoping mode.** `resolveScope(user, 'all')` filters by
   `user_id` rather than by account, so it is the only scope that can see trades
   belonging to no account. Every consumer carries a `god` branch for a shape
   that a plain multi-account selection already expresses.
2. **Trades need not belong to an account.** Migration 0007 dropped
   `trades.account_id NOT NULL` so CSV imports and hand-entered strategy trades
   could exist owner-scoped but account-less. They are reachable only from god
   view, and they are why god view has to exist.
3. **Deleting an account leaves its data behind.** `deleteAccount` removes one
   `mt5_accounts` row; the trades, payouts, fees, equity snapshots, balance,
   candle requests and notifications keyed on its MT5 login all survive, unowned.
4. **Archiving an account hides nothing.** `is_active = false` removes it from
   the switcher, but `ownedLogins` still returns it, so its trades keep counting
   in the all-accounts view. Challenge groups have no archive state at all.

## Decisions

- "All accounts" stays in the switcher, redefined as *select every active
  account*. It resolves to a concrete login list and filters by `account_id`
  like any other selection.
- Existing account-less trades are **hard-deleted**, not re-homed (owner's call).
  So are trades whose `account_id` matches no `mt5_accounts` row — equally
  unlinked, and they would block the foreign key.
- Archive means **excluded from every scope until unarchived**. Nothing is
  written to the related rows; unarchiving restores the data.
- Delete means **full cascade** over every account-keyed table.

## Design

### Scope becomes single-mode

```js
resolveScope(userId, requested) -> { userId, logins, multi } | null
scopeCondition(scope, add)      -> `account_id = ANY($n)`   // always
```

`god` is replaced by `multi` (`logins.length > 1`), which answers only "aggregate
shape or single-account shape?". `filterCol` is deleted. Response fields
`{ god: true, accounts: [...] }` on `/api/account` and `/api/prop`, and
`report.meta.god`, become `multi`. `statsCache` drops `col` from its key.

### Migration 0028

```sql
DELETE FROM trades WHERE account_id IS NULL;
DELETE FROM trades t WHERE NOT EXISTS (
  SELECT 1 FROM mt5_accounts a WHERE a.mt5_login = t.account_id);
ALTER TABLE trades ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE trades ADD CONSTRAINT trades_account_fk
  FOREIGN KEY (account_id) REFERENCES mt5_accounts(mt5_login) ON DELETE CASCADE;

ALTER TABLE challenge_groups ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE challenge_groups ADD COLUMN archived_at TIMESTAMPTZ;
```

The migration RAISEs the deleted row counts so the deploy log records what it
destroyed. Both deletes are irreversible: take a backup before it runs on prod.

The foreign key makes trade deletion structural rather than something the delete
route has to remember, and makes an account-less trade unwritable at the storage
layer rather than only at the route.

### Writes require an account

`POST /api/trades` and `POST /api/trades/import` reject a missing `account_id`
with 400. The client requires a chosen account before offering either action.

### Archive excludes

`ownedLogins` gains `AND is_active`. That one predicate hides an archived
account's trades, payouts, fees, challenges and equity from every surface, and
unarchiving brings them back.

### Delete cascades

`deleteAccount` runs in a transaction. The FK takes `trades`; `challenges`,
`mt5_credentials` and `sync_jobs` already cascade off `mt5_accounts.id`. Tables
keyed on the MT5 login are deleted explicitly in the same transaction:
`payouts`, `account_fees`, `equity_snapshots`, `accounts`, `candle_requests`,
and account-scoped `notifications`.

`candles` is deliberately NOT in that list: it is keyed by instrument
(`symbol_base`, `ts`), not by account — it is the shared price history every
account's replay reads, and deleting it with one account would blind the others.

### Challenge groups follow their accounts

One reconciler runs after any account archive, unarchive or delete:

- no accounts left in the group -> delete the group
- every remaining account archived -> `is_active = false`, `archived_at = now()`
- any account active -> `is_active = true`, `archived_at = NULL`

Archived groups leave Prop OS › Challenges and the Add Account wizard's
join-a-challenge list. `status` (`active`/`passed`/`failed`) is untouched:
archival is orthogonal to whether the challenge was passed.

## Testing

CI has no Postgres, so tests stay pure: scope shape and predicate, the cascade
transaction and reconciler asserted against a recording fake client (as
`provision-tx.test.js` does), migration content pins for the NOT NULL and the
foreign key, and route-level rejection of account-less trade creation.
