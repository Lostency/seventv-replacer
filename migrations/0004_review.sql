-- Pairings an admin turned down. Permanent: a rejected pairing never returns
-- to the review queue, however many channels show it.
-- mappings.source now also takes 'review' (accepted from the queue) and
-- 'manual' (added by pasting two emote links); it is free text already.
CREATE TABLE rejections (
  season          TEXT NOT NULL,
  original_id     TEXT NOT NULL,
  replacement_id  TEXT NOT NULL,
  rejected_by     TEXT NOT NULL,
  rejected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season, original_id, replacement_id)
);

-- Admin-adjustable values, e.g. review_threshold (channels a pairing needs).
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
