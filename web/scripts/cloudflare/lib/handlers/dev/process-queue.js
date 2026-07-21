// DEV endpoint: POST /dev/process-recompute-queue?batch=20
// Process pending recompute jobs

import { processRecomputeQueue } from '../../graph/queue-processor.js';

export async function handleProcessQueue(batchSize, db, request) {
  try {
    const batch = parseInt(batchSize, 10) || 20;

    if (batch < 1 || batch > 100) {
      return new Response(JSON.stringify({
        error: 'Batch size must be between 1 and 100'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const result = await processRecomputeQueue(batch, db);

    return new Response(JSON.stringify({
      success: true,
      processed: result.processed,
      results: result.results
    }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error processing queue:', error);

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
