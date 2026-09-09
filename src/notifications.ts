import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { supabase } from "./auth/client";
import { config } from "./config";
import { createApi } from "./api/client";
import { capabilitiesSchema } from "./api/schemas";
import {
  createNotificationController,
  notificationStateSchema,
  type Installation,
} from "./notification-controller";

const key = `furnio.notifications.v1.${config.mode}`;
const secureOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const responseSchema = z.object({ enabled: z.boolean() });
const listeners = new Set<() => void>();
export function subscribeNotifications(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const publicApi = createApi(config.mobile, async () => null);
const installation = (value: Installation) => ({
  installationId: value.installationId,
  installationSecret: value.installationSecret,
  revision: value.revision,
});
async function session() {
  return (await supabase?.auth.getSession())?.data.session ?? null;
}
async function project() {
  const parsed = z
    .uuid()
    .safeParse(Constants.expoConfig?.extra?.eas?.projectId);
  if (!parsed.success)
    throw new Error("This build has no configured push project.");
  return parsed.data;
}
export const notificationController = createNotificationController({
  read: async () => {
    if (Platform.OS === "web" || config.mode === "demo") return null;
    const raw = await SecureStore.getItemAsync(key, secureOptions);
    if (!raw) return null;
    try {
      return notificationStateSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error(
        "Notification settings could not be opened. Contact support before resetting this installation.",
      );
    }
  },
  write: async (state) => {
    await SecureStore.setItemAsync(key, JSON.stringify(state), secureOptions);
    for (const listener of listeners) listener();
  },
  fresh: async () => ({
    installationId: Crypto.randomUUID(),
    installationSecret: Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    revision: 0,
    userId: null,
    enabled: false,
    pendingDisable: false,
  }),
  currentUser: async () => (await session())?.user.id ?? null,
  permission: async (prompt) => {
    if (Platform.OS === "web" || !Device.isDevice)
      throw new Error(
        "Test push notifications on a physical iPhone or Android device.",
      );
    await project();
    const gates = await publicApi(
      "/v1/capabilities",
      capabilitiesSchema,
      undefined,
      { public: true },
    );
    if (!gates.notificationsReady)
      throw new Error(
        "Push notifications are not enabled in this environment yet.",
      );
    const Notifications = await import("expo-notifications");
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("jobs", {
        name: "Photo updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    const permissions = prompt
      ? await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: false, allowSound: true },
        })
      : await Notifications.getPermissionsAsync();
    return permissions.granted;
  },
  register: async (state, userId) => {
    const preparing = await session();
    if (!preparing || preparing.user.id !== userId)
      throw new Error("Your account changed. Try notification settings again.");
    await createApi(config.mobile, async () => preparing.access_token)(
      "/v1/devices/prepare",
      responseSchema,
      {
        ...installation(state),
        revision: state.revision - 1,
      },
    );
    const Notifications = await import("expo-notifications");
    const projectId = await project();
    // Expo's native token lookup has no AbortSignal. Time out our operation so
    // sign-out is not stuck behind a disconnected device; late results are ignored.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Push registration timed out. Try again when connected.",
              ),
            ),
          10_000,
        );
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    const identity = await session();
    if (!identity || identity.user.id !== userId)
      throw new Error("Your account changed. Try notification settings again.");
    // Freeze the caller; never pick up a replacement account's token between
    // checking identity and sending its registration.
    const api = createApi(config.mobile, async () => identity.access_token);
    return api("/v1/devices", responseSchema, {
      ...installation(state),
      projectId,
      platform: Platform.OS,
      pushToken: token.data,
    });
  },
  disable: async (state) => {
    const Notifications = await import("expo-notifications");
    await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    await Notifications.clearLastNotificationResponseAsync().catch(
      () => undefined,
    );
    return publicApi(
      "/v1/devices/disable",
      responseSchema,
      installation(state),
      { public: true, signal: AbortSignal.timeout(5_000) },
    );
  },
});
