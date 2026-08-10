import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchOnePage } from "@/lib/gorgias-report";

export const maxDuration = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;

// Generous limit: a single report can legitimately need hundreds of page
// fetches for a wide date range, since each request only pulls one page.
const RATE_LIMIT = 300;
const RATE_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return timestamps.length > RATE_LIMIT;
}

function validateBody(input: unknown): { from_date: string; to_date: string; cursor: string | null } | null {
  if (typeof input !== "object" || input === null) return null;
  const { from_date, to_date, cursor } = input as Record<string, unknown>;

  if (typeof from_date !== "string" || !DATE_RE.test(from_date) || Number.isNaN(Date.parse(from_date))) return null;
  if (typeof to_date !== "string" || !DATE_RE.test(to_date) || Number.isNaN(Date.parse(to_date))) return null;
  if (to_date < from_date) return null;

  const spanDays = (Date.parse(to_date) - Date.parse(from_date)) / 86_400_000 + 1;
  if (spanDays > MAX_DAYS) return null;

  if (cursor !== undefined && cursor !== null && typeof cursor !== "string") return null;

  return { from_date, to_date, cursor: (cursor as string | null | undefined) ?? null };
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
  if (!body) return NextResponse.json({ error: "Invalid request: expected {from_date, to_date, cursor}, spanning at most 90 days" }, { status: 400 });

  try {
    const page = await fetchOnePage(body.from_date, body.to_date, body.cursor);
    return NextResponse.json({
      checked: page.checked,
      tickets: page.tickets,
      daily_counts: page.dailyCounts,
      next_cursor: page.nextCursor,
      done: page.done,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
