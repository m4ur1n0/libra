// Queue processor for graph recompute jobs

import { recomputeBook } from './recompute.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * Process pending jobs from graph_recompute_queue
 * @param {number} batchSize - Max number of jobs to process
 * @param {Object} db - D1 database binding
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} {processed, results}
 */
export async function processRecomputeQueue(batchSize, db, config = DEFAULT_CONFIG) {
  // Claim jobs atomically (set to 'running')
  const jobs = await db.prepare(`
    UPDATE graph_recompute_queue
    SET status = 'running', attempts = attempts + 1, updated_at = datetime('now')
    WHERE id IN (
      SELECT id FROM graph_recompute_queue
      WHERE status = 'pending'
      ORDER BY priority, created_at
      LIMIT ?
    )
    RETURNING *
  `).bind(batchSize).all();

  if (!jobs.results || jobs.results.length === 0) {
    return { processed: 0, results: [], message: 'No pending jobs' };
  }

  const results = [];

  for (const job of jobs.results) {
    try {
      const result = await recomputeBook(job.book_id, db, config);

      // Mark job as done
      await db.prepare(`
        UPDATE graph_recompute_queue
        SET status = 'done', updated_at = datetime('now')
        WHERE id = ?
      `).bind(job.id).run();

      results.push({
        success: true,
        jobId: job.id,
        bookId: job.book_id,
        ...result
      });

    } catch (error) {
      console.error(`Error processing job ${job.id} for book ${job.book_id}:`, error);

      // Mark job as failed
      await db.prepare(`
        UPDATE graph_recompute_queue
        SET status = 'failed', error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(error.message, job.id).run();

      results.push({
        success: false,
        jobId: job.id,
        bookId: job.book_id,
        error: error.message
      });
    }
  }

  return {
    processed: results.length,
    results
  };
}

/**
 * Queue a book for recompute
 * @param {string} bookId - Book ID
 * @param {string} reason - Reason for recompute (e.g., 'new_book', 'new_review')
 * @param {number} priority - Priority (lower = higher priority)
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object>} {jobId}
 */
export async function queueBookForRecompute(bookId, reason, priority, db) {
  const result = await db.prepare(`
    INSERT INTO graph_recompute_queue (book_id, reason, priority, status)
    VALUES (?, ?, ?, 'pending')
    RETURNING id
  `).bind(bookId, reason, priority).first();

  return { jobId: result.id };
}

/**
 * Queue all books for recompute
 * @param {Object} db - D1 database binding
 * @param {string} reason - Reason for recompute
 * @returns {Promise<Object>} {queued}
 */
export async function queueAllBooksForRecompute(db, reason = 'manual') {
  // Get all books that have feature profiles
  const books = await db.prepare(`
    SELECT book_id FROM book_feature_profiles
  `).all();

  const stmts = [];

  for (const { book_id } of books.results) {
    stmts.push(
      db.prepare(`
        INSERT INTO graph_recompute_queue (book_id, reason, priority, status)
        VALUES (?, ?, 5, 'pending')
      `).bind(book_id, reason)
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return { queued: stmts.length };
}

/**
 * Get queue status
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object>} Status counts by status
 */
export async function getQueueStatus(db) {
  const result = await db.prepare(`
    SELECT
      status,
      COUNT(*) as count,
      AVG(attempts) as avg_attempts
    FROM graph_recompute_queue
    GROUP BY status
  `).all();

  const statusMap = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0
  };

  result.results.forEach(row => {
    statusMap[row.status] = row.count;
  });

  return statusMap;
}
