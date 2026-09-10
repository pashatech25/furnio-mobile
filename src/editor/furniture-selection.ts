import type { LocalPhoto } from "../media";
import type { Point } from "./geometry";
import { clamp } from "./geometry";

export function nudgeFurniturePin(
  pin: Point,
  direction: "up" | "down" | "left" | "right",
) {
  if (![pin.x, pin.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
    throw new Error("Place this piece on the photo first.");
  return {
    x: clamp(
      pin.x + (direction === "left" ? -0.05 : direction === "right" ? 0.05 : 0),
    ),
    y: clamp(
      pin.y + (direction === "up" ? -0.05 : direction === "down" ? 0.05 : 0),
    ),
  };
}
export function appendFurniture(current: LocalPhoto[], picked: LocalPhoto[]) {
  if (current.length + picked.length > 5)
    throw new Error("Use no more than five furniture photos.");
  const next = [...current, ...picked];
  if (new Set(next.map((photo) => photo.uri)).size !== next.length)
    throw new Error("That furniture photo is already selected.");
  return next;
}
export function removeFurniture(
  current: LocalPhoto[],
  pins: (Point | null | undefined)[],
  index: number,
  active: number,
) {
  if (!Number.isInteger(index) || index < 0 || index >= current.length)
    throw new Error("Select a furniture piece to remove.");
  const furniture = current.filter((_, i) => i !== index);
  const placements = current.flatMap((_, i) =>
    i === index ? [] : [pins[i] ?? null],
  );
  return {
    furniture,
    pins: placements,
    active: Math.max(
      0,
      Math.min(furniture.length - 1, active > index ? active - 1 : active),
    ),
  };
}
