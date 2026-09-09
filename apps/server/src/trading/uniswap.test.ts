import { describe, expect, it } from "bun:test";

import { EvmAddress } from "@froggy/domain";
import { SwapQuoteInput, SwapQuoteResult } from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import {
  liveUniswap,
  preflightSwapQuote,
  stubUniswap,
  supportsUniswapChain,
  UniswapQuoteError,
} from "./uniswap";

const address = Schema.decodeUnknownSync(EvmAddress);

// Synthetic fixtures following the official OpenAPI response shapes; never live configuration.
const WALLET = address("0x1111111111111111111111111111111111111111");
const TOKEN_IN = address("0x2222222222222222222222222222222222222222");
const TOKEN_OUT = address("0x3333333333333333333333333333333333333333");
const POOL = address("0x4444444444444444444444444444444444444444");
const SPENDER = address("0x5555555555555555555555555555555555555555");
const PERMIT2 = address("0x6666666666666666666666666666666666666666");
const FEE_RECIPIENT = address("0x7777777777777777777777777777777777777777");
const ZERO = address("0x0000000000000000000000000000000000000000");
const NOW = 1_783_000_000_000;
const input = Schema.decodeUnknownSync(SwapQuoteInput)({
  network: "eip155:8453",
  wallet: WALLET,
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amount: "1000000",
  slippageBps: 50,
});
const POOL_DATA = {
  type: "v3-pool",
  address: POOL,
  tokenIn: {
    address: TOKEN_IN,
    chainId: 8453,
    decimals: "6",
    symbol: "TEST_IN",
  },
  tokenOut: {
    address: TOKEN_OUT,
    chainId: 8453,
    decimals: "6",
    symbol: "TEST_OUT",
  },
  fee: "3000",
  liquidity: "2000000000000",
  sqrtRatioX96: "79228162514264337593543950336",
  tickCurrent: "0",
  amountIn: "1000000",
  amountOut: "2000000",
};
const QUOTE = {
  chainId: 8453,
  input: { amount: "1000000", token: TOKEN_IN },
  output: {
    amount: "2000000",
    token: TOKEN_OUT,
    recipient: WALLET,
    minimumAmount: "1990000",
  },
  swapper: WALLET,
  slippage: 0.5,
  tradeType: "EXACT_INPUT",
  quoteId: "62e83902-9455-405d-8c62-cdf8ee9e2042",
  route: [[POOL_DATA]],
  gasUseEstimate: "180350",
  gasFee: "489108586810000",
  blockNumber: "22483653",
  txFailureReasons: [],
};
type PoolFixture = Omit<typeof POOL_DATA, "address"> & {
  readonly address: string;
  readonly hooks?: string;
  readonly tickSpacing?: string;
};
type QuoteFixture = Omit<
  typeof QUOTE,
  "output" | "txFailureReasons" | "route"
> & {
  readonly output: {
    readonly amount: string;
    readonly token: string;
    readonly recipient: string;
    readonly minimumAmount?: string;
  };
  readonly txFailureReasons?: readonly string[] | undefined;
  readonly route: readonly (readonly PoolFixture[])[];
  readonly aggregatedOutputs?: readonly {
    readonly amount: string;
    readonly token: string;
    readonly recipient: string;
    readonly minAmount?: string;
    readonly fee?: string;
  }[];
};
const quoteFixture = (
  overrides: {
    readonly routing?: string;
    readonly quote?: QuoteFixture;
    readonly permitData?: ReturnType<typeof permit>;
    readonly isTokenApprovalApplicable?: boolean;
  } = {}
) => ({
  requestId: "34784ef4-065a-4fa2-b77c-521f785fc068",
  routing: "CLASSIC",
  quote: QUOTE,
  permitData: null,
  permitTransaction: null,
  ...overrides,
});
const noApproval = () => ({
  requestId: "approval-fixture",
  approval: null,
  cancel: null,
});
const approval = (amount: bigint) => ({
  to: TOKEN_IN,
  from: WALLET,
  chainId: 8453,
  value: "0x00",
  data: `0x095ea7b3${SPENDER.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`,
});
const permit = () => ({
  domain: { name: "Permit2", chainId: 8453, verifyingContract: PERMIT2 },
  types: {
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
  },
  values: {
    details: {
      token: TOKEN_IN,
      amount: "1000000",
      nonce: "1",
      expiration: String(NOW / 1000 + 3600),
    },
    spender: SPENDER,
    sigDeadline: String(NOW / 1000 + 600),
  },
});
const fixture = (responses: readonly Response[]) => {
  const requests: {
    url: string;
    headers: Headers;
    method: string | undefined;
    body: string;
  }[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      await Promise.resolve();
      requests.push({
        url: url instanceof Request ? url.url : String(url),
        headers: new Headers(init?.headers),
        method: init?.method,
        body: Schema.decodeUnknownSync(Schema.String)(init?.body),
      });
      const response = responses[requests.length - 1];
      if (response === undefined) {
        throw new Error("Unexpected extra provider call.");
      }
      return response;
    },
    { preconnect: (): void => undefined }
  );
  const options = {
    apiKey: Redacted.make("test-only-api-secret"),
    chains: [{ network: "eip155:8453", routerVersion: "2.0" as const }],
    outbound: {
      fetch: fetchImpl,
      lookup: async () => await Promise.resolve(["93.184.216.34"]),
    },
    now: () => NOW,
  };
  return { requests, options, provider: liveUniswap(options) };
};

