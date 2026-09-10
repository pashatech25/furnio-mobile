import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "../contracts/uploads";
import { serviceIds, type ServiceId } from "../service-ids";
import {
  studioRequest,
  validateStudioInput,
  type StudioInput,
} from "./studio-input";
import {
  appendFurniture,
  nudgeFurniturePin,
  removeFurniture,
} from "./furniture-selection";
import { normalizedPoint } from "./geometry";
import type { PaintRegion } from "./mask-export";

const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
const photo = (name: string) => ({
  uri: `file:///picker/${name}.jpg`,
  name: `${name}.jpg`,
  bytes: 100,
  contentType: "image/jpeg" as const,
  width: 4000,
  height: 3000,
});
function form(service: ServiceId = "virtual_staging"): StudioInput {
  return {
    projectId: a,
    files:
      service === "multiview"
        ? [photo("room"), photo("room-2")]
        : [photo("room")],
    furniture:
      service === "reference_furniture" ? [photo("chair"), photo("table")] : [],
    pins: [
      { x: 0.2, y: 0.7 },
      { x: 0.8, y: 0.75 },
    ],
    anchor: 0,
    roomType: "Living room",
    style: "Warm contemporary",
    mood: "",
    direction: "",
    preset: "blue_hour",
    options: ["blue_sky"],
  };
}
const painted: PaintRegion[] = [
  {
    instruction: "Remove chair",
    operation: "remove",
    strokes: [{ size: 20, points: [{ x: 0.5, y: 0.5 }] }],
  },
];

