CREATE TABLE IF NOT EXISTS saythis_pending (
  id TEXT PRIMARY KEY,
  lookup_key TEXT NOT NULL,
  term TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  submission_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saythis_pending_lookup_key
  ON saythis_pending (lookup_key);

CREATE TABLE IF NOT EXISTS saythis_approved (
  lookup_key TEXT PRIMARY KEY,
  base_language TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  entry_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saythis_approved_base_language
  ON saythis_approved (base_language);

CREATE TABLE IF NOT EXISTS saythis_approved_keys (
  request_key TEXT NOT NULL,
  base_language TEXT NOT NULL DEFAULT '',
  lookup_key TEXT NOT NULL,
  PRIMARY KEY (request_key, base_language, lookup_key)
);

CREATE INDEX IF NOT EXISTS idx_saythis_approved_keys_lookup_key
  ON saythis_approved_keys (lookup_key);

CREATE TABLE IF NOT EXISTS saythis_audio_artifacts (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  artifact_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saythis_rejected (
  id TEXT PRIMARY KEY,
  lookup_key TEXT,
  term TEXT,
  rejected_at TEXT NOT NULL,
  rejection_json TEXT NOT NULL
);
