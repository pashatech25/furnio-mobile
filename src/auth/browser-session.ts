import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export function matchesAuthReturn(raw: string, expected: string): boolean {
  try {
    const url = new URL(raw), target = new URL(expected);
    return url.protocol === target.protocol && url.host === target.host &&
      url.pathname === target.pathname && !url.username && !url.password &&
      [...target.searchParams].every(([name, value]) =>
        url.searchParams.getAll(name).length === 1 && url.searchParams.get(name) === value);
  } catch { return false; }
}

// Android resumes MainActivity before it may deliver the deep-link event.
// Expo's AppState race can therefore report dismissal for a successful return.
// Register first, match the exact destination/flow (not a URL prefix), and give
// only a dismissed Android session a bounded chance to deliver that event.
// The callers still validate and exchange PKCE using their own isolated clients.
export async function openNativeAuthSession(start: string, expected: string) {
  if (Platform.OS !== "android")
    return WebBrowser.openAuthSessionAsync(start, expected);
  let resolveReturn!: (value: WebBrowser.WebBrowserAuthSessionResult) => void;
  const returned = new Promise<WebBrowser.WebBrowserAuthSessionResult>((resolve) => {
    resolveReturn = resolve;
  });
  const subscription = Linking.addEventListener("url", ({ url }) => {
    if (matchesAuthReturn(url, expected)) resolveReturn({ type: "success", url });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  try {
    const browser = WebBrowser.openAuthSessionAsync(start, expected).then(async (result) => {
      if (result.type === "success" || finished) return result;
      return Promise.race([
        returned,
        new Promise<WebBrowser.WebBrowserAuthSessionResult>((resolve) => {
          timer = setTimeout(() => resolve(result), 2000);
        }),
      ]);
    });
    return await Promise.race([returned, browser]);
  } finally {
    finished = true;
    subscription.remove();
    if (timer) clearTimeout(timer);
  }
}
