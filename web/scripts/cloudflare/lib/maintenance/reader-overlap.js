// Reader overlap maintenance - updates book_pair_reader_overlap table

/**
 * Update reader overlap when a user marks a book as "read"
 * Uses db.batch() to avoid hitting D1's 1000-query-per-invocation limit
 *
 * CRITICAL: This function increments shared_readers on every call.
 * It should only be called ONCE per user-book pair when status changes to 'read'.
 * For idempotent seeding, truncate tables before calling this function.
 *
 * @param {string} userId - User ID
 * @param {string} newBookId - Book ID that was just marked as read
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object>} {pairsUpdated, statsUpdated}
 */
export async function updateReaderOverlap(userId, newBookId, db) {
  // Get user's OTHER read books (excluding the new one)
  const otherBooks = await db.prepare(`
    SELECT book_id FROM library_entries
    WHERE user_id = ? AND status = 'read' AND book_id != ?
  `).bind(userId, newBookId).all();

  const stmts = [];

  // Update pairs (canonical ordering: book_a < book_b)
  for (const { book_id } of otherBooks.results) {
    const [a, b] = [newBookId, book_id].sort();

    stmts.push(
      db.prepare(`
        INSERT INTO book_pair_reader_overlap (book_a, book_b, shared_readers)
        VALUES (?, ?, 1)
        ON CONFLICT(book_a, book_b) DO UPDATE SET
          shared_readers = shared_readers + 1,
          updated_at = datetime('now')
      `).bind(a, b)
    );
  }

  // Update book reader count in book_reader_stats
  stmts.push(
    db.prepare(`
      INSERT INTO book_reader_stats (book_id, reader_count, shelf_count)
      VALUES (?, 1, 1)
      ON CONFLICT(book_id) DO UPDATE SET
        reader_count = reader_count + 1,
        shelf_count = shelf_count + 1,
        updated_at = datetime('now')
    `).bind(newBookId)
  );

  // Execute all statements in a single batch (handles empty stmts array gracefully)
  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return {
    pairsUpdated: otherBooks.results.length,
    statsUpdated: 1
  };
}

/**
 * Update book shelf count when any library entry is created (not just 'read')
 * @param {string} bookId - Book ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<void>}
 */
export async function updateBookShelfCount(bookId, db) {
  await db.prepare(`
    INSERT INTO book_reader_stats (book_id, shelf_count)
    VALUES (?, 1)
    ON CONFLICT(book_id) DO UPDATE SET
      shelf_count = shelf_count + 1,
      updated_at = datetime('now')
  `).bind(bookId).run();
}

/**
 * Fetch overlap data for a book pair (handles canonical ordering)
 * @param {string} bookIdA - First book ID
 * @param {string} bookIdB - Second book ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object|null>} Overlap data or null if no overlap
 */
export async function fetchOverlap(bookIdA, bookIdB, db) {
  // Ensure canonical ordering
  const [a, b] = [bookIdA, bookIdB].sort();

  const overlap = await db.prepare(`
    SELECT book_a, book_b, shared_readers, updated_at
    FROM book_pair_reader_overlap
    WHERE book_a = ? AND book_b = ?
  `).bind(a, b).first();

  return overlap;
}
