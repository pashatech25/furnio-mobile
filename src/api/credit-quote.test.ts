import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createApi } from "./client";
import { quotedJobEndpoint, quoteHeaders } from "./credit-quote";

const result = z.object({ ok: z.boolean() });
describe("confirmed mobile credit transport", () => {
  it.each([
    "stage",
    "enhance",
    "multiview",
    "mask-edit",
    "floorplan",
    "reference-furniture",
  ])(
    "maps %s to a versioned route with no old-backend fallback",
    async (suffix) => {
      const fetcher = vi.fn(async () =>
        Response.json({ error: "Not found" }, { status: 404 }),
      );
      const path = quotedJobEndpoint(`/api/jobs/${suffix}`);
      await expect(
        createApi("https://staging.invalid", async () => "token", fetcher)(
          path,
          result,
          {},
          { expectedCredits: 5 },
        ),
      ).rejects.toMatchObject({ status: 404, uncertain: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(
        `https://staging.invalid/api/mobile/v1/jobs/${suffix}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Furnio-Expected-Credits": "5",
          }),
        }),
      );
    },
  );
  it.each([undefined, -1, 0.5, NaN, Infinity, 100_000_000])(
    "rejects invalid confirmation %s before fetching",
    async (expectedCredits) => {
      const fetcher = vi.fn();
      await expect(
        createApi("https://staging.invalid", async () => "token", fetcher)(
          quotedJobEndpoint("/api/jobs/stage"),
          result,
          {},
          { expectedCredits },
        ),
      ).rejects.toThrow("confirm");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("supports a zero-credit trial but not public or GET processing requests", () => {
    const path = quotedJobEndpoint("/api/jobs/stage");
    expect(quoteHeaders(path, {}, 0)).toEqual({
      "X-Furnio-Expected-Credits": "0",
    });
    expect(() => quoteHeaders(path, {}, 0, true)).toThrow();
    expect(() => quoteHeaders(path, undefined, 0)).toThrow();
  });
  it("keeps quote headers off unrelated endpoints and forbids unprotected submissions", () => {
    expect(quoteHeaders("/api/projects", {}, undefined)).toEqual({});
    expect(() => quoteHeaders("/api/projects", {}, 5)).toThrow();
    expect(() => quoteHeaders("/api/jobs/stage", {}, undefined)).toThrow();
    expect(() => quoteHeaders("/api/batches/reserve", {}, 5)).toThrow();
    expect(() => quotedJobEndpoint("/api/jobs/unknown")).toThrow();
  });
  it("preserves a quote rejection code without retrying or treating it as acceptance", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: "Review the new cost", code: "CREDIT_QUOTE_CHANGED" },
        { status: 409 },
      ),
    );
    await expect(
      createApi("https://staging.invalid", async () => "token", fetcher)(
        quotedJobEndpoint("/api/jobs/stage"),
        result,
        {},
        { expectedCredits: 0 },
      ),
    ).rejects.toMatchObject({
      status: 409,
      uncertain: false,
      code: "CREDIT_QUOTE_CHANGED",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
