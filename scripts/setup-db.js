// Create the database (if missing) and apply db/schema.sql. Idempotent.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { config } from '../src/platform/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

const url = new URL(config.databaseUrl);
const dbName = url.pathname.replace(/^\//, '');

async function ensureDatabase() {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rows.length) {
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(dbName)}`);
    console.log(`created database "${dbName}"`);
  } else {
    console.log(`database "${dbName}" already exists`);
  }
  await admin.end();
}

async function applySchema() {
  const sql = await readFile(schemaPath, 'utf8');
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('schema applied');
}

await ensureDatabase();
await applySchema();
console.log('done');
