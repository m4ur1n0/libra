// API endpoint: GET /books/:bookId/similar?limit=10&reasons[]=same_author
// Get flat list of similar books with scores

export async function handleBooksSimilar(bookId, limit, reasonsFilter, db, request) {
  try {
    const maxResults = parseInt(limit, 10) || 10;

    // Fetch similar books
    let query = `
      SELECT
        e.*,
        b.id as book_id,
        b.title,
        b.subtitle,
        b.cover_image_href,
        b.page_count,
        bfp.avg_rating
      FROM book_similarity_edges e
      JOIN books b ON b.id = e.dst_book_id
      LEFT JOIN book_feature_profiles bfp ON bfp.book_id = e.dst_book_id
      WHERE e.src_book_id = ?
    `;

    // Optional: Filter by reasons (if provided)
    // For MVP, just return all and let frontend filter if needed

    query += ' ORDER BY e.rank LIMIT ?';

    const result = await db.prepare(query).bind(bookId, maxResults).all();

    // Format response
    const similar = result.results.map(e => ({
      id: e.dst_book_id,
      title: e.title,
      subtitle: e.subtitle,
      coverUrl: e.cover_image_href,
      pageCount: e.page_count,
      avgRating: e.avg_rating || 0,
      similarityScore: e.score,
      rank: e.rank,
      reasons: JSON.parse(e.reasons || '[]'),
      reasonDetail: JSON.parse(e.reason_detail || '{}')
    }));

    return new Response(JSON.stringify({
      bookId,
      similar,
      count: similar.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error(`Error fetching similar books for ${bookId}:`, error);

    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
