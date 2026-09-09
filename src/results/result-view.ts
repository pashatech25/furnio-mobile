import type { JobStatusResponse } from "../contracts/jobs";

export type ResultOutput = {
  assetId: string;
  accessLevel: "paid" | "trial_locked";
  resultUrl: string | null;
  stepIndex: number;
  source?: NonNullable<JobStatusResponse["results"]>[number]["source"];
};

export function resultOutputs(job: JobStatusResponse | null): ResultOutput[] {
  if (!job) return [];
  if (job.results?.length) {
    const unique = [
      ...new Map(
        job.results.map((output) => [output.assetId, output]),
      ).values(),
    ];
    // Keep the server's processing order unless every original-view index is known.
    // In particular, never substitute stepIndex for an uploaded view's index.
    const indices = unique.map((output) => output.source?.viewIndex);
    return indices.every((index) => typeof index === "number") &&
      new Set(indices).size === unique.length
      ? unique.sort((a, b) => a.source!.viewIndex! - b.source!.viewIndex!)
      : unique;
  }
  if (!job.resultAssetId) return [];
  return [
    {
      assetId: job.resultAssetId,
      accessLevel: job.accessLevel,
      resultUrl:
        job.accessLevel === "trial_locked" ? job.previewUrl : job.resultUrl,
      stepIndex: 0,
    },
  ];
}

export function selectedResult(
  outputs: ResultOutput[],
  assetId: string | null,
) {
  return outputs.find((output) => output.assetId === assetId) ?? outputs[0];
}

export function resultLabel(output: ResultOutput) {
  return output.source?.viewIndex != null
    ? `View ${output.source.viewIndex + 1}`
    : `Output ${output.stepIndex + 1}`;
}

export function comparisonSource(
  output: ResultOutput | undefined,
  now: number,
) {
  const source = output?.source;
  if (
    !source ||
    source.assetId === output?.assetId ||
    !Number.isFinite(now) ||
    !(Date.parse(source.expiresAt) > now)
  )
    return null;
  try {
    const url = new URL(source.previewUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return source;
  } catch {
    return null;
  }
}

// One gate per mounted account/job screen. Invalidated on blur/unmount; an older
// refresh must not overwrite a newer result or restore another account's images.
export function createResultRequestGate() {
  let revision = 0;
  return {
    begin() {
      const own = ++revision;
      return () => revision === own;
    },
    invalidate() {
      revision += 1;
    },
  };
}
