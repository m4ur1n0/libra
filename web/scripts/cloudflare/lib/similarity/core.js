// Core similarity scoring orchestrator

import { computeReaderSimWithBreakdown } from './reader-sim.js';
import { computeContentSimWithBreakdown } from './content-sim.js';
import { computeReviewSimWithBreakdown } from './review-sim.js';
import { computeReasons, computeReasonDetail } from './reasons.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * Compute overall similarity score between two books
 * Combines ReaderSim, ContentSim, and ReviewSim with configurable weights
 *
 * @param {Object} profileA - Source book feature profile
 * @param {Object} profileB - Destination book feature profile
 * @param {Object} overlap - Reader overlap data (from book_pair_reader_overlap)
 * @param {Object} config - Configuration object (weights, thresholds, etc.)
 * @returns {Object} {score, breakdown}
 */
export function scoreBookPair(profileA, profileB, overlap, config = DEFAULT_CONFIG) {
  // Validate inputs
  if (!profileA || !profileB) {
    return {
      score: 0,
      breakdown: {
        reader: { score: 0, breakdown: {} },
        content: { score: 0, breakdown: {} },
        review: { score: 0, breakdown: {} }
      }
    };
  }

  // Compute component similarities with detailed breakdowns
  const readerResult = computeReaderSimWithBreakdown(overlap, config.smoothing);
  const contentResult = computeContentSimWithBreakdown(profileA, profileB, config.contentWeights);
  const reviewResult = computeReviewSimWithBreakdown(profileA, profileB, config.reviewWeights);

  // Weighted combination
  const score = (
    config.weights.reader * readerResult.score +
    config.weights.content * contentResult.score +
    config.weights.review * reviewResult.score
  );

  // Assemble breakdown for reason generation
  const breakdown = {
    reader: readerResult.breakdown,
    content: contentResult.breakdown,
    review: reviewResult.breakdown,
    componentScores: {
      readerSim: readerResult.score,
      contentSim: contentResult.score,
      reviewSim: reviewResult.score
    }
  };

  return { score, breakdown };
}

/**
 * Score a book pair and generate reasons
 * @param {Object} profileA - Source book feature profile
 * @param {Object} profileB - Destination book feature profile
 * @param {Object} overlap - Reader overlap data
 * @param {Object} config - Configuration object
 * @returns {Object} {score, breakdown, reasons, reasonDetail}
 */
export function scoreBookPairWithReasons(profileA, profileB, overlap, config = DEFAULT_CONFIG) {
  const { score, breakdown } = scoreBookPair(profileA, profileB, overlap, config);

  // Generate human-readable reasons
  const reasons = computeReasons(breakdown, profileA, profileB, config.reasonThresholds);

  // Generate detailed reason information for storage
  const reasonDetail = computeReasonDetail(breakdown, profileA, profileB);

  return {
    score,
    breakdown,
    reasons,
    reasonDetail
  };
}
