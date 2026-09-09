import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Sparkles, WalletCards } from "lucide-react-native";
import { type PurchasesStoreProduct } from "react-native-purchases";
import { useApp } from "../src/state";
import { demo } from "../src/config";
import { recoveryMessage } from "../src/recovery-message";
import {
  loadStoreProducts,
  purchase,
  purchasesEnabled,
  restore,
  restorationAvailable,
  checkRecovery,
  purchaseRecoveryNotice,
} from "../src/commerce";
import {
  Body,
  Button,
  Card,
  colors,
  Heading,
  Kicker,
  Label,
  Notice,
  Page,
  Pill,
  styles,
  useDialog,
} from "../src/ui";
const providerLabels = {
  stripe: "Website · Stripe",
  app_store: "Apple App Store",
  play_store: "Google Play",
};
export default function Wallet() {
  const app = useApp();
  // Never retain another account's products, checkout reference or async UI.
  return <WalletScreen key={app.user?.id ?? "signed-out"} />;
}
function WalletScreen() {
  const app = useApp();
  const show = useDialog();
  const [tab, setTab] = useState<"one_time" | "month">("one_time");
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] =
    useState<Awaited<ReturnType<typeof purchaseRecoveryNotice>>>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryLoaded, setRecoveryLoaded] = useState(demo);
  const active = useRef(true);
  const operation = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function refreshRecovery() {
    if (demo || !app.user) return;
    try {
      const notice = await purchaseRecoveryNotice(app.user.id);
      if (active.current) {
        setRecovery(notice);
        setRecoveryError("");
      }
    } catch {
      if (active.current)
        setRecoveryError(
          "Purchase recovery could not be read. Reopen this screen or contact support before buying again.",
        );
    } finally {
      if (active.current) setRecoveryLoaded(true);
    }
  }
  useEffect(() => {
    void refreshRecovery();
  }, []);
  function beginOperation() {
    if (!active.current || operation.current) return false;
    operation.current = true;
    setBusy(true);
    return true;
  }
  function finishOperation() {
    operation.current = false;
    if (active.current) setBusy(false);
  }
  function presentRecovery(status: Parameters<typeof recoveryMessage>[0]) {
    if (!active.current) return;
    const message = recoveryMessage(status);
    show(message.title, message.body);
  }
  const items = app.billing?.products ?? [];
  const subscription = app.billing?.subscription;
  const subscriptions =
    app.billing?.subscriptions ??
    (subscription ? [{ ...subscription, id: "current" }] : []);
  useEffect(() => {
    let mounted = true;
    if (purchasesEnabled && app.user)
      void loadStoreProducts(app.user.id, items)
        .then((value) => {
          if (mounted) setProducts(value);
        })
        .catch((error) => {
          if (mounted) setError(error.message);
        });
    return () => {
      mounted = false;
    };
  }, [app.user?.id, items.map((item) => item.productId).join(",")]);
  async function buy(id: string) {
    const item = items.find((item) => item.productId === id);
    if (!item || !app.user || operation.current) return;
    if (demo) {
      show(
        "Sample purchase",
        `This is a design preview of ${item.name}. No payment will be taken.`,
        [
          { title: "Cancel", secondary: true },
          {
            title: "Simulate credits arriving",
            action: () => {
              app.demoPurchase(item.credits);
              show(
                "Your sample credits are here.",
                "This updated only the local demo balance.",
              );
            },
          },
        ],
      );
      return;
    }
    const product = products.find((product) => product.identifier === id);
    if (
      !product ||
      !recoveryLoaded ||
      recovery ||
      recoveryError ||
      !beginOperation()
    )
      return;
    try {
      const result = await purchase(app.user.id, product);
      if (!active.current) return;
      await app.refresh();
      await refreshRecovery();
      presentRecovery(result.status);
    } catch (error) {
      await refreshRecovery();
      if (!active.current) return;
      show(
        "Purchase needs attention",
        "If the store confirmed payment, do not buy again. Refresh or restore purchases. " +
          (error instanceof Error
            ? error.message
            : "Please contact support if it remains pending."),
      );
    } finally {
      finishOperation();
    }
  }
  async function restorePurchases() {
    if (demo) {
      show(
        "Restore purchases",
        "A real restore checks Apple or Google ownership and reconciles existing transactions. It never grants the same credits twice.",
      );
      return;
    }
    if (!app.user || !beginOperation()) return;
    try {
      const result = await restore(app.user.id);
      if (!active.current) return;
      await app.refresh();
      await refreshRecovery();
      presentRecovery(result.status);
    } catch (error) {
      await refreshRecovery();
      if (!active.current) return;
      show(
        "Restore could not finish",
        error instanceof Error ? error.message : "Try again shortly.",
      );
    } finally {
      finishOperation();
    }
  }
  async function checkPurchases() {
    if (!app.user || !beginOperation()) return;
    try {
      const result = await checkRecovery(app.user.id);
      if (!active.current) return;
      await app.refresh();
      await refreshRecovery();
      presentRecovery(result.status);
    } catch {
      await refreshRecovery();
      if (active.current)
        show(
          "Recovery check unavailable",
          "Your checkout is still saved. Try again when connected or contact support. No new payment was opened.",
        );
    } finally {
      finishOperation();
    }
  }
  return (
    <Page back title="Credits & plans">
      <Kicker>ROOM FOR YOUR NEXT IDEA</Kicker>
      <Heading>A little credit.{"\n"}A lot of possibility.</Heading>
      <Card style={{ backgroundColor: colors.ink, padding: 26 }}>
        <View style={styles.between}>
          <Body style={{ color: "#d6e3d9" }}>Your shared balance</Body>
          <WalletCards color="#d6e3d9" size={25} />
        </View>
        <Heading style={{ color: colors.paper, fontSize: 64, lineHeight: 70 }}>
          {app.billing?.balance ?? "—"}
        </Heading>
        <Body style={{ color: "#d6e3d9" }}>
          credits · ready on the app and website
        </Body>
      </Card>
      {recovery && (
        <Card style={{ backgroundColor: colors.soft }}>
          <Kicker>YOUR SAVED CHECKOUT</Kicker>
          <Heading small>{recoveryMessage(recovery.status).title}</Heading>
          <Body>{recoveryMessage(recovery.status).body}</Body>
          <Label>SUPPORT REFERENCE · TAP AND HOLD TO COPY</Label>
          <Text
            selectable
            style={[styles.text, { fontSize: 13, lineHeight: 20 }]}
          >
            {recovery.reference}
          </Text>
          <Button
            title="Check purchase recovery"
            disabled={busy || !restorationAvailable}
            onPress={() => void checkPurchases()}
          />
          <Button
            title="Restore purchases"
            secondary
            disabled={busy || !restorationAvailable}
            onPress={() => void restorePurchases()}
          />
          <Button
            title="Contact Furnio support"
            secondary
            onPress={() => {
              void Linking.openURL("https://furnio.ai/contact").catch(() => {
                if (active.current)
                  show(
                    "Contact support",
                    "Open furnio.ai/contact and include the checkout reference shown here. Never send passwords, payment card details or receipts containing personal information.",
                  );
              });
            }}
          />
        </Card>
      )}
      {!!recoveryError && <Notice warning>{recoveryError}</Notice>}
      {app.billing?.subscriptionConflict && (
        <Notice warning>
          More than one subscription is recorded. Do not start another plan.
          Manage each provider below or contact support.
        </Notice>
      )}
      {subscriptions.map((subscription) => (
        <Card key={subscription.id}>
          <View style={styles.between}>
            <Heading small>{subscription.name}</Heading>
            <Pill>{subscription.status}</Pill>
          </View>
          <Body muted>
            Billed through {providerLabels[subscription.provider]}.{" "}
            {subscription.cancelAtPeriodEnd
              ? "Renewal is cancelled."
              : "Renews automatically."}
          </Body>
          <Body muted>
            {new Date(subscription.currentPeriodEnd).toLocaleDateString(
              "en-CA",
              { month: "long", day: "numeric", year: "numeric" },
            )}
          </Body>
          <Button
            title={`Manage ${subscription.provider === "stripe" ? "website" : subscription.provider === "app_store" ? "Apple" : "Google"} subscription`}
            secondary
            onPress={() => {
              if (demo)
                return show(
                  "Manage your plan",
                  "The live app opens the provider that bills this subscription. Cancelling renewal does not remove purchased native credits.",
                );
              if (subscription.provider === "stripe")
                return show(
                  "Website subscription",
                  "This plan was purchased on the Furnio website. Manage it from the website’s Billing page. Do not start a second subscription in the app.",
                );
              void Linking.openURL(
                subscription.provider === "app_store"
                  ? "https://apps.apple.com/account/subscriptions"
                  : "https://play.google.com/store/account/subscriptions",
              );
            }}
          />
        </Card>
      ))}
      <View
        style={[
          styles.row,
          { backgroundColor: colors.soft, borderRadius: 17, padding: 5 },
        ]}
      >
        {(["one_time", "month"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: value === tab }}
            onPress={() => setTab(value)}
            style={{
              flex: 1,
              padding: 13,
              borderRadius: 13,
              backgroundColor: tab === value ? colors.paper : "transparent",
            }}
          >
            <Body
              style={{
                fontFamily: "DMBold",
                textAlign: "center",
                fontSize: 14,
              }}
            >
              {value === "month" ? "Monthly plans" : "Credit packs"}
            </Body>
          </Pressable>
        ))}
      </View>
      <Body muted>
        {tab === "month"
          ? "Fresh credits each month. Native plan credits never expire—even after cancellation."
          : "Add a little more room. Native credit packs never expire."}
      </Body>
      {!!error && <Notice warning>{error}</Notice>}
      {!demo && !purchasesEnabled && (
        <Notice>
          Purchases are disabled until store configuration and verified credit
          delivery pass staging tests. No charge can be made in this build.
        </Notice>
      )}
      {items
        .filter((item) => item.interval === tab)
        .map((item) => {
          const product = products.find(
            (product) => product.identifier === item.productId,
          );
          const duplicate =
            tab === "month" &&
            !!subscription &&
            subscription.status !== "expired";
          return (
            <Card key={item.productId}>
              <View style={styles.between}>
                <Sparkles size={24} color={colors.accent} />
                <Label>
                  {tab === "month" ? "MONTHLY CREDITS" : "ONE-TIME PACK"}
                </Label>
              </View>
              <Heading small>{item.credits.toLocaleString()} credits</Heading>
              <Body muted>{item.name}</Body>
              <Body style={{ fontFamily: "DMBold" }}>
                {demo
                  ? "Sample offer · store price pending"
                  : (product?.priceString ?? "Store price unavailable")}
                {product && tab === "month" ? " / month" : ""}
              </Body>
              <Button
                title={
                  !demo && (recovery || recoveryError || !recoveryLoaded)
                    ? "Check your saved checkout first"
                    : duplicate
                      ? "You already have a subscription"
                      : demo
                        ? "Preview this purchase"
                        : product
                          ? `Continue · ${product.priceString}`
                          : "Unavailable"
                }
                disabled={
                  busy ||
                  (!demo &&
                    (!purchasesEnabled ||
                      !product ||
                      duplicate ||
                      !recoveryLoaded ||
                      !!recovery ||
                      !!recoveryError))
                }
                onPress={() => void buy(item.productId)}
              />
            </Card>
          );
        })}
      {!items.length && (
        <Notice>
          Store products are not configured yet. Your existing credits remain
          available.
        </Notice>
      )}
      {!recovery && (
        <Button
          title="Restore purchases"
          secondary
          busy={busy}
          disabled={!demo && !restorationAvailable}
          onPress={() => void restorePurchases()}
        />
      )}
      {!demo && restorationAvailable && !recovery && (
        <Button
          title="Check purchase recovery"
          secondary
          disabled={busy}
          onPress={() => void checkPurchases()}
        />
      )}
      <Button
        title="Refresh balance"
        secondary
        onPress={() => void app.refresh()}
      />
      <Body muted style={{ fontSize: 13, lineHeight: 20 }}>
        The store displays your actual local price before payment. Subscriptions
        renew automatically until cancelled through the billing provider.
        Website credit-expiry rules are unchanged. Native purchases do not
        accept website coupon codes.
      </Body>
      <View style={styles.row}>
        <Button
          title="Terms"
          secondary
          onPress={() => void Linking.openURL("https://furnio.ai/terms")}
        />
        <Button
          title="Privacy"
          secondary
          onPress={() => void Linking.openURL("https://furnio.ai/privacy")}
        />
      </View>
      <Heading small>Credit activity</Heading>
      {app.billing?.transactions.map((item) => (
        <View
          key={item.id}
          style={[
            styles.between,
            { borderTopWidth: 1, borderColor: colors.line, paddingTop: 15 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Body>{item.label}</Body>
            <Body muted style={{ fontSize: 12 }}>
              {item.provider === "admin" || item.provider === "furnio"
                ? "Furnio account"
                : providerLabels[item.provider]}{" "}
              · {new Date(item.createdAt).toLocaleDateString()}
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
