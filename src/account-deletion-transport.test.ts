import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDeletionTransport } from "./account-deletion-transport";
const capability = {
  requestId: "11111111-1111-4111-8111-111111111111",
  receiptSecret: "ab".repeat(32),
};
describe("private account transport", () => {
  it("sends receipt secrets only in a bounded POST with no bearer, cookies or redirects", async () => {
    const fetcher = vi.fn(async () => Response.json({ state: "prepared" }));
    const request = createDeletionTransport("https://mobile.fixture/", fetcher);
    expect(
      await request(
        "status",
        z.object({ state: z.string() }),
        null,
        capability,
      ),
    ).toEqual({ state: "prepared" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://mobile.fixture/v1/account/deletion/status");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify(capability),
    });
    expect(init.headers).not.toHaveProperty("Authorization");
  });
  it("requires a verified bearer for reviews and never accepts account selectors", async () => {
    const fetcher = vi.fn(async () => Response.json({}));
    const request = createDeletionTransport("https://mobile.fixture", fetcher);
    await expect(request("review", z.unknown(), null)).rejects.toThrow(
      "Verify",
    );
    await expect(
      request("review", z.unknown(), "fixture-token", { userId: "other" }),
    ).rejects.toThrow("selectors");
    await expect(
      request("status", z.unknown(), "fixture-token", capability),
    ).rejects.toThrow("Verify");
    expect(fetcher).not.toHaveBeenCalled();
    await request("review", z.unknown(), "fixture-token");
    expect(fetcher).toHaveBeenCalledWith(
      "https://mobile.fixture/v1/account/deletion/review",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer fixture-token",
        },
      }),
    );
  });
  it("redacts provider/proxy error bodies", async () => {
    const request = createDeletionTransport(
      "https://mobile.fixture",
      async () =>
        Response.json(
          { error: "Bearer secret user@example.invalid" },
          { status: 503 },
        ),
    );
    await expect(
      request("review", z.unknown(), "fixture-token"),
    ).rejects.toThrow("temporarily unavailable");
    await expect(
      request("review", z.unknown(), "fixture-token"),
    ).rejects.not.toThrow("secret");
  });
  it("bounds streamed responses, even without Content-Length", async () => {
    const request = createDeletionTransport(
      "https://mobile.fixture",
      async () => Response.json({ data: "a".repeat(17000) }),
    );
    await expect(request("capabilities", z.unknown(), null)).rejects.toThrow(
      "safety limit",
    );
  });
  it.each([429, 503])(
    "preserves uncertainty and never retries status %s or displays the server body",
    async (status) => {
      const fetcher = vi.fn(async () =>
        Response.json(
          { error: "private-proxy-details" },
          {
            status,
            headers: { "Retry-After": "60" },
          },
        ),
      );
      const request = createDeletionTransport(
        "https://mobile.fixture",
        fetcher,
      );
      const error = await request(
        "status",
        z.unknown(),
        null,
        capability,
      ).catch((error) => error);
      expect(error.status).toBe(status);
      expect(error.message).toContain(
        status === 429 ? "Wait one minute" : "check status later",
      );
      expect(error.message).not.toContain("not been deleted");
      expect(error.message).not.toContain("private-proxy-details");
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("never retries an interrupted confirmation or includes its secret in the error", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("secret URL");
    });
    const request = createDeletionTransport("https://mobile.fixture", fetcher);
    await expect(
      request("prepare", z.unknown(), "fixture-token", capability),
    ).rejects.toThrow("check status");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects unexpected redirects, invalid JSON and incompatible responses", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "https://wrong.fixture" },
    });
    await expect(
      createDeletionTransport("https://mobile.fixture", async () => redirect)(
        "capabilities",
        z.unknown(),
        null,
      ),
    ).rejects.toThrow();
    const invalid = new Response("invalid", {
      headers: { "Content-Type": "application/json" },
    });
    await expect(
      createDeletionTransport("https://mobile.fixture", async () => invalid)(
        "capabilities",
        z.unknown(),
        null,
      ),
    ).rejects.toThrow("could not be read");
    await expect(
      createDeletionTransport("https://mobile.fixture", async () =>
        Response.json({ nope: true }),
      )("capabilities", z.object({ version: z.literal(1) }), null),
    ).rejects.toThrow("incompatible");
  });
  it.each([
    "http://mobile.fixture",
    "https://user:password@mobile.fixture",
    "https://mobile.fixture?secret=yes",
    "https://mobile.fixture/path",
  ])("rejects unsafe endpoint %s", (url) => {
    expect(() => createDeletionTransport(url, fetch)).toThrow();
  });
});
