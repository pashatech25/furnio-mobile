import { z } from "zod";
import { serviceIds } from "./service-ids";
const point = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
const region = z.object({
  instruction: z.string().max(600),
  operation: z.enum(["remove", "replace", "restyle"]),
  strokes: z
    .array(
      z.object({
        size: z.number().positive().max(160),
        points: z.array(point).max(5000),
      }),
    )
    .max(200),
});
const photo = z.object({
  uri: z.string(),
  name: z.string().max(255),
  contentType: z.enum(["image/jpeg", "application/pdf"]),
  bytes: z
    .number()
    .positive()
    .max(20 * 1024 * 1024),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const draftSchema = z.object({
  version: z.literal(2),
  generation: z.uuid(),
  userId: z.uuid(),
  service: z.enum(serviceIds),
  savedAt: z.number(),
  projectId: z.uuid(),
  files: z.array(photo).max(4),
  furniture: z.array(photo).max(5),
  pins: z.array(point.nullable()).max(5),
  anchor: z.number().int().min(0).max(3),
  roomType: z.string().max(80),
  style: z.string().max(80),
  mood: z.string().max(80),
  direction: z.string().max(600),
  preset: z.enum(["pink_twilight", "blue_hour", "natural_dusk"]),
  options: z
    .array(
      z.enum(["clean_driveway", "green_grass", "blue_sky", "remove_leaves"]),
    )
    .max(4),
  maskRegions: z.array(region).max(8),
});
export type Draft = z.infer<typeof draftSchema>;
export type DraftInput = Omit<
  Draft,
  "version" | "generation" | "userId" | "service" | "savedAt"
>;
