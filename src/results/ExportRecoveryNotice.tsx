import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, colors } from "../ui";
import {
  inputRecoverySnapshot,
  recoverNativeInputs,
  subscribeInputRecovery,
} from "../media/native-inputs";
import {
  exportRecoverySnapshot,
  recoverNativeExports,
  subscribeExportRecovery,
} from "./native-export-session";

/** Independent of auth: cleanup problems must not prevent login or sign-out. */
export function ExportRecoveryNotice() {
  const inputReport = useSyncExternalStore(
    subscribeInputRecovery,
    inputRecoverySnapshot,
    inputRecoverySnapshot,
  );
  const report = useSyncExternalStore(
    subscribeExportRecovery,
    exportRecoverySnapshot,
    exportRecoverySnapshot,
  );
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (Platform.OS === "web") return;
    recoverNativeExports();
    recoverNativeInputs();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        recoverNativeExports();
        recoverNativeInputs();
      }
    });
    return () => listener.remove();
  }, []);
  if (!report.failed && !inputReport.failed) return null;
  return (
    <View
      style={{
        padding: 16,
        paddingTop: Math.max(16, insets.top),
        gap: 8,
        backgroundColor: colors.soft,
      }}
    >
      <Body>
        Temporary photo cleanup needs attention. Your original photos, saved
        drafts and cloud projects are unchanged.
      </Body>
      <Button
        secondary
        title="Retry temporary photo cleanup"
        onPress={() => {
          recoverNativeExports();
          recoverNativeInputs();
        }}
      />
    </View>
  );
}
