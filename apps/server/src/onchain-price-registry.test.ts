import { expect, test } from "bun:test";

import { EvmAddress } from "@froggy/domain";
import { Schema } from "effect";

import {
  officialPriceOracleCatalog,
  PRICE_NETWORKS,
} from "./onchain-price-registry";

// Synthetic catalog fixtures, never production deployment defaults.
const TOKEN = "0x1111111111111111111111111111111111111111";
const PROXY = "0x2222222222222222222222222222222222222222";
const SEQUENCER = "0x3333333333333333333333333333333333333333";
const feed = {
  name: "Robinhood NVDA / USD",
  path: "robinhood-nvda-usd",
  proxyAddress: PROXY,
  heartbeat: 86_400,
  decimals: 8,
  docs: {
    assetClass: "Equity",
    baseAsset: "NVDA",
    quoteAsset: "USD",
    productTypeCode: "primaryTokenizedPrice",
  },
};
const fixture = (chainId: number, hidden = false) => {
  const calls: string[] = [];
  const request: typeof fetch = Object.assign(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);
      if (url === "https://api.robinhood.com/rhj/assets") {
        return await Promise.resolve(
          Response.json({
            assets: [
              {
                tokenSymbol: "NVDA",
                deployments: [{ chainId, contractAddress: TOKEN }],
              },
            ],
          })
        );
      }
      return await Promise.resolve(
        Response.json([{ ...feed, docs: { ...feed.docs, hidden } }])
      );
    },
    { preconnect: (): void => {} }
  );
  return {
    calls,
    catalog: officialPriceOracleCatalog({ now: () => 1000, fetch: request }),
  };
};
test("stock feed discovery joins exact issuer token deployment and caches public metadata", async () => {
  const { catalog, calls } = fixture(4663);
  const { find: lookup } = catalog;
  const entries = await lookup(
    "eip155:4663",
    Schema.decodeUnknownSync(EvmAddress)(TOKEN)
  );
  expect(entries).toHaveLength(1);
  expect(entries[0]?.stockToken).toBe(
    Schema.decodeUnknownSync(EvmAddress)(TOKEN)
  );
  expect(entries[0]?.sequencer).toBeNull();
  await lookup("eip155:4663", Schema.decodeUnknownSync(EvmAddress)(TOKEN));
  expect(calls).toHaveLength(2);
});
test("a symbol on another chain or a hidden test feed cannot become an official source", async () => {
  const wrong = fixture(8453);
  const { find: wrongLookup } = wrong.catalog;
  expect(
    await wrongLookup(
      "eip155:4663",
      Schema.decodeUnknownSync(EvmAddress)(TOKEN)
    )
  ).toHaveLength(0);
  const hidden = fixture(4663, true);
  const { find: hiddenLookup } = hidden.catalog;
  expect(
    await hiddenLookup(
      "eip155:4663",
      Schema.decodeUnknownSync(EvmAddress)(TOKEN)
    )
  ).toHaveLength(0);
});
test("Base crypto feed selection uses canonical token addresses and the published sequencer", async () => {
  const request: typeof fetch = Object.assign(
    async () =>
      await Promise.resolve(
        Response.json([
          {
            name: "ETH / USD",
            path: "eth-usd",
            proxyAddress: PROXY,
            heartbeat: 1200,
            decimals: 8,
            docs: { assetClass: "Crypto", baseAsset: "ETH", quoteAsset: "USD" },
          },
          {
            name: "L2 Sequencer Uptime Status Feed",
            path: "sequencer",
            proxyAddress: SEQUENCER,
            decimals: 0,
            docs: { attributeType: "l2_sequencer_uptime_status" },
          },
        ])
      ),
    { preconnect: (): void => {} }
  );
  const { find: lookup } = officialPriceOracleCatalog({
    now: () => 1,
    fetch: request,
  });
  const native = await lookup("eip155:8453", "native");
  const wrapped = await lookup(
    "eip155:8453",
    Schema.decodeUnknownSync(EvmAddress)(
      PRICE_NETWORKS["eip155:8453"].wrappedNative
    )
  );
  expect(native[0]?.proxy).toBe(wrapped[0]?.proxy);
  expect(native[0]?.sequencer).toBe(
    Schema.decodeUnknownSync(EvmAddress)(SEQUENCER)
  );
  expect(
    await lookup("eip155:8453", Schema.decodeUnknownSync(EvmAddress)(TOKEN))
  ).toHaveLength(0);
});
