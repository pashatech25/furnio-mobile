import { z } from "zod";
export const positions = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export const fonts = [
  "Arial",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Courier New",
] as const;
// These proprietary font families are not bundled on Android. Use explicit
// native equivalents instead of silently rendering every choice as sans-serif.
export function nativeDisclosureFont(
  font: (typeof fonts)[number],
  platform: string,
) {
  if (platform !== "android") return font;
  if (font === "Georgia" || font === "Times New Roman") return "serif";
  if (font === "Courier New") return "monospace";
  return "sans-serif";
}
export const disclosureSchema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(80),
  fontFamily: z.enum(fonts),
  fontSize: z.number().min(14).max(72),
  opacity: z.number().min(0.15).max(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  position: z.enum(positions),
});
export type Disclosure = z.infer<typeof disclosureSchema>;
export const defaultDisclosure: Disclosure = {
  enabled: true,
  text: "Virtually Staged",
  fontFamily: "Arial",
  fontSize: 30,
  opacity: 0.9,
  color: "#ffffff",
  position: "bottom-right",
};
export function disclosureMargin(width: number, height: number) {
  return Math.min(Math.max(18, width * 0.025), Math.min(width, height) * 0.1);
}
export function fitDisclosureScale(
  width: number,
  height: number,
  measuredWidth: number,
  measuredHeight: number,
) {
  if (
    ![width, height, measuredWidth, measuredHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error("The disclosure text could not be measured.");
  const margin = disclosureMargin(width, height);
  return Math.min(
    1,
    Math.min(width * 0.82, width - margin * 2) / measuredWidth,
    (height - margin * 2) / measuredHeight,
  );
}
export function placement(
  settings: Disclosure,
  width: number,
  height: number,
  scale = 1,
) {
  const margin = disclosureMargin(width, height),
    size =
      Math.max(12, settings.fontSize * Math.max(0.65, width / 2048)) * scale;
  const [vertical, horizontal] = settings.position.split("-");
  return {
    x:
      horizontal === "left"
        ? margin
        : horizontal === "right"
          ? width - margin
          : width / 2,
    y: vertical === "top" ? margin + size : height - margin,
    size,
    anchor:
      horizontal === "left"
        ? ("start" as const)
        : horizontal === "right"
          ? ("end" as const)
          : ("middle" as const),
  };
}
