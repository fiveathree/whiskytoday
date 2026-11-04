-- Phase 2: editions, bottles, media, prices, FX and scores (PLAN.md §3, §5, §6)

CREATE TABLE editions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  distillery_id TEXT REFERENCES entities(id),
  brand_id TEXT REFERENCES entities(id),
  bottler_id TEXT REFERENCES entities(id),
  name_en TEXT NOT NULL, name_zh TEXT,
  category TEXT,
  vintage_year INTEGER, bottling_year INTEGER, age_years INTEGER,
  cask_type TEXT, cask_number TEXT,
  edition_size INTEGER,
  abv REAL, volume_ml INTEGER,
  description_zh TEXT, description_en TEXT,
  tasting_zh TEXT, tasting_en TEXT,
  owner_comment_zh TEXT, owner_comment_en TEXT,
  target_price_minor INTEGER, target_currency TEXT,
  floor_price_minor INTEGER, floor_currency TEXT,
  holding_months INTEGER,
  is_tracked INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_editions_distillery ON editions(distillery_id);
CREATE INDEX idx_editions_brand ON editions(brand_id);

CREATE TABLE bottles (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  bottle_number TEXT,
  fill_level TEXT,
  seal_condition TEXT, label_condition TEXT,
  has_box INTEGER, box_condition TEXT,
  acquired_year INTEGER,
  provenance_note TEXT,
  cost_minor INTEGER, cost_currency TEXT,
  private_note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_bottles_edition ON bottles(edition_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  edition_id TEXT REFERENCES editions(id),
  bottle_id TEXT REFERENCES bottles(id),
  r2_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  content_type TEXT
);
CREATE INDEX idx_media_edition ON media(edition_id);

CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  bottle_id TEXT REFERENCES bottles(id),
  price_type TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT NOT NULL,
  market TEXT,
  venue TEXT,
  lot_number TEXT,
  observed_at TEXT NOT NULL,
  condition_note TEXT,
  source_url TEXT,
  volume_ml INTEGER,                 -- container size of this sale, checked against the edition (§6.1 needs_review)
  is_public INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_prices_edition ON prices(edition_id, observed_at);

CREATE TABLE fx_rates (
  rate_date TEXT NOT NULL, base TEXT NOT NULL, quote TEXT NOT NULL, rate REAL NOT NULL,
  PRIMARY KEY (rate_date, base, quote)
);

CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  computed_at TEXT NOT NULL,
  status TEXT NOT NULL,
  total INTEGER, tier TEXT,
  trend INTEGER, activity INTEGER, scarcity INTEGER, exit INTEGER, fundamentals INTEGER,
  inputs_json TEXT NOT NULL,
  algo_version TEXT NOT NULL
);
CREATE INDEX idx_scores_edition ON scores(edition_id, computed_at);

-- Scoring constants and defaults (§5 settings page, §6.2); all editable later.
INSERT INTO settings (key, value) VALUES
  ('default_currency', 'HKD'),
  ('exit_cost_pct', '15'),
  ('score_weights', '{"trend":30,"activity":20,"scarcity":25,"exit":15,"fundamentals":10}'),
  ('tier_cutoffs', '{"A":75,"B":60,"C":45}');