describe("native studio preflight", () => {
  it.each(serviceIds)(
    "accepts valid %s inputs before any upload",
    (service) => {
      expect(() =>
        validateStudioInput(service, form(service), painted),
      ).not.toThrow();
    },
  );
  it.each([0, -1, NaN, Infinity, MAX_UPLOAD_BYTES + 1])(
    "rejects invalid file size %s before upload",
    (bytes) => {
      const input = form();
      input.files[0]!.bytes = bytes;
      expect(() => validateStudioInput("virtual_staging", input)).toThrow(
        "20 MB",
      );
    },
  );
  it.each(["", " ", "x".repeat(256)])("rejects invalid file name", (name) => {
    const input = form();
    input.files[0]!.name = name;
    expect(() => validateStudioInput("virtual_staging", input)).toThrow(
      "file name",
    );
  });
  it("accepts an exact-limit single PDF for floor plan, never for other services", () => {
    const input = form("floor_plan");
    input.files = [
      {
        ...photo("plan"),
        bytes: MAX_UPLOAD_BYTES,
        contentType: "application/pdf",
        width: 1,
        height: 1,
      },
    ];
    expect(() => validateStudioInput("floor_plan", input)).not.toThrow();
    expect(() => validateStudioInput("virtual_staging", input)).toThrow(
      "Only floor plans",
    );
    expect(studioRequest("floor_plan", input, [b], [], [])).toEqual({
      assetId: b,
    });
  });
  it("does not claim to inspect PDF page count locally", () => {
    // A valid metadata envelope is not certification of PDF contents/pages.
    const input = form("floor_plan");
    input.files = [
      { ...photo("multipage-server-rejects"), contentType: "application/pdf" },
    ];
    expect(() => validateStudioInput("floor_plan", input)).not.toThrow();
  });
  it("rejects unreadable JPEG dimensions", () => {
    const input = form();
    input.files[0]!.width = NaN;
    expect(() => validateStudioInput("virtual_staging", input)).toThrow(
      "dimensions",
    );
  });
  it("rejects no source, multiple single sources and missing project", () => {
    expect(() =>
      validateStudioInput("floor_plan", { ...form(), files: [] }),
    ).toThrow("one source");
    expect(() => validateStudioInput("floor_plan", form("multiview"))).toThrow(
      "one source",
    );
    expect(() =>
      validateStudioInput("floor_plan", { ...form(), projectId: "" }),
    ).toThrow("project");
  });
  it.each([
    { roomType: " " },
    { style: "s".repeat(81) },
    { mood: "m".repeat(81) },
    { direction: "d".repeat(601) },
  ])("validates staging text with helpful feedback", (change) => {
    expect(() =>
      validateStudioInput("virtual_staging", { ...form(), ...change }),
    ).toThrow(/Enter a room|Keep/);
  });
  it("rejects no exterior selection and duplicated improvements", () => {
    for (const options of [
      [],
      ["blue_sky", "blue_sky"],
    ] as StudioInput["options"][])
      expect(() =>
        validateStudioInput("exterior_enhancement", { ...form(), options }),
      ).toThrow("Choose at least one");
  });
  it("validates multiview count, duplicate selection and design anchor", () => {
    expect(() => validateStudioInput("multiview", form())).toThrow("2–4");
    expect(() =>
      validateStudioInput("multiview", {
        ...form("multiview"),
        files: [photo("same"), photo("same")],
      }),
    ).toThrow("different");
    for (const anchor of [-1, 0.5, 2, NaN])
      expect(() =>
        validateStudioInput("multiview", { ...form("multiview"), anchor }),
      ).toThrow("design anchor");
    expect(
      studioRequest(
        "multiview",
        { ...form("multiview"), anchor: 1 },
        [b, c],
        [],
        [],
      ),
    ).toMatchObject({ assetIds: [b, c], anchorAssetId: c });
  });
  it("requires a finite in-bounds pin for every reference piece, including sparse selections", () => {
    for (const pins of [
      [{ x: 0.2, y: 0.2 }],
      [null, { x: 0.2, y: 0.2 }],
      [
        { x: NaN, y: 0.2 },
        { x: 0.4, y: 0.5 },
      ],
      [
        { x: 1.01, y: 0.2 },
        { x: 0.4, y: 0.5 },
      ],
    ])
      expect(() =>
        validateStudioInput("reference_furniture", {
          ...form("reference_furniture"),
          pins,
        }),
      ).toThrow("Place every");
  });
  it("requires 1–5 distinct references separate from the room and JPEG-only", () => {
    const input = form("reference_furniture");
    expect(() =>
      validateStudioInput("reference_furniture", { ...input, furniture: [] }),
    ).toThrow("1–5");
    expect(() =>
      validateStudioInput("reference_furniture", {
        ...input,
        furniture: Array(6).fill(photo("chair")),
      }),
    ).toThrow("1–5");
    expect(() =>
      validateStudioInput("reference_furniture", {
        ...input,
        furniture: [photo("room")],
      }),
    ).toThrow("separate");
    expect(() =>
      validateStudioInput("reference_furniture", {
        ...input,
        furniture: [{ ...photo("chair"), contentType: "application/pdf" }],
      }),
    ).toThrow("JPEG");
  });
  it("binds actual uploaded reference IDs to their own pins", () => {
    const input = form("reference_furniture");
    expect(
      studioRequest("reference_furniture", input, [a], [b, c], []),
    ).toEqual({
      assetId: a,
      direction: "",
      furnitureAssetIds: [b, c],
      placements: [
        { furnitureAssetId: b, ...input.pins[0] },
        { furnitureAssetId: c, ...input.pins[1] },
      ],
    });
    expect(() =>
      studioRequest("reference_furniture", input, [a], [b], []),
    ).toThrow("do not match");
    expect(() =>
      studioRequest("reference_furniture", input, [a], [b, b], []),
    ).toThrow();
    expect(() =>
      studioRequest("reference_furniture", input, [a], [a, b], []),
    ).toThrow();
  });
  it("requires painted regions and custom instructions before demo or upload", () => {
    expect(() => validateStudioInput("item_removal", form(), [])).toThrow(
      "Paint at least",
    );
    expect(() =>
      validateStudioInput("custom_staging", form(), [
        { ...painted[0]!, instruction: " " },
      ]),
    ).toThrow("Describe the change");
    expect(() =>
      validateStudioInput("item_removal", form(), [
        { ...painted[0]!, operation: "replace" },
      ]),
    ).toThrow("must use Remove");
    expect(() =>
      validateStudioInput("custom_staging", form(), [
        { ...painted[0]!, instruction: "x".repeat(601) },
      ]),
    ).toThrow("600");
  });
  it("does not transmit local URIs, phantom validation IDs, prices or master prompts", () => {
    const input = {
      ...form(),
      masterPrompt: "override",
      credits: 0,
      provider: "fal",
    };
    validateStudioInput("virtual_staging", input);
    const request = studioRequest("virtual_staging", input, [b], [], []);
    expect(request).toEqual({
      assetId: b,
      roomType: input.roomType,
      style: input.style,
      mood: "",
      direction: "",
    });
    expect(JSON.stringify(request)).not.toMatch(
      /file:|validation-only|00000000|masterPrompt|provider|credits/,
    );
  });
  it("wires preflight before demo and upload, without clearing an uncertain request on photo selection", () => {
    const source = readFileSync(
      new URL("../../app/studio/[service].tsx", import.meta.url),
      "utf8",
    );
    const submit = source.slice(source.indexOf("async function submit()"));
    expect(submit.indexOf("validateStudioInput(")).toBeLessThan(
      submit.indexOf("if (demo)"),
    );
    expect(submit.indexOf("validateStudioInput(")).toBeLessThan(
      submit.indexOf("await uploadPhoto("),
    );
    const picker = source.slice(
      source.indexOf("async function select("),
      source.indexOf("async function submit("),
    );
    expect(picker).not.toContain("setUncertain(false)");
    // Uncertainty can now be resolved by the durable receipt checker, never by picking new photos.
    expect(submit).toMatch(
      /locked.current\s*\|\|\s*uncertain\s*\|\|\s*recoveryBlocked/,
    );
    expect(submit.indexOf("submissionJournal.load(")).toBeLessThan(
      submit.indexOf("await uploadPhoto("),
    );
    expect(submit).toContain("submitWithReceipt({");
  });
});

