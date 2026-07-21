// Candidate generation orchestrator

import {
  getSameAuthorBooks,
  getSharedReaderBooks,
  getSharedGenreBooks,
  getExplicitRelatedBooks
} from './queries.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * Generate candidate set for similarity scoring
 * Combines multiple sources: same author, shared readers, shared genre, explicit relationships
 *
 * @param {string} bookId - Source book ID
 * @param {Object} db - D1 database binding
 * @param {Object} config - Configuration with candidate limits
 * @returns {Promise<Set<string>>} Set of candidate book IDs (deduped)
 */
export async function generateCandidates(bookId, db, config = DEFAULT_CONFIG) {
  const candidates = new Set();
  const limits = config.candidateLimits;

  // Fetch source book profile (needed for genre-based filtering later)
  const sourceProfile = await db.prepare(`
    SELECT * FROM book_feature_profiles WHERE book_id = ?
  `).bind(bookId).first();

  // Source 1: Same author (usually small set, <20 books)
  try {
    const sameAuthor = await getSameAuthorBooks(bookId, db);
    sameAuthor.forEach(id => candidates.add(id));
  } catch (err) {
    console.error(`Error fetching same-author books for ${bookId}:`, err);
  }

  // Source 2: Shared readers (top N by shared_readers DESC)
  try {
    const sharedReaders = await getSharedReaderBooks(bookId, db, limits.sharedReaders);
    sharedReaders.forEach(id => candidates.add(id));
  } catch (err) {
    console.error(`Error fetching shared-reader books for ${bookId}:`, err);
  }

  // Source 3: Shared genre (cosine > threshold, limit N)
  try {
    const sharedGenre = await getSharedGenreBooks(bookId, sourceProfile, db, 0.3, limits.sharedGenre);
    sharedGenre.forEach(id => candidates.add(id));
  } catch (err) {
    console.error(`Error fetching shared-genre books for ${bookId}:`, err);
  }

  // Source 4: Explicit relationships (from review_related_books)
  try {
    const explicit = await getExplicitRelatedBooks(bookId, db);
    explicit.forEach(id => candidates.add(id));
  } catch (err) {
    console.error(`Error fetching explicit related books for ${bookId}:`, err);
  }

  return candidates;
}

/**
 * Generate candidates with debug information
 * @param {string} bookId - Source book ID
 * @param {Object} db - D1 database binding
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} {candidates: Set, debug: Object}
 */
export async function generateCandidatesWithDebug(bookId, db, config = DEFAULT_CONFIG) {
  const candidates = new Set();
  const debug = {
    sameAuthor: 0,
    sharedReaders: 0,
    sharedGenre: 0,
    explicit: 0
  };

  const sourceProfile = await db.prepare(`
    SELECT * FROM book_feature_profiles WHERE book_id = ?
  `).bind(bookId).first();

  // Source 1: Same author
  const sameAuthor = await getSameAuthorBooks(bookId, db);
  sameAuthor.forEach(id => candidates.add(id));
  debug.sameAuthor = sameAuthor.length;

  // Source 2: Shared readers
  const sharedReaders = await getSharedReaderBooks(bookId, db, config.candidateLimits.sharedReaders);
  sharedReaders.forEach(id => candidates.add(id));
  debug.sharedReaders = sharedReaders.length;

  // Source 3: Shared genre
  const sharedGenre = await getSharedGenreBooks(bookId, sourceProfile, db, 0.3, config.candidateLimits.sharedGenre);
  sharedGenre.forEach(id => candidates.add(id));
  debug.sharedGenre = sharedGenre.length;

  // Source 4: Explicit relationships
  const explicit = await getExplicitRelatedBooks(bookId, db);
  explicit.forEach(id => candidates.add(id));
  debug.explicit = explicit.length;

  return {
    candidates,
    debug: {
      ...debug,
      total: candidates.size
    }
  };
}
