import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

process.env.NEXT_PUBLIC_GORGIAS_SUBDOMAIN = "test-shop";
process.env.GORGIAS_EMAIL = "bot@example.com";
process.env.GORGIAS_API_KEY = "test-key";

let fetchOnePage: typeof import("./gorgias-report").fetchOnePage;

beforeAll(async () => {
  ({ fetchOnePage } = await import("./gorgias-report"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ticket(id: number, createdDatetime: string, tags: string[] = []) {
  return {
    id,
    subject: `Ticket ${id}`,
    status: "open",
    created_datetime: createdDatetime,
    tags: tags.map((name, i) => ({ id: i, name })),
  };
}

function mockFetch(response: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("fetchOnePage", () => {
  it("keeps only tickets tagged Lost in Transit within the date range", async () => {
    mockFetch({
      data: [
        ticket(3, "2024-05-15T10:00:00.000Z", ["Lost in Transit"]),
        ticket(2, "2024-05-14T10:00:00.000Z", ["Refund"]),
        ticket(1, "2024-05-13T10:00:00.000Z", ["Lost in Transit", "VIP"]),
      ],
      meta: { next_cursor: null },
    });

    const result = await fetchOnePage("2024-05-01", "2024-05-31", null);

    expect(result.checked).toBe(3);
    expect(result.tickets.map((t) => t.id)).toEqual([3, 1]);
    expect(result.dailyCounts).toEqual({ "2024-05-15": 1, "2024-05-13": 1 });
    expect(result.done).toBe(true);
    expect(result.nextCursor).toBeNull();
  });

  it("stops and marks done once a ticket predates the range, ignoring the API cursor", async () => {
    mockFetch({
      data: [
        ticket(2, "2024-05-10T00:00:00.000Z", ["Lost in Transit"]),
        ticket(1, "2024-04-30T23:59:59.000Z", ["Lost in Transit"]),
      ],
      meta: { next_cursor: "some-cursor" },
    });

    const result = await fetchOnePage("2024-05-01", "2024-05-31", null);

    expect(result.checked).toBe(1);
    expect(result.tickets.map((t) => t.id)).toEqual([2]);
    expect(result.done).toBe(true);
    expect(result.nextCursor).toBeNull();
  });

  it("continues pagination when the page ends inside the range and a cursor remains", async () => {
    mockFetch({
      data: [ticket(1, "2024-05-20T00:00:00.000Z", ["Lost in Transit"])],
      meta: { next_cursor: "next-page-cursor" },
    });

    const result = await fetchOnePage("2024-05-01", "2024-05-31", null);

    expect(result.done).toBe(false);
    expect(result.nextCursor).toBe("next-page-cursor");
  });

  it("skips tickets newer than the range without counting them as checked", async () => {
    mockFetch({
      data: [
        ticket(2, "2024-06-01T00:00:00.000Z", ["Lost in Transit"]),
        ticket(1, "2024-05-15T00:00:00.000Z", ["Lost in Transit"]),
      ],
      meta: { next_cursor: null },
    });

    const result = await fetchOnePage("2024-05-01", "2024-05-31", null);

    expect(result.checked).toBe(1);
    expect(result.tickets.map((t) => t.id)).toEqual([1]);
  });

  it("matches against a custom tag when one is passed", async () => {
    mockFetch({
      data: [
        ticket(2, "2024-05-15T10:00:00.000Z", ["Lost in Transit"]),
        ticket(1, "2024-05-14T10:00:00.000Z", ["Damaged in Transit"]),
      ],
      meta: { next_cursor: null },
    });

    const result = await fetchOnePage("2024-05-01", "2024-05-31", null, "Damaged in Transit");

    expect(result.tickets.map((t) => t.id)).toEqual([1]);
  });

  it("throws with the Gorgias error body on a non-ok response", async () => {
    mockFetch({ error: "invalid api key" }, false);

    await expect(fetchOnePage("2024-05-01", "2024-05-31", null)).rejects.toThrow(/Gorgias API error \(500\)/);
  });
});
