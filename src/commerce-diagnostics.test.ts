import { beforeEach, describe, expect, it, vi } from "vitest";
const write = vi.hoisted(() => vi.fn());
vi.mock("expo-file-system", () => ({ Paths: { cache: "cache" }, File: class { write = write; } }));
beforeEach(() => { vi.resetModules(); write.mockReset(); });
describe("local purchase diagnostics", () => {
  it("records only allowlisted gate values and counts", async () => {
    const { recordCommerceDiagnostic } = await import("./commerce-diagnostics");
    recordCommerceDiagnostic("billing", { catalogCount: 6, acquisitionEnabled: true, ...{ token: "secret", email: "private" } });
    const output = write.mock.calls[0][0];
    expect(JSON.parse(output)[0].fields).toEqual({ catalogCount: 6, acquisitionEnabled: true });
    expect(output).not.toContain("secret"); expect(output).not.toContain("private");
  });
  it("bounds storage and never interrupts purchase loading on storage failure", async () => {
    const { recordCommerceDiagnostic } = await import("./commerce-diagnostics");
    for (let i = 0; i < 40; i++) recordCommerceDiagnostic("opened");
    expect(JSON.parse(write.mock.calls.at(-1)![0])).toHaveLength(30);
    write.mockImplementation(() => { throw new Error("disk unavailable"); });
    expect(() => recordCommerceDiagnostic("failed")).not.toThrow();
  });
});
