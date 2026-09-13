/**
 * Test-only funding. Production credit balances come from x402 settlement or
 * from `bun run credits:grant`; this helper writes a fake purchase straight
 * into the store, past the funding coordinator's refusal of simulated
 * settlement off loopback, so it refuses to run anywhere but under `bun test`.
 */
import { CreditPurchaseId, creditUnits } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { Store } from "@froggy/wallet";

export const fundTestCredits = async (
  store: Store,
  owner: UserId,
  amount: number
): Promise<void> => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "fundTestCredits is a test fixture. Grant credits with `bun run credits:grant`."
    );
  }
  if (amount <= 0) {
    return;
  }
  const id = CreditPurchaseId.generate();
  const now = Date.now();
  const key = `test-fixture:${id}`;
  await store.credits.createFunding(owner, {
    v: 1,
    id,
    idempotencyKey: key,
    requestFingerprint: key,
    creditUnits: creditUnits(amount),
    network: "hedera:testnet",
    asset: "0.0.0",
    amount: "1",
    payTo: "0.0.1",
    status: "quoted",
    challenge: {},
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 60_000,
    transactionId: null,
    error: null,
    stubbed: true,
    proofHash: null,
    authorizationKey: null,
    paymentHeader: null,
    signedTransaction: null,
    transactionNonce: null,
  });
  await store.credits.claimFunding(
    owner,
    id,
    { proofHash: key, authorizationKey: key, paymentHeader: "stub-fixture" },
    now
  );
  await store.credits.confirmFunding(owner, id, { transactionId: key, now });
};
