import { kv } from "@vercel/kv";
import type { ReportResult } from "./gorgias-report";

export type JobStatus = "running" | "done" | "error";

export type Job = {
  status: JobStatus;
  ownerEmail: string;
  from_date: string;
  to_date: string;
  pagesFetched: number;
  ticketsChecked: number;
  result?: ReportResult;
  error?: string;
  createdAt: number;
};

const JOB_TTL_SECONDS = 30 * 60;

function jobKey(id: string) {
  return `prowldesk:job:${id}`;
}

export async function createJob(id: string, ownerEmail: string, fromDate: string, toDate: string) {
  const job: Job = {
    status: "running",
    ownerEmail,
    from_date: fromDate,
    to_date: toDate,
    pagesFetched: 0,
    ticketsChecked: 0,
    createdAt: Date.now(),
  };
  await kv.set(jobKey(id), job, { ex: JOB_TTL_SECONDS });
}

export async function updateJobProgress(id: string, pagesFetched: number, ticketsChecked: number) {
  const job = await kv.get<Job>(jobKey(id));
  if (!job) return;
  job.pagesFetched = pagesFetched;
  job.ticketsChecked = ticketsChecked;
  await kv.set(jobKey(id), job, { ex: JOB_TTL_SECONDS });
}

export async function completeJob(id: string, result: ReportResult) {
  const job = await kv.get<Job>(jobKey(id));
  if (!job) return;
  job.status = "done";
  job.result = result;
  await kv.set(jobKey(id), job, { ex: JOB_TTL_SECONDS });
}

export async function failJob(id: string, error: string) {
  const job = await kv.get<Job>(jobKey(id));
  if (!job) return;
  job.status = "error";
  job.error = error;
  await kv.set(jobKey(id), job, { ex: JOB_TTL_SECONDS });
}

export async function getJob(id: string): Promise<Job | null> {
  return (await kv.get<Job>(jobKey(id))) ?? null;
}
