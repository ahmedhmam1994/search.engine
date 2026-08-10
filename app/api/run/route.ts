import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { fetchTicketsInRange } from "@/lib/gorgias-report";
import { createJob, updateJobProgress, completeJob, failJob } from "@/lib/jobs";

export const maxDuration = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;

const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // per minute
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return timestamps.length > RATE_LIMIT;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function validateBody(input: unknown): { from_date: string; to_date: string } | null {
  if (typeof input !== "object" || input === null) return null;
  const { from_date, to_date, days } = input as Record<string, unknown>;

  if (from_date !== undefined) {
    if (typeof from_date !== "string" || !DATE_RE.test(from_date) || Number.isNaN(Date.parse(from_date))) return null;
    if (to_date !== undefined) {
      if (typeof to_date !== "string" || !DATE_RE.test(to_date) || Number.isNaN(Date.parse(to_date))) return null;
      if (to_date < from_date) return null;
      const spanDays = (Date.parse(to_date) - Date.parse(from_date)) / 86_400_000 + 1;
      if (spanDays > MAX_DAYS) return null;
      return { from_date, to_date };
    }
    return { from_date, to_date: toDateStr(new Date()) };
  }

  if (days !== undefined) {
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_DAYS) return null;
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return { from_date: toDateStr(start), to_date: toDateStr(now) };
  }

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 6);
  return { from_date: toDateStr(start), to_date: toDateStr(now) };
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
  if (!body) return NextResponse.json({ error: "Invalid request: expected {from_date, to_date?} or {days: 1-90}, spanning at most 90 days" }, { status: 400 });

  const jobId = randomUUID();
  const ownerEmail = session.user.email;
  await createJob(jobId, ownerEmail, body.from_date, body.to_date);

  after(async () => {
    try {
      const result = await fetchTicketsInRange(body.from_date, body.to_date, (pages, checked) =>
        updateJobProgress(jobId, pages, checked)
      );
      await completeJob(jobId, result);
    } catch (e) {
      await failJob(jobId, e instanceof Error ? e.message : "Failed");
    }
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
