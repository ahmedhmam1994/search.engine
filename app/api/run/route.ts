import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/auth";
import { fetchOnePage, LOST_IN_TRANSIT_TAG } from "@/lib/gorgias-report";

export const maxDuration = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;
const MAX_TAG_LENGTH = 100;
const MAX_TAGS = 10;

// Generous limit: a single report can legitimately need hundreds of page
// fetches for a wide date range, since each request only pulls one page.
const RATE_LIMIT = 300;
const RATE_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();
const MAX_TRACKED_USERS = 1000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);

  if (requestLog.size > MAX_TRACKED_USERS) {
    for (const [k, ts] of requestLog) {
      if (ts.every((t) => now - t >= RATE_WINDOW_MS)) requestLog.delete(k);
    }
  }

  return timestamps.length > RATE_LIMIT;
}

function validateBody(input: unknown): { from_date: string; to_date: string; cursor: string | null; tags: string[] } | null {
  if (typeof input !== "object" || input === null) return null;
  const { from_date, to_date, cursor, tags } = input as Record<string, unknown>;

  if (typeof from_date !== "string" || !DATE_RE.test(from_date) || Number.isNaN(Date.parse(from_date))) return null;
  if (typeof to_date !== "string" || !DATE_RE.test(to_date) || Number.isNaN(Date.parse(to_date))) return null;
  if (to_date < from_date) return null;

  const spanDays = (Date.parse(to_date) - Date.parse(from_date)) / 86_400_000 + 1;
  if (spanDays > MAX_DAYS) return null;

  if (cursor !== undefined && cursor !== null && typeof cursor !== "string") return null;

  let cleanTags: string[] = [LOST_IN_TRANSIT_TAG];
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_TAGS) return null;
    if (!tags.every((t) => typeof t === "string" && t.trim().length > 0 && t.length <= MAX_TAG_LENGTH)) return null;
    cleanTags = tags.map((t) => (t as string).trim());
  }

  return {
    from_date,
    to_date,
    cursor: (cursor as string | null | undefined) ?? null,
    tags: cleanTags,
  };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isRateLimited(session.user.email)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const body = validateBody(raw);
  if (!body) return NextResponse.json({ error: "Invalid request: expected {from_date, to_date, cursor, tags?}, spanning at most 90 days" }, { status: 400 });

  try {
    const page = await fetchOnePage(body.from_date, body.to_date, body.cursor, body.tags);
    return NextResponse.json({
      checked: page.checked,
      tickets: page.tickets,
      daily_counts: page.dailyCounts,
      next_cursor: page.nextCursor,
      done: page.done,
    });
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
