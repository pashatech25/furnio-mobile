import { z } from "zod";
import { boundedJson, HttpError } from "./http";
import type { NativeEvent } from "./revenuecat-webhook";
import {
  isRefundEvent,
  verifyRefundHistory,
  type VerifiedRefundState,
} from "./refund-state";
import {
  eventPageCursor,
  historyEntrySchema,
  normalizeHistoryEntry,
} from "./recovery-history";

const id = z.string().min(1).max(512);
const timestamp = z.number().int().safe().nonnegative();
const money = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  gross: z.number().finite(),
});
const ownership = {
  id,
  customer_id: id,
  original_customer_id: id,
  environment: z.enum(["sandbox", "production"]),
  store: z.string(),
  ownership: z.string(),
};
const purchaseSchema = z.object({
  ...ownership,
  product_id: id,
  purchased_at: timestamp,
  quantity: z.number().int().positive(),
  status: z.enum(["owned", "refunded"]),
  store_purchase_identifier: id,
});
const subscriptionSchema = z.object({
  ...ownership,
  product_id: id.nullable(),
  current_period_ends_at: timestamp.nullable(),
  status: z.string(),
  gives_access: z.boolean(),
  pending_payment: z.boolean(),
  auto_renewal_status: z.string(),
});
const transactionSchema = z.object({
  id,
  purchased_at: timestamp,
  product_store_identifier: id,
  expiration_date: timestamp.nullable().optional(),
  revenue_in_local_currency: money.nullable().optional(),
});
const productSchema = z.object({
  id,
  store_identifier: id,
  app_id: id,
  type: z.string(),
});
export type VerifiedNativePurchase = {
  userId: string;
  environment: NativeEvent["environment"];
  store: NativeEvent["store"];
  transactionId: string;
  familyId: string;
  productId: string;
  purchasedAt: string;
  periodEnd: string | null;
  priceAmount: number | null;
  currency: string | null;
};
export type VerifiedNativeEvent = {
  purchase: VerifiedNativePurchase;
  grant: boolean;
  refund: boolean;
  refundState?: VerifiedRefundState;
  subscription: null | {
    productId: string;
    status:
      | "active"
      | "trialing"
      | "grace_period"
      | "billing_retry"
      | "expired";
    periodEnd: string;
    cancelAtPeriodEnd: boolean;
    verifiedAt: string;
  };
};
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

