import { expect, test } from "bun:test";

import { TradeInput } from "@froggy/domain";
import { Redacted, Schema } from "effect";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  numberToHex,
  parseAbi,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import type { Address, Hex } from "viem";

import { EnsoRoute, ensoRoute } from "./enso";
import { ensoExecution } from "./enso-execution";
import { ENSO_ROUTER, validateEnsoRoute } from "./enso-transactions";
import { tradeEvmClient } from "./evm-chain";

const OWNER = "0x1111111111111111111111111111111111111111";
const ASSET = "0x2222222222222222222222222222222222222222";
const VAULT = "0x3333333333333333333333333333333333333333";
const SHORTCUTS = "0x4444444444444444444444444444444444444444";
const STRANGER = "0x5555555555555555555555555555555555555555";
const ZERO = numberToHex(0, { size: 32 });
const ABI = parseAbi([
  "function safeRouteSingle((uint8 tokenType, bytes data) tokenIn, (uint8 tokenType, bytes data) tokenOut, address receiver, bytes data) returns (bytes)",
  "function executeShortcut(bytes32 accountId, bytes32 requestId, bytes32[] commands, bytes[] state) returns (bytes[])",
]);
const tokenData = (token: Address, amount: bigint): Hex =>
  encodeAbiParameters(parseAbiParameters("address,uint256"), [token, amount]);
const word = (value: Address): Hex =>
  encodeAbiParameters(parseAbiParameters("address"), [value]);
const command = (
  signature: string,
  target: Address,
  args: readonly number[],
  output = 255,
  flags = 1
): Hex =>
  concatHex([
    toFunctionSelector(signature),
    numberToHex(flags, { size: 1 }),
    ...Array.from({ length: 6 }, (_, i) =>
      numberToHex(args[i] ?? 255, { size: 1 })
    ),
    numberToHex(output, { size: 1 }),
    target,
  ]);
const fixture = (action: "deposit" | "withdraw", viaShortcut = false) => {
  const input = Schema.decodeUnknownSync(TradeInput)({
    network: "eip155:1",
    venue: "enso",
    action,
    wallet: OWNER,
    tokenIn: action === "deposit" ? ASSET : VAULT,
    tokenOut: action === "deposit" ? VAULT : ASSET,
    amount: "100",
    position: VAULT,
    slippageBps: 100,
    maxNativeFee: "10000000",
  });
  const state: Hex[] = [
    word(VAULT),
    numberToHex(100, { size: 32 }),
    word(viaShortcut ? SHORTCUTS : OWNER),
    word(SHORTCUTS),
    ZERO,
    word(OWNER),
  ];
  const commands =
    action === "deposit"
      ? [
          command("approve(address,uint256)", ASSET, [0, 1]),
          command("deposit(uint256,address)", VAULT, [1, 2], 4),
        ]
      : [command("redeem(uint256,address,address)", VAULT, [1, 2, 3], 4)];
  if (viaShortcut) {
    commands.push(
      command(
        "transfer(address,uint256)",
        action === "deposit" ? VAULT : ASSET,
        [5, 4]
      )
    );
  }
  const build = (
    calls = commands,
    words = state,
    receiver: Address = OWNER
  ): EnsoRoute =>
    Schema.decodeUnknownSync(EnsoRoute)({
      gas: "200000",
      amountOut: "200",
      minAmountOut: "198",
      createdAt: 100,
      feeAmount: ["0"],
      ensoFeeAmount: [],
      preTransactions: [],
      route: [
        {
          tokenIn: [input.tokenIn],
          tokenOut: [input.tokenOut],
          protocol: "erc4626",
          action,
          primary: VAULT,
        },
      ],
      tx: {
        from: OWNER,
        to: ENSO_ROUTER,
        value: "0",
        data: encodeFunctionData({
          abi: ABI,
          functionName: "safeRouteSingle",
          args: [
            {
              tokenType: 1,
              data: tokenData(action === "deposit" ? ASSET : VAULT, 100n),
            },
            {
              tokenType: 1,
              data: tokenData(action === "deposit" ? VAULT : ASSET, 198n),
            },
            receiver,
            encodeFunctionData({
              abi: ABI,
              functionName: "executeShortcut",
              args: [ZERO, ZERO, calls, words],
            }),
          ],
        }),
      },
    });
  return { input, build, commands, state };
};

test.each(["deposit", "withdraw"] as const)(
  "validates direct and routed ERC-4626 %s proceeds",
  (action) => {
    for (const via of [false, true]) {
      const { input, build } = fixture(action, via);
      expect(() => {
        validateEnsoRoute(input, build(), SHORTCUTS);
      }).not.toThrow();
    }
  }
);

