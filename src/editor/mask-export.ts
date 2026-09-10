import { strokeBounds, type Stroke } from "./geometry";

export type PaintRegion = {
  instruction: string;
  operation: "remove" | "replace" | "restyle";
  strokes: Stroke[];
};
export type MaskExport = {
  bbox: ReturnType<typeof strokeBounds>;
  instruction: string;
  operation: PaintRegion["operation"];
  regionIndex: number;
  binary: string;
  composite: string;
};
type Dimensions = { width: number; height: number };
type Renderer = (
  callback: (value: string) => void,
  dimensions: Dimensions,
) => void;

type DecodedMask = Dimensions & { release: () => void };
type MaskDecoder = {
  renderAsync: () => Promise<DecodedMask>;
  release: () => void;
};

/** Decode pixels in memory, without saveAsync or an unmanaged temporary file. */
export async function decodeMaskDimensions(create: () => MaskDecoder) {
  let decoder: MaskDecoder | undefined;
  let image: DecodedMask | undefined;
  try {
    decoder = create();
    image = await decoder.renderAsync();
    return { width: image.width, height: image.height };
  } finally {
    // Also release a late decode after captureMaskPng's caller has timed out.
    // Never release the context while its native decode is still running.
    try {
      image?.release();
    } catch {
      // Do not replace the original result or skip releasing its context.
    }
    try {
      decoder?.release();
    } catch {
      // Native references also participate in SDK garbage collection.
    }
  }
}

/** Native pixels must decode at the requested size before a mask is usable. */
export function captureMaskPng(
  render: Renderer | null,
  measure: (uri: string) => Promise<Dimensions>,
  dimensions: Dimensions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!render) return reject(new Error("Mask renderer is not ready."));
    if (
      ![dimensions.width, dimensions.height].every(
        (value) => Number.isInteger(value) && value > 0 && value <= 2048,
      )
    )
      return reject(new Error("Mask dimensions are invalid."));
    let settled = false;
    let received = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("Mask export timed out."), 10_000);
    try {
      render((value) => {
        if (settled || received) return;
        received = true;
        if (
          typeof value !== "string" ||
          !value.startsWith("iVBORw0KGgo") ||
          value.length > Math.ceil((5 * 1024 * 1024) / 3) * 4 ||
          value.length % 4 !== 0 ||
          (value.length / 4) * 3 -
            (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0) >
            5 * 1024 * 1024 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
        ) {
          fail("Mask renderer did not return a valid PNG.");
          return;
        }
        // A data URI only: no file is written and no remote image is loaded.
        void Promise.resolve()
          .then(() => measure(`data:image/png;base64,${value}`))
          .then((actual) => {
            if (settled) return;
            if (
              actual.width !== dimensions.width ||
              actual.height !== dimensions.height
            ) {
              fail("Mask export dimensions do not match the photo.");
              return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(value);
          })
          .catch(() => fail("The exported mask could not be opened."));
      }, dimensions);
    } catch {
      fail("The mask renderer could not prepare this selection.");
    }
  });
}

export async function exportPaintRegions(
  regions: readonly PaintRegion[],
  custom: boolean,
  dimensions: Dimensions,
  capture: (kind: "binary" | "composite", index: number) => Promise<string>,
): Promise<MaskExport[]> {
  if (regions.length > 8) throw new Error("Use no more than eight regions.");
  const painted = regions.flatMap((region, regionIndex) =>
    region.strokes.some((stroke) => stroke.points.length)
      ? [{ region, regionIndex }]
      : [],
  );
  if (!painted.length) throw new Error("Paint at least one area on the photo.");
  if (custom && painted.some(({ region }) => !region.instruction.trim()))
    throw new Error("Describe the change for every painted region.");
  const results: MaskExport[] = [];
  for (const { region, regionIndex } of painted) {
    results.push({
      bbox: strokeBounds(region.strokes, dimensions.width, dimensions.height),
      instruction: region.instruction,
      operation: region.operation,
      regionIndex,
      binary: await capture("binary", regionIndex),
      composite: await capture("composite", regionIndex),
    });
  }
  return results;
}
