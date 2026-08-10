import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export const maxDuration = 30;

const GORGIAS_SUBDOMAIN = process.env.NEXT_PUBLIC_GORGIAS_SUBDOMAIN || "";
const GORGIAS_EMAIL = process.env.GORGIAS_EMAIL || "";
const GORGIAS_API_KEY = process.env.GORGIAS_API_KEY || "";
const LOST_IN_TRANSIT_TAG = "Lost in Transit";
const MAX_PAGES = 200;

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

type GorgiasTag = { id: number; name: string };
type GorgiasTicket = {
  id: number;
  subject: string;
  status: string;
  created_datetime: string;
  tags: GorgiasTag[];
};
type GorgiasTicketsPage = {
  data: GorgiasTicket[];
  meta: { next_cursor: string | null };
};

function gorgiasAuthHeader(): string {
  return "Basic " + Buffer.from(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`).toString("base64");
}

async function fetchTicketsInRange(fromDate: string, toDate: string) {
  const rangeStart = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const rangeEnd = new Date(`${toDate}T23:59:59.999Z`).getTime();

  let cursor: string | null = null;
  let totalChecked = 0;
  let totalLostInTransit = 0;
  const dailyCounts: Record<string, number> = {};
  const tickets: Array<{ id: number; subject: string; created: string; status: string }> = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://${GORGIAS_SUBDOMAIN}.gorgias.com/api/tickets`);
    url.searchParams.set("order_by", "created_datetime:desc");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: gorgiasAuthHeader() } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gorgias API error (${res.status}): ${text}`);
    }
    const data = (await res.json()) as GorgiasTicketsPage;

    let reachedStart = false;
    for (const t of data.data) {
      const created = new Date(t.created_datetime).getTime();
      if (created > rangeEnd) continue;
      if (created < rangeStart) {
        reachedStart = true;
        break;
      }

      totalChecked++;
      const isLostInTransit = t.tags.some((tag) => tag.name === LOST_IN_TRANSIT_TAG);
      if (isLostInTransit) {
        totalLostInTransit++;
        const day = t.created_datetime.slice(0, 10);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        tickets.push({ id: t.id, subject: t.subject, created: t.created_datetime, status: t.status });
      }
    }

    if (reachedStart || !data.meta.next_cursor) break;
    cursor = data.meta.next_cursor;
  }

  return {
    from_date: fromDate,
    to_date: toDate,
    total_checked: totalChecked,
    total_lost_in_transit: totalLostInTransit,
    daily_counts: dailyCounts,
    tickets,
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
  if (!body) return NextResponse.json({ error: "Invalid request: expected {from_date, to_date?} or {days: 1-90}" }, { status: 400 });

  try {
    const result = await fetchTicketsInRange(body.from_date, body.to_date);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
