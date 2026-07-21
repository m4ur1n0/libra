// DEV endpoint: GET /dev/queue-status
// Get status of recompute queue

import { getQueueStatus } from '../../graph/queue-processor.js';

export async function handleQueueStatus(db, request) {
  try {
    const status = await getQueueStatus(db);

    return new Response(JSON.stringify({
      success: true,
      status
    }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error getting queue status:', error);

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
