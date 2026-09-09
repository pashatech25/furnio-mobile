// Local-only viewer for Expo's compiled React Native Web design preview.
// It serves dist, never source files, .env, or files in another project.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
await stat(resolve(root, "index.html"));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1:4340").pathname,
    );
    const target = resolve(root, `.${pathname}`);
    if (!target.startsWith(root + sep) && target !== root)
      throw new Error("Outside preview root");
    let file = target;
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (
        extname(pathname) ||
        pathname.startsWith("/_expo/") ||
        pathname.startsWith("/assets/")
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      file = resolve(root, "index.html");
    }
    const bytes = await readFile(file);
    response.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    response.setHeader("Content-Length", bytes.length);
    response.writeHead(200);
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(400);
    response.end();
  }
}).listen(4340, "127.0.0.1", () =>
  console.log("Furnio native-components preview: http://127.0.0.1:4340/"),
);
