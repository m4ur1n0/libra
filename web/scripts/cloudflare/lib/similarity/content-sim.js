// ContentSim: Bibliographic feature similarity (author, genre, language)

import { cosineSim, parseJsonVector } from './vector-math.js';

/**
 * Compute content similarity between two books
 * Uses simplified MVP formula: AuthorMatch + GenreOverlap + LanguageMatch
 * (Dropped YearSim and PageCountSim as weak signals)
 *
 * @param {Object} profileA - Book feature profile A
 * @param {Object} profileB - Book feature profile B
 * @param {Object} weights - Sub-component weights {author, genre, language}
 * @returns {number} Similarity score in range [0, 1]
 */
export function computeContentSim(profileA, profileB, weights = { author: 0.40, genre: 0.50, language: 0.10 }) {
  if (!profileA || !profileB) return 0;

  // 1. Author match (binary: 1 if same, 0 otherwise)
  const authorMatch = (profileA.primary_author_id && profileB.primary_author_id &&
                       profileA.primary_author_id === profileB.primary_author_id) ? 1 : 0;

  // 2. Genre overlap (cosine similarity of genre vectors)
  const genreVecA = parseJsonVector(profileA.genre_vector, {});
  const genreVecB = parseJsonVector(profileB.genre_vector, {});
  const genreOverlap = cosineSim(genreVecA, genreVecB);

  // 3. Language match (binary: 1 if same, 0 otherwise)
  const languageMatch = (profileA.language && profileB.language &&
                         profileA.language === profileB.language) ? 1 : 0;

  // Weighted sum
  return (
    weights.author * authorMatch +
    weights.genre * genreOverlap +
    weights.language * languageMatch
  );
}

/**
 * Compute content similarity with detailed breakdown
 * @param {Object} profileA - Book feature profile A
 * @param {Object} profileB - Book feature profile B
 * @param {Object} weights - Sub-component weights
 * @returns {Object} {score, breakdown}
 */
export function computeContentSimWithBreakdown(profileA, profileB, weights = { author: 0.40, genre: 0.50, language: 0.10 }) {
  if (!profileA || !profileB) {
    return {
      score: 0,
      breakdown: { authorMatch: 0, genreOverlap: 0, languageMatch: 0 }
    };
  }

  // Author match
  const sameAuthor = profileA.primary_author_id && profileB.primary_author_id &&
                     profileA.primary_author_id === profileB.primary_author_id;
  const authorMatch = sameAuthor ? 1 : 0;

  // Genre overlap
  const genreVecA = parseJsonVector(profileA.genre_vector, {});
  const genreVecB = parseJsonVector(profileB.genre_vector, {});
  const genreOverlap = cosineSim(genreVecA, genreVecB);

  // Language match
  const sameLanguage = profileA.language && profileB.language &&
                       profileA.language === profileB.language;
  const languageMatch = sameLanguage ? 1 : 0;

  // Compute weighted score
  const score = (
    weights.author * authorMatch +
    weights.genre * genreOverlap +
    weights.language * languageMatch
  );

  return {
    score,
    breakdown: {
      authorMatch,
      genreOverlap,
      languageMatch,
      sameAuthor,
      sameLanguage
    }
  };
}
