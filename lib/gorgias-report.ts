const GORGIAS_SUBDOMAIN = process.env.NEXT_PUBLIC_GORGIAS_SUBDOMAIN || "";
const GORGIAS_EMAIL = process.env.GORGIAS_EMAIL || "";
const GORGIAS_API_KEY = process.env.GORGIAS_API_KEY || "";
const LOST_IN_TRANSIT_TAG = "Lost in Transit";

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

export type PageResult = {
  checked: number;
  tickets: Array<{ id: number; subject: string; created: string; status: string }>;
  dailyCounts: Record<string, number>;
  nextCursor: string | null;
  done: boolean;
};

function gorgiasAuthHeader(): string {
  return "Basic " + Buffer.from(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`).toString("base64");
}

export async function fetchOnePage(fromDate: string, toDate: string, cursor: string | null): Promise<PageResult> {
  const rangeStart = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const rangeEnd = new Date(`${toDate}T23:59:59.999Z`).getTime();

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

  let checked = 0;
  const dailyCounts: Record<string, number> = {};
  const tickets: PageResult["tickets"] = [];
  let reachedStart = false;

  for (const t of data.data) {
    const created = new Date(t.created_datetime).getTime();
    if (created > rangeEnd) continue;
    if (created < rangeStart) {
      reachedStart = true;
      break;
    }

    checked++;
    if (t.tags.some((tag) => tag.name === LOST_IN_TRANSIT_TAG)) {
      const day = t.created_datetime.slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      tickets.push({ id: t.id, subject: t.subject, created: t.created_datetime, status: t.status });
    }
  }

  const done = reachedStart || !data.meta.next_cursor;
  return { checked, tickets, dailyCounts, nextCursor: done ? null : data.meta.next_cursor, done };
}
