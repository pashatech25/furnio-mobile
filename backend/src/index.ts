import { z } from "zod";
import { HttpError, boundedJson } from "./http";
import { receiveNativeWebhook, consumeNativeEvents } from "./native-events";
import { getMobileBilling } from "./billing";
import { getActivity } from "./activity";
import { processAccountMediaCleanup } from "./account-media-cleanup";
import { processAccountAuthBlocks } from "./account-auth-block";
import {
  accountPrivacyLimitsReady,
  AccountPrivacyRateLimitError,
} from "./account-rate-limits";
import {
  manageAccountDeletionRequest,
  reviewAccountDeletion,
} from "./account-deletion";
import { requestRecovery } from "./recovery";
import {
  manageDevice,
  notificationsReady,
  processNotifications,
} from "./notifications";
import {
  purchaseEligibility,
  purchaseIntent,
  recoverPurchaseSelection,
} from "./purchase-intents";
export { HttpError, boundedJson } from "./http";

const gates = {
  version: 1 as const,
  commerceReady: false,
  accountDeletionReady: false,
};
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  });
}
export async function requireCustomer(request: Request, env: Env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer [^\s]{20,8192}$/.test(authorization))
    throw new HttpError(401, "Sign in to Furnio first.");
  // Service binding delegates authentication AND customer/suspension authorization to the existing customer API.
  // No service-role identity bypass and no client-provided user ID is trusted here.
  const response = await env.PLATFORM.fetch(
    "https://platform.internal/api/me",
    {
      headers: { Authorization: authorization, Accept: "application/json" },
      // workerd rejects redirect:"error" before making a request. Manual plus
      // the non-2xx check below rejects redirects without forwarding credentials.
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(
      response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
      "Customer access could not be verified.",
    );
  }
  const parsed = z
    .object({ user: z.object({ userId: z.uuid() }) })
    .safeParse(await boundedJson(response));
  if (!parsed.success)
    throw new HttpError(502, "Customer identity response is incompatible.");
  return parsed.data.user.userId;
}
function challenge(url: URL, env: Env) {
  const nonce = url.searchParams.get("nonce");
  if (!nonce || !z.uuid().safeParse(nonce).success)
    throw new HttpError(400, "Invalid security challenge.");
  const action = url.searchParams.get("action") ?? "trial-phone";
  if (!["trial-phone", "signup-email", "signin-email", "password-reset"].includes(action))
    throw new HttpError(400, "Unsupported security challenge action.");
  if (
    url.protocol !== "https:" ||
    !env.CHALLENGE_HOSTNAME ||
    url.hostname !== env.CHALLENGE_HOSTNAME ||
    !/^[a-zA-Z0-9_-]{10,100}$/.test(env.TURNSTILE_SITE_KEY)
  )
    throw new HttpError(
      503,
      "The native security challenge is not configured.",
    );
  const scriptNonce = crypto.randomUUID();
  const script = `const challengeNonce=${JSON.stringify(nonce)};function expired(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'furnio.turnstile.expired',nonce:challengeNonce}));}function onReady(){turnstile.render('#challenge',{sitekey:${JSON.stringify(env.TURNSTILE_SITE_KEY)},action:${JSON.stringify(action)},theme:'light',callback:function(token){if(typeof token==='string'&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'furnio.turnstile',nonce:challengeNonce,token:token}));},'expired-callback':expired,'error-callback':expired});}`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Furnio security check</title><style nonce="${scriptNonce}">body{margin:0;background:#f7f5ef;display:flex;justify-content:center}</style></head><body><div id="challenge"></div><script nonce="${scriptNonce}">${script}</script><script nonce="${scriptNonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onReady&amp;render=explicit" async defer></script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${scriptNonce}' https://challenges.cloudflare.com; style-src 'nonce-${scriptNonce}'; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      },
    },
  );
}
export default {
  queue: consumeNativeEvents,
  async scheduled(_event, env) {
    try {
      await processAccountAuthBlocks(env);
    } catch {
      console.error(
        JSON.stringify({
          service: "furnio-mobile-account-auth",
          error: "auth_block_unavailable",
        }),
      );
    }
    try {
      await processNotifications(env);
    } catch {
      console.error(
        JSON.stringify({
          service: "furnio-mobile-notifications",
          error: "dispatch_unavailable",
        }),
      );
    }
    try {
      await processAccountMediaCleanup(env);
    } catch {
      console.error(
        JSON.stringify({
          service: "furnio-mobile-account-cleanup",
          error: "cleanup_unavailable",
        }),
      );
    }
  },
  async fetch(request, env) {
    const started = Date.now(),
      requestId = crypto.randomUUID();
    let status = 500;
    try {
      const url = new URL(request.url);
      let response: Response;
      // No browser CORS access is enabled. The native client does not send Origin.
      if (request.headers.has("Origin"))
        throw new HttpError(403, "Browser access is not enabled.");
      if (request.method === "GET" && url.pathname === "/health")
        response = json({
          status: "ok",
          service: "furnio-mobile",
          release: "foundation",
          environment: env.ENVIRONMENT,
        });
      else if (request.method === "GET" && url.pathname === "/v1/capabilities")
        response = json({
          ...gates,
          // Read/review readiness does not enable destructive confirmation.
          accountDeletionReviewReady:
            env.MOBILE_ACCOUNT_REVIEW_ENABLED === "true" &&
            accountPrivacyLimitsReady(env),
          accountDeletionRequestsReady:
            env.MOBILE_ACCOUNT_REVIEW_ENABLED === "true" &&
            env.MOBILE_ACCOUNT_REQUESTS_ENABLED === "true" &&
            accountPrivacyLimitsReady(env),
          notificationsReady: notificationsReady(env),
          recoveryReady: env.NATIVE_RECONCILIATION_ENABLED === "true",
          billingReady:
            env.MOBILE_ENABLED === "true" &&
            env.MOBILE_BILLING_READ_ENABLED === "true",
          activityReady:
            env.MOBILE_ENABLED === "true" &&
            env.MOBILE_ACTIVITY_READ_ENABLED === "true",
        });
      else if (
        request.method === "GET" &&
        url.pathname === "/v1/account/deletion/review"
      )
        // Privacy review remains independent of purchase/customer-access flags.
        // It is read-only; the destructive endpoint is still unavailable.
        response = json(await reviewAccountDeletion(request, env));
      else if (
        request.method === "POST" &&
        ["prepare", "confirm", "cancel", "status"].some(
          (action) => url.pathname === `/v1/account/deletion/${action}`,
        )
      ) {
        const action = z
          .enum(["prepare", "confirm", "cancel", "status"])
          .parse(url.pathname.split("/").at(-1));
        response = json(
          await manageAccountDeletionRequest(request, action, env),
        );
      } else if (
        request.method === "POST" &&
        url.pathname === "/v1/devices/disable"
      )
        // Installation capability can ONLY disable notifications. Remains usable
        // after local sign-out, an expired login, or an app-entry rollback.
        response = json(await manageDevice(request, "disable", null, env));
      else if (
        request.method === "POST" &&
        url.pathname === "/v1/webhooks/revenuecat"
      )
        // Paid-event processing is deliberately independent of the app entry/
        // acquisition flag so rollback does not abandon paid transactions.
        response = json(await receiveNativeWebhook(request, env), 202);
      else if (
        ["POST", "GET"].includes(request.method) &&
        url.pathname === "/v1/purchases/reconcile"
      ) {
        // Restoration of already-paid purchases remains available when new app
        // entry or acquisition is disabled. Authentication is still mandatory.
        if (env.NATIVE_RECONCILIATION_ENABLED !== "true")
          throw new HttpError(503, "Native reconciliation is not enabled.");
        if (url.search)
          throw new HttpError(400, "Recovery accepts no query parameters.");
        const userId = await requireCustomer(request, env);
        const result = await requestRecovery(request, userId, env);
        response = json(result, result.status === "pending" ? 202 : 200);
      } else if (
        request.method === "POST" &&
        url.pathname === "/v1/purchases/recover-selection"
      ) {
        response = json(
          await recoverPurchaseSelection(
            request,
            await requireCustomer(request, env),
            env,
          ),
        );
      } else if (
        ["GET", "POST"].includes(request.method) &&
        url.pathname.startsWith("/v1/purchases/intents/")
      ) {
        // Existing-payment status/reporting continues during an acquisition rollback.
        if (env.NATIVE_RECONCILIATION_ENABLED !== "true")
          throw new HttpError(503, "Native reconciliation is not enabled.");
        response = json(
          await purchaseIntent(
            request,
            await requireCustomer(request, env),
            url.pathname.slice("/v1/purchases/intents/".length),
            env,
          ),
        );
      } else {
        if (env.MOBILE_ENABLED !== "true")
          throw new HttpError(
            503,
            "Mobile integration is not enabled in this environment.",
          );
        if (request.method === "GET" && url.pathname === "/v1/challenge")
          response = challenge(url, env);
        else {
          const userId = await requireCustomer(request, env);
          if (request.method === "GET" && url.pathname === "/v1/session")
            response = json({ customerAccess: true });
          else if (
            request.method === "POST" &&
            [
              "/v1/devices",
              "/v1/devices/prepare",
              "/v1/devices/status",
            ].includes(url.pathname)
          )
            response = json(
              await manageDevice(
                request,
                url.pathname === "/v1/devices"
                  ? "register"
                  : url.pathname === "/v1/devices/prepare"
                    ? "prepare"
                    : "status",
                userId,
                env,
              ),
            );
          else if (
            request.method === "POST" &&
            url.pathname === "/v1/purchases/eligibility"
          )
            response = json(await purchaseEligibility(request, userId, env));
          else if (request.method === "GET" && url.pathname === "/v1/billing") {
            if (env.MOBILE_BILLING_READ_ENABLED !== "true")
              throw new HttpError(503, "Mobile billing reads are not enabled.");
            response = json(await getMobileBilling(userId, url, env));
          } else if (
            request.method === "GET" &&
            url.pathname === "/v1/activity"
          ) {
            if (env.MOBILE_ACTIVITY_READ_ENABLED !== "true")
              throw new HttpError(503, "Activity browsing is not enabled.");
            response = json(await getActivity(userId, url, env));
          } else if (
            [
              "/v1/billing",
              "/v1/devices",
              "/v1/account/delete",
              "/v1/purchases/eligibility",
              "/v1/purchases/reconcile",
              "/v1/webhooks/revenuecat",
            ].includes(url.pathname)
          )
            throw new HttpError(
              503,
              "This capability has not passed its release gate.",
            );
          else throw new HttpError(404, "Not found.");
        }
      }
      status = response.status;
      return response;
    } catch (error) {
      status = error instanceof HttpError ? error.status : 502;
      const response = json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "Mobile support service is temporarily unavailable.",
          requestId,
        },
        status,
      );
      if (error instanceof AccountPrivacyRateLimitError)
        response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    } finally {
      // Never record tokens, user IDs, photos, URLs, query strings, phone numbers, or request bodies.
      console.log(
        JSON.stringify({
          requestId,
          status,
          durationMs: Date.now() - started,
          service: "furnio-mobile",
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
