import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, View } from "react-native";
import { ProcessingAnimation } from "../../src/ProcessingAnimation";
import { AI_PROCESSING_DISCLOSURE, AI_PROCESSING_CONFIRM_LABEL } from "../../src/ai-processing-disclosure";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { ImagePlus } from "lucide-react-native";
import { VisualChoiceRail } from "../../src/VisualChoiceRail";
import { roomTypeOptions, furnitureStyleOptions, moodOptions, twilightVisualOptions } from "../../src/creative-options";
import { config, demo } from "../../src/config";
import { getService } from "../../src/services";
import { useApp } from "../../src/state";
import { fileBytes, type LocalPhoto } from "../../src/media";
import { usePhotoInputs } from "../../src/media/use-photo-inputs";
import {
  stageJobResponseSchema,
  type ExteriorEnhancementOption,
  type TwilightPreset,
} from "../../src/contracts/jobs";
import { demoJobId } from "../../src/data/demo";
import {
  MaskEditor,
  type MaskHandle,
  type PaintRegion,
} from "../../src/editor/MaskEditor";
import {
  loadDraft,
  saveDraft,
  discardDraft,
  type Draft,
} from "../../src/drafts";
import { canUseTrialPreview, hasServiceCredits, isServiceLocked } from "../../src/api/funding";
import { TrialAllowance } from "../../src/TrialAllowance";
import { ApiError, createApi } from "../../src/api/client";
import { createMediaUploads } from "../../src/api/media-upload";
import {
  OperationStopped,
  type OperationScope,
} from "../../src/auth/operation-scope";
import { useEditOperation } from "../../src/editor/use-edit-operation";
import {
  submissionJournal,
  submissionScope,
} from "../../src/editor/native-submission-journal";
import type { SubmissionReceipt } from "../../src/editor/submission-journal";
import {
  lookupSubmission,
  submitWithReceipt,
} from "../../src/editor/submission-recovery";
import { quotedJobEndpoint } from "../../src/api/credit-quote";
import { normalizedPoint } from "../../src/editor/geometry";
import {
  appendFurniture,
  nudgeFurniturePin,
  removeFurniture,
} from "../../src/editor/furniture-selection";
import {
  studioRequest,
  validateStudioInput,
  type UploadedMask,
} from "../../src/editor/studio-input";
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
} from "../../src/ui";