test("rejects altered recipient, input, vault, nested amount and appended transfer", () => {
  const { input, build, state, commands } = fixture("deposit");
  expect(() => {
    validateEnsoRoute(input, build(undefined, undefined, STRANGER), SHORTCUTS);
  }).toThrow();
  expect(() => {
    validateEnsoRoute({ ...input, amount: "101" }, build(), SHORTCUTS);
  }).toThrow();
  expect(() => {
    validateEnsoRoute({ ...input, position: STRANGER }, build(), SHORTCUTS);
  }).toThrow();
  const wrongAmount = [...state];
  wrongAmount[1] = numberToHex(101, { size: 32 });
  expect(() => {
    validateEnsoRoute(input, build(commands, wrongAmount), SHORTCUTS);
  }).toThrow();
  const wrongOwner = [...state];
  wrongOwner[2] = word(STRANGER);
  expect(() => {
    validateEnsoRoute(input, build(commands, wrongOwner), SHORTCUTS);
  }).toThrow();
  expect(() => {
    validateEnsoRoute(
      input,
      build([...commands, command("transfer(address,uint256)", ASSET, [2, 1])]),
      SHORTCUTS
    );
  }).toThrow();
});

test("rejects value/delegate calls, forged output state, cross-wallet redemption and trailing bytes", () => {
  const { input, build, state, commands } = fixture("withdraw", true);
  const transfer = commands.at(-1);
  if (transfer === undefined) {
    throw new Error("Missing transfer");
  }
  for (const flags of [0, 3, 33, 65, 129]) {
    expect(() => {
      validateEnsoRoute(
        input,
        build([
          command(
            "redeem(uint256,address,address)",
            VAULT,
            [1, 2, 3],
            4,
            flags
          ),
          transfer,
        ]),
        SHORTCUTS
      );
    }).toThrow();
  }
  expect(() => {
    validateEnsoRoute(
      input,
      build([
        command("redeem(uint256,address,address)", VAULT, [1, 2, 3]),
        transfer,
      ]),
      SHORTCUTS
    );
  }).toThrow();
  const wrong = [...state];
  wrong[3] = word(OWNER);
  expect(() => {
    validateEnsoRoute(input, build(commands, wrong), SHORTCUTS);
  }).toThrow();
  const route = build();
  expect(() => {
    validateEnsoRoute(
      input,
      { ...route, tx: { ...route.tx, data: `${route.tx.data}00` } },
      SHORTCUTS
    );
  }).toThrow();
});

test("Enso requests bind owner, receiver, refund, chain and slippage; provider errors stay redacted", async () => {
  const { input, build } = fixture("deposit");
  let fail = false;
  const urls: URL[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (url: URL | RequestInfo) => {
      const target = new URL(url instanceof Request ? url.url : url);
      urls.push(target);
      if (fail) {
        return new Response("secret-provider-detail", { status: 401 });
      }
      return await Promise.resolve(
        Response.json(
          target.pathname.endsWith("/tokens")
            ? {
                data: [
                  {
                    address: VAULT,
                    chainId: 1,
                    type: "defi",
                    protocolSlug: "erc4626",
                    primaryAddress: VAULT,
                    underlyingTokens: [{ address: ASSET, chainId: 1 }],
                  },
                ],
              }
            : build()
        )
      );
    },
    { preconnect: (): void => undefined }
  );
  const options = {
    apiKey: Redacted.make("private-key"),
    outbound: {
      fetch: fetchImpl,
      lookup: async () => await Promise.resolve(["93.184.216.34"]),
    },
  };
  const result = await ensoRoute(options, input);
  expect(result.minAmountOut).toBe("198");
  const query = urls.at(-1)?.searchParams;
  expect(query?.get("fromAddress")).toBe(OWNER);
  expect(query?.get("receiver")).toBe(OWNER);
  expect(query?.get("refundReceiver")).toBe(OWNER);
  expect(query?.get("slippage")).toBe("100");
  expect(query?.get("routingStrategy")).toBe("router");
  fail = true;
  expect(ensoRoute(options, input)).rejects.toThrow("Enso returned HTTP 401");
});

const decodedBody = (init: RequestInit | undefined): Schema.Json =>
  Schema.decodeUnknownSync(Schema.Json)(
    JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body))
  );

