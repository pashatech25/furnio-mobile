import { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import { ProcessingAnimation } from "../src/ProcessingAnimation";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useApp } from "../src/state";
import { ApiError, createApi } from "../src/api/client";
import { createMediaUploads } from "../src/api/media-upload";
import { useEditOperation } from "../src/editor/use-edit-operation";
import { config, demo } from "../src/config";
import { getService, services, type ServiceId } from "../src/services";
import { fileBytes, type LocalPhoto } from "../src/media";
import { usePhotoInputs } from "../src/media/use-photo-inputs";
import {
  runBatch,
  supportsBatch,
  type BatchService,
  type ItemState,
  validBatchSettings,
} from "../src/batch/runner";
import {
  createNativeMaskStore,
  uploadPreparedMasks,
  type PreparedMask,
} from "../src/batch/masks";
import { createBatchReviewGate } from "../src/batch/review-gate";
import { AI_PROCESSING_DISCLOSURE, AI_PROCESSING_CONFIRM_LABEL } from "../src/ai-processing-disclosure";
import {
  MaskEditor,
  type MaskHandle,
  type PaintRegion,
} from "../src/editor/MaskEditor";
import {
  Body,
  Button,
  Card,
  colors,
  Field,
  Heading,
  Label,
  Notice,
  Page,
  Pill,
  styles,
  useDialog,
} from "../src/ui";
import type { ReserveBatchResponse } from "../src/contracts/uploads";
import {
  loadBatchJournal,
  saveBatchJournal,
  clearBatchJournal,
  type BatchJournal,
} from "../src/batch/journal";

