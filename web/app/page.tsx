import { BookGraph } from "./components/BookGraph";

// Seed book ID: "1984" — change this to any book ID from the seed data
const INITIAL_BOOK_ID = "00000000-0000-0000-0000-000000000003";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-sans">
      <header className="px-6 py-4 border-b border-zinc-200 bg-white">
        <h1 className="text-lg font-semibold text-zinc-900">LIBRA</h1>
      </header>
      <main className="flex-1">
        <BookGraph initialBookId={INITIAL_BOOK_ID} />
      </main>
    </div>
  );
}
