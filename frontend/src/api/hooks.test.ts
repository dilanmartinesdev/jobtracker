import { afterEach, describe, expect, it, vi } from "vitest";

import { makeApplication } from "../test/fixtures";
import { fetchAllApplications } from "./hooks";

afterEach(() => vi.unstubAllGlobals());

function pagedServer(total: number) {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    requested.push(url.search);
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      makeApplication({ id: offset + i + 1 }),
    );
    return new Response(JSON.stringify({ items, total, limit, offset }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return requested;
}

describe("fetchAllApplications", () => {
  it("makes a single request when everything fits in one page", async () => {
    const requested = pagedServer(3);
    await expect(fetchAllApplications()).resolves.toHaveLength(3);
    expect(requested).toHaveLength(1);
  });

  it("keeps asking until it has every row, so nothing past the first page is lost", async () => {
    const requested = pagedServer(1203);
    const rows = await fetchAllApplications();
    expect(rows).toHaveLength(1203);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1203);
    expect(requested).toHaveLength(3);
  });

  it("stops on an empty page even if the reported total is wrong", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ items: [], total: 99, limit: 500, offset: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchAllApplications()).resolves.toEqual([]);
  });
});
