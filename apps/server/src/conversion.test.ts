import { beforeAll, describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";
import { EvmRpcError } from "@froggy/wallet";
import { Effect } from "effect";

import { createConversion } from "./conversion";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { createServices } from "./services";
import type { Services } from "./services";

let environment: Environment;
beforeAll(async () => {
  Object.assign(process.env, {
    DATABASE_URL: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
    ANTHROPIC_API_KEY: "sk-ant-REPLACE_ME",
    OPENAI_COMPATIBLE_API_KEY: "",
    TELEGRAM_BOT_TOKEN: "REPLACE_ME_TELEGRAM_BOT_TOKEN",
  });
  environment = await Effect.runPromise(loadEnvironment());
});
interface ConversionState {
  usdcCalls: number;
  fundCalls: number;
  usdcUnknown: boolean;
  usdcBeforeSendFails: boolean;
  /** The node answers the broadcast with an error: nothing entered the mempool. */
  usdcRefusedAtBroadcast: boolean;
  /** What the chain answers to "have you seen this hash": true once a send really happened. */
  usdcSeenByChain: boolean;
  fundBeforeSendFails: boolean;
  fundUnknown: boolean;
  hederaVerdict: "success" | "unknown";
}
const fixture = () => {
  const base = createServices({ environment });
  const state: ConversionState = {
    usdcCalls: 0,
    fundCalls: 0,
    usdcUnknown: false,
    usdcBeforeSendFails: false,
    usdcRefusedAtBroadcast: false,
    usdcSeenByChain: true,
    fundBeforeSendFails: false,
    fundUnknown: false,
    hederaVerdict: "unknown",
  };
  const services: Services = {
    ...base,
    environment: {
      ...environment,
      treasuryEvmAddress: "0x1111111111111111111111111111111111111111",
    },
    evmTransfersFor: () => ({
      send: async ({ beforeBroadcast }) => {
        state.usdcCalls += 1;
        if (state.usdcBeforeSendFails) {
          throw new EvmRpcError("signing unavailable");
        }
        await beforeBroadcast?.("0xfixture");
        if (state.usdcRefusedAtBroadcast) {
          throw new EvmRpcError(
            "eth_sendRawTransaction: gas required exceeds allowance (0)",
            true
          );
        }
        if (state.usdcUnknown) {
          throw new EvmRpcError("confirmation timed out");
        }
        return { hash: "0xfixture", status: "success" };
      },
    }),
    evmReceipt: async () =>
      await Promise.resolve(
        state.usdcUnknown
          ? null
          : { blockNumber: 1, status: "success", transactionHash: "0xfixture" }
      ),
    evmTransactionKnown: async () =>
      await Promise.resolve(state.usdcSeenByChain),
    accounts: {
      lookup: async () => await Promise.resolve("0.0.42"),
      payerFor: async () => await Promise.resolve(base.payer),
      fund: async (_owner, _amount, beforeBroadcast) => {
        state.fundCalls += 1;
        if (state.fundBeforeSendFails) {
          throw new Error("rate unavailable");
        }
        await beforeBroadcast?.({
          transactionId: "0.0.1@1.2",
          tinybars: 250_000_000,
          accountId: "0.0.42",
          alias: null,
          custody: null,
        });
        if (state.fundUnknown) {
          throw new Error("Hedera receipt timed out");
        }
        return {
          opened: false,
          tinybars: 250_000_000,
          transactionId: "0.0.1@1.2",
        };
      },
      reconcile: async () => await Promise.resolve(state.hederaVerdict),
    },
  };
  const owner = userId(`did:privy:conversion-${crypto.randomUUID()}`);
  const convert = (now?: () => number) => {
    const adapter = createConversion(
      services,
      now === undefined ? {} : { now }
    );
    if (adapter === undefined) {
      throw new Error("Missing conversion adapter");
    }
    return adapter;
  };
  return { services, state, owner, convert };
};
/** Clocks past the never-seen grace, for a record created just now. */
const tenMinutesOn = (): number => Date.now() + 10 * 60 * 1000;
const wallet = {
  id: "fixture",
  address: "0x2222222222222222222222222222222222222222",
};
describe("durable conversion recovery", () => {
  test("settles through the treasury's relay when one exists, never a transfer the person must gas", async () => {
    const f = fixture();
    let relayed = 0;
    const services: Services = {
      ...f.services,
      evmRelayFor: () => ({
        send: async ({ beforeBroadcast }) => {
          relayed += 1;
          await beforeBroadcast?.("0xrelayed");
          return { hash: "0xrelayed", status: "success" };
        },
      }),
    };
    const adapter = createConversion(services);
    if (adapter === undefined) {
      throw new Error("Missing conversion adapter");
    }
    const paid = await adapter.perform(f.owner, wallet, 2_000_000, "relay");
    expect(paid.credited).toBe(true);
    expect(paid.transfer.transactionId).toBe("0xrelayed");
    expect(relayed).toBe(1);
    expect(f.state.usdcCalls).toBe(0);
    expect(f.state.fundCalls).toBe(1);
  });
  test("a pre-submission USDC refusal can be retried with the same key", async () => {
    const f = fixture();
    f.state.usdcBeforeSendFails = true;
    const refused = await f
      .convert()
      .perform(f.owner, wallet, 2_000_000, "retry");
    expect(refused.transfer.sent).toBe(false);
    expect(f.state.fundCalls).toBe(0);
    f.state.usdcBeforeSendFails = false;
    const paid = await f.convert().perform(f.owner, wallet, 2_000_000, "retry");
    expect(paid.credited).toBe(true);
    expect(f.state.fundCalls).toBe(1);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
  });
  test("a broadcast the node refused fails cleanly and no longer blocks the person", async () => {
    // The case a tester hit on 11 September: no ETH for gas, so Base refused
    // the transaction with a JSON-RPC error after the expected hash had been
    // persisted. Nothing was sent, so the record must not wait for a receipt
    // that will never come, and the next spend must not be told to wait.
    const f = fixture();
    f.state.usdcRefusedAtBroadcast = true;
    const refused = await f
      .convert()
      .perform(f.owner, wallet, 2_000_000, "no-gas");
    expect(refused.transfer.sent).toBe(false);
    expect(refused.transfer.transactionId).toBeNull();
    expect(refused.transfer.error).toContain("gas required exceeds allowance");
    expect(f.state.fundCalls).toBe(0);
    // Not stuck: recover reports nothing pending for this person.
    expect(await f.convert().recover?.(f.owner)).toBeNull();
    // Funded with gas, the same key is retried and pays once.
    f.state.usdcRefusedAtBroadcast = false;
    const paid = await f
      .convert()
      .perform(f.owner, wallet, 2_000_000, "no-gas");
    expect(paid.credited).toBe(true);
    expect(f.state.usdcCalls).toBe(2);
    expect(f.state.fundCalls).toBe(1);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
  });
  test("a pending leg the chain has never seen is failed after the grace, and no sooner", async () => {
    // The row a tester was stuck behind on 12 September: the hash persisted
    // before a broadcast that timed out and never reached the chain, under a
    // build that could not yet tell a refusal from an unknown outcome.
    const f = fixture();
    f.state.usdcUnknown = true;
    f.state.usdcSeenByChain = false;
    const first = await f.convert().perform(f.owner, wallet, 2_000_000, "lost");
    expect(first.transfer.ok).toBe(false);
    // Inside the grace it is still an unknown outcome: the person waits.
    expect(await f.convert().recover?.(f.owner)).toContain(
      "waiting for USDC confirmation"
    );
    // Past it, the chain still knows nothing: it was never sent, and the
    // person is free to spend again.
    expect(await f.convert(tenMinutesOn).recover?.(f.owner)).toBeNull();
    expect(f.state.fundCalls).toBe(0);
    // The same key can be retried, and pays once.
    f.state.usdcUnknown = false;
    f.state.usdcSeenByChain = true;
    const paid = await f
      .convert(tenMinutesOn)
      .perform(f.owner, wallet, 2_000_000, "lost");
    expect(paid.credited).toBe(true);
    expect(f.state.usdcCalls).toBe(2);
    expect(f.state.fundCalls).toBe(1);
  });

  test("a pending leg the chain has seen keeps waiting past the grace", async () => {
    // Known to the node but not yet mined: that is a real transaction in
    // flight, and "never sent" must not be said of it however old it is.
    const f = fixture();
    f.state.usdcUnknown = true;
    f.state.usdcSeenByChain = true;
    await f.convert().perform(f.owner, wallet, 2_000_000, "slow");
    expect(await f.convert(tenMinutesOn).recover?.(f.owner)).toContain(
      "waiting for USDC confirmation"
    );
    expect(f.state.usdcCalls).toBe(1);
  });
  test("a failed credit commit never reports available funds or retries either chain leg", async () => {
    const f = fixture();
    const broken = createConversion({
      ...f.services,
      store: {
        ...f.services.store,
        conversions: {
          ...f.services.store.conversions,
          credit: async () => {
            await Promise.resolve();
            throw new Error("credit commit unavailable");
          },
        },
      },
    });
    if (broken === undefined) {
      throw new Error("Missing conversion adapter");
    }
    await broken.perform(f.owner, wallet, 2_000_000, "credit");
    const replay = await broken.perform(f.owner, wallet, 2_000_000, "credit");
    expect(replay.credited).toBe(false);
    expect(replay.funded).toHaveProperty("error");
    expect(await f.services.store.pocket.load(f.owner)).toBeNull();
    await f.convert().recover?.(f.owner);
    expect(f.state.usdcCalls).toBe(1);
    expect(f.state.fundCalls).toBe(1);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
  });
  test("recovers a USDC receipt after restart without submitting a second transfer", async () => {
    const f = fixture();
    f.state.usdcUnknown = true;
    const first = await f.convert().perform(f.owner, wallet, 2_000_000, "one");
    expect(first.transfer.ok).toBe(false);
    expect(f.state.fundCalls).toBe(0);
    expect(await f.services.store.pocket.load(f.owner)).toBeNull();
    f.state.usdcUnknown = false;
    expect(await f.convert().recover?.(f.owner)).toBeNull();
    expect(f.state.usdcCalls).toBe(1);
    expect(f.state.fundCalls).toBe(1);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
    await f.convert().recover?.(f.owner);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
  });
  test("unknown HBAR funding stays unavailable and is reconciled without sending again", async () => {
    const f = fixture();
    f.state.fundUnknown = true;
    const first = await f.convert().perform(f.owner, wallet, 2_000_000, "one");
    expect(first.transfer.ok).toBe(true);
    expect(first.credited).toBe(false);
    expect(await f.services.store.pocket.load(f.owner)).toBeNull();
    expect(await f.convert().recover?.(f.owner)).toContain("HBAR funding");
    expect(f.state.fundCalls).toBe(1);
    f.state.hederaVerdict = "success";
    expect(await f.convert().recover?.(f.owner)).toBeNull();
    expect(f.state.fundCalls).toBe(1);
    expect(f.state.usdcCalls).toBe(1);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
  });
  test("retries funding that failed before submission and preserves the USDC leg", async () => {
    const f = fixture();
    f.state.fundBeforeSendFails = true;
    await f.convert().perform(f.owner, wallet, 2_000_000, "one");
    f.state.fundBeforeSendFails = false;
    await Promise.allSettled([
      f.convert().recover?.(f.owner),
      f.convert().recover?.(f.owner),
    ]);
    expect(f.state.usdcCalls).toBe(1);
    expect(f.state.fundCalls).toBe(2);
    expect(await f.services.store.pocket.load(f.owner)).toBe(2_000_000);
  });
});
