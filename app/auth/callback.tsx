import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { exchangeCallback, supabase } from "../../src/auth/client";
import { Body, Button, Heading, Page } from "../../src/ui";
export default function Callback() {
  const { code, type } = useLocalSearchParams<{
    code?: string;
    type?: string;
  }>();
  const [message, setMessage] = useState("Completing your secure sign-in…");
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!supabase)
        throw new Error("Authentication is unavailable in the design demo.");
      if (code) {
        await exchangeCallback(code);
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session)
        throw new Error("This sign-in link has expired. Request a new link.");
      if (active) router.replace(type === "recovery" ? "/reset-password" : "/");
    })().catch((error) => {
      if (active) setMessage(error.message);
    });
    return () => {
      active = false;
    };
  }, [code, type]);
  return (
    <Page>
      <Heading>Welcome back.</Heading>
      <Body>{message}</Body>
      <Button
        title="Return to sign in"
        secondary
        onPress={() => router.replace("/sign-in")}
      />
    </Page>
  );
}
