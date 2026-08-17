// Backfill trade ownership for the strategy model (migration 0007).
//
//  1. Account-linked trades: stamp user_id from the owning mt5_account.
//  2. Imported history (account_id = 0): convert to account-less strategy
//     trades — account_id = NULL, user_id = SEED_OWNER_EMAIL's user. These then
//     show in god view only, linked to no account.
//
// Idempotent. Owner is configurable so prod and local can differ.
//   SEED_OWNER_EMAIL=you@gmail.com node scripts/backfill-trade-ownership.js
import { pool, query } from '../src/platform/db.js';

const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'patilamey0718@gmail.com').trim().toLowerCase();

async function ensureOwner() {
  const found = await query('SELECT id FROM users WHERE email = $1', [ownerEmail]);
  if (found.rows.length) return found.rows[0].id;
  const { rows } = await query(
    `INSERT INTO users (google_sub, email) VALUES ($1, $2) RETURNING id;`,
    [`seed:${ownerEmail}`, ownerEmail]
  );
  console.log(`created placeholder owner ${ownerEmail} (id=${rows[0].id})`);
  return rows[0].id;
}

async function main() {
  // 1. account-linked trades -> owner from mt5_accounts
  const linked = await query(
    `UPDATE trades t SET user_id = m.user_id
       FROM mt5_accounts m
      WHERE m.mt5_login = t.account_id
        AND t.account_id IS NOT NULL
        AND t.user_id IS DISTINCT FROM m.user_id
      RETURNING t.id;`
  );
  console.log(`stamped user_id on ${linked.rowCount} account-linked trade(s)`);

  // 2. imported history (account_id = 0) -> account-less, owned by SEED_OWNER
  const ownerId = await ensureOwner();
  const imported = await query(
    `UPDATE trades
        SET account_id = NULL, user_id = $1
      WHERE account_id = 0
      RETURNING id;`,
    [ownerId]
  );
  console.log(`converted ${imported.rowCount} imported trade(s) to account-less, owner=${ownerEmail}`);

  const { rows: orphans } = await query(
    'SELECT count(*) FROM trades WHERE user_id IS NULL'
  );
  if (Number(orphans[0].count) > 0) {
    console.log(`note: ${orphans[0].count} trade(s) still have no user_id (unclaimed accounts / legacy grace ingests).`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
