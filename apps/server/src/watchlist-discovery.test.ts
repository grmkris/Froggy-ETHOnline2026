import { expect, test } from "bun:test";

import { EvmAddress, userId, WatchlistItemId } from "@froggy/domain";
import type { UserId, WatchlistItem } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";
import { Schema } from "effect";
import { encodeAbiParameters } from "viem";

import { stubTradingRpc } from "./trading/rpc";
import type { TradingRpc } from "./trading/rpc";
import {
  discoverSavedItems,
  ensureDiscovered,
  handleWatchlistDiscover,
  handleWatchlistTrack,
  presenceFromLookup,
} from "./watchlist-discovery";
import type { DiscoveryDeps } from "./watchlist-discovery";
import { saveWatchlistItem } from "./watchlist-routes";

// Synthetic fixtures, never deployment identities.
const WALLET = Schema.decodeUnknownSync(EvmAddress)(
  "0x1111111111111111111111111111111111111111"
);
const TOKEN = Schema.decodeUnknownSync(EvmAddress)(
  "0x2222222222222222222222222222222222222222"
);
const SELECTOR = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
} as const;
const NOW = 1_789_300_000_000;

interface Chain {
  /** Addresses (lowercase) holding code. */
  readonly code: readonly string[];
  readonly balance: Readonly<Record<string, bigint>>;
  readonly token?: { readonly name: string; readonly symbol: string };
}

const Call = Schema.Struct({
  method: Schema.String,
  params: Schema.Array(Schema.Json),
});
const AddressParam = Schema.Tuple([Schema.String, Schema.String]);
const EthCall = Schema.Tuple([
  Schema.Struct({ to: Schema.String, data: Schema.String }),
  Schema.String,
]);

/** A trading RPC that answers from the fixture and can be held at a gate. */
const rpcFixture = (
  chains: Readonly<Record<string, Chain>>,
  gate?: Promise<null>
) => {
  const stub = stubTradingRpc();
  let reads = 0;
  const rpc: TradingRpc = {
    read: async (input) => {
      reads += 1;
      await gate;
      const base = await stub.read(input);
      const chain = chains[input.network];
      if (chain === undefined) {
        throw new Error("RPC down");
      }
      const call = Schema.decodeUnknownSync(Call)(input.call);
      const answer = (): string => {
        if (call.method === "eth_blockNumber") {
          return "0x10";
        }
        if (call.method === "eth_getCode") {
          const [address] = Schema.decodeUnknownSync(AddressParam)(call.params);
          return chain.code.includes(address.toLowerCase())
            ? "0x6080604052"
            : "0x";
        }
        if (call.method === "eth_getBalance") {
          const [address] = Schema.decodeUnknownSync(AddressParam)(call.params);
          return `0x${(chain.balance[address.toLowerCase()] ?? 0n).toString(16)}`;
        }
        const [{ to, data }] = Schema.decodeUnknownSync(EthCall)(call.params);
        const selector = data.slice(0, 10);
        if (selector === SELECTOR.balanceOf) {
          return encodeAbiParameters([{ type: "uint256" }], [0n]);
        }
        if (to.toLowerCase() === TOKEN && chain.token) {
          if (selector === SELECTOR.name) {
            return encodeAbiParameters(
              [{ type: "string" }],
              [chain.token.name]
            );
          }
          if (selector === SELECTOR.symbol) {
            return encodeAbiParameters(
              [{ type: "string" }],
              [chain.token.symbol]
            );
          }
          if (selector === SELECTOR.decimals) {
            return encodeAbiParameters([{ type: "uint8" }], [18]);
          }
          if (selector === SELECTOR.totalSupply) {
            return encodeAbiParameters([{ type: "uint256" }], [10n ** 24n]);
          }
        }
        throw new Error("execution reverted");
      };
      return { ...base, stubbed: false, result: answer() };
    },
  };
  return { rpc, reads: () => reads };
};

const CHAINS = {
  "eip155:8453": {
    code: [TOKEN],
    balance: { [WALLET]: 22_100_000_000_000_000n },
    token: { name: "Demo Coin", symbol: "DEMO" },
  },
  "eip155:1": { code: [TOKEN], balance: {} },
  "eip155:4663": { code: [], balance: {} },
  "eip155:11155111": { code: [], balance: { [WALLET]: 5n } },
} satisfies Readonly<Record<string, Chain>>;

