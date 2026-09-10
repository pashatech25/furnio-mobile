import { expect, it } from "vitest";
import { fonts, nativeDisclosureFont } from "./disclosure-settings";

it.each([
  ["Arial", "sans-serif"],
  ["Helvetica", "sans-serif"],
  ["Georgia", "serif"],
  ["Times New Roman", "serif"],
  ["Courier New", "monospace"],
] as const)("uses Android's actual system font for %s", (name, expected) => {
  expect(nativeDisclosureFont(name, "android")).toBe(expected);
});

it.each(fonts)("preserves the existing iOS and web family %s", (name) => {
  expect(nativeDisclosureFont(name, "ios")).toBe(name);
  expect(nativeDisclosureFont(name, "web")).toBe(name);
});
