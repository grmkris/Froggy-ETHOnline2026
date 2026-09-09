import { expect, test } from "bun:test";

import type { TradeInput, TradePayload } from "@froggy/domain";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { verifySignedTradeTransaction } from "./evm-signed";

// Public, deterministic fixture key; never funded or used by a live adapter.
const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const to = "0x2222222222222222222222222222222222222222";
const input: TradeInput = {
  network: "eip155:8453",
  venue: "uniswap",
  action: "swap",
  wallet: account.address,
  tokenIn: to,
  tokenOut: "0x3333333333333333333333333333333333333333",
  amount: "100",
  position: null,
  slippageBps: 100,
  maxNativeFee: "1000000",
};
const expected: Extract<TradePayload, { kind: "evm" }> = {
  kind: "evm",
  to,
  data: "0x1234",
  value: "0",
  gasLimit: "50000",
  maxFeePerGas: "20",
  maxPriorityFeePerGas: "1",
  nonce: 7,
};
const transaction = {
  type: "eip1559",
  chainId: 8453,
  to,
  data: "0x1234",
  value: 0n,
  gas: 50_000n,
  maxFeePerGas: 20n,
  maxPriorityFeePerGas: 1n,
  nonce: 7,
} as const;

test("verifies the exact signed payload and derives its recovery identity locally", async () => {
  const signed = await account.signTransaction(transaction);
  expect(await verifySignedTradeTransaction(input, expected, signed)).toEqual({
    payload: signed,
    transactionId: keccak256(signed),
  });
});

test("rejects changed destination, calldata, fee, nonce, chain and unexpected access lists", async () => {
  await Promise.all(
    [
      { to: account.address },
      { data: "0x4321" as const },
      { value: 1n },
      { gas: 50_001n },
      { maxFeePerGas: 21n },
      { maxPriorityFeePerGas: 2n },
      { nonce: 8 },
      { chainId: 1 },
      { accessList: [{ address: to, storageKeys: [] }] as const },
    ].map(async (patch) => {
      const signed = await account.signTransaction({
        ...transaction,
        ...patch,
      });
      expect(
        await verifySignedTradeTransaction(input, expected, signed).then(
          () => null,
          String
        )
      ).toContain("differs");
    })
  );
});

test("rejects a valid transaction signed by another wallet", async () => {
  const other = privateKeyToAccount(`0x${"02".repeat(32)}`);
  const signed = await other.signTransaction(transaction);
  expect(
    await verifySignedTradeTransaction(input, expected, signed).then(
      () => null,
      String
    )
  ).toContain("another wallet");
});
