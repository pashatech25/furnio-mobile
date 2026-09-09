// A deletion OAuth code is never exchanged on the normal application client.
// This registry contains only in-memory, short-lived PKCE handlers, not sessions.
const handlers = new Map<string, (url: string) => Promise<void>>();
export function registerDeletionCallback(
  flow: string,
  callback: (url: string) => Promise<void>,
) {
  if (handlers.has(flow)) throw new Error("Verification is already open.");
  handlers.set(flow, callback);
  return () => {
    handlers.delete(flow);
  };
}
export function validateDeletionCallback(raw: string, expected: string) {
  const url = new URL(raw),
    target = new URL(expected);
  if (
    url.protocol !== target.protocol ||
    url.host !== target.host ||
    url.pathname !== target.pathname ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.get("flow") !== target.searchParams.get("flow")
  )
    throw new Error("This is not the expected verification callback.");
  for (const name of url.searchParams.keys()) {
    if (
      !["flow", "code", "sb_flow_id"].includes(name) ||
      url.searchParams.getAll(name).length !== 1
    )
      throw new Error("Invalid verification callback.");
  }
  const code = url.searchParams.get("code"),
    flowId = url.searchParams.get("sb_flow_id");
  if (
    !code ||
    code.length > 2048 ||
    (flowId && !/^[a-zA-Z0-9_-]{1,128}$/.test(flowId))
  )
    throw new Error("Verification was not completed.");
  return { code, ...(flowId ? { flowId } : {}) };
}
export async function finishDeletionCallback(raw: string) {
  const flow = new URL(raw).searchParams.get("flow");
  const handler = flow && handlers.get(flow);
  if (!handler)
    throw new Error(
      "This private verification has expired. Return to account privacy and verify again.",
    );
  await handler(raw);
}
