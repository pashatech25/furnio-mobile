import { describe, expect, it } from "vitest";
import { demoExportUri } from "./demo-export";
describe("local native export test boundary", () => {
  it("accepts a local fixture only in a compiled demo", () => {
    const uri = "file:///app/cache/chosen-photo.jpg";
    expect(demoExportUri(true, uri)).toBe(uri);
    expect(() => demoExportUri(false, uri)).toThrow("unavailable");
  });
  it.each([
    "https://customer.invalid/signed-photo.jpg",
    "http://localhost/photo.jpg",
    "file://remote-server/photo.jpg",
    "data:image/jpeg;base64,hello",
    "file:///app/cache/photo.jpg?token=secret",
    "file:///app/cache/photo.jpg#fragment",
    "private-invalid-path",
  ])("rejects nonlocal or decorated fixture sources", (uri) => {
    expect(() => demoExportUri(true, uri)).toThrow("on-device");
  });
  it("requires a chosen local photo", () => {
    expect(() => demoExportUri(true, undefined)).toThrow("Choose a local");
  });
});
