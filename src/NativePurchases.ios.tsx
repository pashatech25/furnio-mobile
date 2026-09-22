import { useCallback, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useFocusEffect } from "expo-router";
import type { PurchasesStoreProduct } from "react-native-purchases";
import { mobileApi, useApp } from "./state";
import { capabilitiesSchema, mobileBillingSchema, type MobileBilling } from "./api/schemas";
import { checkRecovery, loadStoreProducts, loadRefundProducts, requestAppleRefund, purchase, purchasesEnabled, restore } from "./commerce";
import { recoveryMessage } from "./recovery-message";
import { recordCommerceDiagnostic } from "./commerce-diagnostics";
import { Body, Button, Card, Heading, Notice } from "./ui";

const storeConfigured = Boolean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith("appl_"));

export function NativePurchases() {
  const app = useApp();
  return <PurchasePanel key={app.user?.id ?? "signed-out"} />;
}

function PurchasePanel() {
  const app = useApp();
  const active = useRef(false);
  const working = useRef(false);
  const requestVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<MobileBilling | null>(null);
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [refundProducts, setRefundProducts] = useState<PurchasesStoreProduct[]>([]);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    recordCommerceDiagnostic("opened", { configured: storeConfigured, signedIn: Boolean(app.user), buildEnabled: purchasesEnabled });
    if (!app.user || !storeConfigured) return;
    const version = ++requestVersion.current;
    const current = () => active.current && version === requestVersion.current;
    setProducts([]);
    setRefundProducts([]);
    setRecoveryReady(false);
    try {
    const capabilities = await mobileApi("/v1/capabilities", capabilitiesSchema);
    recordCommerceDiagnostic("capabilities", { billingReady: capabilities.billingReady, commerceReady: capabilities.commerceReady });
    if (!current()) return;
    setRecoveryReady(capabilities.recoveryReady);
    if (!capabilities.billingReady) { setBilling(null); return; }
    const next = await mobileApi("/v1/billing?store=APP_STORE", mobileBillingSchema);
    recordCommerceDiagnostic("billing", { acquisitionEnabled: next.acquisitionEnabled, catalogCount: next.products.length });
    if (!current()) return;
    setBilling(next);
    setNotice("");
    console.info("Furnio store catalog gates", JSON.stringify({
      buildEnabled: purchasesEnabled, serverEnabled: capabilities.commerceReady,
      accountEnabled: next.acquisitionEnabled, productCount: next.products.length,
    }));
    if (purchasesEnabled && capabilities.commerceReady && next.acquisitionEnabled) {
      recordCommerceDiagnostic("store-request");
      const storeProducts = await loadStoreProducts(app.user.id, next.products);
      recordCommerceDiagnostic("store-result", { storeCount: storeProducts.length });
      if (!current()) return;
      setProducts(storeProducts);
      console.info("Furnio store catalog returned", storeProducts.length);
      if (next.products.length && !storeProducts.length)
        setNotice("Apple has not returned the available products for this device. Reopen this page to retry. No purchase has been made.");
    } else setProducts([]);
    // Optional refund history must not prevent the store catalog from loading.
    if (capabilities.recoveryReady) {
      try {
        const owned = await loadRefundProducts(app.user.id, next.products);
        if (current()) setRefundProducts(owned);
      } catch {
        if (current()) setRefundProducts([]);
      }
    }
    } catch (error) {
      recordCommerceDiagnostic("failed");
      console.warn("Furnio store catalog failed", error && typeof error === "object" && "code" in error ? String(error.code) : "unclassified");
      if (current()) {
        setProducts([]);
        setNotice("Store purchases are temporarily unavailable. Your existing credits remain available.");
      }
    }
  }, [app.user?.id]);

  useFocusEffect(useCallback(() => {
    active.current = true;
    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !working.current) void load();
    });
    return () => {
      active.current = false;
      requestVersion.current++;
      subscription.remove();
    };
  }, [load]));

  async function run(operation: () => ReturnType<typeof restore>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await operation();
      if (!active.current) return;
      const message = recoveryMessage(result.status);
      setNotice(`${message.title}. ${message.body}`);
      await app.refresh();
      await load();
    } catch {
      if (active.current) setNotice("The purchase could not be confirmed. Check purchase recovery before trying again. Existing credits remain safe.");
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function refund(product: PurchasesStoreProduct) {
    if (!app.user || working.current) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    try {
      const outcome = await requestAppleRefund(app.user.id, product);
      if (active.current) setNotice(outcome === "submitted"
        ? "Your request was sent to Apple. Apple decides whether to approve it; submitting a request does not change your credits."
        : outcome === "cancelled" ? "Refund request cancelled. No changes were made."
          : "Apple could not open the refund request. Please try again later.");
    } catch {
      if (active.current) setNotice("The refund request could not be completed. No credits were changed. You can also contact Apple at reportaproblem.apple.com.");
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (!storeConfigured || !app.user) return null;
  const userId = app.user.id;
  return <Card>
    <Heading small>Credits for your next great space.</Heading>
    {billing?.sandbox && <Notice>
      Apple sandbox testing · {billing.sandbox.balance.toLocaleString()} test credits.
      Test purchases are separate from your {billing.balance.toLocaleString()} real credits and do not add to your shared balance.
    </Notice>}
    <Body>Apple purchases use the same Furnio account. Credits purchased here do not expire.</Body>
    {notice ? <Notice>{notice}</Notice> : null}
    {billing?.products.map((item) => {
      const product = products.find((value) => value.identifier === item.productId);
      if (!product) return null;
      return <Card key={item.productId}>
        <Heading small>{item.name}</Heading>
        <Body>{item.credits.toLocaleString()} credits{item.interval === "month" ? " each month" : ""}</Body>
        <Button title={`${product.priceString}${item.interval === "month" ? " / month" : ""}`} busy={busy} onPress={() => void run(() => purchase(userId, product))} />
      </Card>;
    })}
    {!products.length && <Body>New purchases are currently unavailable. You can continue using your existing balance.</Body>}
    {recoveryReady && <>
      <Button secondary title="Restore purchases" busy={busy} onPress={() => void run(() => restore(userId))} />
      <Button secondary title="Check purchase recovery" busy={busy} onPress={() => void run(() => checkRecovery(userId))} />
    </>}
    {refundProducts.length > 0 && <Card>
      <Heading small>Apple purchase support</Heading>
      <Body>Request a refund for the latest purchase of a product. Apple reviews each request.</Body>
      {refundProducts.map(product => <Button key={product.identifier} secondary busy={busy}
        title={`Request refund · ${product.title}`} onPress={() => void refund(product)} />)}
    </Card>}
    <Button secondary title="Manage Apple subscriptions" onPress={() => void Linking.openURL("https://apps.apple.com/account/subscriptions").catch(() => setNotice("Open Settings on your iPhone, tap your Apple Account, then Subscriptions."))} />
    <Body>Monthly subscriptions renew automatically until cancelled in your Apple subscription settings. Cancellation stops future renewals, not credits already purchased.</Body>
    <Button secondary title="Terms of service" onPress={() => void Linking.openURL("https://furnio.ai/terms")} />
    <Button secondary title="Privacy policy" onPress={() => void Linking.openURL("https://furnio.ai/privacy")} />
  </Card>;
}
