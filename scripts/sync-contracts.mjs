// Deliberate, read-only import from the existing web repository. Never writes upstream.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const upstream =
  process.env.FURNIO_CONTRACT_SOURCE ?? resolve(root, "../AI Virtual Staging");
const names = ["jobs.ts", "uploads.ts", "auth.ts"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(
    await readFile(resolve(root, "src/contracts/manifest.json"), "utf8"),
  );
  for (const name of names) {
    const content = await readFile(resolve(root, "src/contracts", name));
    if (hash(content) !== manifest.files[name])
      throw new Error(
        `Modified frozen contract: ${name}. Re-import and review, do not hand-edit.`,
      );
  }
  console.log("Frozen customer API contracts verified.");
} else if (process.argv.includes("--write")) {
  await mkdir(resolve(root, "src/contracts"), { recursive: true });
  const files = {};
  for (const name of names) {
    const content = await readFile(
      resolve(upstream, "packages/shared/src", name),
    );
    files[name] = hash(content);
    await writeFile(resolve(root, "src/contracts", name), content);
  }
  await writeFile(
    resolve(root, "src/contracts/manifest.json"),
    JSON.stringify(
      {
        source: "pashatech25/furnio-main",
        baselineCommit: "19908507ecb032abaa38b07df49648e677dd880c",
        note: "Validated working-tree contract snapshot; jobs.ts includes additive opt-in result source metadata. uploads.ts includes pre-existing uncommitted reference-furniture work. Import does not modify upstream files.",
        files,
      },
      null,
      2,
    ) + "\n",
  );
  await mkdir(resolve(root, "assets"), { recursive: true });
  for (const [source, destination] of Object.entries({
    "icon-512.png": "icon.png",
    "service-previews/stage.jpg": "stage.jpg",
    "service-previews/twilight.jpg": "twilight.jpg",
    "service-previews/floor-plan/after.jpg": "floor.jpg",
    "service-previews/reference-furniture/before.jpg": "before.jpg",
    "service-previews/reference-furniture/after.jpg": "after.jpg",
    "service-previews/remove.jpg": "remove.jpg",
    "service-previews/custom.jpg": "custom.jpg",
    "service-previews/multiview.jpg": "multiview.jpg",
    "service-previews/winter-to-summer.jpg": "summer.jpg",
    "service-previews/exterior-enhancement.jpg": "exterior.jpg",
  })) {
    await copyFile(
      resolve(upstream, "apps/web/public", source),
      resolve(root, "assets", destination),
    );
  }
  const logo = await readFile(
    resolve(upstream, "apps/web/public/furnio-wordmark-ink.svg"),
    "utf8",
  );
  await writeFile(
    resolve(root, "src/brand.ts"),
    `// Existing Furnio artwork; do not replace with a typed approximation.\nexport const wordmark = ${JSON.stringify(logo)};\n`,
  );
  console.log("Imported versioned contracts and existing Furnio brand assets.");
} else throw new Error("Use --check or --write");
