import { useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, colors, Heading, Kicker, Label } from "../ui";
import type { LocalPhoto } from "../media";
import type { MaskExport } from "./mask-export";

/** Uses the real exporter, in memory only. No upload, purchase or job API. */
export function MaskReview({
  photo,
  exportMasks,
  dimensions,
}: {
  photo: LocalPhoto;
  exportMasks: () => Promise<MaskExport[]>;
  dimensions: { width: number; height: number };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [masks, setMasks] = useState<MaskExport[]>([]);
  const [selected, setSelected] = useState(0);
  const [binary, setBinary] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  function close() {
    generation.current++;
    setOpen(false);
    setBusy(false);
    setMasks([]);
    setError("");
  }
  async function review() {
    const current = ++generation.current;
    setMasks([]);
    setSelected(0);
    setBinary(false);
    setError("");
    setBusy(true);
    setOpen(true);
    try {
      const result = await exportMasks();
      if (mounted.current && current === generation.current) setMasks(result);
    } catch (reason) {
      if (mounted.current && current === generation.current)
        setError(
          reason instanceof Error ? reason.message : "Please try again.",
        );
    } finally {
      if (mounted.current && current === generation.current) setBusy(false);
    }
  }
  const mask = masks[selected];
  if (Platform.OS === "web") return null;
  return (
    <>
      <Button
        secondary
        title="Review selection"
        busy={busy}
        onPress={() => void review()}
      />
      {open && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={close}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
              <Kicker>On-device mask review</Kicker>
              <Heading small>Check your selection.</Heading>
              <Body muted>
                No upload or credit charge. This shows the actual mask prepared
                for your edit, not an AI result.
              </Body>
              {busy && <Body>Preparing your painted regions…</Body>}
              {!!error && <Body>{error}</Body>}
              {!!masks.length && (
                <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                  {masks.map((item, index) => (
                    <Pressable
                      key={item.regionIndex}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selected === index }}
                      onPress={() => setSelected(index)}
                      style={{
                        padding: 13,
                        borderRadius: 12,
                        backgroundColor:
                          selected === index ? colors.ink : colors.soft,
                      }}
                    >
                      <Body
                        style={{
                          color: selected === index ? colors.paper : colors.ink,
                        }}
                      >
                        Region {item.regionIndex + 1}
                      </Body>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {mask && (
                <>
                  <View
                    style={{
                      aspectRatio: dimensions.width / dimensions.height,
                      backgroundColor: "#000",
                      overflow: "hidden",
                      borderRadius: 16,
                    }}
                  >
                    {!binary && (
                      <Image
                        source={{ uri: photo.uri }}
                        resizeMode="stretch"
                        style={{ width: "100%", height: "100%" }}
                        accessibilityLabel="Original photo for selection review"
                      />
                    )}
                    <Image
                      source={{
                        uri: `data:image/png;base64,${binary ? mask.binary : mask.composite}`,
                      }}
                      accessibilityLabel={
                        binary
                          ? "Exported black and white mask"
                          : "Exported mask over the original photo"
                      }
                      resizeMode="stretch"
                      onError={() =>
                        setError(
                          "The prepared mask could not be displayed. Close this review and try again.",
                        )
                      }
                      style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        ...(binary
                          ? {}
                          : { tintColor: colors.accent, opacity: 0.7 }),
                      }}
                    />
                  </View>
                  <Label>
                    {dimensions.width} × {dimensions.height} px · {masks.length}{" "}
                    painted {masks.length === 1 ? "region" : "regions"}
                  </Label>
                  <Body muted>
                    {binary
                      ? "White is selected. Black stays outside this region."
                      : "The highlighted area is selected. Everything outside it is unselected."}
                  </Body>
                  <Button
                    secondary
                    title={
                      binary ? "Show on photo" : "Show black-and-white mask"
                    }
                    onPress={() => setBinary(!binary)}
                  />
                  {!!mask.instruction && <Body>{mask.instruction}</Body>}
                </>
              )}
            </ScrollView>
            <View
              style={{
                padding: 20,
                borderTopWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Button title="Back to editing" onPress={close} />
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </>
  );
}