type Item = {
  id: string;
  file: LocalPhoto;
  roomType: string;
  style: string;
  mood: string;
  direction: string;
  preset: string;
  options: string[];
  reviewed: boolean;
  regions: PaintRegion[];
  masks: PreparedMask[];
};
function itemSettings(
  item: Item,
  service: BatchService,
): Record<string, unknown> {
  if (service === "virtual_staging")
    return {
      roomType: item.roomType,
      style: item.style,
      mood: item.mood,
      direction: item.direction,
    };
  if (service === "twilight") return { feature: service, preset: item.preset };
  if (service === "winter_to_summer") return { feature: service };
  if (service === "exterior_enhancement")
    return { feature: service, options: item.options };
  if (service === "floor_plan") return {};
  return {
    mode: service === "item_removal" ? "remove" : "custom",
    regions: item.masks.map(({ binaryUri, compositeUri, ...region }) => ({
      ...region,
      maskKey: "pending-native-upload",
      compositeMaskKey: "pending-native-upload",
    })),
  };
}
export default function Batch() {
  const params = useLocalSearchParams<{ projectId?: string }>(),
    app = useApp(),
    show = useDialog();
  const beginOperation = useEditOperation(app.user?.id);
  const { choosePhotos, chooseFloorplan } = usePhotoInputs(app.user?.id);
  const [projectId, setProjectId] = useState(
    params.projectId ?? app.projects[0]?.id ?? "",
  );
  const [service, setService] = useState<BatchService>("virtual_staging");
  const [items, setItems] = useState<Item[]>([]),
    [active, setActive] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [states, setStates] = useState<ItemState[]>([]),
    [reservation, setReservation] = useState<ReserveBatchResponse | null>(null);
  const [started, setStarted] = useState(false);
  const [painting, setPainting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [recovery, setRecovery] = useState<BatchJournal | null>(null),
    [recoveryReady, setRecoveryReady] = useState(demo);
  const mask = useRef<MaskHandle>(null),
    alive = useRef(true),
    stop = useRef(false),
    lock = useRef(false),
    maskStore = useRef(createNativeMaskStore()),
    reviewGate = useRef(createBatchReviewGate());
  const selected = items[active],
    isMask = service === "item_removal" || service === "custom_staging";
  const feature = app.runtime?.features.find(
      (feature) => feature.slug === service,
    ),
    cost = (feature?.credits_per_output ?? 0) * items.length;
  useEffect(() => {
    let live = true;
    if (!demo && app.user)
      void loadBatchJournal(app.user.id)
        .then((value) => {
          if (live) {
            setRecovery(value);
            setRecoveryReady(true);
          }
        })
        .catch(() => {
          if (live)
            setError(
              "Batch recovery could not be read. Check your project before submitting another batch.",
            );
        });
    return () => {
      live = false;
    };
  }, [app.user?.id]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
      reviewGate.current.invalidate();
      maskStore.current.clear();
    };
  }, []);
  function update(change: Partial<Item>) {
    setItems((current) =>
      current.map((item, index) =>
        index === active ? { ...item, ...change, reviewed: false } : item,
      ),
    );
  }
  async function add(pdf = false) {
    if (started || busy || lock.current || reviewGate.current.active) return;
    let operation;
    try {
      operation = beginOperation();
    } catch {
      return;
    }
    lock.current = true;
    try {
      if (!demo) await operation.getToken();
      const files = pdf
        ? await chooseFloorplan()
        : await choosePhotos(50 - items.length);
      operation.assertCurrent();
      setItems((current) => [
        ...current,
        ...files.slice(0, 50 - current.length).map((file) => ({
          id: Crypto.randomUUID(),
          file,
          roomType: "Living room",
          style: "Warm contemporary",
          mood: "",
          direction: "",
          preset: "natural_dusk",
          options: ["blue_sky"],
          reviewed: false,
          regions: [],
          masks: [],
        })),
      ]);
    } catch (error) {
      if (!operation.current) return;
      show(
        "Choose your files",
        error instanceof Error ? error.message : "Files could not be opened.",
      );
    } finally {
      lock.current = false;
      operation.dispose();
    }
  }
  async function review() {
    if (!selected || busy || started || reviewGate.current.active) return;
    const photoId = selected.id;
    setReviewing(true);
    try {
      await reviewGate.current.run(async (current) => {
        let masks = selected.masks,
          regions = selected.regions;
        if (isMask) {
          if (Platform.OS === "web")
            throw new Error(
              "Painted batch reviews require the iOS or Android app. The browser preview is design-only.",
            );
          if (!mask.current) throw new Error("The mask editor is not ready.");
          regions = mask.current.snapshot();
          const exported = await mask.current.export();
          if (!current() || !alive.current) return;
          masks = maskStore.current.save(photoId, exported, (prepared) => {
            validBatchSettings(
              service,
              itemSettings({ ...selected, masks: prepared }, service),
            );
          });
        } else {
          validBatchSettings(service, itemSettings(selected, service));
        }
        if (!current() || !alive.current) return;
        setItems((items) =>
          items.map((item) =>
            item.id === photoId
              ? { ...item, masks, regions, reviewed: true }
              : item,
          ),
        );
        if (active < items.length - 1) setActive(active + 1);
      });
    } catch (error) {
      if (alive.current)
        show(
          "Review this photo",
          error instanceof Error ? error.message : "Please check its settings.",
        );
    } finally {
      if (alive.current) {
        setReviewing(false);
        setCleanupPending(maskStore.current.pending > 0);
      }
    }
  }
  async function submit() {
    if (!demo && !hasServiceCredits(app.billing?.balance ?? null, cost)) {
      show("Credits required", "Batch edits use spendable credits. Complimentary trial previews cannot fund a batch.");
      return;
    }
    if (
      lock.current ||
      reviewGate.current.active ||
      maskStore.current.pending > 0 ||
      recovery ||
      !recoveryReady ||
      !app.user ||
      !feature ||
      !items.length ||
      items.some((item) => !item.reviewed)
    )
      return;
    let operation;
    try {
      operation = beginOperation();
    } catch {
      return;
    }
    lock.current = true;
    setBusy(true);
    setStarted(true);
    setError("");
    stop.current = false;
    const userId = app.user.id;
    let journal: BatchJournal = {
      version: 1,
      userId,
      projectId,
      idempotencyKey: Crypto.randomUUID(),
      startedAt: Date.now(),
      batchId: null,
      expiresAt: null,
      jobIds: [],
      phase: "reserving",
    };
    const persist = () => {
      void saveBatchJournal({ ...journal, jobIds: [...journal.jobIds] }).catch(
        () => {
          if (alive.current && operation.current)
            setError(
              "The latest recovery checkpoint could not be saved. Keep this page open and note your batch/job references. Do not resubmit.",
            );
        },
      );
    };
    try {
      if (demo) {
        setStates(
          items.map((_, position) => ({
            position,
            status: "queued",
            message: "Sample only · no real processing or credits.",
          })),
        );
        return;
      }
      await operation.getToken();
      const request = createApi(
        config.platform,
        operation.getToken,
        fetch,
        operation,
      );
      const uploads = createMediaUploads({
        api: request,
        readBytes: fileBytes,
        boundary: operation,
      });
      await saveBatchJournal(journal);
      operation.assertCurrent();
      const result = await runBatch(
        service,
        projectId,
        journal.idempotencyKey,
        items.map((item) => ({
          file: item.file,
          settings: itemSettings(item, service),
        })),
        {
          expectedCredits: cost,
          api: request,
          upload: uploads.uploadReservedPhoto,
          ensureCurrent: async () => {
            if (!alive.current || stop.current)
              throw new Error(
                "Further items were stopped. Already accepted jobs continue.",
              );
            await operation.getToken();
          },
          prepareSettings: async (position, itemId) =>
            isMask
              ? {
                  regions: await uploadPreparedMasks(
                    items[position]!.masks,
                    service as "item_removal" | "custom_staging",
                    itemId,
                    uploads.uploadMask,
                    operation.assertCurrent,
                  ),
                }
              : {},
          onReservation: (value) => {
            journal = {
              ...journal,
              batchId: value.batchId,
              expiresAt: value.reservationExpiresAt,
              phase: "uploading",
            };
            persist();
            if (alive.current && operation.current) setReservation(value);
          },
          onState: (state) => {
            if (state.jobId) {
              journal = {
                ...journal,
                jobIds: [...new Set([...journal.jobIds, state.jobId])],
              };
              persist();
            }
            if (alive.current && operation.current)
              setStates((current) =>
                [
                  ...current.filter((item) => item.position !== state.position),
                  state,
                ].sort((a, b) => a.position - b.position),
              );
          },
        },
      );
      journal = {
        ...journal,
        phase: result.items.every((item) => item.status === "queued")
          ? "finished"
          : "needs_review",
      };
      persist();
      if (operation.current) void app.refresh();
    } catch (error) {
      if (
        error instanceof ApiError &&
        operation.current &&
        error.code === "CREDIT_QUOTE_CHANGED" &&
        journal.batchId === null
      ) {
        // This code is emitted only BEFORE the reservation RPC. A replay with
        // an existing different-price reservation uses BATCH_QUOTE_CONFLICT.
        const cleared = await clearBatchJournal(userId).then(
          () => true,
          () => false,
        );
        await app.refresh();
        if (alive.current && operation.current) {
          setStarted(!cleared);
          setError(
            cleared
              ? error.message
              : "The cost changed before reservation, but local recovery could not be cleared. Reopen this page and review the recovery notice before continuing.",
          );
        }
        return;
      }
      journal = { ...journal, phase: "needs_review" };
      if (!demo) persist();
      if (alive.current && operation.current)
        setError(
          error instanceof Error
            ? error.message
            : "The batch could not finish. Check your project before trying again.",
        );
    } finally {
      lock.current = false;
      if (alive.current && operation.current) setBusy(false);
      operation.dispose();
    }
  }
  return (
    <Page back title="Batch edits" scrollEnabled={!painting}>
      {busy && <ProcessingAnimation label="Preparing and submitting your photos…" />}
      <Heading>A whole listing.{"\n"}One considered workflow.</Heading>
      <Body muted>
        Up to 50 independent photos. Review each photo’s settings before credits
        are reserved. Multi-view and reference furniture use their dedicated
        editors.
      </Body>
      {cleanupPending && (
        <Card>
          <Notice warning>
            Some temporary mask copies could not be cleared. Your original
            photos are unchanged. Retry cleanup before preparing more masks or
            starting this batch.
          </Notice>
          <Button
            secondary
            title="Retry temporary-mask cleanup"
            disabled={reviewing || busy}
            onPress={() => setCleanupPending(maskStore.current.cleanup() > 0)}
          />
        </Card>
      )}
      {recovery && (
        <Card>
          <Heading small>Check your previous batch.</Heading>
          <Body>
            Its last recorded state is {recovery.phase.replaceAll("_", " ")}.{" "}
            {recovery.jobIds.length} job references were saved. This screen will
            not submit that batch again.
          </Body>
          <Body muted>{recovery.batchId ?? recovery.idempotencyKey}</Body>
          <Button
            title="Open its project"
            onPress={() => router.push(`/project/${recovery.projectId}`)}
          />
          <Button
            title="I checked the project — clear local reminder"
            secondary
            onPress={() =>
              show(
                "Clear the local reminder?",
                "This does not cancel jobs, refund credits, or prove a pending request failed. Check your project and balance first.",
                [
                  { title: "Keep reminder", secondary: true },
                  {
                    title: "Clear reminder",
                    action: async () => {
                      if (app.user) {
                        await clearBatchJournal(app.user.id);
                        setRecovery(null);
                      }
                    },
                  },
                ],
              )
            }
          />
        </Card>
      )}
      {!started && !recovery && recoveryReady && (
        <View
          style={{ gap: 20 }}
          pointerEvents={reviewing ? "none" : "auto"}
          accessibilityElementsHidden={reviewing}
          importantForAccessibility={reviewing ? "no-hide-descendants" : "auto"}
        >
          <Label>PROJECT</Label>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {app.projects.map((project) => (
              <Button
                key={project.id}
                title={project.name}
                secondary={projectId !== project.id}
                onPress={() => setProjectId(project.id)}
              />
            ))}
          </View>
          {!app.projects.length && (
            <Button
              title="Create a project"
              onPress={() => router.push("/new-project")}
            />
          )}
          <Label>SERVICE</Label>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {services
              .filter(
                (item) =>
                  supportsBatch(item.id) &&
                  app.runtime?.features.some(
                    (feature) => feature.slug === item.id,
                  ),
              )
              .map((item) => (
                <Button
                  key={item.id}
                  title={item.name}
                  secondary={service !== item.id}
                  disabled={items.length > 0}
                  onPress={() => setService(item.id as BatchService)}
                />
              ))}
          </View>
          <Notice>
            Batch edits use spendable credits, not trial previews. Unsubmitted
            items are refunded by the existing server reservation-expiry
            process. Keep this screen open while uploads finish.
          </Notice>
          <Button
            title={items.length ? "Add more photos" : "Choose photos"}
            secondary
            disabled={items.length >= 50 || !feature}
            onPress={() => void add()}
          />
          {service === "floor_plan" && (
            <Button
              title="Add a single-page PDF"
              secondary
              disabled={items.length >= 50 || !feature}
              onPress={() => void add(true)}
            />
          )}
          {!!items.length && (
            <>
              <View style={[styles.row, { flexWrap: "wrap" }]}>
                {items.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${index + 1}${item.reviewed ? ", reviewed" : ""}`}
                    onPress={() => {
                      setActive(index);
                    }}
                    style={{
                      padding: 12,
                      borderWidth: 1,
                      borderColor: active === index ? colors.ink : colors.line,
                      borderRadius: 12,
                    }}
                  >
                    <Body>
                      {index + 1}
                      {item.reviewed ? " ✓" : ""}
                    </Body>
                  </Pressable>
                ))}
              </View>
              {selected && (
                <Card key={selected.id}>
                  <View style={styles.between}>
                    <Heading small>Photo {active + 1}</Heading>
                    <Pill>
                      {selected.reviewed ? "Reviewed" : "Needs review"}
                    </Pill>
                  </View>
                  <Body muted>
                    {selected.file.name} ·{" "}
                    {(selected.file.bytes / 1048576).toFixed(1)} MB
                  </Body>
                  {isMask ? (
                    <MaskEditor
                      ref={mask}
                      photo={selected.file}
                      custom={service === "custom_staging"}
                      initialRegions={selected.regions}
                      onRegionsChange={(regions) => update({ regions })}
                      onDrawingChange={setPainting}
                    />
                  ) : selected.file.contentType === "image/jpeg" ? (
                    <Image
                      source={{ uri: selected.file.uri }}
                      style={{
                        width: "100%",
                        aspectRatio: selected.file.width / selected.file.height,
                        borderRadius: 14,
                      }}
                    />
                  ) : (
                    <Notice>
                      PDF pages and dimensions are validated by the server
                      before generation.
                    </Notice>
                  )}
                  {service === "virtual_staging" && (
                    <>
                      <Field
                        label="Room type"
                        value={selected.roomType}
                        maxLength={80}
                        onChangeText={(roomType) => update({ roomType })}
                      />
                      <Field
                        label="Furniture style"
                        value={selected.style}
                        maxLength={80}
                        onChangeText={(style) => update({ style })}
                      />
                      <Field
                        label="Mood (optional)"
                        value={selected.mood}
                        maxLength={80}
                        onChangeText={(mood) => update({ mood })}
                      />
                      <Field
                        label="Additional direction (optional)"
                        value={selected.direction}
                        maxLength={600}
                        multiline
                        onChangeText={(direction) => update({ direction })}
                      />
                    </>
                  )}
                  {service === "twilight" && (
                    <View style={[styles.row, { flexWrap: "wrap" }]}>
                      {["pink_twilight", "blue_hour", "natural_dusk"].map(
                        (preset) => (
                          <Button
                            key={preset}
                            title={preset.replaceAll("_", " ")}
                            secondary={selected.preset !== preset}
                            onPress={() => update({ preset })}
                          />
                        ),
                      )}
                    </View>
                  )}
                  {service === "exterior_enhancement" && (
                    <View style={[styles.row, { flexWrap: "wrap" }]}>
                      {[
                        "clean_driveway",
                        "green_grass",
                        "blue_sky",
                        "remove_leaves",
                      ].map((option) => (
                        <Button
                          key={option}
                          title={option.replaceAll("_", " ")}
                          secondary={!selected.options.includes(option)}
                          onPress={() =>
                            update({
                              options: selected.options.includes(option)
                                ? selected.options.filter(
                                    (value) => value !== option,
                                  )
                                : [...selected.options, option],
                            })
                          }
                        />
                      ))}
                    </View>
                  )}
                  <Button
                    title="Save review & next photo"
                    busy={reviewing}
                    onPress={() => void review()}
                  />
                  <Button
                    title="Remove this photo"
                    secondary
                    onPress={() => {
                      setCleanupPending(
                        maskStore.current.remove(selected.id) > 0,
                      );
                      setItems((current) =>
                        current.filter((item) => item.id !== selected.id),
                      );
                      setActive(Math.max(0, active - 1));
                    }}
                  />
                </Card>
              )}
              <Card>
                <Heading small>{cost} credits</Heading>
                <Body>
                  {items.length} photos ·{" "}
                  {items.filter((item) => item.reviewed).length} reviewed.
                  Furnio’s Admin prompts and processing settings always apply.
                </Body>
                <Button
                  title={
                    demo
                      ? "Preview batch submission"
                      : "Reserve credits & start"
                  }
                  disabled={
                    (!demo && !hasServiceCredits(app.billing?.balance ?? null, cost)) ||
                    !projectId ||
                    cleanupPending ||
                    !feature ||
                    items.some((item) => !item.reviewed) ||
                    (!demo && (app.billing?.balance ?? 0) < cost)
                  }
                  onPress={() =>
                    show(
                      "Start this batch?",
                      demo
                        ? "This is sample processing only. No photo is uploaded and no payment or credit spend occurs."
                        : `${AI_PROCESSING_DISCLOSURE}\n\n${cost} credits are shown at the current service price. Successful jobs remain in your project even if another photo fails.`,
                      [
                        { title: "Not yet", secondary: true },
                        { title: demo ? "Start batch" : AI_PROCESSING_CONFIRM_LABEL, action: () => void submit() },
                      ],
                    )
                  }
                />
              </Card>
            </>
          )}
        </View>
      )}
      {reviewing && (
        <Notice>
          Preparing this photo’s masks on your device… No photo is uploaded
          until you confirm starting the batch.
        </Notice>
      )}
      {!!error && <Notice warning>{error}</Notice>}
      {reservation && (
        <Notice>
          Batch reference: {reservation.batchId}. Upload reservation expires{" "}
          {new Date(reservation.reservationExpiresAt).toLocaleTimeString()}.
          This is not a second purchase.
        </Notice>
      )}
      {states.map((state) => (
        <Card key={state.position}>
          <View style={styles.between}>
            <Body>Photo {state.position + 1}</Body>
            <Pill>{state.status.replaceAll("_", " ")}</Pill>
          </View>
          {!!state.message && <Body muted>{state.message}</Body>}
          {state.jobId && (
            <Button
              title="Open this job"
              secondary
              onPress={() =>
                router.push({
                  pathname: "/result/[jobId]",
                  params: { jobId: state.jobId!, projectId },
                })
              }
            />
          )}
        </Card>
      ))}
      {busy && (
        <Button
          title="Stop submitting remaining photos"
          secondary
          onPress={() => {
            stop.current = true;
            show(
              "Stopping remaining photos",
              "The current request may already have been accepted. Accepted jobs continue; unsubmitted reservations expire and are refunded by the server.",
            );
          }}
        />
      )}
      {started && (
        <Button
          title="Check project & accepted jobs"
          secondary
          onPress={() => router.push(`/project/${projectId}`)}
        />
      )}
    </Page>
  );
}
import { hasServiceCredits } from "../src/api/funding";
