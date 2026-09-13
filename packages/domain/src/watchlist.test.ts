import { expect, test } from "bun:test";

import { Schema } from "effect";

import { EvmAddress } from "./address";
import {
  WatchlistItem,
  WatchlistSource,
  shortEvmAddress,
  watchlistSourceKey,
} from "./watchlist";

const address = Schema.decodeUnknownSync(EvmAddress)(
  "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2"
);

test("decodes a saved item written with a network and drops it", () => {
  const item = Schema.decodeUnknownSync(WatchlistItem)({
    v: 1,
    id: "wli_01h455vb4pex5vsknk084sn02q",
    title: "Whale",
    notes: "",
    source: { _tag: "wallet", network: "eip155:8453", address },
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    archived: false,
  });
  expect(item.source).toEqual({ _tag: "wallet", address });
  expect("network" in item.source).toBe(false);
});

test("the source key is address-only, case-insensitive, and shared by wallet and token", () => {
  const wallet = Schema.decodeUnknownSync(WatchlistSource)({
    _tag: "wallet",
    address,
  });
  const token = Schema.decodeUnknownSync(WatchlistSource)({
    _tag: "token",
    address: address.toLowerCase(),
  });
  expect(watchlistSourceKey(wallet)).toBe(watchlistSourceKey(token));
  expect(watchlistSourceKey(wallet)).toBe(`address:${address.toLowerCase()}`);
  expect(
    watchlistSourceKey({ _tag: "link", url: "https://example.com/a" })
  ).toBe("link:https://example.com/a");
  expect(shortEvmAddress(address)).toBe("0x8Cc2…08C2");
});
