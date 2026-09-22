import { File, Paths } from "expo-file-system";

type Stage = "opened" | "capabilities" | "billing" | "store-request" | "store-result" | "failed";
type Fields = { buildEnabled?: boolean; configured?: boolean; signedIn?: boolean; billingReady?: boolean;
  commerceReady?: boolean; acquisitionEnabled?: boolean; catalogCount?: number; storeCount?: number };
const entries: { stage: Stage; at: string; fields: Fields }[] = [];

/** Local bounded diagnostic only: no identity, tokens, receipts, URLs or raw errors. */
export function recordCommerceDiagnostic(stage: Stage, fields: Fields = {}) {
  const safe: Fields = {};
  for (const key of ["buildEnabled", "configured", "signedIn", "billingReady", "commerceReady", "acquisitionEnabled"] as const)
    if (typeof fields[key] === "boolean") safe[key] = fields[key];
  for (const key of ["catalogCount", "storeCount"] as const)
    if (Number.isSafeInteger(fields[key]) && fields[key]! >= 0) safe[key] = fields[key];
  entries.push({ stage, at: new Date().toISOString(), fields: safe });
  if (entries.length > 30) entries.shift();
  try {
    new File(Paths.cache, "furnio-commerce-diagnostic.json").write(JSON.stringify(entries));
  } catch { /* Diagnostic storage failure must never affect purchases. */ }
}
