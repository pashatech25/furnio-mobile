import { z } from "zod";
import {
  deletionCapabilitySchema,
  deletionConfirmationSchema,
} from "./account-deletion-contract";

export class AccountPrivacyError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
export function createDeletionTransport(
  base: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
) {
  const origin = new URL(base);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.hash ||
    origin.search ||
    origin.pathname !== "/"
  )
    throw new AccountPrivacyError(
      "Private account review requires its configured HTTPS service.",
    );
  return async function request<T>(
    action:
      | "capabilities"
      | "review"
      | "prepare"
      | "confirm"
      | "cancel"
      | "status",
    schema: z.ZodType<T>,
    token: string | null,
    input?: unknown,
  ): Promise<T> {
    const publicRequest = action === "capabilities" || action === "status";
    if ((!publicRequest && !token) || (publicRequest && token))
      throw new AccountPrivacyError("Verify this account before continuing.");
    const readOnly = action === "capabilities" || action === "review";
    if (readOnly && input !== undefined)
      throw new AccountPrivacyError(
        "A private review accepts no account selectors.",
      );
    const body = readOnly
      ? undefined
      : JSON.stringify(
          (action === "confirm"
            ? deletionConfirmationSchema
            : deletionCapabilitySchema
          ).parse(input),
        );
    const path =
      action === "capabilities"
        ? "/v1/capabilities"
        : `/v1/account/deletion/${action}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetcher(origin.origin + path, {
        method: readOnly ? "GET" : "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
        signal: controller.signal,
      });
      if (
        response.redirected ||
        (response.url && response.url !== origin.origin + path)
      )
        throw new AccountPrivacyError(
          "The private account service returned an unexpected redirect.",
        );
      if (!response.ok) {
        await response.body?.cancel();
        // Never display arbitrary server bodies (which may contain credentials,
        // account fields or reverse-proxy debug output) in a native dialog.
        throw new AccountPrivacyError(
          response.status === 503
            ? "The account privacy service is temporarily unavailable. Keep your saved receipt and check status later."
            : response.status === 429
              ? "Too many account privacy requests. Wait one minute, then check saved status. Do not submit deletion again."
              : response.status === 401 || response.status === 403
                ? "Verify this same Furnio account again before continuing."
                : response.status === 404
                  ? "The saved request could not be found. Keep this receipt and contact support if a confirmation was interrupted."
                  : "The account request could not be completed. Check its saved status before starting another request.",
          response.status,
        );
      }
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("Content-Type") ?? "",
        )
      )
        throw new AccountPrivacyError(
          "The private account service returned an incompatible response.",
        );
      const reader = response.body?.getReader();
      if (!reader)
        throw new AccountPrivacyError(
          "The private account response was empty.",
        );
      const decoder = new TextDecoder();
      let bytes = 0,
        text = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 16384)
            throw new AccountPrivacyError(
              "The private account response exceeded its safety limit.",
            );
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AccountPrivacyError(
          "The account response could not be read. Check saved status before trying again.",
        );
      }
      const result = schema.safeParse(json);
      if (!result.success)
        throw new AccountPrivacyError(
          "Account response is incompatible. Keep your receipt and check status before trying again.",
        );
      return result.data;
    } catch (error) {
      if (error instanceof AccountPrivacyError) throw error;
      throw new AccountPrivacyError(
        "Connection interrupted. Keep your saved receipt and check status; do not submit deletion again.",
      );
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  };
}
