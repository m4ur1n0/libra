-- Add numeric signal columns to reviews for graph similarity computation
-- These complement the existing TEXT-based pace and plot_or_character_focused columns

-- Numeric signals: 0-1 scale for similarity calculations
ALTER TABLE reviews ADD COLUMN pace_signal REAL;       -- 0=slow, 1=fast, NULL=not provided
ALTER TABLE reviews ADD COLUMN plot_signal REAL;       -- 0=character, 1=plot, NULL=not provided
ALTER TABLE reviews ADD COLUMN prose_signal REAL;      -- 0=dense, 1=accessible, NULL=not provided
