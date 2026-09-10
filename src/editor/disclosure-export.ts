import { defaultDisclosure, disclosureSchema } from "./disclosure-settings";

export type PhotoDimensions = { width: number; height: number };
export class DisclosureExportError extends Error {}

export function validatedDisclosure(input: unknown) {
  // Hidden label fields may be mid-edit. An explicitly disabled label must not
  // block an unlabelled JPEG; the original controls remain untouched in state.
  const toggle = disclosureSchema.pick({ enabled: true }).safeParse(input);
  if (toggle.success && !toggle.data.enabled)
    return { ...defaultDisclosure, enabled: false };
  const result = disclosureSchema.safeParse(input);
  if (result.success) return result.data;
  if (result.error.issues.some((issue) => issue.path[0] === "text"))
    throw new DisclosureExportError(
      "Use no more than 80 characters for the disclosure text.",
    );
  if (result.error.issues.some((issue) => issue.path[0] === "color"))
    throw new DisclosureExportError(
      "Enter a six-digit label color, such as #ffffff.",
    );
  throw new DisclosureExportError(
    "Choose a supported disclosure font, position, size and opacity, then try again.",
  );
}

export function assertPhotoDimensions(value: PhotoDimensions) {
  if (
    ![value.width, value.height].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    !Number.isSafeInteger(value.width * value.height)
  )
    throw new DisclosureExportError("The photo dimensions are invalid.");
}

export function assertSamePhotoSize(
  actual: PhotoDimensions,
  expected: PhotoDimensions,
) {
  assertPhotoDimensions(actual);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new DisclosureExportError(
      "The exported photo lost resolution. Nothing was saved or shared.",
    );
}

// Check the PNG envelope before writing it. The native JPEG conversion below
// still has to decode the entire image; a matching header alone is not a pass.
export function assertCapturedPhoto(data: string, expected: PhotoDimensions) {
  assertPhotoDimensions(expected);
  if (
    typeof data !== "string" ||
    data.length < 44 ||
    data.length % 4 !== 0 ||
    data.length >
      Math.ceil((expected.width * expected.height * 5 + 1024 * 1024) / 3) * 4
  )
    throw new DisclosureExportError(
      "The photo renderer returned an invalid image.",
    );
  let header: string;
  try {
    header = atob(data.slice(0, 44));
  } catch {
    throw new DisclosureExportError(
      "The photo renderer returned an invalid image.",
    );
  }
  if (
    header.slice(0, 8) !== "\x89PNG\r\n\x1a\n" ||
    header.slice(8, 16) !== "\0\0\0\rIHDR"
  )
    throw new DisclosureExportError(
      "The photo renderer returned an invalid image.",
    );
  const uint = (offset: number) =>
    Array.from(header.slice(offset, offset + 4)).reduce(
      (value, char) => value * 256 + char.charCodeAt(0),
      0,
    );
  assertSamePhotoSize({ width: uint(16), height: uint(20) }, expected);
}

type CaptureOptions = {
  dimensions: PhotoDimensions;
  signal: AbortSignal;
  frame: (work: () => void) => () => void;
  render: (done: (data: string) => void, size: PhotoDimensions) => void;
};

/** A request owns its callbacks; old image loads cannot start a newer export. */
export function createDisclosureCapture(options: CaptureOptions) {
  const dimensions = {
    width: options.dimensions.width,
    height: options.dimensions.height,
  };
  let settled = false;
  let started = false;
  let cancelFrame: (() => void) | undefined;
  const ready = new Set<"image" | "text">();
  let resolve!: (data: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const finish = (data?: string, error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      cancelFrame?.();
    } catch {
      /* Still settle and detach the abort handler. */
    }
    options.signal.removeEventListener("abort", abort);
    if (error) reject(error);
    else resolve(data!);
  };
  const fail = (message: string) =>
    finish(undefined, new DisclosureExportError(message));
  const abort = () => fail("Photo export was cancelled.");
  const timer = setTimeout(
    () => fail("The photo renderer timed out. Please try again."),
    15_000,
  );
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  try {
    assertPhotoDimensions(dimensions);
  } catch (error) {
    finish(undefined, error as Error);
  }
  return {
    promise,
    fail: () =>
      fail("The disclosure text could not be measured. Please try again."),
    ready(part: "image" | "text") {
      if (settled || started) return;
      ready.add(part);
      if (ready.size !== 2) return;
      started = true;
      try {
        cancelFrame = options.frame(() => {
          if (settled) return;
          try {
            options.render((data) => {
              if (settled) return;
              try {
                assertCapturedPhoto(data, dimensions);
                finish(data);
              } catch (error) {
                finish(undefined, error as Error);
              }
            }, dimensions);
          } catch {
            fail("The photo renderer could not prepare this image.");
          }
        });
      } catch {
        fail("The photo renderer could not prepare this image.");
      }
    },
  };
}

type SavedPhoto = PhotoDimensions & { uri: string; base64?: string };
type NativeImage = PhotoDimensions & {
  saveAsync: (options: {
    compress: number;
    base64: boolean;
  }) => Promise<SavedPhoto>;
  release: () => void;
};
type NativeContext = {
  renderAsync: () => Promise<NativeImage>;
  release: () => void;
};

/** Never release a native image while its asynchronous write is still running. */
export async function prepareDisclosureJpeg(
  create: () => NativeContext,
  ownSaved: (uri: string) => void,
  signal: AbortSignal,
  options: { base64: boolean; compress: number; expected?: PhotoDimensions },
) {
  if (signal.aborted)
    throw new DisclosureExportError("Photo export was cancelled.");
  let context: NativeContext | undefined;
  let image: NativeImage | undefined;
  try {
    context = create();
    image = await context.renderAsync();
    if (signal.aborted)
      throw new DisclosureExportError("Photo export was cancelled.");
    const decodedSize = { width: image.width, height: image.height };
    assertPhotoDimensions(decodedSize);
    if (options.expected) assertSamePhotoSize(decodedSize, options.expected);
    const saved = await image.saveAsync({
      compress: options.compress,
      base64: options.base64,
    });
    ownSaved(saved.uri); // including a write which finished after cancellation
    if (signal.aborted)
      throw new DisclosureExportError("Photo export was cancelled.");
    assertSamePhotoSize(saved, decodedSize);
    if (options.expected) assertSamePhotoSize(saved, options.expected);
    if (options.base64 && !saved.base64)
      throw new DisclosureExportError(
        "The photo could not be prepared for disclosure.",
      );
    return saved;
  } finally {
    // A release failure must not mask the original result or skip the other ref.
    try {
      image?.release();
    } catch {
      /* SDK memory will also be garbage collected. */
    }
    try {
      context?.release();
    } catch {
      /* Do not expose a native file path. */
    }
  }
}
