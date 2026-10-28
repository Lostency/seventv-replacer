-- Preset mappings whose emote a Replace run found deleted or unusable on 7TV.
-- One row per pairing, counting repeat reports. Admins see a row only while
-- its pairing is still the season's mapping; dismissing deletes it.
CREATE TABLE broken_reports (
  season          TEXT NOT NULL,
  original_id     TEXT NOT NULL,
  replacement_id  TEXT NOT NULL,
  broken_id       TEXT NOT NULL,
  reason          TEXT NOT NULL,
  reports         INTEGER NOT NULL DEFAULT 1,
  first_seen      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season, original_id, replacement_id)
);
