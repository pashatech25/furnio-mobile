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
export function placement(settings: Disclosure, width: number, height: number) {
  const margin = Math.max(18, width * 0.025),
    size = settings.fontSize * Math.max(0.65, width / 2048);
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
