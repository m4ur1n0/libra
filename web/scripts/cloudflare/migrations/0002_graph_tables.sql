-- Graph Feature: Core tables for book similarity graph
-- Based on graph-architecture.md

-- Book feature profiles: aggregated content-derived signals
CREATE TABLE book_feature_profiles (
  book_id           TEXT PRIMARY KEY REFERENCES books(id),
  avg_rating        REAL DEFAULT 0,
  rating_count      INTEGER DEFAULT 0,
  pace_score        REAL DEFAULT 0.5,        -- 0=slow, 1=fast
  plot_score        REAL DEFAULT 0.5,        -- 0=character-driven, 1=plot-driven
  prose_score       REAL DEFAULT 0.5,        -- 0=dense, 1=accessible
  mood_vector       TEXT DEFAULT '{}',       -- JSON: {"dark":0.8,"funny":0.1,...}
  genre_vector      TEXT DEFAULT '{}',       -- JSON: {"fantasy":1,"romance":0.3,...}
  pub_year          INTEGER,                 -- denormalized for fast range queries
  page_count        INTEGER,
  primary_author_id TEXT REFERENCES authors(id),
  model_version     INTEGER DEFAULT 1,       -- bump when scoring formula changes
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_bfp_year ON book_feature_profiles(pub_year);
CREATE INDEX idx_bfp_author ON book_feature_profiles(primary_author_id);
CREATE INDEX idx_bfp_model ON book_feature_profiles(model_version);


-- Materialized per-book read counts
CREATE TABLE book_reader_stats (
  book_id         TEXT PRIMARY KEY REFERENCES books(id),
  reader_count    INTEGER DEFAULT 0,   -- users who have read (status = 'read')
  shelf_count     INTEGER DEFAULT 0,   -- users who have shelved (any status)
  review_count    INTEGER DEFAULT 0,
  updated_at      TEXT DEFAULT (datetime('now'))
);


-- Materialized Jaccard-style overlap between book pairs
CREATE TABLE book_pair_reader_overlap (
  book_a          TEXT NOT NULL,
  book_b          TEXT NOT NULL,
  shared_readers  INTEGER DEFAULT 0,
  union_readers   INTEGER DEFAULT 0,
  jaccard         REAL GENERATED ALWAYS AS
                    (CAST(shared_readers AS REAL) / MAX(union_readers, 1)) STORED,
  updated_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (book_a, book_b),
  FOREIGN KEY (book_a) REFERENCES books(id),
  FOREIGN KEY (book_b) REFERENCES books(id),
  CHECK (book_a < book_b)             -- enforces canonical ordering
);

CREATE INDEX idx_overlap_a ON book_pair_reader_overlap(book_a, jaccard DESC);
CREATE INDEX idx_overlap_b ON book_pair_reader_overlap(book_b, jaccard DESC);


-- Top-K similarity graph edges
CREATE TABLE book_similarity_edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  src_book_id   TEXT NOT NULL REFERENCES books(id),
  dst_book_id   TEXT NOT NULL REFERENCES books(id),
  score         REAL NOT NULL,         -- 0-1, higher = more similar
  rank          INTEGER NOT NULL,      -- 1 = most similar neighbor of src
  reasons       TEXT DEFAULT '[]',     -- JSON: ["same_author","shared_genre"]
  reason_detail TEXT DEFAULT '{}',     -- JSON: {"shared_genre":["fantasy"],"jaccard":0.42}
  model_version INTEGER DEFAULT 1,
  computed_at   TEXT DEFAULT (datetime('now')),
  UNIQUE (src_book_id, dst_book_id)
);

CREATE INDEX idx_edges_src ON book_similarity_edges(src_book_id, rank);
CREATE INDEX idx_edges_dst ON book_similarity_edges(dst_book_id, score DESC);
CREATE INDEX idx_edges_score ON book_similarity_edges(src_book_id, score DESC);


-- Lightweight job queue for graph recompute
CREATE TABLE graph_recompute_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     TEXT NOT NULL REFERENCES books(id),
  reason      TEXT NOT NULL,           -- 'new_book'|'new_review'|'new_library_entry'|'manual'
  priority    INTEGER DEFAULT 5,       -- lower = higher priority
  status      TEXT DEFAULT 'pending'   -- 'pending'|'running'|'done'|'failed'
              CHECK(status IN ('pending','running','done','failed')),
  attempts    INTEGER DEFAULT 0,
  error       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_queue_pending ON graph_recompute_queue(status, priority, created_at)
  WHERE status = 'pending';
