import { expect, test } from "bun:test";

import { CardCheckoutId, PaymentMethodId } from "@froggy/domain";
import type { TradeInput } from "@froggy/domain";
import { Schema } from "effect";
import { decodeFunctionData, encodeFunctionData, erc20Abi, isHex } from "viem";

import { buildCardBridge, CARD_BRIDGE } from "./card-bridge";
import { ACROSS_ABI } from "./card-bridge-abi";
import quote from "./fixtures/card-bridge-quote.json";
import calls from "./fixtures/card-bridge-swap_5792.json";

const input: TradeInput = {
  network: "eip155:8453",
  venue: "uniswap",
  action: "bridge",
  wallet: quote.quote.swapper,
  tokenIn: quote.quote.input.token,
  tokenOut: quote.quote.output.token,
  amount: quote.quote.input.amount,
  position: null,
  slippageBps: 50,
  maxNativeFee: "1",
  bridge: {
    destinationNetwork: "eip155:59144",
    recipient: quote.quote.output.recipient,
    provenance: "user",
    paymentMethodId: PaymentMethodId.generate(),
    paymentMethodRevision: 1,
    checkoutId: CardCheckoutId.generate(),
  },
};
const mutate = (
  args: readonly [
    `0x${string}`,
    `0x${string}`,
    `0x${string}`,
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    `0x${string}`,
    number,
    number,
    number,
    `0x${string}`,
  ]
) => encodeFunctionData({ abi: ACROSS_ABI, functionName: "depositV3", args });
const now = quote.quote.quoteTimestamp * 1000;
test("live probe decodes foreign recipient and replaces unlimited approval with exact input", () => {
  const built = buildCardBridge(input, quote, calls, now);
  const [approval] = built.calls;
  if (approval === undefined) {
    throw new Error("Missing approval");
  }
  const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data });
  expect(decoded.functionName).toBe("approve");
  if (decoded.functionName !== "approve") {
    throw new Error("Wrong approval");
  }
  expect(decoded.args[0].toLowerCase()).toBe(
    CARD_BRIDGE.sourcePool.toLowerCase()
  );
  expect(decoded.args[1]).toBe(BigInt(input.amount));
  expect(String(built.calls[1]?.data)).toBe(String(calls.calls[1]?.data));
  expect(built.minimumOutput).toBe(quote.quote.output.minimumAmount);
  expect(built.expiresAt).toBe(now + 60_000);
});
test("unexpected calls, native value, chain, source and allowance target fail closed", () => {
  for (const changed of [
    { ...calls, from: CARD_BRIDGE.inputToken },
    { ...calls, chainId: 59_144 },
    { ...calls, calls: [...calls.calls, calls.calls[0]] },
    {
      ...calls,
      calls: calls.calls.map((call) => ({ ...call, value: "0x01" })),
    },
    {
      ...calls,
      calls: [
        { ...calls.calls[0], to: CARD_BRIDGE.sourcePool },
        calls.calls[1],
      ],
    },
  ]) {
    expect(() =>
      buildCardBridge(
        input,
        quote,
        Schema.decodeUnknownSync(Schema.Json)(changed),
        now
      )
    ).toThrow();
  }
  expect(() => buildCardBridge(input, quote, calls, now + 60_001)).toThrow();
  expect(() =>
    buildCardBridge({ ...input, action: "swap" }, quote, calls, now)
  ).toThrow();
});
test("changed destination, amount, message or deposit deadline cannot inherit approval", () => {
  const data = calls.calls[1]?.data;
  if (data === undefined || !isHex(data)) {
    throw new Error("Missing deposit");
  }
  const decoded = decodeFunctionData({ abi: ACROSS_ABI, data });
  if (decoded.functionName !== "depositV3") {
    throw new Error("Wrong call");
  }
  const original = decoded.args;
  const edits = [
    mutate([
      original[0],
      CARD_BRIDGE.sourcePool,
      original[2],
      original[3],
      original[4],
      original[5],
      original[6],
      original[7],
      original[8],
      original[9],
      original[10],
      original[11],
    ]),
    mutate([
      original[0],
      original[1],
      original[2],
      original[3],
      1n,
      original[5],
      original[6],
      original[7],
      original[8],
      original[9],
      original[10],
      original[11],
    ]),
    mutate([
      original[0],
      original[1],
      original[2],
      original[3],
      original[4],
      original[5],
      original[6],
      original[7],
      original[8],
      original[9] + 1,
      original[10],
      original[11],
    ]),
    mutate([
      original[0],
      original[1],
      original[2],
      original[3],
      original[4],
      original[5],
      original[6],
      original[7],
      original[8],
      original[9],
      original[10],
      "0x01",
    ]),
  ];
  for (const changed of edits) {
    expect(() =>
      buildCardBridge(
        input,
        quote,
        Schema.decodeUnknownSync(Schema.Json)({
          ...calls,
          calls: [calls.calls[0], { ...calls.calls[1], data: changed }],
        }),
        now
      )
    ).toThrow();
  }
});
