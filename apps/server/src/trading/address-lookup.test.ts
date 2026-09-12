import { describe, expect, it } from "bun:test";

import { EvmAddress } from "@froggy/domain";
import { Redacted, Schema } from "effect";
import { encodeAbiParameters, toHex } from "viem";

import {
  lookupAddress,
  lookupNetworks,
  LOOKUP_MAX_NETWORKS,
} from "./address-lookup";
import { liveTradingRpc, stubTradingRpc } from "./rpc";

// Synthetic fixtures, never deployment identities or configured live endpoints.
const WALLET = Schema.decodeUnknownSync(EvmAddress)(
  "0x1111111111111111111111111111111111111111"
);
const TOKEN = Schema.decodeUnknownSync(EvmAddress)(
  "0x2222222222222222222222222222222222222222"
);
const BASE = "eip155:8453";
const MAINNET = "eip155:1";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const SELECTOR = {
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
} as const;

const Call = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.Array(Schema.Json),
});
const EthCall = Schema.Tuple([
  Schema.Struct({ to: Schema.String, data: Schema.String }),
  Schema.String,
]);

interface Chain {
  readonly chainId: number;
  readonly code: Readonly<Record<string, string>>;
  readonly balance: Readonly<Record<string, string>>;
  readonly usdc?: Readonly<Record<string, bigint>>;
  readonly token?: {
    readonly symbol: string;
    readonly decimals: number;
    readonly totalSupply: bigint;
  };
}

type Answer = { readonly result: Schema.Json } | { readonly revert: true };
const REVERT: Answer = { revert: true };
const ok = (result: Schema.Json): Answer => ({ result });

const respond = (chain: Chain, call: typeof Call.Type): Answer => {
  switch (call.method) {
    case "eth_chainId": {
      return ok(toHex(chain.chainId));
    }
    case "eth_blockNumber": {
      return ok("0x10");
    }
    case "eth_getCode": {
      const [address] = call.params;
      return ok(chain.code[String(address).toLowerCase()] ?? "0x");
    }
    case "eth_getBalance": {
      const [address] = call.params;
      return ok(chain.balance[String(address).toLowerCase()] ?? "0x0");
    }
    case "eth_call": {
      const [{ to, data }] = Schema.decodeUnknownSync(EthCall)(call.params);
      const selector = data.slice(0, 10);
      if (to.toLowerCase() === BASE_USDC && selector === SELECTOR.balanceOf) {
        const owner = `0x${data.slice(34, 74)}`;
        const units = chain.usdc?.[owner] ?? 0n;
        return ok(encodeAbiParameters([{ type: "uint256" }], [units]));
      }
      if (to.toLowerCase() === TOKEN && chain.token !== undefined) {
        if (selector === SELECTOR.symbol) {
          return ok(
            encodeAbiParameters([{ type: "string" }], [chain.token.symbol])
          );
        }
        if (selector === SELECTOR.decimals) {
          return ok(
            encodeAbiParameters([{ type: "uint8" }], [chain.token.decimals])
          );
        }
        if (selector === SELECTOR.totalSupply) {
          return ok(
            encodeAbiParameters(
              [{ type: "uint256" }],
              [chain.token.totalSupply]
            )
          );
        }
      }
      // A revert on any other call: the provider answers with a JSON-RPC error.
      return REVERT;
    }
    default: {
      return REVERT;
    }
  }
};

const fixture = (chains: Readonly<Record<string, Chain>>) => {
  const calls: {
    readonly endpoint: string;
    readonly call: typeof Call.Type;
  }[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const endpoint = String(input);
      const call = Schema.decodeUnknownSync(Call)(
        JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body))
      );
      calls.push({ endpoint, call });
      const network = endpoint.slice(endpoint.lastIndexOf("/") + 1);
      const chain = chains[network];
      await Promise.resolve();
      if (chain === undefined) {
        return new Response("down", { status: 503 });
      }
      const answer = respond(chain, call);
      if ("revert" in answer) {
        return Response.json({
          jsonrpc: "2.0",
          id: call.id,
          error: { code: 3, message: "execution reverted" },
        });
      }
      return Response.json({
        jsonrpc: "2.0",
        id: call.id,
        result: answer.result,
      });
    },
    { preconnect: (): void => undefined }
  );
  const endpoints = Object.fromEntries(
    Object.keys(chains).map((network) => [
      network,
      Redacted.make(`https://rpc.example.test/${network}`),
    ])
  );
  return {
    calls,
    rpc: liveTradingRpc({
      endpoints,
      now: () => 1234,
      outbound: {
        fetch: fetchImpl,
        lookup: async () => await Promise.resolve(["93.184.216.34"]),
      },
    }),
  };
};

