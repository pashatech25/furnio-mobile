import { useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import WebView from "react-native-webview";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { config, demo } from "../config";
import { Button, Notice } from "../ui";
import { allowChallengeNavigation } from "./challenge-navigation";
const message = z
  .object({
    type: z.literal("furnio.turnstile"),
    nonce: z.string(),
    token: z.string().min(10).max(2048),
  })
  .strict();
export function Challenge({
  onToken,
  revision,
  action = "trial-phone",
}: {
  onToken: (token: string) => void;
  revision: number;
  action?: "trial-phone" | "signup-email" | "signin-email" | "password-reset";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const nonce = useMemo(() => Crypto.randomUUID(), [revision, action, attempt]);
  useEffect(() => { setFailed(null); onToken(""); }, [nonce, onToken]);
  if (demo)
    return (
      <Button
        secondary
        title="Complete sample security check"
        onPress={() => onToken("demo-only-security-token")}
      />
    );
  if (Platform.OS === "web")
    return (
      <Notice warning>
        Phone verification is available in the native staging build. This
        browser is a design preview only.
      </Notice>
    );
  // Owned mobile host uses the existing widget's authorized parent domain.
  // Existing website CAPTCHA configuration is not replaced.
  const url = new URL("/v1/challenge", config.mobile);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("action", action);
  return (
    <View style={failed ? undefined : { height: 100 }}>
      {failed ? (
        <View style={{ gap: 8 }}><Notice warning>
          {failed}
        </Notice><Button title="Retry security check" secondary onPress={() => setAttempt((value) => value + 1)} /></View>
      ) : (
        <WebView
          key={nonce}
          source={{ uri: url.href }}
          originWhitelist={[url.origin, "https://challenges.cloudflare.com", "about:blank", "about:srcdoc"]}
          style={{ backgroundColor: "transparent" }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback={false}
          allowsFullscreenVideo={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          mixedContentMode="never"
          onShouldStartLoadWithRequest={(request) => allowChallengeNavigation(url.href, request)}
          onError={() => setFailed("The app could not reach the security check. Reconnect and try again.")}
          onHttpError={() => setFailed("Furnio’s security service is unavailable. This is a service issue, not a problem with your phone number or internet settings.")}
          onMessage={(event) => {
            // No credentials enter this browser. Only the owned challenge document may return a bounded token.
            try {
              const origin = new URL(event.nativeEvent.url);
              if (
                origin.origin !== url.origin ||
                origin.pathname !== url.pathname
              )
                return;
              const payload: unknown = JSON.parse(event.nativeEvent.data);
              if (payload && typeof payload === "object" && "type" in payload &&
                payload.type === "furnio.turnstile.expired" && "nonce" in payload && payload.nonce === nonce) {
                onToken("");
                return;
              }
              const data = message.parse(payload);
              if (data.nonce === nonce) onToken(data.token);
            } catch {
              /* Ignore malformed, stale or foreign-frame messages. */
            }
          }}
        />
      )}
    </View>
  );
}
