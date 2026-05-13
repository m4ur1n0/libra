
const API_ORIGIN="https://bookapp-api.theomaurino2026.workers.dev"
const APP_ORIGIN="https://domain.com"

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
//   "https://yourdomain.com",
//   "https://www.yourdomain.com"
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true"
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request)
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function notFound(request) {
  return json(request, { error: "Not found" }, 404);
}

function badRequest(request, message) {
  return json(request, { error: message }, 400);
}

function serverError(request, error) {
  console.error(error);
  return json(request, { error: "Internal server error" }, 500);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/health") {
        const dbResult = await env.DB.prepare("SELECT 1 AS ok").first();
        return json(request, {
          ok: true,
          service: "bookapp-api",
          db: dbResult
        });
      }

      if (request.method === "GET" && path === "/books") {
        const q = url.searchParams.get("q")?.trim();

        let result;

        if (q) {
          result = await env.DB.prepare(
            `
            SELECT *
            FROM books
            WHERE title LIKE ?
            ORDER BY title ASC
            LIMIT 50
            `
          )
            .bind(`%${q}%`)
            .all();
        } else {
          result = await env.DB.prepare(
            `
            SELECT *
            FROM books
            ORDER BY created_at DESC
            LIMIT 50
            `
          ).all();
        }

        return json(request, result.results ?? []);
      }

      if (request.method === "POST" && path === "/books") {
        const body = await readJson(request);

        if (!body?.title) {
          return badRequest(request, "Missing title");
        }

        const id = crypto.randomUUID();

        await env.DB.prepare(
          `
          INSERT INTO books (
            id,
            isbn_10,
            isbn_13,
            title,
            subtitle,
            description,
            page_count,
            cover_image_href,
            published_date,
            publisher,
            language
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
          .bind(
            id,
            body.isbn_10 ?? null,
            body.isbn_13 ?? null,
            body.title,
            body.subtitle ?? null,
            body.description ?? null,
            body.page_count ?? null,
            body.cover_image_href ?? null,
            body.published_date ?? null,
            body.publisher ?? null,
            body.language ?? null
          )
          .run();

        const book = await env.DB.prepare(
          `SELECT * FROM books WHERE id = ?`
        )
          .bind(id)
          .first();

        return json(request, book, 201);
      }

      if (request.method === "GET" && path.startsWith("/users/")) {
        const userId = path.split("/")[2];

        const user = await env.DB.prepare(
          `
          SELECT
            id,
            email,
            username,
            first_name,
            last_name,
            bio,
            profile_pic_href,
            created_at,
            updated_at
          FROM users
          WHERE id = ?
          `
        )
          .bind(userId)
          .first();

        if (!user) return json(request, { error: "User not found" }, 404);

        return json(request, user);
      }

      if (request.method === "GET" && path.startsWith("/library/")) {
        const userId = path.split("/")[2];

        const result = await env.DB.prepare(
          `
          SELECT
            le.*,
            b.title,
            b.subtitle,
            b.cover_image_href,
            b.page_count,
            b.isbn_10,
            b.isbn_13
          FROM library_entries le
          JOIN books b ON b.id = le.book_id
          WHERE le.user_id = ?
          ORDER BY le.updated_at DESC
          `
        )
          .bind(userId)
          .all();

        return json(request, result.results ?? []);
      }

      if (request.method === "POST" && path === "/library") {
        const body = await readJson(request);

        if (!body?.user_id) return badRequest(request, "Missing user_id");
        if (!body?.book_id) return badRequest(request, "Missing book_id");

        const id = crypto.randomUUID();

        await env.DB.prepare(
          `
          INSERT INTO library_entries (
            id,
            user_id,
            book_id,
            status,
            pages_progress
          )
          VALUES (?, ?, ?, ?, ?)
          `
        )
          .bind(
            id,
            body.user_id,
            body.book_id,
            body.status ?? "unread",
            body.pages_progress ?? 0
          )
          .run();

        const entry = await env.DB.prepare(
          `SELECT * FROM library_entries WHERE id = ?`
        )
          .bind(id)
          .first();

        return json(request, entry, 201);
      }

      return notFound(request);
    } catch (error) {
      return serverError(request, error);
    }
  }
};