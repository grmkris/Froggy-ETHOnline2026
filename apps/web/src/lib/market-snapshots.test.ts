import { expect, test } from "bun:test";

import { TaskId, WatchlistItem, WatchlistItemId } from "@froggy/domain";
import { ServiceTicket } from "@froggy/protocol";
import { Schema } from "effect";

import { snapshotForItem } from "./market-snapshots";

test("a saved token uses only its own chain and address, keeps missing prices unknown, and retains simulation provenance", () => {
  const address = "0x1111111111111111111111111111111111111111";
  const item = Schema.decodeUnknownSync(WatchlistItem)({
    v: 1,
    id: WatchlistItemId.generate(),
    title: "Token",
    notes: "",
    source: { _tag: "token", address, network: "eip155:8453" },
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  });
  const ticket = (
    network: string,
    observedAt: number,
    priceUsd: number | null,
    stubbed: boolean
  ): ServiceTicket =>
    Schema.decodeUnknownSync(ServiceTicket)({
      v: 1,
      id: TaskId.generate(),
      runId: null,
      saleId: null,
      upstreamTransactionId: null,
      status: "done",
      service: "token_inspect",
      prompt: "Inspect",
      priceUsdMicros: 0,
      error: null,
      text: "",
      sources: [],
      stubbed,
      artifact: null,
      data: {
        v: 1,
        provider: "birdeye",
        network,
        stubbed: false,
        observedAt,
        freshness: "provider_snapshot",
        limitations: [],
        operation: "token_inspect",
        security: { status: "unavailable", facts: [] },
        token: {
          address,
          name: "Token",
          symbol: "T",
          decimals: 18,
          priceUsd,
          liquidityUsd: null,
          volume24hUsd: null,
          priceChange24hPercent: null,
          lastTradeAt: null,
          listedAt: null,
          listingSource: null,
        },
      },
    });
  const foreign = ticket("eip155:1", 30, 500, false);
  expect(snapshotForItem(item, [foreign])).toBeNull();
  const latest = ticket("eip155:8453", 20, null, true);
  expect(
    snapshotForItem(item, [
      foreign,
      latest,
      ticket("eip155:8453", 10, 4, false),
    ])
  ).toMatchObject({ observedAt: 20, stubbed: true, token: { priceUsd: null } });
});
