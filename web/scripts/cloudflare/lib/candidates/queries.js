// SQL query builders for candidate generation

import { cosineSim, parseJsonVector } from '../similarity/vector-math.js';

/**
 * Get books by the same author(s)
 * @param {string} bookId - Source book ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<Array<string>>} Array of candidate book IDs
 */
export async function getSameAuthorBooks(bookId, db) {
  const result = await db.prepare(`
    SELECT DISTINCT b.id
    FROM books b
    JOIN book_authors ba ON ba.book_id = b.id
    WHERE ba.author_id IN (
      SELECT author_id FROM book_authors WHERE book_id = ?
    ) AND b.id != ?
  `).bind(bookId, bookId).all();

  return result.results.map(r => r.id);
}

/**
 * Get books with shared readers (from overlap table)
 * @param {string} bookId - Source book ID
 * @param {Object} db - D1 database binding
 * @param {number} limit - Max candidates to return
 * @returns {Promise<Array<string>>} Array of candidate book IDs
 */
export async function getSharedReaderBooks(bookId, db, limit = 200) {
  const result = await db.prepare(`
    SELECT CASE WHEN book_a = ? THEN book_b ELSE book_a END AS candidate
    FROM book_pair_reader_overlap
    WHERE book_a = ? OR book_b = ?
    ORDER BY shared_readers DESC
    LIMIT ?
  `).bind(bookId, bookId, bookId, limit).all();

  return result.results.map(r => r.candidate);
}

/**
 * Get books with shared genre (requires fetching all profiles and computing in JS)
 * @param {string} bookId - Source book ID
 * @param {Object} sourceProfile - Source book's feature profile
 * @param {Object} db - D1 database binding
 * @param {number} minSimilarity - Minimum cosine similarity threshold
 * @param {number} limit - Max candidates to return
 * @returns {Promise<Array<string>>} Array of candidate book IDs
 */
export async function getSharedGenreBooks(bookId, sourceProfile, db, minSimilarity = 0.3, limit = 200) {
  // 1. Parse source book's genre vector
  const sourceGenres = parseJsonVector(sourceProfile?.genre_vector, {});
  const sourceGenreNames = Object.keys(sourceGenres);

  if (sourceGenreNames.length === 0) {
    // No genres on source book, can't find genre-based candidates
    return [];
  }

  // 2. SQL Stage: Find books sharing at least one genre
  // IMPORTANT: This assumes book_genres (normalized) and genre_vector (denormalized JSON)
  // are in sync. If a book's genres are updated without recomputing its feature profile,
  // the candidate may have stale genre_vector data. For MVP this is acceptable - stale
  // candidates just score low in cosine similarity and won't make top-K edges.
  // TODO: Add incremental profile updates when book_genres changes.

  const placeholders = sourceGenreNames.map(() => '?').join(',');
  const candidateProfiles = await db.prepare(`
    SELECT book_id, genre_vector
    FROM book_feature_profiles
    WHERE book_id IN (
      SELECT DISTINCT bfp.book_id
      FROM book_feature_profiles bfp
      JOIN book_genres bg ON bg.book_id = bfp.book_id
      JOIN genres g ON g.id = bg.genre_id
      WHERE g.name IN (${placeholders})
        AND bfp.book_id != ?
      LIMIT 500
    )
  `).bind(...sourceGenreNames, bookId).all();

  // 3. JS Stage: Compute cosine similarity and filter by threshold
  const scored = [];
  for (const profile of candidateProfiles.results) {
    const targetGenres = parseJsonVector(profile.genre_vector, {});
    const similarity = cosineSim(sourceGenres, targetGenres);

    if (similarity >= minSimilarity) {
      scored.push({ bookId: profile.book_id, similarity });
    }
  }

  // 4. Sort by similarity and return top N
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit).map(item => item.bookId);
}

/**
 * Get explicitly related books (from review_related_books table)
 * @param {string} bookId - Source book ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<Array<string>>} Array of candidate book IDs
 */
export async function getExplicitRelatedBooks(bookId, db) {
  const result = await db.prepare(`
    SELECT CASE WHEN book_id = ? THEN related_book_id ELSE book_id END AS candidate
    FROM review_related_books
    WHERE book_id = ? OR related_book_id = ?
  `).bind(bookId, bookId, bookId).all();

  return result.results.map(r => r.candidate);
}
