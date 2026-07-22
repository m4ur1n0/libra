# Graph Book Discovery: Backend Architecture & Implementation Plan

> Stack: Next.js App Router · Cloudflare Workers (plain JS) · D1 · Wrangler (remote deploy only)

---

## Table of Contents

1. [Schema Design](#1-schema-design)
2. [Similarity Model](#2-similarity-model)
3. [Candidate Generation](#3-candidate-generation)
4. [Graph Edge Storage](#4-graph-edge-storage)
5. [Update / Recompute Strategy](#5-update--recompute-strategy)
6. [Backend API Endpoints](#6-backend-api-endpoints)
7. [Sample / Dummy Data Strategy](#7-sample--dummy-data-strategy)
8. [Implementation Sequence](#8-implementation-sequence)
9. [Deliverables Summary](#9-deliverables-summary)
10. [Deferred Features](#10-deferred-features)

---

## 1. Schema Design

### 1.1 Critique of the Existing Schema

The existing schema is a reasonable starting point but has several gaps for the graph feature:

- **No denormalized read stats per book.** Counting library entries on every request is expensive. We need a materialized `book_reader_stats` table.
- **`review_moods` links reviews to moods, but there is no per-book mood rollup.** We need a `book_feature_profiles` table with aggregated numeric features.
- **No pairwise overlap table.** Reader overlap between two books must be pre-materialized. Computing it per request across millions of pairs would be infeasible.
- **No edge table.** The graph has no storage at all in the current schema.
- **`books.year` should be an integer.** Store publication year as `INTEGER` not `TEXT` so we can do range queries efficiently.
- **`books` is missing useful content fields.** `page_count`, `language`, `description_embedding_bucket` (a rough content cluster ID for candidate generation) are missing.
- **`library_entries.status`** should have a CHECK constraint and an indexed `updated_at` for incremental recompute.

### 1.2 Proposed New Tables

#### `book_feature_profiles`

Stores aggregated content-derived signals per book. Updated whenever a new review comes in. Drives content similarity scoring.

```sql
CREATE TABLE book_feature_profiles (
  book_id       TEXT PRIMARY KEY REFERENCES books(id),
  avg_rating    REAL DEFAULT 0,        -- mean of all review ratings
  rating_count  INTEGER DEFAULT 0,     -- number of ratings (for smoothing)
  pace_score    REAL DEFAULT 0.5,      -- 0=slow, 1=fast; avg of review signals
  plot_score    REAL DEFAULT 0.5,      -- 0=character-driven, 1=plot-driven
  prose_score   REAL DEFAULT 0.5,      -- 0=dense, 1=accessible
  mood_vector   TEXT DEFAULT '{}',     -- JSON: {"dark":0.8,"funny":0.1,...} normalized 0-1
  genre_vector  TEXT DEFAULT '{}',     -- JSON: {"fantasy":1,"romance":0.3,...}
  pub_year      INTEGER,               -- denormalized from books for fast range queries
  page_count    INTEGER,
  primary_author_id TEXT REFERENCES authors(id),
  model_version INTEGER DEFAULT 1,     -- bump when scoring formula changes
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_bfp_year ON book_feature_profiles(pub_year);
CREATE INDEX idx_bfp_author ON book_feature_profiles(primary_author_id);
CREATE INDEX idx_bfp_model ON book_feature_profiles(model_version);
```

**Why mood_vector and genre_vector as JSON?**
D1 has no native array type. JSON text columns with a `json_each()` query are the standard D1 approach. This avoids a many-to-many join on every similarity computation and keeps candidate lookups fast.

#### `book_reader_stats`

Materialized per-book read counts. Updated whenever a library entry is created/updated.

```sql
CREATE TABLE book_reader_stats (
  book_id         TEXT PRIMARY KEY REFERENCES books(id),
  reader_count    INTEGER DEFAULT 0,   -- users who have read (status = 'read')
  shelf_count     INTEGER DEFAULT 0,   -- users who have shelved (any status)
  review_count    INTEGER DEFAULT 0,
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

#### `book_pair_reader_overlap`

Materialized Jaccard-style overlap between pairs of books based on shared readers. Only stored for pairs where overlap > 0 (at least 1 shared reader).

```sql
CREATE TABLE book_pair_reader_overlap (
  book_a          TEXT NOT NULL,       -- always store lower ID first (canonical)
  book_b          TEXT NOT NULL,
  shared_readers  INTEGER DEFAULT 0,
  union_readers   INTEGER DEFAULT 0,
  jaccard         REAL GENERATED ALWAYS AS
                    (CAST(shared_readers AS REAL) / MAX(union_readers, 1)) STORED,
  updated_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (book_a, book_b),
  FOREIGN KEY (book_a) REFERENCES books(id),
  FOREIGN KEY (book_b) REFERENCES books(id),
  CHECK (book_a < book_b)             -- enforces canonical ordering
);

CREATE INDEX idx_overlap_a ON book_pair_reader_overlap(book_a, jaccard DESC);
CREATE INDEX idx_overlap_b ON book_pair_reader_overlap(book_b, jaccard DESC);
```

**Why canonical ordering (book_a < book_b)?**
Storing `(A,B)` and `(B,A)` separately doubles storage and complicates updates. Query helpers handle both directions.

#### `book_similarity_edges`

The top-K similarity graph. One row = one directed edge with a score and human-readable reason tags.

```sql
CREATE TABLE book_similarity_edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  src_book_id   TEXT NOT NULL REFERENCES books(id),
  dst_book_id   TEXT NOT NULL REFERENCES books(id),
  score         REAL NOT NULL,         -- 0-1, higher = more similar
  rank          INTEGER NOT NULL,      -- 1 = most similar neighbor of src
  reasons       TEXT DEFAULT '[]',     -- JSON array: ["same_author","shared_genre","shared_readers"]
  reason_detail TEXT DEFAULT '{}',     -- JSON: {"shared_genre":["fantasy"],"jaccard":0.42}
  model_version INTEGER DEFAULT 1,
  computed_at   TEXT DEFAULT (datetime('now')),
  UNIQUE (src_book_id, dst_book_id)
);

CREATE INDEX idx_edges_src ON book_similarity_edges(src_book_id, rank);
CREATE INDEX idx_edges_dst ON book_similarity_edges(dst_book_id, score DESC);
CREATE INDEX idx_edges_score ON book_similarity_edges(src_book_id, score DESC);
```

#### `graph_recompute_queue`

A lightweight job queue so recompute work can be batched and tracked without Cloudflare Queues (for now). Easy to replace with real queues later.

```sql
CREATE TABLE graph_recompute_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     TEXT NOT NULL REFERENCES books(id),
  reason      TEXT NOT NULL,           -- 'new_book'|'new_review'|'new_library_entry'|'manual'
  priority    INTEGER DEFAULT 5,       -- lower = higher priority
  status      TEXT DEFAULT 'pending'   -- 'pending'|'running'|'done'|'failed'
              CHECK(status IN ('pending','running','done','failed')),
  attempts    INTEGER DEFAULT 0,
  error       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_queue_pending ON graph_recompute_queue(status, priority, created_at)
  WHERE status = 'pending';
```

#### Alterations to Existing Tables

```sql
-- Add page_count and language to books (used in content similarity)
ALTER TABLE books ADD COLUMN page_count INTEGER;
ALTER TABLE books ADD COLUMN language TEXT DEFAULT 'en';

-- Add pace/plot signals to reviews (user-submitted or inferred)
ALTER TABLE reviews ADD COLUMN pace_signal REAL;       -- 0=slow, 1=fast, NULL=not provided
ALTER TABLE reviews ADD COLUMN plot_signal REAL;       -- 0=character, 1=plot
ALTER TABLE reviews ADD COLUMN prose_signal REAL;      -- 0=dense, 1=accessible

-- Ensure library_entries has an indexed updated_at for incremental recompute
CREATE INDEX IF NOT EXISTS idx_library_updated ON library_entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id, created_at);
```

---

## 2. Similarity Model

### 2.1 Formula

```
similarity(A, B) = w_reader * ReaderSim(A,B)
                 + w_content * ContentSim(A,B)
                 + w_review * ReviewSim(A,B)
```

Default weights (tunable, stored in a config row):

| Component     | Weight | Notes                                     |
|---------------|--------|-------------------------------------------|
| `w_reader`    | 0.40   | Strongest signal when data exists         |
| `w_content`   | 0.35   | Always available, even for new books      |
| `w_review`    | 0.25   | Grows as reviews accumulate               |

### 2.2 ReaderSim — Smoothed Jaccard

```
RawJaccard(A,B) = shared_readers / union_readers

SmoothedJaccard(A,B) = (shared_readers + α) / (union_readers + β)
```

Smoothing constants: `α = 1`, `β = 5`. This prevents two books with 1 shared reader from scoring Jaccard = 1.0. With these values, a book pair needs ~5 shared readers before the score meaningfully separates from the prior.

**Implementation:** Read directly from `book_pair_reader_overlap.jaccard` (already materialized).

### 2.3 ContentSim — Bibliographic Features

```
ContentSim(A,B) = w1 * AuthorMatch(A,B)
               + w2 * YearSim(A,B)
               + w3 * GenreOverlap(A,B)
               + w4 * PageCountSim(A,B)
               + w5 * LanguageMatch(A,B)
```

Sub-weights (sum to 1):

| Signal          | Weight | Formula                                                   |
|-----------------|--------|-----------------------------------------------------------|
| AuthorMatch     | 0.30   | 1 if same primary author, 0 otherwise                     |
| YearSim         | 0.20   | `exp(-|year_A - year_B| / 20)` — decays over 20-year gaps |
| GenreOverlap    | 0.30   | Cosine similarity of genre vectors                        |
| PageCountSim    | 0.10   | `1 - |log(pages_A/pages_B)| / 4` clamped to [0,1]        |
| LanguageMatch   | 0.10   | 1 if same language                                        |

### 2.4 ReviewSim — Derived Signals

```
ReviewSim(A,B) = w1 * RatingSim(A,B)
              + w2 * PaceSim(A,B)
              + w3 * PlotSim(A,B)
              + w4 * MoodOverlap(A,B)
```

Sub-weights:

| Signal       | Weight | Formula                                              |
|--------------|--------|------------------------------------------------------|
| RatingSim    | 0.25   | `1 - |avg_rating_A - avg_rating_B| / 4`              |
| PaceSim      | 0.20   | `1 - |pace_A - pace_B|`                              |
| PlotSim      | 0.20   | `1 - |plot_A - plot_B|`                              |
| MoodOverlap  | 0.35   | Cosine similarity of mood vectors                    |

**Cosine similarity for JSON vectors:**

The scoring function computes this in JavaScript (not SQL):

```js
function cosineSim(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const a = vecA[k] ?? 0, b = vecB[k] ?? 0;
    dot += a * b; magA += a * a; magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

### 2.5 Reason Labels

When storing an edge, compute which signals contributed most:

```js
function computeReasons(scoreBreakdown) {
  const reasons = [];
  if (scoreBreakdown.sameAuthor) reasons.push('same_author');
  if (scoreBreakdown.jaccard > 0.1) reasons.push('shared_readers');
  if (scoreBreakdown.genreOverlap > 0.5) reasons.push('shared_genre');
  if (scoreBreakdown.moodOverlap > 0.5) reasons.push('similar_mood');
  if (scoreBreakdown.yearDiff < 5) reasons.push('same_era');
  if (scoreBreakdown.paceDiff < 0.2) reasons.push('similar_pace');
  return reasons;
}
```

### 2.6 Model Versioning

`book_feature_profiles.model_version` and `book_similarity_edges.model_version` track which formula was used. When you change weights or formulas, bump `MODEL_VERSION` in your Worker config and only recompute edges where `model_version < MODEL_VERSION`. Old edges remain queryable until recomputed.

---

## 3. Candidate Generation

Never score all N×N pairs. Instead, generate a candidate set of ~100–2000 books per book, then score only those.

### 3.1 Candidate Sources (in priority order)

```
1. Same author books              → always include (usually small set)
2. Books sharing ≥1 genre         → top 100 by jaccard with current book's genre vector
3. Books within ±10 years         → top 50 by year proximity
4. Books with any shared readers  → all rows in book_pair_reader_overlap for this book
5. Books sharing ≥1 mood          → top 50 from mood_vector overlap query
6. Explicitly related books       → all rows in review_related_books where either book matches
```

### 3.2 Candidate Generation SQL

```sql
-- Source 1: Same author
SELECT b.id FROM books b
JOIN book_authors ba ON ba.book_id = b.id
WHERE ba.author_id IN (
  SELECT author_id FROM book_authors WHERE book_id = ?1
) AND b.id != ?1;

-- Source 2+3: Shared genre or year proximity
SELECT bfp.book_id FROM book_feature_profiles bfp
WHERE bfp.book_id != ?1
  AND ABS(bfp.pub_year - (SELECT pub_year FROM book_feature_profiles WHERE book_id = ?1)) <= 10
LIMIT 200;

-- Source 4: Shared readers (from materialized overlap)
SELECT CASE WHEN book_a = ?1 THEN book_b ELSE book_a END AS candidate
FROM book_pair_reader_overlap
WHERE book_a = ?1 OR book_b = ?1
ORDER BY jaccard DESC LIMIT 500;

-- Source 6: Explicit review relationships
SELECT CASE WHEN book_id = ?1 THEN related_book_id ELSE book_id END AS candidate
FROM review_related_books
WHERE book_id = ?1 OR related_book_id = ?1;
```

### 3.3 Deduplication

Collect all candidate IDs into a JavaScript `Set`, then score only that set (typically 200–800 books in practice).

---


---

## 4. Graph Edge Storage

### 4.1 Directed vs Undirected

**Decision: Store bidirectional directed edges (both A→B and B→A).**

Rationale:
- Similarity is symmetric by formula, but top-K neighborhoods are not — A's 25 nearest may not include B even if B's 25 nearest includes A.
- Storing both directions makes retrieval a simple `WHERE src_book_id = ?` query.
- Storage cost: ~50 rows per book × 1,000 books = 50,000 rows. Negligible for D1.

### 4.2 Top-K Recommendation

- **Store top 50 edges per book** (configurable via `MAX_EDGES` constant).
- **Display top 5–10 per book** in the UI (frontend filters by `rank`).
- This gives a buffer for filtering out edges that don't render well visually.

### 4.3 Edge Upsert Logic

When recomputing for a book:

```js
async function storeTopKEdges(bookId, scoredCandidates, db, modelVersion) {
  const K = 50;
  const top = scoredCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, K);

  // Delete old edges for this source book
  await db.prepare(`DELETE FROM book_similarity_edges WHERE src_book_id = ?`)
    .bind(bookId).run();

  // Insert new edges
  const stmt = db.prepare(`
    INSERT INTO book_similarity_edges
      (src_book_id, dst_book_id, score, rank, reasons, reason_detail, model_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < top.length; i++) {
    const { bookId: dst, score, reasons, reasonDetail } = top[i];
    await stmt.bind(bookId, dst, score, i + 1,
      JSON.stringify(reasons), JSON.stringify(reasonDetail), modelVersion).run();
  }
}
```

---


---

# THIS IS WHERE I LEFT OFF

---

## 5. Update / Recompute Strategy

### 5.1 What Triggers What

| Event                      | What to Update                                              | Timing        |
|----------------------------|-------------------------------------------------------------|---------------|
| Book imported              | Insert `book_feature_profiles`, queue recompute for book   | Sync + async  |
| Review created/updated     | Update `book_feature_profiles` for book, queue recompute   | Async         |
| Library entry created      | Update `book_reader_stats`, update `book_pair_reader_overlap` for book's co-readers, queue recompute | Async |
| User follows another user  | No immediate recompute needed (feed query handles follows)  | None          |
| Manual `/dev/recompute-all` | Queue all active books                                    | Batch         |

### 5.2 Background Worker Loop

For MVP, implement a polling endpoint that processes `graph_recompute_queue` in small batches. Call it via a cron or manually:

```
POST /dev/process-recompute-queue?batch=20
```

This endpoint:
1. Claims up to N pending jobs (`UPDATE ... SET status='running' WHERE status='pending' LIMIT N`)
2. Runs candidate generation + scoring for each book
3. Stores edges
4. Marks jobs done

**Later:** Replace with Cloudflare Queues by having event handlers push messages instead of inserting into `graph_recompute_queue`.

### 5.3 `book_pair_reader_overlap` Maintenance

When a user adds a book to their library (status = `'read'`):

```js
async function updateReaderOverlap(userId, newBookId, db) {
  // Get all other books this user has read
  const otherBooks = await db.prepare(`
    SELECT book_id FROM library_entries
    WHERE user_id = ? AND status = 'read' AND book_id != ?
  `).bind(userId, newBookId).all();

  for (const { book_id: otherBookId } of otherBooks.results) {
    const [a, b] = [newBookId, otherBookId].sort(); // canonical ordering
    await db.prepare(`
      INSERT INTO book_pair_reader_overlap (book_a, book_b, shared_readers, union_readers)
      VALUES (?, ?, 1, 2)
      ON CONFLICT(book_a, book_b) DO UPDATE SET
        shared_readers = shared_readers + 1,
        union_readers = (
          SELECT (SELECT reader_count FROM book_reader_stats WHERE book_id = ?)
                + (SELECT reader_count FROM book_reader_stats WHERE book_id = ?)
                - shared_readers - 1
        ),
        updated_at = datetime('now')
    `).bind(a, b, a, b).run();
  }

  // Update this book's reader stats
  await db.prepare(`
    INSERT INTO book_reader_stats (book_id, reader_count)
    VALUES (?, 1)
    ON CONFLICT(book_id) DO UPDATE SET
      reader_count = reader_count + 1,
      updated_at = datetime('now')
  `).bind(newBookId).run();
}
```

---

## 6. Backend API Endpoints

### 6.1 Development / Admin Endpoints

```
POST /dev/seed-books
  Body: { source: 'openlibrary' | 'static', limit: 1000 }
  Fetches and imports books from Open Library into D1.

POST /dev/seed-fake-users
  Body: { userCount: 500, reviewsPerUser: 5 }
  Creates fake users, library entries, reviews, follows.

POST /dev/recompute-book/:bookId
  Immediately computes similarity for one book (sync, for debugging).

POST /dev/recompute-all
  Queues all books for recompute.

POST /dev/process-recompute-queue
  Query: ?batch=20
  Processes N pending recompute jobs.

GET /dev/queue-status
  Returns counts of pending/running/done/failed jobs.
```

### 6.2 Product Endpoints

```
GET /books/:bookId/graph
  Query: ?depth=1&maxEdges=8
  Returns the ego-graph centered on bookId.
  Response: { center: Node, nodes: Node[], edges: Edge[] }

GET /books/:bookId/similar
  Query: ?limit=10&reasons[]=same_author
  Returns flat list of similar books with scores.

GET /feed/graph
  Auth: session token
  Returns feed items for the authenticated user: reviews from followed users,
  each enriched with graph data for the reviewed book.
  Response: { items: FeedItem[] }
```

### 6.3 API Response Shapes

#### `GET /books/:bookId/graph`

```json
{
  "center": {
    "id": "book_abc",
    "title": "The Name of the Wind",
    "author": "Patrick Rothfuss",
    "coverUrl": "https://...",
    "avgRating": 4.5,
    "genres": ["fantasy", "adventure"],
    "moods": ["dark", "immersive"]
  },
  "nodes": [
    {
      "id": "book_xyz",
      "title": "The Way of Kings",
      "author": "Brandon Sanderson",
      "coverUrl": "https://...",
      "avgRating": 4.7,
      "genres": ["fantasy"],
      "moods": ["epic", "dark"],
      "edgeScore": 0.82,
      "edgeRank": 1,
      "reasons": ["shared_genre", "shared_readers", "similar_mood"],
      "reasonDetail": {
        "shared_genre": ["fantasy"],
        "jaccard": 0.34,
        "moodOverlap": 0.71
      }
    }
  ],
  "edges": [
    { "src": "book_abc", "dst": "book_xyz", "score": 0.82, "reasons": ["shared_genre"] }
  ]
}
```

#### `GET /feed/graph`

```json
{
  "items": [
    {
      "type": "review",
      "review": {
        "id": "rev_123",
        "userId": "user_456",
        "username": "readingnerdfiona",
        "rating": 4,
        "body": "Absolutely gripping...",
        "createdAt": "2025-06-01T14:22:00Z"
      },
      "book": { "id": "book_abc", "title": "...", "coverUrl": "..." },
      "graph": {
        "nodes": [...],
        "edges": [...]
      }
    }
  ],
  "cursor": "2025-06-01T14:22:00Z"
}
```

---

## 7. Sample / Dummy Data Strategy

### 7.1 Book Data — Open Library

Use the Open Library `/search.json` API to fetch ~1,200 real books in structured clusters.

Clusters to fetch (200 books each):

| Cluster | Open Library Query |
|---------|-------------------|
| Epic Fantasy | `subject:fantasy&subject:epic` |
| Literary Fiction | `subject:literary fiction&language:eng` |
| Science Fiction | `subject:science fiction&language:eng` |
| Philosophy / Essays | `subject:philosophy&language:eng` |
| Contemporary Romance | `subject:romance&subject:contemporary` |
| Historical Fiction | `subject:historical fiction` |

Each book record from OL contains: title, author, subject (genres), first_publish_year, number_of_pages, and a cover ID.

### 7.2 Seeding Script Design

```
scripts/seed/
  fetch-openlibrary.js     -- fetches 1200 books into data/books-raw.json
  build-seed-sql.js        -- converts raw JSON to SQL inserts
  seed-data/
    books.sql              -- ~1200 books INSERT statements
    authors.sql
    genres.sql
    book_genres.sql
    book_authors.sql
    moods.sql              -- 15 curated moods
    book_moods_fake.sql    -- assigned by cluster heuristic
```

**Mood assignment heuristic by cluster:**

```js
const CLUSTER_MOODS = {
  'epic_fantasy':      ['dark', 'adventurous', 'immersive', 'epic'],
  'literary_fiction':  ['melancholic', 'reflective', 'tense'],
  'sci_fi':            ['thought-provoking', 'tense', 'adventurous'],
  'philosophy':        ['reflective', 'thought-provoking'],
  'romance':           ['emotional', 'hopeful', 'light'],
  'historical':        ['immersive', 'melancholic', 'tense']
};
```

Assign moods with probability weighting so books in the same cluster share moods but aren't identical.

### 7.3 Fake User Generation

```
500 fake users
Each user is assigned a primary cluster (the genre they prefer)
  → 70% of their reads are from that cluster
  → 30% from random other clusters

Per user:
  8–15 library entries with status='read'
  3–6 library entries with status='want_to_read'
  2–5 reviews (subset of reads)
  5–15 follows (biased toward users in same cluster)
```

This cluster structure ensures books in the same genre have meaningful reader overlap (Jaccard > 0), while books across genres have some cross-cluster overlap from multi-genre readers — exactly what makes the graph visually interesting.

### 7.4 Seeding Process

```bash
# Step 1: Fetch from Open Library and build SQL
node scripts/seed/fetch-openlibrary.js
node scripts/seed/build-seed-sql.js

# Step 2: Deploy migrations first
npx wrangler d1 migrations apply bookgraph-db --remote

# Step 3: Execute seed SQL against remote D1
npx wrangler d1 execute bookgraph-db --remote --file=scripts/seed/books.sql
npx wrangler d1 execute bookgraph-db --remote --file=scripts/seed/authors.sql
# ... etc.

# Step 4: Use deployed Worker endpoint for fake users
curl -X POST https://your-worker.workers.dev/dev/seed-fake-users \
  -H "Content-Type: application/json" \
  -d '{"userCount":500,"reviewsPerUser":5}'

# Step 5: Trigger recompute
curl -X POST https://your-worker.workers.dev/dev/recompute-all
curl -X POST "https://your-worker.workers.dev/dev/process-recompute-queue?batch=50"
```

---

## 8. Implementation Sequence

### Stage 1 — Schema Migration (Day 1)

**Files to create/modify:**
- `scripts/cloudflare/migrations/0002_graph_tables.sql` — new tables above
- `scripts/cloudflare/migrations/0003_alter_books.sql` — add page_count, language
- `scripts/cloudflare/migrations/0004_alter_reviews.sql` — add pace/plot/prose signals

**Deploy:**
```bash
npx wrangler d1 migrations apply bookgraph-db --remote
```

**Verify:**
```bash
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected: `book_feature_profiles`, `book_pair_reader_overlap`, `book_reader_stats`, `book_similarity_edges`, `graph_recompute_queue` all present.

---

### Stage 2 — Book Import + Feature Profile (Days 2–3)

**Files:**
- `scripts/seed/fetch-openlibrary.js`
- `scripts/seed/build-seed-sql.js`
- `src/worker/handlers/dev/seed-books.js`

**Worker route:** `POST /dev/seed-books`

This handler reads from a static JSON file bundled with the Worker (kept under 1MB) and batch-inserts into `books`, `authors`, `book_authors`, `genres`, `book_genres`, and `book_feature_profiles`.

**Verify:**
```bash
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT COUNT(*) as book_count FROM books;"
# Expect: ~1200
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT COUNT(*) FROM book_feature_profiles;"
# Expect: ~1200
```

---

### Stage 3 — Fake Users + Reader Stats (Days 3–4)

**Files:**
- `src/worker/handlers/dev/seed-fake-users.js`
- `src/worker/lib/reader-overlap.js` — `updateReaderOverlap()` helper

**Worker route:** `POST /dev/seed-fake-users`

This handler generates users, library entries, reviews, and follows deterministically (seeded RNG so results are reproducible), then calls `updateReaderOverlap()` for each library entry to populate `book_reader_stats` and `book_pair_reader_overlap`.

**Verify:**
```bash
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT COUNT(*) FROM book_pair_reader_overlap WHERE shared_readers > 2;"
# Expect: thousands of pairs with real overlap
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT book_id, reader_count FROM book_reader_stats ORDER BY reader_count DESC LIMIT 10;"
# Expect: popular books with 30-80 readers
```

---

### Stage 4 — Similarity Scorer (Days 4–5)

**Files:**
- `src/worker/lib/similarity.js` — exports `scoreBookPair(profileA, profileB, overlap)`
- `src/worker/lib/candidates.js` — exports `getCandidates(bookId, db)`
- `src/worker/lib/recompute.js` — exports `recomputeBook(bookId, db)`

**Unit-testable:** `similarity.js` has no D1 dependency; pure functions. Test locally with `node -e`:

```bash
node -e "
const { scoreBookPair } = require('./src/worker/lib/similarity.js');
console.log(scoreBookPair(
  { avg_rating: 4.5, pace_score: 0.8, mood_vector: '{\"dark\":1}', genre_vector: '{\"fantasy\":1}', pub_year: 2007, page_count: 400 },
  { avg_rating: 4.3, pace_score: 0.7, mood_vector: '{\"dark\":0.9,\"epic\":0.5}', genre_vector: '{\"fantasy\":1}', pub_year: 2010, page_count: 383 },
  { jaccard: 0.35, shared_readers: 12 }
));
"
```

---

### Stage 5 — Recompute Endpoint (Days 5–6)

**Worker routes:**
- `POST /dev/recompute-book/:bookId` — sync, returns result JSON
- `POST /dev/recompute-all` — queues all books
- `POST /dev/process-recompute-queue?batch=20` — processes N jobs

**Verify single book:**
```bash
curl -X POST https://your-worker.workers.dev/dev/recompute-book/OL82563W | jq .
# Expect: { bookId, edgesStored: 50, topNeighbors: [...], duration_ms: ... }
```

**Verify queue:**
```bash
curl -X POST https://your-worker.workers.dev/dev/recompute-all
# Then check status
curl https://your-worker.workers.dev/dev/queue-status
# Expect: { pending: 1200, running: 0, done: 0, failed: 0 }

# Process in batches
for i in $(seq 1 60); do
  curl -X POST "https://your-worker.workers.dev/dev/process-recompute-queue?batch=20"
done
```

**Verify edges stored:**
```bash
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT COUNT(*) FROM book_similarity_edges;"
# Expect: ~60,000 (1200 books × 50 edges each)
npx wrangler d1 execute bookgraph-db --remote \
  --command="SELECT * FROM book_similarity_edges WHERE src_book_id='OL82563W' ORDER BY rank LIMIT 5;"
```

---

### Stage 6 — Graph API Endpoints (Days 6–7)

**Files:**
- `src/worker/handlers/books/graph.js`
- `src/worker/handlers/books/similar.js`
- `src/worker/handlers/feed/graph.js`

**Verify graph endpoint:**
```bash
curl https://your-worker.workers.dev/books/OL82563W/graph?depth=1&maxEdges=8 | jq .
# Expect: { center: {...}, nodes: [8 items], edges: [8 items] }
```

---

## 9. Deliverables Summary

### SQL Migration (Full)

```sql
-- 0002_graph_tables.sql

CREATE TABLE book_feature_profiles (
  book_id           TEXT PRIMARY KEY REFERENCES books(id),
  avg_rating        REAL DEFAULT 0,
  rating_count      INTEGER DEFAULT 0,
  pace_score        REAL DEFAULT 0.5,
  plot_score        REAL DEFAULT 0.5,
  prose_score       REAL DEFAULT 0.5,
  mood_vector       TEXT DEFAULT '{}',
  genre_vector      TEXT DEFAULT '{}',
  pub_year          INTEGER,
  page_count        INTEGER,
  primary_author_id TEXT REFERENCES authors(id),
  model_version     INTEGER DEFAULT 1,
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE book_reader_stats (
  book_id       TEXT PRIMARY KEY REFERENCES books(id),
  reader_count  INTEGER DEFAULT 0,
  shelf_count   INTEGER DEFAULT 0,
  review_count  INTEGER DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE book_pair_reader_overlap (
  book_a          TEXT NOT NULL,
  book_b          TEXT NOT NULL,
  shared_readers  INTEGER DEFAULT 0,
  union_readers   INTEGER DEFAULT 0,
  jaccard         REAL GENERATED ALWAYS AS
                    (CAST(shared_readers AS REAL) / MAX(union_readers, 1)) STORED,
  updated_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (book_a, book_b),
  FOREIGN KEY (book_a) REFERENCES books(id),
  FOREIGN KEY (book_b) REFERENCES books(id),
  CHECK (book_a < book_b)
);

CREATE TABLE book_similarity_edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  src_book_id   TEXT NOT NULL REFERENCES books(id),
  dst_book_id   TEXT NOT NULL REFERENCES books(id),
  score         REAL NOT NULL,
  rank          INTEGER NOT NULL,
  reasons       TEXT DEFAULT '[]',
  reason_detail TEXT DEFAULT '{}',
  model_version INTEGER DEFAULT 1,
  computed_at   TEXT DEFAULT (datetime('now')),
  UNIQUE (src_book_id, dst_book_id)
);

CREATE TABLE graph_recompute_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     TEXT NOT NULL REFERENCES books(id),
  reason      TEXT NOT NULL,
  priority    INTEGER DEFAULT 5,
  status      TEXT DEFAULT 'pending'
              CHECK(status IN ('pending','running','done','failed')),
  attempts    INTEGER DEFAULT 0,
  error       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_bfp_year     ON book_feature_profiles(pub_year);
CREATE INDEX idx_bfp_author   ON book_feature_profiles(primary_author_id);
CREATE INDEX idx_overlap_a    ON book_pair_reader_overlap(book_a, jaccard DESC);
CREATE INDEX idx_overlap_b    ON book_pair_reader_overlap(book_b, jaccard DESC);
CREATE INDEX idx_edges_src    ON book_similarity_edges(src_book_id, rank);
CREATE INDEX idx_edges_dst    ON book_similarity_edges(dst_book_id, score DESC);
CREATE INDEX idx_queue_pending ON graph_recompute_queue(status, priority, created_at)
  WHERE status = 'pending';
```

### Recompute Algorithm Pseudocode

```
recomputeBook(bookId, db):
  profileA = fetchFeatureProfile(bookId, db)
  if not profileA: return error

  candidateIds = Set()
  candidateIds.addAll( sameAuthorBooks(bookId, db) )
  candidateIds.addAll( sharedReaderBooks(bookId, db) )    -- from book_pair_reader_overlap
  candidateIds.addAll( nearbyYearBooks(bookId, db, ±10) )
  candidateIds.addAll( explicitRelatedBooks(bookId, db) )
  candidateIds.delete(bookId)  -- never self-edge

  scored = []
  for each candidateId in candidateIds:
    profileB = fetchFeatureProfile(candidateId, db)
    if not profileB: skip
    overlap = fetchOverlap(bookId, candidateId, db)  -- may be null

    breakdown = {
      readerSim:   smoothedJaccard(overlap),
      contentSim:  contentSimilarity(profileA, profileB),
      reviewSim:   reviewSimilarity(profileA, profileB)
    }
    score = 0.40 * breakdown.readerSim
          + 0.35 * breakdown.contentSim
          + 0.25 * breakdown.reviewSim

    reasons = computeReasons(breakdown, profileA, profileB)
    scored.push({ bookId: candidateId, score, reasons, breakdown })

  topK = scored.sortDesc(score).slice(0, 50)
  storeEdges(bookId, topK, db)
  return { stored: topK.length }
```

---

## 10. Deferred Features

These are explicitly out of scope for the MVP and should not block it:

| Feature | Why Deferred |
|---------|--------------|
| Cloudflare Queues integration | `graph_recompute_queue` table is a drop-in replacement; migrate when you have real traffic |
| Embedding-based content similarity (OpenAI / Cohere) | Expensive and adds an external dependency; genre+mood vectors are a solid MVP substitute |
| Real-time graph updates via WebSockets | Feed can poll; no need for push at MVP scale |
| Graph pruning / decay for stale books | Not needed until you have 100K+ books |
| Per-user personalized edge weights | Global weights work fine for MVP |
| Full-text search on book descriptions | Separate feature from graph |
| Graph visualization in frontend | This entire document is backend only |
| A/B testing of similarity weights | Add after you have real engagement signals |
| Batch D1 write optimization (D1 batch API) | Optimize if inserts become slow at scale |
| Separate read replica for graph queries | D1 handles this at MVP scale |
| Trust/reputation weighting of reviews | Add after you have real reviewer history |
