-- Seed books
INSERT OR IGNORE INTO books (id, title, description, published_date, publisher, language) VALUES
  ('00000000-0000-0000-0000-000000000001', 'The Great Gatsby',       'A portrait of the Jazz Age in all of its decadence and excess.', '1925', 'Scribner', 'en'),
  ('00000000-0000-0000-0000-000000000002', 'To Kill a Mockingbird',  'A story of racial injustice and the loss of innocence in the American South.', '1960', 'J.B. Lippincott & Co.', 'en'),
  ('00000000-0000-0000-0000-000000000003', '1984',                   'A dystopian novel about totalitarianism, surveillance, and the destruction of truth.', '1949', 'Secker & Warburg', 'en'),
  ('00000000-0000-0000-0000-000000000004', 'Pride and Prejudice',    'A romantic novel of manners exploring social class and marriage in Georgian England.', '1813', 'T. Egerton', 'en'),
  ('00000000-0000-0000-0000-000000000005', 'The Catcher in the Rye', 'A teenage boy navigates alienation and identity in mid-century New York.', '1951', 'Little, Brown and Company', 'en'),
  ('00000000-0000-0000-0000-000000000006', 'Brave New World',        'A dystopian society controlled through pleasure, conditioning, and consumption.', '1932', 'Chatto & Windus', 'en'),
  ('00000000-0000-0000-0000-000000000007', 'The Hobbit',             'A hobbit embarks on an unexpected journey with dwarves and a wizard.', '1937', 'George Allen & Unwin', 'en'),
  ('00000000-0000-0000-0000-000000000008', 'Harry Potter and the Sorcerer''s Stone', 'A young boy discovers he is a wizard and enters a magical school.', '1997', 'Bloomsbury', 'en'),
  ('00000000-0000-0000-0000-000000000009', 'The Lord of the Rings',  'An epic quest to destroy a powerful ring and save Middle-earth from darkness.', '1954', 'George Allen & Unwin', 'en'),
  ('00000000-0000-0000-0000-00000000000a', 'Dune',                   'A sweeping science-fiction epic of politics, ecology, and prophecy on a desert planet.', '1965', 'Chilton Books', 'en'),
  ('00000000-0000-0000-0000-00000000000b', 'Fahrenheit 451',         'In a future where books are banned, a fireman begins to question his role.', '1953', 'Ballantine Books', 'en'),
  ('00000000-0000-0000-0000-00000000000c', 'Animal Farm',            'A satirical allegory in which farm animals overthrow their human oppressors.', '1945', 'Secker & Warburg', 'en');

-- Seed edges (book_a_id < book_b_id always, per canonical ordering constraint)

-- Dystopian cluster
INSERT OR IGNORE INTO book_edges (book_a_id, book_b_id, similarity_score) VALUES
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 0.92), -- 1984 ↔ Brave New World
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 0.88), -- 1984 ↔ Fahrenheit 451
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', 0.85), -- 1984 ↔ Animal Farm
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000b', 0.83), -- Brave New World ↔ Fahrenheit 451
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000c', 0.76), -- Brave New World ↔ Animal Farm
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 0.71); -- Fahrenheit 451 ↔ Animal Farm

-- Fantasy cluster
INSERT OR IGNORE INTO book_edges (book_a_id, book_b_id, similarity_score) VALUES
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000009', 0.95), -- Hobbit ↔ LOTR
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000008', 0.80), -- Hobbit ↔ Harry Potter
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000009', 0.78); -- Harry Potter ↔ LOTR

-- American literature cluster
INSERT OR IGNORE INTO book_edges (book_a_id, book_b_id, similarity_score) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 0.70), -- Gatsby ↔ Catcher
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 0.62), -- Gatsby ↔ Mockingbird
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 0.65); -- Mockingbird ↔ Catcher

-- Cross-genre speculative fiction
INSERT OR IGNORE INTO book_edges (book_a_id, book_b_id, similarity_score) VALUES
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 0.63), -- Brave New World ↔ Dune
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 0.58), -- 1984 ↔ Dune
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', 0.55), -- LOTR ↔ Dune
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 0.48), -- Dune ↔ Fahrenheit 451
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 0.42); -- Harry Potter ↔ Dune

-- Social themes (weaker cross-genre links)
INSERT OR IGNORE INTO book_edges (book_a_id, book_b_id, similarity_score) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 0.44), -- Gatsby ↔ Pride & Prejudice
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 0.52), -- Mockingbird ↔ 1984
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 0.38), -- Mockingbird ↔ Pride & Prejudice
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 0.33); -- Pride & Prejudice ↔ Catcher

-- Distant cross-genre (very low similarity)
INSERT OR IGNORE INTO book_edges (book_a_id, book_b_id, similarity_score) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000007', 0.12), -- Gatsby ↔ Hobbit
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000007', 0.18), -- 1984 ↔ Hobbit
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000009', 0.22); -- Pride & Prejudice ↔ LOTR
