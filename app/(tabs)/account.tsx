import { useEffect, useState } from "react";
import { Linking, Switch, View } from "react-native";
import { router } from "expo-router";
import {
  CircleHelp,
  CreditCard,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import { useApp } from "../../src/state";
import { demo } from "../../src/config";
import { supabase } from "../../src/auth/client";
import {
  notificationController,
  subscribeNotifications,
} from "../../src/notifications";
import {
  Body,
  Button,
  Card,
  colors,
  Field,
  Heading,
  Kicker,
  Notice,
  Page,
  styles,
  useDialog,
} from "../../src/ui";
export default function Account() {
  const app = useApp();
  const show = useDialog();
  const [name, setName] = useState(app.user?.name ?? "");
  const [editing, setEditing] = useState(false);
  const [push, setPush] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  useEffect(() => {
    if (demo) return;
    let mounted = true;
    const read = () => {
      void notificationController
        .read()
        .then((value) => {
          if (!mounted) return;
          setPush(!!value?.enabled && value.userId === app.user?.id);
          setPushPending(!!value?.pendingDisable);
        })
        .catch(() => undefined);
    };
    const unsubscribe = subscribeNotifications(read);
    read();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [app.user?.id]);
  return (
    <Page>
      <Kicker>YOUR FURNIO</Kicker>
      <Heading>Make yourself{"\n"}at home.</Heading>
      <Card>
        <View style={styles.row}>
          <View
            style={{
              padding: 17,
              backgroundColor: colors.soft,
              borderRadius: 30,
            }}
          >
            <UserRound color={colors.ink} size={26} />
          </View>
          <View style={{ flex: 1 }}>
            <Heading small>{app.user?.name}</Heading>
            <Body muted style={{ fontSize: 14 }}>
              {app.user?.email}
            </Body>
          </View>
        </View>
        <Button
          title="Edit profile name"
          secondary
          onPress={() => setEditing(!editing)}
        />
        {editing && (
          <>
            <Field
              label="Your name"
              value={name}
              onChangeText={setName}
              maxLength={100}
            />
            <Button
              title="Save profile"
              onPress={() => {
                if (demo) {
                  setEditing(false);
                  return show(
                    "Sample profile",
                    "No live profile has been changed.",
                  );
                }
                void supabase?.auth
                  .updateUser({ data: { full_name: name.trim() } })
                  .then(({ error }) => {
                    if (error) show("Could not save", error.message);
                    else setEditing(false);
                  });
              }}
            />
          </>
        )}
      </Card>
      <Card>
        <CreditCard color={colors.accent} size={25} />
        <Heading small>Credits, wherever you work.</Heading>
        <Body muted>
          Your account, images and spendable balance are shared with the Furnio
          website.
        </Body>
        <Button title="Your credits" onPress={() => router.push("/wallet")} />
      </Card>
      <Card>
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontFamily: "DMBold" }}>Photo updates</Body>
            <Body muted style={{ fontSize: 14 }}>
              Optional completion and failure notifications.
            </Body>
          </View>
          <Switch
            accessibilityLabel="Photo notifications"
            value={push}
            disabled={pushBusy}
            trackColor={{ true: colors.ink }}
            onValueChange={(value) => {
              if (demo) {
                setPush(value);
                return;
              }
              if (!app.user) return;
              setPushBusy(true);
              void (
                value
                  ? notificationController.enable(app.user.id)
                  : notificationController.disable()
              )
                .then(() => {
                  setPush(value);
                  show(
                    value
                      ? "Photo updates enabled"
                      : "Photo updates turned off",
                    value
                      ? "Notifications contain only a generic update, never a private photo or property address."
                      : "Furnio will stop sending updates to this installation. A notification already accepted by your device’s provider may still arrive.",
                  );
                })
                .catch((error) =>
                  show("Notifications unavailable", error.message),
                )
                .finally(() => setPushBusy(false));
            }}
          />
        </View>
        {pushBusy && <Body muted>Updating notification settings…</Body>}
        {pushPending && (
          <Notice>
            Notification cleanup is waiting for a connection. New updates are
            off in the app; an already queued update may still arrive. Reopen
            Furnio when connected to finish cleanup.
          </Notice>
        )}
        {!demo && (
          <Button
            title="Device notification settings"
            secondary
            onPress={() => void Linking.openSettings()}
          />
        )}
      </Card>
      <Card>
        <CircleHelp color={colors.accent} size={25} />
        <Heading small>We’re here to help.</Heading>
        <Button
          title="FAQ & support"
          secondary
          onPress={() => void Linking.openURL("https://furnio.ai/faq")}
        />
        <Button
          title="Contact Furnio"
          secondary
          onPress={() => void Linking.openURL("https://furnio.ai/contact")}
        />
      </Card>
      <Card>
        <ShieldCheck color={colors.accent} size={25} />
        <Heading small>Your account. Your choices.</Heading>
        <Button
          title="Privacy policy"
          secondary
          onPress={() => void Linking.openURL("https://furnio.ai/privacy")}
        />
        <Button
          title="Terms of service"
          secondary
          onPress={() => void Linking.openURL("https://furnio.ai/terms")}
        />
        <Button
          title="Account privacy & deletion"
          secondary
          onPress={() => router.push("/account-deletion")}
        />
      </Card>
      <Button
        title="Sign out of this app"
        secondary
        onPress={() =>
          show(
            "See you soon.",
            "This signs out this app without ending your website session. Saved drafts and their private photo copies are removed from this device. Cloud projects, exported photos, purchase-recovery and deletion receipts are kept. Photo updates are turned off; offline notification cleanup finishes when you next connect.",
            [
              { title: "Stay here", secondary: true },
              {
                title: "Sign out",
                action: () =>
                  void app
                    .signOut()
                    .catch((error) => show("Sign out failed", error.message)),
              },
            ],
          )
        }
      />
      <Notice>
        Furnio Mobile · Development build 0.1.0
        {demo ? " · Offline design preview" : ""}. Account privacy and device
        testing must pass release gates before store submission.
      </Notice>
    </Page>
  );
}
