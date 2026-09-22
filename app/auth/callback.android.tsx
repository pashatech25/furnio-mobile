import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { callbackUrl, exchangeCallback, supabase } from "../../src/auth/client";
import { matchesAuthReturn } from "../../src/auth/browser-session";
import { androidCallbackDestination } from "../../src/auth/android-callback";
import { useApp } from "../../src/state";
import { WorkspaceOpening } from "../../src/WorkspaceOpening";
import { Body, Button, Heading, Page } from "../../src/ui";

export default function AndroidCallback() {
  // Android can deliver the intent before this route mounts. Read the cached
  // native intent, not an initial-launch URL or a late-only URL subscription.
  const raw = Linking.useLinkingURL();
  const app = useApp();
  const [complete, setComplete] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [message, setMessage] = useState("Completing your secure sign-in…");
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!supabase || !raw || !matchesAuthReturn(raw, callbackUrl()))
        throw new Error("This sign-in link could not be opened. Return to sign in and try again.");
      const url = new URL(raw);
      if (url.hash || url.searchParams.getAll("code").length !== 1)
        throw new Error("This sign-in link is incomplete. Return to sign in and try again.");
      const code = url.searchParams.get("code");
      if (!code || code.length > 2048) throw new Error("Sign-in was not completed.");
      await exchangeCallback(code);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error("This sign-in link has expired. Request a new link.");
      if (active) {
        setRecovery(url.searchParams.get("type") === "recovery");
        setComplete(true);
      }
    })().catch(() => {
      if (active) setMessage("This sign-in could not finish. Return to sign in and try again.");
    });
    return () => { active = false; };
  }, [raw]);
  const destination = androidCallbackDestination({
    complete, loading: app.loading, signedIn: !!app.user, recovery, trial: app.trial,
  });
  useEffect(() => {
    // Wait for the existing server-derived phone/trial rules before choosing an
    // allowed route. Replacing with '/' mid-auth can re-enter a protected route.
    if (destination) router.replace(destination);
  }, [destination]);
  if (complete) return <WorkspaceOpening error={app.error} retry={() => void app.refresh()}
    signOut={() => { void app.signOut().catch(() => setMessage("Sign out could not finish. Reconnect and try again.")); }}
    privacy={() => router.push("/account-deletion")} />;
  return <Page>
    <Heading>Welcome back.</Heading>
    <Body>{message}</Body>
    <Button title="Return to sign in" secondary onPress={() => router.replace("/sign-in")} />
  </Page>;
}
