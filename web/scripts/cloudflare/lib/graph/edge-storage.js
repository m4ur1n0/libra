// Edge storage - manages book_similarity_edges table

/**
 * Store top-K similarity edges for a book
 * Replaces all existing edges for the source book
 *
 * @param {string} bookId - Source book ID
 * @param {Array} scoredCandidates - Array of {bookId, score, reasons, breakdown}
 * @param {Object} db - D1 database binding
 * @param {number} K - Max edges to store (default 50)
 * @returns {Promise<Object>} {edgesStored, topScore, avgScore}
 */
export async function storeTopKEdges(bookId, scoredCandidates, db, K = 50) {
  // Sort by score descending and take top K
  const top = scoredCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, K);

  if (top.length === 0) {
    console.warn(`No edges to store for book ${bookId}`);
    return { edgesStored: 0, topScore: 0, avgScore: 0 };
  }

  // Delete old edges for this source book
  await db.prepare(`
    DELETE FROM book_similarity_edges WHERE src_book_id = ?
  `).bind(bookId).run();

  // Prepare insert statement
  const stmt = db.prepare(`
    INSERT INTO book_similarity_edges (
      src_book_id,
      dst_book_id,
      score,
      rank,
      reasons,
      reason_detail,
      model_version,
      computed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  // Use db.batch() for efficient insertion
  const inserts = [];
  for (let i = 0; i < top.length; i++) {
    const { bookId: dst, score, reasons, reasonDetail } = top[i];
    inserts.push(
      stmt.bind(
        bookId,
        dst,
        score,
        i + 1,  // rank (1-indexed)
        JSON.stringify(reasons || []),
        JSON.stringify(reasonDetail || {})
      )
    );
  }

  await db.batch(inserts);

  // Calculate stats
  const topScore = top[0].score;
  const avgScore = top.reduce((sum, item) => sum + item.score, 0) / top.length;

  return {
    edgesStored: top.length,
    topScore: Math.round(topScore * 1000) / 1000,  // Round to 3 decimals
    avgScore: Math.round(avgScore * 1000) / 1000
  };
}

/**
 * Fetch stored edges for a book
 * @param {string} bookId - Source book ID
 * @param {Object} db - D1 database binding
 * @param {number} limit - Max edges to fetch
 * @returns {Promise<Array>} Array of edge objects
 */
export async function fetchEdgesForBook(bookId, db, limit = 50) {
  const result = await db.prepare(`
    SELECT * FROM book_similarity_edges
    WHERE src_book_id = ?
    ORDER BY rank
    LIMIT ?
  `).bind(bookId, limit).all();

  return result.results.map(edge => ({
    ...edge,
    reasons: JSON.parse(edge.reasons || '[]'),
    reason_detail: JSON.parse(edge.reason_detail || '{}')
  }));
}

/**
 * Get edge count statistics
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object>} {totalEdges, booksWithEdges, avgEdgesPerBook}
 */
export async function getEdgeStats(db) {
  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total_edges,
      COUNT(DISTINCT src_book_id) as books_with_edges,
      CAST(COUNT(*) AS REAL) / NULLIF(COUNT(DISTINCT src_book_id), 0) as avg_edges_per_book
    FROM book_similarity_edges
  `).first();

  return stats;
}
