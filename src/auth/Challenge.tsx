import { useMemo, useState } from "react";
import { Platform, View } from "react-native";
import WebView from "react-native-webview";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { config, demo } from "../config";
import { Button, Notice } from "../ui";
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
}: {
  onToken: (token: string) => void;
  revision: number;
}) {
  const [failed, setFailed] = useState(false);
  const nonce = useMemo(() => Crypto.randomUUID(), [revision]);
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
  const url = new URL("/v1/challenge", config.mobile);
  url.searchParams.set("nonce", nonce);
  return (
    <View style={{ height: failed ? 125 : 100 }}>
      {failed ? (
        <Notice warning>
          The security check could not load. Check your connection and try
          again.
        </Notice>
      ) : (
        <WebView
          key={nonce}
          source={{ uri: url.href }}
          originWhitelist={[url.origin, "https://challenges.cloudflare.com"]}
          style={{ backgroundColor: "transparent" }}
          javaScriptEnabled
          domStorageEnabled={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          allowsInlineMediaPlayback={false}
          allowsFullscreenVideo={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          mixedContentMode="never"
          onShouldStartLoadWithRequest={(request) => {
            try {
              const target = new URL(request.url);
              return (
                (target.origin === url.origin &&
                  target.pathname === url.pathname) ||
                (!request.isTopFrame &&
                  target.origin === "https://challenges.cloudflare.com")
              );
            } catch {
              return false;
            }
          }}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          onMessage={(event) => {
            // No credentials enter this browser. Only the owned challenge document may return a bounded token.
            try {
              const origin = new URL(event.nativeEvent.url);
              if (
                origin.origin !== url.origin ||
                origin.pathname !== url.pathname
              )
                return;
              const data = message.parse(JSON.parse(event.nativeEvent.data));
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
