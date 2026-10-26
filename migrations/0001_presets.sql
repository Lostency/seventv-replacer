-- One row per accepted original → seasonal pairing. A season's preset is the
-- set of its rows; an original can be mapped only once per season.
CREATE TABLE mappings (
  id              TEXT PRIMARY KEY,
  season          TEXT NOT NULL,
  original_id     TEXT NOT NULL,
  replacement_id  TEXT NOT NULL,
  -- 'seed' (from data/presets); later plans add 'review' and 'manual'.
  source          TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (season, original_id)
);

CREATE INDEX idx_mappings_season ON mappings (season);
