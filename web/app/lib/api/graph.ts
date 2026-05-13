import { apiFetch } from "./client";
import type { BookGraphResponse } from "./types";

export function fetchBookGraph(
  bookId: string,
  limit = 10
): Promise<BookGraphResponse> {
  return apiFetch<BookGraphResponse>(
    `/graph/books/${bookId}?limit=${limit}`
  );
}
