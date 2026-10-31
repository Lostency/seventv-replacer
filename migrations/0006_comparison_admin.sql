-- Who submitted each comparison and what it held, so admins can review and
-- clean up submissions. Rows from before this migration take the submitter's
-- name from their newest sign-in, where one is left; set names stay NULL.
ALTER TABLE comparisons ADD COLUMN submitter_login TEXT;
ALTER TABLE comparisons ADD COLUMN submitter_name TEXT;
ALTER TABLE comparisons ADD COLUMN normal_set_name TEXT;
ALTER TABLE comparisons ADD COLUMN seasonal_set_name TEXT;
-- Stored so listing comparisons never counts every sighting.
ALTER TABLE comparisons ADD COLUMN match_count INTEGER NOT NULL DEFAULT 0;

UPDATE comparisons SET
  submitter_login = (SELECT login FROM sessions WHERE twitch_id = comparisons.submitted_by ORDER BY created_at DESC LIMIT 1),
  submitter_name = (SELECT display_name FROM sessions WHERE twitch_id = comparisons.submitted_by ORDER BY created_at DESC LIMIT 1);

UPDATE comparisons SET match_count = (SELECT COUNT(*) FROM sightings WHERE comparison_id = comparisons.id);

-- Submitters an admin stopped from submitting comparisons. Login and name are
-- the newest known ones, NULL when none was ever recorded.
CREATE TABLE blocked_submitters (
  twitch_id     TEXT PRIMARY KEY,
  login         TEXT,
  display_name  TEXT,
  blocked_by    TEXT NOT NULL,
  blocked_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
