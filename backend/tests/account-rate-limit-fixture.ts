// Synthetic configuration only. Never use this deterministic key in staging.
export function accountPrivacyLimitFixture() {
  return {
    ACCOUNT_DELETION_LIMIT_SECRET: "a7".repeat(32),
    ACCOUNT_DELETION_SOURCE_LIMIT: { limit: async () => ({ success: true }) },
    ACCOUNT_DELETION_USER_LIMIT: { limit: async () => ({ success: true }) },
    ACCOUNT_DELETION_RECEIPT_LIMIT: { limit: async () => ({ success: true }) },
  };
}
