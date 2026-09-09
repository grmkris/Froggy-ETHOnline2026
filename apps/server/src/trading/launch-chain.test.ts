import { expect, test } from "bun:test";

import { TaskId, userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";
import { createPublicClient, custom } from "viem";

import { stubBirdeye } from "./birdeye";
import { ponsLaunchReader, stubPonsLaunchReader } from "./launch-chain";
import { LaunchCoordinator } from "./launches";

const fixture = async () => {
  const reader = stubPonsLaunchReader(() => 1000);
  const launches = new LaunchCoordinator({
    store: memoryStore().launches,
    market: stubBirdeye(),
    providerStubbed: true,
    chainReaders: new Map([[reader.network, reader]]),
    now: () => 1000,
  });
  return await launches.create({
    owner: userId("did:privy:chain-watch"),
    connectionId: null,
    sourceTaskId: TaskId.generate(),
    input: {
      network: reader.network,
      durationMinutes: 5,
      source: "pons",
      minimumLiquidityUsd: null,
    },
    paymentStubbed: true,
  });
};

test("native stub observations and cursor remain visibly synthetic", async () => {
  const watch = await fixture();
  const sample = await stubPonsLaunchReader(() => 1000).poll(watch);
  expect(sample.events).toHaveLength(1);
  expect(sample.events[0]?.stubbed).toBe(true);
  expect(sample.events[0]?.membership).toBe("unverified");
  expect(sample.gap).toContain("Synthetic");
  expect(sample.cursor.block).toBe(String(watch.pollsUsed));
});

test("native reader refuses a wrong RPC network before reading logs", async () => {
  const methods: string[] = [];
  const client = createPublicClient({
    transport: custom(
      {
        request: async ({ method }: { readonly method: string }) => {
          await Promise.resolve();
          methods.push(method);
          return "0x1";
        },
      },
      { retryCount: 0 }
    ),
  });
  let failure: unknown;
  try {
    await ponsLaunchReader(client, () => 1000).poll(await fixture());
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(methods).toEqual(["eth_chainId"]);
});
