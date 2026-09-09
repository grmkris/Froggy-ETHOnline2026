import { expect, test } from "bun:test";

import { Redacted, Schema } from "effect";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  numberToHex,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";

import { readEnsoPositions } from "./positions";

const OWNER = "0x1111111111111111111111111111111111111111";
const VAULT = "0x3333333333333333333333333333333333333333";
const ASSET = "0x2222222222222222222222222222222222222222";
const Rpc = Schema.Struct({
  method: Schema.String,
  params: Schema.optional(Schema.Array(Schema.Json)),
});
const ContractCall = Schema.Struct({ to: Schema.String, data: Schema.String });

test("positions use independent balances and maxRedeem rather than the provider's balance or APR", async () => {
  let liquid = true;
  let queriedWallet = "";
  const fetchImpl: typeof fetch = Object.assign(
    async (url: URL | RequestInfo) => {
      const target = new URL(url instanceof Request ? url.url : url);
      queriedWallet = target.searchParams.get("eoaAddress") ?? "";
      expect(target.searchParams.get("useEoa")).toBe("true");
      return await Promise.resolve(
        Response.json([
          {
            token: VAULT,
            chainId: 1,
            decimals: 6,
            symbol: "VAULT",
            amount: "999999999",
            price: "12345",
          },
        ])
      );
    },
    { preconnect: (): void => undefined }
  );
  const client = createPublicClient({
    transport: custom({
      request: async (request) => {
        const rpc = Schema.decodeUnknownSync(Rpc)(request);
        await Promise.resolve();
        if (rpc.method === "eth_chainId") {
          return "0x1";
        }
        if (rpc.method === "eth_blockNumber") {
          return "0x64";
        }
        if (rpc.method === "eth_getBalance") {
          return "0x3e8";
        }
        if (rpc.method !== "eth_call") {
          throw new Error("Unexpected RPC");
        }
        const call = Schema.decodeUnknownSync(ContractCall)(rpc.params?.[0]);
        expect(rpc.params?.[1]).toBe("0x64");
        const selector = call.data.slice(0, 10);
        if (selector === toFunctionSelector("balanceOf(address)")) {
          return numberToHex(100, { size: 32 });
        }
        if (selector === toFunctionSelector("asset()")) {
          return encodeAbiParameters(parseAbiParameters("address"), [ASSET]);
        }
        if (selector === toFunctionSelector("maxRedeem(address)")) {
          return numberToHex(liquid ? 50 : 0, { size: 32 });
        }
        if (selector === toFunctionSelector("previewRedeem(uint256)")) {
          expect(BigInt(`0x${call.data.slice(10)}`)).toBe(liquid ? 50n : 0n);
          return numberToHex(liquid ? 75 : 0, { size: 32 });
        }
        throw new Error("Unexpected call");
      },
    }),
  });
  const input = {
    client,
    enso: {
      apiKey: Redacted.make("test-key"),
      outbound: {
        fetch: fetchImpl,
        lookup: async () => await Promise.resolve(["93.184.216.34"]),
      },
    },
    wallet: OWNER,
    trades: [],
    now: () => 1000,
  };
  const result = await readEnsoPositions(input);
  expect(queriedWallet).toBe(OWNER);
  expect(result.stubbed).toBe(false);
  expect(result.positions[1]).toMatchObject({
    units: "100",
    kind: "vault",
    withdrawableShares: "50",
    withdrawableAssets: "75",
    realizedYield: null,
  });
  expect(JSON.stringify(result)).not.toContain("999999999");
  liquid = false;
  const illiquid = await readEnsoPositions(input);
  expect(illiquid.positions[1]).toMatchObject({
    withdrawableShares: "0",
    withdrawableAssets: "0",
  });
});
