// Keep these scoped to native authentication routes. Deletion reauthentication
// appends a random flow ID; allowing only the bare route falls back to Site URL.
export const nativeAuthRedirects = Object.freeze([
  'furnio://auth/callback',
  'furnio://auth/callback?type=recovery',
  'furnio://auth/deletion-callback',
  'furnio://auth/deletion-callback?flow=*',
]);

export function withNativeAuthRedirects(existing) {
  return [...new Set([
    ...(existing ?? '').split(',').filter(Boolean),
    ...nativeAuthRedirects,
  ])].join(',');
}
