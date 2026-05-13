CREATE TABLE IF NOT EXISTS book_edges (
  book_a_id TEXT NOT NULL,
  book_b_id TEXT NOT NULL,
  similarity_score REAL NOT NULL DEFAULT 0.0,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (book_a_id, book_b_id),

  FOREIGN KEY (book_a_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (book_b_id) REFERENCES books(id) ON DELETE CASCADE,

  CHECK (book_a_id < book_b_id),
  CHECK (similarity_score BETWEEN 0.0 AND 1.0)
);

CREATE INDEX IF NOT EXISTS idx_book_edges_a_score ON book_edges(book_a_id, similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_book_edges_b_score ON book_edges(book_b_id, similarity_score DESC);
