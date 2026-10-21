CREATE TABLE IF NOT EXISTS accounts (
  account TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  vault_id TEXT,
  key_epoch INTEGER,
  vault_json TEXT
);
CREATE TABLE IF NOT EXISTS devices (
  account TEXT NOT NULL REFERENCES accounts(account),
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT,
  last_seen_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, device_id)
);
CREATE TABLE IF NOT EXISTS records (
  account TEXT NOT NULL REFERENCES accounts(account),
  rid TEXT NOT NULL,
  seq INTEGER NOT NULL,
  deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)),
  nonce TEXT NOT NULL,
  ct TEXT NOT NULL,
  key_epoch INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY (account, rid),
  UNIQUE (account, seq)
);
CREATE INDEX IF NOT EXISTS records_pull ON records(account, seq);
CREATE INDEX IF NOT EXISTS records_gc ON records(updated_at) WHERE deleted = 1;
