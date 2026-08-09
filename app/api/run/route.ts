import { NextRequest, NextResponse } from "next/server";

const RUNTIME_URI = process.env.CODEWORDS_RUNTIME_URI || "https://runtime.codewords.ai";
const API_KEY = process.env.CODEWORDS_API_KEY || "";
const WORKFLOW_ID = "gorgias_lost_in_transit_counter_1a14803a";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${RUNTIME_URI}/run/${WORKFLOW_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const err = await res.text(); return NextResponse.json({ error: err }, { status: res.status }); }
    return NextResponse.json(await res.json());
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
