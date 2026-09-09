import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import { demo } from "./config";
import { notificationController } from "./notifications";
import { isFurnioActivityNotification } from "./notification-controller";

export function NotificationLifecycle({
  userId,
  ready,
}: {
  userId: string | null;
  ready: boolean;
}) {
  useEffect(() => {
    if (demo || Platform.OS === "web" || !ready) return;
    let disposed = false;
    const cleanup: (() => void)[] = [];
    const synchronize = () => {
      // Optional push failures never block authentication, projects or processing.
      void notificationController.synchronize(userId).catch(() => undefined);
    };
    synchronize();
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") synchronize();
    });
    void import("expo-notifications")
      .then((Notifications) => {
        if (disposed) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: !!userId,
            shouldShowList: !!userId,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        const open = (data: unknown) => {
          if (!disposed && userId && isFurnioActivityNotification(data))
            router.navigate("/(tabs)/activity");
        };
        const tap = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            open(response.notification.request.content.data);
            void Notifications.clearLastNotificationResponseAsync().catch(
              () => undefined,
            );
          },
        );
        const rotation = Notifications.addPushTokenListener(() =>
          synchronize(),
        );
        cleanup.push(
          () => tap.remove(),
          () => rotation.remove(),
          () => Notifications.setNotificationHandler(null),
        );
        void Notifications.getLastNotificationResponseAsync()
          .then((response) => {
            if (response) open(response.notification.request.content.data);
            return Notifications.clearLastNotificationResponseAsync();
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      active.remove();
      cleanup.forEach((fn) => fn());
    };
  }, [userId, ready]);
  return null;
}
