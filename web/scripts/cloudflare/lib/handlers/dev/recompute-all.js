// DEV endpoint: POST /dev/recompute-all
// Queue all books for recompute

import { queueAllBooksForRecompute } from '../../graph/queue-processor.js';

export async function handleRecomputeAll(db, request) {
  try {
    const result = await queueAllBooksForRecompute(db, 'manual_recompute_all');

    return new Response(JSON.stringify({
      success: true,
      queued: result.queued,
      message: `Queued ${result.queued} books for recompute`
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error queuing books for recompute:', error);

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
