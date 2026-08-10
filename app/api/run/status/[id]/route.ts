import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJob } from "@/lib/jobs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const job = await getJob(id);
  if (!job || job.ownerEmail !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (job.status === "running") {
    return NextResponse.json({ status: "running", pagesFetched: job.pagesFetched, ticketsChecked: job.ticketsChecked });
  }
  if (job.status === "error") {
    return NextResponse.json({ status: "error", error: job.error });
  }
  return NextResponse.json({ status: "done", result: job.result });
}
