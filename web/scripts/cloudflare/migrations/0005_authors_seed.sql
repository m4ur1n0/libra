-- Authors
INSERT OR IGNORE INTO authors (id, name) VALUES
  ('auth-01', 'F. Scott Fitzgerald'),
  ('auth-02', 'Harper Lee'),
  ('auth-03', 'George Orwell'),
  ('auth-04', 'Jane Austen'),
  ('auth-05', 'J.D. Salinger'),
  ('auth-06', 'Aldous Huxley'),
  ('auth-07', 'J.R.R. Tolkien'),
  ('auth-08', 'J.K. Rowling'),
  ('auth-09', 'Frank Herbert'),
  ('auth-10', 'Ray Bradbury');

-- Book → author links
INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'auth-01'),
  ('00000000-0000-0000-0000-000000000002', 'auth-02'),
  ('00000000-0000-0000-0000-000000000003', 'auth-03'),
  ('00000000-0000-0000-0000-000000000004', 'auth-04'),
  ('00000000-0000-0000-0000-000000000005', 'auth-05'),
  ('00000000-0000-0000-0000-000000000006', 'auth-06'),
  ('00000000-0000-0000-0000-000000000007', 'auth-07'),
  ('00000000-0000-0000-0000-000000000008', 'auth-08'),
  ('00000000-0000-0000-0000-000000000009', 'auth-07'), -- LOTR also Tolkien
  ('00000000-0000-0000-0000-00000000000a', 'auth-09'),
  ('00000000-0000-0000-0000-00000000000b', 'auth-10'),
  ('00000000-0000-0000-0000-00000000000c', 'auth-03'); -- Animal Farm also Orwell

-- Page counts
UPDATE books SET page_count = 180  WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE books SET page_count = 281  WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE books SET page_count = 328  WHERE id = '00000000-0000-0000-0000-000000000003';
UPDATE books SET page_count = 432  WHERE id = '00000000-0000-0000-0000-000000000004';
UPDATE books SET page_count = 277  WHERE id = '00000000-0000-0000-0000-000000000005';
UPDATE books SET page_count = 311  WHERE id = '00000000-0000-0000-0000-000000000006';
UPDATE books SET page_count = 310  WHERE id = '00000000-0000-0000-0000-000000000007';
UPDATE books SET page_count = 309  WHERE id = '00000000-0000-0000-0000-000000000008';
UPDATE books SET page_count = 1178 WHERE id = '00000000-0000-0000-0000-000000000009';
UPDATE books SET page_count = 412  WHERE id = '00000000-0000-0000-0000-00000000000a';
UPDATE books SET page_count = 256  WHERE id = '00000000-0000-0000-0000-00000000000b';
UPDATE books SET page_count = 112  WHERE id = '00000000-0000-0000-0000-00000000000c';
