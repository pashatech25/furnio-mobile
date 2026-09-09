const jobPaths = new Set([
  "/api/jobs/stage",
  "/api/jobs/enhance",
  "/api/jobs/multiview",
  "/api/jobs/mask-edit",
  "/api/jobs/floorplan",
  "/api/jobs/reference-furniture",
]);
export function quotedJobEndpoint(original: string): string {
  if (!jobPaths.has(original))
    throw new Error("This service has no verified mobile credit endpoint.");
  return original.replace("/api/jobs/", "/api/mobile/v1/jobs/");
}
export function quoteHeaders(
  path: string,
  body: unknown,
  expectedCredits: number | undefined,
  isPublic = false,
): Record<string, string> {
  if (
    body !== undefined &&
    (jobPaths.has(path) || path === "/api/batches/reserve")
  )
    throw new Error(
      "Mobile processing requires a versioned, confirmed credit endpoint.",
    );
  const quoted =
    path === "/api/mobile/v1/batches/reserve" ||
    [...jobPaths].some((p) => quotedJobEndpoint(p) === path);
  if (!quoted) {
    if (expectedCredits !== undefined)
      throw new Error("Credit confirmation is not supported by this endpoint.");
    return {};
  }
  if (
    body === undefined ||
    isPublic ||
    expectedCredits === undefined ||
    !Number.isSafeInteger(expectedCredits) ||
    expectedCredits < 0 ||
    expectedCredits > 99_999_999
  )
    throw new Error("Review and confirm the credit cost before submitting.");
  return { "X-Furnio-Expected-Credits": String(expectedCredits) };
}
