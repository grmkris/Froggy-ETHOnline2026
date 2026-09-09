import { EvmAddress, TradingUnits } from "@froggy/domain";
import type { TradeInput } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";

const Integer = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Text = Schema.String.check(Schema.isMaxLength(128));
const Transaction = Schema.Struct({
  from: EvmAddress,
  to: EvmAddress,
  value: TradingUnits,
  data: Schema.String.check(
    Schema.isPattern(/^0x(?:[a-fA-F0-9]{2})*$/u),
    Schema.isMaxLength(64_002)
  ),
});
export const EnsoRoute = Schema.Struct({
  gas: TradingUnits,
  amountOut: TradingUnits,
  minAmountOut: TradingUnits,
  createdAt: Integer,
  feeAmount: Schema.Array(TradingUnits).check(Schema.isMaxLength(1)),
  ensoFeeAmount: Schema.Array(TradingUnits).check(Schema.isMaxLength(1)),
  tx: Transaction,
  preTransactions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        type: Schema.Literals(["tokenApproval", "requiredApproval"]),
        tx: Transaction,
      })
    ).check(Schema.isMaxLength(2))
  ),
  route: Schema.Array(
    Schema.Struct({
      tokenIn: Schema.Array(EvmAddress).check(Schema.isMaxLength(2)),
      tokenOut: Schema.Array(EvmAddress).check(Schema.isMaxLength(2)),
      protocol: Text,
      action: Text,
      primary: EvmAddress,
    })
  ).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
});
export type EnsoRoute = typeof EnsoRoute.Type;
const Position = Schema.Struct({
  address: EvmAddress,
  chainId: Integer,
  type: Schema.Literal("defi"),
  protocolSlug: Text,
  primaryAddress: EvmAddress,
  underlyingTokens: Schema.Array(
    Schema.Struct({ address: EvmAddress, chainId: Integer })
  ).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
});
const Positions = Schema.Struct({
  data: Schema.Array(Position).check(Schema.isMaxLength(2)),
});

export interface EnsoOptions {
  readonly apiKey: Redacted.Redacted;
  readonly outbound?: OutboundOptions;
}

const request = async <S extends Schema.Codec<unknown>>(
  options: EnsoOptions,
  path: string,
  params: URLSearchParams,
  schema: S
): Promise<S["Type"]> => {
  const response = await safeFetch(
    `https://api.enso.build/api/v1/${path}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${Redacted.value(options.apiKey)}`,
        accept: "application/json",
      },
    },
    { ...options.outbound, maxRedirects: 0, timeoutMs: 25_000 }
  ).catch(() => {
    throw new Error("trade.provider_unavailable: Enso transport failed.");
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `trade.provider_unavailable: Enso returned HTTP ${response.status}.`
    );
  }
  try {
    return Schema.decodeUnknownSync(schema)(
      JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 128_000))
      )
    );
  } catch {
    throw new Error(
      "trade.provider_invalid: Enso returned invalid bounded JSON."
    );
  }
};

const validateRouteResult = (input: TradeInput, result: EnsoRoute): void => {
  if (
    result.tx.from.toLowerCase() !== input.wallet.toLowerCase() ||
    result.tx.value !== "0" ||
    [...result.feeAmount, ...result.ensoFeeAmount].some(
      (amount) => BigInt(amount) !== 0n
    )
  ) {
    throw new Error(
      "trade.route: Enso returned unexpected sender, native value or provider fees."
    );
  }
  const minimum =
    (BigInt(result.amountOut) * BigInt(10_000 - input.slippageBps)) / 10_000n;
  if (
    BigInt(result.minAmountOut) < minimum ||
    BigInt(result.minAmountOut) <= 0n ||
    BigInt(result.minAmountOut) > BigInt(result.amountOut)
  ) {
    throw new Error("trade.slippage: Enso returned an invalid minimum output.");
  }
};

export const ensoRoute = async (
  options: EnsoOptions,
  input: TradeInput
): Promise<EnsoRoute> => {
  if (
    input.network !== "eip155:1" ||
    !["deposit", "withdraw"].includes(input.action) ||
    input.position === null ||
    input.tokenIn === "native" ||
    input.tokenOut === "native"
  ) {
    throw new Error(
      "trade.route: Enso currently supports Ethereum ERC-4626 deposits and share redemptions."
    );
  }
  const position = input.position.toLowerCase();
  const vault = input.action === "deposit" ? input.tokenOut : input.tokenIn;
  const asset = input.action === "deposit" ? input.tokenIn : input.tokenOut;
  if (vault.toLowerCase() !== position) {
    throw new Error(
      "trade.position: the position must match the vault share token."
    );
  }
  const positions = await request(
    options,
    "tokens",
    new URLSearchParams({
      chainId: "1",
      address: position,
      type: "defi",
      pageSize: "2",
      includeUnderlying: "true",
    }),
    Positions
  );
  const [known] = positions.data;
  if (
    positions.data.length !== 1 ||
    known?.chainId !== 1 ||
    known.address.toLowerCase() !== position ||
    known.primaryAddress.toLowerCase() !== position ||
    known.underlyingTokens[0]?.address.toLowerCase() !== asset.toLowerCase() ||
    known.underlyingTokens[0].chainId !== 1
  ) {
    throw new Error(
      "trade.position: Enso did not establish the requested tokenized vault and underlying asset."
    );
  }
  const result = await request(
    options,
    "shortcuts/route",
    new URLSearchParams({
      chainId: "1",
      fromAddress: input.wallet,
      receiver: input.wallet,
      refundReceiver: input.wallet,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amount,
      slippage: input.slippageBps.toString(),
      routingStrategy: "router",
    }),
    EnsoRoute
  );
  validateRouteResult(input, result);
  return result;
};

const Balance = Schema.Struct({
  token: EvmAddress,
  chainId: Integer,
  decimals: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 36 })),
  symbol: Schema.String.check(Schema.isMaxLength(64)),
});

/** Provider discovery only; the caller independently reads balances at one RPC block. */
export const ensoBalances = async (options: EnsoOptions, wallet: string) =>
  await request(
    options,
    "wallet/balances",
    new URLSearchParams({ chainId: "1", eoaAddress: wallet, useEoa: "true" }),
    Schema.Array(Balance).check(Schema.isMaxLength(100))
  );
