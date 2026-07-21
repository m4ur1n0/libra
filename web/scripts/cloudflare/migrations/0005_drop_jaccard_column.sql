-- Drop the generated jaccard column to avoid silent bugs
-- The original migration had jaccard GENERATED ALWAYS AS (shared_readers / MAX(union_readers, 1))
-- but we're not populating union_readers in MVP, which would produce scores >1.0
-- Instead, similarity will be computed in JS using smoothed formula: (shared + α) / (shared + β)

-- First, drop indexes that reference the jaccard column
DROP INDEX IF EXISTS idx_overlap_a;
DROP INDEX IF EXISTS idx_overlap_b;

-- Now drop the columns
ALTER TABLE book_pair_reader_overlap DROP COLUMN jaccard;
ALTER TABLE book_pair_reader_overlap DROP COLUMN union_readers;

-- Recreate indexes without jaccard reference (order by shared_readers instead)
CREATE INDEX idx_overlap_a ON book_pair_reader_overlap(book_a, shared_readers DESC);
CREATE INDEX idx_overlap_b ON book_pair_reader_overlap(book_b, shared_readers DESC);
