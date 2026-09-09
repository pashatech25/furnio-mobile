import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Platform, Pressable, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Slider from "@react-native-community/slider";
import Svg from "react-native-svg";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { api, useApp } from "../../src/state";
import { demo } from "../../src/config";
import { photos } from "../../src/services";
import { cleanDownloadUrl } from "../../src/media";
import {
  jobStatusResponseSchema,
  type JobStatusResponse,
} from "../../src/contracts/jobs";
import {
  comparisonSource,
  createResultRequestGate,
  resultLabel,
  resultOutputs,
  selectedResult,
} from "../../src/results/result-view";
import { demoJobId } from "../../src/data/demo";
import {
  DisclosureControls,
  DisclosureRenderer,
  DisclosureText,
  type DisclosureHandle,
} from "../../src/editor/Disclosure";
import {
  defaultDisclosure,
  type Disclosure,
} from "../../src/editor/disclosure-settings";
import {
  Body,
  Button,
  Card,
  colors,
  Heading,
  Kicker,
  Notice,
  Page,
  Pill,
  styles,
  useDialog,
} from "../../src/ui";
const sample: JobStatusResponse = {
  jobId: demoJobId,
  accessLevel: "paid",
  billingMode: "paid_credit",
  status: "succeeded",
  resultAssetId: "44444444-4444-4444-8444-444444444444",
  resultUrl: null,
  resultExpiresAt: null,
  previewUrl: null,
  previewExpiresAt: null,
  error: null,
};
export default function Result() {
  const { jobId, previewProcessing } = useLocalSearchParams<{
    jobId: string;
    previewProcessing?: string;
  }>();
  const { user } = useApp();
  // Changing identity or route immediately discards the old private screen state.
  return (
    <ResultScreen
      key={`${user?.id ?? "signed-out"}:${jobId}`}
      jobId={jobId}
      previewProcessing={previewProcessing}
    />
  );
}

