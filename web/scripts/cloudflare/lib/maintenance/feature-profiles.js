// Feature profile aggregation - maintains book_feature_profiles table

import { normalizeVector } from '../similarity/vector-math.js';

/**
 * Update book feature profile by aggregating review data
 * @param {string} bookId - Book ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object>} Updated profile data
 */
export async function updateBookFeatureProfile(bookId, db) {
  // 1. Aggregate review signals
  const reviewStats = await db.prepare(`
    SELECT
      AVG(CAST(stars AS REAL) / 2) as avg_rating,
      COUNT(*) as rating_count,
      AVG(CASE pace
        WHEN 'slow' THEN 0
        WHEN 'medium' THEN 0.5
        WHEN 'fast' THEN 1
        ELSE NULL
      END) as pace_score,
      AVG(CASE plot_or_character_focused
        WHEN 'character' THEN 0
        WHEN 'balanced' THEN 0.5
        WHEN 'plot' THEN 1
        ELSE NULL
      END) as plot_score
    FROM reviews
    WHERE book_id = ?
  `).bind(bookId).first();

  // 2. Aggregate mood vector
  const moods = await db.prepare(`
    SELECT m.name, COUNT(*) as count
    FROM review_moods rm
    JOIN moods m ON m.id = rm.mood_id
    JOIN reviews r ON r.id = rm.review_id
    WHERE r.book_id = ?
    GROUP BY m.name
  `).bind(bookId).all();

  const moodVector = {};
  if (moods.results.length > 0) {
    moods.results.forEach(m => {
      moodVector[m.name] = m.count;
    });
    // Normalize so values sum to 1.0
    const normalized = normalizeVector(moodVector);
    Object.assign(moodVector, normalized);
  }

  // 3. Aggregate genre vector
  const genres = await db.prepare(`
    SELECT g.name, 1 as weight
    FROM book_genres bg
    JOIN genres g ON g.id = bg.genre_id
    WHERE bg.book_id = ?
  `).bind(bookId).all();

  const genreVector = {};
  if (genres.results.length > 0) {
    genres.results.forEach(g => {
      genreVector[g.name] = 1;  // Binary: book has this genre or not
    });
    // Normalize
    const normalized = normalizeVector(genreVector);
    Object.assign(genreVector, normalized);
  }

  // 4. Get book metadata (pub_year, page_count, primary_author)
  const bookMeta = await db.prepare(`
    SELECT
      b.page_count,
      b.language,
      b.published_date,
      (SELECT ba.author_id FROM book_authors ba WHERE ba.book_id = b.id LIMIT 1) as primary_author_id
    FROM books b
    WHERE b.id = ?
  `).bind(bookId).first();

  // Extract year from published_date (format: YYYY-MM-DD or just YYYY)
  let pub_year = null;
  if (bookMeta?.published_date) {
    const yearMatch = bookMeta.published_date.match(/^(\d{4})/);
    if (yearMatch) {
      pub_year = parseInt(yearMatch[1], 10);
    }
  }

  // 5. Upsert into book_feature_profiles
  await db.prepare(`
    INSERT INTO book_feature_profiles (
      book_id,
      avg_rating,
      rating_count,
      pace_score,
      plot_score,
      mood_vector,
      genre_vector,
      pub_year,
      page_count,
      primary_author_id,
      model_version,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(book_id) DO UPDATE SET
      avg_rating = excluded.avg_rating,
      rating_count = excluded.rating_count,
      pace_score = excluded.pace_score,
      plot_score = excluded.plot_score,
      mood_vector = excluded.mood_vector,
      genre_vector = excluded.genre_vector,
      pub_year = excluded.pub_year,
      page_count = excluded.page_count,
      primary_author_id = excluded.primary_author_id,
      updated_at = datetime('now')
  `).bind(
    bookId,
    reviewStats?.avg_rating || 0,
    reviewStats?.rating_count || 0,
    reviewStats?.pace_score || 0.5,  // Default to medium pace
    reviewStats?.plot_score || 0.5,  // Default to balanced
    JSON.stringify(moodVector),
    JSON.stringify(genreVector),
    pub_year,
    bookMeta?.page_count || null,
    bookMeta?.primary_author_id || null
  ).run();

  return {
    book_id: bookId,
    avg_rating: reviewStats?.avg_rating || 0,
    rating_count: reviewStats?.rating_count || 0,
    mood_count: moods.results.length,
    genre_count: genres.results.length
  };
}

/**
 * Bulk update profiles for multiple books (useful for seeding)
 * @param {Array<string>} bookIds - Array of book IDs
 * @param {Object} db - D1 database binding
 * @returns {Promise<Array>} Array of results
 */
export async function bulkUpdateBookFeatureProfiles(bookIds, db) {
  const results = [];

  for (const bookId of bookIds) {
    try {
      const result = await updateBookFeatureProfile(bookId, db);
      results.push({ success: true, ...result });
    } catch (error) {
      console.error(`Error updating profile for ${bookId}:`, error);
      results.push({ success: false, book_id: bookId, error: error.message });
    }
  }

  return results;
}