const setup = (
  chains: Readonly<Record<string, Chain>> = CHAINS,
  gate?: Promise<null>
) => {
  const store = memoryStore();
  const fixture = rpcFixture(chains, gate);
  const changed: UserId[] = [];
  const deps: DiscoveryDeps = {
    store,
    rpc: fixture.rpc,
    networks: ["eip155:8453", "eip155:1", "eip155:4663", "eip155:11155111"],
    now: () => NOW,
    changed: (owner) => {
      changed.push(owner);
    },
  };
  return { store, deps, reads: fixture.reads, changed };
};

const track = async (
  deps: DiscoveryDeps,
  owner: UserId,
  address: string
): Promise<Response> =>
  await handleWatchlistTrack(
    deps,
    new Request("https://froggy.test/api/watchlist/track", {
      method: "POST",
      body: JSON.stringify({ v: 1, address }),
    }),
    owner
  );

const Captured = Schema.Struct({
  v: Schema.Literal(1),
  item: Schema.Struct({
    id: WatchlistItemId,
    title: Schema.String,
    revision: Schema.Int,
    source: Schema.Struct({ _tag: Schema.String }),
  }),
  data: Schema.Struct({
    discovery: Schema.NullOr(
      Schema.Struct({ status: Schema.String, note: Schema.String })
    ),
    presence: Schema.Array(
      Schema.Struct({ network: Schema.String, status: Schema.String })
    ),
  }),
});

const saveWallet = async (
  store: ReturnType<typeof memoryStore>,
  owner: UserId,
  address: string,
  title?: string
): Promise<WatchlistItem> =>
  await saveWatchlistItem(store, owner, {
    title: title ?? `${address.slice(0, 6)}…${address.slice(-4)}`,
    notes: "",
    source: {
      _tag: "wallet",
      network: "eip155:8453",
      address: Schema.decodeUnknownSync(EvmAddress)(address),
    },
  });

test("track saves instantly with a short-address title and a queued discovery, then fills in", async () => {
  const gate = Promise.withResolvers<null>();
  const owner = userId("did:privy:track-instant");
  const { store, deps, changed } = setup(CHAINS, gate.promise);
  const response = await track(deps, owner, TOKEN);
  expect(response.status).toBe(201);
  const body = Schema.decodeUnknownSync(Captured)(await response.json());
  expect(body.item.title).toBe("0x2222…2222");
  expect(body.item.source._tag).toBe("wallet");
  expect(body.data.discovery?.status).toBe("running");
  expect(body.data.presence).toEqual([]);
  gate.resolve(null);
  await Bun.sleep(20);
  const item = await store.watchlist.transact(owner, (book) =>
    book.get(body.item.id)
  );
  const data = await store.watchlistData.transact(owner, (book) =>
    book.get(body.item.id)
  );
  expect(item?.title).toBe("Demo Coin");
  expect(item?.source._tag).toBe("token");
  expect(item?.revision).toBe(2);
  expect(data?.discovery?.status).toBe("done");
  expect(data?.discovery?.note).toBe("Found on Base and Ethereum.");
  expect(data?.presence?.map((row) => [row.network, row.status])).toEqual([
    ["eip155:8453", "observed"],
    ["eip155:1", "observed"],
    ["eip155:4663", "absent"],
    ["eip155:11155111", "absent"],
  ]);
  expect(data?.latest?.source).toBe("Chain lookup");
  expect(data?.latest?.facts).toEqual([
    { label: "Base", value: "Token Demo Coin (DEMO) · 18 decimals" },
    { label: "Ethereum", value: "Contract without ERC-20 metadata" },
  ]);
  expect(changed).toEqual([owner]);
  // Tracking the same address again is idempotent: same item, nothing re-read.
  const repeat = await track(deps, owner, TOKEN.toLowerCase());
  const again = Schema.decodeUnknownSync(Captured)(await repeat.json());
  expect(again.item.id).toBe(body.item.id);
  expect(again.item.title).toBe("Demo Coin");
  expect(again.data.discovery?.status).toBe("done");
});

