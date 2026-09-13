import { describe, expect, it } from "bun:test";

import type { GraphClient, GraphSnapshot } from "@froggy/graph";
import { stubHcsWriter, stubOracleGate } from "@froggy/payments";
import { memoryStore } from "@froggy/wallet";
import { Schema } from "effect";

import { handleOracleRequest, handleSaleLookup } from "./oracle-route";

const URL_ = "https://froggy.test/oracle/snapshot";

const snapshot: GraphSnapshot = {
  capturedAt: 1_756_000_000_000,
  deployments: [],
  markets: [],
  query: "usdc",
  source: "test",
  stubbed: true,
};

const graphThat = (
  lendingMarkets: GraphClient["lendingMarkets"]
): GraphClient => ({ lendingMarkets });

const deps = (graph: GraphClient) => ({
  gate: stubOracleGate(),
  graph,
  hcs: stubHcsWriter(),
  now: () => 1_756_000_000_000,
  publicUrl: URL_,
  store: memoryStore(),
});

/** A syntactically valid payment header the stub gate accepts. */
const proof = (nonce: string): string =>
  Buffer.from(
    JSON.stringify({ accepted: {}, payload: { nonce }, x402Version: 2 })
  ).toString("base64");

const paidRequest = (header: string): Request =>
  new Request(`${URL_}?symbol=USDC`, { headers: { "x-payment": header } });

/** The bodies the route answers with, decoded rather than asserted. */
const Delivered = Schema.Struct({
  replayed: Schema.optional(Schema.Boolean),
  saleId: Schema.String,
  snapshotHash: Schema.String,
});
const Failed = Schema.Struct({
  error: Schema.String,
  saleId: Schema.String,
  settled: Schema.Boolean,
});
const SaleView = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  result: Schema.NullOr(Schema.Struct({ snapshotHash: Schema.String })),
  status: Schema.String,
});
const delivered = Schema.decodeUnknownSync(Delivered);
const failed = Schema.decodeUnknownSync(Failed);
const saleView = Schema.decodeUnknownSync(SaleView);

describe("handleOracleRequest", () => {
  it("answers 402 with the challenge when nothing was paid", async () => {
    const response = await handleOracleRequest(
      deps(graphThat(async () => await Promise.resolve(snapshot))),
      new Request(URL_)
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).not.toBeNull();
  });

  it("writes the sale before the work, and answers the same proof from the book without settling twice", async () => {
    let fetched = 0;
    const d = deps(
      graphThat(async () => {
        fetched += 1;
        await Promise.resolve();
        return snapshot;
      })
    );
    const first = await handleOracleRequest(d, paidRequest(proof("one")));
    expect(first.status).toBe(200);
    const body = delivered(await first.json());
    expect(body.saleId).toMatch(/^sal_/u);
    expect(body.replayed).toBeUndefined();

    const again = await handleOracleRequest(d, paidRequest(proof("one")));
    expect(again.status).toBe(200);
    const replayed = delivered(await again.json());
    expect(replayed.saleId).toBe(body.saleId);
    expect(replayed.replayed).toBe(true);
    // One fetch for two arrivals of one proof: the second was answered from
    // the book, and the facilitator was not asked again.
    expect(fetched).toBe(1);
    expect(again.headers.get("x-payment-response")).toBe(
      first.headers.get("x-payment-response")
    );
  });

  it("keeps a failed answer as a failed sale with the settlement on it, answered 502", async () => {
    const d = deps(
      graphThat(async () => {
        await Promise.resolve();
        throw new Error("the gateway is down");
      })
    );
    const response = await handleOracleRequest(d, paidRequest(proof("two")));
    expect(response.status).toBe(502);
    const body = failed(await response.json());
    expect(body.settled).toBe(true);
    expect(body.error).toBe("the gateway is down");
    // The buyer's receipt still gets the settlement: the money did move.
    expect(response.headers.get("x-payment-response")).not.toBeNull();

    const looked = await handleSaleLookup(d, body.saleId);
    expect(looked.status).toBe(200);
    const sale = saleView(await looked.json());
    expect(sale.status).toBe("failed");
    expect(sale.error).toBe("the gateway is down");

    // Presenting the same proof again is not a second chance at the fetch.
    const again = await handleOracleRequest(d, paidRequest(proof("two")));
    expect(again.status).toBe(502);
  });

  it("hands a delivered result back by sale id, and nothing for a made-up id", async () => {
    const d = deps(graphThat(async () => await Promise.resolve(snapshot)));
    const response = await handleOracleRequest(d, paidRequest(proof("three")));
    const { saleId } = delivered(await response.json());
    const looked = await handleSaleLookup(d, saleId);
    const sale = saleView(await looked.json());
    expect(sale.status).toBe("delivered");
    expect(sale.result?.snapshotHash).toBeString();
    const missing = await handleSaleLookup(d, "sal_nope");
    expect(missing.status).toBe(404);
    const malformed = await handleSaleLookup(d, "not-an-id");
    expect(malformed.status).toBe(404);
  });
});
