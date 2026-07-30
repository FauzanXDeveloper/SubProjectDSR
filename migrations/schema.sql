-- ARBM DSR Calculator - database schema (SQLite via PDO)
-- Auto-applied by app/Db.php the first time storage/dsr.sqlite does not
-- exist yet. Written to be reasonably portable to MySQL/MariaDB later
-- (plain types, no SQLite-only functions in the app layer).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  staff_id            TEXT,
  email               TEXT,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('normal','checker','admin')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at       TEXT
);

CREATE TABLE IF NOT EXISTS cases (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  reference           TEXT NOT NULL UNIQUE,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  assigned_checker_id INTEGER REFERENCES users(id),
  mode                TEXT NOT NULL CHECK (mode IN ('pf','hf','cc','pf-cc','hf-cc','pf-hf')),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_checker','approved','rejected')),
  customer_name       TEXT,
  customer_ic         TEXT,
  customer_type       TEXT,
  customer_class      TEXT,
  iscore              INTEGER,
  report_date         TEXT,
  gross_income        DECIMAL(15,2),
  net_income          DECIMAL(15,2),
  verdict             TEXT,
  dsr_value           DECIMAL(9,4),
  ndi_value           DECIMAL(15,2),
  payload_json        TEXT NOT NULL,
  submitted_at        TEXT,
  decided_at          TEXT,
  decision_notes      TEXT,
  edit_count          INTEGER NOT NULL DEFAULT 0,
  edited_at           TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cases_created_by ON cases(created_by);
CREATE INDEX IF NOT EXISTS idx_cases_checker ON cases(assigned_checker_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id       INTEGER REFERENCES users(id),
  action              TEXT NOT NULL,
  target_type         TEXT,
  target_id           INTEGER,
  details             TEXT,
  ip_address          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- singleton row (id = 1) holding the calculation policy overrides that used
-- to live in localStorage['dsrConfigOverrides']
CREATE TABLE IF NOT EXISTS policy_config (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  config_json         TEXT NOT NULL DEFAULT '{}',
  updated_by          INTEGER REFERENCES users(id),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO policy_config (id, config_json) VALUES (1, '{}');
