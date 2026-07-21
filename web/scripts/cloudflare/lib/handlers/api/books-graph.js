// API endpoint: GET /books/:bookId/graph?depth=1&maxEdges=8
// Get ego-graph for a book with similar books

export async function handleBooksGraph(bookId, maxEdges, db, request) {
  try {
    const limit = parseInt(maxEdges, 10) || 8;

    // Fetch center book with profile
    const center = await db.prepare(`
      SELECT
        b.*,
        bfp.avg_rating,
        bfp.genre_vector,
        bfp.mood_vector
      FROM books b
      LEFT JOIN book_feature_profiles bfp ON bfp.book_id = b.id
      WHERE b.id = ?
    `).bind(bookId).first();

    if (!center) {
      return new Response(JSON.stringify({
        error: 'Book not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Fetch edges
    const edges = await db.prepare(`
      SELECT
        e.*,
        b.id as book_id,
        b.title,
        b.subtitle,
        b.cover_image_href,
        bfp.avg_rating
      FROM book_similarity_edges e
      JOIN books b ON b.id = e.dst_book_id
      LEFT JOIN book_feature_profiles bfp ON bfp.book_id = e.dst_book_id
      WHERE e.src_book_id = ?
      ORDER BY e.rank
      LIMIT ?
    `).bind(bookId, limit).all();

    // Format response
    const response = {
      center: formatBookNode(center),
      nodes: edges.results.map(e => ({
        ...formatBookNode(e),
        edgeScore: e.score,
        edgeRank: e.rank,
        reasons: JSON.parse(e.reasons || '[]')
      })),
      edges: edges.results.map(e => ({
        src: bookId,
        dst: e.dst_book_id,
        score: e.score,
        reasons: JSON.parse(e.reasons || '[]')
      }))
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error(`Error fetching graph for book ${bookId}:`, error);

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

/**
 * Format book data into a node object
 * @param {Object} book - Raw book data from DB
 * @returns {Object} Formatted node
 */
function formatBookNode(book) {
  return {
    id: book.id || book.book_id,
    title: book.title,
    subtitle: book.subtitle,
    coverUrl: book.cover_image_href,
    avgRating: book.avg_rating || 0,
    genres: JSON.parse(book.genre_vector || '{}'),
    moods: JSON.parse(book.mood_vector || '{}')
  };
}
