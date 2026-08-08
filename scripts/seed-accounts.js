// Seed/backfill the multi-tenant ownership layer for trades that predate it.
//
// For every distinct trades.account_id (MT5 login) that doesn't yet have an
// mt5_accounts row, create one owned by SEED_OWNER_EMAIL and give it a random
// per-account ingest token. The owner user is created (find-or-link by email)
// with a placeholder google_sub if they've never logged in — the real Google
// `sub` gets linked on their first login (see findOrCreateUser in src/platform/auth/auth.js).
//
// Idempotent: re-running only fills gaps. Owner is configurable so prod can seed
// the real trader while local dev seeds the developer's own email.
//
//   SEED_OWNER_EMAIL=you@gmail.com node scripts/seed-accounts.js
import crypto from 'node:crypto';
import { pool, query } from '../src/platform/db.js';

const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'patilamey0718@gmail.com').trim().toLowerCase();
const ownerName = process.env.SEED_OWNER_NAME ?? null;

const genToken = () => crypto.randomBytes(24).toString('hex'); // 48 hex chars

async function ensureOwner() {
  const found = await query('SELECT id, email FROM users WHERE email = $1', [ownerEmail]);
  if (found.rows.length) return found.rows[0];
  const { rows } = await query(
    `INSERT INTO users (google_sub, email, name)
     VALUES ($1, $2, $3) RETURNING id, email;`,
    [`seed:${ownerEmail}`, ownerEmail, ownerName]
  );
  console.log(`created placeholder owner user ${ownerEmail} (id=${rows[0].id})`);
  return rows[0];
}

async function main() {
  const owner = await ensureOwner();

  const { rows: logins } = await query(
    `SELECT t.account_id::bigint AS login
       FROM (SELECT DISTINCT account_id FROM trades) t
       LEFT JOIN mt5_accounts a ON a.mt5_login = t.account_id
      WHERE a.id IS NULL
      ORDER BY 1;`
  );

  if (!logins.length) {
    console.log('no new MT5 logins to seed — every trades.account_id already has an mt5_accounts row.');
    return;
  }

  for (const { login } of logins) {
    const isImport = String(login) === '0'; // imported sheet history has no real login
    const label = isImport ? 'Imported (Sheet)' : `GoatFundedTrader ${login}`;
    const broker = isImport ? 'import' : 'GoatFundedTrader';
    const token = genToken();
    await query(
      `INSERT INTO mt5_accounts (user_id, mt5_login, label, broker, currency, start_balance, ingest_token)
       VALUES ($1, $2, $3, $4, 'USD', 50000, $5)
       ON CONFLICT (mt5_login) DO NOTHING;`,
      [owner.id, login, label, broker, token]
    );
    console.log(`seeded mt5_account login=${login} owner=${ownerEmail} label="${label}" token=${token}`);
  }

  console.log(`\ndone — seeded ${logins.length} account(s). Tokens above are the per-account EA ingest tokens.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
