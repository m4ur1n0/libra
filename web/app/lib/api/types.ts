export type User = {
  id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  google_sub: string;
  bio: string | null;
  profile_pic_href: string | null;
  created_at: string;
  updated_at: string;
};

export type Book = {
  id: string;
  isbn_10: string | null;
  isbn_13: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  page_count: number | null;
  cover_image_href: string | null;
  published_date: string | null;
  publisher: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
};

export type ReadingStatus = "unread" | "reading" | "read" | "dnf";

export type LibraryEntry = {
  id: string;
  user_id: string;
  book_id: string;
  status: ReadingStatus;
  pages_progress: number;
  current_page_updated_at: string | null;
  started_reading_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Review = {
  id: string;
  library_entry_id: string;
  user_id: string;
  book_id: string;
  stars: number | null; // 0-10
  subject: string | null;
  comments: string | null;
  pace: "slow" | "medium" | "fast" | null;
  plot_or_character_focused: "plot" | "character" | "balanced" | null;
  where_found: string | null;
  recommend: 0 | 1;
  visibility: "public" | "followers" | "private";
  contains_spoilers: 0 | 1;
  created_at: string;
  updated_at: string;
};