function ResultScreen({
  jobId,
  previewProcessing,
}: {
  jobId: string;
  previewProcessing?: string;
}) {
  const app = useApp();
  const show = useDialog();
  const [job, setJob] = useState<JobStatusResponse | null>(
    demo
      ? { ...sample, status: previewProcessing ? "running" : "succeeded" }
      : null,
  );
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [sourceState, setSourceState] = useState<{
    key: string;
    status: "loaded" | "failed";
  } | null>(null);
  const [compare, setCompare] = useState(0.5);
  const [width, setWidth] = useState(330);
  const [dimensions, setDimensions] = useState({ width: 1500, height: 1000 });
  const [busy, setBusy] = useState(false);
  const [disclosure, setDisclosure] = useState<Disclosure>(defaultDisclosure);
  const renderer = useRef<DisclosureHandle>(null);
  const requestGate = useRef(createResultRequestGate());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGate.current.invalidate();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (demo || !mounted.current) return;
    const current = requestGate.current.begin();
    try {
      z.uuid().parse(jobId);
      const next = await api(
        `/api/jobs/${jobId}?includeSources=1`,
        jobStatusResponseSchema,
      );
      if (!current() || !mounted.current) return;
      if (next.jobId !== jobId)
        throw new Error(
          "The server returned a different job. Please contact support.",
        );
      setJob(next);
      setClock(Date.now());
      setPreviewRevision((revision) => revision + 1);
      setError("");
      return next;
    } catch (error) {
      if (!current() || !mounted.current) return;
      setError(
        error instanceof Error ? error.message : "Could not refresh this job.",
      );
    }
  }, [jobId]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let attempts = 0;
      const poll = async () => {
        if (
          !active ||
          (AppState.currentState !== "active" && Platform.OS !== "web")
        )
          return;
        const next = await refresh();
        if (
          active &&
          (!next || ["queued", "running"].includes(next.status)) &&
          attempts++ < 180
        )
          timeout = setTimeout(() => void poll(), 5000);
      };
      if (!demo) void poll();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          if (timeout) clearTimeout(timeout);
          attempts = 0;
          void poll();
        }
      });
      return () => {
        active = false;
        requestGate.current.invalidate();
        if (timeout) clearTimeout(timeout);
        subscription.remove();
      };
    }, [refresh]),
  );
  useEffect(() => {
    if (demo && previewProcessing) {
      const timer = setTimeout(() => setJob(sample), 3500);
      return () => clearTimeout(timer);
    }
  }, []);
  const outputs = resultOutputs(job);
  const output = selectedResult(outputs, selected);
  useEffect(() => {
    if (output && output.assetId !== selected) setSelected(output.assetId);
  }, [output?.assetId, selected]);
  const source = comparisonSource(output, Math.max(clock, Date.now()));
  const sourceKey = source
    ? `${output!.assetId}:${source.assetId}:${source.previewUrl}:${previewRevision}`
    : "";
  const currentSourceKey = useRef(sourceKey);
  currentSourceKey.current = sourceKey;
  const sourceStatus =
    sourceState?.key === sourceKey ? sourceState.status : "loading";
  const canCompare = demo || (!!source && sourceStatus === "loaded");
  useEffect(() => {
    setCompare(0.5);
  }, [output?.assetId]);
  useEffect(() => {
    if (!source) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(
        2_147_483_647,
        Math.max(1, Date.parse(source.expiresAt) - Date.now() + 1),
      ),
    );
    return () => clearTimeout(timer);
  }, [source?.expiresAt, sourceKey, clock]);
  const locked = (output?.accessLevel ?? job?.accessLevel) === "trial_locked";
  // Each output URL is already protected by the server. Do not substitute the
  // top-level anchor preview when the user selects a different locked output.
  const uri = output?.resultUrl;
  const processing = job?.status === "running" || job?.status === "queued";
  useEffect(() => {
    let current = true;
    setDimensions({ width: 1500, height: 1000 });
    if (uri)
      Image.getSize(
        uri,
        (width, height) => {
          if (current && width > 0 && height > 0)
            setDimensions({ width, height });
        },
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [uri]);
  async function save(share: boolean) {
    if (busy || !mounted.current) return;
    if (demo) {
      show(
        share ? "Share your finished image" : "Save to Photos",
        "The native app saves or shares a full-resolution JPEG, with your optional disclosure. This preview uses sample photos and does not download them.",
      );
      return;
    }
    if (locked || !output) return;
    setBusy(true);
    let input: File | undefined, final: File | undefined;
    try {
      if (Platform.OS === "web")
        throw new Error(
          "Open the native build to save or share full-resolution results.",
        );
      // Re-check access immediately before downloading. Never derive a clean URL from a trial preview.
      const result = await cleanDownloadUrl(output.assetId);
      if (!mounted.current) return;
      if (new URL(result.downloadUrl).protocol !== "https:")
        throw new Error("The download URL is not secure.");
      input = new File(Paths.cache, `furnio-source-${Crypto.randomUUID()}.jpg`);
      await File.downloadFileAsync(result.downloadUrl, input);
      if (!mounted.current) return;
      if (!renderer.current)
        throw new Error("The download renderer is not ready.");
      final = await renderer.current.render(input.uri, disclosure);
      if (!mounted.current) return;
      if (share) {
        if (!(await Sharing.isAvailableAsync()))
          throw new Error("Sharing is unavailable on this device.");
        if (!mounted.current) return;
        await Sharing.shareAsync(final.uri, {
          mimeType: "image/jpeg",
          UTI: "public.jpeg",
          dialogTitle: "Share your Furnio image",
        });
      } else {
        const MediaLibrary = await import("expo-media-library");
        const permission = await MediaLibrary.requestPermissionsAsync(true, [
          "photo",
        ]);
        if (!mounted.current) return;
        if (!permission.granted)
          throw new Error(
            "Allow saving photos in Settings, or use Share instead.",
          );
        await MediaLibrary.Asset.create(final.uri);
        if (mounted.current)
          show("Saved to Photos", "Your finished JPEG is ready to use.");
      }
    } catch (error) {
      if (mounted.current)
        show(
          "Could not export photo",
          error instanceof Error ? error.message : "Try again shortly.",
        );
    } finally {
      if (input?.exists) input.delete();
      if (final?.exists) final.delete();
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Page
      back
      title="Your result"
      right={
        <Pill>
          {processing
            ? "In progress"
            : locked
              ? "Trial preview"
              : (job?.status ?? "Loading")}
        </Pill>
      }
    >
      <Kicker>
        {processing
          ? "GOOD THINGS TAKE A MOMENT"
          : "READY FOR ITS NEXT CHAPTER"}
      </Kicker>
      <Heading>
        {processing ? "Making room\n" : "A whole new\n"}
        {processing ? "for possibility." : "point of view."}
      </Heading>
      {!!error && <Notice warning>{error}</Notice>}
      {processing ? (
        <Card>
          <Heading small>
            {job?.status === "queued"
              ? "Your edit is in the queue."
              : "Your photo is taking shape."}
          </Heading>
          <Body muted>
            {job?.progress
              ? `${job.progress.done} of ${job.progress.total} outputs ready.`
              : "Furnio is processing your request with the selected service’s instructions."}
          </Body>
          <Notice>
            {demo
              ? "Sample processing animation—not an AI request."
              : "You can leave this screen. Your job continues on the server."}
          </Notice>
        </Card>
      ) : null}
      {((demo && !processing) || uri) && (
        <>
          <View
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={{
              aspectRatio: dimensions.width / dimensions.height,
              borderRadius: 22,
              overflow: "hidden",
              backgroundColor: colors.soft,
            }}
          >
            <Image
              key={uri ?? "demo-after"}
              accessibilityLabel={
                output
                  ? `${resultLabel(output)} — Furnio result`
                  : "Furnio result"
              }
              source={demo ? photos.after : { uri: uri! }}
              style={{ width: "100%", height: "100%" }}
            />
            {(demo || source) && (
              <View
                style={{
                  width: `${compare * 100}%`,
                  height: "100%",
                  position: "absolute",
                  left: 0,
                  top: 0,
                  overflow: "hidden",
                  borderRightWidth: 2,
                  borderRightColor: colors.paper,
                  opacity: canCompare ? 1 : 0,
                }}
              >
                <Image
                  key={sourceKey || "demo-before"}
                  accessible={canCompare}
                  accessibilityLabel="Original photo for this result"
                  source={demo ? photos.before : { uri: source!.previewUrl }}
                  onLoad={() => {
                    if (
                      mounted.current &&
                      currentSourceKey.current === sourceKey
                    )
                      setSourceState({ key: sourceKey, status: "loaded" });
                  }}
                  onError={() => {
                    if (
                      mounted.current &&
                      currentSourceKey.current === sourceKey
                    )
                      setSourceState({ key: sourceKey, status: "failed" });
                  }}
                  style={{
                    width,
                    height: (width * dimensions.height) / dimensions.width,
                  }}
                />
              </View>
            )}
            {!locked && (
              <Svg
                pointerEvents="none"
                width="100%"
                height="100%"
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                style={{ position: "absolute" }}
              >
                <DisclosureText
                  settings={disclosure}
                  width={dimensions.width}
                  height={dimensions.height}
                />
              </Svg>
            )}
          </View>
          {canCompare && (
            <>
              <View style={styles.between}>
                <Body muted style={{ fontSize: 13 }}>
                  Original
                </Body>
                <Body muted style={{ fontSize: 13 }}>
                  Furnio result
                </Body>
              </View>
              <Slider
                accessibilityLabel="Compare original and finished image"
                minimumValue={0}
                maximumValue={1}
                value={compare}
                onValueChange={setCompare}
                minimumTrackTintColor={colors.ink}
                thumbTintColor={colors.ink}
              />
            </>
          )}
          {!demo && !canCompare && (
            <Notice>
              {source && sourceStatus !== "failed"
                ? "Loading the matching original photo…"
                : sourceStatus === "failed" || output?.source
                  ? "The matching original is unavailable or its preview has expired. Refresh job status to try loading it again."
                  : "This result has no available original-photo comparison. Your finished image is shown on its own."}
            </Notice>
          )}
        </>
      )}
      {outputs.length > 1 && (
        <View style={[styles.row, { flexWrap: "wrap" }]}>
          {outputs.map((item) => (
            <Pressable
              key={item.assetId}
              accessibilityRole="button"
              accessibilityState={{
                selected: item.assetId === output?.assetId,
              }}
              disabled={busy}
              onPress={() => setSelected(item.assetId)}
              style={{
                padding: 13,
                borderRadius: 12,
                backgroundColor:
                  output?.assetId === item.assetId ? colors.soft : colors.paper,
              }}
            >
              <Body>{resultLabel(item)}</Body>
            </Pressable>
          ))}
        </View>
      )}
      {job?.status === "partial" && (
        <Notice warning>
          Some outputs finished and others failed. Review each available result.
          Credit restoration is managed by the server; this app never re-submits
          automatically.
        </Notice>
      )}
      {!!job?.error && <Notice warning>{job.error}</Notice>}
      {job && ["failed", "cancelled"].includes(job.status) && (
        <Notice>
          Your job did not complete. Check your credit activity for the server’s
          reservation release. A new attempt requires a separate confirmation.
        </Notice>
      )}
      {locked ? (
        <Card>
          <Heading small>Love the preview?</Heading>
          <Body muted>
            Unlock the clean, full-resolution image for{" "}
            {app.trial?.unlockCredits ?? "the current"} credits. Your trial
            watermark cannot be removed using disclosure controls.
          </Body>
          <Button
            title="Unlock this image"
            disabled={busy || !output}
            onPress={() =>
              show(
                "Unlock this result?",
                `${app.trial?.unlockCredits ?? "The required"} credits will be charged after the server checks availability.`,
                [
                  { title: "Keep preview", secondary: true },
                  {
                    title: "Unlock",
                    action: () => {
                      if (!output || busy || !mounted.current) return;
                      setBusy(true);
                      void api(
                        `/api/trial/assets/${output.assetId}/unlock`,
                        z.record(z.string(), z.unknown()),
                        {},
                      )
                        .then(async () => {
                          if (!mounted.current) return;
                          await refresh();
                          await app.refresh();
                        })
                        .catch((error) => {
                          if (mounted.current)
                            show("Could not unlock", error.message);
                        })
                        .finally(() => {
                          if (mounted.current) setBusy(false);
                        });
                    },
                  },
                ],
              )
            }
          />
          <Button
            title="Get credits"
            secondary
            onPress={() => router.push("/wallet")}
          />
        </Card>
      ) : (
        !processing &&
        (demo || output) && (
          <>
            <DisclosureControls value={disclosure} onChange={setDisclosure} />
            <Button
              title="Save full-resolution JPEG"
              busy={busy}
              onPress={() => void save(false)}
            />
            <Button
              title="Share photo"
              secondary
              busy={busy}
              onPress={() => void save(true)}
            />
          </>
        )
      )}
      <Button
        title="Refresh job status"
        secondary
        onPress={() => void refresh()}
      />
      <Button
        title="Back to my projects"
        secondary
        onPress={() => router.push("/projects")}
      />
      <DisclosureRenderer ref={renderer} />
    </Page>
  );
}
