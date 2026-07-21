// Graph recompute orchestration - ties everything together

import { generateCandidates } from '../candidates/generator.js';
import { scoreBookPairWithReasons } from '../similarity/core.js';
import { storeTopKEdges } from './edge-storage.js';
import { fetchOverlap } from '../maintenance/reader-overlap.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * Recompute similarity graph for a single book
 * Main orchestration function that ties together:
 * - Candidate generation
 * - Similarity scoring
 * - Edge storage
 *
 * @param {string} bookId - Book ID to recompute
 * @param {Object} db - D1 database binding
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Recompute result with stats
 */
export async function recomputeBook(bookId, db, config = DEFAULT_CONFIG) {
  const startTime = Date.now();

  // 1. Fetch source book profile
  const profileA = await db.prepare(`
    SELECT * FROM book_feature_profiles WHERE book_id = ?
  `).bind(bookId).first();

  if (!profileA) {
    throw new Error(`No feature profile found for book ${bookId}. Run updateBookFeatureProfile first.`);
  }

  // 2. Generate candidates
  const candidates = await generateCandidates(bookId, db, config);

  if (candidates.size === 0) {
    console.warn(`No candidates generated for book ${bookId}`);
    return {
      bookId,
      candidatesEvaluated: 0,
      edgesStored: 0,
      duration_ms: Date.now() - startTime,
      warning: 'No candidates found'
    };
  }

  // 3. Score each candidate
  const scored = [];

  for (const candidateId of candidates) {
    // Fetch candidate profile
    const profileB = await db.prepare(`
      SELECT * FROM book_feature_profiles WHERE book_id = ?
    `).bind(candidateId).first();

    if (!profileB) {
      // Skip candidates without profiles
      continue;
    }

    // Fetch overlap data
    const overlap = await fetchOverlap(bookId, candidateId, db);

    // Compute similarity score
    const { score, reasons, reasonDetail } = scoreBookPairWithReasons(
      profileA,
      profileB,
      overlap,
      config
    );

    scored.push({
      bookId: candidateId,
      score,
      reasons,
      reasonDetail
    });
  }

  // 4. Store top K edges
  const storageResult = await storeTopKEdges(bookId, scored, db, config.maxEdges);

  return {
    bookId,
    candidatesEvaluated: scored.length,
    candidatesGenerated: candidates.size,
    edgesStored: storageResult.edgesStored,
    topScore: storageResult.topScore,
    avgScore: storageResult.avgScore,
    duration_ms: Date.now() - startTime
  };
}

/**
 * Recompute with detailed debug info
 * @param {string} bookId - Book ID to recompute
 * @param {Object} db - D1 database binding
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Detailed recompute result
 */
export async function recomputeBookWithDebug(bookId, db, config = DEFAULT_CONFIG) {
  const startTime = Date.now();
  const debug = {};

  // Fetch profile
  debug.profileFetchStart = Date.now();
  const profileA = await db.prepare(`
    SELECT * FROM book_feature_profiles WHERE book_id = ?
  `).bind(bookId).first();
  debug.profileFetchDuration = Date.now() - debug.profileFetchStart;

  if (!profileA) {
    throw new Error(`No feature profile for book ${bookId}`);
  }

  // Generate candidates
  debug.candidateGenStart = Date.now();
  const candidates = await generateCandidates(bookId, db, config);
  debug.candidateGenDuration = Date.now() - debug.candidateGenStart;
  debug.candidateCount = candidates.size;

  // Score candidates
  debug.scoringStart = Date.now();
  const scored = [];
  let profileFetchCount = 0;
  let overlapFetchCount = 0;

  for (const candidateId of candidates) {
    const profileB = await db.prepare(`
      SELECT * FROM book_feature_profiles WHERE book_id = ?
    `).bind(candidateId).first();
    profileFetchCount++;

    if (!profileB) continue;

    const overlap = await fetchOverlap(bookId, candidateId, db);
    overlapFetchCount++;

    const { score, reasons, reasonDetail } = scoreBookPairWithReasons(
      profileA,
      profileB,
      overlap,
      config
    );

    scored.push({ bookId: candidateId, score, reasons, reasonDetail });
  }

  debug.scoringDuration = Date.now() - debug.scoringStart;
  debug.profileFetchCount = profileFetchCount;
  debug.overlapFetchCount = overlapFetchCount;
  debug.scoredCount = scored.length;

  // Store edges
  debug.storageStart = Date.now();
  const storageResult = await storeTopKEdges(bookId, scored, db, config.maxEdges);
  debug.storageDuration = Date.now() - debug.storageStart;

  return {
    bookId,
    candidatesEvaluated: scored.length,
    edgesStored: storageResult.edgesStored,
    topScore: storageResult.topScore,
    avgScore: storageResult.avgScore,
    duration_ms: Date.now() - startTime,
    debug
  };
}
