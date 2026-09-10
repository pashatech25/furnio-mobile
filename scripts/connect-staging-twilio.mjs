// Reads only the Auth Token explicitly copied from the verified Twilio account
// UI. No token is printed, persisted locally, rotated, or supplied in argv.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

assert.deepEqual(process.argv.slice(2), ["--connect-staging"]);
const staging = "bcrobmrimzkvfrnqarmv";
const production = "sgsjkgfwgxmlqcgyuyeh";
const account = process.env.TWILIO_ACCOUNT_SID;
assert(account && /^AC[0-9a-f]{32}$/i.test(account), "Set TWILIO_ACCOUNT_SID locally.");
const service = "VA0b419be90e12bd476afb6df4227f34f9";
const copied = spawnSync("/usr/bin/pbpaste", [], { encoding: "utf8", timeout: 5000 });
assert.equal(copied.status, 0);
const secret = copied.stdout.trim();
assert(/^[a-f0-9]{32}$/i.test(secret), "Copy the existing account Auth Token first; clipboard contents withheld.");
const auth = spawnSync("/usr/bin/security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8", timeout: 20000 });
assert.equal(auth.status, 0, "Supabase CLI login unavailable.");
let token = auth.stdout.trim();
const prefix = "go-keyring-base64:";
if (token.startsWith(prefix)) token = Buffer.from(token.slice(prefix.length), "base64").toString();
async function read(ref) {
  assert([staging, production].includes(ref));
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(20000),
  });
  assert(response.ok, `Auth read failed (${response.status}); response withheld.`);
  return response.json();
}
const source = await read(production);
const before = await read(staging);
assert(source.sms_provider === "twilio_verify" && source.sms_twilio_verify_account_sid === account && source.sms_twilio_verify_message_service_sid === service, "Production provider no longer matches the reviewed service; no write performed.");
assert(before.security_captcha_enabled && before.security_captcha_provider === "turnstile", "Staging CAPTCHA must be configured first.");
assert.equal(before.external_phone_enabled, false, "Staging SMS already enabled; inspect before rewriting.");
const check = await fetch(`https://verify.twilio.com/v2/Services/${service}`, {
  headers: { Authorization: `Basic ${Buffer.from(`${account}:${secret}`).toString("base64")}` },
  redirect: "error", signal: AbortSignal.timeout(20000),
});
assert(check.ok, `Twilio credential/service read failed (${check.status}); response withheld. No SMS sent.`);
const verified = await check.json();
assert(verified.account_sid === account && verified.sid === service, "Unexpected Twilio service; stop.");
const patch = {
  sms_provider: "twilio_verify", sms_twilio_verify_account_sid: account,
  sms_twilio_verify_message_service_sid: service, sms_twilio_verify_auth_token: secret,
  external_phone_enabled: true, sms_autoconfirm: false, sms_max_frequency: 60,
  sms_otp_length: 6, rate_limit_sms_sent: 6,
};
const result = await fetch(`https://api.supabase.com/v1/projects/${staging}/config/auth`, {
  method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(patch), redirect: "error", signal: AbortSignal.timeout(30000),
});
assert(result.ok, `Staging SMS configuration failed (${result.status}); response withheld.`);
await result.body?.cancel();
const after = await read(staging);
for (const [key, value] of Object.entries(patch))
  assert(key === "sms_twilio_verify_auth_token" ? !!after[key] : after[key] === value, `Staging check failed: ${key}; values withheld.`);
assert(Object.keys(before).filter(key => !(key in patch)).every(key => JSON.stringify(before[key]) === JSON.stringify(after[key])), "Unrelated staging settings changed concurrently.");
assert(JSON.stringify(await read(production)) === JSON.stringify(source), "Production settings changed concurrently; investigate.");
const current = spawnSync("/usr/bin/pbpaste", [], { encoding: "utf8", timeout: 5000 });
if (current.stdout.trim() === secret) spawnSync("/usr/bin/pbcopy", [], { input: "", timeout: 5000 });
console.log("Existing Twilio Verify credential authenticated. Staging SMS connected with confirmation required and six/hour limit. Production Auth and Twilio service untouched. No SMS sent; real delivery/OTP test pending.");