test("a wallet with balance is observed only where it holds something; a human title survives", async () => {
  const owner = userId("did:privy:wallet-title");
  const { store, deps } = setup();
  const item = await saveWallet(store, owner, WALLET, "My whale");
  await discoverSavedItems(deps, owner);
  const saved = await store.watchlist.transact(owner, (book) =>
    book.get(item.id)
  );
  const data = await store.watchlistData.transact(owner, (book) =>
    book.get(item.id)
  );
  expect(saved?.title).toBe("My whale");
  expect(saved?.source._tag).toBe("wallet");
  expect(saved?.revision).toBe(1);
  expect(data?.discovery?.status).toBe("done");
  expect(data?.discovery?.note).toBe("Found on Base.");
  expect(data?.presence?.map((row) => row.status)).toEqual([
    "observed",
    "absent",
    "absent",
    "observed",
  ]);
  expect(data?.latest?.facts).toEqual([
    { label: "Base", value: "Address · 0.0221 ETH · 0 USDC" },
  ]);
});

test("an unavailable RPC yields an unavailable row, not a failed item; all down fails in words", async () => {
  const owner = userId("did:privy:unavailable");
  const { "eip155:1": _mainnet, ...rest } = CHAINS;
  const { store, deps } = setup(rest);
  const item = await saveWallet(store, owner, TOKEN);
  await discoverSavedItems(deps, owner);
  const data = await store.watchlistData.transact(owner, (book) =>
    book.get(item.id)
  );
  expect(data?.discovery?.status).toBe("done");
  expect(data?.discovery?.note).toBe(
    "Found on Base. Ethereum could not be checked."
  );
  expect(
    data?.presence?.find((row) => row.network === "eip155:1")?.status
  ).toBe("unavailable");

  const down = userId("did:privy:all-down");
  const dark = setup({});
  const saved = await saveWallet(dark.store, down, TOKEN);
  await discoverSavedItems(dark.deps, down);
  const darkData = await dark.store.watchlistData.transact(down, (book) =>
    book.get(saved.id)
  );
  expect(darkData?.discovery?.status).toBe("failed");
  expect(darkData?.discovery?.note).toBe(
    "Could not reach any chain. Check again later."
  );
  expect(darkData?.presence).toHaveLength(4);
});

test("an address seen nowhere stays saved with a not-seen note and no observation", async () => {
  const owner = userId("did:privy:nowhere");
  const { store, deps } = setup({
    "eip155:8453": { code: [], balance: {} },
    "eip155:1": { code: [], balance: {} },
    "eip155:4663": { code: [], balance: {} },
    "eip155:11155111": { code: [], balance: {} },
  });
  const item = await saveWallet(store, owner, WALLET);
  await discoverSavedItems(deps, owner);
  const data = await store.watchlistData.transact(owner, (book) =>
    book.get(item.id)
  );
  expect(data?.discovery?.status).toBe("done");
  expect(data?.discovery?.note).toBe(
    "Not seen on any chain we checked: Base, Ethereum and Robinhood (and the Sepolia testnets)."
  );
  expect(data?.latest).toBeNull();
  expect(
    await store.watchlist.transact(owner, (book) => book.get(item.id)?.title)
  ).toBe("0x1111…1111");
});

