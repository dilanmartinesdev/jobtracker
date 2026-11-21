import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { tokenStore } from "./api/client";
import { keys, useMoveApplication } from "./api/hooks";
import type { Application } from "./api/types";
import { AuthProvider } from "./auth/AuthContext";
import { STATS, makeApplication, mockApi } from "./test/fixtures";

const USER = { id: 1, email: "dylan@example.com", created_at: "2026-11-01T00:00:00Z" };

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderApp() {
  return render(
    <QueryClientProvider client={newClient()}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("signing in", () => {
  it("shows the sign-in form when there is no saved session", () => {
    vi.stubGlobal("fetch", mockApi({}).fetchMock);
    renderApp();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the server's message for a wrong password and stays on the form", async () => {
    const { fetchMock } = mockApi({
      "POST /api/auth/login": { status: 401, body: { detail: "Incorrect email or password" } },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    await userEvent.type(screen.getByLabelText("Email"), "dylan@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
  });

  it("loads the board after a successful sign-in", async () => {
    const { fetchMock } = mockApi({
      "POST /api/auth/login": { body: { access_token: "tok", token_type: "bearer" } },
      "GET /api/auth/me": { body: USER },
      "GET /api/applications": {
        body: {
          items: [
            makeApplication({ id: 1, company: "Northwind Labs", status: "applied" }),
            makeApplication({ id: 2, company: "Cemex", status: "interview" }),
          ],
          total: 2,
          limit: 500,
          offset: 0,
        },
      },
      "GET /api/applications/stats": { body: STATS },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    await userEvent.type(screen.getByLabelText("Email"), "dylan@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecreta1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const applied = await screen.findByRole("region", { name: "Applied" });
    expect(within(applied).getByText("Northwind Labs")).toBeInTheDocument();
    const interview = screen.getByRole("region", { name: "Interview" });
    expect(within(interview).getByText("Cemex")).toBeInTheDocument();
    expect(screen.getByText("dylan@example.com")).toBeInTheDocument();
    expect(tokenStore.get()).toBe("tok");
  });

  it("returns to sign-in with an explanation when the saved session has expired", async () => {
    tokenStore.set("expired-token");
    const { fetchMock } = mockApi({
      "GET /api/auth/me": { status: 401, body: { detail: "Invalid or expired credentials" } },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });
});

describe("board", () => {
  it("filters cards as you type and says how many are shown", async () => {
    tokenStore.set("tok");
    const { fetchMock } = mockApi({
      "GET /api/auth/me": { body: USER },
      "GET /api/applications": {
        body: {
          items: [
            makeApplication({ id: 1, company: "Northwind Labs" }),
            makeApplication({ id: 2, company: "Cemex", position: "Data Analyst" }),
          ],
          total: 2,
          limit: 500,
          offset: 0,
        },
      },
      "GET /api/applications/stats": { body: STATS },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    await screen.findByText("Northwind Labs");
    await userEvent.type(screen.getByRole("searchbox"), "analyst");

    expect(screen.queryByText("Northwind Labs")).not.toBeInTheDocument();
    expect(screen.getByText("Cemex")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 shown")).toBeInTheDocument();
  });

  it("opens an application for editing and shows its history", async () => {
    tokenStore.set("tok");
    const { fetchMock } = mockApi({
      "GET /api/auth/me": { body: USER },
      "GET /api/applications": {
        body: { items: [makeApplication({ id: 7, company: "Cemex", status: "interview" })], total: 1, limit: 500, offset: 0 },
      },
      "GET /api/applications/stats": { body: STATS },
      "GET /api/applications/7/history": {
        body: [
          { id: 1, from_status: null, to_status: "applied", created_at: "2026-11-01T15:00:00Z" },
          { id: 2, from_status: "applied", to_status: "interview", created_at: "2026-11-05T15:00:00Z" },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    await userEvent.click(await screen.findByText("Cemex"));

    expect(await screen.findByRole("heading", { name: "Edit application" })).toBeInTheDocument();
    expect(await screen.findByText("Moved from Applied to Interview")).toBeInTheDocument();
    expect(screen.getByText("Added as Applied")).toBeInTheDocument();
  });
});

describe("moving a card", () => {
  function wrapperFor(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  }

  it("moves the card at once and keeps it there when the server accepts", async () => {
    const client = newClient();
    client.setQueryData<Application[]>(keys.applications, [makeApplication({ id: 1 })]);
    const { fetchMock } = mockApi({
      "PATCH /api/applications/1": { body: makeApplication({ id: 1, status: "interview" }) },
      "GET /api/applications": { body: { items: [makeApplication({ id: 1, status: "interview" })], total: 1, limit: 500, offset: 0 } },
      "GET /api/applications/stats": { body: STATS },
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMoveApplication(), { wrapper: wrapperFor(client) });
    result.current.mutate({ id: 1, status: "interview" });

    await waitFor(() => expect(client.getQueryData<Application[]>(keys.applications)?.[0]?.status).toBe("interview"));
  });

  it("puts the card back when the server refuses", async () => {
    const client = newClient();
    client.setQueryData<Application[]>(keys.applications, [makeApplication({ id: 1, status: "applied" })]);
    const { fetchMock } = mockApi({
      "PATCH /api/applications/1": { status: 500, body: { detail: "boom" } },
      "GET /api/applications": { status: 500, body: { detail: "boom" } },
      "GET /api/applications/stats": { body: STATS },
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMoveApplication(), { wrapper: wrapperFor(client) });
    result.current.mutate({ id: 1, status: "offer" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<Application[]>(keys.applications)?.[0]?.status).toBe("applied");
  });
});
