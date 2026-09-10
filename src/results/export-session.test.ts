import { describe, expect, it, vi } from "vitest";
import {
  createExportSession,
  ExportCleanupPendingError,
} from "./export-session";
function file(exists = true) {
  const f = {
    exists,
    delete: vi.fn(() => {
      f.exists = false;
    }),
  };
  return f;
}
describe("owned temporary export files", () => {
  it("clears every owned copy after success and never touches unowned originals", async () => {
    const session = createExportSession(),
      input = file(),
      output = file(),
      original = file();
    await session.run(async (own) => {
      own(input);
      own(output);
    });
    expect(input.delete).toHaveBeenCalledOnce();
    expect(output.delete).toHaveBeenCalledOnce();
    expect(original.delete).not.toHaveBeenCalled();
    expect(session.active).toBe(false);
    expect(session.pending).toBe(0);
  });
  it("does not delete files while native sharing is still using them", async () => {
    const session = createExportSession(),
      output = file();
    let finish!: () => void;
    const share = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const operation = session.run(async (own) => {
      own(output);
      await share;
    });
    expect(session.active).toBe(true);
    session.cleanup();
    expect(output.delete).not.toHaveBeenCalled();
    const repeated = vi.fn();
    expect(await session.run(repeated)).toBe(false);
    expect(repeated).not.toHaveBeenCalled();
    finish();
    await operation;
    expect(output.delete).toHaveBeenCalledOnce();
  });
  it("preserves the primary failure and clears other files when one deletion fails", async () => {
    const session = createExportSession(),
      first = file(),
      second = file();
    first.delete.mockImplementation(() => {
      throw new Error("private-file-path");
    });
    const primary = new Error("Share was cancelled");
    await expect(
      session.run(async (own) => {
        own(first);
        own(second);
        throw primary;
      }),
    ).rejects.toBe(primary);
    expect(second.delete).toHaveBeenCalledOnce();
    expect(session.active).toBe(false);
    expect(session.pending).toBe(1);
    first.delete.mockImplementation(() => {
      first.exists = false;
    });
    expect(session.cleanup()).toBe(0);
  });
  it("reports pending cleanup after success without claiming a successful save failed", async () => {
    const session = createExportSession(),
      output = file();
    output.delete.mockImplementation(() => {
      throw new Error("locked");
    });
    expect(
      await session.run(async (own) => {
        own(output);
      }),
    ).toBe(true);
    expect(session.pending).toBe(1);
    expect(session.active).toBe(false);
  });
  it("blocks accumulating more copies if cleanup still fails, then allows retry", async () => {
    const session = createExportSession(),
      output = file(),
      next = vi.fn(async () => undefined);
    output.delete.mockImplementation(() => {
      throw new Error("locked");
    });
    await session.run(async (own) => {
      own(output);
    });
    await expect(session.run(next)).rejects.toBeInstanceOf(
      ExportCleanupPendingError,
    );
    expect(next).not.toHaveBeenCalled();
    output.delete.mockImplementation(() => {
      output.exists = false;
    });
    expect(await session.run(next)).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });
  it("checks each file even when reading existence throws", async () => {
    const session = createExportSession(),
      second = file();
    const unreadable = {
      get exists(): boolean {
        throw new Error("denied");
      },
      delete: vi.fn(),
    };
    await session.run(async (own) => {
      own(unreadable);
      own(second);
    });
    expect(second.exists).toBe(false);
    expect(session.pending).toBe(1);
    expect(unreadable.delete).not.toHaveBeenCalled();
  });
  it("tracks partial files before writing and handles missing/duplicate handles", async () => {
    const session = createExportSession(),
      partial = file(false);
    await expect(
      session.run(async (own) => {
        own(partial);
        own(partial);
        partial.exists = true;
        throw new Error("disk full during write");
      }),
    ).rejects.toThrow("disk full during write");
    expect(partial.delete).toHaveBeenCalledOnce();
    const absent = file(false);
    await session.run(async (own) => {
      own(absent);
    });
    expect(absent.delete).not.toHaveBeenCalled();
    expect(session.pending).toBe(0);
  });
  it("retains a silently failed deletion for retry", async () => {
    const session = createExportSession(),
      output = file();
    output.delete.mockImplementation(() => undefined);
    await session.run(async (own) => {
      own(output);
    });
    expect(session.pending).toBe(1);
  });
});
