import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { z } from "zod";
import { supabase } from "./auth/client";
import { config, demo } from "./config";
import { createApi } from "./api/client";
import {
  capabilitiesSchema,
  mobileBillingSchema,
  projectSchema,
  runtimeSchema,
  trialSchema,
  type MobileBilling,
  type Project,
  type Runtime,
  type Trial,
} from "./api/schemas";
import {
  sampleBilling,
  sampleProjects,
  sampleRuntime,
  sampleTrial,
} from "./data/demo";
import { meResponseSchema } from "./contracts/auth";
import { notificationController } from "./notifications";
import { setDraftOwner } from "./drafts";
import { createDevicePrivacyLifecycle } from "./device-privacy-lifecycle";

const token = async () =>
  (await supabase?.auth.getSession())?.data.session?.access_token ?? null;
export const api = createApi(config.platform, token);
export const mobileApi = createApi(config.mobile, token);
type User = { id: string; email: string; name: string };
type State = {
  user: User | null;
  loading: boolean;
  error: string | null;
  runtime: Runtime | null;
  trial: Trial | null;
  projects: Project[];
  billing: MobileBilling | null;
  refresh: () => Promise<void>;
  enterDemo: () => void;
  signOut: () => Promise<void>;
  devicePrivacyError: string | null;
  retryDevicePrivacy: () => void;
  addProject: (project: Project) => void;
  demoPurchase: (credits: number) => void;
};
const Context = createContext<State | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const [devicePrivacyError, setDevicePrivacyError] = useState<string | null>(
    null,
  );
  const [privacyRetry, setPrivacyRetry] = useState(0);
  const [runtime, setRuntime] = useState<Runtime | null>(
    demo ? sampleRuntime : null,
  );
  const [trial, setTrial] = useState<Trial | null>(demo ? sampleTrial : null);
  const [projects, setProjects] = useState<Project[]>(
    demo ? sampleProjects : [],
  );
  const [billing, setBilling] = useState<MobileBilling | null>(
    demo ? sampleBilling : null,
  );
  const identityEpoch = useRef(0);
  const clearPrivate = useCallback(() => {
    identityEpoch.current += 1;
    setUser(null);
    setTrial(null);
    setProjects([]);
    setBilling(null);
    setError(null);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let authEventReceived = false;
    const privacy = createDevicePrivacyLifecycle<User>({
      setOwner: setDraftOwner,
      starting: () => {
        clearPrivate();
        setLoading(true);
        setDevicePrivacyError(null);
      },
      ready: (next) => {
        setUser(next);
        setLoading(false);
      },
      failed: (next) => {
        setUser(next);
        setLoading(false);
        setDevicePrivacyError(
          "Saved draft cleanup could not finish on this device. Unlock your device and try again. Your cloud projects and payment records have not been deleted.",
        );
      },
    });
    const accept = (
      session: {
        user: {
          id: string;
          email?: string;
          user_metadata?: Record<string, unknown>;
        };
      } | null,
    ) => {
      if (!mounted) return;
      // Do not await SDK calls inside its auth callback. Draft cleanup has no Auth calls.
      void privacy.accept(
        session
          ? {
              id: session.user.id,
              email: session.user.email ?? "",
              name:
                typeof session.user.user_metadata?.full_name === "string"
                  ? session.user.user_metadata.full_name
                  : "there",
            }
          : null,
      );
    };
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!authEventReceived) accept(data.session);
      })
      .catch(() => {
        if (!authEventReceived && mounted) {
          accept(null);
          setError("Your saved session could not be opened. Sign in again.");
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      authEventReceived = true;
      if (event === "TOKEN_REFRESHED") return;
      accept(session);
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    });
    return () => {
      mounted = false;
      privacy.dispose();
      data.subscription.unsubscribe();
      appState.remove();
    };
  }, [clearPrivate, privacyRetry]);
  useEffect(() => {
    if (!demo)
      void api("/api/public-config", runtimeSchema, undefined, { public: true })
        .then(setRuntime)
        .catch((error) => setError(error.message));
  }, []);
  const refresh = useCallback(async () => {
    if (demo || !user || loading || devicePrivacyError) return;
    const epoch = identityEpoch.current;
    const current = () => epoch === identityEpoch.current;
    setError(null);
    try {
      await api("/api/me", meResponseSchema); // Enforces suspended/developer-only access on the existing customer API.
      const latestRuntime = await api(
        "/api/public-config",
        runtimeSchema,
        undefined,
        { public: true },
      );
      if (!current()) return;
      setRuntime(latestRuntime);
      let status = (await api("/api/trial", z.object({ trial: trialSchema })))
        .trial;
      if (!current()) return;
      if (status.phoneRequired && !status.phoneVerified) {
        const reconciled = await api(
          "/api/trial/phone/reconcile",
          z.object({ reconciled: z.boolean(), trial: trialSchema }),
          {},
        ).catch(() => null);
        if (reconciled) status = reconciled.trial;
      }
      if (!current()) return;
      setTrial(status);
      if (status.phoneRequired && !status.phoneVerified) return;
      const list = await api(
        "/api/projects",
        z.object({ projects: z.array(projectSchema) }),
      );
      if (!current()) return;
      setProjects(list.projects);
      // No fake billing fallback if mobile compatibility has not been released.
      const capabilities = await mobileApi(
        "/v1/capabilities",
        capabilitiesSchema,
      );
      if (capabilities.billingReady) {
        const store = Platform.OS === "ios" ? "APP_STORE" : "PLAY_STORE";
        const next = await mobileApi(
          `/v1/billing?store=${store}`,
          mobileBillingSchema,
        );
        if (current()) setBilling(next);
      } else {
        const credits = await api(
          "/api/credits/balance",
          z.object({ balance: z.number().int() }),
        );
        if (current())
          setBilling({
            balance: credits.balance,
            subscription: null,
            products: [],
            transactions: [],
          });
      }
    } catch (error) {
      if (current())
        setError(
          error instanceof Error
            ? error.message
            : "Could not load your account.",
        );
    }
  }, [user, loading, devicePrivacyError]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const value = useMemo<State>(
    () => ({
      user,
      loading,
      error,
      runtime,
      trial,
      projects,
      billing,
      refresh,
      devicePrivacyError,
      retryDevicePrivacy: () => setPrivacyRetry((value) => value + 1),
      enterDemo: () => {
        setUser({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Alex",
          email: "alex@example.com",
        });
        setTrial(sampleTrial);
        setProjects(sampleProjects);
        setBilling(sampleBilling);
      },
      signOut: async () => {
        if (supabase) {
          // Erase only this installation's indexed draft copies/settings before sign-out.
          // Purchase, batch, notification and deletion receipts use separate namespaces.
          await setDraftOwner(null).catch(() => undefined);
          // Persist a disable intent first. Offline cleanup retries on next app
          // foreground; optional push must not prevent customer sign-out.
          await notificationController.disable().catch(() => undefined);
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) {
            // Auth remains signed in. Restore access to an empty local draft store.
            await setDraftOwner(user?.id ?? null).catch(() => {
              setDevicePrivacyError(
                "Device draft cleanup needs attention. Unlock this device and try again; cloud work and receipts are preserved.",
              );
            });
            throw error;
          }
        }
        clearPrivate();
      },
      addProject: (project) => setProjects((current) => [project, ...current]),
      demoPurchase: (credits) => {
        if (demo)
          setBilling((current) =>
            current
              ? { ...current, balance: current.balance + credits }
              : current,
          );
      },
    }),
    [
      user,
      loading,
      error,
      runtime,
      trial,
      projects,
      billing,
      refresh,
      clearPrivate,
      devicePrivacyError,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const state = useContext(Context);
  if (!state) throw new Error("AppProvider is missing");
  return state;
}
