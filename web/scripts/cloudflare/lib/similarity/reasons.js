// Generate human-readable reason tags for similarity edges

/**
 * Compute reason tags based on score breakdown
 * @param {Object} breakdown - Score breakdown from similarity computation
 * @param {Object} profileA - Source book profile
 * @param {Object} profileB - Destination book profile
 * @param {Object} thresholds - Thresholds for reason tagging
 * @returns {Array<string>} Reason tags like ["same_author", "shared_genre"]
 */
export function computeReasons(breakdown, profileA, profileB, thresholds = {}) {
  const reasons = [];

  // Default thresholds
  const {
    sharedReaders = 0.1,
    genreOverlap = 0.5,
    moodOverlap = 0.5,
    paceDiff = 0.2
  } = thresholds;

  // Same author (high confidence signal)
  if (breakdown.content?.sameAuthor) {
    reasons.push('same_author');
  }

  // Shared readers (collaborative filtering signal)
  if (breakdown.reader?.smoothed_score >= sharedReaders) {
    reasons.push('shared_readers');
  }

  // Shared genre (content-based signal)
  if (breakdown.content?.genreOverlap >= genreOverlap) {
    reasons.push('shared_genre');
  }

  // Similar mood (experience-based signal)
  if (breakdown.review?.moodOverlap >= moodOverlap) {
    reasons.push('similar_mood');
  }

  // Similar pace (if very close)
  if (breakdown.review?.paceDiff !== undefined && breakdown.review.paceDiff < paceDiff) {
    reasons.push('similar_pace');
  }

  return reasons;
}

/**
 * Compute detailed reason information for storage
 * @param {Object} breakdown - Score breakdown
 * @param {Object} profileA - Source book profile
 * @param {Object} profileB - Destination book profile
 * @returns {Object} Reason detail object for JSON storage
 */
export function computeReasonDetail(breakdown, profileA, profileB) {
  const detail = {};

  // Reader overlap details
  if (breakdown.reader) {
    detail.shared_readers = breakdown.reader.shared_readers || 0;
    detail.reader_score = breakdown.reader.smoothed_score || 0;
  }

  // Content similarity details
  if (breakdown.content) {
    if (breakdown.content.sameAuthor) {
      detail.same_author = true;
      detail.author_id = profileA.primary_author_id;
    }
    if (breakdown.content.genreOverlap > 0) {
      detail.genre_overlap = Math.round(breakdown.content.genreOverlap * 100) / 100;
    }
    if (breakdown.content.sameLanguage) {
      detail.same_language = profileA.language;
    }
  }

  // Review similarity details
  if (breakdown.review) {
    if (breakdown.review.moodOverlap > 0) {
      detail.mood_overlap = Math.round(breakdown.review.moodOverlap * 100) / 100;
    }
    if (breakdown.review.paceDiff !== undefined) {
      detail.pace_diff = Math.round(breakdown.review.paceDiff * 100) / 100;
    }
    if (breakdown.review.plotDiff !== undefined) {
      detail.plot_diff = Math.round(breakdown.review.plotDiff * 100) / 100;
    }
  }

  return detail;
}
