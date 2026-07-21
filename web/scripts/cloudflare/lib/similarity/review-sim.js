// ReviewSim: Review-derived similarity (pace, plot, mood)

import { cosineSim, parseJsonVector } from './vector-math.js';

/**
 * Compute review similarity between two books
 * Uses simplified MVP formula: PaceSim + PlotSim + MoodOverlap
 * (Dropped RatingSim - high ratings don't imply similarity)
 *
 * @param {Object} profileA - Book feature profile A
 * @param {Object} profileB - Book feature profile B
 * @param {Object} weights - Sub-component weights {pace, plot, mood}
 * @returns {number} Similarity score in range [0, 1]
 */
export function computeReviewSim(profileA, profileB, weights = { pace: 0.30, plot: 0.30, mood: 0.40 }) {
  if (!profileA || !profileB) return 0;

  // 1. Pace similarity: 1 - |pace_A - pace_B|
  // pace_score is in range [0, 1] where 0=slow, 0.5=medium, 1=fast
  const paceA = profileA.pace_score ?? 0.5;  // Default to medium if missing
  const paceB = profileB.pace_score ?? 0.5;
  const paceSim = 1 - Math.abs(paceA - paceB);

  // 2. Plot similarity: 1 - |plot_A - plot_B|
  // plot_score is in range [0, 1] where 0=character-driven, 0.5=balanced, 1=plot-driven
  const plotA = profileA.plot_score ?? 0.5;  // Default to balanced if missing
  const plotB = profileB.plot_score ?? 0.5;
  const plotSim = 1 - Math.abs(plotA - plotB);

  // 3. Mood overlap (cosine similarity of mood vectors)
  const moodVecA = parseJsonVector(profileA.mood_vector, {});
  const moodVecB = parseJsonVector(profileB.mood_vector, {});
  const moodOverlap = cosineSim(moodVecA, moodVecB);

  // Weighted sum
  return (
    weights.pace * paceSim +
    weights.plot * plotSim +
    weights.mood * moodOverlap
  );
}

/**
 * Compute review similarity with detailed breakdown
 * @param {Object} profileA - Book feature profile A
 * @param {Object} profileB - Book feature profile B
 * @param {Object} weights - Sub-component weights
 * @returns {Object} {score, breakdown}
 */
export function computeReviewSimWithBreakdown(profileA, profileB, weights = { pace: 0.30, plot: 0.30, mood: 0.40 }) {
  if (!profileA || !profileB) {
    return {
      score: 0,
      breakdown: { paceSim: 0, plotSim: 0, moodOverlap: 0 }
    };
  }

  // Pace similarity
  const paceA = profileA.pace_score ?? 0.5;
  const paceB = profileB.pace_score ?? 0.5;
  const paceDiff = Math.abs(paceA - paceB);
  const paceSim = 1 - paceDiff;

  // Plot similarity
  const plotA = profileA.plot_score ?? 0.5;
  const plotB = profileB.plot_score ?? 0.5;
  const plotDiff = Math.abs(plotA - plotB);
  const plotSim = 1 - plotDiff;

  // Mood overlap
  const moodVecA = parseJsonVector(profileA.mood_vector, {});
  const moodVecB = parseJsonVector(profileB.mood_vector, {});
  const moodOverlap = cosineSim(moodVecA, moodVecB);

  // Compute weighted score
  const score = (
    weights.pace * paceSim +
    weights.plot * plotSim +
    weights.mood * moodOverlap
  );

  return {
    score,
    breakdown: {
      paceSim,
      plotSim,
      moodOverlap,
      paceDiff,
      plotDiff
    }
  };
}
