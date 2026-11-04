-- Phase 1: daily intelligence (PLAN.md §3, §4)

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_url TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  region TEXT NOT NULL,
  language TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  filter_keywords TEXT,              -- comma-separated; general drinks feeds keep only items matching one
  last_fetched_at TEXT,
  last_error TEXT
);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL REFERENCES sources(id),
  original_title TEXT NOT NULL,
  original_language TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  cluster_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  category TEXT,
  importance INTEGER,
  investor_focus INTEGER NOT NULL DEFAULT 0,
  title_zh TEXT, title_en TEXT,
  summary_zh TEXT, summary_en TEXT,
  facts_json TEXT,
  claims_json TEXT,
  ai_view_zh TEXT, ai_view_en TEXT,
  investor_card_json TEXT,
  ai_model TEXT, prompt_version TEXT, token_cost INTEGER,
  snippet TEXT                       -- feed summary snippet (not full text), input for AI
);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_cluster ON articles(cluster_id);
CREATE INDEX idx_articles_hash ON articles(content_hash);
CREATE INDEX idx_articles_published ON articles(published_at);

-- trigram tokenizer so Chinese text is searchable (queries need >= 3 chars; shorter ones fall back to LIKE)
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title_zh, title_en, summary_zh, summary_en,
  content='articles', content_rowid='rowid', tokenize='trigram'
);
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title_zh, title_en, summary_zh, summary_en)
  VALUES (new.rowid, new.title_zh, new.title_en, new.summary_zh, new.summary_en);
END;
CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title_zh, title_en, summary_zh, summary_en)
  VALUES ('delete', old.rowid, old.title_zh, old.title_en, old.summary_zh, old.summary_en);
END;
CREATE TRIGGER articles_au AFTER UPDATE OF title_zh, title_en, summary_zh, summary_en ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title_zh, title_en, summary_zh, summary_en)
  VALUES ('delete', old.rowid, old.title_zh, old.title_en, old.summary_zh, old.summary_en);
  INSERT INTO articles_fts(rowid, title_zh, title_en, summary_zh, summary_en)
  VALUES (new.rowid, new.title_zh, new.title_en, new.summary_zh, new.summary_en);
END;

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT,
  aliases TEXT,
  region TEXT,
  status TEXT,
  description_zh TEXT, description_en TEXT,
  is_tracked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE article_entities (
  article_id TEXT NOT NULL REFERENCES articles(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  direction INTEGER,
  PRIMARY KEY (article_id, entity_id)
);
CREATE INDEX idx_ae_entity ON article_entities(entity_id);

-- Entity names the AI extracted but we could not match (§4.2 step 5); admin decides whether to add
CREATE TABLE unmatched_entities (
  name TEXT PRIMARY KEY,
  type TEXT,
  seen_count INTEGER NOT NULL DEFAULT 1,
  last_article_id TEXT,
  last_seen_at TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE job_logs (
  id TEXT PRIMARY KEY, job TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT, items_found INTEGER, items_processed INTEGER, cost_estimate INTEGER, error TEXT
);

INSERT INTO settings (key, value) VALUES
  ('brand_name', 'Whisky Today'),
  ('ai_model', 'claude-sonnet-5-5'),
  ('ai_effort', 'low'),
  ('prompt_version', 'news-v1'),
  ('max_articles_per_run', '60'),
  -- USD per million tokens for the model above; only used for the cost estimate in job_logs (US cents)
  ('ai_price_input_per_mtok', '2'),
  ('ai_price_output_per_mtok', '10');
