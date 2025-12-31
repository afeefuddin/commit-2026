import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type Bindings = {
  DB: D1Database;
};

type CommitRow = {
  commit_hash: string;
  author_name: string;
  author_email: string;
  message: string;
  created_at: number;
};

type CommitPayload = {
  author_name: string;
  author_email: string;
  message: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("first-commit-2026 worker is running");
});

app.post("/commit", async (c) => {
  const headerError = requireCliHeader(c);
  if (headerError) {
    return headerError;
  }

  const payload = await parseJson(c);
  if (!payload) {
    return jsonError(c, 400, "Invalid JSON body");
  }

  const commit = parseCommitPayload(payload);
  if (!commit) {
    return jsonError(
      c,
      400,
      "author_name, author_email, and message are required non-empty strings"
    );
  }

  const createdAt = Date.now();
  const commitHash = await generateCommitHash({
    authorName: commit.author_name,
    authorEmail: commit.author_email,
    message: commit.message,
    createdAt,
  });

  await c.env.DB.prepare(
    `INSERT INTO commits (commit_hash, author_name, author_email, message, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      commitHash,
      commit.author_name,
      commit.author_email,
      commit.message,
      createdAt
    )
    .run();

  return c.json(
    {
      ok: true,
      commit: formatCommit({
        commit_hash: commitHash,
        author_name: commit.author_name,
        author_email: commit.author_email,
        message: commit.message,
        created_at: createdAt,
      }),
    },
    201
  );
});

app.get("/logs", async (c) => {
  const headerError = requireCliHeader(c);
  if (headerError) {
    return headerError;
  }

  const limit = parseLimitParam(c.req.query("n"));
  if (!limit) {
    return jsonError(c, 400, "Query param n must be a positive integer");
  }

  const author = parseAuthorParam(c.req.query("author"));
  const result = author
    ? await c.env.DB.prepare(
        `SELECT commit_hash, author_name, author_email, message, created_at
         FROM commits
         WHERE author_name = ? OR author_email = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
        .bind(author, author, limit)
        .all<CommitRow>()
    : await c.env.DB.prepare(
        `SELECT commit_hash, author_name, author_email, message, created_at
         FROM commits
         ORDER BY created_at DESC
         LIMIT ?`
      )
        .bind(limit)
        .all<CommitRow>();

  const logs = result.results.map(formatCommit);

  return c.json({ count: logs.length, logs });
});

function jsonError(c: Context, status: ContentfulStatusCode, message: string) {
  return c.json({ error: message }, status);
}

async function parseJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function parseCommitPayload(
  payload: Record<string, unknown>
): CommitPayload | null {
  const authorName =
    typeof payload.author_name === "string" ? payload.author_name.trim() : "";
  const authorEmail =
    typeof payload.author_email === "string" ? payload.author_email.trim() : "";
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";

  if (!authorName || !authorEmail || !message) {
    return null;
  }

  return {
    author_name: authorName,
    author_email: authorEmail,
    message,
  };
}

function parseLimitParam(value: string | undefined): number | null {
  const parsed = value ? Number.parseInt(value, 10) : 10;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, 100);
}

function parseAuthorParam(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCommit(row: CommitRow) {
  return {
    hash: row.commit_hash,
    author_name: row.author_name,
    author_email: row.author_email,
    message: row.message,
    created_at: row.created_at,
    created_at_iso: new Date(row.created_at).toISOString(),
  };
}

function requireCliHeader(c: Context) {
  const header = c.req.header("x-first-commit-cli");
  if (!header) {
    return jsonError(c, 400, "Missing X-First-Commit-CLI header");
  }
  return null;
}

async function generateCommitHash(input: {
  authorName: string;
  authorEmail: string;
  message: string;
  createdAt: number;
}): Promise<string> {
  const data = [
    input.authorName,
    input.authorEmail,
    input.message,
    String(input.createdAt),
  ].join("\n");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default app;
