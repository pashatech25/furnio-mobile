import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { finishDeletionCallback } from "../../src/auth/deletion-callback";
import { Body, Button, Heading, Page } from "../../src/ui";

// useURL() subscribes after this route mounts and can miss the warm Android
// intent that mounted it. Expo's cached native URL includes that latest intent.
export default function AndroidDeletionCallback() {
  const url = Linking.useLinkingURL();
  const [message, setMessage] = useState("Returning to your private account review…");
  useEffect(() => {
    if (!url) {
      setMessage("Return to account privacy and start verification again.");
      return;
    }
    let mounted = true;
    void finishDeletionCallback(url).then(() => {
      if (!mounted) return;
      if (router.canGoBack()) router.back();
      else router.replace("/account-deletion");
    }).catch(() => {
      if (mounted) setMessage("This verification could not be resumed. Return to account privacy and verify again. Your normal sign-in has not been replaced.");
    });
    return () => { mounted = false; };
  }, [url]);
  return <Page>
    <Heading small>Private verification</Heading>
    <Body>{message}</Body>
    <Button title="Return to account privacy" onPress={() =>
      router.canGoBack() ? router.back() : router.replace("/account-deletion")} />
  </Page>;
}
