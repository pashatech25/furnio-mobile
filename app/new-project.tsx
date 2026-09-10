import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { useApp, api } from "../src/state";
import { projectSchema } from "../src/api/schemas";
import { demo } from "../src/config";
import { Body, Button, Field, Heading, Page, useDialog } from "../src/ui";
import { colors, Notice, Card } from "../src/ui";
import { suggestAddresses, temporaryMapUrl, type AddressSuggestion } from "../src/api/addresses";
const mapToken = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
export default function NewProject() {
  const { addProject } = useApp();
  const show = useDialog();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [showUnit, setShowUnit] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [mapFailed, setMapFailed] = useState(false);
  const [fields, setFields] = useState({
    name: "",
    addressLine1: "",
    addressLine2: "",
    locality: "",
    region: "",
    postalCode: "",
    countryCode: "CA",
  });
  useEffect(() => {
    if (manual || demo || query.trim().length < 4 || selectedAddress?.address === query) { setSuggestions([]); setSearching(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setSearching(true); setLookupError("");
      void suggestAddresses(query, mapToken, controller.signal).then((items) => {
        if (!controller.signal.aborted) setSuggestions(items);
      }).catch((error) => {
        if (!controller.signal.aborted) setLookupError(error instanceof Error ? error.message : "Address lookup unavailable.");
      }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 400);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [manual, query, selectedAddress?.address]);
  function chooseAddress(address: AddressSuggestion) {
    setSelectedAddress(address); setQuery(address.address); setSuggestions([]); setMapFailed(false); setLookupError("");
    setFields((current) => ({ ...current, name: current.name || address.addressLine1,
      addressLine1: address.addressLine1, locality: address.locality, region: address.region,
      postalCode: address.postalCode, countryCode: address.countryCode }));
  }
  async function create() {
    if (busy) return;
    if (!manual && !selectedAddress) {
      show("Choose the property", "Select an address suggestion, or choose Manual address to enter it yourself.");
      return;
    }
    if (!fields.name.trim() || !fields.addressLine1.trim()) {
      show("A little more detail", "Enter a project name and street address.");
      return;
    }
    setBusy(true);
    try {
      const address = [
        fields.addressLine1,
        fields.addressLine2,
        fields.locality,
        fields.region,
        fields.postalCode,
        fields.countryCode,
      ]
        .filter(Boolean)
        .join(", ");
      const project = demo
        ? {
            id: Crypto.randomUUID(),
            name: fields.name,
            address,
            created_at: new Date().toISOString(),
            archived_at: null,
          }
        : (
            await api("/api/projects", z.object({ project: projectSchema }), {
              ...fields,
              countryCode: fields.countryCode.toUpperCase(),
              address,
            })
          ).project;
      addProject(project);
      router.replace(`/project/${project.id}`);
    } catch (error) {
      show(
        "Project not created",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page back title="New project" footer={<Button title="Create project" busy={busy} disabled={busy || !fields.name.trim() || !fields.addressLine1.trim() || (!manual && !selectedAddress)} onPress={() => void create()} icon />}>
      <Heading small>Where’s the property?</Heading>
      <Body muted>Keep the property’s photos and edits together.</Body>
      <View style={{ flexDirection: "row", padding: 4, borderRadius: 16, backgroundColor: colors.soft, gap: 4 }}>
        {[[false, "Find address"], [true, "Manual address"]].map(([value, title]) => <Pressable key={String(title)} accessibilityRole="tab" accessibilityState={{ selected: manual === value }} disabled={busy} onPress={() => { setManual(value as boolean); setSuggestions([]); setLookupError(""); }} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 12, backgroundColor: manual === value ? colors.ink : "transparent" }}><Body style={{ fontSize: 14, fontFamily: "DMBold", color: manual === value ? colors.paper : colors.ink }}>{title}</Body></Pressable>)}
      </View>
      {!manual && <>
      <Field label="Find the property address" value={query} placeholder="Start typing a street address" autoComplete="off" editable={!busy}
        onChangeText={(value) => { setQuery(value); setSelectedAddress(null); setSuggestions([]); setLookupError(""); }} />
      {demo && <Notice>Address search connects to Mapbox in the configured app. You can explore the manual fields in this preview.</Notice>}
      {searching && <ActivityIndicator color={colors.ink} accessibilityLabel="Searching addresses" />}
      {!!lookupError && <Notice warning>{lookupError}</Notice>}
      {suggestions.map((item) => <Pressable key={`${item.address}-${item.longitude}`} accessibilityRole="button" accessibilityLabel={`Select ${item.address}`} onPress={() => chooseAddress(item)} style={{ padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}>
        <Body style={{ fontFamily: "DMBold" }}>{item.addressLine1}</Body><Body muted>{item.address}</Body>
      </Pressable>)}
      {selectedAddress && <Card style={{ padding: 10, backgroundColor: colors.soft }}>
        {selectedAddress && !mapFailed && mapToken ? <Image source={{ uri: temporaryMapUrl(selectedAddress, mapToken) }} style={{ width: "100%", aspectRatio: 640 / 280, borderRadius: 12 }} accessibilityLabel={`Property map for ${selectedAddress.address}`} onError={() => setMapFailed(true)} /> : <View style={{ minHeight: 130, justifyContent: "center", gap: 8 }}>
          <Body style={{ fontFamily: "DMBold" }}>{mapFailed ? "Map preview could not load" : "Your property map appears here"}</Body>
          <Body muted>{mapFailed ? "The address is still selected. You can continue or choose the address again to retry." : "Choose a lookup result to see its location. Manual address entry is also available below."}</Body>
        </View>}
        {selectedAddress && <Body>{selectedAddress.address}</Body>}
      </Card>}
      {selectedAddress && <Body muted style={{ fontSize: 12 }}>Address selected. Only the confirmed address is saved, not map coordinates.</Body>}
      </>}
      <Field label="Project name" value={fields.name} placeholder="e.g. 18 Harrison Garden" maxLength={160} editable={!busy} onChangeText={name => setFields(current => ({ ...current, name }))} />
      {!manual && <>
        {!showUnit && !fields.addressLine2 ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => setShowUnit(true)} style={{ paddingVertical: 10 }}><Body style={{ fontSize: 14 }}>+ Add unit or suite (optional)</Body></Pressable> : <Field label="Unit / suite (optional)" value={fields.addressLine2} maxLength={120} editable={!busy} onChangeText={addressLine2 => setFields(current => ({ ...current, addressLine2 }))} />}
      </>}
      {manual && <Card>
      <Body muted>Enter the property address below. Your lookup details are kept when switching modes.</Body>
      {(
        Object.entries({
          addressLine1: "Street address",
          addressLine2: "Unit / suite (optional)",
          locality: "City",
          region: "Province / state",
          postalCode: "Postal / ZIP code",
          countryCode: "Country code (CA, US…)",
        }) as [keyof typeof fields, string][]
      ).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={fields[key]}
          editable={!busy}
          maxLength={
            key === "countryCode"
              ? 2
              : key === "postalCode"
                ? 30
                : ["addressLine2", "locality", "region"].includes(key)
                  ? 120
                  : 160
          }
          onChangeText={(value) => {
            setFields((current) => ({ ...current, [key]: value }));
            if (key !== "name" && key !== "addressLine2") setSelectedAddress(null);
          }}
        />
      ))}
      </Card>}
    </Page>
  );
}
