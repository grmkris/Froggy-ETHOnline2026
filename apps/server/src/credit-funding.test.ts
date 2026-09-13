import { beforeAll, describe, expect, it } from "bun:test";

import {
  CreditPurchaseId,
  SaleId,
  creditUnits,
  defaultCreditLimits,
  userId,
} from "@froggy/domain";
import type { CreditPurchase } from "@froggy/domain";
import { describePayment, liveHederaPayer } from "@froggy/payments";
import { ConfigProvider, Effect } from "effect";

import { CreditFunding } from "./credit-funding";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { createServices } from "./services";

let environment: Environment;
beforeAll(async () => {
  const config = {
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    HEDERA_NETWORK: "hedera:testnet",
    HEDERA_ASSET: "0.0.0",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
    EVM_NETWORK: "eip155:84532",
    TREASURY_EVM_ADDRESS: "0xREPLACE_ME_TREASURY",
    TREASURY_WALLET_ID: "REPLACE_ME_TREASURY_WALLET_ID",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
  };
  environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(config)
      )
    )
  );
});
const fixture = () => ({
  services: createServices({ environment }),
  owner: userId(`did:privy:credits-${crypto.randomUUID()}`),
});

const waitForFunding = async (
  context: ReturnType<typeof fixture>,
  id: Parameters<
    ReturnType<typeof fixture>["services"]["creditFunding"]["get"]
  >[1],
  remaining = 100
): Promise<CreditPurchase> => {
  const purchase = await context.services.creditFunding.get(context.owner, id);
  if (
    purchase.status === "confirmed" ||
    purchase.status === "failed" ||
    purchase.status === "uncertain"
  ) {
    return purchase;
  }
  if (remaining === 0) {
    throw new Error("Credit funding did not reach a terminal state.");
  }
  await Bun.sleep(5);
  return await waitForFunding(context, id, remaining - 1);
};

describe("owner credit funding", () => {
  for (const network of ["eip155:84532", "hedera:testnet"]) {
    it(`quotes and funds once with ${network}`, async () => {
      const context = fixture();
      const { services, owner } = context;
      const initial = await services.store.credits.summary(owner);
      expect(initial.availableUnits).toBe(creditUnits(0));
      const input = {
        v: 1 as const,
        network,
        idempotencyKey: "one-topup",
        amountUsdMicros: 1_000_000,
      };
      const quote = await services.creditFunding.create(
        owner,
        input,
        defaultCreditLimits()
      );
      expect(quote.creditUnits).toBe(creditUnits(1_000_000));
      expect(quote.status).toBe("quoted");
      expect(quote.stubbed).toBe(true);
      expect("paymentHeader" in quote).toBe(false);
      expect("challenge" in quote).toBe(false);
      await Promise.all([
        services.creditFunding.pay(owner, quote.id, "local-owner"),
        services.creditFunding.pay(owner, quote.id, "local-owner"),
      ]);
      const completed = await waitForFunding(context, quote.id);
      expect(completed.status).toBe("confirmed");
      expect(completed.transactionId).toStartWith("stub-credit-");
      const replay = await services.creditFunding.create(
        owner,
        input,
        defaultCreditLimits()
      );
      expect(replay.id).toBe(quote.id);
      const summary = await services.store.credits.summary(owner);
      expect(summary.availableUnits).toBe(creditUnits(1_000_000));
      const entries = await services.store.credits.entries(owner);
      expect(entries.filter((entry) => entry.kind === "funding")).toHaveLength(
        1
      );
      await services.shutdown();
    });
  }

  it("rejects changed terms under an existing key, unsupported networks and fractional cents", async () => {
    const { services, owner } = fixture();
    const input = {
      v: 1 as const,
      network: "eip155:84532",
      idempotencyKey: "bound-price",
      amountUsdMicros: 1_000_000,
    };
    await services.creditFunding.create(owner, input, defaultCreditLimits());
    expect(
      services.creditFunding.create(
        owner,
        { ...input, amountUsdMicros: 2_000_000 },
        defaultCreditLimits()
      )
    ).rejects.toThrow("different terms");
    expect(
      services.creditFunding.create(
        owner,
        { ...input, idempotencyKey: "bad-network", network: "eip155:1" },
        defaultCreditLimits()
      )
    ).rejects.toThrow("supported");
    expect(
      services.creditFunding.create(
        owner,
        { ...input, idempotencyKey: "fraction", amountUsdMicros: 1_000_001 },
        defaultCreditLimits()
      )
    ).rejects.toThrow("whole cents");
    const summary = await services.store.credits.summary(owner);
    expect(summary.availableUnits).toBe(creditUnits(0));
    await services.shutdown();
  });

  it("does not reveal or pay another owner's purchase, including concurrent checkout", async () => {
    const { services, owner } = fixture();
    const other = userId("did:privy:other-credit-owner");
    const quote = await services.creditFunding.create(
      owner,
      {
        v: 1,
        network: "eip155:84532",
        amountUsdMicros: 1_000_000,
        idempotencyKey: "private",
      },
      defaultCreditLimits()
    );
    const paying = services.creditFunding.pay(owner, quote.id, "local-owner");
    expect(
      services.creditFunding.pay(other, quote.id, "different-owner")
    ).rejects.toThrow("not found");
    expect(services.creditFunding.get(other, quote.id)).rejects.toThrow(
      "not found"
    );
    await paying;
    await services.shutdown();
  });
});

