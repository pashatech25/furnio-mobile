import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Check, ShieldCheck } from "lucide-react-native";
import type { z } from "zod";
import { useApp } from "../src/state";
import { demo } from "../src/config";
import {
  openAccountDeletionService,
  type AccountDeletionService,
} from "../src/account-deletion-service";
import { AccountPrivacyError } from "../src/account-deletion-transport";
import {
  accountDeletionReviewSchema,
  deletionConfirmation,
  deletionNoticeVersion,
  type deletionPreparationSchema,
} from "../src/account-deletion-contract";
import type { DeletionJournalRecord } from "../src/account-deletion-journal";
import type {
  DeletionIdentity,
  DeletionFactor,
  DeletionSignInMethod,
} from "../src/auth/deletion-reauthentication";
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
  Pill,
} from "../src/ui";

type Review = z.infer<typeof accountDeletionReviewSchema>;
type Preparation = z.infer<typeof deletionPreparationSchema>;
const sampleReview: Review = {
  version: 1,
  scope: "shared_furnio_account",
  canRequestDeletion: false,
  accountAccess: "active",
  counts: { projects: 4, storedAssets: 12, unfinishedJobs: 1 },
  subscriptions: [
    {
      provider: "app_store",
      context: "customer",
      count: 1,
      renewalNotCancelled: 1,
    },
  ],
  hasDeveloperWorkspace: false,
  hasAdministratorRole: false,
  linkedProviders: ["email", "apple"],
};
function Acknowledge({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange(value: boolean): void;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={children}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
        minHeight: 48,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: colors.ink,
          backgroundColor: checked ? colors.ink : colors.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={20} color={colors.paper} />}
      </View>
      <Body style={{ flex: 1 }}>{children}</Body>
    </Pressable>
  );
}
export default function AccountDeletion() {
  const { user } = useApp();
  // The key clears all personal review data synchronously on account switching.
  return (
    <PrivacyScreen key={user?.id ?? "signed-out"} userId={user?.id ?? null} />
  );
}
function PrivacyScreen({ userId }: { userId: string | null }) {
  const service = useRef<AccountDeletionService | null>(null);
  const mounted = useRef(true),
    working = useRef(false);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(demo);
  const [error, setError] = useState<string | null>(null);
  const [readReady, setReadReady] = useState(demo),
    [requestReady, setRequestReady] = useState(false),
    [deleteReady, setDeleteReady] = useState(false);
  const [identity, setIdentity] = useState<DeletionIdentity | null>(null);
  const [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [factors, setFactors] = useState<DeletionFactor[]>([]),
    [factorRequested, setFactorRequested] = useState(false);
  const [verified, setVerified] = useState(false),
    [expiresAt, setExpiresAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const [review, setReview] = useState<Review | null>(null),
    [prepared, setPrepared] = useState<Preparation | null>(null);
  const [record, setRecord] = useState<DeletionJournalRecord | null>(null);
  const [sharedAck, setSharedAck] = useState(false),
    [billingAck, setBillingAck] = useState(false),
    [phrase, setPhrase] = useState("");
  const [sampleOutcome, setSampleOutcome] = useState(false);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let ownedService: AccountDeletionService | null = null;
    if (demo)
      return () => {
        mounted.current = false;
      };
    void (async () => {
      const opened = await openAccountDeletionService(userId);
      if (cancelled || !mounted.current) {
        await opened.dispose();
        return;
      }
      ownedService = opened;
      service.current = opened;
      // Receipt recovery does not depend on capabilities, billing or phone status.
      if (opened.receiptOwner) {
        const saved = await opened.journal.read(opened.receiptOwner);
        if (!cancelled && mounted.current) setRecord(saved);
      }
      const caps = await opened.capabilities();
      if (cancelled || !mounted.current) return;
      setReadReady(caps.accountDeletionReviewReady);
      setRequestReady(caps.accountDeletionRequestsReady);
      setDeleteReady(caps.accountDeletionReady);
    })()
      .catch((failure: unknown) => {
        if (!cancelled && mounted.current)
          setError(
            failure instanceof AccountPrivacyError
              ? failure.message
              : "Private account review could not be opened. Any saved receipt has been preserved.",
          );
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoaded(true);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      void ownedService?.dispose();
      if (service.current === ownedService) service.current = null;
    };
  }, [userId]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= expiresAt) {
        setVerified(false);
        setPrepared(null);
        setFactors([]);
        setFactorRequested(false);
        setCode("");
        setPassword("");
        void service.current?.verification?.clearProof();
        setExpiresAt(0);
        setError(
          "Verification expired. Verify your identity again to continue; an unconfirmed review cannot delete your account.",
        );
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  async function run(task: () => Promise<void>, verificationTask = false) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof AccountPrivacyError
          ? failure.message
          : verificationTask
            ? "Verification did not complete. Use the same Furnio account and a linked sign-in method. If you cancelled or chose a different account, return and try again."
            : "This account request could not be completed. Your saved receipt has not been replaced. Refresh its status before trying again.",
      );
      if (service.current?.receiptOwner) {
        try {
          const saved = await service.current.journal.read(
            service.current.receiptOwner,
          );
          if (mounted.current) setRecord(saved);
        } catch {
          /* do not overwrite a corrupt receipt */
        }
      }
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        setPassword("");
        setCode("");
      }
    }
  }
  async function finishVerification(result: {
    ready: boolean;
    factors: DeletionFactor[];
    expiresAt: number;
  }) {
    if (!mounted.current) return;
    setExpiresAt(result.expiresAt);
    setNow(Date.now());
    setFactors(result.factors);
    setVerified(result.ready);
    if (result.ready) {
      const value = await service.current!.review();
      if (mounted.current) setReview(value);
    } else if (!result.factors.length)
      setError(
        "This account requires an authentication factor not yet supported in this build. Account deletion remains blocked; contact Furnio support for help.",
      );
  }
  function authenticate(method: DeletionSignInMethod) {
    const submittedPassword = password;
    setPassword("");
    setPrepared(null);
    setSharedAck(false);
    setBillingAck(false);
    setPhrase("");
    void run(async () => {
      await finishVerification(
        await service.current!.verification!.signIn(method, submittedPassword),
      );
    }, true);
  }
  async function refreshReceipt() {
    const current = service.current;
    if (!current?.receiptOwner) return;
    const value = await current.journal.refresh(current.receiptOwner);
    if (mounted.current) setRecord(value);
  }
  const seconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const pendingConfirmation =
    record?.phase === "confirming" || record?.phase === "queued";
  const needsPreviousReviewCancelled =
    record?.phase === "prepared" && !prepared;
  const canConfirm =
    verified &&
    seconds > 0 &&
    sharedAck &&
    billingAck &&
    phrase === deletionConfirmation &&
    (demo || (deleteReady && !!prepared?.canConfirm));
  return (
    <Page title="Account privacy" back>
      <View style={{ gap: 14 }}>
        <ShieldCheck size={32} color={colors.accent} />
        <Kicker>You stay in control</Kicker>
        <Heading>Your account. Your decision.</Heading>
        <Body muted>
          Review your shared Furnio account before requesting permanent
          deletion. Nothing is deleted just by opening or reviewing this page.
        </Body>
      </View>
      <Card>
        <Heading small>One account, everywhere.</Heading>
        <Body>
          Deletion affects the Furnio website and mobile apps—not just this
          phone. You would lose account access, projects, stored images and
          remaining credits.
        </Body>
        <Body muted>
          Required financial and security records may be retained separately.
          Uninstalling the app or signing out does not delete your account.
        </Body>
        <Notice warning>
          Deleting your account does not automatically cancel an Apple or Google
          subscription. Cancel renewal with the provider first to avoid future
          charges.
        </Notice>
        <Button
          title="Apple subscription settings"
          secondary
          onPress={() =>
            void Linking.openURL(
              "https://apps.apple.com/account/subscriptions",
            ).catch(() =>
              setError(
                "Subscription settings could not open. Open Settings on your Apple device, then your name → Subscriptions.",
              ),
            )
          }
        />
        <Button
          title="Google Play subscriptions"
          secondary
          onPress={() =>
            void Linking.openURL(
              "https://play.google.com/store/account/subscriptions",
            ).catch(() =>
              setError(
                "Open Google Play → Payments & subscriptions → Subscriptions.",
              ),
            )
          }
        />
        <Body muted>
          For a website subscription, use Billing on the Furnio website. Your
          review below identifies any customer or developer subscriptions we
          have on record.
        </Body>
      </Card>
      {!!error && <Notice warning>{error}</Notice>}
      {sampleOutcome ? (
        <Card>
          <Pill>Sample outcome · not a real request</Pill>
          <Heading small>Request received.</Heading>
          <Body>
            A real accepted request would show a saved status here while cleanup
            completes. “Received” does not mean “deleted.” This demonstration
            has not changed your account.
          </Body>
          <Button title="Return to account" onPress={() => router.back()} />
        </Card>
      ) : (
        <>
          {!!record && (
            <Card>
              <Kicker>Saved on this device</Kicker>
              <Heading small>Request status</Heading>
              <Pill>
                {record.phase === "confirming"
                  ? "Confirmation needs checking"
                  : record.phase === "queued"
                    ? "Request received · cleanup pending"
                    : record.phase === "prepared"
                      ? "Reviewed · not submitted"
                      : record.phase}
              </Pill>
              <Body>Reference: {record.capability.requestId}</Body>
              <Body muted>
                {pendingConfirmation
                  ? "Furnio will complete the deletion within 30 days and confirm completion at your account email. Do not submit a second request. Keep this reference; a received request cannot be cancelled here."
                  : record.phase === "preparing"
                    ? "No confirmation was submitted from this receipt. Verify your identity below, then resume the saved review using the same receipt. If the server asks you to review again, refresh this status first."
                    : "This saved review is not a deletion confirmation. If verification was interrupted, cancel the unconfirmed review before preparing a new one."}
              </Body>
              <Button
                title="Refresh saved status"
                secondary
                busy={busy}
                onPress={() => void run(refreshReceipt)}
              />
              {needsPreviousReviewCancelled && verified && (
                <Button
                  title="Cancel unconfirmed review"
                  secondary
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      const value = await service.current!.journal.cancel(
                        userId!,
                      );
                      if (mounted.current) {
                        setRecord(value);
                        setPrepared(null);
                      }
                    })
                  }
                />
              )}
            </Card>
          )}
          {!pendingConfirmation && !review && (
            <Card>
              <Kicker>01 · Verify it's you</Kicker>
              <Heading small>A private account review.</Heading>
              <Body muted>
                Use a sign-in method already linked to this exact Furnio
                account. We never merge or switch accounts during a deletion
                review.
              </Body>
              {demo ? (
                <>
                  <Notice>
                    Sample preview only. Do not enter real credentials. No
                    authentication, deletion or network call will be made.
                  </Notice>
                  <Button
                    title="Preview with sample account"
                    onPress={() => {
                      setReview(sampleReview);
                      setVerified(true);
                      setExpiresAt(Date.now() + 300_000);
                      setNow(Date.now());
                    }}
                  />
                </>
              ) : !loaded ? (
                <Button
                  title="Checking availability…"
                  busy
                  onPress={() => undefined}
                />
              ) : !userId ? (
                <Notice>
                  Sign in to review your account. You can still check a saved
                  request above without signing in.
                </Notice>
              ) : !readReady ? (
                <Notice>
                  Private account review is not enabled in this environment yet.
                  Your account is unchanged. Contact support if you need help
                  with an account privacy request.
                </Notice>
              ) : !identity ? (
                <Button
                  title="Verify my identity"
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      const value =
                        await service.current!.verification!.initialize();
                      if (mounted.current) setIdentity(value);
                    }, true)
                  }
                />
              ) : null}
              {!demo && !!identity && !factors.length && (
                <>
                  {!!identity.email && <Body>{identity.email}</Body>}
                  {identity.methods.includes("password") && (
                    <>
                      <Field
                        label="Your Furnio password"
                        secureTextEntry
                        textContentType="password"
                        autoComplete="current-password"
                        autoCapitalize="none"
                        value={password}
                        onChangeText={setPassword}
                        editable={!busy}
                      />
                      <Button
                        title="Verify with password"
                        busy={busy}
                        disabled={!password}
                        onPress={() => authenticate("password")}
                      />
                    </>
                  )}
                  {identity.methods.includes("google") && (
                    <Button
                      title="Verify with Google"
                      secondary
                      busy={busy}
                      onPress={() => authenticate("google")}
                    />
                  )}
                  {identity.methods.includes("apple") && (
                    <Button
                      title="Verify with Apple"
                      secondary
                      busy={busy}
                      onPress={() => authenticate("apple")}
                    />
                  )}
                  {!identity.methods.length && (
                    <Notice warning>
                      No supported linked sign-in method is available on this
                      device. Contact support; this screen will not create or
                      merge an account.
                    </Notice>
                  )}
                </>
              )}
              {!!factors.length && !verified && (
                <>
                  <Body>Your existing two-step verification is required.</Body>
                  {factors.map((factor, index) => (
                    <Button
                      key={factor.id}
                      title={`${factor.kind === "totp" ? "Authenticator" : "Send SMS code"}${factors.length > 1 ? ` ${index + 1}` : ""}`}
                      secondary
                      busy={busy}
                      onPress={() =>
                        void run(async () => {
                          await service.current!.verification!.challenge(
                            factor.id,
                          );
                          if (mounted.current) setFactorRequested(true);
                        }, true)
                      }
                    />
                  ))}
                  {factorRequested && (
                    <>
                      <Field
                        label="Six-digit security code"
                        value={code}
                        onChangeText={(value) =>
                          setCode(value.replace(/\D/g, "").slice(0, 6))
                        }
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        maxLength={6}
                      />
                      <Button
                        title="Verify security code"
                        busy={busy}
                        disabled={code.length !== 6}
                        onPress={() =>
                          void run(
                            async () =>
                              finishVerification(
                                await service.current!.verification!.verifyCode(
                                  code,
                                ),
                              ),
                            true,
                          )
                        }
                      />
                    </>
                  )}
                </>
              )}
            </Card>
          )}
          {!!review && !pendingConfirmation && (
            <Card>
              <Kicker>
                02 · Review the impact{demo ? " · Sample data" : ""}
              </Kicker>
              <Heading small>Before you go.</Heading>
              {[
                `${review.counts.projects} projects`,
                `${review.counts.storedAssets} stored assets`,
                `${review.counts.unfinishedJobs} unfinished jobs`,
              ].map((item) => (
                <Body key={item}>{item}</Body>
              ))}
              {review.accountAccess === "suspended" && (
                <Notice>
                  You can review account privacy even while customer access is
                  suspended.
                </Notice>
              )}
              {review.hasDeveloperWorkspace && (
                <Notice warning>
                  This account also has a developer workspace. Deletion affects
                  its access and API credentials.
                </Notice>
              )}
              {review.hasAdministratorRole && (
                <Notice warning>
                  This account has an administrator role. An ownership review is
                  required before cleanup can proceed.
                </Notice>
              )}
              {review.subscriptions.length ? (
                review.subscriptions.map((subscription, index) => (
                  <Notice warning key={index}>
                    {subscription.count} {subscription.context} subscription(s)
                    via{" "}
                    {subscription.provider === "app_store"
                      ? "Apple"
                      : subscription.provider === "play_store"
                        ? "Google Play"
                        : "Stripe"}
                    . {subscription.renewalNotCancelled} renewal(s) not recorded
                    as cancelled. Check the billing provider before continuing.
                  </Notice>
                ))
              ) : (
                <Body muted>
                  No relevant subscriptions were returned in this review. Check
                  any store account you have used before proceeding.
                </Body>
              )}
              <Body muted>
                Cancel a subscription to stop renewal. Delete an account only if
                you also want to remove its access and work. Unused native
                credits do not expire merely because you cancel renewal.
              </Body>
              <Pill>
                {verified && seconds > 0
                  ? `Verification remaining · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                  : "Verification expired"}
              </Pill>
              {!verified && (
                <Button
                  title="Verify again"
                  secondary
                  onPress={() => {
                    setReview(null);
                    setIdentity(null);
                    setPrepared(null);
                    setSharedAck(false);
                    setBillingAck(false);
                    setPhrase("");
                  }}
                />
              )}
              {!demo && !prepared && verified && (
                <Button
                  title={
                    record?.phase === "preparing"
                      ? "Resume saved review"
                      : "Prepare final review"
                  }
                  disabled={!requestReady || needsPreviousReviewCancelled}
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      const value = await service.current!.journal.prepare(
                        userId!,
                      );
                      const saved = await service.current!.journal.read(
                        userId!,
                      );
                      if (mounted.current) {
                        setPrepared(value);
                        setReview(value.review);
                        setRecord(saved);
                        setSharedAck(false);
                        setBillingAck(false);
                        setPhrase("");
                      }
                    })
                  }
                />
              )}
              {(demo || prepared) && (
                <>
                  <Acknowledge checked={sharedAck} onChange={setSharedAck}>
                    I understand this deletes my shared Furnio account,
                    including website and app access, projects, images and
                    remaining credits.
                  </Acknowledge>
                  <Acknowledge checked={billingAck} onChange={setBillingAck}>
                    I understand store subscription cancellation is separate and
                    some financial records must be retained.
                  </Acknowledge>
                  <Field
                    label={`Type ${deletionConfirmation}`}
                    value={phrase}
                    onChangeText={setPhrase}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!busy}
                  />
                  <Button
                    title={
                      demo
                        ? "Preview request outcome"
                        : "Request permanent account deletion"
                    }
                    disabled={!canConfirm}
                    busy={busy}
                    onPress={() => {
                      if (demo) {
                        setSampleOutcome(true);
                        setExpiresAt(0);
                        return;
                      }
                      void run(async () => {
                        const value = await service.current!.journal.confirm(
                          userId!,
                          prepared,
                          {
                            confirmation: phrase,
                            acknowledgeSharedAccount: sharedAck,
                            acknowledgeBilling: billingAck,
                          },
                        );
                        if (mounted.current) {
                          setRecord(value);
                          setPrepared(null);
                          setPhrase("");
                          setExpiresAt(0);
                        }
                        await service.current?.verification?.clearProof();
                      });
                    }}
                  />
                  <Body muted>
                    Confirmation notice: {deletionNoticeVersion}
                  </Body>
                </>
              )}
              {!demo && !deleteReady && (
                <Notice warning>
                  Permanent deletion requests are not available in this build. A
                  review is not a submitted deletion request.
                </Notice>
              )}
            </Card>
          )}
        </>
      )}
      <Button
        title="Contact Furnio support"
        secondary
        onPress={() =>
          void Linking.openURL("https://furnio.ai/support").catch(() =>
            setError("Visit furnio.ai/support to contact Furnio."),
          )
        }
      />
    </Page>
  );
}