test("Enso preparation binds approvals, nonces, fee bounds and independent post-state balances", async () => {
  const { input, build } = fixture("deposit");
  const Rpc = Schema.Struct({
    id: Schema.Int,
    method: Schema.String,
    params: Schema.Array(Schema.Json),
  });
  const Simulation = Schema.Struct({
    call_args: Schema.Array(
      Schema.Struct({
        from: Schema.String,
        to: Schema.String,
        data: Schema.String,
      })
    ),
    block_number_or_hash: Schema.Struct({ blockNumber: Schema.Int }),
  });
  let badSimulation = false;
  const fetchImpl: typeof fetch = Object.assign(
    async (url: URL | RequestInfo, init?: RequestInit) => {
      const target = new URL(url instanceof Request ? url.url : url);
      if (target.hostname === "api.enso.build") {
        return await Promise.resolve(
          Response.json(
            target.pathname.endsWith("/tokens")
              ? {
                  data: [
                    {
                      address: VAULT,
                      chainId: 1,
                      type: "defi",
                      protocolSlug: "erc4626",
                      primaryAddress: VAULT,
                      underlyingTokens: [{ address: ASSET, chainId: 1 }],
                    },
                  ],
                }
              : build()
          )
        );
      }
      if (target.hostname === "api.tenderly.co") {
        const body = Schema.decodeUnknownSync(Simulation)(decodedBody(init));
        const proceeds = badSimulation ? 197 : 200;
        expect(body.block_number_or_hash.blockNumber).toBe(100);
        return await Promise.resolve(
          Response.json({
            simulations: body.call_args.map((call) => {
              const balance = call.to.toLowerCase() === ASSET ? 900 : proceeds;
              return {
                status: true,
                gas_used: "50000",
                block_number: "100",
                trace: [
                  {
                    from: call.from,
                    to: call.to,
                    input: call.data,
                    trace_address: [],
                    output: call.data.startsWith("0x70a08231")
                      ? numberToHex(balance, { size: 32 })
                      : "0x",
                  },
                ],
              };
            }),
          })
        );
      }
      const rpc = Schema.decodeUnknownSync(Rpc)(decodedBody(init));
      let result: Schema.Json;
      if (rpc.method === "eth_call") {
        const call = Schema.decodeUnknownSync(
          Schema.Struct({ to: Schema.String, data: Schema.String })
        )(rpc.params[0]);
        const selector = call.data.slice(0, 10);
        if (selector === toFunctionSelector("shortcuts()")) {
          result = word(SHORTCUTS);
        } else if (selector === toFunctionSelector("executor()")) {
          result = word(ENSO_ROUTER);
        } else if (selector === toFunctionSelector("asset()")) {
          result = word(ASSET);
        } else if (
          selector === toFunctionSelector("allowance(address,address)")
        ) {
          result = ZERO;
        } else if (selector === toFunctionSelector("balanceOf(address)")) {
          result = numberToHex(call.to.toLowerCase() === ASSET ? 1000 : 0, {
            size: 32,
          });
        } else {
          throw new Error(`Unexpected contract call ${selector}`);
        }
      } else {
        const results = {
          eth_chainId: "0x1",
          eth_blockNumber: "0x64",
          eth_getCode: "0x6000",
          eth_getTransactionCount: "0x9",
          eth_maxPriorityFeePerGas: "0x1",
          eth_getBlockByNumber: {
            number: "0x64",
            baseFeePerGas: "0x1",
            hash: ZERO,
            parentHash: ZERO,
            nonce: "0x0000000000000000",
            transactions: [],
            timestamp: "0x1",
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            difficulty: "0x0",
            miner: OWNER,
            extraData: "0x",
            logsBloom: "0x",
            receiptsRoot: ZERO,
            sha3Uncles: ZERO,
            size: "0x1",
            stateRoot: ZERO,
            transactionsRoot: ZERO,
            totalDifficulty: "0x0",
            uncles: [],
          },
        };
        const found = Object.entries(results).find(
          ([method]) => method === rpc.method
        )?.[1];
        if (found === undefined) {
          throw new Error(`Unexpected RPC ${rpc.method}`);
        }
        result = found;
      }
      return await Promise.resolve(
        Response.json({ jsonrpc: "2.0", id: rpc.id, result })
      );
    },
    { preconnect: (): void => undefined }
  );
  const outbound = {
    fetch: fetchImpl,
    lookup: async () => await Promise.resolve(["93.184.216.34"]),
  };
  const backend = ensoExecution({
    client: tradeEvmClient({
      endpoint: Redacted.make("https://rpc.example.test"),
      outbound,
    }),
    enso: { apiKey: Redacted.make("test-key"), outbound },
    tenderly: {
      accessKey: Redacted.make("test-key"),
      account: "test",
      project: "test",
      outbound,
      now: () => 10,
    },
    confirmations: 2,
    now: () => 10,
  });
  const prepared = await backend.prepare(input);
  expect(prepared.steps.map((step) => step.kind)).toEqual([
    "approve",
    "deposit",
  ]);
  expect(
    prepared.steps.map((step) =>
      step.payload.kind === "evm" ? step.payload.nonce : null
    )
  ).toEqual([9, 10]);
  expect(
    prepared.steps.every(
      (step) => step.simulation.status === "passed" && !step.simulation.stubbed
    )
  ).toBe(true);
  expect(prepared.minimumOutput).toBe("198");
  expect(backend.prepare({ ...input, maxNativeFee: "1" })).rejects.toThrow(
    "native fee budget"
  );
  badSimulation = true;
  expect(backend.prepare(input)).rejects.toThrow("token changes do not match");
});
