import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApi } from "./client";
const schema = z.object({ ok: z.boolean() });
describe("customer API transport", () => {
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
});
