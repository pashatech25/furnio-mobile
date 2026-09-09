import { router, Stack, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/state";
import { NotificationLifecycle } from "../src/notification-lifecycle";
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
  if (loading) return <ActivityIndicator color={colors.ink} />;
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
  if (user && !trial && !authenticationRoute && !privacyRoute)
    return (
      <Page>
        <Heading>Opening your workspace.</Heading>
        <Body>{error ?? "Checking your account and verification status…"}</Body>
        {!!error && <Button title="Try again" onPress={() => void refresh()} />}
        <Button
          title="Sign out"
          secondary
          onPress={() =>
            void signOut().catch(() =>
              show(
                "Sign out could not finish",
                "Please try again. This app has not confirmed sign-out.",
              ),
            )
          }
        />
        <Button
          title="Account privacy"
          secondary
          onPress={() => router.push("/account-deletion")}
        />
      </Page>
    );
  return (
    <>
      <NotificationLifecycle
        userId={verified ? user!.id : null}
        ready={!loading && (!user || verified)}
      />
      <Stack
        key={user?.id ?? "signed-out"}
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
          <Stack.Screen name="batch" />
          <Stack.Screen name="new-project" />
          <Stack.Screen name="project/[id]" />
          <Stack.Screen name="studio/[service]" />
          <Stack.Screen name="result/[jobId]" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="auth/deletion-callback" />
        <Stack.Screen name="account-deletion" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    DM: require("@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf"),
    DMMedium: require("@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf"),
    DMBold: require("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"),
    Serif: require("@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf"),
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
          <Navigation />
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
