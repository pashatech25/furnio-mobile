import type {
  History,
  MobileBilling,
  Project,
  Runtime,
  Trial,
} from "../api/schemas";
import { services } from "../services";
export const demoProjectId = "11111111-1111-4111-8111-111111111111";
export const demoJobId = "22222222-2222-4222-8222-222222222222";
export const sampleProjects: Project[] = [
  {
    id: demoProjectId,
    name: "42 Glen Road",
    address: "Toronto, Ontario",
    created_at: "2026-09-08T10:00:00Z",
    archived_at: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "The Parkside Residence",
    address: "Vancouver, British Columbia",
    created_at: "2026-09-07T10:00:00Z",
    archived_at: null,
  },
];
export const sampleHistory: History[] = [
  {
    id: demoJobId,
    featureSlug: "virtual_staging",
    created_at: "2026-09-08T10:00:00Z",
    error: null,
    resultAssetId: "44444444-4444-4444-8444-444444444444",
    resultUrl: null,
    sourceUrl: null,
    resultAccessLevel: "paid",
    status: "succeeded",
  },
];
export const sampleRuntime: Runtime = {
  features: services.map((service, index) => ({
    slug: service.id,
    display_name: service.name,
    description: service.description,
    credits_per_output: 5,
    sort_order: index,
  })),
  trial: {
    enabled: true,
    allowedServiceSlugs: ["virtual_staging", "twilight"],
    successfulOutputLimit: 3,
    unlockCredits: 5,
    turnstileSiteKey: null,
  },
  runtime: { disclosure: {}, image_pipeline: {} },
};
export const sampleTrial: Trial = {
  enabled: true,
  allowedCountryCodes: ["CA", "US", "GB", "AU"],
  allowedServiceSlugs: ["virtual_staging", "twilight"],
  phoneRequired: false,
  phoneVerified: true,
  minimumResendSeconds: 60,
  state: "converted",
  successfulOutputLimit: 3,
  successfulOutputs: 0,
  expiresAt: null,
  turnstileSiteKey: null,
  unlockCredits: 5,
};
export const sampleBilling: MobileBilling = {
  balance: 125,
  subscription: {
    provider: "app_store",
    name: "Furnio 100",
    status: "active",
    currentPeriodEnd: "2026-10-08T10:00:00Z",
    cancelAtPeriodEnd: false,
  },
  products: [
    {
      productId: "demo.pack.50",
      packageKey: "credit_pack_50",
      name: "50 credits",
      credits: 50,
      interval: "one_time",
    },
    {
      productId: "demo.pack.100",
      packageKey: "credit_pack_100",
      name: "100 credits",
      credits: 100,
      interval: "one_time",
    },
    {
      productId: "demo.pack.300",
      packageKey: "credit_pack_300",
      name: "300 credits",
      credits: 300,
      interval: "one_time",
    },
    {
      productId: "demo.pack.1000",
      packageKey: "credit_pack_1000",
      name: "1,000 credits",
      credits: 1000,
      interval: "one_time",
    },
    {
      productId: "demo.plan.100",
      packageKey: "starter_100",
      name: "Furnio 100",
      credits: 105,
      interval: "month",
    },
    {
      productId: "demo.plan.400",
      packageKey: "pro_400",
      name: "Furnio 400",
      credits: 460,
      interval: "month",
    },
    {
      productId: "demo.plan.1200",
      packageKey: "studio_1200",
      name: "Furnio 1200",
      credits: 1500,
      interval: "month",
    },
  ],
  transactions: [
    {
      id: "sample-1",
      provider: "app_store",
      credits: 105,
      label: "Monthly plan credits · sample",
      createdAt: "2026-09-08T10:00:00Z",
    },
    {
      id: "sample-2",
      provider: "admin",
      credits: 25,
      label: "Account credit · sample",
      createdAt: "2026-09-07T10:00:00Z",
    },
  ],
};
