import { useState } from "react";
import {
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useApp } from "../src/state";
import {
  appleSignIn,
  callbackUrl,
  googleSignIn,
  supabase,
} from "../src/auth/client";
import { demo } from "../src/config";
import { photos } from "../src/services";
import {
  Body,
  Button,
  colors,
  Field,
  Heading,
  Kicker,
  Notice,
  Page,
  styles,
  useDialog,
} from "../src/ui";

export default function SignIn() {
  const app = useApp();
  const show = useDialog();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (app.user) return <Redirect href="/" />;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      show(
        "Let’s try that again",
        error instanceof Error
          ? error.message
          : "Sign-in could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (demo) {
      app.enterDemo();
      return;
    }
    if (!supabase) return;
    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: callbackUrl(),
        },
      });
      if (error) throw error;
      if (!data.session)
        show(
          "Check your inbox",
          "Confirm your email, then return here to sign in.",
        );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    }
  }
  return (
    <Page>
      <ImageBackground
        source={photos.stage}
        resizeMode="cover"
        imageStyle={{ width: "100%", height: "100%" }}
        style={{
          height: 310,
          borderRadius: 24,
          overflow: "hidden",
          justifyContent: "flex-end",
          backgroundColor: colors.ink,
        }}
      >
        <View style={{ padding: 23, backgroundColor: "#102d24b8", gap: 10 }}>
          <Kicker>YOUR NEXT GREAT LISTING</Kicker>
          <Heading style={{ color: colors.paper }}>
            A better view.{"\n"}A beautiful beginning.
          </Heading>
        </View>
      </ImageBackground>
      <View style={styles.between}>
        <Heading small>
          {signup ? "Make room for more." : "Welcome back."}
        </Heading>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSignup(!signup)}
          style={{ paddingVertical: 12 }}
        >
          <Body style={{ fontFamily: "DMBold", fontSize: 14 }}>
            {signup ? "Sign in" : "Join Furnio"}
          </Body>
        </Pressable>
      </View>
      <Body muted>
        {signup
          ? "One account for your photos, projects and credits—everywhere."
          : "Your next listing starts here."}
      </Body>
      {demo ? (
        <Notice>
          This is your interactive app preview. All account details and
          purchases are samples. Nothing is sent to Furnio.
        </Notice>
      ) : (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button
              title="Google"
              secondary
              busy={busy}
              onPress={() => void run(googleSignIn)}
            />
          </View>
          {Platform.OS === "ios" && (
            <View style={{ flex: 1 }}>
              <Button
                title="Apple"
                secondary
                busy={busy}
                onPress={() => void run(appleSignIn)}
              />
            </View>
          )}
        </View>
      )}
      {signup && (
        <Field
          label="Your name"
          autoComplete="name"
          value={name}
          onChangeText={setName}
        />
      )}
      <Field
        label="Email address"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@yourbusiness.com"
      />
      <Field
        label="Password"
        secureTextEntry
        autoComplete={signup ? "new-password" : "current-password"}
        value={password}
        onChangeText={setPassword}
        placeholder={signup ? "Choose a strong password" : "Your password"}
      />
      <Button
        title={
          demo
            ? "Explore the sample app"
            : signup
              ? "Create Furnio Account"
              : "Sign in to Furnio"
        }
        busy={busy}
        onPress={() => void run(submit)}
        icon
      />
      {!signup && (
        <Button
          title="Forgot your password?"
          secondary
          onPress={() =>
            void run(async () => {
              if (demo) {
                show(
                  "Password recovery",
                  "In a configured build, this sends a recovery email through your existing Furnio sign-in system.",
                );
                return;
              }
              if (!email.trim())
                throw new Error("Enter your email address first.");
              const result = await supabase!.auth.resetPasswordForEmail(
                email.trim(),
                { redirectTo: callbackUrl(true) },
              );
              if (result.error) throw result.error;
              show(
                "Check your inbox",
                "If this email has an account, recovery instructions will arrive shortly.",
              );
            })
          }
        />
      )}
      <Text
        style={[
          styles.text,
          { fontSize: 12, color: colors.muted, lineHeight: 19 },
        ]}
      >
        By creating an account you accept Furnio’s Terms of Service and Privacy
        Policy. Marketing is optional.
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL("https://furnio.ai/terms")}
          style={{ paddingVertical: 12 }}
        >
          <Body style={{ fontSize: 14 }}>Terms of Service</Body>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL("https://furnio.ai/privacy")}
          style={{ paddingVertical: 12 }}
        >
          <Body style={{ fontSize: 14 }}>Privacy Policy</Body>
        </Pressable>
      </View>
      <Button
        title="Account privacy & saved requests"
        secondary
        onPress={() => router.push("/account-deletion")}
      />
    </Page>
  );
}
