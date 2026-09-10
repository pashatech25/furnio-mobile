import { useEffect, useState } from "react";
import {
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  Switch,
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
import { Challenge } from "../src/auth/Challenge";
import { signupInput } from "../src/auth/signup";
import { photos } from "../src/services";
import { TrialBadge } from "../src/TrialBadge";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import {
  Body,
  Button,
  colors,
  Field,
  Heading,
  Kicker,
  Logo,
  Notice,
  Page,
  styles,
  useDialog,
} from "../src/ui";

export default function SignIn() {
  const app = useApp();
  const show = useDialog();
  const [signup, setSignup] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [challengeRevision, setChallengeRevision] = useState(0);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const captchaRequired = !!app.runtime?.trial.turnstileSiteKey;
  const securityReady = demo || (!!app.runtime && (!captchaRequired || !!captchaToken));
  const action = signup || confirmationEmail ? "signup-email" : recovery ? "password-reset" : "signin-email";
  useEffect(() => {
    const tick = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    if (!resendAt) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  useEffect(() => { setCaptchaToken(""); setChallengeRevision((value) => value + 1); }, [action]);
  if (app.user) return <Redirect href="/" />;
  async function run(action: () => Promise<void>) {
    if (busy) return;
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
      setCaptchaToken("");
      setChallengeRevision((value) => value + 1);
      setBusy(false);
    }
  }
  async function submit() {
    if (demo) {
      app.enterDemo();
      return;
    }
    if (!supabase) return;
    if (!securityReady) throw new Error("Complete the security check first.");
    const captchaOptions = captchaToken ? { captchaToken } : {};
    if (recovery) {
      if (!email.trim()) throw new Error("Enter your email address first.");
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        ...captchaOptions, redirectTo: callbackUrl(true),
      });
      if (error) throw error;
      show("Check your inbox", "If this account exists, a password-reset link is on its way. Open it on this phone to choose a new password.");
      return;
    }
    if (signup) {
      const { data, error } = await supabase.auth.signUp(signupInput(
        { name, email, password, termsAccepted, marketingAccepted }, callbackUrl(), captchaToken,
      ));
      if (error) throw error;
      if (!data.session) {
        setConfirmationEmail(email.trim());
        setResendAt(Date.now() + 60_000);
        setPassword("");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: captchaOptions,
      });
      if (error) throw error;
    }
  }
  if (confirmationEmail) return (
    <Page>
      <Kicker>YOUR FURNIO ACCOUNT</Kicker>
      <Heading>Check your inbox.</Heading>
      <Body>If this is a new account, we sent a confirmation link to {confirmationEmail}. Open the link on this phone to continue to mobile-number verification.</Body>
      <Notice>Already have an account? Sign in instead. Check your spam folder if the confirmation email has not arrived.</Notice>
      {captchaRequired && <Challenge onToken={setCaptchaToken} revision={challengeRevision} action="signup-email" />}
      <Button title={resendSeconds ? `Resend in ${resendSeconds}s` : "Resend confirmation email"} busy={busy}
        disabled={resendSeconds > 0 || !securityReady}
        onPress={() => void run(async () => {
          if (!supabase || resendSeconds || !securityReady) return;
          const { error } = await supabase.auth.resend({ type: "signup", email: confirmationEmail,
            options: { emailRedirectTo: callbackUrl(), ...(captchaToken ? { captchaToken } : {}) } });
          if (error) throw error;
          setResendAt(Date.now() + 60_000);
          show("Check your inbox", "If confirmation is still needed, a fresh link is on its way.");
        })} />
      <Button title="Return to sign in" secondary onPress={() => { setConfirmationEmail(""); setSignup(false); setRecovery(false); }} />
    </Page>
  );
  return (
    <Page hideHeader>
      <ImageBackground
        source={photos.stage}
        resizeMode="cover"
        imageStyle={{ width: "100%", height: "100%" }}
        style={{
          height: 310,
          marginHorizontal: -23,
          marginTop: -23,
          overflow: "hidden",
          justifyContent: "flex-end",
          backgroundColor: colors.ink,
        }}
      >
        <View style={{ position: "absolute", top: 24, left: 23 }}><Logo white width={114} /></View>
        <Svg pointerEvents="none" width="100%" height="100%" style={{ position: "absolute" }}>
          <Defs><LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.25" stopColor="#102d24" stopOpacity="0" /><Stop offset="0.6" stopColor="#102d24" stopOpacity="0.55" /><Stop offset="1" stopColor="#102d24" stopOpacity="0.93" /></LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#heroFade)" />
        </Svg>
        <TrialBadge enabled={app.runtime?.trial.enabled === true} limit={app.runtime?.trial.successfulOutputLimit ?? 0} />
        <View style={{ padding: 23, gap: 10 }}>
          <Body style={{ color: "#e3c7ad", fontSize: 10, letterSpacing: 1.9 }}>YOUR NEXT LISTING, REIMAGINED</Body>
          <Heading style={{ color: colors.paper }}>
            Great spaces.{"\n"}A fresh perspective.
          </Heading>
        </View>
      </ImageBackground>
      <View style={styles.between}>
        <Heading small>
          {recovery ? "Reset your password." : signup ? "Make room for more." : "Welcome back."}
        </Heading>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { setSignup(recovery ? false : !signup); setRecovery(false); }}
          style={{ paddingVertical: 12 }}
        >
          <Body style={{ fontFamily: "DMBold", fontSize: 14 }}>
            {signup || recovery ? "Sign in" : "Join Furnio"}
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
          This is your interactive app preview. All account details and balances
          are samples. Nothing is sent to Furnio.
        </Notice>
      ) : !recovery && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button
              title="Google"
              secondary
              busy={busy}
              disabled={signup && !termsAccepted}
              onPress={() => void run(googleSignIn)}
            />
          </View>
          {Platform.OS === "ios" && (
            <View style={{ flex: 1 }}>
              <Button
                title="Apple"
                secondary
                busy={busy}
                disabled={signup && !termsAccepted}
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
      {!recovery && <Field
        label="Password"
        secureTextEntry
        autoComplete={signup ? "new-password" : "current-password"}
        value={password}
        onChangeText={setPassword}
        placeholder={signup ? "Choose a strong password" : "Your password"}
      />}
      {signup && <>
        <View style={styles.row}>
          <Switch accessibilityLabel="Accept Terms of Service and Privacy Policy" value={termsAccepted} onValueChange={setTermsAccepted} disabled={busy} />
          <Body style={{ flex: 1 }}>I agree to the Terms of Service and acknowledge the Privacy Policy.</Body>
        </View>
        <View style={styles.row}>
          <Switch accessibilityLabel="Optional product updates and offers" value={marketingAccepted} onValueChange={setMarketingAccepted} disabled={busy} />
          <Body style={{ flex: 1 }}>Email me product updates and offers. Optional; unsubscribe anytime.</Body>
        </View>
      </>}
      {!demo && !app.runtime && <>
        <Notice warning>{app.runtimeError ?? "Connecting to Furnio’s sign-in settings…"}</Notice>
        {!!app.runtimeError && <Button secondary title="Retry connection" onPress={() => void app.refreshRuntime()} />}
      </>}
      {captchaRequired && <Challenge onToken={setCaptchaToken} revision={challengeRevision} action={action} />}
      <Button
        title={
          demo
            ? "Explore the sample app"
            : recovery ? "Send password-reset email" : signup
              ? "Create Furnio Account"
              : "Sign in to Furnio"
        }
        busy={busy}
        disabled={!securityReady || (signup && !demo && !termsAccepted)}
        onPress={() => void run(submit)}
        icon
      />
      {!signup && !recovery && (
        <Button
          title="Forgot your password?"
          secondary
          onPress={() => { setRecovery(true); setSignup(false); }}
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
