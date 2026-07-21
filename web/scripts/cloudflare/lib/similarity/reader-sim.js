// ReaderSim: Smoothed Jaccard similarity based on shared readers

/**
 * Compute smoothed reader similarity
 * Uses simplified smoothed formula: (shared + α) / (shared + β)
 * This provides regularization without needing union_readers maintenance
 *
 * @param {Object} overlap - Overlap data with shared_readers count
 * @param {Object} smoothing - Smoothing parameters {alpha, beta}
 * @returns {number} Similarity score in range [0, 1]
 */
export function computeReaderSim(overlap, smoothing = { alpha: 1, beta: 5 }) {
  // No overlap data means no shared readers
  if (!overlap || !overlap.shared_readers) return 0;

  const { shared_readers } = overlap;
  const { alpha, beta } = smoothing;

  // Smoothed formula: (shared + α) / (shared + β)
  // With α=1, β=5:
  // - 1 shared reader: (1+1)/(1+5) = 2/6 = 0.33
  // - 5 shared readers: (5+1)/(5+5) = 6/10 = 0.60
  // - 20 shared readers: (20+1)/(20+5) = 21/25 = 0.84
  // Books need ~5 shared readers before signal meaningfully separates from prior

  return (shared_readers + alpha) / (shared_readers + beta);
}

/**
 * Compute reader similarity with detailed breakdown
 * @param {Object} overlap - Overlap data
 * @param {Object} smoothing - Smoothing parameters
 * @returns {Object} {score, breakdown}
 */
export function computeReaderSimWithBreakdown(overlap, smoothing = { alpha: 1, beta: 5 }) {
  const score = computeReaderSim(overlap, smoothing);

  return {
    score,
    breakdown: {
      shared_readers: overlap?.shared_readers || 0,
      smoothed_score: score,
      formula: 'simplified_smoothed_jaccard'
    }
  };
}