const rejectsQuote = async (
  operation: Promise<SwapQuoteResult>,
  expected: Partial<Pick<UniswapQuoteError, "code" | "message">>
): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(UniswapQuoteError);
    if (error instanceof UniswapQuoteError) {
      expect(error).toMatchObject(expected);
      return;
    }
    throw error;
  }
  throw new Error("Expected the quote request to fail.");
};

describe("Uniswap read-only quotes", () => {
  it("requests bounded Classic quotes and approval checks without creating a swap or signature", async () => {
    const setup = fixture([
      Response.json(quoteFixture()),
      Response.json(noApproval()),
    ]);
    const result = await setup.provider.quote(input);
    expect(Schema.is(SwapQuoteResult)(result)).toBe(true);
    expect(result.output).toEqual({
      token: TOKEN_OUT,
      expectedAmount: "2000000",
      minimumAmount: "1990000",
    });
    expect(result.approval.status).toBe("sufficient");
    expect(result.gas.includesApprovals).toBe(false);
    expect(result.simulation).toMatchObject({
      status: "passed",
      independentlySimulated: false,
    });
    expect(result.refreshAfter).toBe(NOW + 30_000);
    expect(result.providerExpiresAt).toBeNull();
    expect(setup.requests.map((request) => request.url)).toEqual([
      "https://trade-api.gateway.uniswap.org/v1/quote",
      "https://trade-api.gateway.uniswap.org/v1/check_approval",
    ]);
    expect(setup.requests.every((request) => request.method === "POST")).toBe(
      true
    );
    expect(JSON.parse(setup.requests[0]?.body ?? "{}")).toMatchObject({
      type: "EXACT_INPUT",
      tokenInChainId: 8453,
      tokenOutChainId: 8453,
      swapper: WALLET,
      recipient: WALLET,
      amount: "1000000",
      slippageTolerance: 0.5,
      protocols: ["V2", "V3", "V4"],
      hooksOptions: "V4_NO_HOOKS",
      permitAmount: "EXACT",
      generatePermitAsTransaction: false,
    });
    expect(setup.requests[0]?.headers.get("x-universal-router-version")).toBe(
      "2.0"
    );
    expect(setup.requests[0]?.headers.get("x-api-key")).toBe(
      "test-only-api-secret"
    );
    expect(JSON.stringify(result)).not.toContain("test-only-api-secret");
    expect(JSON.stringify(result)).not.toContain('"data"');
  });

  it("rejects unsupported inputs and unavailable configuration before a provider call", async () => {
    const setup = fixture([]);
    expect(() =>
      preflightSwapQuote({ ...input, tokenOut: input.tokenIn })
    ).toThrow("must differ");
    expect(() => preflightSwapQuote({ ...input, amount: "0" })).toThrow(
      "invalid"
    );
    expect(() => preflightSwapQuote({ ...input, tokenIn: ZERO })).toThrow(
      "ERC-20 tokens only"
    );
    expect(() => preflightSwapQuote({ ...input, tokenOut: ZERO })).toThrow(
      "ERC-20 tokens only"
    );
    expect(() =>
      preflightSwapQuote({ ...input, amount: (2n ** 160n).toString() })
    ).toThrow("Permit2 allowance range");
    await rejectsQuote(
      setup.provider.quote({ ...input, network: "eip155:1" }),
      { code: "unsupported_network" }
    );
    await rejectsQuote(
      liveUniswap({ ...setup.options, apiKey: Redacted.make("") }).quote(input),
      { code: "unavailable" }
    );
    expect(setup.requests).toHaveLength(0);
    expect(
      supportsUniswapChain({ network: "eip155:4663", routerVersion: "2.0" })
    ).toBe(false);
    expect(
      supportsUniswapChain({ network: "eip155:4663", routerVersion: "2.1.1" })
    ).toBe(true);
  });

  it("rejects changed economic inputs and recipients before fetching approvals", async () => {
    const changes = [
      { chainId: 1 },
      { swapper: FEE_RECIPIENT },
      { slippage: 5 },
      { input: { amount: "2000000", token: TOKEN_IN } },
      { input: { amount: "1000000", token: TOKEN_OUT } },
      { output: { ...QUOTE.output, recipient: FEE_RECIPIENT } },
      { output: { ...QUOTE.output, token: TOKEN_IN } },
    ];
    await Promise.all(
      changes.map(async (change) => {
        const setup = fixture([
          Response.json(quoteFixture({ quote: { ...QUOTE, ...change } })),
        ]);
        await rejectsQuote(setup.provider.quote(input), {
          code: "invalid_response",
        });
        expect(setup.requests).toHaveLength(1);
      })
    );
  });

  it("rejects orders and chained routes without creating execution requests", async () => {
    await Promise.all(
      ["DUTCH_V3", "CHAINED", "WRAP", "NEW_ROUTING"].map(async (routing) => {
        const setup = fixture([Response.json(quoteFixture({ routing }))]);
        await rejectsQuote(setup.provider.quote(input), {
          code: "unsupported_routing",
        });
        expect(setup.requests).toHaveLength(1);
      })
    );
  });

  it("accepts a V4 pool ID and refuses nonzero hooks or broken paths", async () => {
    const pool = {
      ...POOL_DATA,
      type: "v4-pool",
      address: `0x${"a".repeat(64)}`,
      hooks: ZERO,
      tickSpacing: "60",
    };
    const setup = fixture([
      Response.json(quoteFixture({ quote: { ...QUOTE, route: [[pool]] } })),
      Response.json(noApproval()),
    ]);
    const result = await setup.provider.quote(input);
    expect(result.route[0]?.[0]).toMatchObject({
      protocol: "v4",
      pool: pool.address,
      hook: ZERO,
      tickSpacing: 60,
    });
    await Promise.all(
      [
        { ...pool, hooks: SPENDER },
        { ...pool, tokenIn: { ...pool.tokenIn, chainId: 1 } },
        { ...pool, tokenIn: { ...pool.tokenIn, address: TOKEN_OUT } },
      ].map(async (changed) => {
        const failed = fixture([
          Response.json(
            quoteFixture({ quote: { ...QUOTE, route: [[changed]] } })
          ),
        ]);
        await rejectsQuote(failed.provider.quote(input), {
          code: "invalid_response",
        });
      })
    );
  });

  it("preserves unknown minimum output and simulation evidence", async () => {
    const setup = fixture([
      Response.json(
        quoteFixture({
          quote: {
            ...QUOTE,
            output: { amount: "2000000", token: TOKEN_OUT, recipient: WALLET },
            txFailureReasons: undefined,
          },
        })
      ),
      Response.json(noApproval()),
    ]);
    const result = await setup.provider.quote(input);
    expect(result.output.minimumAmount).toBeNull();
    expect(result.simulation.status).toBe("unknown");
  });

  it("reports wallet proceeds separately from integrator fee outputs", async () => {
    const setup = fixture([
      Response.json(
        quoteFixture({
          quote: {
            ...QUOTE,
            aggregatedOutputs: [
              {
                token: TOKEN_OUT,
                recipient: WALLET,
                amount: "1995000",
                minAmount: "1985025",
              },
              {
                token: TOKEN_OUT,
                recipient: FEE_RECIPIENT,
                amount: "5000",
                minAmount: "4975",
                fee: "INTEGRATOR",
              },
            ],
          },
        })
      ),
      Response.json(noApproval()),
    ]);
    const result = await setup.provider.quote(input);
    expect(result.output.expectedAmount).toBe("1995000");
    expect(result.output.minimumAmount).toBe("1985025");
    expect(result.feeOutputs).toEqual([
      {
        token: TOKEN_OUT,
        recipient: FEE_RECIPIENT,
        amount: "5000",
        minimumAmount: "4975",
      },
    ]);
  });

  it("summarizes reset and unlimited allowance requirements without returning calldata", async () => {
    const amount = 2n ** 256n - 1n;
    const setup = fixture([
      Response.json(quoteFixture()),
      Response.json({
        requestId: "approval-fixture",
        cancel: approval(0n),
        approval: approval(amount),
        gasFee: "250000",
        cancelGasFee: "210000",
      }),
    ]);
    const result = await setup.provider.quote(input);
    expect(result.approval.status).toBe("reset_required");
    expect(result.approval.transactions).toEqual([
      {
        kind: "reset",
        token: TOKEN_IN,
        spender: SPENDER,
        amount: "0",
        exceedsRequestedAmount: false,
      },
      {
        kind: "approve",
        token: TOKEN_IN,
        spender: SPENDER,
        amount: String(amount),
        exceedsRequestedAmount: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("095ea7b3");
  });

  it("refuses approval transactions with changed sender, chain, value or selector", async () => {
    await Promise.all(
      [
        { from: FEE_RECIPIENT },
        { chainId: 1 },
        { value: "1" },
        { data: "0xa9059cbb" },
      ].map(async (change) => {
        const setup = fixture([
          Response.json(quoteFixture()),
          Response.json({
            ...noApproval(),
            approval: { ...approval(1_000_000n), ...change },
          }),
        ]);
        await rejectsQuote(setup.provider.quote(input), {
          code: "invalid_response",
        });
        expect(setup.requests).toHaveLength(2);
      })
    );
  });

  it("summarizes the exact unsigned permit and rejects stale or expanded permits", async () => {
    const data = permit();
    const setup = fixture([
      Response.json(quoteFixture({ permitData: data })),
      Response.json(noApproval()),
    ]);
    const result = await setup.provider.quote(input);
    expect(result.permit).toMatchObject({
      kind: "PermitSingle",
      amount: "1000000",
      spender: SPENDER,
      verifyingContract: PERMIT2,
    });
    expect(JSON.stringify(result)).not.toContain('"types"');
    const stale = {
      ...data,
      values: { ...data.values, sigDeadline: String(NOW / 1000 - 1) },
    };
    const expanded = {
      ...data,
      values: {
        ...data.values,
        details: { ...data.values.details, amount: "2000000" },
      },
    };
    await Promise.all(
      [stale, expanded].map(async (changed) => {
        const failed = fixture([
          Response.json(quoteFixture({ permitData: changed })),
        ]);
        await rejectsQuote(failed.provider.quote(input), {
          code: "invalid_response",
        });
        expect(failed.requests).toHaveLength(1);
      })
    );
  });

  it("skips unnecessary approval checks and preserves provider simulation failures", async () => {
    const setup = fixture([
      Response.json(
        quoteFixture({
          isTokenApprovalApplicable: false,
          quote: { ...QUOTE, txFailureReasons: ["SIMULATION_UNAVAILABLE"] },
        })
      ),
    ]);
    const result = await setup.provider.quote(input);
    expect(result.approval.status).toBe("not_applicable");
    expect(result.simulation.status).toBe("unavailable");
    expect(setup.requests).toHaveLength(1);
  });

  it("rejects oversized route arrays rather than returning partial evidence", async () => {
    const setup = fixture([
      Response.json(
        quoteFixture({
          quote: {
            ...QUOTE,
            route: Array.from({ length: 9 }, () => [POOL_DATA]),
          },
        })
      ),
    ]);
    await rejectsQuote(setup.provider.quote(input), {
      code: "invalid_response",
    });
  });

  it("cancels oversized bodies and prevents credential-bearing redirects", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(128 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const setup = fixture([new Response(body)]);
    await rejectsQuote(setup.provider.quote(input), {
      code: "invalid_response",
    });
    expect(cancelled).toBe(true);
    const redirect = fixture([
      new Response(null, {
        status: 307,
        headers: { location: "https://trade-api.gateway.uniswap.org/other" },
      }),
    ]);
    await rejectsQuote(redirect.provider.quote(input), {
      code: "invalid_response",
    });
    expect(redirect.requests).toHaveLength(1);
  });

  it("reports bounded provider errors and never repeats requests", async () => {
    await Promise.all(
      [401, 404, 429, 500].map(async (status) => {
        const setup = fixture([
          new Response("test-only-api-secret", { status }),
        ]);
        await rejectsQuote(setup.provider.quote(input), {
          code: status === 404 ? "no_route" : "provider_failure",
          message: `Uniswap returned HTTP ${status}; no automatic retry.`,
        });
        expect(setup.requests).toHaveLength(1);
      })
    );
    const invalid = fixture([new Response("test-only-api-secret")]);
    await rejectsQuote(invalid.provider.quote(input), {
      message:
        "Uniswap request failed or returned an invalid bounded response; no automatic retry.",
    });
  });

  it("marks fixture quotes as stubbed and never claims market or simulation evidence", async () => {
    const result = await stubUniswap().quote(input);
    expect(result.stubbed).toBe(true);
    expect(result.providerQuoteId).toBeNull();
    expect(result.simulation.status).toBe("unknown");
    expect(result.route).toEqual([]);
    expect(result.limitations[0]).toContain("Demo fixture");
  });
});
