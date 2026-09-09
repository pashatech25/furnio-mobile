import { useState } from "react";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { useApp, api } from "../src/state";
import { projectSchema } from "../src/api/schemas";
import { demo } from "../src/config";
import { Body, Button, Field, Heading, Page, useDialog } from "../src/ui";
export default function NewProject() {
  const { addProject } = useApp();
  const show = useDialog();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({
    name: "",
    addressLine1: "",
    addressLine2: "",
    locality: "",
    region: "",
    postalCode: "",
    countryCode: "CA",
  });
  async function create() {
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
    <Page back title="New project">
      <Heading>Every great listing{"\n"}starts somewhere.</Heading>
      <Body muted>Keep the property’s photos and edits together.</Body>
      {(
        Object.entries({
          name: "Project name",
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
          maxLength={
            key === "countryCode"
              ? 2
              : key === "postalCode"
                ? 30
                : ["addressLine2", "locality", "region"].includes(key)
                  ? 120
                  : 160
          }
          onChangeText={(value) =>
            setFields((current) => ({ ...current, [key]: value }))
          }
        />
      ))}
      <Button
        title="Create project"
        busy={busy}
        onPress={() => void create()}
        icon
      />
    </Page>
  );
}
