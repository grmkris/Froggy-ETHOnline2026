/** Test-only funding. Production credit balances are issued exclusively after x402 settlement. */
import { CreditPurchaseId, creditUnits } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { Store } from "@froggy/wallet";

export const fundTestCredits = async (
  store: Store,
  owner: UserId,
  amount: number,
  stubbed = true
): Promise<void> => {
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
    stubbed,
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
  await store.credits.confirmFunding(owner, id, {
    transactionId: key,
    stubbed,
    now,
  });
};
