// Configuration constants for book similarity scoring system

export const DEFAULT_CONFIG = {
  // Top-level component weights (sum to 1.0)
  weights: {
    reader: 0.40,    // Collaborative filtering (highest weight - user behavior trumps metadata)
    content: 0.35,   // Content-based filtering (handles cold start)
    review: 0.25     // Experience-based filtering (mood, pace, plot)
  },

  // ContentSim sub-component weights (sum to 1.0)
  contentWeights: {
    author: 0.40,     // Same author is strong signal
    genre: 0.50,      // Genre overlap is core to discovery
    language: 0.10    // Language match is essential UX
  },

  // ReviewSim sub-component weights (sum to 1.0)
  reviewWeights: {
    pace: 0.30,       // Slow-burn vs page-turner
    plot: 0.30,       // Character-driven vs plot-driven
    mood: 0.40        // Emotional reading experience (strongest)
  },

  // Smoothing parameters for ReaderSim
  smoothing: {
    alpha: 1,    // Shared reader prior (prevents single reader from scoring high)
    beta: 5      // Regularization constant (books need ~5 readers to separate from prior)
  },

  // Edge storage configuration
  maxEdges: 50,     // Store top 50 edges per book

  // Candidate generation limits
  candidateLimits: {
    sameAuthor: 999,      // No limit (usually <20 books)
    sharedReaders: 200,   // Top 200 by shared_readers
    sharedGenre: 200,     // Top 200 by genre overlap
    explicit: 999         // No limit (usually <10 books)
  },

  // Thresholds for reason tag generation
  reasonThresholds: {
    sharedReaders: 0.1,   // Min smoothed score to tag "shared_readers"
    genreOverlap: 0.5,    // Min cosine similarity to tag "shared_genre"
    moodOverlap: 0.5,     // Min cosine similarity to tag "similar_mood"
    paceDiff: 0.2         // Max diff to tag "similar_pace"
  }
};
