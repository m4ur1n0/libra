// Vector math utilities for JSON-encoded vectors

/**
 * Compute cosine similarity between two JSON vectors
 * @param {Object} vecA - JSON object like {"fantasy":1, "romance":0.3}
 * @param {Object} vecB - JSON object like {"fantasy":0.8, "sci-fi":0.5}
 * @returns {number} Cosine similarity in range [0, 1]
 */
export function cosineSim(vecA, vecB) {
  // Handle null/undefined/empty inputs
  if (!vecA || !vecB || typeof vecA !== 'object' || typeof vecB !== 'object') {
    return 0;
  }

  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

  // Empty vectors have 0 similarity
  if (keys.size === 0) return 0;

  let dot = 0, magA = 0, magB = 0;

  for (const k of keys) {
    const a = vecA[k] ?? 0;
    const b = vecB[k] ?? 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  // Handle zero-magnitude vectors (shouldn't happen with normalized data, but be safe)
  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Parse JSON string to object, with fallback
 * @param {string} jsonStr - JSON string like '{"fantasy":1}'
 * @param {Object} fallback - Fallback value if parse fails
 * @returns {Object} Parsed object or fallback
 */
export function parseJsonVector(jsonStr, fallback = {}) {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Normalize a vector so all values sum to 1.0
 * @param {Object} vec - Vector object
 * @returns {Object} Normalized vector
 */
export function normalizeVector(vec) {
  if (!vec || typeof vec !== 'object') return {};

  const sum = Object.values(vec).reduce((acc, v) => acc + (v || 0), 0);

  if (sum === 0) return {};

  const normalized = {};
  for (const [key, value] of Object.entries(vec)) {
    normalized[key] = (value || 0) / sum;
  }

  return normalized;
}
