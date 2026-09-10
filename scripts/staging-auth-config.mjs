// Staging-only Auth configuration. Production is a read-only source of provider
// settings; secret values never enter console output or Expo configuration.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const staging = "bcrobmrimzkvfrnqarmv";
const production = "sgsjkgfwgxmlqcgyuyeh";
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert(["--inspect", "--configure-native-callbacks", "--disable-unconnected-sms", "--clear-unusable-provider-fingerprints", "--connect-staging-google", "--connect-staging-smtp"].includes(mode));
const credential = spawnSync("/usr/bin/security", [
  "find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w",
], { encoding: "utf8", timeout: 20_000 });
assert.equal(credential.status, 0, "Existing Supabase CLI login unavailable.");
let token = credential.stdout.trim();
const prefix = "go-keyring-base64:";
if (token.startsWith(prefix)) token = Buffer.from(token.slice(prefix.length), "base64").toString();
assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(token), "Unexpected credential format.");
const publicKeys = new Set([
  "site_url", "uri_allow_list", "disable_signup", "mailer_autoconfirm",
  "external_email_enabled", "external_phone_enabled", "external_google_enabled",
  "external_apple_enabled", "sms_provider", "sms_autoconfirm", "sms_otp_length",
  "sms_max_frequency", "rate_limit_email_sent", "rate_limit_sms_sent",
  "security_captcha_enabled", "mailer_secure_email_change_enabled",
  "external_google_client_id", "smtp_host",
]);
const configurations = new Map();
async function readConfig(ref) {
  assert([staging, production].includes(ref));
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok, `Auth config read failed (${response.status}); response withheld.`);
  return response.json();
}
for (const ref of [staging, production]) {
  const config = await readConfig(ref);
  configurations.set(ref, config);
  if (mode !== "--inspect") continue;
  console.log(JSON.stringify({
    ref,
    settings: Object.fromEntries(Object.entries(config).filter(([key]) => publicKeys.has(key))),
    configured: Object.fromEntries(Object.entries(config)
      .filter(([key]) => /^(smtp_|sms_twilio|external_google_client|external_google_secret|external_apple_client|external_apple_secret|hook_send_sms)/.test(key))
      .map(([key, value]) => [key, Boolean(value)])),
  }, null, 2));
}
if (mode !== "--inspect") {
  const source = configurations.get(production);
  const before = configurations.get(staging);
  assert.equal(source.sms_provider, "twilio_verify");
  const redirects = new Set((before.uri_allow_list ?? "").split(",").filter(Boolean));
  for (const uri of ["furnio://auth/callback", "furnio://auth/callback?type=recovery", "furnio://auth/deletion-callback"])
    redirects.add(uri);
  const patch = {
    rate_limit_sms_sent: 6,
    mailer_subjects_confirmation: "Confirm your Furnio test account",
    mailer_subjects_recovery: "Reset your Furnio test account password",
    mailer_autoconfirm: false,
    mailer_allow_unverified_email_sign_ins: false,
    sms_provider: "twilio_verify",
    sms_autoconfirm: false,
    sms_max_frequency: 60,
    sms_otp_length: 6,
    external_phone_enabled: false,
    external_apple_enabled: true,
    external_apple_client_id: "ai.furnio.app",
    uri_allow_list: [...redirects].join(","),
    site_url: "https://furnio-mobile-staging.amidi-alipasha.workers.dev",
  };
  // Deliberately no production PATCH, no secret files and no auto-confirm bypass.
  let google;
  let smtp;
  if (mode === "--connect-staging-smtp") {
    const rows = readFileSync("/Users/alipashaamidi/Downloads/smtp-credentials.csv", "utf8").trim().split(/\r?\n/).map((line) => line.split(",").map((value) => value.replace(/^"|"$/g, "")));
    smtp = Object.fromEntries(rows[0].map((key, index) => [key, rows[1][index]]));
    assert(smtp["SMTP Endpoint"] === source.smtp_host && smtp.Username === source.smtp_user, "SMTP file does not belong to the existing Furnio sender.");
    // Authenticate only, without sending any email. Credentials travel over
    // stdin and TLS, never command arguments, output, or additional files.
    const check = spawnSync("/usr/bin/python3", ["-c", `import sys,json,smtplib,ssl
v=json.load(sys.stdin)
try:
 s=smtplib.SMTP(v['SMTP Endpoint'],int(v['Port']),timeout=15)
 s.ehlo();s.starttls(context=ssl.create_default_context());s.ehlo()
 code,_=s.login(v['Username'],v['Password']);s.quit()
 print(json.dumps({'authenticated':code==235}))
except Exception:
 print(json.dumps({'authenticated':False}))
`], { input: JSON.stringify(smtp), encoding: "utf8", timeout: 25_000 });
    assert(check.status === 0 && JSON.parse(check.stdout).authenticated, "SMTP credential verification failed; details withheld.");
  }
  if (mode === "--connect-staging-google") {
    google = JSON.parse(readFileSync("/Users/alipashaamidi/Downloads/client_secret_2_377332047247-jumk9v3g3nvsauj4thb7jfrn6kgc8re4.apps.googleusercontent.com (1).json", "utf8")).web;
    assert(google?.client_id === source.external_google_client_id && google.project_id === "freehomevalue", "Wrong Google client file.");
    assert(google.client_secret?.startsWith("GOCSPX-"), "Google client secret unavailable.");
    // Both existing secrets remain enabled in Google. Validate this downloaded
    // credential with Google without creating a user, rotating a secret, or
    // changing production. Supabase's masked fingerprint is not a credential.
    assert(["sRML", "_9z-"].some((suffix) => google.client_secret.endsWith(suffix)), "Downloaded secret is not one of the enabled Google secrets.");
    const credentialCheck = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: google.client_id, client_secret: google.client_secret,
        grant_type: "authorization_code", code: "furnio-staging-invalid-code-credential-check",
        redirect_uri: `https://${staging}.supabase.co/auth/v1/callback` }),
      signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    const result = await credentialCheck.json();
    assert(result.error === "invalid_grant", "Google did not accept this credential; response withheld.");
  }
  const appliedPatch = mode === "--connect-staging-google" ? { external_google_enabled: true, external_google_client_id: google.client_id, external_google_secret: google.client_secret }
    : mode === "--connect-staging-smtp" ? { smtp_host: smtp["SMTP Endpoint"], smtp_port: smtp.Port, smtp_user: smtp.Username, smtp_pass: smtp.Password,
      smtp_admin_email: source.smtp_admin_email, smtp_sender_name: "Furnio test app", smtp_max_frequency: 60, rate_limit_email_sent: 15 }
    : mode === "--disable-unconnected-sms" ? { external_phone_enabled: false }
    : mode === "--clear-unusable-provider-fingerprints" ? { smtp_host: "", smtp_user: "", smtp_pass: "", sms_twilio_verify_auth_token: "", external_phone_enabled: false }
    : patch;
  const response = await fetch(`https://api.supabase.com/v1/projects/${staging}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(appliedPatch), redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000).replace(/[A-Za-z0-9_\/=+-]{20,}/g, "[REDACTED]");
    throw new Error(`Staging Auth update failed (${response.status}): ${detail}`);
  }
  await response.body?.cancel();
  const after = await readConfig(staging);
  for (const [key, value] of Object.entries(appliedPatch)) {
    if (["external_google_secret", "smtp_pass"].includes(key)) {
      assert(typeof after[key] === "string" && after[key].length > 0, "Staging provider secret not configured.");
    } else {
      assert(value === "" ? !after[key] : JSON.stringify(after[key]) === JSON.stringify(value), `Staging verification failed: ${key}; values withheld.`);
    }
  }
  assert(JSON.stringify(await readConfig(production)) === JSON.stringify(source), "Production Auth changed during this operation; inspect concurrent changes.");
  console.log(mode === "--connect-staging-google" ? "Staging Google provider configured with an existing Google-validated credential. Production Supabase Auth unchanged. User sign-in still needs to be exercised." : mode === "--connect-staging-smtp" ? "Staging email connected to the verified existing Furnio SMTP credential. No email sent; delivery still needs testing. Production unchanged." : mode === "--disable-unconnected-sms" ? "Staging phone provider disabled until usable credentials are supplied. Production unchanged; no SMS sent." : "Staging configuration verified. Provider delivery remains untested; production unchanged.");
}