test("only one discovery runs per owner, the queue drains in order, and done items are never re-run", async () => {
  const gate = Promise.withResolvers<null>();
  const owner = userId("did:privy:one-at-a-time");
  const { store, deps, reads } = setup(CHAINS, gate.promise);
  const first = await saveWallet(store, owner, WALLET);
  const second = await saveWallet(store, owner, TOKEN);
  const running = discoverSavedItems(deps, owner);
  await Bun.sleep(5);
  // A second caller finds the first check running and claims nothing.
  await discoverSavedItems(deps, owner);
  const during = await store.watchlistData.transact(owner, (book) =>
    [...book.values()].map((data) => data.discovery?.status)
  );
  expect(during.toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual([
    "queued",
    "running",
  ]);
  gate.resolve(null);
  await running;
  const after = await store.watchlistData.transact(owner, (book) => [
    book.get(first.id)?.discovery?.status,
    book.get(second.id)?.discovery?.status,
  ]);
  expect(after).toEqual(["done", "done"]);
  const before = reads();
  await discoverSavedItems(deps, owner);
  expect(reads()).toBe(before);
});

test("check again re-queues a finished item, refuses while running, and is rate limited", async () => {
  const owner = userId("did:privy:check-again");
  const { store, deps } = setup();
  const item = await saveWallet(store, owner, TOKEN);
  await discoverSavedItems(deps, owner);
  const never = Promise.withResolvers<null>();
  const held: TradingRpc = {
    read: async () => {
      await never.promise;
      throw new Error("unreachable");
    },
  };
  const discover = async (): Promise<Response> =>
    await handleWatchlistDiscover(
      { ...deps, rpc: held },
      new Request("https://froggy.test/api/watchlist/x/discover", {
        method: "POST",
        body: JSON.stringify({ v: 1 }),
      }),
      owner,
      item.id
    );
  const first = await discover();
  expect(first.status).toBe(200);
  const body = Schema.decodeUnknownSync(Captured)(await first.json());
  expect(body.data.discovery?.note).toBe("Checking again.");
  const second = await discover();
  expect(second.status).toBe(409);
  const missing = await handleWatchlistDiscover(
    deps,
    new Request("https://froggy.test/api/watchlist/x/discover", {
      method: "POST",
      body: JSON.stringify({ v: 1 }),
    }),
    owner,
    WatchlistItemId.generate()
  );
  expect(missing.status).toBe(404);

  const busy = userId("did:privy:rate-limited");
  const many = setup();
  const items = await Promise.all(
    Array.from(
      { length: 11 },
      async (_, index) =>
        await saveWallet(
          many.store,
          busy,
          `0x${(index + 3).toString(16).padStart(40, "0")}`
        )
    )
  );
  await discoverSavedItems(many.deps, busy);
  const statuses = await many.store.watchlistData.transact(busy, (book) =>
    items.map((saved) => book.get(saved.id)?.discovery?.status)
  );
  expect(statuses.filter((status) => status === "done")).toHaveLength(10);
  expect(statuses.filter((status) => status === "queued")).toHaveLength(1);
  const refused = await handleWatchlistDiscover(
    many.deps,
    new Request("https://froggy.test/api/watchlist/x/discover", {
      method: "POST",
      body: JSON.stringify({ v: 1 }),
    }),
    busy,
    items[0]?.id ?? WatchlistItemId.generate()
  );
  expect(refused.status).toBe(429);
});

test("a running discovery older than fifteen minutes is failed by the tick and the item can be checked again", async () => {
  const owner = userId("did:privy:stale");
  const { store, deps } = setup();
  const item = await saveWallet(store, owner, TOKEN);
  await store.watchlistData.transact(owner, (book) => {
    const data = book.get(item.id);
    book.set(item.id, {
      v: 1,
      itemId: item.id,
      latest: null,
      observations: [],
      snapshotTaskId: null,
      enrichment: null,
      ...data,
      presence: [],
      discovery: {
        key: `discover:${item.id}:first`,
        requestedAt: NOW - 20 * 60_000,
        startedAt: NOW - 16 * 60_000,
        status: "running",
        note: "Checking which chains this address is on.",
      },
    });
  });
  await discoverSavedItems(deps, owner);
  const data = await store.watchlistData.transact(owner, (book) =>
    book.get(item.id)
  );
  expect(data?.discovery?.status).toBe("failed");
  expect(data?.discovery?.note).toBe(
    "Checking was interrupted. Use Check again."
  );
});

test("ensureDiscovered answers from stored presence and reads the chain once when there is none", async () => {
  const owner = userId("did:privy:ensure");
  const { store, deps, reads } = setup();
  const item = await saveWallet(store, owner, TOKEN);
  const rows = await ensureDiscovered(deps, owner, item);
  expect(rows.map((row) => row.status)).toEqual([
    "observed",
    "observed",
    "absent",
    "absent",
  ]);
  const before = reads();
  expect(await ensureDiscovered(deps, owner, item)).toEqual(rows);
  expect(reads()).toBe(before);
});

test("presenceFromLookup marks an empty EOA absent and keeps the lookup's stub flag", () => {
  const rows = presenceFromLookup({
    v: 1,
    operation: "address_lookup",
    provider: "froggy",
    stubbed: true,
    observedAt: NOW,
    address: WALLET,
    mine: [],
    networks: [
      {
        network: "eip155:8453",
        status: "observed",
        block: "0x10",
        kind: "eoa",
        nativeBalance: "0",
        usdc: null,
        token: null,
        note: "No contract code observed.",
      },
      {
        network: "eip155:1",
        status: "unavailable",
        block: null,
        kind: null,
        nativeBalance: null,
        usdc: null,
        token: null,
        note: "RPC returned no block number.",
      },
    ],
    limitations: [],
  });
  expect(rows.map((row) => row.status)).toEqual(["absent", "unavailable"]);
  expect(rows[0]?.note).toContain("No code, no ETH and no USDC");
  expect(rows.every((row) => row.stubbed)).toBe(true);
});
