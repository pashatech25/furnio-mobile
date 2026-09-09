import { describe, expect, it } from "vitest";
import {
  jobStatusResponseSchema,
  type JobStatusResponse,
} from "../contracts/jobs";
import {
  comparisonSource,
  createResultRequestGate,
  resultLabel,
  resultOutputs,
  selectedResult,
  type ResultOutput,
} from "./result-view";

const now = Date.parse("2026-09-09T12:00:00Z");
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const output = (view: number, stepIndex: number): ResultOutput => ({
  assetId: id(10 + view),
  accessLevel: "paid",
  resultUrl: `https://storage.invalid/result-${view}.jpg`,
  stepIndex,
  source: {
    assetId: id(view),
    viewIndex: view - 1,
    previewUrl: `https://storage.invalid/source-${view}.jpg`,
    expiresAt: new Date(now + 60_000).toISOString(),
  },
});
const job = (results: ResultOutput[] = []): JobStatusResponse =>
  jobStatusResponseSchema.parse({
    jobId: id(99),
    status: "partial",
    error: null,
    previewUrl: "https://storage.invalid/anchor.jpg",
    previewExpiresAt: null,
    resultAssetId: id(12),
    resultUrl: "https://storage.invalid/anchor-master.jpg",
    resultExpiresAt: null,
    results,
  });

describe("native per-output result presentation", () => {
  it("sorts known view numbers without confusing anchor-first processing order", () => {
    const raw = job([output(2, 0), output(1, 1), output(3, 2)]);
    const results = resultOutputs(raw);
    expect(results.map(resultLabel)).toEqual(["View 1", "View 2", "View 3"]);
    expect(comparisonSource(results[1], now)?.assetId).toBe(id(2));
    expect(raw.results?.[0]?.assetId).toBe(id(12)); // no in-place response mutation
  });
  it("keeps the selected asset when a newer poll adds or reorders results", () => {
    const selected = selectedResult(resultOutputs(job([output(2, 0)])), null)!;
    const refreshed = resultOutputs(
      job([output(2, 0), output(1, 1), output(3, 2)]),
    );
    expect(selectedResult(refreshed, selected.assetId)?.source?.assetId).toBe(
      id(2),
    );
  });
  it("does not guess a comparison from a partial set containing only one result", () => {
    const lone = output(3, 0);
    expect(comparisonSource(resultOutputs(job([lone]))[0], now)?.assetId).toBe(
      id(3),
    );
    delete lone.source;
    expect(comparisonSource(resultOutputs(job([lone]))[0], now)).toBeNull();
  });
  it("preserves selected trial output URLs instead of substituting the anchor preview", () => {
    const result = {
      ...output(3, 2),
      accessLevel: "trial_locked" as const,
      resultUrl: "https://storage.invalid/view-3-watermarked.jpg",
    };
    const selected = selectedResult(
      resultOutputs(job([output(2, 0), result])),
      result.assetId,
    );
    expect(selected?.resultUrl).toBe(result.resultUrl);
    expect(selected?.accessLevel).toBe("trial_locked");
  });
  it("uses only a protected preview for legacy locked results, never a clean master fallback", () => {
    const legacy = {
      ...job(),
      accessLevel: "trial_locked" as const,
      results: undefined,
    };
    expect(resultOutputs(legacy)[0]?.resultUrl).toBe(legacy.previewUrl);
    expect(
      resultOutputs({ ...legacy, previewUrl: null })[0]?.resultUrl,
    ).toBeNull();
    expect(comparisonSource(resultOutputs(legacy)[0], now)).toBeNull();
  });
  it("accepts old response contracts without optional source metadata", () => {
    const old = output(2, 0);
    delete old.source;
    const parsed = job([old]);
    expect(parsed.results?.[0]).not.toHaveProperty("source");
    expect(resultLabel(resultOutputs(parsed)[0]!)).toBe("Output 1");
  });
  it("preserves processing order when indices are missing and never labels them as camera views", () => {
    const unknown = output(3, 2);
    unknown.source = null;
    const results = resultOutputs(job([output(2, 0), unknown, output(1, 1)]));
    expect(results.map(resultLabel)).toEqual(["View 2", "Output 3", "View 1"]);
  });
  it.each([
    "expired",
    "invalid expiry",
    "insecure",
    "invalid URL",
    "credentials",
    "same asset",
  ])("rejects an unusable original: %s", (variant) => {
    const result = output(2, 0);
    const source = result.source!;
    if (variant === "expired") source.expiresAt = new Date(now).toISOString();
    if (variant === "invalid expiry") source.expiresAt = "invalid";
    if (variant === "insecure")
      source.previewUrl = "http://storage.invalid/source.jpg";
    if (variant === "invalid URL") source.previewUrl = "not a URL";
    if (variant === "credentials")
      source.previewUrl = "https://user:password@storage.invalid/source.jpg";
    if (variant === "same asset") source.assetId = result.assetId;
    expect(comparisonSource(result, now)).toBeNull();
  });
  it("has an exact expiry boundary and accepts a newly refreshed signed original", () => {
    const result = output(2, 0);
    expect(comparisonSource(result, now + 59_999)).not.toBeNull();
    expect(comparisonSource(result, now + 60_000)).toBeNull();
    result.source!.expiresAt = new Date(now + 120_000).toISOString();
    expect(comparisonSource(result, now + 60_000)).not.toBeNull();
  });
  it("handles empty, missing and duplicate results predictably", () => {
    expect(resultOutputs(null)).toEqual([]);
    expect(selectedResult([], id(1))).toBeUndefined();
    expect(resultOutputs(job([output(2, 0), output(2, 0)]))).toHaveLength(1);
    expect(
      selectedResult(resultOutputs(job([output(3, 0)])), id(999))?.assetId,
    ).toBe(id(13));
  });
});

describe("result refresh race protection", () => {
  it("only accepts the latest overlapping refresh", () => {
    const gate = createResultRequestGate();
    const old = gate.begin(),
      latest = gate.begin();
    expect(old()).toBe(false);
    expect(latest()).toBe(true);
  });
  it("discards old-account and old-job requests after unmount or blur", () => {
    const oldScreen = createResultRequestGate(),
      newScreen = createResultRequestGate();
    const old = oldScreen.begin();
    oldScreen.invalidate();
    const current = newScreen.begin();
    expect(old()).toBe(false);
    expect(current()).toBe(true);
  });
  it("permits a fresh request after returning to the screen", () => {
    const gate = createResultRequestGate(),
      old = gate.begin();
    gate.invalidate();
    const current = gate.begin();
    expect(old()).toBe(false);
    expect(current()).toBe(true);
  });
});
