// Read-only compiler comparison: remove ONLY this native-billing slice in memory,
// preserving unrelated current working-tree files. Never rewrite main sources.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const main = resolve(root, "../AI Virtual Staging");
const api = resolve(main, "apps/api");
process.chdir(api);
const require = createRequire(resolve(api, "package.json"));
const ts = require("typescript");
const configPath = resolve(api, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error("Cannot read API compiler configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, api);
const added = new Set(
  [
    "src/lib/result-source.ts",
    "src/routes/result-source.test.ts",
    "src/lib/mobile-credit-quote.ts",
    "src/lib/mobile-credit-quote.test.ts",
    "src/routes/mobile-credit-quote.test.ts",
    "src/lib/native-billing.ts",
    "src/lib/native-billing.test.ts",
    "src/lib/customer-purchase-intent.ts",
    "src/lib/customer-purchase-intent.test.ts",
    "src/lib/stripe-checkout-recovery.ts",
    "src/lib/stripe-checkout-recovery.test.ts",
    "src/routes/focus-checkout-recovery.test.ts",
    "src/routes/billing-native.test.ts",
  ].map((p) => resolve(api, p)),
);
const replaced = new Map(
  [
    "src/index.ts",
    "src/routes/jobs.ts",
    "src/routes/batches.ts",
    "src/routes/billing.ts",
    "src/routes/focus.ts",
    "worker-configuration.d.ts",
  ].map((p) => [
    resolve(api, p),
    execFileSync("git", ["show", `HEAD:apps/api/${p}`], {
      cwd: main,
      encoding: "utf8",
    }),
  ]),
);
function errors(baseline) {
  const host = ts.createCompilerHost(parsed.options);
  const originalRead = host.readFile;
  host.readFile = (path) =>
    baseline && replaced.has(resolve(path))
      ? replaced.get(resolve(path))
      : originalRead(path);
  const roots = parsed.fileNames.filter(
    (path) => !baseline || !added.has(resolve(path)),
  );
  const program = ts.createProgram(
    roots,
    { ...parsed.options, noEmit: true, incremental: false },
    host,
  );
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => {
      const at = d.file?.getLineAndCharacterOfPosition(d.start ?? 0);
      return `${d.file ? relative(api, d.file.fileName) : "config"}:${at ? at.line + 1 : 0}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
    })
    .sort();
}
const current = errors(false);
const baseline = errors(true);
assert.deepEqual(
  current,
  baseline,
  "This native compatibility slice must not introduce compiler errors",
);
console.log(
  `Same ${current.length} diagnostics with and without the native billing slice (in-memory comparison).`,
);
console.log(current.join("\n"));
