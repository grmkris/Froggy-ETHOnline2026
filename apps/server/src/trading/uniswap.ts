import { EvmAddress, TradeQuoteId } from "@froggy/domain";
import {
  SwapQuoteInput,
  SwapQuoteResult,
  TradingUnits,
} from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";
import { chainIdOf, PONS_NETWORK } from "./networks";

const ORIGIN = "https://trade-api.gateway.uniswap.org/v1";
const ZERO = "0x0000000000000000000000000000000000000000";
const REFRESH_MS = 30_000;
const RESPONSE_BYTES = 128 * 1024;

/** Documented API coverage, not a statement that a token or launch phase has liquidity. */
const UNISWAP_NETWORKS = [
  "eip155:1",
  "eip155:10",
  "eip155:56",
  "eip155:130",
  "eip155:137",
  "eip155:143",
  "eip155:196",
  "eip155:324",
  "eip155:480",
  "eip155:1868",
  "eip155:4217",
  "eip155:4326",
  PONS_NETWORK,
  "eip155:8453",
  "eip155:42161",
  "eip155:42220",
  "eip155:43114",
  "eip155:57073",
  "eip155:59144",
  "eip155:7777777",
  "eip155:1301",
  "eip155:84532",
  "eip155:11155111",
] as const;

export interface UniswapChain {
  readonly network: string;
  readonly routerVersion: "2.0" | "2.1.1";
}

export const supportsUniswapChain = (chain: UniswapChain): boolean =>
  UNISWAP_NETWORKS.some((network) => network === chain.network) &&
  !(chain.network === PONS_NETWORK && chain.routerVersion === "2.0") &&
  !(chain.network === "eip155:324" && chain.routerVersion === "2.1.1");

export interface UniswapOptions {
  readonly apiKey: Redacted.Redacted;
  readonly chains: readonly UniswapChain[];
  readonly protocols?: readonly ("V2" | "V3" | "V4")[];
  readonly outbound?: OutboundOptions;
  readonly now?: () => number;
}

export interface UniswapQuotes {
  readonly quote: (input: SwapQuoteInput) => Promise<SwapQuoteResult>;
}

type FailureCode =
  | "invalid_input"
  | "unsupported_network"
  | "unavailable"
  | "no_route"
  | "unsupported_routing"
  | "invalid_response"
  | "provider_failure";

export class UniswapQuoteError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = "UniswapQuoteError";
    this.code = code;
  }
}

