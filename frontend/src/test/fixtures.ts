import type { Application, Stats } from "../api/types";

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 1,
    company: "Northwind Labs",
    position: "Junior Backend Developer",
    status: "applied",
    location: "Monterrey, NL",
    url: null,
    notes: null,
    applied_date: "2026-11-01",
    created_at: "2026-11-01T15:00:00Z",
    updated_at: "2026-11-01T15:00:00Z",
    ...overrides,
  };
}

export const STATS: Stats = {
  total: 10,
  by_status: { applied: 4, interview: 3, offer: 1, rejected: 2 },
  reached_interview: 5,
  reached_offer: 1,
  interview_rate: 0.5,
  offer_rate: 0.1,
  weekly: Array.from({ length: 8 }, (_, index) => ({
    week_start: `2026-09-${String(21 + index).padStart(2, "0")}`,
    count: index % 3,
  })),
};

type Reply = { status?: number; body?: unknown };
type Handler = Reply | ((url: URL, init: RequestInit | undefined) => Reply);

/** Replace fetch with canned responses keyed by "METHOD /path". Unknown routes fail loudly. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit | undefined }[] = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    calls.push({ key, init });
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    const reply = typeof handler === "function" ? handler(url, init) : handler;
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchMock, calls };
}
