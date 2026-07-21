-- Add indexes for incremental graph recompute performance

-- Index for library_entries.updated_at to support incremental recompute
CREATE INDEX IF NOT EXISTS idx_library_updated ON library_entries(updated_at);

-- Composite index for reviews by book and time
CREATE INDEX IF NOT EXISTS idx_reviews_book_created ON reviews(book_id, created_at);
