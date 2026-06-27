-- Auto-bind add-account flow: a user creates an account in-app with just a label
-- and gets an ingest token; the MT5 login is unknown until their EA sends the
-- first trade with that token. So mt5_login must be nullable until bound.
-- The UNIQUE constraint stays (Postgres allows multiple NULLs), so a bound login
-- is still globally unique.
ALTER TABLE mt5_accounts ALTER COLUMN mt5_login DROP NOT NULL;
