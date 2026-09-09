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
import { Body, Button, colors, Field, Label, Notice, styles } from "../ui";
import {
  normalizedPoint,
  pathFor,
  strokeBounds,
  type Stroke,
} from "./geometry";
import type { LocalPhoto } from "../media";
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
  }
>(function MaskEditor({ photo, custom, initialRegions, onRegionsChange }, ref) {
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
  const liveStroke = useRef<Stroke | null>(null);
  const binary = useRef<(Svg | null)[]>([]),
    composite = useRef<(Svg | null)[]>([]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const stroke = {
            size: brush,
            points: [
              normalizedPoint(
                event.nativeEvent.locationX,
                event.nativeEvent.locationY,
                layout.width,
                layout.height,
              ),
            ],
          };
          liveStroke.current = stroke;
          setDrawing(stroke);
        },
        onPanResponderMove: (event) => {
          if (liveStroke.current) {
            liveStroke.current = {
              ...liveStroke.current,
              points: [
                ...liveStroke.current.points,
                normalizedPoint(
                  event.nativeEvent.locationX,
                  event.nativeEvent.locationY,
                  layout.width,
                  layout.height,
                ),
              ],
            };
            setDrawing(liveStroke.current);
          }
        },
        onPanResponderRelease: () => {
          const stroke = liveStroke.current;
          if (stroke)
            setRegions((current) =>
              current.map((region, index) =>
                index === active
                  ? { ...region, strokes: [...region.strokes, stroke] }
                  : region,
              ),
            );
          liveStroke.current = null;
          setDrawing(null);
        },
        onPanResponderTerminate: () => {
          liveStroke.current = null;
          setDrawing(null);
        },
      }),
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
  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => regions,
      export: async () => {
        if (Platform.OS === "web")
          throw new Error(
            "Full-resolution mask export must be tested in the native development build. The browser preview is design-only.",
          );
        const capture = (svg: Svg | null | undefined) =>
          new Promise<string>((resolve, reject) => {
            if (!svg) {
              reject(new Error("Mask renderer is not ready."));
              return;
            }
            const timer = setTimeout(
              () => reject(new Error("Mask export timed out.")),
              10_000,
            );
            svg.toDataURL(
              (value) => {
                clearTimeout(timer);
                resolve(value);
              },
              { width, height },
            );
          });
        const results: MaskExport[] = [];
        for (const [index, region] of regions.entries()) {
          if (!region.strokes.length) continue;
          if (custom && !region.instruction.trim())
            throw new Error("Describe the change for every painted region.");
          results.push({
            bbox: strokeBounds(region.strokes, width, height),
            instruction: region.instruction,
            operation: region.operation,
            regionIndex: index,
            binary: await capture(binary.current[index]),
            composite: await capture(composite.current[index]),
          });
        }
        if (!results.length)
          throw new Error("Paint at least one area on the photo.");
        return results;
      },
    }),
    [regions, width, height, custom],
  );
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        Paint on the photo. Undo removes the last stroke; clear resets the
        selected region.
      </Notice>
      <View
        onLayout={(event) => setLayout(event.nativeEvent.layout)}
        {...responder.panHandlers}
        style={{
          aspectRatio: photo.width / photo.height,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: colors.soft,
        }}
      >
        <Image
          source={{ uri: photo.uri }}
          style={{ width: "100%", height: "100%" }}
        />
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", opacity: 0.55 }}
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
    </View>
  );
});
