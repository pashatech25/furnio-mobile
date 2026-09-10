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
