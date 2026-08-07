-- One API key per company, authenticating POST /ingest/:source — historical
-- record only. Not auto-run; server/src/db/autoMigrate.js (the
-- "011_company_api_key" block) is the source of truth that actually applies
-- this to existing installs at boot, including backfilling a unique key for
-- every pre-existing company (api_key is UNIQUE, so it can't be a single
-- bulk UPDATE the way other additive columns in this history are).

ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `api_key` VARCHAR(80) DEFAULT NULL UNIQUE;
