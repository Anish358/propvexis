// Apply pending SQL migrations from db/migrations, tracked in a schema_migrations
// table so each file runs exactly once. Safe to run on every deploy.
// Reads DATABASE_URL via src/config.js (dotenv) — run from the project root.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { config } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

const client = new pg.Client({ connectionString: config.databaseUrl });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
const { rows } = await client.query('SELECT filename FROM schema_migrations');
const applied = new Set(rows.map((r) => r.filename));

let count = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`applied ${file}`);
    count++;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`failed ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(count ? `done — ${count} migration(s) applied` : 'done — no pending migrations');
await client.end();
