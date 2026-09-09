import { expect, test } from "bun:test";

import { EvmAddress, TradeInput } from "@froggy/domain";
import { SwapQuoteInput } from "@froggy/protocol";
import { Schema } from "effect";
import {
  decodeAbiParameters,
  decodeFunctionData,
  isHex,
  parseAbi,
  parseAbiParameters,
} from "viem";

import { stubUniswap } from "./uniswap";
import {
  buildUniswapTransactions,
  UNISWAP_PERMIT2,
  uniswapDeployment,
} from "./uniswap-transactions";

const input = Schema.decodeUnknownSync(TradeInput)({
  network: "eip155:8453",
  venue: "uniswap",
  action: "swap",
  wallet: `0x${"1".repeat(40)}`,
  tokenIn: `0x${"2".repeat(40)}`,
  tokenOut: `0x${"3".repeat(40)}`,
  amount: "1000",
  position: null,
  slippageBps: 50,
  maxNativeFee: "10000000",
});
const context = {
  nonce: 7,
  maxFeePerGas: 2n,
  priorityFeePerGas: 1n,
  tokenAllowance: 0n,
  now: 100,
};
const quote = async () => {
  const fixture = await stubUniswap().quote(
    Schema.decodeUnknownSync(SwapQuoteInput)({
      network: input.network,
      wallet: Schema.decodeUnknownSync(TradeInput.fields.wallet)(input.wallet),
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amount: input.amount,
      slippageBps: input.slippageBps,
    })
  );
  return {
    ...fixture,
    stubbed: false,
    route: [
      [
        {
          protocol: "v3" as const,
          pool: Schema.decodeUnknownSync(EvmAddress)(`0x${"4".repeat(40)}`),
          tokenIn: fixture.input.tokenIn,
          tokenOut: fixture.input.tokenOut,
          hook: null,
          feeTier: "3000",
          tickSpacing: null,
        },
      ],
    ],
  };
};

test("builds only an exact ERC20 allowance, expiring Permit2 allowance and one exact-input swap", async () => {
  const built = buildUniswapTransactions(input, await quote(), context);
  expect(built.transactions).toHaveLength(3);
  const [approval, permit, swap] = built.transactions;
  if (
    approval === undefined ||
    permit === undefined ||
    swap === undefined ||
    !isHex(approval.payload.data) ||
    !isHex(permit.payload.data) ||
    !isHex(swap.payload.data)
  ) {
    throw new Error("Missing fixture calldata");
  }
  const token = decodeFunctionData({
    abi: parseAbi([
      "function approve(address spender,uint256 amount) returns (bool)",
    ]),
    data: approval.payload.data,
  });
  expect(token.args).toEqual([UNISWAP_PERMIT2, 1000n]);
  const allowance = decodeFunctionData({
    abi: parseAbi([
      "function approve(address token,address spender,uint160 amount,uint48 expiration)",
    ]),
    data: permit.payload.data,
  });
  expect(allowance.args[2]).toBe(1000n);
  expect(allowance.args[3]).toBe(Math.floor(built.expiresAt / 1000));
  expect(permit.payload.to).toBe(UNISWAP_PERMIT2);
  expect(String(swap.payload.to)).toBe(
    uniswapDeployment(input.network)?.router ?? "missing deployment"
  );
  const router = decodeFunctionData({
    abi: parseAbi([
      "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
    ]),
    data: swap.payload.data,
  });
  expect(router.args[0]).toBe("0x00");
  const [, inputs] = router.args;
  const [encoded] = inputs;
  if (encoded === undefined) {
    throw new Error("Missing swap input");
  }
  const swapArgs = decodeAbiParameters(
    parseAbiParameters(
      "address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser"
    ),
    encoded
  );
  expect(swapArgs[0].toLowerCase()).toBe(input.wallet);
  expect(swapArgs[1]).toBe(1000n);
  expect(swapArgs[2]).toBe(995n);
  expect(swapArgs[4]).toBe(true);
  expect(
    built.transactions.map((transaction) => transaction.payload.nonce)
  ).toEqual([7, 8, 9]);
});

test("rejects altered quote identity, stale quotes and unsupported paths before building approvals", async () => {
  const valid = await quote();
  expect(() =>
    buildUniswapTransactions(input, { ...valid, network: "eip155:1" }, context)
  ).toThrow("trade.quote");
  expect(() =>
    buildUniswapTransactions(input, { ...valid, refreshAfter: 100 }, context)
  ).toThrow("trade.quote");
  expect(() =>
    buildUniswapTransactions(input, { ...valid, stubbed: true }, context)
  ).toThrow("trade.route");
  expect(() =>
    buildUniswapTransactions(input, { ...valid, route: [] }, context)
  ).toThrow("trade.route");
  expect(() =>
    buildUniswapTransactions(
      { ...input, network: "eip155:999999" },
      valid,
      context
    )
  ).toThrow("trade.network");
});

test("resets a partial existing ERC20 allowance and never grants an unlimited amount", async () => {
  const built = buildUniswapTransactions(input, await quote(), {
    ...context,
    tokenAllowance: 1n,
  });
  expect(built.transactions).toHaveLength(4);
  expect(built.transactions[0]?.description).toContain("Reset");
  expect(
    built.transactions.map((transaction) => transaction.payload.nonce)
  ).toEqual([7, 8, 9, 10]);
});
