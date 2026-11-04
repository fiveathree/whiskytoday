-- Third-party ratings shown next to our own score (owner request 2026-11-04).
-- Entered by the admin with a source link; not scraped (Whiskybase etc. do not allow automated access).
CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  source TEXT NOT NULL,              -- e.g. Whiskybase, Whisky Advocate, Whiskyfun, IWSC
  score REAL,                        -- null when it is an award only
  scale REAL NOT NULL DEFAULT 100,   -- maximum of the source's scale
  votes INTEGER,                     -- number of community ratings, if any
  award TEXT,                        -- e.g. Gold, Double Gold
  url TEXT,
  rated_at TEXT,                     -- YYYY-MM-DD when the admin checked it
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ratings_edition ON ratings(edition_id);