const ShortText = Schema.String.check(Schema.isMaxLength(128));
const Decimal = TradingUnits;
const IntegerText = Schema.String.check(Schema.isPattern(/^-?\d{1,12}$/u));
const Quantity = Schema.String.check(
  Schema.isPattern(/^(?:0x[\da-fA-F]{1,64}|\d{1,78})$/u)
);
const PoolId = Schema.String.check(Schema.isPattern(/^0x[\da-fA-F]{64}$/u));
const RouteToken = Schema.Struct({ address: EvmAddress, chainId: Schema.Int });
const poolFields = { tokenIn: RouteToken, tokenOut: RouteToken };
const Pool = Schema.Union([
  Schema.Struct({
    ...poolFields,
    type: Schema.Literals(["v2-pool"]),
    address: EvmAddress,
  }),
  Schema.Struct({
    ...poolFields,
    type: Schema.Literals(["v3-pool"]),
    address: EvmAddress,
    fee: Decimal,
  }),
  Schema.Struct({
    ...poolFields,
    type: Schema.Literals(["v4-pool"]),
    address: PoolId,
    fee: Decimal,
    tickSpacing: IntegerText,
    hooks: EvmAddress,
  }),
]);
const Output = Schema.Struct({
  amount: Decimal,
  token: EvmAddress,
  recipient: EvmAddress,
  minimumAmount: Schema.optional(Decimal),
});
const AggregatedOutput = Schema.Struct({
  amount: Decimal,
  token: EvmAddress,
  recipient: EvmAddress,
  minAmount: Schema.optional(Decimal),
  fee: Schema.optional(Schema.Literals(["INTEGRATOR"])),
});
const ClassicQuote = Schema.Struct({
  chainId: Schema.Int,
  input: Schema.Struct({ amount: Decimal, token: EvmAddress }),
  output: Output,
  swapper: EvmAddress,
  slippage: Schema.Number,
  tradeType: Schema.Literals(["EXACT_INPUT"]),
  quoteId: Schema.optional(ShortText),
  route: Schema.Array(
    Schema.Array(Pool).check(Schema.isMinLength(1), Schema.isMaxLength(8))
  ).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  aggregatedOutputs: Schema.optional(
    Schema.Array(AggregatedOutput).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(9)
    )
  ),
  gasUseEstimate: Schema.optional(Decimal),
  gasFee: Schema.optional(Decimal),
  blockNumber: Schema.optional(Decimal),
  txFailureReasons: Schema.optional(
    Schema.Array(ShortText).check(Schema.isMaxLength(8))
  ),
});
const PermitField = Schema.Struct({ name: ShortText, type: ShortText });
const Permit = Schema.Struct({
  domain: Schema.Struct({
    name: Schema.Literals(["Permit2"]),
    chainId: Schema.Int,
    verifyingContract: EvmAddress,
  }),
  types: Schema.Struct({
    PermitSingle: Schema.Array(PermitField).check(Schema.isLengthBetween(3, 3)),
    PermitDetails: Schema.Array(PermitField).check(
      Schema.isLengthBetween(4, 4)
    ),
  }),
  values: Schema.Struct({
    details: Schema.Struct({
      token: EvmAddress,
      amount: Decimal,
      expiration: Decimal,
      nonce: Decimal,
    }),
    spender: EvmAddress,
    sigDeadline: Decimal,
  }),
});
const Envelope = Schema.Struct({
  routing: ShortText,
  requestId: Schema.optional(ShortText),
  quote: Schema.Unknown,
  permitData: Schema.NullOr(Permit),
  permitTransaction: Schema.optional(Schema.NullOr(Schema.Unknown)),
  isTokenApprovalApplicable: Schema.optional(Schema.Boolean),
});
const ApprovalTransaction = Schema.Struct({
  to: EvmAddress,
  from: EvmAddress,
  chainId: Schema.Int,
  value: Quantity,
  data: Schema.String.check(
    Schema.isPattern(
      /^0x095ea7b3000000000000000000000000[\da-f]{40}[\da-f]{64}$/iu
    )
  ),
});
const ApprovalResponse = Schema.Struct({
  requestId: Schema.optional(ShortText),
  approval: Schema.NullOr(ApprovalTransaction),
  cancel: Schema.NullOr(ApprovalTransaction),
  gasFee: Schema.optional(Decimal),
  cancelGasFee: Schema.optional(Decimal),
});

const same = (first: string, second: string): boolean =>
  first.toLowerCase() === second.toLowerCase();
const fail = (message: string): never => {
  throw new UniswapQuoteError("invalid_response", message);
};
const chainIdOfQuote = (input: SwapQuoteInput): number => {
  const chainId = chainIdOf(input.network);
  if (chainId === null) {
    throw new UniswapQuoteError("unsupported_network", "Unsupported network.");
  }
  return chainId;
};

/** Run before buying a quote, so known input failures do not consume a paid task. */
export const preflightSwapQuote = (request: SwapQuoteInput): SwapQuoteInput => {
  let input: SwapQuoteInput;
  try {
    input = Schema.decodeUnknownSync(SwapQuoteInput)(request);
  } catch {
    throw new UniswapQuoteError(
      "invalid_input",
      "Uniswap quote input is invalid."
    );
  }
  if (same(input.tokenIn, input.tokenOut)) {
    throw new UniswapQuoteError(
      "invalid_input",
      "Input and output tokens must differ."
    );
  }
  if (same(input.tokenIn, ZERO) || same(input.tokenOut, ZERO)) {
    throw new UniswapQuoteError(
      "invalid_input",
      "This quote adapter supports ERC-20 tokens only; native-token wrapping is not supported."
    );
  }
  if (BigInt(input.amount) >= 2n ** 160n) {
    throw new UniswapQuoteError(
      "invalid_input",
      "The amount exceeds the exact Permit2 allowance range."
    );
  }
  return input;
};

