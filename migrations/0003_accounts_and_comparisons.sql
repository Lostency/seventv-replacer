-- Twitch sign-in sessions. Only a hash of the cookie value is stored.
CREATE TABLE sessions (
  id_hash       TEXT PRIMARY KEY,
  twitch_id     TEXT NOT NULL,
  login         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);

-- One normal set matched against one seasonal set. The pair is unique: a
-- recomparison replaces the row's sightings instead of adding a second row.
-- channel_id is the 7TV owner of the normal set (docs/adr/0001).
CREATE TABLE comparisons (
  id               TEXT PRIMARY KEY,
  normal_set_id    TEXT NOT NULL,
  seasonal_set_id  TEXT NOT NULL,
  season           TEXT NOT NULL,
  channel_id       TEXT NOT NULL,
  channel_name     TEXT NOT NULL,
  submitted_by     TEXT NOT NULL,
  submitted_at     TEXT NOT NULL,
  UNIQUE (normal_set_id, seasonal_set_id)
);

-- One channel's evidence that original → replacement under the same alias.
CREATE TABLE sightings (
  comparison_id   TEXT NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
  season          TEXT NOT NULL,
  original_id     TEXT NOT NULL,
  replacement_id  TEXT NOT NULL,
  alias           TEXT NOT NULL,
  channel_id      TEXT NOT NULL,
  PRIMARY KEY (comparison_id, original_id, replacement_id)
);

CREATE INDEX idx_sightings_pairing ON sightings (season, original_id, replacement_id, channel_id);
