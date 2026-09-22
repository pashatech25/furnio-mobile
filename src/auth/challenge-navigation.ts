// Turnstile's own frames need blank/srcdoc documents. They are never allowed
// to replace the owned top-level challenge page or open unrelated websites.
export function allowChallengeNavigation(
  challengeUrl: string,
  request: { url: string; isTopFrame?: boolean },
): boolean {
  if (request.isTopFrame === false &&
      (request.url === "about:blank" || request.url === "about:srcdoc")) return true;
  try {
    const owned = new URL(challengeUrl);
    const target = new URL(request.url);
    return (target.origin === owned.origin && target.pathname === owned.pathname) ||
      (request.isTopFrame === false && target.origin === "https://challenges.cloudflare.com");
  } catch {
    return false;
  }
}

// Modern Android WebView's WebMessageListener supplies sourceOrigin, not
// the document URL. iOS and Android's legacy bridge supply the full URL.
// Top-level navigation is still pinned above, and Challenge independently
// requires the current random nonce and a bounded, valid token payload.
export function allowChallengeMessageSource(
  challengeUrl: string,
  sourceUrl: string,
  platform: string,
): boolean {
  try {
    const owned = new URL(challengeUrl);
    const source = new URL(sourceUrl);
    if (source.origin !== owned.origin || source.username || source.password)
      return false;
    if (source.pathname === owned.pathname) return true;
    return platform === "android" &&
      (sourceUrl === owned.origin || sourceUrl === `${owned.origin}/`);
  } catch {
    return false;
  }
}
