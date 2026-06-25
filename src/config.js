import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/amey_journal',
  ingestToken: process.env.INGEST_TOKEN ?? 'dev-token-please-change',
  corsOrigin:
    (process.env.CORS_ORIGIN ?? '*') === '*'
      ? '*'
      : (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
};