const BASE_CHAIN: Chain = {
  chainId: 8453,
  code: { [TOKEN]: "0x6080604052" },
  balance: { [WALLET]: "0x0" },
  usdc: { [WALLET]: 12_500_000n },
  token: { symbol: "FROG", decimals: 18, totalSupply: 10n ** 27n },
};

const { token: _token, ...BARE_CONTRACT_CHAIN } = BASE_CHAIN;

describe("lookupAddress", () => {
  it("tells a wallet from a token and reads its USDC without spending", async () => {
    const { rpc, calls } = fixture({ [BASE]: BASE_CHAIN });
    const result = await lookupAddress(
      { rpc, networks: [BASE], now: () => 1234 },
      { address: WALLET },
      []
    );
    expect(result.v).toBe(1);
    expect(result.stubbed).toBe(false);
    expect(result.mine).toEqual([]);
    expect(result.networks).toHaveLength(1);
    const [row] = result.networks;
    expect(row).toMatchObject({
      network: BASE,
      status: "observed",
      block: "0x10",
      kind: "eoa",
      nativeBalance: "0",
      usdc: { decimals: 6, units: "12500000" },
      token: null,
    });
    expect(row?.note).toContain("wallet");
    // Every read on the row is pinned to the block the row reports.
    for (const { call } of calls) {
      if (call.method === "eth_getCode" || call.method === "eth_getBalance") {
        expect(call.params[1]).toBe("0x10");
      }
    }
  });

  it("reads ERC-20 metadata from a contract and treats reverts as nulls", async () => {
    const { rpc } = fixture({ [BASE]: BASE_CHAIN });
    const result = await lookupAddress(
      { rpc, networks: [BASE] },
      { address: TOKEN },
      []
    );
    expect(result.networks[0]).toMatchObject({
      kind: "contract",
      token: {
        symbol: "FROG",
        decimals: 18,
        totalSupply: (10n ** 27n).toString(),
      },
    });
    const bare = await lookupAddress(
      {
        rpc: fixture({ [BASE]: BARE_CONTRACT_CHAIN }).rpc,
        networks: [BASE],
      },
      { address: TOKEN },
      []
    );
    expect(bare.networks[0]).toMatchObject({
      kind: "contract",
      token: { symbol: null, decimals: null, totalSupply: null },
    });
    expect(bare.networks[0]?.note).toContain("not a plain token");
  });

  it("names the person's own wallets and keeps unavailable networks as rows", async () => {
    const { rpc } = fixture({ [BASE]: BASE_CHAIN });
    const result = await lookupAddress(
      { rpc, networks: [BASE, MAINNET] },
      { address: WALLET },
      [
        {
          label: "agent_signer",
          address: WALLET.toUpperCase().replace("0X", "0x"),
        },
        { label: "owner_ethereum", address: TOKEN },
      ]
    );
    expect(result.mine).toEqual(["agent_signer"]);
    expect(result.networks.map((row) => row.status)).toEqual([
      "observed",
      "unavailable",
    ]);
    expect(result.networks[1]?.note).toContain("not configured");
  });

  it("reads one named network only and never more than the fan-out cap", async () => {
    const { rpc, calls } = fixture({
      [BASE]: BASE_CHAIN,
      [MAINNET]: { ...BASE_CHAIN, chainId: 1 },
    });
    const single = await lookupAddress(
      { rpc, networks: [BASE, MAINNET] },
      { address: WALLET, network: MAINNET },
      []
    );
    expect(single.networks.map((row) => row.network)).toEqual([MAINNET]);
    expect(calls.every((entry) => entry.endpoint.endsWith(MAINNET))).toBe(true);
    const many = Array.from(
      { length: LOOKUP_MAX_NETWORKS + 2 },
      (_, index) => `eip155:${index + 100}` as const
    );
    const capped = await lookupAddress(
      { rpc, networks: many },
      { address: WALLET },
      []
    );
    expect(capped.networks).toHaveLength(LOOKUP_MAX_NETWORKS);
  });

  it("is loud when the RPC is a stub", async () => {
    const result = await lookupAddress(
      { rpc: stubTradingRpc(), networks: lookupNetworks([], false) },
      { address: WALLET },
      []
    );
    expect(result.stubbed).toBe(true);
    expect(result.networks.length).toBeGreaterThan(0);
    expect(result.limitations.some((line) => line.startsWith("DEMO"))).toBe(
      true
    );
  });

  it("lists configured EVM networks when live and rejects malformed keys", () => {
    expect(
      lookupNetworks([BASE, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"], true)
    ).toEqual([BASE]);
    expect(() => lookupNetworks(["eip155:abc"], true)).toThrow();
  });
});