/** Read-only RevenueCat v2 verification. No provider secrets or receipts in logs. */
export class RevenueCatVerifier {
  private readonly prefix: string;
  private requests = 0;
  constructor(
    private readonly config: {
      projectId: string;
      apiKey: string;
      appIds: readonly string[];
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (
      !/^[a-zA-Z0-9_-]{3,100}$/.test(config.projectId) ||
      config.apiKey.length < 20
    )
      throw new HttpError(503, "Native verification is not configured.");
    this.prefix = `/v2/projects/${config.projectId}`;
  }
  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (++this.requests > 40)
      throw new HttpError(
        503,
        "Purchase reconciliation needs another attempt.",
      );
    // Pagination can NEVER redirect the secret API key to another host/project.
    if (
      !path.startsWith(this.prefix + "/") ||
      path.includes("://") ||
      path.includes("\\")
    )
      throw new HttpError(502, "Invalid verification endpoint.");
    const url = new URL(path, "https://api.revenuecat.com");
    if (
      url.origin !== "https://api.revenuecat.com" ||
      !url.pathname.startsWith(this.prefix + "/")
    )
      throw new HttpError(502, "Invalid verification endpoint.");
    // Preserve the native workerd receiver when fetch is stored on the adapter.
    const response = await this.fetcher.call(globalThis, url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(
        response.status === 429 ? 503 : 502,
        "Store verification is temporarily unavailable.",
      );
    }
    const parsed = schema.safeParse(await boundedJson(response, 524_288));
    if (!parsed.success)
      throw new HttpError(502, "Store verification response is incompatible.");
    return parsed.data;
  }
  private async list<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
    const result: T[] = [];
    const visited = new Set<string>();
    const basePath = new URL(path, "https://api.revenuecat.com").pathname;
    while (true) {
      if (visited.has(path) || visited.size >= 12)
        throw new HttpError(
          503,
          "Purchase history needs another reconciliation pass.",
        );
      visited.add(path);
      const page = await this.get(
        path,
        z.object({
          items: z.array(schema).max(100),
          next_page: z.string().nullable().optional(),
        }),
      );
      result.push(...page.items);
      if (!page.next_page) return result;
      if (
        new URL(page.next_page, "https://api.revenuecat.com").pathname !==
        basePath
      )
        throw new HttpError(502, "Invalid verification pagination.");
      path = page.next_page;
    }
  }
  private checkOwner(
    value: z.infer<typeof purchaseSchema> | z.infer<typeof subscriptionSchema>,
    event: NativeEvent,
  ) {
    if (
      value.customer_id !== event.app_user_id ||
      value.original_customer_id !== event.app_user_id ||
      value.ownership !== "purchased" ||
      value.environment !== event.environment.toLowerCase() ||
      value.store !== event.store.toLowerCase()
    )
      throw new HttpError(
        409,
        "Store purchase ownership does not match this Furnio account.",
      );
  }
  async customerEventPage(
    userId: string,
    environment: NativeEvent["environment"],
    cursor: string | null,
  ) {
    if (!z.uuid().safeParse(userId).success || (cursor && cursor.length > 1500))
      throw new HttpError(400, "Invalid recovery account or cursor.");
    const path = `${this.prefix}/customers/${encodeURIComponent(userId)}/events`;
    const query = new URLSearchParams({
      environment: environment.toLowerCase(),
      limit: "20",
    });
    if (cursor) query.set("starting_after", cursor);
    const page = await this.get(
      `${path}?${query}`,
      z.object({
        items: z.array(historyEntrySchema).max(20),
        next_page: z.string().nullable().optional(),
      }),
    );
    const nextCursor = eventPageCursor(page.next_page, path);
    if (nextCursor && nextCursor === cursor)
      throw new HttpError(502, "Recovery pagination did not advance.");
    const events: { event: NativeEvent; bodyHash: string }[] = [];
    let issues = 0;
    for (const item of page.items) {
      const parsed = await normalizeHistoryEntry(
        item,
        userId,
        environment,
        this.config.appIds,
      );
      if (parsed === "review") issues++;
      else if (parsed !== "ignored") events.push(parsed);
    }
    return { events, nextCursor, issues };
  }
  /** A risk check, NOT proof of an absent charge and never payment authority.
   * Used only with the SDK's explicit cancellation report and an owned DB lease.
   * A slow, incomplete or incompatible history must leave checkout protected.
   */
  async hasCancellationConflict(context: {
    userId: string;
    environment: NativeEvent["environment"];
    store: NativeEvent["store"];
    kind: "consumable" | "subscription";
    launchedAt: string;
  }): Promise<boolean> {
    if (
      !z.uuid().safeParse(context.userId).success ||
      !z.iso.datetime({ offset: true }).safeParse(context.launchedAt).success
    )
      throw new HttpError(400, "Invalid cancellation context.");
    const since = Math.floor(Date.parse(context.launchedAt) / 1000) * 1000;
    const path = `${this.prefix}/customers/${encodeURIComponent(context.userId)}`;
    const environment = context.environment.toLowerCase();
    const subscriptions = await this.list(
      `${path}/subscriptions?limit=100`,
      subscriptionSchema,
    );
    for (const item of subscriptions) {
      if (item.environment !== environment) continue;
      if (
        item.customer_id !== context.userId ||
        item.original_customer_id !== context.userId ||
        item.ownership !== "purchased"
      )
        return true;
      // Apple can report PURCHASE_CANCELLED for an already-owned subscription.
      // Do not block cancelling a credit-pack sheet solely because a plan exists.
      if (
        context.kind === "subscription" &&
        (item.status !== "expired" || item.gives_access || item.pending_payment)
      )
        return true;
    }
    const purchases = await this.list(
      `${path}/purchases?limit=100`,
      purchaseSchema,
    );
    for (const item of purchases) {
      if (item.environment !== environment) continue;
      if (
        item.customer_id !== context.userId ||
        item.original_customer_id !== context.userId ||
        item.ownership !== "purchased"
      )
        return true;
      // Conservatively hold any recent purchase in this store, even a refund.
      if (
        item.store === context.store.toLowerCase() &&
        item.purchased_at >= since
      )
        return true;
    }
    const history = await this.list(
      `${path}/events?environment=${environment}&limit=100`,
      historyEntrySchema,
    );
    for (const item of history) {
      const parsed = await normalizeHistoryEntry(
        item,
        context.userId,
        context.environment,
        this.config.appIds,
      );
      if (parsed === "review") return true;
      if (
        parsed !== "ignored" &&
        parsed.event.store === context.store &&
        parsed.event.purchased_at_ms >= since
      )
        return true;
    }
    return false;
  }

  async verify(
    event: NativeEvent,
    kind: "consumable" | "subscription",
    options: { refundKnown?: boolean } = {},
  ): Promise<VerifiedNativeEvent> {
    if (
      [
        "TEST",
        "TRANSFER",
        "SUBSCRIBER_ALIAS",
        "TEMPORARY_ENTITLEMENT_GRANT",
      ].includes(event.type)
    )
      throw new HttpError(409, "This event cannot grant native credits.");
    const base: VerifiedNativePurchase = {
      userId: event.app_user_id,
      environment: event.environment,
      store: event.store,
      transactionId: event.transaction_id,
      familyId: "",
      productId: event.product_id,
      purchasedAt: iso(event.purchased_at_ms),
      periodEnd: null,
      priceAmount:
        event.price_in_purchased_currency == null
          ? null
          : Math.abs(event.price_in_purchased_currency),
      currency: event.currency ?? null,
    };
    const explicitRefund =
      options.refundKnown === true ||
      (event.type === "CANCELLATION" &&
        event.cancel_reason === "CUSTOMER_SUPPORT");
    if (
      event.type === "REFUND_REVERSED" &&
      (event.store !== "APP_STORE" || event.period_type === "TRIAL")
    )
      throw new HttpError(409, "Unsupported refund reversal.");
    const refundState = async () =>
      verifyRefundHistory(
        await this.list(
          `${this.prefix}/customers/${encodeURIComponent(event.app_user_id)}/events?environment=${event.environment.toLowerCase()}&limit=100`,
          historyEntrySchema,
        ),
        event,
        this.config.appIds,
      );
    if (kind === "consumable") {
      const purchases = await this.list(
        `${this.prefix}/purchases?store_purchase_identifier=${encodeURIComponent(event.transaction_id)}`,
        purchaseSchema,
      );
      const matching = purchases.filter(
        (p) =>
          p.store_purchase_identifier === event.transaction_id &&
          p.store === event.store.toLowerCase() &&
          p.environment === event.environment.toLowerCase(),
      );
      if (matching.length !== 1)
        throw new HttpError(
          503,
          "Purchase is not yet uniquely verified by the store.",
        );
      const item = matching[0]!;
      this.checkOwner(item, event);
      if (item.quantity !== 1 || (event.quantity ?? 1) !== 1)
        throw new HttpError(
          409,
          "Purchase quantity requires audited reconciliation.",
        );
      const product = await this.get(
        `${this.prefix}/products/${encodeURIComponent(item.product_id)}`,
        productSchema,
      );
      if (
        product.store_identifier !== event.product_id ||
        product.app_id !== event.app_id ||
        !this.config.appIds.includes(product.app_id) ||
        product.type !== "one_time"
      )
        throw new HttpError(
          409,
          "Verified store product does not match the mapped Furnio product.",
        );
      if (Math.abs(item.purchased_at - event.purchased_at_ms) > 1000)
        throw new HttpError(409, "Store purchase timestamp does not match.");
      if (
        !["NON_RENEWING_PURCHASE", "CANCELLATION", "REFUND_REVERSED"].includes(
          event.type,
        )
      )
        throw new HttpError(409, "Unsupported consumable event.");
      const verifiedRefund =
        explicitRefund || isRefundEvent(event) || item.status === "refunded"
          ? await refundState()
          : undefined;
      // A stale owned status cannot defeat a verified refund. For a restoration,
      // however, require both sources to agree before making credits spendable.
      if (verifiedRefund?.refunded === false && item.status !== "owned")
        throw new HttpError(
          503,
          "Reversed purchase status has not caught up yet.",
        );
      return {
        purchase: {
          ...base,
          familyId: `rc-purchase:${item.id}`,
          purchasedAt: iso(item.purchased_at),
        },
        grant: true,
        refund: verifiedRefund?.refunded ?? false,
        ...(verifiedRefund ? { refundState: verifiedRefund } : {}),
        subscription: null,
      };
    }
    // Use owned customer history, rather than only the current-period identifier,
    // so delayed renewal events can still find their original subscription.
    const subscriptions = await this.list(
      `${this.prefix}/customers/${encodeURIComponent(event.app_user_id)}/subscriptions?limit=100`,
      subscriptionSchema,
    );
    for (const subscription of subscriptions) {
      if (
        subscription.store !== event.store.toLowerCase() ||
        subscription.environment !== event.environment.toLowerCase()
      )
        continue;
      this.checkOwner(subscription, event);
      const transactions = await this.list(
        `${this.prefix}/subscriptions/${encodeURIComponent(subscription.id)}/transactions?limit=100`,
        transactionSchema,
      );
      const transaction = transactions.find(
        (t) => t.id === event.transaction_id,
      );
      if (!transaction) continue;
      if (!subscription.product_id)
        throw new HttpError(409, "Current subscription product is missing.");
      const currentProduct = await this.get(
        `${this.prefix}/products/${encodeURIComponent(subscription.product_id)}`,
        productSchema,
      );
      if (
        currentProduct.app_id !== event.app_id ||
        !this.config.appIds.includes(currentProduct.app_id) ||
        currentProduct.type !== "subscription"
      )
        throw new HttpError(
          409,
          "Subscription app does not match the approved app.",
        );
      if (
        transaction.product_store_identifier !== event.product_id ||
        Math.abs(transaction.purchased_at - event.purchased_at_ms) > 1000
      )
        throw new HttpError(
          409,
          "Verified transaction does not match the purchase event.",
        );
      // Verify the historical transaction's store product, not a current product
      // after a plan switch. The event app_id was separately allowlisted by HMAC ingress.
      const end = transaction.expiration_date ?? event.expiration_at_ms;
      if (end === null || end <= transaction.purchased_at)
        throw new HttpError(409, "Verified subscription period is missing.");
      const state =
        subscription.status === "in_grace_period"
          ? "grace_period"
          : subscription.status === "in_billing_retry"
            ? "billing_retry"
            : subscription.status === "trialing"
              ? "trialing"
              : subscription.status === "active" && subscription.gives_access
                ? "active"
                : "expired";
      const subscriptionEnd = subscription.current_period_ends_at ?? end;
      const verifiedRefund =
        event.period_type !== "TRIAL" &&
        (explicitRefund || isRefundEvent(event))
          ? await refundState()
          : undefined;
      return {
        purchase: {
          ...base,
          familyId: `rc-subscription:${subscription.id}`,
          purchasedAt: iso(transaction.purchased_at),
          periodEnd: iso(end),
        },
        // Only paid purchase events (or an atomic refund reconciliation) create
        // a new grant. A pending/billing-issue event is not proof of renewal.
        grant:
          event.period_type !== "TRIAL" &&
          (["INITIAL_PURCHASE", "RENEWAL"].includes(event.type) ||
            verifiedRefund !== undefined),
        refund: verifiedRefund?.refunded ?? false,
        ...(verifiedRefund ? { refundState: verifiedRefund } : {}),
        subscription: {
          productId: currentProduct.store_identifier,
          status: state,
          periodEnd: iso(subscriptionEnd),
          cancelAtPeriodEnd: [
            "will_not_renew",
            "will_pause",
            "requires_price_increase_consent",
          ].includes(subscription.auto_renewal_status),
          verifiedAt: iso(event.event_timestamp_ms),
        },
      };
    }
    throw new HttpError(
      503,
      "Subscription transaction is not yet verified by the store.",
    );
  }
}
