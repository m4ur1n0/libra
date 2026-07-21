// DEV endpoint: POST /dev/recompute-book/:bookId
// Synchronously recompute similarity for a single book (for debugging)

import { recomputeBookWithDebug } from '../../graph/recompute.js';

export async function handleRecomputeBook(bookId, db, request) {
  try {
    const result = await recomputeBookWithDebug(bookId, db);

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error(`Error recomputing book ${bookId}:`, error);

    return new Response(JSON.stringify({
      error: error.message,
      bookId
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
