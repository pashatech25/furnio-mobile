import { useCallback, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { purchaseGuidance } from "../src/purchase-guidance";
import { useFocusEffect } from "expo-router";
import { WalletCards } from "lucide-react-native";
import { useApp } from "../src/state";
import { demo } from "../src/config";
import {
  Body,
  Button,
  Card,
  colors,
  Heading,
  Kicker,
  Notice,
  Page,
  Pill,
  styles,
} from "../src/ui";

const providerLabels = {
  stripe: "Furnio website",
  app_store: "Apple App Store",
  play_store: "Google Play",
};

export default function Wallet() {
  const app = useApp();
  return <WalletScreen key={app.user?.id ?? "signed-out"} />;
}

function WalletScreen() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (!active.current || refreshing.current) return;
    refreshing.current = true;
    setBusy(true);
    try {
      await app.refresh();
    } finally {
      refreshing.current = false;
      if (active.current) setBusy(false);
    }
  }, [app.refresh]);

  // Read the existing server balance on entry and after returning to the app.
  // No checkout, SDK restore, local credit grant, or automatic redirect.
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void refresh();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
      });
      return () => {
        active.current = false;
        subscription.remove();
      };
    }, [refresh]),
  );

  const balance = app.billing?.balance;
  const subscriptions =
    app.billing?.subscriptions ??
    (app.billing?.subscription
      ? [{ ...app.billing.subscription, id: "current" }]
      : []);

  return (
    <Page back title="Your credits">
      <TrialAllowance />
      <Kicker>ONE ACCOUNT. EVERYWHERE YOU WORK.</Kicker>
      <Heading>Ready for your{"\n"}next great space.</Heading>
      <Card style={{ backgroundColor: colors.ink, padding: 26 }}>
        <View style={styles.between}>
          <Body style={{ color: "#d6e3d9" }}>Your shared balance</Body>
          <WalletCards color="#d6e3d9" size={25} />
        </View>
        <Heading style={{ color: colors.paper, fontSize: 64, lineHeight: 70 }}>
          {balance?.toLocaleString() ?? "—"}
        </Heading>
        <Body style={{ color: "#d6e3d9" }}>
          credits · shared with your Furnio account
        </Body>
      </Card>
      {demo && (
        <Notice>
          Sample balance and activity. No real account is connected.
        </Notice>
      )}
      {app.error && (
        <Notice warning>
          {app.error} The last displayed balance may be out of date.
        </Notice>
      )}
      {balance === undefined && !app.error && (
        <Notice>
          Your balance is not available yet. Refresh when connected.
        </Notice>
      )}
      {balance === 0 && (
        <Card>
          <Heading small>No spendable credits right now.</Heading>
          <Body>
            You can still view your saved projects and eligible results. Any
            available trial previews follow your account’s trial rules.
          </Body>
        </Card>
      )}
      <Body muted>
        Your credits and projects stay with the same account on the app and
        website. Your existing credit expiry and rollover rules are unchanged.
      </Body>
      <Card>
        <Heading small>{Platform.OS === "android" ? "Credits & subscriptions" : "Your Furnio account"}</Heading>
        <Body>{purchaseGuidance(Platform.OS)}</Body>
      </Card>
      <Button
        title="Refresh balance"
        secondary
        busy={busy}
        onPress={() => void refresh()}
      />
      {subscriptions.map((subscription) => (
        <Card key={subscription.id}>
          <View style={styles.between}>
            <Heading small>{subscription.name}</Heading>
            <Pill>{subscription.status}</Pill>
          </View>
          <Body muted>
            Billed through {providerLabels[subscription.provider]}.
          </Body>
          <Body muted>
            {subscription.cancelAtPeriodEnd
              ? "Scheduled to end"
              : "Current period ends"}{" "}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString(
              "en-CA",
              {
                month: "long",
                day: "numeric",
                year: "numeric",
              },
            )}
            .
          </Body>
        </Card>
      ))}
      <Heading small>Recent credit purchases</Heading>
      <Body muted>
        This list shows recent credit packs and subscription grants. Your
        balance also includes eligible rewards and adjustments, less credits
        used.
      </Body>
      {!app.billing?.transactions.length && (
        <Body muted>No recent credit purchases to display.</Body>
      )}
      {app.billing?.transactions.map((item) => (
        <View
          key={item.id}
          style={[
            styles.between,
            {
              borderTopWidth: 1,
              borderColor: colors.line,
              paddingTop: 15,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Body>{item.label}</Body>
            <Body muted style={{ fontSize: 14 }}>
              {item.provider === "admin" || item.provider === "furnio"
                ? "Furnio account"
                : providerLabels[item.provider]}
              {" · "}
              {new Date(item.createdAt).toLocaleDateString()}
            </Body>
          </View>
          <Body style={{ fontFamily: "DMBold" }}>
            {item.credits > 0 ? "+" : ""}
            {item.credits}
          </Body>
        </View>
      ))}
    </Page>
  );
}
import { TrialAllowance } from "../src/TrialAllowance";
