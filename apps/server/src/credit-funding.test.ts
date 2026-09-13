import { beforeAll, describe, expect, it } from "bun:test";

import { creditUnits, defaultCreditLimits, userId } from "@froggy/domain";
import type { CreditPurchase } from "@froggy/domain";
import { ConfigProvider, Effect } from "effect";

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
  if (purchase.status === "confirmed" || purchase.status === "failed") {
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
