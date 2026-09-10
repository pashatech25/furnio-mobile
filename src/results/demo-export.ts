/** Local fixture export is a compiled-demo capability, never a route parameter. */
export function demoExportUri(isDemo: boolean, uri: string | undefined) {
  if (!isDemo) throw new Error("Local fixture export is unavailable.");
  if (!uri) throw new Error("Choose a local test photo first.");
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error("The export test requires an on-device photo.");
  }
  if (url.protocol !== "file:" || url.hostname || url.search || url.hash)
    throw new Error("The export test requires an on-device photo.");
  return uri;
}