export default function Studio() {
  const params = useLocalSearchParams<{
    service: string;
    projectId?: string;
  }>();
  const service = getService(params.service);
  const app = useApp();
  const { choosePhotos, chooseFloorplan } = usePhotoInputs(app.user?.id);
  const beginOperation = useEditOperation(app.user?.id);
  const show = useDialog();
  const [projectId, setProjectId] = useState(
    params.projectId ?? app.projects[0]?.id ?? "",
  );
  const [files, setFiles] = useState<LocalPhoto[]>([]);
  const [recoverable, setRecoverable] = useState<Draft | null>(null);
  const [initialRegions, setInitialRegions] = useState<PaintRegion[]>([]);
  const [editorRevision, setEditorRevision] = useState(0);
  const [furniture, setFurniture] = useState<LocalPhoto[]>([]);
  const [pins, setPins] = useState<({ x: number; y: number } | null)[]>([]);
  const [activePin, setActivePin] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [roomType, setRoomType] = useState("Living room");
  const [choosingProject, setChoosingProject] = useState(false);
  const [style, setStyle] = useState("");
  const [mood, setMood] = useState("");
  const [direction, setDirection] = useState("");
  const [preset, setPreset] = useState<TwilightPreset>("natural_dusk");
  const [options, setOptions] = useState<ExteriorEnhancementOption[]>([
    "blue_sky",
  ]);
  const [busy, setBusy] = useState(false);
  const [painting, setPainting] = useState(false);
  const [phase, setPhase] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [receiptState, setReceiptState] = useState<{
    owner: string | undefined;
    loading: boolean;
    receipt: SubmissionReceipt | null;
    error: boolean;
  }>({ owner: undefined, loading: !demo, receipt: null, error: false });
  const pendingReceipt =
    receiptState.owner === app.user?.id ? receiptState.receipt : null;
  const recoveryBlocked =
    !demo &&
    (receiptState.owner !== app.user?.id ||
      receiptState.loading ||
      receiptState.error ||
      pendingReceipt !== null);
  const [pinLayout, setPinLayout] = useState({ width: 0, height: 0 });
  const mask = useRef<MaskHandle>(null);
  const locked = useRef(false);
  const feature = app.runtime?.features.find(
    (feature) => feature.slug === service?.id,
  );
  const isMask =
    service?.id === "item_removal" || service?.id === "custom_staging";
  const isReference = service?.id === "reference_furniture";
  const isMulti = service?.id === "multiview";
  const cost =
    (feature?.credits_per_output ?? 0) *
    (isMulti ? Math.max(2, files.length) : 1);
  const trialAvailable = canUseTrialPreview(
    app.trial,
    service?.id ?? "",
    app.billing?.balance ?? null,
    cost,
  );
  const accessLocked = isServiceLocked(app.trial, service?.id ?? "", app.billing?.balance ?? null, cost);
  const canFund = trialAvailable || hasServiceCredits(app.billing?.balance ?? null, cost);
  useEffect(() => {
    let active = true;
    const owner = app.user?.id;
    setUncertain(false);
    setReceiptState({ owner, loading: !demo, receipt: null, error: false });
    if (!demo && owner) {
      void submissionScope()
        .then((scope) => submissionJournal.load(scope, owner))
        .then((receipt) => {
          if (active)
            setReceiptState({ owner, loading: false, receipt, error: false });
        })
        .catch(() => {
          if (active)
            setReceiptState({
              owner,
              loading: false,
              receipt: null,
              error: true,
            });
        });
    }
    return () => {
      active = false;
    };
  }, [app.user?.id]);

  async function checkPreviousSubmission() {
    if (!app.user || locked.current || demo) return;
    const owner = app.user.id;
    let operation: OperationScope | undefined;
    locked.current = true;
    setBusy(true);
    try {
      operation = beginOperation();
      await operation.getToken();
      const scope = await submissionScope();
      const receipt = await submissionJournal.load(scope, owner);
      operation.assertCurrent();
      setReceiptState({ owner, loading: false, receipt, error: false });
      setUncertain(false);
      if (!receipt) return;
      const request = createApi(
        config.platform,
        operation.getToken,
        fetch,
        operation,
      );
      const result = await lookupSubmission(request, receipt);
      operation.assertCurrent();
      if (result.state !== "found") {
        show(
          "Still checking this edit",
          "An exact submission could not be confirmed yet. No new job was sent. Check this project’s history or contact support before sending these photos again.",
        );
        return;
      }
      // Retain the receipt through navigation; Result acknowledges it after rendering.
      void discardDraft(owner, receipt.service).catch(() => undefined);
      router.replace({
        pathname: "/result/[jobId]",
        params: { jobId: result.jobId, projectId: receipt.projectId },
      });
    } catch (error) {
      if (operation && !operation.current) return;
      show(
        "Submission check unavailable",
        "Keep the saved receipt. Check your project history or try this status check later. This does not submit another edit.",
      );
    } finally {
      locked.current = false;
      if (operation?.current) setBusy(false);
      operation?.dispose();
    }
  }
  useEffect(() => {
    let active = true;
    if (app.user && service && !demo)
      void loadDraft(app.user.id, service.id)
        .then((value) => {
          if (active) setRecoverable(value);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [app.user?.id, service?.id]);
  function restoreDraft() {
    if (
      !recoverable ||
      !app.projects.some((project) => project.id === recoverable.projectId)
    ) {
      show(
        "Project unavailable",
        "This draft’s project is unavailable or archived. Please create a new edit.",
      );
      return;
    }
    setProjectId(recoverable.projectId);
    setFiles(recoverable.files);
    setFurniture(recoverable.furniture);
    const restoredPins: { x: number; y: number }[] = [];
    recoverable.pins.forEach((pin, index) => {
      if (pin) restoredPins[index] = pin;
    });
    setPins(restoredPins);
    setAnchor(recoverable.anchor);
    setRoomType(recoverable.roomType);
    setStyle(recoverable.style);
    setMood(recoverable.mood);
    setDirection(recoverable.direction);
    setPreset(recoverable.preset);
    setOptions(recoverable.options);
    setInitialRegions(recoverable.maskRegions);
    setEditorRevision((value) => value + 1);
    setRecoverable(null);
  }
  async function keepDraft() {
    if (!app.user || !service || locked.current) return;
    if (demo) {
      show(
        "Device draft preview",
        "A native build keeps your selected photos and editing settings on this device for up to 48 hours. Nothing is uploaded when you save a draft.",
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setPhase("Saving a private draft on this device…");
    let operation: OperationScope | undefined;
    try {
      operation = beginOperation();
      await operation.getToken();
      const saved = await saveDraft(app.user.id, service.id, {
        projectId,
        files,
        furniture,
        pins: Array.from(
          { length: furniture.length },
          (_, index) => pins[index] ?? null,
        ),
        anchor,
        roomType,
        style,
        mood,
        direction,
        preset,
        options,
        maskRegions: mask.current?.snapshot() ?? [],
      });
      operation.assertCurrent();
      // Preserve any reordering/new selection made while device storage was busy.
      const copies = new Map(
        [...files, ...furniture].map((photo, index) => [
          photo.uri,
          [...saved.files, ...saved.furniture][index]!,
        ]),
      );
      setFiles((current) =>
        current.map((photo) => copies.get(photo.uri) ?? photo),
      );
      setFurniture((current) =>
        current.map((photo) => copies.get(photo.uri) ?? photo),
      );
      show(
        "Draft saved on this device",
        "Reopen this service within 48 hours to restore it. Signing out or switching accounts removes this draft and its private photo copies. Your device may also clear cached photos. Nothing has been uploaded.",
      );
    } catch (error) {
      if (
        error instanceof OperationStopped ||
        (operation && !operation.current)
      )
        return;
      show(
        "Draft could not be saved",
        error instanceof Error ? error.message : "Keep the editor open.",
      );
    } finally {
      locked.current = false;
      if (operation?.current) {
        setBusy(false);
        setPhase("");
      }
      operation?.dispose();
    }
  }
  async function select(kind: "room" | "camera" | "furniture" | "pdf") {
    if (locked.current) return;
    if (kind === "furniture" && furniture.length >= 5) return;
    locked.current = true;
    let operation: OperationScope | undefined;
    try {
      operation = beginOperation();
      if (!demo) await operation.getToken();
      const picked =
        kind === "pdf"
          ? await chooseFloorplan()
          : await choosePhotos(
              kind === "furniture" ? 5 - furniture.length : (service?.max ?? 1),
              kind === "camera",
            );
      operation.assertCurrent();
      if (!picked.length) return;
      if (kind === "furniture") {
        setFurniture(appendFurniture(furniture, picked));
        setActivePin(furniture.length);
      } else {
        setFiles(picked);
        setInitialRegions([]);
        setEditorRevision((value) => value + 1);
        setAnchor(0);
        setPins([]);
      }
    } catch (error) {
      if (
        error instanceof OperationStopped ||
        (operation && !operation.current)
      )
        return;
      show(
        "Choose another file",
        error instanceof Error
          ? error.message
          : "The file could not be opened.",
      );
    } finally {
      locked.current = false;
      operation?.dispose();
    }
  }
  async function submit() {
    if (
      !service ||
      !feature ||
      !app.user ||
      locked.current ||
      uncertain ||
      recoveryBlocked
    )
      return;
    let operation: OperationScope;
    try {
      operation = beginOperation();
    } catch {
      return;
    }
    const form = {
      projectId,
      files,
      furniture,
      pins,
      anchor,
      roomType,
      style,
      mood,
      direction,
      preset,
      options,
    };
    try {
      validateStudioInput(service.id, form, mask.current?.snapshot() ?? []);
    } catch (error) {
      operation.dispose();
      show(
        "Check your edit",
        error instanceof Error
          ? error.message
          : "Check the selected photos and service settings.",
      );
      return;
    }
    locked.current = true;
    if (!demo && (accessLocked || !canFund)) {
      locked.current = false;
      operation.dispose();
      show("Service unavailable", "This edit is not covered by your current trial allowance or available credits.");
      return;
    }
    const confirmedCredits = trialAvailable ? 0 : cost;
    setBusy(true);
    try {
      if (demo) {
        router.push({
          pathname: "/result/[jobId]",
          params: { jobId: demoJobId, previewProcessing: "1", projectId },
        });
        return;
      }
      await operation.getToken();
      const receiptScope = await submissionScope();
      const existing = await submissionJournal.load(receiptScope, app.user.id);
      operation.assertCurrent();
      if (existing) {
        setReceiptState({
          owner: app.user.id,
          loading: false,
          receipt: existing,
          error: false,
        });
        return;
      }
      const request = createApi(
        config.platform,
        operation.getToken,
        fetch,
        operation,
      );
      const { uploadPhoto, uploadMask } = createMediaUploads({
        api: request,
        readBytes: fileBytes,
        boundary: operation,
      });
      setPhase("Preparing your photo and selections…");
      const regions = isMask ? await mask.current?.export() : null;
      operation.assertCurrent();
      const group = isMulti ? Crypto.randomUUID() : undefined;
      const uploaded = [];
      for (const [index, file] of files.entries()) {
        operation.assertCurrent();
        setPhase(`Uploading source ${index + 1} of ${files.length}…`);
        uploaded.push(
          await uploadPhoto(
            file,
            projectId,
            service.id,
            isMulti
              ? {
                  roomGroupId: group,
                  viewIndex: index,
                  isAnchor: anchor === index,
                }
              : {},
          ),
        );
      }
      const furnitureIds: string[] = [];
      if (isReference) {
        for (const photo of furniture)
          furnitureIds.push(
            (
              await uploadPhoto(photo, projectId, service.id, {
                countsTowardPhotoLimit: false,
              })
            ).assetId,
          );
      }
      const uploadedRegions: UploadedMask[] = [];
      if (service.id === "item_removal" || service.id === "custom_staging") {
        if (!regions?.length) throw new Error("Paint at least one area.");
        for (const region of regions)
          uploadedRegions.push({
            bbox: region.bbox,
            operation: region.operation,
            instruction: region.instruction,
            regionIndex: region.regionIndex,
            maskKey: await uploadMask(region.binary, service.id),
            compositeMaskKey: await uploadMask(region.composite, service.id),
          });
      }
      const input = studioRequest(
        service.id,
        form,
        uploaded.map((item) => item.assetId),
        furnitureIds,
        uploadedRegions,
      );
      operation.assertCurrent();
      setPhase("Submitting your edit with Furnio’s server-side instructions…");
      const receipt: SubmissionReceipt = {
        version: 1,
        id: Crypto.randomUUID(),
        userId: app.user.id,
        scope: receiptScope,
        projectId,
        service: service.id,
        startedAt: Date.now(),
        sourceIds: uploaded.map((item) => item.assetId),
        referenceIds: furnitureIds,
        anchorId: isMulti ? uploaded[anchor]!.assetId : null,
      };
      // Confirm the independent recovery route is available before the first paid dispatch.
      const prior = await lookupSubmission(request, receipt);
      operation.assertCurrent();
      if (prior.state !== "not_found") {
        await submissionJournal.claim(receipt);
        throw new Error(
          "These uploads already have a submission to review. Use the status check above.",
        );
      }
      const job = await submitWithReceipt({
        journal: submissionJournal,
        receipt,
        assertCurrent: operation.assertCurrent,
        send: (onDispatch) =>
          request(
            quotedJobEndpoint(service.endpoint),
            stageJobResponseSchema,
            input,
            { expectedCredits: confirmedCredits, onDispatch },
          ),
      });
      operation.assertCurrent();
      // Server acceptance is final even if local draft cleanup fails.
      // Never suggest resubmitting a paid job because device storage is full.
      if (app.user)
        void discardDraft(app.user.id, service.id).catch(() => undefined);
      void app.refresh();
      router.push({
        pathname: "/result/[jobId]",
        params: { jobId: job.jobId, projectId },
      });
    } catch (error) {
      if (
        error instanceof OperationStopped ||
        (operation && !operation.current)
      )
        return;
      try {
        const receipt = await submissionJournal.load(
          await submissionScope(),
          app.user.id,
        );
        operation.assertCurrent();
        setReceiptState({
          owner: app.user.id,
          loading: false,
          receipt,
          error: false,
        });
        setUncertain(receipt !== null);
      } catch {
        if (!operation.current) return;
        setReceiptState({
          owner: app.user.id,
          loading: false,
          receipt: null,
          error: true,
        });
        setUncertain(true);
      }
      if (error instanceof ApiError && error.code === "CREDIT_QUOTE_CHANGED") {
        await app.refresh();
        if (!operation?.current) return;
        show("Please review the updated cost", error.message);
        return;
      }
      show(
        "Your edit needs attention",
        error instanceof Error ? error.message : "Please check your project.",
      );
    } finally {
      locked.current = false;
      if (operation?.current) {
        setBusy(false);
        setPhase("");
      }
      operation?.dispose();
    }
  }
  if (!service)
    return (
      <Page back>
        <Heading>Service unavailable</Heading>
        <Notice>Please choose a currently enabled service.</Notice>
      </Page>
    );
  if (!demo && accessLocked && !pendingReceipt && !uncertain) return <Page back title={service.name}><TrialAllowance /><Notice>This service is not available with your current trial or credit balance.</Notice></Page>;
  return (
    <Page
      back
      scrollEnabled={!painting}
      footer={
      <Button
        title={
          demo
            ? "Preview the processing experience"
            : trialAvailable
              ? "Create trial preview"
              : `Create · ${cost} credits`
        }
        disabled={!feature || uncertain || recoveryBlocked || busy || (!demo && !canFund)}
        busy={busy}
        onPress={() =>
          show(
            demo ? "Preview this edit?" : "Ready to transform?",
            demo
              ? "This simulates processing using a sample result. No file is uploaded and no credits are spent."
              : `${AI_PROCESSING_DISCLOSURE}\n\n${trialAvailable ? "Trial eligibility is checked by the server." : `${cost} credits will be reserved.`}`,
            [
              { title: "Keep editing", secondary: true },
              {
                title: demo ? "Run demo" : AI_PROCESSING_CONFIRM_LABEL,
                action: () => void submit(),
              },
            ],
          )
        }
        icon
      />
      }
      title={service.name}
      right={<Pill>{app.billing?.balance ?? "—"} credits</Pill>}
    >
      <TrialAllowance />
      <Modal visible={busy} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: "#111d17f5", justifyContent: "center", padding: 24 }}>
          <ProcessingAnimation label="Preparing and submitting your photo…" />
        </View>
      </Modal>
      <View accessibilityLabel={files.length ? "Photo selected. Set your direction, then confirm." : "Choose a photo, set your direction, then confirm."} style={{ flexDirection: "row", gap: 7 }}>
        {[0, 1, 2].map(index => <View key={index} style={{ flex: 1, height: 3, borderRadius: 4, backgroundColor: index === 0 || (index === 1 && files.length > 0) ? colors.ink : colors.line }} />)}
      </View>
      <Heading>{isReference ? "Place it.\nPicture it." : "Your room.\nYour direction."}</Heading>
      <Body muted style={{ fontSize: 13 }}>{service.instruction}</Body>
      {recoveryBlocked && (
        <Card>
          <Heading small>
            {receiptState.loading
              ? "Checking your last edit…"
              : "Let’s find your last edit."}
          </Heading>
          <Body muted>
            {receiptState.loading
              ? "Checking this device’s saved submission receipt."
              : "A previous submission needs confirmation. It may already be processing. Checking its status never sends another image job or spends credits."}
          </Body>
          {!receiptState.loading && (
            <Button
              title="Check submission status"
              secondary
              disabled={busy}
              onPress={() => void checkPreviousSubmission()}
            />
          )}
          {pendingReceipt && (
            <Button
              title="Open this project’s history"
              secondary
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/project/[id]",
                  params: { id: pendingReceipt.projectId },
                })
              }
            />
          )}
        </Card>
      )}
      {recoverable && (
        <Card>
          <Heading small>Pick up where you left off.</Heading>
          <Body muted>A saved draft is available on this device.</Body>
          <Button title="Restore my draft" onPress={restoreDraft} />
          <Button
            title="Discard saved draft"
            secondary
            onPress={() => {
              if (app.user)
                void discardDraft(app.user.id, service.id)
                  .then(() => setRecoverable(null))
                  .catch(() =>
                    show("Could not discard draft", "Please try again."),
                  );
            }}
          />
        </Card>
      )}
      {!feature && (
        <Notice warning>
          This service is not currently enabled. Submission is unavailable.
        </Notice>
      )}
      <Label>Property project</Label>
      <Button title={app.projects.find(project => project.id === projectId)?.name ?? "Choose a property"} secondary disabled={busy} onPress={() => setChoosingProject(value => !value)} />
      {(choosingProject || !projectId) && <>
      <View style={{ gap: 8 }}>
        {app.projects.map((project) => (
          <Pressable
            key={project.id}
            accessibilityRole="button"
            accessibilityState={{ selected: project.id === projectId }}
            onPress={() => { setProjectId(project.id); setChoosingProject(false); }}
            style={{
              padding: 14,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor:
                project.id === projectId ? colors.soft : colors.paper,
            }}
          >
            <Body>{project.name}</Body>
          </Pressable>
        ))}
      </View>
      <Button
        title="New property project"
        secondary
        onPress={() => router.push("/new-project")}
      />
      </>}
      {!files.length ? (
        <Card
          style={{
            alignItems: "center",
            borderStyle: "dashed",
            backgroundColor: colors.soft,
            paddingVertical: 30,
          }}
        >
          <ImagePlus color={colors.ink} size={35} />
          <Heading small>
            Add your {isMulti ? "room views" : "source photo"}.
          </Heading>
          <Body muted style={{ textAlign: "center", fontSize: 14 }}>
            Photos are prepared on your device before upload.
          </Body>
        </Card>
      ) : (
        files.map((file, index) => (
          <Card key={isMask ? "painted-source" : file.uri}>
            {file.contentType === "application/pdf" ? (
              <Body>PDF · {file.name}</Body>
            ) : (
              !isMask && (
                <Pressable
                  disabled={busy}
                  accessibilityRole={isReference ? "button" : "image"}
                  accessibilityLabel={
                    isReference
                      ? `Place furniture ${activePin + 1} on the room floor`
                      : "Source photo"
                  }
                  onLayout={(event) => setPinLayout(event.nativeEvent.layout)}
                  onPress={(event) => {
                    if (isReference && furniture.length) {
                      const next = [...pins];
                      try {
                        next[activePin] = normalizedPoint(
                          event.nativeEvent.locationX,
                          event.nativeEvent.locationY,
                          pinLayout.width,
                          pinLayout.height,
                        );
                      } catch {
                        show(
                          "Photo is loading",
                          "Wait for the room photo to finish opening, then place the piece.",
                        );
                        return;
                      }
                      setPins(next);
                      setActivePin(
                        Math.min(activePin + 1, furniture.length - 1),
                      );
                    }
                  }}
                  style={{
                    aspectRatio: file.width / file.height,
                    overflow: "hidden",
                    borderRadius: 14,
                  }}
                >
                  <View
                    pointerEvents="none"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <Image
                      source={{ uri: file.uri }}
                      style={{ width: "100%", height: "100%" }}
                    />
                  </View>
                  {isReference &&
                    pins.map(
                      (pin, i) =>
                        pin && (
                          <View
                            key={i}
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              left: `${pin.x * 100}%`,
                              top: `${pin.y * 100}%`,
                              marginLeft: -15,
                              marginTop: -15,
                              borderRadius: 16,
                              width: 30,
                              height: 30,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: colors.accent,
                            }}
                          >
                            <Body
                              style={{
                                color: colors.paper,
                                fontFamily: "DMBold",
                              }}
                            >
                              {i + 1}
                            </Body>
                          </View>
                        ),
                    )}
                </Pressable>
              )
            )}
            {isMulti && (
              <>
                <Button
                  title={
                    anchor === index
                      ? "Design anchor ✓"
                      : "Use as design anchor"
                  }
                  secondary={anchor !== index}
                  onPress={() => setAnchor(index)}
                />
                <Button
                  title="Move view earlier"
                  secondary
                  disabled={!index}
                  onPress={() => {
                    const reordered = [...files];
                    [reordered[index - 1], reordered[index]] = [
                      reordered[index]!,
                      reordered[index - 1]!,
                    ];
                    setFiles(reordered);
                    if (anchor === index) setAnchor(index - 1);
                    else if (anchor === index - 1) setAnchor(index);
                  }}
                />
              </>
            )}
            {isMask && (
              <MaskEditor
                key={editorRevision}
                ref={mask}
                photo={file}
                custom={service.id === "custom_staging"}
                initialRegions={initialRegions}
                onDrawingChange={setPainting}
              />
            )}
            <Body muted style={{ fontSize: 12 }}>
              {file.name} · {(file.bytes / 1024 / 1024).toFixed(1)} MB
            </Body>
          </Card>
        ))
      )}
      <Button
        title={files.length ? "Choose different photos" : "Choose photos"}
        secondary
        disabled={busy}
        onPress={() => void select("room")}
      />
      {!isMulti && (
        <Button
          title={
            service.id === "floor_plan"
              ? "Choose a PDF floor plan"
              : "Take a photo"
          }
          secondary
          disabled={busy}
          onPress={() =>
            void select(service.id === "floor_plan" ? "pdf" : "camera")
          }
        />
      )}
      {isReference && (
        <>
          <Button
            title={
              furniture.length === 5
                ? "Five furniture pieces selected"
                : `Add furniture photos (${5 - furniture.length} remaining)`
            }
            secondary
            disabled={busy || furniture.length >= 5}
            onPress={() => void select("furniture")}
          />
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {furniture.map((photo, index) => (
              <Pressable
                key={photo.uri}
                accessibilityRole="button"
                accessibilityLabel={`Piece ${index + 1}, ${pins[index] ? "placed" : "not placed"}`}
                accessibilityState={{ selected: activePin === index }}
                disabled={busy}
                onPress={() => setActivePin(index)}
                style={{
                  borderWidth: 2,
                  borderColor:
                    activePin === index ? colors.accent : colors.line,
                  borderRadius: 12,
                  padding: 5,
                }}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={{ width: 68, height: 68, borderRadius: 8 }}
                />
                <Label>
                  Piece {index + 1}
                  {pins[index] ? " ✓" : ""}
                </Label>
              </Pressable>
            ))}
          </View>
          {!!furniture.length && (
            <Card>
              <Label>
                Piece {activePin + 1} ·{" "}
                {pins[activePin] ? "Placed" : "Not placed yet"}
              </Label>
              <Body muted>
                Tap the room photo to place this piece. Select a different piece
                above to move its pin. Adding another photo keeps your existing
                placements.
              </Body>
              {pins[activePin] && (
                <Body muted>
                  Position: {Math.round(pins[activePin]!.x * 100)}% from the
                  left, {Math.round(pins[activePin]!.y * 100)}% from the top.
                </Body>
              )}
              <Button
                title={`Place piece ${activePin + 1} at photo center`}
                secondary
                disabled={busy}
                onPress={() => {
                  const next = [...pins];
                  next[activePin] = { x: 0.5, y: 0.5 };
                  setPins(next);
                }}
              />
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                {(
                  [
                    ["left", "←"],
                    ["up", "↑"],
                    ["down", "↓"],
                    ["right", "→"],
                  ] as const
                ).map(([direction, symbol]) => (
                  <Pressable
                    key={direction}
                    accessibilityRole="button"
                    accessibilityLabel={`Move piece ${activePin + 1} ${direction}`}
                    accessibilityState={{ disabled: busy || !pins[activePin] }}
                    disabled={busy || !pins[activePin]}
                    style={{
                      padding: 14,
                      minWidth: 52,
                      alignItems: "center",
                      borderRadius: 12,
                      backgroundColor: colors.soft,
                      opacity: pins[activePin] ? 1 : 0.5,
                    }}
                    onPress={() =>
                      setPins((current) =>
                        current.map((pin, index) =>
                          index === activePin && pin
                            ? nudgeFurniturePin(pin, direction)
                            : pin,
                        ),
                      )
                    }
                  >
                    <Body>{symbol}</Body>
                  </Pressable>
                ))}
              </View>
              <Button
                title={`Clear placement for piece ${activePin + 1}`}
                secondary
                disabled={busy || !pins[activePin]}
                onPress={() =>
                  setPins((current) =>
                    current.map((pin, index) =>
                      index === activePin ? null : pin,
                    ),
                  )
                }
              />
              <Button
                title={`Remove piece ${activePin + 1}`}
                secondary
                disabled={busy}
                onPress={() => {
                  const next = removeFurniture(
                    furniture,
                    pins,
                    activePin,
                    activePin,
                  );
                  setFurniture(next.furniture);
                  setPins(next.pins);
                  setActivePin(next.active);
                }}
              />
            </Card>
          )}
        </>
      )}
      {(service.id === "virtual_staging" || isMulti) && (
        <>
          <VisualChoiceRail label="Room type" options={roomTypeOptions} selected={roomType} onChange={setRoomType} disabled={busy} />
          <VisualChoiceRail label="Furniture style" options={furnitureStyleOptions} selected={style} onChange={setStyle} disabled={busy} />
          <VisualChoiceRail label="Mood" options={moodOptions} selected={mood} onChange={setMood} disabled={busy} />
        </>
      )}
      {service.id === "twilight" && (
<VisualChoiceRail label="Twilight light" options={twilightVisualOptions} images={{ natural_dusk: require("../../assets/twilight-natural-owner.jpg") }} selected={preset} onChange={value => setPreset(value as typeof preset)} disabled={busy} showAll />
      )}
      {service.id === "exterior_enhancement" && (
        <>
          <Label>Choose your improvements</Label>
          {(
            [
              "clean_driveway",
              "green_grass",
              "blue_sky",
              "remove_leaves",
            ] as const
          ).map((value) => (
            <Button
              key={value}
              title={`${options.includes(value) ? "✓ " : ""}${value.replaceAll("_", " ")}`}
              secondary={!options.includes(value)}
              onPress={() =>
                setOptions((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value],
                )
              }
            />
          ))}
        </>
      )}
      {(isReference || service.id === "virtual_staging" || isMulti) && (
        <Field
          label="Additional direction (optional)"
          multiline
          value={direction}
          onChangeText={setDirection}
          maxLength={600}
          placeholder="A warm, uncluttered room with comfortable seating…"
        />
      )}
      {uncertain && (
        <Notice warning>
          The last request may have been accepted. Open your project and check
          its history before making a new submission.
        </Notice>
      )}
      {!!phase && <Notice>{phase}</Notice>}
      {busy && !demo && (
        <Notice>
          Keep this edit open until submission finishes. Leaving stops further
          uploads, but a job already accepted by the server can still finish.
          Check project history before trying again after an interruption.
        </Notice>
      )}
      <Button
        title="Save draft on this device"
        secondary
        disabled={busy || !files.length || uncertain}
        onPress={() => void keepDraft()}
      />
      <Notice>
        {trialAvailable
          ? "Eligible trial preview. Furnio will confirm availability on the server."
          : `${cost} credits for ${isMulti ? files.length || 2 : 1} output${isMulti ? "s" : ""}. Final eligibility and cost are enforced by the server.`}
      </Notice>

    </Page>
  );
}
