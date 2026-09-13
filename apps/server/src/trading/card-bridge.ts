import { EvmAddress, TradingUnits } from "@froggy/domain";
import type { TradeInput } from "@froggy/domain";
import { Redacted, Schema } from "effect";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isHex,
} from "viem";

import { boundedBytes } from "../outbound";
import { ACROSS_ABI } from "./card-bridge-abi";

/** Circle USDC list and Across chains-and-contracts, verified 2026-09-13. */
export const CARD_BRIDGE = {
  sourceNetwork: "eip155:8453",
  destinationNetwork: "eip155:59144",
  sourceChainId: 8453,
  destinationChainId: 59_144,
  inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  outputToken: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
  sourcePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  destinationPool: "0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75",
} as const;
const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Quote = Schema.Struct({
  quoteId: Schema.String.check(Schema.isMaxLength(128)),
  chainId: Schema.Literal(CARD_BRIDGE.sourceChainId),
  destinationChainId: Schema.Literal(CARD_BRIDGE.destinationChainId),
  swapper: EvmAddress,
  tradeType: Schema.Literal("EXACT_INPUT"),
  input: Schema.Struct({
    amount: TradingUnits,
    maximumAmount: TradingUnits,
    token: EvmAddress,
  }),
  output: Schema.Struct({
    amount: TradingUnits,
    minimumAmount: TradingUnits,
    token: EvmAddress,
    recipient: EvmAddress,
  }),
  quoteTimestamp: Time,
  fillDeadline: Time,
  exclusiveRelayer: EvmAddress,
  exclusivityDeadline: Time,
  estimatedFillTimeMs: Time,
});
const QuoteResponse = Schema.Struct({
  routing: Schema.Literal("BRIDGE"),
  quote: Quote,
});
const Hex = Schema.String.check(
  Schema.isPattern(/^0x(?:[a-fA-F0-9]{2})*$/u),
  Schema.isMaxLength(64_002)
);
const Calls = Schema.Struct({
  from: EvmAddress,
  chainId: Schema.Literal(CARD_BRIDGE.sourceChainId),
  calls: Schema.Array(
    Schema.Struct({
      to: EvmAddress,
      data: Hex,
      value: Schema.String.check(Schema.isPattern(/^(?:0|0x0+)$/u)),
      chainId: Schema.optionalKey(Schema.Literal(CARD_BRIDGE.sourceChainId)),
    })
  ).check(Schema.isMinLength(1), Schema.isMaxLength(2)),
});
export interface BuiltCardBridge {
  readonly calls: readonly {
    readonly to: `0x${string}`;
    readonly data: `0x${string}`;
    readonly value: "0";
  }[];
  readonly expectedOutput: string;
  readonly minimumOutput: string;
  readonly expiresAt: number;
  readonly fillDeadline: number;
}
const same = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();
const verifyBridgeInput = (input: TradeInput): void => {
  if (
    input.bridge === undefined ||
    input.action !== "bridge" ||
    input.network !== CARD_BRIDGE.sourceNetwork ||
    input.venue !== "uniswap" ||
    input.bridge.provenance !== "user" ||
    input.bridge.destinationNetwork !== CARD_BRIDGE.destinationNetwork ||
    !same(input.tokenIn, CARD_BRIDGE.inputToken) ||
    !same(input.tokenOut, CARD_BRIDGE.outputToken)
  ) {
    throw new Error(
      "trade.bridge_identity: only approved Base USDC funding to the saved Linea address is supported."
    );
  }
};
export const bridgeDeposit = (input: TradeInput, data: string) => {
  verifyBridgeInput(input);
  if (!isHex(data) || input.bridge === undefined) {
    throw new Error("trade.bridge_call: invalid deposit bytes.");
  }
  const decoded = decodeFunctionData({ abi: ACROSS_ABI, data });
  if (decoded.functionName !== "depositV3") {
    throw new Error("trade.bridge_call: unsupported Across deposit.");
  }
  const [
    depositor,
    recipient,
    tokenIn,
    tokenOut,
    amount,
    output,
    chain,
    relayer,
    timestamp,
    deadline,
    exclusivity,
    message,
  ] = decoded.args;
  if (
    !same(depositor, input.wallet) ||
    !same(recipient, input.bridge.recipient) ||
    !same(tokenIn, input.tokenIn) ||
    !same(tokenOut, input.tokenOut) ||
    amount !== BigInt(input.amount) ||
    output <= 0n ||
    output > amount ||
    chain !== BigInt(CARD_BRIDGE.destinationChainId) ||
    message !== "0x"
  ) {
    throw new Error(
      "trade.bridge_calldata: deposit differs from the approved wallet, recipient, assets, amounts or empty message."
    );
  }
  const canonical = encodeFunctionData({
    abi: ACROSS_ABI,
    functionName: "depositV3",
    args: decoded.args,
  });
  const suffix = data.slice(canonical.length);
  // Uniswap appends its non-executable 9-byte attribution tag to the ABI payload.
  if (
    !data.toLowerCase().startsWith(canonical.toLowerCase()) ||
    (suffix !== "" && !/^1dc0de[0-9a-f]{12}$/iu.test(suffix))
  ) {
    throw new Error("trade.bridge_calldata: noncanonical deposit bytes.");
  }
  return {
    depositor,
    recipient,
    tokenIn,
    tokenOut,
    amount,
    output,
    chain,
    relayer,
    timestamp,
    deadline,
    exclusivity,
    message,
  };
};
const verifyBridgeApproval = (
  input: TradeInput,
  result: typeof Calls.Type
): void => {
  const approval = result.calls.length === 2 ? result.calls[0] : undefined;
  if (approval !== undefined) {
    if (!same(approval.to, input.tokenIn) || !isHex(approval.data)) {
      throw new Error("trade.bridge_approval: unexpected approval token.");
    }
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data });
    if (
      decoded.functionName !== "approve" ||
      !same(decoded.args[0], CARD_BRIDGE.sourcePool) ||
      decoded.args[1] < BigInt(input.amount) ||
      approval.data.length !== 138
    ) {
      throw new Error(
        "trade.bridge_approval: unexpected allowance target or calldata."
      );
    }
  }
};
export const buildCardBridge = (
  input: TradeInput,
  quoteResponse: Schema.Json,
  callsResponse: Schema.Json,
  now: number
): BuiltCardBridge => {
  const { quote } = Schema.decodeUnknownSync(QuoteResponse)(quoteResponse);
  const result = Schema.decodeUnknownSync(Calls)(callsResponse);
  const depositCall = result.calls.at(-1);
  if (
    depositCall === undefined ||
    !same(depositCall.to, CARD_BRIDGE.sourcePool) ||
    !same(result.from, input.wallet)
  ) {
    throw new Error(
      "trade.bridge_calls: expected the owner's Base batch and verified Across pool."
    );
  }
  const deposit = bridgeDeposit(input, depositCall.data);
  const expiresAt = Math.min(
    now + 60_000,
    (quote.quoteTimestamp + 60) * 1000,
    quote.fillDeadline * 1000
  );
  if (
    !same(quote.swapper, input.wallet) ||
    quote.input.amount !== input.amount ||
    quote.input.maximumAmount !== input.amount ||
    !same(quote.input.token, input.tokenIn) ||
    !same(quote.output.token, input.tokenOut) ||
    !same(quote.output.recipient, deposit.recipient) ||
    BigInt(quote.output.minimumAmount) !== deposit.output ||
    BigInt(quote.output.amount) !== deposit.output ||
    quote.quoteTimestamp !== deposit.timestamp ||
    quote.fillDeadline !== deposit.deadline ||
    quote.exclusivityDeadline !== deposit.exclusivity ||
    !same(quote.exclusiveRelayer, deposit.relayer) ||
    quote.quoteTimestamp * 1000 > now + 5000 ||
    expiresAt <= now
  ) {
    throw new Error(
      "trade.bridge_quote: quote and deposit disagree or have expired."
    );
  }
  verifyBridgeApproval(input, result);
  if (!isHex(depositCall.data)) {
    throw new Error("trade.bridge_call: invalid deposit bytes.");
  }
  return {
    calls: [
      {
        to: getAddress(input.tokenIn),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [CARD_BRIDGE.sourcePool, BigInt(input.amount)],
        }),
        value: "0",
      },
      { to: CARD_BRIDGE.sourcePool, data: depositCall.data, value: "0" },
    ],
    expectedOutput: quote.output.amount,
    minimumOutput: quote.output.minimumAmount,
    expiresAt,
    fillDeadline: quote.fillDeadline * 1000,
  };
};
export interface CardBridgeQuotes {
  readonly quote: (input: TradeInput) => Promise<BuiltCardBridge>;
}
export const uniswapCardBridge = (
  key: Redacted.Redacted,
  call = fetch,
  now = Date.now
): CardBridgeQuotes => {
  const request = async (
    path: string,
    body: Schema.Json
  ): Promise<Schema.Json> => {
    const response = await call(
      `https://trade-api.gateway.uniswap.org/v1/${path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": Redacted.value(key),
          "x-universal-router-version": "2.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("trade.bridge_provider: bridge quote unavailable.");
    }
    return Schema.decodeUnknownSync(Schema.Json)(
      JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 128_000))
      )
    );
  };
  return {
    quote: async (input) => {
      if (input.bridge === undefined) {
        throw new Error("trade.bridge_identity: missing saved payment method.");
      }
      const response = await request("quote", {
        type: "EXACT_INPUT",
        amount: input.amount,
        tokenInChainId: CARD_BRIDGE.sourceChainId,
        tokenOutChainId: CARD_BRIDGE.destinationChainId,
        tokenIn: input.tokenIn,
        tokenOut: input.tokenOut,
        swapper: input.wallet,
        recipient: input.bridge.recipient,
        slippageTolerance: input.slippageBps / 100,
      });
      Schema.decodeUnknownSync(QuoteResponse)(response);
      const calls = await request("swap_5792", {
        quote: Schema.decodeUnknownSync(Schema.Struct({ quote: Schema.Json }))(
          response
        ).quote,
      });
      return buildCardBridge(input, response, calls, now());
    },
  };
};
