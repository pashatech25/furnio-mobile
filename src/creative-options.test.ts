import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { roomTypeOptions, furnitureStyleOptions, moodOptions, twilightVisualOptions } from "./creative-options";
const web = resolve(process.cwd(), "../AI Virtual Staging/apps/web/src/lib/creative-options.ts");
describe("web creative-control parity", () => {
  it("shows all three web twilight presets as visual choices", () => {
    expect(twilightVisualOptions.map(option => option.value)).toEqual(["pink_twilight", "blue_hour", "natural_dusk"]);
    const studio = readFileSync(resolve(process.cwd(), "app/studio/[service].tsx"), "utf8");
    expect(studio).toContain('options={twilightVisualOptions}');
    expect(studio).toContain('disabled={busy} showAll');
  });
  it.skipIf(!existsSync(web))("keeps every value, label and visual identical to the web catalogue", () => {
    const options = (source: string) => source.slice(source.indexOf("const image ="));
    expect(options(readFileSync(resolve(process.cwd(), "src/creative-options.ts"), "utf8")).trim()).toBe(options(readFileSync(web, "utf8")).trim());
  });
  it("includes all rooms, styles and moods with the web's empty preference value", () => {
    expect(roomTypeOptions).toHaveLength(10);
    expect(furnitureStyleOptions).toHaveLength(14);
    expect(moodOptions).toHaveLength(7);
    expect(furnitureStyleOptions[0].value).toBe("");
    expect(furnitureStyleOptions.find(option => option.label === "Minimalist")?.value).toBe("Minimalist staging");
  });
  it("does not replace selections with editable room/style/mood text fields", () => {
    const studio = readFileSync(resolve(process.cwd(), "app/studio/[service].tsx"), "utf8");
    expect(studio).not.toContain('label="Style (editable)"');
    for (const label of ["Room type", "Furniture style", "Mood"]) expect(studio).toContain(`<VisualChoiceRail label="${label}"`);
  });
});
