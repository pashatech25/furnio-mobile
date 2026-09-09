import { useEffect, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { ImagePlus } from "lucide-react-native";
import { demo } from "../../src/config";
import {
  getService,
  parseServiceRequest,
  type ServiceId,
} from "../../src/services";
import { api, useApp } from "../../src/state";
import {
  choosePhotos,
  chooseFloorplan,
  uploadPhoto,
  uploadMask,
  type LocalPhoto,
} from "../../src/media";
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
import { canUseTrialPreview } from "../../src/api/funding";
import { ApiError } from "../../src/api/client";
import { quotedJobEndpoint } from "../../src/api/credit-quote";
import { normalizedPoint } from "../../src/editor/geometry";
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
  const show = useDialog();
  const [projectId, setProjectId] = useState(
    params.projectId ?? app.projects[0]?.id ?? "",
  );
  const [files, setFiles] = useState<LocalPhoto[]>([]);
  const [recoverable, setRecoverable] = useState<Draft | null>(null);
  const [initialRegions, setInitialRegions] = useState<PaintRegion[]>([]);
  const [editorRevision, setEditorRevision] = useState(0);
  const [furniture, setFurniture] = useState<LocalPhoto[]>([]);
  const [pins, setPins] = useState<{ x: number; y: number }[]>([]);
  const [activePin, setActivePin] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [roomType, setRoomType] = useState("Living room");
  const [style, setStyle] = useState("Warm contemporary");
  const [mood, setMood] = useState("");
  const [direction, setDirection] = useState("");
  const [preset, setPreset] = useState<TwilightPreset>("natural_dusk");
  const [options, setOptions] = useState<ExteriorEnhancementOption[]>([
    "blue_sky",
  ]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [uncertain, setUncertain] = useState(false);
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
    try {
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
      show(
        "Draft could not be saved",
        error instanceof Error ? error.message : "Keep the editor open.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function select(kind: "room" | "camera" | "furniture" | "pdf") {
    if (locked.current) return;
    try {
      const picked =
        kind === "pdf"
          ? await chooseFloorplan()
          : await choosePhotos(
              kind === "furniture" ? 5 : (service?.max ?? 1),
              kind === "camera",
            );
      if (!picked.length) return;
      if (kind === "furniture") {
        setFurniture(picked);
        setPins([]);
        setActivePin(0);
      } else {
        setFiles(picked);
        setInitialRegions([]);
        setEditorRevision((value) => value + 1);
        setAnchor(0);
        setPins([]);
      }
      setUncertain(false);
    } catch (error) {
      show(
        "Choose another file",
        error instanceof Error
          ? error.message
          : "The file could not be opened.",
      );
    }
  }
  async function submit() {
    if (!service || !feature || locked.current) return;
    if (!projectId) {
      show(
        "Choose a project first",
        "Create a property project to keep your original photos and results together.",
      );
      return;
    }
    if (files.length < service.min || files.length > service.max) {
      show(
        "Add your photos",
        `This service needs ${service.min === service.max ? service.min : `${service.min}–${service.max}`} source photo${service.max > 1 ? "s" : ""}.`,
      );
      return;
    }
    if (
      isReference &&
      (!furniture.length || pins.filter(Boolean).length !== furniture.length)
    ) {
      show(
        "Place every piece",
        "Add your furniture photos and tap the room photo to place each numbered piece.",
      );
      return;
    }
    locked.current = true;
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
      setPhase("Preparing your photo and selections…");
      const regions = isMask ? await mask.current?.export() : null;
      const group = isMulti ? Crypto.randomUUID() : undefined;
      const uploaded = [];
      for (const [index, file] of files.entries()) {
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
      const assetId = uploaded[0]!.assetId;
      let input: unknown;
      switch (service.id) {
        case "virtual_staging":
          input = { assetId, roomType, style, mood, direction };
          break;
        case "multiview":
          input = {
            assetIds: uploaded.map((item) => item.assetId),
            anchorAssetId: uploaded[anchor]!.assetId,
            roomType,
            style,
            mood,
            direction,
          };
          break;
        case "twilight":
          input = { assetId, feature: service.id, preset };
          break;
        case "winter_to_summer":
          input = { assetId, feature: service.id };
          break;
        case "exterior_enhancement":
          input = { assetId, feature: service.id, options };
          break;
        case "floor_plan":
          input = { assetId };
          break;
        case "reference_furniture": {
          const furnitureIds = [];
          for (const photo of furniture)
            furnitureIds.push(
              (
                await uploadPhoto(photo, projectId, service.id, {
                  countsTowardPhotoLimit: false,
                })
              ).assetId,
            );
          input = {
            assetId,
            direction,
            furnitureAssetIds: furnitureIds,
            placements: furnitureIds.map((id, index) => ({
              furnitureAssetId: id,
              ...pins[index],
            })),
          };
          break;
        }
        case "item_removal":
        case "custom_staging": {
          if (!regions?.length) throw new Error("Paint at least one area.");
          const uploadedRegions = [];
          for (const region of regions)
            uploadedRegions.push({
              bbox: region.bbox,
              operation: region.operation,
              instruction: region.instruction,
              regionIndex: region.regionIndex,
              maskKey: await uploadMask(region.binary, service.id),
              compositeMaskKey: await uploadMask(region.composite, service.id),
            });
          input = {
            assetId,
            mode: service.id === "item_removal" ? "remove" : "custom",
            regions: uploadedRegions,
          };
          break;
        }
      }
      setPhase("Submitting your edit with Furnio’s server-side instructions…");
      const job = await api(
        quotedJobEndpoint(service.endpoint),
        stageJobResponseSchema,
        parseServiceRequest(service.id, input),
        { expectedCredits: confirmedCredits },
      );
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
      if (error instanceof ApiError && error.code === "CREDIT_QUOTE_CHANGED") {
        await app.refresh();
        show("Please review the updated cost", error.message);
        return;
      }
      if (
        error &&
        typeof error === "object" &&
        "uncertain" in error &&
        error.uncertain
      )
        setUncertain(true);
      show(
        "Your edit needs attention",
        error instanceof Error ? error.message : "Please check your project.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
      setPhase("");
    }
  }
  if (!service)
    return (
      <Page back>
        <Heading>Service unavailable</Heading>
        <Notice>Please choose a currently enabled service.</Notice>
      </Page>
    );
  return (
    <Page
      back
      title={service.name}
      right={<Pill>{app.billing?.balance ?? "—"} credits</Pill>}
    >
      <Heading>
        {isReference ? "Place it. Make it yours." : "Your photo.\n"}
        {!isReference && "A fresh perspective."}
      </Heading>
      <Body muted>{service.instruction}</Body>
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
      <View style={{ gap: 8 }}>
        {app.projects.map((project) => (
          <Pressable
            key={project.id}
            accessibilityRole="button"
            accessibilityState={{ selected: project.id === projectId }}
            onPress={() => setProjectId(project.id)}
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
                      next[activePin] = normalizedPoint(
                        event.nativeEvent.locationX,
                        event.nativeEvent.locationY,
                        pinLayout.width,
                        pinLayout.height,
                      );
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
                  <Image
                    source={{ uri: file.uri }}
                    style={{ width: "100%", height: "100%" }}
                  />
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
          onPress={() =>
            void select(service.id === "floor_plan" ? "pdf" : "camera")
          }
        />
      )}
      {isReference && (
        <>
          <Button
            title="Add furniture photos (1–5)"
            secondary
            onPress={() => void select("furniture")}
          />
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {furniture.map((photo, index) => (
              <Pressable
                key={photo.uri}
                accessibilityRole="button"
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
            <Notice>
              Tap the room photo to place piece {activePin + 1}. Each pin uses
              image-relative coordinates.
            </Notice>
          )}
        </>
      )}
      {(service.id === "virtual_staging" || isMulti) && (
        <>
          <Field
            label="Room type"
            value={roomType}
            onChangeText={setRoomType}
            maxLength={80}
          />
          <Label>Furniture style</Label>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {[
              "Warm contemporary",
              "Modern",
              "Scandinavian",
              "Traditional",
              "Minimalist",
            ].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => setStyle(value)}
                style={{
                  padding: 12,
                  backgroundColor: style === value ? colors.ink : colors.soft,
                  borderRadius: 12,
                }}
              >
                <Body
                  style={{
                    fontSize: 13,
                    color: style === value ? colors.paper : colors.ink,
                  }}
                >
                  {value}
                </Body>
              </Pressable>
            ))}
          </View>
          <Field
            label="Style (editable)"
            value={style}
            onChangeText={setStyle}
            maxLength={80}
          />
          <Field
            label="Mood (optional)"
            value={mood}
            onChangeText={setMood}
            maxLength={80}
          />
        </>
      )}
      {service.id === "twilight" && (
        <>
          <Label>Twilight light</Label>
          {(["pink_twilight", "blue_hour", "natural_dusk"] as const).map(
            (value) => (
              <Button
                key={value}
                title={value.replaceAll("_", " ")}
                secondary={preset !== value}
                onPress={() => setPreset(value)}
              />
            ),
          )}
        </>
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
      <Button
        title={
          demo
            ? "Preview the processing experience"
            : trialAvailable
              ? "Create trial preview"
              : `Create · ${cost} credits`
        }
        disabled={!feature || uncertain || busy}
        busy={busy}
        onPress={() =>
          show(
            demo ? "Preview this edit?" : "Ready to transform?",
            demo
              ? "This simulates processing using a sample result. No file is uploaded and no credits are spent."
              : `Your selected files will be uploaded for AI processing using Furnio’s service providers and Admin instructions. ${trialAvailable ? "Trial eligibility is checked by the server." : `${cost} credits will be reserved.`}`,
            [
              { title: "Keep editing", secondary: true },
              {
                title: demo ? "Run demo" : "Upload and create",
                action: () => void submit(),
              },
            ],
          )
        }
        icon
      />
    </Page>
  );
}
