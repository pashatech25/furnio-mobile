import { router, Stack, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/state";
import { NotificationLifecycle } from "../src/notification-lifecycle";
import { editorNavigationOptions } from "../src/editor/navigation-options";
import { ExportRecoveryNotice } from "../src/results/ExportRecoveryNotice";
import { WorkspaceOpening } from "../src/WorkspaceOpening";
import {
  Body,
  Button,
  colors,
  DialogProvider,
  Heading,
  Page,
  useDialog,
} from "../src/ui";
function Navigation() {
  const {
    user,
    trial,
    loading,
    error,
    refresh,
    signOut,
    devicePrivacyError,
    retryDevicePrivacy,
  } = useApp();
  const show = useDialog();
  const segments = useSegments();
  const authenticationRoute =
    segments[0] === "auth" || segments[0] === "reset-password";
  const privacyRoute = segments[0] === "account-deletion";
  const verified =
    !!user && !!trial && (!trial.phoneRequired || trial.phoneVerified);
  // Keep Android's root navigator alive through auth/phone transitions. Removing
  // it while a warm OAuth intent is being consumed loops Expo's nested state.
  // iOS keeps its already-tested loading and navigator lifecycle.
  const android = Platform.OS === "android";
  const openingWorkspace = !!user && !trial && !authenticationRoute && !privacyRoute;
  if (loading && !android) return <WorkspaceOpening error={null} retry={() => {}} signOut={() => {}} privacy={() => {}} />;
  if (devicePrivacyError && !privacyRoute && !authenticationRoute)
    return (
      <Page>
        <Heading>Finish device cleanup.</Heading>
        <Body>{devicePrivacyError}</Body>
        <Button title="Try device cleanup again" onPress={retryDevicePrivacy} />
        <Button
          title="Account privacy"
          secondary
          onPress={() => router.push("/account-deletion")}
        />
        <Button
          title="Sign out"
          secondary
          onPress={() =>
            void signOut().catch(() =>
              show(
                "Sign out could not finish",
                "Please reconnect and try again.",
              ),
            )
          }
        />
      </Page>
    );
  if (openingWorkspace && !android)
    return (
      <WorkspaceOpening
        error={error}
        retry={() => void refresh()}
        signOut={() =>
            void signOut().catch(() =>
              show(
                "Sign out could not finish",
                "Please try again. This app has not confirmed sign-out.",
              ),
            )
        }
        privacy={() => router.push("/account-deletion")}
      />
    );
  const navigator = (
      <Stack
        key={android ? "android-root" : user?.id ?? "signed-out"}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      >
        <Stack.Protected guard={!user}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && !verified}>
          <Stack.Screen name="verify" />
        </Stack.Protected>
        <Stack.Protected guard={verified}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="wallet" />
          <Stack.Screen name="batch" options={editorNavigationOptions} />
          <Stack.Screen name="new-project" />
          <Stack.Screen name="project/[id]" />
          <Stack.Screen
            name="studio/[service]"
            options={editorNavigationOptions}
          />
          <Stack.Screen name="result/[jobId]" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="auth/deletion-callback" />
        <Stack.Screen name="account-deletion" />
        <Stack.Screen name="reset-password" />
      </Stack>
  );
  return <>
    <NotificationLifecycle userId={verified ? user!.id : null}
      ready={!loading && (!user || verified)} />
    {android ? <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents={loading || openingWorkspace ? "none" : "auto"}
        importantForAccessibility={loading || openingWorkspace ? "no-hide-descendants" : "auto"}>
        {navigator}
      </View>
      {(loading || openingWorkspace) && <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg }}>
        <WorkspaceOpening error={loading ? null : error} retry={() => void refresh()}
          signOut={() => { void signOut().catch(() => show("Sign out could not finish", "Please reconnect and try again.")); }}
          privacy={() => router.push("/account-deletion")} />
      </View>}
    </View> : navigator}
  </>;
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    DM: require("@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf"),
    DMMedium: require("@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf"),
    DMBold: require("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"),
    Serif: require("@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf"),
    Caveat: require("@expo-google-fonts/caveat/600SemiBold/Caveat_600SemiBold.ttf"),
  });
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <AppProvider>
        <DialogProvider>
          <StatusBar style="dark" />
          <ExportRecoveryNotice />
          <Navigation />
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
