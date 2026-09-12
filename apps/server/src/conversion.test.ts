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
  const convert = () => {
    const adapter = createConversion(services);
    if (adapter === undefined) {
      throw new Error("Missing conversion adapter");
    }
    return adapter;
  };
  return { services, state, owner, convert };
};
const wallet = {
  id: "fixture",
  address: "0x2222222222222222222222222222222222222222",
};
describe("durable conversion recovery", () => {
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
