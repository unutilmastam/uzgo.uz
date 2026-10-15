-- Least-privilege database role for the API (ADR 0021). Idempotent; run by
-- deploy.sh and restore.sh as the owner role `uzgo`, which alone runs
-- migrations. `uzgo_app` may read and write rows but cannot change the schema,
-- TRUNCATE, or drop/disable the triggers that keep orders, ledger and audit
-- log immutable. Expects psql variable :app_password.
\set ON_ERROR_STOP on
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uzgo_app') AS create_role \gset
\if :create_role
CREATE ROLE uzgo_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
\endif
ALTER ROLE uzgo_app WITH LOGIN PASSWORD :'app_password' CONNECTION LIMIT 60;
GRANT CONNECT ON DATABASE :"DBNAME" TO uzgo_app;
GRANT USAGE ON SCHEMA public TO uzgo_app;
REVOKE CREATE ON SCHEMA public FROM uzgo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uzgo_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO uzgo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE uzgo IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uzgo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE uzgo IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO uzgo_app;
-- The migration history is the owner's business only.
REVOKE ALL ON TABLE "_prisma_migrations" FROM uzgo_app;
