import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Image, PanResponder, Platform, Pressable, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { ImageManipulator } from "expo-image-manipulator";
import { Body, Button, colors, Field, Label, Notice, styles } from "../ui";
import { pathFor, type Stroke } from "./geometry";
import { createViewportGesture, initialViewport } from "./mask-viewport";
import type { LocalPhoto } from "../media";
import {
  captureMaskPng,
  decodeMaskDimensions,
  exportPaintRegions,
  type PaintRegion,
  type MaskExport,
} from "./mask-export";
import { MaskReview } from "./MaskReview";
export type { PaintRegion, MaskExport } from "./mask-export";
export type MaskHandle = {
  export: () => Promise<MaskExport[]>;
  snapshot: () => PaintRegion[];
};
const palette = [
  "#df6445",
  "#50a57a",
  "#5385d5",
  "#bd74ce",
  "#d6a33e",
  "#36a7ad",
  "#d981a2",
  "#8b815a",
];
export const MaskEditor = forwardRef<
  MaskHandle,
  {
    photo: LocalPhoto;
    custom: boolean;
    initialRegions?: PaintRegion[];
    onRegionsChange?: (regions: PaintRegion[]) => void;
    onDrawingChange?: (drawing: boolean) => void;
  }
>(function MaskEditor(
  { photo, custom, initialRegions, onRegionsChange, onDrawingChange },
  ref,
) {
  const scale = Math.min(1, 2048 / Math.max(photo.width, photo.height));
  const width = Math.round(photo.width * scale),
    height = Math.round(photo.height * scale);
  const [regions, setRegions] = useState<PaintRegion[]>(
    initialRegions?.length
      ? initialRegions
      : [
          {
            instruction: "",
            operation: custom ? "replace" : "remove",
            strokes: [],
          },
        ],
  );
  const [active, setActive] = useState(0);
  const onChange = useRef(onRegionsChange),
    firstRegions = useRef(true);
  onChange.current = onRegionsChange;
  useEffect(() => {
    if (firstRegions.current) {
      firstRegions.current = false;
      return;
    }
    onChange.current?.(regions);
  }, [regions]);
  const [brush, setBrush] = useState(52);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [viewport, setViewport] = useState(initialViewport);
  const viewportRef = useRef(viewport);
  const [magnifier, setMagnifier] = useState(true);
  const view = (next: typeof viewport) => { viewportRef.current = next; setViewport(next); };
  const drawingChange = useRef(onDrawingChange);
  drawingChange.current = onDrawingChange;
  useEffect(
    () => () => {
      // A replaced photo/unmounted editor must never leave its page unscrollable.
      drawingChange.current?.(false);
    },
    [],
  );
  const binary = useRef<(Svg | null)[]>([]),
    composite = useRef<(Svg | null)[]>([]);
  const responder = useMemo(
    () =>
      PanResponder.create(
        createViewportGesture({
          layout,
          brush,
          getView: () => viewportRef.current,
          view,
          preview: setDrawing,
          drawing: (painting) => drawingChange.current?.(painting),
          commit: (stroke) => {
            setRegions((current) =>
              current.map((region, index) =>
                index === active
                  ? { ...region, strokes: [...region.strokes, stroke] }
                  : region,
              ),
            );
          },
        }),
      ),
    [active, brush, layout],
  );
  const strokes = (list: Stroke[], color: string) =>
    list.map((stroke, index) =>
      stroke.points.length === 1 ? (
        <Circle
          key={index}
          cx={stroke.points[0]!.x * width}
          cy={stroke.points[0]!.y * height}
          r={stroke.size / 2}
          fill={color}
        />
      ) : (
        <Path
          key={index}
          d={pathFor(stroke, width, height)}
          stroke={color}
          strokeWidth={stroke.size}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ),
    );
  async function exportMasks() {
    if (Platform.OS === "web")
      throw new Error(
        "Full-resolution mask export must be tested in the native development build. The browser preview is design-only.",
      );
    return exportPaintRegions(
      regions,
      custom,
      { width, height },
      (kind, index) => {
        const svg = (kind === "binary" ? binary : composite).current[index];
        return captureMaskPng(
          svg ? (callback, size) => svg.toDataURL(callback, size) : null,
          (uri) =>
            // This RN Android version's getSize uses Fresco's encoded pipeline,
            // which rejects data: URIs. Decode the PNG in memory instead; retain
            // the passing iOS path and exact decoded-dimension checks.
            Platform.OS === "android"
              ? decodeMaskDimensions(() => ImageManipulator.manipulate(uri))
              : Image.getSize(uri),
          { width, height },
        );
      },
    );
  }
  useImperativeHandle(
    ref,
    () => ({ snapshot: () => regions, export: exportMasks }),
    [regions, width, height, custom],
  );
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        Paint with one finger. Pinch to zoom; move with two fingers. Lift both
        fingers before painting again. Scroll outside the photo.
      </Notice>
      <View style={styles.between}>
        <Label>{Math.round(viewport.zoom * 100)}% zoom</Label>
        <Pressable accessibilityRole="button" onPress={() => view(initialViewport)} style={{ padding: 12 }}><Body>Reset view</Body></Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: magnifier }} onPress={() => setMagnifier(value => !value)} style={{ padding: 12 }}><Body>Precision {magnifier ? "on" : "off"}</Body></Pressable>
      </View>
      <View
        testID="mask-paint-surface"
        onLayout={(event) => setLayout(event.nativeEvent.layout)}
        {...responder.panHandlers}
        style={{
          aspectRatio: photo.width / photo.height,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: colors.soft,
        }}
      >
        <View pointerEvents="none" style={{ position: "absolute", left: viewport.x, top: viewport.y, width: layout.width * viewport.zoom, height: layout.height * viewport.zoom }}>
          <Image
            source={{ uri: photo.uri }}
            style={{ width: "100%", height: "100%" }}
          />
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", top: 0, left: 0, opacity: 0.55 }}
        >
          {regions.map((region, index) => (
            <React.Fragment key={index}>
              {strokes(region.strokes, palette[index]!)}
              {index === active &&
                drawing &&
                strokes([drawing], palette[index]!)}
            </React.Fragment>
          ))}
        </Svg>
        </View>
      </View>
      {magnifier && drawing && layout.width > 0 && (() => {
        const point = drawing.points[drawing.points.length - 1]!;
        const zoom = Math.max(2.5, viewport.zoom * 1.5);
        return <View pointerEvents="none" accessibilityLabel="Magnified brush preview" style={{ position: "absolute", right: 12, top: 0, width: 156, height: 116, borderRadius: 16, overflow: "hidden", borderWidth: 2, borderColor: colors.paper, backgroundColor: colors.ink, elevation: 12, shadowOpacity: 0.2, shadowRadius: 12 }}>
          <View style={{ position: "absolute", left: 78 - point.x * layout.width * zoom, top: 58 - point.y * layout.height * zoom, width: layout.width * zoom, height: layout.height * zoom }}>
            <Image source={{ uri: photo.uri }} style={{ width: "100%", height: "100%" }} />
            <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", opacity: 0.55 }}>
              {regions.map((region, index) => <React.Fragment key={index}>{strokes(region.strokes, palette[index]!)}{index === active && strokes([drawing], palette[index]!)}</React.Fragment>)}
            </Svg>
          </View>
          <Svg width={156} height={116} style={{ position: "absolute" }}><Circle cx={78} cy={58} r={Math.max(2, brush / width * layout.width * zoom / 2)} fill="none" stroke={colors.paper} strokeWidth={1.5} /></Svg>
        </View>;
      })()}
      <Label>Brush · {Math.round(brush)} px</Label>
      <Slider
        minimumValue={12}
        maximumValue={160}
        value={brush}
        onValueChange={setBrush}
        minimumTrackTintColor={colors.ink}
        thumbTintColor={colors.ink}
        accessibilityLabel="Brush size"
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            title="Undo"
            onPress={() =>
              setRegions((current) =>
                current.map((region, index) =>
                  index === active
                    ? { ...region, strokes: region.strokes.slice(0, -1) }
                    : region,
                ),
              )
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            title="Clear region"
            onPress={() =>
              setRegions((current) =>
                current.map((region, index) =>
                  index === active ? { ...region, strokes: [] } : region,
                ),
              )
            }
          />
        </View>
      </View>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {regions.map((_, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: index === active }}
            key={index}
            onPress={() => setActive(index)}
            style={{
              padding: 13,
              borderRadius: 12,
              backgroundColor: index === active ? colors.ink : colors.soft,
            }}
          >
            <Body
              style={{
                fontSize: 13,
                color: index === active ? colors.paper : colors.ink,
              }}
            >
              Region {index + 1}
            </Body>
          </Pressable>
        ))}
      </View>
      {custom && (
        <View style={[styles.row, { flexWrap: "wrap" }]}>
          {(["replace", "restyle", "remove"] as const).map((operation) => (
            <Pressable
              key={operation}
              accessibilityRole="button"
              onPress={() =>
                setRegions((current) =>
                  current.map((region, index) =>
                    index === active ? { ...region, operation } : region,
                  ),
                )
              }
              style={{
                padding: 12,
                backgroundColor:
                  regions[active]?.operation === operation
                    ? colors.soft
                    : colors.paper,
                borderRadius: 10,
              }}
            >
              <Body style={{ fontSize: 13 }}>{operation}</Body>
            </Pressable>
          ))}
        </View>
      )}
      <Field
        label={
          custom
            ? "What should change in this region?"
            : "Describe the object (optional)"
        }
        multiline
        maxLength={600}
        value={regions[active]?.instruction ?? ""}
        onChangeText={(instruction) =>
          setRegions((current) =>
            current.map((region, index) =>
              index === active ? { ...region, instruction } : region,
            ),
          )
        }
      />
      <Button
        secondary
        title="Add another region"
        disabled={regions.length >= 8}
        onPress={() => {
          setRegions((current) => [
            ...current,
            {
              instruction: "",
              operation: custom ? "replace" : "remove",
              strokes: [],
            },
          ]);
          setActive(regions.length);
        }}
      />
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: -10000, width: 1, height: 1 }}
      >
        {regions.map((region, index) => (
          <React.Fragment key={index}>
            <Svg
              ref={(value) => {
                binary.current[index] = value;
              }}
              width={1}
              height={1}
              viewBox={`0 0 ${width} ${height}`}
            >
              <Rect width={width} height={height} fill="#000" />
              {strokes(region.strokes, "#fff")}
            </Svg>
            <Svg
              ref={(value) => {
                composite.current[index] = value;
              }}
              width={1}
              height={1}
              viewBox={`0 0 ${width} ${height}`}
            >
              {strokes(region.strokes, "#fff")}
            </Svg>
          </React.Fragment>
        ))}
      </View>
      <MaskReview
        photo={photo}
        exportMasks={exportMasks}
        dimensions={{ width, height }}
      />
    </View>
  );
});