describe("reference furniture selection", () => {
  it("provides bounded directional placement without requiring a touch gesture", () => {
    expect(nudgeFurniturePin({ x: 0.5, y: 0.5 }, "down")).toEqual({
      x: 0.5,
      y: 0.55,
    });
    expect(nudgeFurniturePin({ x: 0.5, y: 0.5 }, "up")).toEqual({
      x: 0.5,
      y: 0.45,
    });
    expect(nudgeFurniturePin({ x: 0, y: 1 }, "left")).toEqual({ x: 0, y: 1 });
    expect(nudgeFurniturePin({ x: 1, y: 0 }, "right")).toEqual({ x: 1, y: 0 });
    expect(() => nudgeFurniturePin({ x: NaN, y: 0.5 }, "down")).toThrow();
  });
  it("appends without replacing or mutating existing pieces", () => {
    const first = [photo("chair")];
    const next = appendFurniture(first, [photo("table")]);
    expect(first).toHaveLength(1);
    expect(next).toEqual([photo("chair"), photo("table")]);
  });
  it("enforces five pieces and prevents duplicate selected paths", () => {
    expect(() => appendFurniture([photo("chair")], [photo("chair")])).toThrow(
      "already selected",
    );
    expect(() =>
      appendFurniture(
        [1, 2, 3, 4, 5].map((n) => photo(String(n))),
        [photo("extra")],
      ),
    ).toThrow("five");
  });
  it("removes just the selected piece and reindexes the correct pins", () => {
    const input = form("reference_furniture");
    const next = removeFurniture(input.furniture, input.pins, 0, 1);
    expect(next).toEqual({
      furniture: [photo("table")],
      pins: [input.pins[1]],
      active: 0,
    });
    expect(input.pins).toHaveLength(2);
  });
  it("keeps unplaced holes aligned and handles removing the final piece", () => {
    const refs = [photo("chair"), photo("table"), photo("lamp")];
    const next = removeFurniture(refs, [undefined, { x: 0.5, y: 0.8 }], 1, 1);
    expect(next.pins).toEqual([null, null]);
    expect(next.active).toBe(1);
    expect(removeFurniture([refs[0]!], [null], 0, 0)).toEqual({
      furniture: [],
      pins: [],
      active: 0,
    });
  });
  it.each([-1, 0.5, 99, NaN])("rejects invalid removal index %s", (index) =>
    expect(() => removeFurniture([photo("chair")], [], index, 0)).toThrow(),
  );
  it.each([
    [NaN, 0, 100, 100],
    [0, Infinity, 100, 100],
    [0, 0, NaN, 100],
    [0, 0, 100, Infinity],
  ])("rejects invalid pin geometry", (...geometry) =>
    expect(() =>
      normalizedPoint(...(geometry as [number, number, number, number])),
    ).toThrow("not ready"),
  );
});
