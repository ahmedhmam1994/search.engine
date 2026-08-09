import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const RUNTIME_URI = process.env.CODEWORDS_RUNTIME_URI || "https://runtime.codewords.ai";
const API_KEY = process.env.CODEWORDS_API_KEY || "";
const ACCESS_KEY = process.env.APP_ACCESS_KEY || "";
const WORKFLOW_ID = "gorgias_lost_in_transit_counter_1a14803a";

function isAuthorized(request: NextRequest): boolean {
  if (!ACCESS_KEY) return false;
  const provided = request.headers.get("x-app-key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ACCESS_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;

function validateBody(input: unknown): { from_date?: string; to_date?: string; days?: number } | null {
  if (typeof input !== "object" || input === null) return null;
  const { from_date, to_date, days } = input as Record<string, unknown>;

  if (from_date !== undefined) {
    if (typeof from_date !== "string" || !DATE_RE.test(from_date) || Number.isNaN(Date.parse(from_date))) return null;
    if (to_date !== undefined) {
      if (typeof to_date !== "string" || !DATE_RE.test(to_date) || Number.isNaN(Date.parse(to_date))) return null;
      if (to_date < from_date) return null;
    }
    return to_date !== undefined ? { from_date, to_date } : { from_date };
  }

  if (days !== undefined) {
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_DAYS) return null;
    return { days };
  }

  return { days: 7 };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const body = validateBody(raw);
  if (!body) return NextResponse.json({ error: "Invalid request: expected {from_date, to_date?} or {days: 1-90}" }, { status: 400 });

  try {
    const res = await fetch(`${RUNTIME_URI}/run/${WORKFLOW_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const err = await res.text(); return NextResponse.json({ error: err }, { status: res.status }); }
    return NextResponse.json(await res.json());
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
