import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deliverExpo,
  manageDevice,
  notificationsReady,
  privacySafeMessage,
  processNotifications,
} from "./notifications";
import { NativeDatabase } from "./native-events";
import worker from "./index";
const id = "11111111-1111-4111-8111-111111111111";
const lease = "22222222-2222-4222-8222-222222222222";
const token = "ExpoPushToken[fixture_notification_token]";
const env = {
  ENVIRONMENT: "staging",
  MOBILE_ENABLED: "true",
  MOBILE_NOTIFICATIONS_ENABLED: "true",
  EXPO_PROJECT_ID: id,
  EXPO_ACCESS_TOKEN: "secret-fixture-not-real",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture_not_real",
} as Env;
const send = { phase: "send" as const, pushToken: token, ticketId: null };
const receipt = { phase: "receipt" as const, pushToken: token, ticketId: id };
afterEach(() => vi.restoreAllMocks());
function request(body: unknown, path = "/v1/devices") {
  return new Request(`https://mobile.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const installation = {
  installationId: id,
  installationSecret: "a".repeat(64),
  revision: 2,
};
const registration = {
  ...installation,
  pushToken: token,
  platform: "ios",
  projectId: id,
};
describe("privacy-safe notifications Worker", () => {
  it("fails closed without flags, project or enhanced-security token", () => {
    expect(notificationsReady(env)).toBe(true);
    for (const override of [
      { MOBILE_NOTIFICATIONS_ENABLED: "false" },
      { MOBILE_ENABLED: "false" },
      { EXPO_PROJECT_ID: "" },
      { EXPO_ACCESS_TOKEN: "" },
    ])
      expect(notificationsReady({ ...env, ...override })).toBe(false);
  });
  it("disabled background processing contacts neither database nor Expo", async () => {
    const db = new NativeDatabase(env),
      rpc = vi.spyOn(db, "rpc"),
      fetcher = vi.fn();
    await processNotifications(
      { ...env, MOBILE_NOTIFICATIONS_ENABLED: "false" },
      db,
      fetcher,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("hashes the installation capability and uses only server customer identity", async () => {
    const db = new NativeDatabase(env),
      rpc = vi.spyOn(db, "rpc").mockResolvedValue({ enabled: true });
    expect(
      await manageDevice(request(registration), "register", lease, env, db),
    ).toEqual({ enabled: true });
    const body = rpc.mock.calls[0]![1];
    expect(body.p_user).toBe(lease);
    expect(body.p_secret_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.p_secret_hash).not.toBe(installation.installationSecret);
    expect(JSON.stringify(body)).not.toContain("installationSecret");
  });
  it("allows narrow disable during rollback and with no customer session", async () => {
    const db = new NativeDatabase(env),
      rpc = vi.spyOn(db, "rpc").mockResolvedValue({ enabled: false });
    await manageDevice(
      request(installation, "/v1/devices/disable"),
      "disable",
      null,
      {
        ...env,
        MOBILE_ENABLED: "false",
        MOBILE_NOTIFICATIONS_ENABLED: "false",
      },
      db,
    );
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_action: "disable",
      p_user: null,
      p_token: null,
    });
  });
  it.each([
    { ...registration, userId: lease },
    { ...registration, projectId: lease },
    { ...registration, pushToken: "https://evil.example" },
    { ...registration, revision: 0 },
    { ...registration, installationSecret: "short" },
  ])("rejects untrusted registration fields", async (body) => {
    const db = new NativeDatabase(env),
      rpc = vi.spyOn(db, "rpc");
    await expect(
      manageDevice(request(body), "register", id, env, db),
    ).rejects.toMatchObject({ status: expect.any(Number) });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires authentication for prepare/register and rejects browser disable", async () => {
    for (const path of ["/v1/devices", "/v1/devices/prepare"])
      expect(
        (await worker.fetch(request(installation, path), env)).status,
      ).toBe(401);
    const req = request(installation, "/v1/devices/disable");
    req.headers.set("Origin", "https://evil.example");
    expect((await worker.fetch(req, env)).status).toBe(403);
  });
  it("uses generic content and only the fixed Activity route", () => {
    const payload = privacySafeMessage(token);
    expect(payload.data).toEqual({ type: "furnio.activity", version: 1 });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "to",
        "title",
        "body",
        "data",
        "channelId",
        "sound",
        "ttl",
        "collapseId",
        "tag",
      ].sort(),
    );
    expect(payload.ttl).toBe(3600);
  });
  it("sends only to the fixed Expo origin with a server-side credential", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ data: { status: "ok", id } }),
    );
    expect(await deliverExpo(send, env, fetcher)).toEqual({
      result: "sent",
      ticket: id,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
        }),
      }),
    );
  });
  it("checks receipts, not treating ticket acceptance as device delivery", async () => {
    expect(
      await deliverExpo(
        receipt,
        env,
        vi.fn(async () => Response.json({ data: { [id]: { status: "ok" } } })),
      ),
    ).toEqual({ result: "accepted" });
    expect(
      await deliverExpo(
        receipt,
        env,
        vi.fn(async () => Response.json({ data: {} })),
      ),
    ).toEqual({ result: "missing", code: "receipt_missing" });
  });
  it.each([
    ["DeviceNotRegistered", "invalid", "unregistered"],
    ["MessageRateExceeded", "resend", "transient"],
    ["InvalidCredentials", "failed", "credentials"],
    ["MismatchSenderId", "failed", "credentials"],
    ["MessageTooBig", "failed", "invalid_payload"],
    ["SurpriseProviderMessage", "failed", "unknown_provider_error"],
  ])("sanitizes provider error %s", async (code, result, safeCode) => {
    expect(
      await deliverExpo(
        receipt,
        env,
        vi.fn(async () =>
          Response.json({
            data: {
              [id]: {
                status: "error",
                message: "PRIVATE",
                details: { error: code, token },
              },
            },
          }),
        ),
      ),
    ).toEqual({ result, code: safeCode });
  });
  it.each([429, 500, 503])(
    "retries HTTP %s with durable backoff",
    async (status) => {
      expect(
        await deliverExpo(
          send,
          env,
          vi.fn(async () => new Response("PRIVATE", { status })),
        ),
      ).toEqual({ result: "retry", code: "transient" });
    },
  );
  it("bounds invalid responses and network failures without logging raw data", async () => {
    for (const fetcher of [
      vi.fn(async () => {
        throw new Error(token);
      }),
      vi.fn(async () => new Response("x".repeat(20_000))),
      vi.fn(async () =>
        Response.json({ data: { status: "ok", id: "invalid" } }),
      ),
    ])
      expect(await deliverExpo(send, env, fetcher)).toEqual({
        result: "retry",
        code: "transient",
      });
  });
  it("rechecks a queued recipient and skips cancelled or switched installations", async () => {
    const db = new NativeDatabase(env),
      rpc = vi
        .spyOn(db, "rpc")
        .mockResolvedValueOnce([{ id, leaseId: lease }])
        .mockResolvedValueOnce(null),
      fetcher = vi.fn();
    await processNotifications(env, db, fetcher);
    expect(rpc.mock.calls[1]![0]).toBe("read_mobile_push_delivery");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("continues after one failure and logs counts without identities or tokens", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined),
      db = new NativeDatabase(env);
    const rpc = vi
      .spyOn(db, "rpc")
      .mockResolvedValueOnce([
        { id, leaseId: lease },
        { id: lease, leaseId: id },
      ])
      .mockRejectedValueOnce(new Error(token))
      .mockResolvedValueOnce(send)
      .mockResolvedValueOnce(null);
    await processNotifications(
      env,
      db,
      vi.fn(async () => Response.json({ data: { status: "ok", id } })),
    );
    expect(rpc.mock.calls.at(-1)![0]).toBe("finish_mobile_push_delivery");
    const logs = JSON.stringify(log.mock.calls);
    expect(logs).toContain("errors");
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(id);
  });
});