describe("HBAR funding cannot reuse historical payments", () => {
  it.each([
    {
      when: "before-quote",
      timestamp: (now: number) => ((now - 60_000) / 1000).toFixed(9),
      expected: "failed",
    },
    {
      when: "after-quote",
      timestamp: (now: number) => ((now + 1000) / 1000).toFixed(9),
      expected: "confirmed",
    },
    { when: "missing-time", timestamp: () => null, expected: "uncertain" },
    {
      when: "malformed-time",
      timestamp: () => "invalid",
      expected: "uncertain",
    },
    { when: "exponent-time", timestamp: () => "1e30", expected: "uncertain" },
    { when: "empty-time", timestamp: () => "", expected: "uncertain" },
    {
      when: "legacy-sale",
      timestamp: (now: number) => ((now + 1000) / 1000).toFixed(9),
      expected: "failed",
    },
    { when: "verifier-refusal", timestamp: () => null, expected: "uncertain" },
  ] as const)(
    "checks consensus evidence: $when",
    async ({ when, timestamp, expected }) => {
      const context = fixture();
      const { owner, services } = context;
      const id = CreditPurchaseId.generate();
      const now = Date.now();
      // Synthetic local key and accounts. The signed transaction is never broadcast.
      const payer = liveHederaPayer({
        accountId: "0.0.123",
        network: "hedera:testnet",
        privateKey: "11".repeat(32),
      });
      const challenge = {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "hedera:testnet",
            asset: "0.0.0",
            payTo: "0.0.456",
            amount: "100000000",
            maxTimeoutSeconds: 120,
            extra: { feePayer: "0.0.789" },
          },
        ],
      };
      await services.store.credits.createFunding(owner, {
        v: 1,
        id,
        status: "quoted",
        creditUnits: creditUnits(1_000_000),
        network: "hedera:testnet",
        asset: "0.0.0",
        amount: "100000000",
        payTo: "0.0.456",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 120_000,
        transactionId: null,
        error: null,
        stubbed: false,
        idempotencyKey: id,
        requestFingerprint: id,
        challenge,
        proofHash: null,
        authorizationKey: null,
        paymentHeader: null,
        signedTransaction: null,
        transactionNonce: null,
      });
      const funding = new CreditFunding({
        ...services,
        base: null,
        oracle: {
          ...services.oracle,
          settle: async () =>
            await Promise.resolve({
              ok: false,
              transactionId: null,
              error: "Authorization was already used.",
              rejectedBeforeSubmission: true,
              stubbed: false,
            }),
        },
        withTreasuryLock: async (operation) => await operation(),
        hederaPayerFor: async () => await Promise.resolve(payer),
        hederaTransaction: async () =>
          await Promise.resolve({
            status: when === "verifier-refusal" ? "unknown" : "success",
            entityId: null,
            consensusTimestamp: timestamp(now),
            transfers: [
              { accountId: "0.0.123", asset: "0.0.0", amount: -100_000_000n },
              { accountId: "0.0.456", asset: "0.0.0", amount: 100_000_000n },
            ],
          }),
      });
      const payment = await payer.pay(challenge);
      if (payment.header === null) {
        throw new Error("Test payment was not signed.");
      }
      if (when === "legacy-sale") {
        await services.store.sales.record({
          id: SaleId.generate(),
          paymentHash: "historical-proof-has-a-different-envelope",
          network: "hedera:testnet",
          asset: "0.0.0",
          amount: "100000000",
          payer: "0.0.123",
          transactionId: describePayment(payment.header).transactionId,
          resource: "/api/paid/legacy-tool",
          status: "delivered",
          result: { delivered: true },
          error: null,
          at: now,
          deliveredAt: now + 1000,
          stubbed: false,
        });
      }
      await funding.accept(owner, id, payment.header);
      const result = await waitForFunding(
        { owner, services: { ...services, creditFunding: funding } },
        id
      );
      expect(result.status).toBe(expected);
      const summary = await services.store.credits.summary(owner);
      expect(summary.availableUnits).toBe(
        creditUnits(when === "after-quote" ? 1_000_000 : 0)
      );
      await services.shutdown();
    }
  );
});
