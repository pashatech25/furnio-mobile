import { z } from "zod";
import { quoteHeaders } from "./credit-quote";
import { requestDeadline, type RequestBoundary } from "./deadline";
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly uncertain = false,
    readonly code?: string,
  ) {
    super(message);
  }
}
export function createApi(
  base: string,
  getToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
  boundary?: RequestBoundary,
) {
  return async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    options: {
      signal?: AbortSignal;
      public?: boolean;
      expectedCredits?: number;
      /** Synchronous receipt marker immediately before the actual network dispatch. */
      onDispatch?: () => void;
    } = {},
  ): Promise<T> {
    if (!base || new URL(base).protocol !== "https:")
      throw new ApiError(
        "Network calls require an explicitly configured HTTPS environment.",
        503,
      );
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("://"))
      throw new Error("Only relative API paths are allowed.");
    const creditHeaders = quoteHeaders(
      path,
      body,
      options.expectedCredits,
      options.public,
    );
    boundary?.assertCurrent();
    if (options.signal?.aborted)
      throw new ApiError("Request cancelled before sending.", 0);
    const token = options.public ? null : await getToken();
    boundary?.assertCurrent();
    if (options.signal?.aborted)
      throw new ApiError("Request cancelled before sending.", 0);
    if (!options.public && !token)
      throw new ApiError("Please sign in again.", 401);
    const encodedBody = body === undefined ? undefined : JSON.stringify(body);
    let response: Response;
    const deadline = requestDeadline(30_000, [
      options.signal,
      boundary?.signal,
    ]);
    const check = () => {
      boundary?.assertCurrent();
      if (deadline.signal.aborted) throw new Error("Request stopped.");
    };
    let json: unknown;
    try {
      check();
      options.onDispatch?.();
      response = await fetcher(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...creditHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(encodedBody === undefined ? {} : { body: encodedBody }),
        signal: deadline.signal,
      });
      check();
      json = await response.json().catch(() => null);
      check();
    } catch {
      // Never automatically retry a POST: the upstream customer job routes do not promise an idempotent retry.
      throw new ApiError(
        body === undefined
          ? "Connection interrupted. Please refresh."
          : "The connection was interrupted. Check your project or purchase status before trying again; the request may have been accepted.",
        0,
        body !== undefined,
      );
    } finally {
      deadline.dispose();
    }
    if (!response.ok) {
      const error = z
        .object({ error: z.string(), code: z.string().max(64).optional() })
        .safeParse(json);
      throw new ApiError(
        error.success
          ? error.data.error
          : `Request could not be completed (${response.status}).`,
        response.status,
        body !== undefined && response.status >= 500,
        error.success ? error.data.code : undefined,
      );
    }
    const result = schema.safeParse(json);
    if (!result.success)
      throw new ApiError(
        "The server response is incompatible. Please update the app or contact support. Check request status before submitting again.",
        502,
        body !== undefined,
      );
    return result.data;
  };
}
export type ApiClient = ReturnType<typeof createApi>;
