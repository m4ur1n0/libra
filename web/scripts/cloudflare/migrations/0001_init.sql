PRAGMA foreign_keys = ON;

-- USERS

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,

  -- Google OAuth stable user id, usually "sub"
  google_sub TEXT NOT NULL UNIQUE,

  bio TEXT,
  profile_pic_href TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_google_sub ON users(google_sub);


-- AUTH

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Store only hashed tokens, never raw login/refresh tokens.
  session_token_hash TEXT NOT NULL UNIQUE,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,

  user_agent TEXT,
  ip_hash TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);


-- SOCIAL GRAPH

CREATE TABLE follows (
  follower_user_id TEXT NOT NULL,
  followed_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (follower_user_id, followed_user_id),

  FOREIGN KEY (follower_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followed_user_id) REFERENCES users(id) ON DELETE CASCADE,

  CHECK (follower_user_id <> followed_user_id)
);

CREATE INDEX idx_follows_followed_user_id ON follows(followed_user_id);


-- BOOKS

CREATE TABLE books (
  id TEXT PRIMARY KEY,

  isbn_10 TEXT UNIQUE,
  isbn_13 TEXT UNIQUE,

  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,

  page_count INTEGER,
  cover_image_href TEXT,
  published_date TEXT,
  publisher TEXT,
  language TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_isbn_10 ON books(isbn_10);
CREATE INDEX idx_books_isbn_13 ON books(isbn_13);


CREATE TABLE authors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE book_authors (
  book_id TEXT NOT NULL,
  author_id TEXT NOT NULL,

  PRIMARY KEY (book_id, author_id),

  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);


CREATE TABLE genres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE book_genres (
  book_id TEXT NOT NULL,
  genre_id TEXT NOT NULL,

  PRIMARY KEY (book_id, genre_id),

  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);


-- USER LIBRARY ENTRIES

CREATE TABLE library_entries (
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'reading', 'read', 'dnf')),

  pages_progress INTEGER NOT NULL DEFAULT 0,
  current_page_updated_at TEXT,

  started_reading_at TEXT,
  finished_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, book_id),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,

  CHECK (pages_progress >= 0)
);

CREATE INDEX idx_library_entries_user_id ON library_entries(user_id);
CREATE INDEX idx_library_entries_book_id ON library_entries(book_id);
CREATE INDEX idx_library_entries_status ON library_entries(status);


-- REVIEWS

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,

  library_entry_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,

  -- 0-10 lets you support half-stars cleanly.
  stars INTEGER CHECK (stars BETWEEN 0 AND 10),

  subject TEXT,
  comments TEXT CHECK (length(comments) <= 500),

  pace TEXT CHECK (pace IN ('slow', 'medium', 'fast')),
  plot_or_character_focused TEXT
    CHECK (plot_or_character_focused IN ('plot', 'character', 'balanced')),

  where_found TEXT,

  -- Could also be 0-10 later, but boolean is fine for MVP.
  recommend INTEGER NOT NULL DEFAULT 0 CHECK (recommend IN (0, 1)),

  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'followers', 'private')),

  contains_spoilers INTEGER NOT NULL DEFAULT 0 CHECK (contains_spoilers IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_entry_id) REFERENCES library_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_book_id ON reviews(book_id);
CREATE INDEX idx_reviews_stars ON reviews(stars);


-- REVIEW MOODS

CREATE TABLE moods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE review_moods (
  review_id TEXT NOT NULL,
  mood_id TEXT NOT NULL,

  PRIMARY KEY (review_id, mood_id),

  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (mood_id) REFERENCES moods(id) ON DELETE CASCADE
);


-- RELATED BOOKS FROM REVIEW

CREATE TABLE review_related_books (
  review_id TEXT NOT NULL,
  related_book_id TEXT NOT NULL,

  PRIMARY KEY (review_id, related_book_id),

  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (related_book_id) REFERENCES books(id) ON DELETE CASCADE
);


-- OPTIONAL MVP SEED DATA

INSERT INTO moods (id, name) VALUES
  ('moody', 'Moody'),
  ('funny', 'Funny'),
  ('dark', 'Dark'),
  ('hopeful', 'Hopeful'),
  ('emotional', 'Emotional'),
  ('tense', 'Tense'),
  ('cozy', 'Cozy'),
  ('adventurous', 'Adventurous');