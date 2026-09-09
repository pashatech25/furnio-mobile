import { useState } from "react";
import { router } from "expo-router";
import { supabase } from "../src/auth/client";
import { Body, Button, Field, Heading, Page, useDialog } from "../src/ui";
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const show = useDialog();
  async function save() {
    if (password.length < 12 || password !== confirm)
      return show(
        "Check your password",
        "Use at least 12 characters and enter the same password twice.",
      );
    setBusy(true);
    try {
      if (!supabase || !(await supabase.auth.getSession()).data.session)
        throw new Error("Open a fresh recovery link from your email first.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      show(
        "Password updated",
        "Your Furnio account now uses this password on the app and website.",
        [{ title: "Continue", action: () => router.replace("/") }],
      );
    } catch (error) {
      show(
        "Could not update password",
        error instanceof Error
          ? error.message
          : "Please request a new recovery link.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page back>
      <Heading>A fresh start.</Heading>
      <Body muted>
        Choose a strong password for your shared Furnio account.
      </Body>
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
      />
      <Button title="Save password" busy={busy} onPress={() => void save()} />
    </Page>
  );
}
