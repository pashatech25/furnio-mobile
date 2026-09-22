import { ActivityIndicator, View } from "react-native";
import { Body, Button, colors, Heading, Logo, Page } from "./ui";

/** Pending account checks are not errors. Keep recovery actions off the happy path. */
export function WorkspaceOpening({ error, retry, signOut, privacy }: {
  error: string | null;
  retry(): void;
  signOut(): void;
  privacy(): void;
}) {
  if (!error) return <View accessibilityRole="progressbar" accessibilityLabel="Opening your workspace"
    style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 24 }}>
    <Logo width={126} />
    <ActivityIndicator color={colors.ink} />
    <Body muted>Opening your workspace…</Body>
  </View>;
  return <Page>
    <Heading>Let’s reconnect.</Heading>
    <Body>{error}</Body>
    <Button title="Try again" onPress={retry} />
    <Button title="Sign out" secondary onPress={signOut} />
    <Button title="Account privacy" secondary onPress={privacy} />
  </Page>;
}
