import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApi } from "./client";
const schema = z.object({ ok: z.boolean() });
afterEach(() => vi.useRealTimers());
describe("customer API transport", () => {
  it("marks dispatch after authentication and serialization, directly before fetch", async () => {
    const events: string[] = [];
    const fetcher = vi.fn(async () => {
      events.push("fetch");
      return Response.json({ ok: true });
    });
    await createApi(
      "https://staging.example",
      async () => {
        events.push("token");
        return "fixture";
      },
      fetcher,
    )(
      "/api/projects",
      schema,
      {
        toJSON: () => {
          events.push("encode");
          return {};
        },
      },
      { onDispatch: () => events.push("dispatch") },
    );
    expect(events).toEqual(["token", "encode", "dispatch", "fetch"]);
  });
  it("never requests anything when the demo has no API base", async () => {
    const fetcher = vi.fn();
    await expect(
      createApi("", async () => "token", fetcher)("/api/jobs", schema, {}),
    ).rejects.toThrow("configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires authentication before a private call", async () => {
    const fetcher = vi.fn();
    await expect(
      createApi(
        "https://staging.example",
        async () => null,
        fetcher,
      )("/api/projects", schema),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes only the bearer token on authenticated JSON requests", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await createApi(
      "https://staging.example",
      async () => "fixture-bearer",
      fetcher,
    )("/api/projects", schema, { name: "Sample" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://staging.example/api/projects",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer fixture-bearer",
          "Content-Type": "application/json",
        },
        body: '{"name":"Sample"}',
      }),
    );
  });
  it("does not attach authentication to public requests", async () => {
    const token = vi.fn();
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await createApi("https://staging.example", token, fetcher)(
      "/api/public-config",
      schema,
      undefined,
      { public: true },
    );
    expect(token).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });
  it.each(["https://foreign.example/api", "//foreign.example/api"])(
    "rejects an absolute path %s",
    async (path) => {
      const fetcher = vi.fn();
      await expect(
        createApi(
          "https://staging.example",
          async () => "token",
          fetcher,
        )(path, schema),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("does not retry a POST after network failure", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Disconnected");
    });
    await expect(
      createApi("https://staging.example", async () => "token", fetcher)(
        "/api/mobile/v1/jobs/stage",
        schema,
        {},
        { expectedCredits: 5 },
      ),
    ).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([500, 502, 503])(
    "marks a %s POST response uncertain",
    async (status) => {
      await expect(
        createApi(
          "https://staging.example",
          async () => "token",
          async () => Response.json({ error: "Server error" }, { status }),
        )("/api/mobile/v1/jobs/stage", schema, {}, { expectedCredits: 5 }),
      ).rejects.toMatchObject({ uncertain: true });
    },
  );
  it("marks an incompatible successful POST uncertain", async () => {
    await expect(
      createApi(
        "https://staging.example",
        async () => "token",
        async () => Response.json({ changed: true }),
      )("/api/mobile/v1/jobs/stage", schema, {}, { expectedCredits: 5 }),
    ).rejects.toMatchObject({ uncertain: true });
  });
  it("keeps a validation rejection distinct from uncertain acceptance", async () => {
    await expect(
      createApi(
        "https://staging.example",
        async () => "token",
        async () => Response.json({ error: "Invalid file" }, { status: 422 }),
      )("/api/mobile/v1/jobs/stage", schema, {}, { expectedCredits: 5 }),
    ).rejects.toMatchObject({ uncertain: false, status: 422 });
  });
  it("does not dispatch if cancellation happened while reading the token", async () => {
    const controller = new AbortController(),
      fetcher = vi.fn();
    const request = createApi(
      "https://staging.example",
      async () => {
        controller.abort();
        return "fixture";
      },
      fetcher,
    );
    await expect(
      request("/api/projects", schema, {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "discards late JSON after cancellation (POST=%s)",
    async (post) => {
      const controller = new AbortController();
      const response = Response.json({ ok: true });
      response.json = async () => {
        controller.abort();
        return { ok: true };
      };
      const fetcher = vi.fn(async () => response);
      const request = createApi(
        "https://staging.example",
        async () => "fixture",
        fetcher,
      );
      await expect(
        request("/api/projects", schema, post ? {} : undefined, {
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ uncertain: post });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("retains the 30-second timeout alongside explicit screen cancellation", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const fetcher = vi.fn(
      (_url: string | URL | Request, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options!.signal!.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            { once: true },
          );
        }),
    );
    const request = createApi(
      "https://staging.example",
      async () => "fixture",
      fetcher,
    );
    const expectation = expect(
      request("/api/projects", schema, {}, { signal: parent.signal }),
    ).rejects.toMatchObject({ uncertain: true });
    await vi.advanceTimersByTimeAsync(30_000);
    await expectation;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(parent.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rechecks the account boundary after token retrieval and before dispatch", async () => {
    let current = true;
    const fetcher = vi.fn();
    const request = createApi(
      "https://staging.example",
      async () => {
        current = false;
        return "fixture";
      },
      fetcher,
      {
        signal: new AbortController().signal,
        assertCurrent() {
          if (!current) throw new Error("Changed");
        },
      },
    );
    await expect(request("/api/projects", schema, {})).rejects.toThrow(
      "Changed",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
