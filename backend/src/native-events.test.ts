import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  consumeNativeEvents,
  NativeDatabase,
  processNativeEvent,
  receiveNativeWebhook,
} from "./native-events";
import { RevenueCatVerifier } from "./revenuecat";
import { HttpError } from "./http";
import type { NativeEvent } from "./revenuecat-webhook";

const user = "00000000-0000-4000-8000-000000000001";
const event: NativeEvent = {
  id: "evt_1",
  type: "NON_RENEWING_PURCHASE",
  app_id: "app_apple",
  event_timestamp_ms: Date.now(),
  app_user_id: user,
  original_app_user_id: user,
  aliases: [],
  environment: "SANDBOX",
  store: "APP_STORE",
  product_id: "pack20",
  transaction_id: "store_1",
  original_transaction_id: "store_1",
  purchased_at_ms: Date.now() - 1000,
  expiration_at_ms: null,
  period_type: "NORMAL",
  is_family_share: false,
};
function environment(changes: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "staging",
    MOBILE_ENABLED: "false",
    TURNSTILE_SITE_KEY: "",
    CHALLENGE_HOSTNAME: "",
    NATIVE_RECONCILIATION_ENABLED: "true",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
    REVENUECAT_PROJECT_ID: "project",
    REVENUECAT_APP_IDS: "app_apple",
    REVENUECAT_SECRET_API_KEY: "sk_" + "x".repeat(40),
    REVENUECAT_WEBHOOK_AUTHORIZATION: "Bearer " + "x".repeat(40),
    REVENUECAT_WEBHOOK_SIGNING_SECRET: "s".repeat(40),
    NATIVE_EVENTS: {
      send: vi.fn(async () => undefined),
      sendBatch: vi.fn(async () => undefined),
    },
    PLATFORM: { fetch: vi.fn(), connect: vi.fn() },
    ...changes,
  } as Env;
}
async function request(env: Env) {
  const body = JSON.stringify({
    api_version: "1.0",
    event: {
      ...event,
      subscriber_attributes: { email: "private@example.invalid" },
    },
  });
  const t = Math.floor(Date.now() / 1000),
    encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.REVENUECAT_WEBHOOK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${t}.${body}`),
  );
  const hex = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new Request("https://mobile.invalid/v1/webhooks/revenuecat", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      Authorization: env.REVENUECAT_WEBHOOK_AUTHORIZATION,
      "X-RevenueCat-Webhook-Signature": `t=${t},v1=${hex}`,
    },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("durable native event delivery", () => {
  it("carries known verified-ingress refunds into independent purchase verification", async () => {
    vi.spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValueOnce({
        event,
        state: "pending",
        kind: "subscription",
        recoveryReady: true,
        refundKnown: true,
      })
      .mockResolvedValueOnce({ duplicate: false });
    const verifier = vi
      .spyOn(RevenueCatVerifier.prototype, "verify")
      .mockResolvedValue({} as never);
    await processNativeEvent(event.id, environment());
    expect(verifier).toHaveBeenCalledWith(event, "subscription", {
      refundKnown: true,
    });
  });
  it("persists a sanitized inbox before queueing, even while acquisition is off", async () => {
    const env = environment(),
      order: string[] = [];
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockImplementation(async () => {
        order.push("database");
        return { eventId: event.id, state: "pending" };
      });
    vi.mocked(env.NATIVE_EVENTS.send).mockImplementation(async () => {
      order.push("queue");
    });
    await expect(
      receiveNativeWebhook(await request(env), env),
    ).resolves.toEqual({ accepted: true, state: "pending" });
    expect(order).toEqual(["database", "queue"]);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      "private@example.invalid",
    );
    expect(env.NATIVE_EVENTS.send).toHaveBeenCalledWith(
      { eventId: "evt_1" },
      { contentType: "json" },
    );
  });
  it("does not acknowledge a provider delivery when enqueue fails", async () => {
    const env = environment();
    vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue({
      eventId: event.id,
      state: "pending",
    });
    vi.mocked(env.NATIVE_EVENTS.send).mockRejectedValue(
      new Error("queue unavailable"),
    );
    await expect(receiveNativeWebhook(await request(env), env)).rejects.toThrow(
      "queue unavailable",
    );
  });
  it.each(["completed", "quarantined"])(
    "does not requeue a persisted %s event",
    async (state) => {
      const env = environment();
      vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue({
        eventId: event.id,
        state,
      });
      await receiveNativeWebhook(await request(env), env);
      expect(env.NATIVE_EVENTS.send).not.toHaveBeenCalled();
    },
  );
  it("does not contact the database when reconciliation is disabled", async () => {
    const env = environment({ NATIVE_RECONCILIATION_ENABLED: "false" }),
      rpc = vi.spyOn(NativeDatabase.prototype, "rpc");
    await expect(
      receiveNativeWebhook(await request(env), env),
    ).rejects.toMatchObject({ status: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("finishes only after independently verified data is atomically applied", async () => {
    const verified = {
      grant: true,
      refund: false,
      purchase: { transactionId: "store_1" },
    };
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValueOnce({ event, state: "pending", kind: "consumable" })
      .mockResolvedValueOnce({ duplicate: false });
    const verifier = vi
      .spyOn(RevenueCatVerifier.prototype, "verify")
      .mockResolvedValue(verified as never);
    await processNativeEvent(event.id, environment());
    expect(verifier).toHaveBeenCalledWith(event, "consumable", {
      refundKnown: false,
    });
    expect(rpc.mock.calls[1]?.slice(0, 2)).toEqual([
      "apply_verified_native_event",
      { p_id: event.id, p_verified: verified },
    ]);
  });
  it("quarantines ambiguous identities without granting or discarding the evidence", async () => {
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValueOnce({ event, state: "pending", kind: "consumable" })
      .mockResolvedValueOnce(null);
    vi.spyOn(RevenueCatVerifier.prototype, "verify").mockRejectedValue(
      new HttpError(409, "ownership mismatch"),
    );
    await processNativeEvent(event.id, environment());
    expect(rpc.mock.calls[1]?.slice(0, 2)).toEqual([
      "note_native_purchase_event_failure",
      {
        p_id: event.id,
        p_code: "identity_or_product_review",
        p_quarantine: true,
      },
    ]);
    expect(
      rpc.mock.calls.some(([name]) => name === "apply_verified_native_event"),
    ).toBe(false);
  });
  it("retries verification outages instead of treating them as a completed purchase", async () => {
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValueOnce({ event, state: "pending", kind: "consumable" })
      .mockResolvedValueOnce(null);
    vi.spyOn(RevenueCatVerifier.prototype, "verify").mockRejectedValue(
      new HttpError(503, "temporary"),
    );
    await expect(
      processNativeEvent(event.id, environment()),
    ).rejects.toMatchObject({ status: 503 });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_quarantine: false });
  });
  it("does not acknowledge if even quarantine persistence fails", async () => {
    vi.spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValueOnce({ event, state: "pending", kind: null })
      .mockRejectedValueOnce(new HttpError(503, "database unavailable"));
    await expect(
      processNativeEvent(event.id, environment()),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("acks an already-completed event exactly once and retries malformed messages", async () => {
    vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue({
      event,
      state: "completed",
      kind: "consumable",
    });
    const done = {
        body: { eventId: event.id },
        attempts: 1,
        ack: vi.fn(),
        retry: vi.fn(),
      },
      bad = {
        body: { unexpected: "value" },
        attempts: 1,
        ack: vi.fn(),
        retry: vi.fn(),
      };
    await consumeNativeEvents(
      { messages: [done, bad] } as unknown as MessageBatch<unknown>,
      environment(),
    );
    expect(done.ack).toHaveBeenCalledTimes(1);
    expect(done.retry).not.toHaveBeenCalled();
    expect(bad.ack).not.toHaveBeenCalled();
    expect(bad.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
  });
  it("retries rather than acking during a disabled reconciliation rollout", async () => {
    const message = {
      body: { eventId: event.id },
      attempts: 30,
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await consumeNativeEvents(
      { messages: [message] } as unknown as MessageBatch<unknown>,
      environment({ NATIVE_RECONCILIATION_ENABLED: "false" }),
    );
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 3600 });
  });
});
describe("privileged database transport", () => {
  it("cannot point staging at production or an arbitrary credential-collecting URL", () => {
    expect(
      () =>
        new NativeDatabase(
          environment({
            SUPABASE_PROJECT_REF: "sgsjkgfwgxmlqcgyuyeh",
            SUPABASE_URL: "https://sgsjkgfwgxmlqcgyuyeh.supabase.co",
          }),
        ),
    ).toThrow();
    expect(
      () =>
        new NativeDatabase(
          environment({ SUPABASE_URL: "https://attacker.invalid" }),
        ),
    ).toThrow();
  });
  it("uses a fixed RPC origin without following redirects or sending a fake secret-key bearer", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(null));
    await new NativeDatabase(environment(), fetcher).rpc(
      "note_native_purchase_event_failure",
      {},
      z.null(),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/note_native_purchase_event_failure",
      expect.objectContaining({ redirect: "error" }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "Authorization",
    );
  });
  it("does not leak SQL details and preserves retriable deployment failures", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { code: "55000", message: "PRIVATE SQL ACCOUNT DATA" },
        { status: 400 },
      ),
    );
    await expect(
      new NativeDatabase(environment(), fetcher).rpc(
        "get_native_purchase_event",
        {},
        z.null(),
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: "Native transaction could not be reconciled.",
    });
  });
});
