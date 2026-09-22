import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reference-furniture preview framing", () => {
  it("overrides bundled-image intrinsic dimensions for both animated room layers", () => {
    const source = readFileSync("src/ReferencePreview.tsx", "utf8");
    expect(source).toMatch(/room:\s*\{[^}]*width: "100%", height: "100%"/);
    expect(source).toMatch(/reference-before\.jpg[^\n]*resizeMode="cover"[^\n]*style=\{styles.room\}/);
    expect(source).toMatch(/reference-after\.jpg[^\n]*resizeMode="cover"[^\n]*styles.room/);
    expect(source).toContain('require("../assets/service-previews/reference-sofa.png")');
    expect(source).toContain('require("../assets/service-previews/reference-table.png")');
  });
  it("also sizes the static service poster so reduced-motion and loading states are not zoomed", () => {
    const source = readFileSync("src/ServicePhoto.tsx", "utf8");
    expect(source).toMatch(/<Image source=\{service.image\} resizeMode="cover"[^\n]*width: "100%", height: "100%"/);
    expect(source).toContain("aspectRatio: 4 / 3");
  });
});