interface QuoteRequestBody {
  readonly type: "EXACT_INPUT";
  readonly amount: string;
  readonly tokenIn: string;
  readonly tokenOut: string;
  readonly tokenInChainId: number;
  readonly tokenOutChainId: number;
  readonly swapper: string;
  readonly recipient: string;
  readonly slippageTolerance: number;
  readonly protocols: readonly string[];
  readonly routingPreference: "BEST_PRICE";
  readonly hooksOptions: "V4_NO_HOOKS";
  readonly permitAmount: "EXACT";
  readonly generatePermitAsTransaction: false;
}
interface ApprovalRequestBody {
  readonly walletAddress: string;
  readonly token: string;
  readonly amount: string;
  readonly chainId: number;
  readonly includeGasInfo: true;
}

const post = async <S extends Schema.Codec<unknown>>(
  options: UniswapOptions,
  chain: UniswapChain,
  path: "/quote" | "/check_approval",
  body: QuoteRequestBody | ApprovalRequestBody,
  schema: S
): Promise<S["Type"]> => {
  const headers = new Headers({
    "x-api-key": Redacted.value(options.apiKey),
    "content-type": "application/json",
    accept: "application/json",
  });
  if (path === "/quote") {
    headers.set("x-universal-router-version", chain.routerVersion);
  }
  const response = await safeFetch(
    `${ORIGIN}${path}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    { ...options.outbound, maxRedirects: 0, timeoutMs: 15_000 }
  );
  if (!response.ok) {
    await response.body?.cancel();
    const code = response.status === 404 ? "no_route" : "provider_failure";
    throw new UniswapQuoteError(
      code,
      `Uniswap returned HTTP ${response.status}; no automatic retry.`
    );
  }
  return Schema.decodeUnknownSync(schema)(
    JSON.parse(
      new TextDecoder().decode(await boundedBytes(response, RESPONSE_BYTES))
    )
  );
};

const verifyQuote = (
  quote: typeof ClassicQuote.Type,
  input: SwapQuoteInput
): void => {
  if (
    quote.chainId !== chainIdOfQuote(input) ||
    !same(quote.swapper, input.wallet) ||
    !same(quote.input.token, input.tokenIn) ||
    quote.input.amount !== input.amount ||
    !same(quote.output.token, input.tokenOut) ||
    !same(quote.output.recipient, input.wallet) ||
    !Number.isFinite(quote.slippage) ||
    Math.abs(quote.slippage * 100 - input.slippageBps) > 0.000001
  ) {
    fail(
      "Uniswap quote does not match the requested wallet, tokens, amount, chain or slippage."
    );
  }
  if (BigInt(quote.output.amount) === 0n) {
    fail("Uniswap returned an empty output amount.");
  }
};

const routeSummary = (
  quote: typeof ClassicQuote.Type,
  input: SwapQuoteInput
): SwapQuoteResult["route"] =>
  quote.route.map((path) => {
    let previous = input.tokenIn;
    const result = path.map((pool) => {
      if (
        pool.tokenIn.chainId !== chainIdOfQuote(input) ||
        pool.tokenOut.chainId !== chainIdOfQuote(input) ||
        !same(pool.tokenIn.address, previous)
      ) {
        fail("Uniswap returned an inconsistent route.");
      }
      previous = pool.tokenOut.address;
      const base = {
        tokenIn: pool.tokenIn.address,
        tokenOut: pool.tokenOut.address,
      };
      if (pool.type === "v4-pool") {
        if (!same(pool.hooks, ZERO)) {
          fail(
            "Uniswap returned a hook-dependent route, which this adapter does not support."
          );
        }
        return {
          ...base,
          protocol: "v4" as const,
          pool: pool.address,
          hook: pool.hooks,
          feeTier: pool.fee,
          tickSpacing: Number(pool.tickSpacing),
        };
      }
      return {
        ...base,
        protocol: pool.type === "v2-pool" ? ("v2" as const) : ("v3" as const),
        pool: pool.address,
        hook: null,
        feeTier: pool.type === "v3-pool" ? pool.fee : null,
        tickSpacing: null,
      };
    });
    if (!same(previous, input.tokenOut)) {
      fail("Uniswap route does not end at the requested output token.");
    }
    return result;
  });

const minimum = (value: string | undefined, amount: string): string | null => {
  if (value !== undefined && BigInt(value) > BigInt(amount)) {
    fail("Uniswap returned a minimum output above the expected output.");
  }
  return value ?? null;
};

const summarizeOutputs = (
  quote: typeof ClassicQuote.Type,
  input: SwapQuoteInput
): Pick<SwapQuoteResult, "output" | "feeOutputs"> => {
  const outputs = quote.aggregatedOutputs;
  if (outputs === undefined) {
    return {
      output: {
        token: input.tokenOut,
        expectedAmount: quote.output.amount,
        minimumAmount: minimum(quote.output.minimumAmount, quote.output.amount),
      },
      feeOutputs: [],
    };
  }
  const walletOutputs = outputs.filter((output) => output.fee === undefined);
  if (
    walletOutputs.length === 0 ||
    outputs.some((output) => !same(output.token, input.tokenOut)) ||
    walletOutputs.some((output) => !same(output.recipient, input.wallet))
  ) {
    fail("Uniswap returned unexpected output tokens or recipients.");
  }
  const expected = walletOutputs.reduce(
    (total, output) => total + BigInt(output.amount),
    0n
  );
  if (expected === 0n || expected > BigInt(quote.output.amount)) {
    fail("Uniswap returned inconsistent wallet output amounts.");
  }
  const minima = walletOutputs.map((output) =>
    minimum(output.minAmount, output.amount)
  );
  const min = minima.every((value) => value !== null)
    ? minima.reduce((total, value) => total + BigInt(value), 0n).toString()
    : null;
  return {
    output: {
      token: input.tokenOut,
      expectedAmount: expected.toString(),
      minimumAmount: min,
    },
    feeOutputs: outputs
      .filter((output) => output.fee !== undefined)
      .map((output) => ({
        token: output.token,
        recipient: output.recipient,
        amount: output.amount,
        minimumAmount: minimum(output.minAmount, output.amount),
      })),
  };
};

const EXPECTED_PERMIT_FIELDS = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
};

const permitSummary = (
  data: typeof Permit.Type | null,
  input: SwapQuoteInput,
  now: number
): SwapQuoteResult["permit"] => {
  if (data === null) {
    return null;
  }
  const permit = data;
  const { details } = permit.values;
  if (
    permit.domain.chainId !== chainIdOfQuote(input) ||
    !same(details.token, input.tokenIn) ||
    details.amount !== input.amount ||
    BigInt(details.amount) >= 2n ** 160n ||
    BigInt(details.nonce) >= 2n ** 48n ||
    BigInt(details.expiration) >= 2n ** 48n ||
    BigInt(details.expiration) * 1000n <= BigInt(now) ||
    BigInt(permit.values.sigDeadline) * 1000n <= BigInt(now) ||
    JSON.stringify(permit.types) !== JSON.stringify(EXPECTED_PERMIT_FIELDS)
  ) {
    fail("Uniswap returned an expired or inconsistent exact-amount permit.");
  }
  return {
    kind: "PermitSingle",
    verifyingContract: permit.domain.verifyingContract,
    spender: permit.values.spender,
    token: details.token,
    amount: details.amount,
    nonce: details.nonce,
    expiration: details.expiration,
    signatureDeadline: permit.values.sigDeadline,
  };
};

const approvalTransaction = (
  tx: typeof ApprovalTransaction.Type,
  kind: "approve" | "reset",
  input: SwapQuoteInput
): SwapQuoteResult["approval"]["transactions"][number] => {
  if (
    !same(tx.to, input.tokenIn) ||
    !same(tx.from, input.wallet) ||
    tx.chainId !== chainIdOfQuote(input) ||
    BigInt(tx.value) !== 0n
  ) {
    fail("Uniswap returned an inconsistent approval transaction.");
  }
  const spender = Schema.decodeUnknownSync(EvmAddress)(
    `0x${tx.data.slice(34, 74)}`
  );
  const amount = BigInt(`0x${tx.data.slice(74)}`);
  if (
    (kind === "reset" && amount !== 0n) ||
    (kind === "approve" && amount < BigInt(input.amount))
  ) {
    fail("Uniswap returned an inconsistent approval amount.");
  }
  return {
    kind,
    token: tx.to,
    spender,
    amount: amount.toString(),
    exceedsRequestedAmount: amount > BigInt(input.amount),
  };
};

const noApproval = (): SwapQuoteResult["approval"] => ({
  status: "not_applicable",
  requestId: null,
  transactions: [],
  gasFee: null,
  resetGasFee: null,
});

const approvals = async (
  options: UniswapOptions,
  chain: UniswapChain,
  input: SwapQuoteInput,
  applicable: boolean | undefined
): Promise<SwapQuoteResult["approval"]> => {
  if (applicable === false) {
    return noApproval();
  }
  const response = await post(
    options,
    chain,
    "/check_approval",
    {
      walletAddress: input.wallet,
      token: input.tokenIn,
      amount: input.amount,
      chainId: chainIdOfQuote(input),
      includeGasInfo: true,
    },
    ApprovalResponse
  );
  if (response.cancel !== null && response.approval === null) {
    fail(
      "Uniswap returned an approval reset without the replacement approval."
    );
  }
  const transactions = [];
  if (response.cancel !== null) {
    transactions.push(approvalTransaction(response.cancel, "reset", input));
  }
  if (response.approval !== null) {
    transactions.push(approvalTransaction(response.approval, "approve", input));
  }
  const [first, second] = transactions;
  if (
    first !== undefined &&
    second !== undefined &&
    !same(first.spender, second.spender)
  ) {
    fail("Uniswap reset and approval use different spenders.");
  }
  let status: SwapQuoteResult["approval"]["status"] = "sufficient";
  if (response.approval !== null) {
    status = "required";
  }
  if (response.cancel !== null) {
    status = "reset_required";
  }
  return {
    status,
    requestId: response.requestId ?? null,
    transactions,
    gasFee: response.gasFee ?? null,
    resetGasFee: response.cancelGasFee ?? null,
  };
};

const simulation = (
  quote: typeof ClassicQuote.Type
): SwapQuoteResult["simulation"] => {
  const reasons = quote.txFailureReasons;
  let status: SwapQuoteResult["simulation"]["status"] = "unknown";
  if (reasons !== undefined) {
    status = reasons.length === 0 ? "passed" : "failed";
    if (
      reasons.length > 0 &&
      reasons.every(
        (reason) =>
          reason === "UNSUPPORTED_SIMULATION" ||
          reason === "SIMULATION_UNAVAILABLE"
      )
    ) {
      status = "unavailable";
    }
  }
  return {
    source: "provider",
    status,
    failureReasons: reasons ?? [],
    independentlySimulated: false,
    blockNumber: quote.blockNumber ?? null,
  };
};

const LIMITATIONS = [
  "Unsigned research only. This result cannot be executed or used as signing authorization.",
  "Refresh after 30 seconds is a local freshness policy, not a provider expiry or execution guarantee.",
  "Approval and permit targets are provider supplied; future signing requires independent deployment and policy checks.",
  "ERC-20 swaps only: no native wrapping, hook-dependent pools, order routes or launch curves. New tokens may take minutes to become routable.",
  "Token taxes and transfer restrictions are not assessed by this quote.",
  "Provider simulation is not independent verification. Gas estimates exclude approvals and balances may change.",
] as const;

const quoteLive = async (
  options: UniswapOptions,
  chain: UniswapChain,
  input: SwapQuoteInput
): Promise<SwapQuoteResult> => {
  const envelope = await post(
    options,
    chain,
    "/quote",
    {
      type: "EXACT_INPUT",
      amount: input.amount,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      tokenInChainId: chainIdOfQuote(input),
      tokenOutChainId: chainIdOfQuote(input),
      swapper: input.wallet,
      recipient: input.wallet,
      slippageTolerance: input.slippageBps / 100,
      protocols: options.protocols ?? ["V2", "V3", "V4"],
      routingPreference: "BEST_PRICE",
      hooksOptions: "V4_NO_HOOKS",
      permitAmount: "EXACT",
      generatePermitAsTransaction: false,
    },
    Envelope
  );
  if (envelope.routing !== "CLASSIC") {
    throw new UniswapQuoteError(
      "unsupported_routing",
      "Uniswap returned a route that the read-only Classic adapter does not support."
    );
  }
  if (
    envelope.permitTransaction !== undefined &&
    envelope.permitTransaction !== null
  ) {
    fail("Uniswap unexpectedly returned a permit transaction.");
  }
  const observedAt = (options.now ?? Date.now)();
  const quote = Schema.decodeUnknownSync(ClassicQuote)(envelope.quote);
  verifyQuote(quote, input);
  const route = routeSummary(quote, input);
  const outputs = summarizeOutputs(quote, input);
  const permit = permitSummary(envelope.permitData, input, observedAt);
  const approval = await approvals(
    options,
    chain,
    input,
    envelope.isTokenApprovalApplicable
  );
  return Schema.decodeUnknownSync(SwapQuoteResult)({
    v: 1,
    operation: "quote_action",
    provider: "uniswap",
    stubbed: false,
    observedAt,
    network: input.network,
    input,
    quoteId: TradeQuoteId.generate(),
    requestId: envelope.requestId ?? null,
    providerQuoteId: quote.quoteId ?? null,
    refreshAfter: observedAt + REFRESH_MS,
    providerExpiresAt: null,
    routing: "CLASSIC",
    ...outputs,
    route,
    approval,
    permit,
    gas: {
      units: quote.gasUseEstimate ?? null,
      nativeFee: quote.gasFee ?? null,
      includesApprovals: false,
    },
    simulation: simulation(quote),
    limitations: LIMITATIONS,
  });
};

export const liveUniswap = (options: UniswapOptions): UniswapQuotes => ({
  quote: async (request) => {
    const input = preflightSwapQuote(request);
    const chain = options.chains.find(
      (candidate) =>
        candidate.network === input.network && supportsUniswapChain(candidate)
    );
    if (chain === undefined) {
      throw new UniswapQuoteError(
        "unsupported_network",
        "Uniswap quotes are not configured for this network."
      );
    }
    if (Redacted.value(options.apiKey).trim() === "") {
      throw new UniswapQuoteError(
        "unavailable",
        "Uniswap API access is not configured."
      );
    }
    try {
      return await quoteLive(options, chain, input);
    } catch (error) {
      if (error instanceof UniswapQuoteError) {
        throw error;
      }
      // Schema errors contain provider values; transport errors can contain request headers.
      throw new UniswapQuoteError(
        "invalid_response",
        "Uniswap request failed or returned an invalid bounded response; no automatic retry."
      );
    }
  },
});

export const stubUniswap = (): UniswapQuotes => ({
  quote: async (request) => {
    const input = preflightSwapQuote(request);
    const observedAt = Date.now();
    await Promise.resolve();
    return Schema.decodeUnknownSync(SwapQuoteResult)({
      v: 1,
      operation: "quote_action",
      provider: "uniswap",
      stubbed: true,
      observedAt,
      network: input.network,
      input,
      quoteId: TradeQuoteId.generate(),
      requestId: null,
      providerQuoteId: null,
      refreshAfter: observedAt + REFRESH_MS,
      providerExpiresAt: null,
      routing: "CLASSIC",
      output: {
        token: input.tokenOut,
        expectedAmount: input.amount,
        minimumAmount: null,
      },
      route: [],
      approval: noApproval(),
      permit: null,
      feeOutputs: [],
      gas: { units: null, nativeFee: null, includesApprovals: false },
      simulation: {
        source: "provider",
        status: "unknown",
        failureReasons: [],
        independentlySimulated: false,
        blockNumber: null,
      },
      limitations: [
        "Demo fixture: amounts do not represent a market quote, allowance check or simulation.",
        ...LIMITATIONS,
      ],
    });
  },
});
