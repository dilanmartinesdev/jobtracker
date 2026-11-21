import { afterEach, describe, expect, it, vi } from "vitest";

import { mockApi } from "../test/fixtures";
import { ApiError, request, setUnauthorizedHandler, tokenStore } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(() => {});
});

describe("request", () => {
  it("sends the saved token as a bearer header", async () => {
    tokenStore.set("abc123");
    const { fetchMock, calls } = mockApi({ "GET /api/ping": { body: { ok: true } } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/ping")).resolves.toEqual({ ok: true });
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });

  it("sends login credentials form-encoded, as the OAuth2 flow requires", async () => {
    const { fetchMock, calls } = mockApi({ "POST /api/auth/login": { body: { access_token: "t" } } });
    vi.stubGlobal("fetch", fetchMock);

    await request("/auth/login", { method: "POST", form: { username: "a@b.co", password: "pw" } });
    const body = calls[0]?.init?.body as URLSearchParams;
    expect(body.get("username")).toBe("a@b.co");
    expect(body.get("password")).toBe("pw");
  });

  it("turns API errors into ApiError with the server's message", async () => {
    const { fetchMock } = mockApi({ "GET /api/x": { status: 409, body: { detail: "Email is already registered" } } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/x")).rejects.toMatchObject({ status: 409, message: "Email is already registered" });
  });

  it("reads the first message of a FastAPI validation error list", async () => {
    const detail = [{ msg: "Value error, Input should be a valid URL", loc: ["body", "url"] }];
    const { fetchMock } = mockApi({ "POST /api/x": { status: 422, body: { detail } } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/x", { method: "POST", json: {} })).rejects.toThrow("Input should be a valid URL");
  });

  it("reports an unreachable server in plain words", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const error = await request("/x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, message: expect.stringContaining("Cannot reach") });
  });

  it("signs the user out on a 401 when a token was sent", async () => {
    tokenStore.set("expired");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { fetchMock } = mockApi({ "GET /api/x": { status: 401, body: { detail: "Invalid or expired credentials" } } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/x")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not treat a wrong password as an expired session", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { fetchMock } = mockApi({ "POST /api/auth/login": { status: 401, body: { detail: "Incorrect email or password" } } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/auth/login", { method: "POST", form: {} })).rejects.toThrow("Incorrect email or password");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("returns undefined for 204 No Content", async () => {
    const { fetchMock } = mockApi({ "DELETE /api/x/1": { status: 204 } });
    vi.stubGlobal("fetch", fetchMock);
    await expect(request("/x/1", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
